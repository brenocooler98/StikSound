import path from "node:path";
import {
  EXPORT_PROFILES,
  LIMITS,
  ProjectController,
  StikSoundError,
  computeSquareCrop,
  createProject,
  sanitizeExportName,
  type ExportArtifact,
  type ExportProfileId,
  type ProjectWorkspaceState,
  type SoundProvider
} from "@stiksound/core";
import { sniffAudioContainer, sniffVideoContainer } from "@stiksound/media-web";
import { DirectAudioUrlProvider, MyInstantsProvider } from "@stiksound/providers";
import { copyFileToClipboard, type ClipboardCopier } from "./clipboard";
import {
  NodeMediaEngine,
  detectCapabilities,
  encodeWebpAtQuality,
  ensureWebpEncoder,
  pickH264Encoder,
  pickOpusEncoder,
  runBinary,
  type CliMediaEngine
} from "./engine";
import { CliInputError } from "./errors";
import {
  defaultOutputDir,
  isExistingDirectory,
  publishFile,
  readInputFile,
  resolveUserPath,
  writeExactFile,
  type InputFile,
  type ResolvePathOptions
} from "./files";
import { createGuardedFetch } from "./guarded-fetch";
import { findLoudestWindow, leadingSilenceMs, peakLevel } from "./loudness";

export const ENABLED_PROFILES = ["video-mp4", "video-webm-alpha", "sound-bundle", "standard-webp"] as const;
export type EnabledProfile = (typeof ENABLED_PROFILES)[number];

export const PROFILE_NOTES: Record<EnabledProfile, string> = {
  "video-mp4":
    "This MP4 is a video, not a WhatsApp sticker: sending or pasting it in a chat sends a video and does not add it to the sticker tray. Only some Android WhatsApp Beta accounts can pick it from the gallery under Create sticker; WhatsApp decides duration and audio.",
  "video-webm-alpha":
    "This WebM keeps transparency and is a video, not a WhatsApp sticker. WhatsApp does not add it to the sticker tray.",
  "sound-bundle":
    "The ZIP holds sticker.webp and sound.ogg as two separate files plus manifest.json. WhatsApp treats the WebP as a normal static sticker without sound.",
  "standard-webp": "A static 512 px WebP sticker without audio."
};

export interface PreviewImage {
  bytes: Uint8Array;
  mimeType: "image/webp";
}

export interface ServiceContext {
  engine: CliMediaEngine;
  controller: ProjectController;
  outputDir: string;
  copyToClipboard: ClipboardCopier;
  pathOptions: ResolvePathOptions;
}

export interface ServiceOptions {
  engine?: CliMediaEngine;
  providers?: SoundProvider[];
  outputDir?: string;
  copyToClipboard?: ClipboardCopier;
  allowRelativePaths?: boolean;
  cwd?: string;
}

export function createServiceContext(options: ServiceOptions = {}): ServiceContext {
  const engine = options.engine ?? new NodeMediaEngine();
  const guardedFetch = createGuardedFetch();
  const providers = options.providers ?? [new MyInstantsProvider(guardedFetch), new DirectAudioUrlProvider(guardedFetch)];
  return {
    engine,
    controller: new ProjectController(engine, providers),
    outputDir: options.outputDir ?? defaultOutputDir(),
    copyToClipboard: options.copyToClipboard ?? copyFileToClipboard,
    pathOptions: {
      allowRelative: options.allowRelativePaths ?? true,
      cwd: options.cwd
    }
  };
}

export function isEnabledProfile(profile: string): profile is EnabledProfile {
  return (ENABLED_PROFILES as readonly string[]).includes(profile);
}

export function durationPresetMs(maxDurationSeconds: 5 | 10 | undefined): number {
  return (maxDurationSeconds ?? LIMITS.DEFAULT_VIDEO_MAX_AUDIO_MS / 1000) * 1000;
}

function isZipSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function renderPreview(context: ServiceContext, state: ProjectWorkspaceState): Promise<PreviewImage | null> {
  const sticker = state.manifest.stickers[0];
  const bytes = sticker ? state.assets.get(sticker.file) : undefined;
  if (!sticker || !bytes) return null;
  try {
    const frame = await context.engine.renderSticker(bytes, sticker.edit);
    return { bytes: await encodeWebpAtQuality(frame, 75), mimeType: "image/webp" };
  } catch {
    return null;
  }
}

export interface ProbeMediaOptions {
  path: string;
  cropX?: number;
  cropY?: number;
  includePreview?: boolean;
}

export interface ServiceResult<T = Record<string, unknown>> {
  payload: T;
  preview?: PreviewImage | null;
}

async function describeAudio(context: ServiceContext, file: InputFile): Promise<ServiceResult> {
  if (file.bytes.byteLength > LIMITS.MAX_AUDIO_BYTES) {
    throw new StikSoundError("file-too-large", "Audio exceeds 25 MB limit.");
  }
  const format = sniffAudioContainer(file.bytes).format;
  const decoded = await context.engine.decodeAudio(file.bytes);
  const suggested: Record<string, { start_ms: number; end_ms: number }> = {};
  for (const preset of LIMITS.AUDIO_DURATION_PRESETS) {
    suggested[`${preset / 1000}s`] = findLoudestWindow(decoded.samples, decoded.sampleRate, preset);
  }
  const durationMs = decoded.sourceDurationMs;
  return {
    payload: {
      kind: "audio",
      path: file.path,
      format,
      duration_ms: durationMs,
      ...(decoded.truncated
        ? { analyzed_duration_ms: decoded.durationMs, analysis_truncated: true }
        : {}),
      sample_rate: decoded.sourceSampleRate,
      channels: decoded.sourceChannels,
      within_import_limit: durationMs <= LIMITS.MAX_AUDIO_DURATION_MS,
      peak_level: Number(peakLevel(decoded.samples).toFixed(3)),
      leading_silence_ms: leadingSilenceMs(decoded.samples, decoded.sampleRate),
      loudest_window: suggested
    }
  };
}

export async function probeMedia(context: ServiceContext, options: ProbeMediaOptions): Promise<ServiceResult> {
  const { controller, engine, pathOptions } = context;
  const file = await readInputFile(options.path, LIMITS.MAX_VIDEO_BYTES, "path", pathOptions);

  // Inspect saved .stiksound.zip projects directly when given a ZIP archive.
  if (isZipSignature(file.bytes)) {
    const state = await controller.openProject(file.bytes);
    const sticker = state.manifest.stickers[0];
    const audio = state.manifest.audios[0];
    const trim = state.manifest.associations[0];
    const preview = options.includePreview ? await renderPreview(context, state) : null;
    return {
      payload: {
        kind: "project",
        path: file.path,
        name: state.manifest.project.name,
        profile: state.manifest.export.profile,
        ...(sticker
          ? {
              sticker: {
                source_name: sticker.source_name,
                format: sticker.format,
                width: sticker.width,
                height: sticker.height,
                has_alpha: sticker.has_alpha,
                animated: sticker.animated,
                crop_x: sticker.edit.crop_x ?? 0.5,
                crop_y: sticker.edit.crop_y ?? 0.5,
                matte_color: sticker.edit.matte_color ?? LIMITS.DEFAULT_MATTE_COLOR
              }
            }
          : {}),
        ...(audio
          ? {
              audio: {
                source: audio.source.type,
                source_name: audio.source_name,
                format: audio.format,
                duration_ms: audio.duration_ms,
                ...(trim ? { trim: { start_ms: trim.start_ms, end_ms: trim.end_ms }, volume: trim.volume } : {})
              }
            }
          : {})
      },
      preview
    };
  }

  let state: ProjectWorkspaceState;
  try {
    state = await controller.importSticker(createProject(), file.bytes, file.name);
  } catch (err) {
    // M4A shares the MP4 container signature, so an audio-only MP4 lands here as unsupported-video.
    const notVisual =
      err instanceof StikSoundError && (err.code === "unsupported-image" || err.code === "unsupported-video");
    if (!notVisual) throw err;
    return describeAudio(context, file);
  }

  if (options.cropX !== undefined || options.cropY !== undefined) {
    state = controller.updateStickerEdit(state, {
      ...(options.cropX !== undefined ? { crop_x: options.cropX } : {}),
      ...(options.cropY !== undefined ? { crop_y: options.cropY } : {})
    });
  }

  const sticker = state.manifest.stickers[0]!;
  const isClip = sniffVideoContainer(file.bytes) !== null;
  const side = computeSquareCrop(sticker.width, sticker.height).outputSize;
  const hasSound = isClip ? await engine.hasAudioTrack(file.bytes) : undefined;
  const preview = options.includePreview ? await renderPreview(context, state) : null;

  return {
    payload: {
      kind: isClip ? "video" : "image",
      path: file.path,
      format: sticker.format,
      width: sticker.width,
      height: sticker.height,
      has_alpha: sticker.has_alpha,
      animated: sticker.animated,
      ...(sticker.duration_ms ? { duration_ms: sticker.duration_ms } : {}),
      ...(isClip ? { has_sound: hasSound } : {}),
      output_px: `${side}x${side}`,
      needs_crop: sticker.width !== sticker.height,
      static_webp_supported: !sticker.animated
    },
    preview
  };
}

interface PublishOptions {
  outputPath?: string;
  outputDir?: string;
  force?: boolean;
  copyToClipboard?: boolean;
}

async function writeArtifact(
  context: ServiceContext,
  artifact: ExportArtifact,
  options: PublishOptions
): Promise<string> {
  const { pathOptions } = context;
  if (options.outputPath) {
    const raw = options.outputPath.trim();
    const resolved = resolveUserPath(raw, "output", pathOptions);
    const trailingSep = raw.endsWith("/") || raw.endsWith("\\");
    if (trailingSep || (await isExistingDirectory(resolved))) {
      return publishFile(resolved, artifact.fileName, artifact.bytes);
    }
    return writeExactFile(resolved, artifact.bytes, Boolean(options.force));
  }
  const dir = options.outputDir ? resolveUserPath(options.outputDir, "output_dir", pathOptions) : context.outputDir;
  return publishFile(dir, artifact.fileName, artifact.bytes);
}

async function buildExportResult(
  context: ServiceContext,
  state: ProjectWorkspaceState,
  artifact: ExportArtifact,
  options: PublishOptions & { includePreview?: boolean }
): Promise<{ payload: Record<string, unknown>; outputPath: string; preview: PreviewImage | null }> {
  const outputPath = await writeArtifact(context, artifact, options);

  const sticker = state.manifest.stickers[0]!;
  const audio = state.manifest.audios[0];
  const trim = state.manifest.associations[0];
  const usesAudio = artifact.profile !== "standard-webp";
  const side = computeSquareCrop(sticker.width, sticker.height).outputSize;

  const payload: Record<string, unknown> = {
    output_path: outputPath,
    profile: artifact.profile,
    mime_type: artifact.mimeType,
    size_bytes: artifact.bytes.byteLength,
    ...(artifact.durationMs !== undefined ? { duration_ms: artifact.durationMs } : {}),
    output_px: `${side}x${side}`,
    sticker: {
      source_name: sticker.source_name,
      format: sticker.format,
      width: sticker.width,
      height: sticker.height,
      animated: sticker.animated,
      has_alpha: sticker.has_alpha,
      crop_x: sticker.edit.crop_x ?? 0.5,
      crop_y: sticker.edit.crop_y ?? 0.5
    },
    ...(usesAudio && audio && trim
      ? {
          audio: {
            source: audio.source.type,
            source_name: audio.source_name,
            ...(audio.source.page_url ? { page_url: audio.source.page_url } : {}),
            duration_ms: audio.duration_ms,
            trim: { start_ms: trim.start_ms, end_ms: trim.end_ms },
            volume: trim.volume
          }
        }
      : {})
  };

  if (options.copyToClipboard) {
    payload.copied_to_clipboard = await context.copyToClipboard(outputPath);
  }
  payload.note = PROFILE_NOTES[artifact.profile as EnabledProfile];

  const preview = options.includePreview ? await renderPreview(context, state) : null;
  return { payload, outputPath, preview };
}

export interface CreateSoundStickerOptions {
  imagePath: string;
  audioPath?: string;
  audioUrl?: string;
  myinstantsUrl?: string;
  startMs?: number;
  endMs?: number;
  trim?: "start" | "loudest";
  maxDurationS?: 5 | 10;
  volume?: number;
  cropX?: number;
  cropY?: number;
  backgroundColor?: string;
  profile?: EnabledProfile;
  name?: string;
  outputPath?: string;
  outputDir?: string;
  force?: boolean;
  saveProject?: boolean | string;
  copyToClipboard?: boolean;
  includePreview?: boolean;
}

function validateMatteColor(color: string): string {
  const trimmed = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    throw new CliInputError(`background_color must be a #RRGGBB hex value (got "${color}").`);
  }
  return trimmed.toUpperCase();
}

export async function createSoundSticker(
  context: ServiceContext,
  options: CreateSoundStickerOptions
): Promise<ServiceResult> {
  const { controller, engine, pathOptions } = context;
  const profile = options.profile ?? "video-mp4";
  if (!isEnabledProfile(profile)) {
    throw new CliInputError(`Unsupported profile "${profile}". Choose one of: ${ENABLED_PROFILES.join(", ")}.`);
  }
  const maxMs = durationPresetMs(options.maxDurationS);

  if (options.audioUrl && options.myinstantsUrl && options.audioUrl !== options.myinstantsUrl) {
    throw new CliInputError("Pass either audio_url or myinstants_url, not both.");
  }
  const audioUrl = options.audioUrl ?? options.myinstantsUrl;
  if (options.audioPath && audioUrl) {
    throw new CliInputError("Pass either audio_path or audio_url, not both.");
  }
  if (options.outputPath && options.outputDir) {
    throw new CliInputError("Pass either --output or --output-dir, not both.");
  }
  if (options.outputPath) resolveUserPath(options.outputPath, "output", pathOptions);
  if (options.outputDir) resolveUserPath(options.outputDir, "output_dir", pathOptions);
  const matteColor = options.backgroundColor !== undefined ? validateMatteColor(options.backgroundColor) : undefined;

  const image = await readInputFile(options.imagePath, LIMITS.MAX_VIDEO_BYTES, "image_path", pathOptions);
  const projectName = options.name?.trim() || path.parse(image.name).name;
  let state = createProject(projectName, profile);
  state = await controller.importSticker(state, image.bytes, image.name, maxMs);

  if (options.audioPath) {
    const audio = await readInputFile(options.audioPath, LIMITS.MAX_AUDIO_BYTES, "audio_path", pathOptions);
    state = await controller.importAudioFile(state, audio.bytes, audio.name, { type: "local" }, maxMs);
  } else if (audioUrl) {
    state = await controller.importAudioUrl(state, audioUrl, maxMs);
  }

  const audio = state.manifest.audios[0];
  if (EXPORT_PROFILES[profile].requiresAudio && !audio) {
    throw new CliInputError(`Profile ${profile} needs a sound: pass --audio / audio_path or --url / audio_url.`);
  }

  if (options.cropX !== undefined || options.cropY !== undefined || matteColor !== undefined) {
    state = controller.updateStickerEdit(state, {
      ...(options.cropX !== undefined ? { crop_x: options.cropX } : {}),
      ...(options.cropY !== undefined ? { crop_y: options.cropY } : {}),
      ...(matteColor !== undefined ? { matte_color: matteColor } : {})
    });
  }

  if (audio) {
    let window: { start_ms: number; end_ms: number } | null = null;
    if (options.startMs !== undefined || options.endMs !== undefined) {
      const start = options.startMs ?? 0;
      window = { start_ms: start, end_ms: options.endMs ?? Math.min(audio.duration_ms, start + maxMs) };
    } else if (options.trim === "loudest" && audio.duration_ms > maxMs) {
      const decoded = await engine.decodeAudio(state.assets.get(audio.file)!);
      window = findLoudestWindow(decoded.samples, decoded.sampleRate, maxMs);
    }
    if (window || options.volume !== undefined) {
      state = controller.updateAudioEdit(
        state,
        { ...(window ?? {}), ...(options.volume !== undefined ? { volume: options.volume } : {}) },
        maxMs
      );
    }
  }

  const artifact = await controller.exportProject(state, profile, maxMs);
  const published = await buildExportResult(context, state, artifact, {
    outputPath: options.outputPath,
    outputDir: options.outputDir,
    force: options.force,
    copyToClipboard: options.copyToClipboard,
    includePreview: options.includePreview
  });

  if (options.saveProject) {
    const projectBytes = await controller.saveProject(state);
    const defaultProjName = `${sanitizeExportName(state.manifest.project.name)}.stiksound.zip`;
    if (typeof options.saveProject === "string") {
      const resolved = resolveUserPath(options.saveProject, "save_project", pathOptions);
      if (options.saveProject.endsWith("/") || options.saveProject.endsWith("\\") || (await isExistingDirectory(resolved))) {
        published.payload.project_path = await publishFile(resolved, defaultProjName, projectBytes);
      } else {
        published.payload.project_path = await writeExactFile(resolved, projectBytes, Boolean(options.force));
      }
    } else {
      published.payload.project_path = await publishFile(
        path.dirname(published.outputPath),
        defaultProjName,
        projectBytes
      );
    }
  }

  return { payload: published.payload, preview: published.preview };
}

export interface ExportSavedProjectOptions {
  projectPath: string;
  profile?: EnabledProfile;
  maxDurationS?: 5 | 10;
  startMs?: number;
  endMs?: number;
  volume?: number;
  cropX?: number;
  cropY?: number;
  backgroundColor?: string;
  name?: string;
  outputPath?: string;
  outputDir?: string;
  force?: boolean;
  copyToClipboard?: boolean;
  includePreview?: boolean;
}

export async function exportSavedProject(
  context: ServiceContext,
  options: ExportSavedProjectOptions
): Promise<ServiceResult> {
  const { controller, pathOptions } = context;
  if (options.outputPath && options.outputDir) {
    throw new CliInputError("Pass either --output or --output-dir, not both.");
  }
  if (options.outputPath) resolveUserPath(options.outputPath, "output", pathOptions);
  if (options.outputDir) resolveUserPath(options.outputDir, "output_dir", pathOptions);
  const matteColor = options.backgroundColor !== undefined ? validateMatteColor(options.backgroundColor) : undefined;

  const file = await readInputFile(options.projectPath, LIMITS.MAX_PACKAGE_BYTES, "project_path", pathOptions);
  let state = await controller.openProject(file.bytes);

  const profile = options.profile ?? state.manifest.export.profile;
  if (!isEnabledProfile(profile)) {
    throw new CliInputError(
      `The project's profile ${profile} is disabled; pass one of: ${ENABLED_PROFILES.join(", ")}.`
    );
  }
  const maxMs = durationPresetMs(options.maxDurationS);

  if (options.name?.trim()) {
    state = controller.renameProject(state, options.name);
  }
  if (options.cropX !== undefined || options.cropY !== undefined || matteColor !== undefined) {
    state = controller.updateStickerEdit(state, {
      ...(options.cropX !== undefined ? { crop_x: options.cropX } : {}),
      ...(options.cropY !== undefined ? { crop_y: options.cropY } : {}),
      ...(matteColor !== undefined ? { matte_color: matteColor } : {})
    });
  }
  if (options.startMs !== undefined || options.endMs !== undefined || options.volume !== undefined) {
    state = controller.updateAudioEdit(
      state,
      {
        ...(options.startMs !== undefined ? { start_ms: options.startMs } : {}),
        ...(options.endMs !== undefined ? { end_ms: options.endMs } : {}),
        ...(options.volume !== undefined ? { volume: options.volume } : {})
      },
      maxMs
    );
  }

  const artifact = await controller.exportProject(state, profile as ExportProfileId, maxMs);
  const published = await buildExportResult(context, state, artifact, {
    outputPath: options.outputPath,
    outputDir: options.outputDir,
    force: options.force,
    copyToClipboard: options.copyToClipboard,
    includePreview: options.includePreview
  });
  return { payload: published.payload, preview: published.preview };
}

export interface DoctorReport {
  ok: boolean;
  platform: NodeJS.Platform;
  arch: string;
  node_version: string;
  ffmpeg: {
    binary: string;
    available: boolean;
    version: string | null;
    h264_encoder: string | null;
    aac_encoder: boolean;
    vp9_encoder: boolean;
    opus_encoder: string | null;
    error?: string;
  };
  ffprobe: {
    binary: string;
    available: boolean;
    error?: string;
  };
  webp_wasm: {
    available: boolean;
    error?: string;
  };
  profiles: Record<EnabledProfile, boolean>;
  install_hint: string;
}

export function ffmpegInstallHint(platform: NodeJS.Platform = process.platform): string {
  if (platform === "darwin") return "brew install ffmpeg";
  if (platform === "win32") return "winget install Gyan.FFmpeg";
  return "sudo apt install ffmpeg  # or your distro package manager";
}

export async function runDoctor(context: ServiceContext): Promise<DoctorReport> {
  const binaries = context.engine.getBinaries();

  const ffmpegReport: DoctorReport["ffmpeg"] = {
    binary: binaries.ffmpeg,
    available: false,
    version: null,
    h264_encoder: null,
    aac_encoder: false,
    vp9_encoder: false,
    opus_encoder: null
  };
  try {
    const caps = await detectCapabilities(binaries.ffmpeg);
    ffmpegReport.available = true;
    ffmpegReport.version = caps.version;
    ffmpegReport.h264_encoder = pickH264Encoder(caps.encoders);
    ffmpegReport.aac_encoder = caps.encoders.has("aac");
    ffmpegReport.vp9_encoder = caps.encoders.has("libvpx-vp9");
    ffmpegReport.opus_encoder = pickOpusEncoder(caps.encoders);
  } catch (err) {
    ffmpegReport.error = err instanceof Error ? err.message : String(err);
  }

  const ffprobeReport: DoctorReport["ffprobe"] = {
    binary: binaries.ffprobe,
    available: false
  };
  try {
    await runBinary(binaries.ffprobe, ["-hide_banner", "-version"], { timeoutMs: 10_000 });
    ffprobeReport.available = true;
  } catch (err) {
    ffprobeReport.error = err instanceof Error ? err.message : String(err);
  }

  const webpReport: DoctorReport["webp_wasm"] = { available: false };
  try {
    await ensureWebpEncoder();
    webpReport.available = true;
  } catch (err) {
    webpReport.error = err instanceof Error ? err.message : String(err);
  }

  const baseTools = ffmpegReport.available && ffprobeReport.available;
  const profiles: Record<EnabledProfile, boolean> = {
    "video-mp4": baseTools && ffmpegReport.h264_encoder !== null && ffmpegReport.aac_encoder,
    "video-webm-alpha": baseTools && ffmpegReport.vp9_encoder && ffmpegReport.opus_encoder !== null,
    "sound-bundle": baseTools && webpReport.available && ffmpegReport.opus_encoder !== null,
    "standard-webp": baseTools && webpReport.available
  };

  return {
    ok: profiles["video-mp4"] && webpReport.available,
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    ffmpeg: ffmpegReport,
    ffprobe: ffprobeReport,
    webp_wasm: webpReport,
    profiles,
    install_hint: ffmpegInstallHint(process.platform)
  };
}

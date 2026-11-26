import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import packageJson from "../../package.json";
import {
  ENABLED_PROFILES,
  createServiceContext,
  createSoundSticker,
  exportSavedProject,
  probeMedia,
  type ServiceOptions
} from "../service";
import { guarded, jsonResult } from "./results";

const INSTRUCTIONS = [
  "StikSound turns an image, GIF or short clip plus a sound into a square video or sticker file, entirely on this machine.",
  "Typical flow: call probe_media on the image to check the crop and on the audio to find the loudest window, then call create_sound_sticker.",
  "All paths must be absolute or start with ~/. The server cannot see files attached to the chat, only files on disk.",
  "Sounds can come from a local file or a public HTTPS link (a myinstants.com page or a direct audio file); only that link's host is contacted.",
  "No output is a WhatsApp sticker with sound: WhatsApp has no public format for one. Always relay the note returned with an export."
].join(" ");

/** Builds the MCP server backed by the shared CLI headless services. */
export function createMcpServer(options: ServiceOptions = {}): McpServer {
  const context = createServiceContext({ ...options, allowRelativePaths: false });
  const server = new McpServer(
    { name: "stiksound", title: "StikSound", version: packageJson.version },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool(
    "probe_media",
    {
      title: "Inspect a media file",
      description:
        "Reads a local image, GIF, clip, audio file or .stiksound.zip project and reports what StikSound would do with it, without writing anything. " +
        "Images and clips: format, size, transparency, animation, square output size and a crop preview. " +
        "Audio: duration, level, leading silence and the loudest 5 s and 10 s windows.",
      inputSchema: {
        path: z.string().describe("Absolute path (or ~/...) to an image, GIF, short video clip, audio file or .stiksound.zip."),
        crop_x: z.number().min(0).max(1).optional().describe("Preview a horizontal crop anchor (0 to 1)."),
        crop_y: z.number().min(0).max(1).optional().describe("Preview a vertical crop anchor (0 to 1).")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    (args) =>
      guarded(async () => {
        const result = await probeMedia(context, {
          path: args.path,
          cropX: args.crop_x,
          cropY: args.crop_y,
          includePreview: true
        });
        return jsonResult(result.payload, result.preview);
      })
  );

  server.registerTool(
    "create_sound_sticker",
    {
      title: "Create a sound sticker",
      description:
        "Combines an image, GIF or short clip with an audio fragment of up to 5 or 10 seconds and writes the result to disk locally with FFmpeg. " +
        "The image is cropped to a square and never upscaled (max 512 px). Returns the output path, applied trim and a framing preview. " +
        "The result is a file to share, not an installed WhatsApp sticker; relay the returned note to the user.",
      inputSchema: {
        image_path: z
          .string()
          .describe("Absolute path (or ~/...) to the sticker source: PNG, JPG, WebP, GIF, or short MP4/MOV/WebM clip."),
        audio_path: z
          .string()
          .optional()
          .describe("Absolute path to a local MP3, WAV, OGG, M4A or AAC file (max 25 MB, 3 minutes). Omit for a video clip to use its own sound."),
        audio_url: z
          .string()
          .optional()
          .describe(
            "Public HTTPS link to the sound: a myinstants.com instant page or a direct MP3, WAV, OGG, M4A or AAC file URL. Use instead of audio_path."
          ),
        myinstants_url: z
          .string()
          .optional()
          .describe("Deprecated alias of audio_url, kept for older clients."),
        start_ms: z.number().int().min(0).optional().describe("Start of the audio fragment in milliseconds. Default 0."),
        end_ms: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("End of the audio fragment in milliseconds. Default: start_ms plus max duration, capped at audio length."),
        trim: z
          .enum(["start", "loudest"])
          .optional()
          .describe('Used only when start_ms and end_ms are omitted. "start" (default) or "loudest".'),
        max_duration_s: z
          .union([z.literal(5), z.literal(10)])
          .optional()
          .describe("Maximum fragment length, 5 or 10 seconds. Default 10."),
        volume: z.number().min(0).max(1).optional().describe("Audio gain from 0 to 1. Default 1."),
        crop_x: z.number().min(0).max(1).optional().describe("Horizontal 1:1 crop anchor: 0 left, 0.5 center, 1 right."),
        crop_y: z.number().min(0).max(1).optional().describe("Vertical 1:1 crop anchor: 0 top, 0.5 center, 1 bottom."),
        background_color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("#RRGGBB matte color behind transparent areas in MP4. Default #FFFFFF."),
        profile: z
          .enum(ENABLED_PROFILES)
          .optional()
          .describe("video-mp4 (default), video-webm-alpha, sound-bundle or standard-webp."),
        name: z.string().max(80).optional().describe("Project name; output filename derives from it."),
        output_dir: z
          .string()
          .optional()
          .describe("Absolute output folder. Default ~/Downloads/StikSound. Existing files are never overwritten."),
        save_project: z.boolean().optional().describe("Also save an editable .stiksound.zip project."),
        copy_to_clipboard: z.boolean().optional().describe("Copy the exported file to the system clipboard.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    (args) =>
      guarded(async () => {
        const result = await createSoundSticker(context, {
          imagePath: args.image_path,
          audioPath: args.audio_path,
          audioUrl: args.audio_url,
          myinstantsUrl: args.myinstants_url,
          startMs: args.start_ms,
          endMs: args.end_ms,
          trim: args.trim,
          maxDurationS: args.max_duration_s,
          volume: args.volume,
          cropX: args.crop_x,
          cropY: args.crop_y,
          backgroundColor: args.background_color,
          profile: args.profile,
          name: args.name,
          outputDir: args.output_dir,
          saveProject: args.save_project,
          copyToClipboard: args.copy_to_clipboard,
          includePreview: true
        });
        return jsonResult(result.payload, result.preview);
      })
  );

  server.registerTool(
    "export_project",
    {
      title: "Export a saved project",
      description:
        "Opens a .stiksound.zip project, validates it, and exports it again with its stored crop and trim, optionally with another profile.",
      inputSchema: {
        project_path: z.string().describe("Absolute path (or ~/...) to a .stiksound.zip project."),
        profile: z.enum(ENABLED_PROFILES).optional().describe("Export profile. Default: the one stored in the project."),
        max_duration_s: z
          .union([z.literal(5), z.literal(10)])
          .optional()
          .describe("Maximum fragment length used to validate the stored trim. Default 10."),
        output_dir: z.string().optional().describe("Absolute output folder. Default ~/Downloads/StikSound."),
        copy_to_clipboard: z.boolean().optional().describe("Copy the exported file to the system clipboard.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    (args) =>
      guarded(async () => {
        const result = await exportSavedProject(context, {
          projectPath: args.project_path,
          profile: args.profile,
          maxDurationS: args.max_duration_s,
          outputDir: args.output_dir,
          copyToClipboard: args.copy_to_clipboard,
          includePreview: true
        });
        return jsonResult(result.payload, result.preview);
      })
  );

  return server;
}

/** Connects the MCP server over stdio. Stdout is reserved for MCP JSON-RPC messages. */
export async function runMcpStdio(options: ServiceOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  await server.connect(new StdioServerTransport());
}

import { parseArgs, type ParseArgsConfig } from "node:util";
import { StikSoundError } from "@stiksound/core";
import packageJson from "../package.json";
import { CliInputError } from "./errors";
import { resolveUserPath, writeExactFile } from "./files";
import { formatDoctorHuman, formatExportHuman, formatProbeHuman } from "./format";
import {
  ENABLED_PROFILES,
  createServiceContext,
  createSoundSticker,
  exportSavedProject,
  isEnabledProfile,
  probeMedia,
  runDoctor,
  type EnabledProfile,
  type ServiceOptions
} from "./service";
import { parseTimeToMs } from "./time-parse";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface RunCliOptions extends ServiceOptions {
  io?: CliIo;
  /** Override used in tests so `stiksound mcp` does not bind process stdio. */
  startMcp?: (options: ServiceOptions) => Promise<void>;
  /** Binary path shown by `stiksound mcp --print-config`. */
  execPath?: string;
}

const DEFAULT_IO: CliIo = {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`)
};

const MAIN_HELP = `StikSound CLI v${packageJson.version} — headless sound sticker creator

Usage:
  stiksound <command> [options]

Commands:
  create <image>       Create a sound sticker from an image, GIF or clip + audio file / audio URL
  probe  <file>        Inspect an image, GIF, clip, audio file or .stiksound.zip project
  export <project>     Re-export a saved .stiksound.zip project (optionally changing profile/edits)
  doctor               Check local FFmpeg, ffprobe, encoders and WebP WASM availability
  mcp                  Start the optional local MCP server over stdio (or print client config)

Global options:
  -h, --help           Show help (use with any command for detailed options)
  -v, --version        Show CLI version

Examples:
  stiksound probe ~/Pictures/cat.png
  stiksound probe sound.mp3 --json
  stiksound create cat.png -a boom.mp3 --trim loudest -d 5
  stiksound create cat.png -u https://www.myinstants.com/en/instant/vine-boom-sound-70972/ -o out.mp4
  stiksound create cat.png -u https://example.com/sounds/boom.mp3
  stiksound create cat.png --profile standard-webp -o cat.webp
  stiksound export cat.stiksound.zip --profile video-webm-alpha
  stiksound mcp --print-config`;

const COMMAND_HELP: Record<string, string> = {
  create: `Usage:
  stiksound create <image> [options]
  stiksound create --image <image> [options]

Audio source (omit for video clips to use embedded sound, or for standard-webp):
  -a, --audio <path>           Local audio file (MP3, WAV, OGG, M4A, AAC; max 25 MB / 3 min)
  -u, --url <audio-url>        MyInstants page or direct HTTPS audio link (MP3, WAV, OGG, M4A)

Trim & framing:
  --start <time>               Fragment start: ms (1500), seconds (1.5s) or mm:ss (0:01.5)
  --end <time>                 Fragment end: ms, seconds or mm:ss
  --trim <start|loudest>       Auto-trim strategy when --start/--end are omitted (default: start)
  -d, --max-duration <5|10>    Maximum duration preset in seconds (default: 10)
  --volume <0..1>              Audio gain (default: 1)
  --crop-x <0..1>              Horizontal 1:1 crop anchor (default: 0.5)
  --crop-y <0..1>              Vertical 1:1 crop anchor (default: 0.5)
  --matte, --bg <#RRGGBB>      Background fill behind transparency in MP4 (default: #FFFFFF)

Output:
  -p, --profile <profile>      video-mp4 (default), video-webm-alpha, sound-bundle, standard-webp
  -n, --name <name>            Project name (derives output filename)
  -o, --output <path>          Output file path or directory (never overwrites without --force)
  --output-dir <dir>           Output folder (default: ~/Downloads/StikSound; auto-suffixes)
  -f, --force                  Overwrite destination file when using --output <file>
  --save-project [path]        Also save an editable .stiksound.zip (optional custom path/folder)
  --copy                       Copy exported file to the system clipboard
  --json                       Print structured JSON to stdout`,

  probe: `Usage:
  stiksound probe <file> [options]

Options:
  --crop-x <0..1>              Preview horizontal crop anchor (images/clips)
  --crop-y <0..1>              Preview vertical crop anchor (images/clips)
  --preview <path.webp>        Save a 512 px square WebP framing preview to disk
  -f, --force                  Overwrite existing file when using --preview
  --json                       Print structured JSON to stdout`,

  export: `Usage:
  stiksound export <project.stiksound.zip> [options]

Options:
  -p, --profile <profile>      video-mp4, video-webm-alpha, sound-bundle, standard-webp
  -d, --max-duration <5|10>    Maximum duration preset in seconds (default: 10)
  --start <time>               Override audio start (ms, seconds or mm:ss)
  --end <time>                 Override audio end (ms, seconds or mm:ss)
  --volume <0..1>              Override audio gain (0..1)
  --crop-x <0..1>              Override horizontal crop anchor (0..1)
  --crop-y <0..1>              Override vertical crop anchor (0..1)
  --matte, --bg <#RRGGBB>      Override MP4 matte color
  -n, --name <name>            Override project name
  -o, --output <path>          Output file path or directory
  --output-dir <dir>           Output folder (default: ~/Downloads/StikSound)
  -f, --force                  Overwrite destination file when using --output <file>
  --copy                       Copy exported file to the system clipboard
  --json                       Print structured JSON to stdout`,

  doctor: `Usage:
  stiksound doctor [--json]

Checks FFmpeg, ffprobe, H.264/AAC/VP9/Opus encoders and the WebP WebAssembly encoder.`,

  mcp: `Usage:
  stiksound mcp [options]

Starts the StikSound MCP server over stdio (stdout is reserved for MCP protocol traffic).

Options:
  --output-dir <dir>           Default output folder for exports (default: ~/Downloads/StikSound)
  --print-config               Print ready-to-use MCP client config snippets (Claude Code, Codex, Claude Desktop, Cursor)`
};

function parseUnitInterval(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new CliInputError(`${label} must be a number between 0 and 1 (got "${raw}").`);
  }
  return n;
}

function parseMaxDuration(raw: string | undefined): 5 | 10 | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.trim().toLowerCase().replace(/s$/, "");
  if (cleaned === "5") return 5;
  if (cleaned === "10") return 10;
  throw new CliInputError(`max-duration must be 5 or 10 seconds (got "${raw}").`);
}

function parseProfile(raw: string | undefined): EnabledProfile | undefined {
  if (raw === undefined) return undefined;
  if (!isEnabledProfile(raw)) {
    throw new CliInputError(`Unsupported profile "${raw}". Choose one of: ${ENABLED_PROFILES.join(", ")}.`);
  }
  return raw;
}

function parseTrimMode(raw: string | undefined): "start" | "loudest" | undefined {
  if (raw === undefined) return undefined;
  if (raw === "start" || raw === "loudest") return raw;
  throw new CliInputError(`--trim must be "start" or "loudest" (got "${raw}").`);
}

function formatMcpConfig(execPath: string, outputDir?: string): string {
  const args = outputDir ? [execPath, "mcp", "--output-dir", outputDir] : [execPath, "mcp"];
  const claudeCmd = ["claude mcp add stiksound --scope user -- node", ...args.map((a) => JSON.stringify(a))].join(" ");
  const jsonSnippet = JSON.stringify(
    {
      mcpServers: {
        stiksound: {
          command: "node",
          args
        }
      }
    },
    null,
    2
  );
  const tomlArgs = args.map((a) => JSON.stringify(a)).join(", ");
  return [
    "# Claude Code",
    claudeCmd,
    "",
    "# Claude Desktop / Cursor (mcpServers JSON)",
    jsonSnippet,
    "",
    "# Codex (~/.codex/config.toml)",
    "[mcp_servers.stiksound]",
    'command = "node"',
    `args = [${tomlArgs}]`
  ].join("\n");
}

function parseOrThrow<const T extends ParseArgsConfig>(config: T): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (err) {
    throw new CliInputError(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Runs a single CLI invocation and returns the process exit code:
 * - 0: success
 * - 2: invalid CLI usage / arguments
 * - 1: runtime or domain error
 */
export async function runCli(argv: readonly string[], options: RunCliOptions = {}): Promise<number> {
  const io = options.io ?? DEFAULT_IO;
  const wantsJson = argv.includes("--json");

  try {
    if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
      const topic = argv[0] === "help" ? argv[1] : undefined;
      if (topic && COMMAND_HELP[topic]) {
        io.stdout(COMMAND_HELP[topic]);
      } else {
        io.stdout(MAIN_HELP);
      }
      return 0;
    }

    if (argv[0] === "-v" || argv[0] === "--version") {
      io.stdout(packageJson.version);
      return 0;
    }

    const [command, ...rest] = argv;
    if (rest.includes("-h") || rest.includes("--help")) {
      io.stdout(COMMAND_HELP[command!] ?? MAIN_HELP);
      return 0;
    }

    if (command === "probe") {
      const { values, positionals } = parseOrThrow({
        args: rest,
        allowPositionals: true,
        options: {
          "crop-x": { type: "string" },
          "crop-y": { type: "string" },
          preview: { type: "string" },
          force: { type: "boolean", short: "f", default: false },
          json: { type: "boolean", default: false }
        }
      });
      const target = positionals[0];
      if (!target) {
        throw new CliInputError("Missing file path. Usage: stiksound probe <file> [--json]");
      }
      const context = createServiceContext(options);
      const result = await probeMedia(context, {
        path: target,
        cropX: parseUnitInterval(values["crop-x"], "--crop-x"),
        cropY: parseUnitInterval(values["crop-y"], "--crop-y"),
        includePreview: Boolean(values.preview)
      });
      if (values.preview && result.preview) {
        const previewPath = resolveUserPath(values.preview, "--preview", context.pathOptions);
        await writeExactFile(previewPath, result.preview.bytes, Boolean(values.force));
        result.payload.preview_path = previewPath;
      }
      io.stdout(values.json ? JSON.stringify(result.payload, null, 2) : formatProbeHuman(result.payload));
      return 0;
    }

    if (command === "create") {
      // Support optional value for --save-project (boolean flag OR `--save-project <path>`).
      const normalizedRest: string[] = [];
      let saveProjectOpt: boolean | string = false;
      for (let i = 0; i < rest.length; i++) {
        const token = rest[i]!;
        if (token === "--save-project") {
          const next = rest[i + 1];
          if (next && !next.startsWith("-")) {
            saveProjectOpt = next;
            i++;
          } else {
            saveProjectOpt = true;
          }
        } else if (token.startsWith("--save-project=")) {
          saveProjectOpt = token.slice("--save-project=".length) || true;
        } else {
          normalizedRest.push(token);
        }
      }

      const { values, positionals } = parseOrThrow({
        args: normalizedRest,
        allowPositionals: true,
        options: {
          image: { type: "string", short: "i" },
          audio: { type: "string", short: "a" },
          url: { type: "string", short: "u" },
          start: { type: "string" },
          end: { type: "string" },
          trim: { type: "string" },
          "max-duration": { type: "string", short: "d" },
          volume: { type: "string" },
          "crop-x": { type: "string" },
          "crop-y": { type: "string" },
          matte: { type: "string" },
          bg: { type: "string" },
          profile: { type: "string", short: "p" },
          name: { type: "string", short: "n" },
          output: { type: "string", short: "o" },
          "output-dir": { type: "string" },
          force: { type: "boolean", short: "f", default: false },
          copy: { type: "boolean", default: false },
          json: { type: "boolean", default: false }
        }
      });

      const imagePath = values.image ?? positionals[0];
      if (!imagePath) {
        throw new CliInputError("Missing image path. Usage: stiksound create <image> [-a <audio> | -u <audio-url>]");
      }
      if (values.matte && values.bg) {
        throw new CliInputError("Pass either --matte or --bg, not both.");
      }

      const context = createServiceContext(options);
      const result = await createSoundSticker(context, {
        imagePath,
        audioPath: values.audio,
        audioUrl: values.url,
        startMs: values.start !== undefined ? parseTimeToMs(values.start, "--start") : undefined,
        endMs: values.end !== undefined ? parseTimeToMs(values.end, "--end") : undefined,
        trim: parseTrimMode(values.trim),
        maxDurationS: parseMaxDuration(values["max-duration"]),
        volume: parseUnitInterval(values.volume, "--volume"),
        cropX: parseUnitInterval(values["crop-x"], "--crop-x"),
        cropY: parseUnitInterval(values["crop-y"], "--crop-y"),
        backgroundColor: values.matte ?? values.bg,
        profile: parseProfile(values.profile),
        name: values.name,
        outputPath: values.output,
        outputDir: values["output-dir"],
        force: Boolean(values.force),
        saveProject: saveProjectOpt,
        copyToClipboard: Boolean(values.copy),
        includePreview: false
      });

      io.stdout(values.json ? JSON.stringify(result.payload, null, 2) : formatExportHuman(result.payload));
      return 0;
    }

    if (command === "export") {
      const { values, positionals } = parseOrThrow({
        args: rest,
        allowPositionals: true,
        options: {
          profile: { type: "string", short: "p" },
          "max-duration": { type: "string", short: "d" },
          start: { type: "string" },
          end: { type: "string" },
          volume: { type: "string" },
          "crop-x": { type: "string" },
          "crop-y": { type: "string" },
          matte: { type: "string" },
          bg: { type: "string" },
          name: { type: "string", short: "n" },
          output: { type: "string", short: "o" },
          "output-dir": { type: "string" },
          force: { type: "boolean", short: "f", default: false },
          copy: { type: "boolean", default: false },
          json: { type: "boolean", default: false }
        }
      });

      const projectPath = positionals[0];
      if (!projectPath) {
        throw new CliInputError("Missing project path. Usage: stiksound export <project.stiksound.zip> [options]");
      }
      if (values.matte && values.bg) {
        throw new CliInputError("Pass either --matte or --bg, not both.");
      }

      const context = createServiceContext(options);
      const result = await exportSavedProject(context, {
        projectPath,
        profile: parseProfile(values.profile),
        maxDurationS: parseMaxDuration(values["max-duration"]),
        startMs: values.start !== undefined ? parseTimeToMs(values.start, "--start") : undefined,
        endMs: values.end !== undefined ? parseTimeToMs(values.end, "--end") : undefined,
        volume: parseUnitInterval(values.volume, "--volume"),
        cropX: parseUnitInterval(values["crop-x"], "--crop-x"),
        cropY: parseUnitInterval(values["crop-y"], "--crop-y"),
        backgroundColor: values.matte ?? values.bg,
        name: values.name,
        outputPath: values.output,
        outputDir: values["output-dir"],
        force: Boolean(values.force),
        copyToClipboard: Boolean(values.copy),
        includePreview: false
      });

      io.stdout(values.json ? JSON.stringify(result.payload, null, 2) : formatExportHuman(result.payload));
      return 0;
    }

    if (command === "doctor") {
      const { values } = parseOrThrow({
        args: rest,
        allowPositionals: false,
        options: {
          json: { type: "boolean", default: false }
        }
      });
      const context = createServiceContext(options);
      const report = await runDoctor(context);
      io.stdout(values.json ? JSON.stringify(report, null, 2) : formatDoctorHuman(report));
      return report.ok ? 0 : 1;
    }

    if (command === "mcp") {
      const { values } = parseOrThrow({
        args: rest,
        allowPositionals: false,
        options: {
          "output-dir": { type: "string" },
          "print-config": { type: "boolean", default: false }
        }
      });
      const outputDir = values["output-dir"]
        ? resolveUserPath(values["output-dir"], "--output-dir", { allowRelative: true, cwd: options.cwd })
        : options.outputDir;

      if (values["print-config"]) {
        const scriptPath = options.execPath ?? process.argv[1] ?? "/ABSOLUTE/PATH/StikSound/apps/cli/dist/cli.mjs";
        io.stdout(formatMcpConfig(scriptPath, values["output-dir"] ? outputDir : undefined));
        return 0;
      }

      const mcpOptions: ServiceOptions = { ...options, outputDir };
      if (options.startMcp) {
        await options.startMcp(mcpOptions);
      } else {
        // Dynamically load the MCP SDK only when `stiksound mcp` is invoked.
        const { runMcpStdio } = await import("./mcp/server");
        await runMcpStdio(mcpOptions);
      }
      return 0;
    }

    throw new CliInputError(`Unknown command "${command}". Run "stiksound --help" for usage.`);
  } catch (err) {
    let code = "internal-error";
    let message = err instanceof Error ? err.message : String(err);
    let exitCode = 1;

    if (err instanceof CliInputError) {
      code = err.code;
      exitCode = 2;
    } else if (err instanceof StikSoundError) {
      code = err.code;
      message = err.detail ?? err.getLocalized("en").action;
    }

    if (wantsJson) {
      io.stderr(JSON.stringify({ error: { code, message } }, null, 2));
    } else {
      io.stderr(`Error [${code}]: ${message}`);
    }
    return exitCode;
  }
}

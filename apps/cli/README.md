# StikSound CLI

A headless, cross-platform CLI (macOS, Windows, and Linux) for creating StikSound sound stickers from the terminal, with an optional built-in MCP server mode (`stiksound mcp`).

It reuses `@stiksound/core` and `@stiksound/providers` directly without modifying or adding dependencies to the Desktop, Chrome Extension, or Web GUI builds.

> **WhatsApp compatibility note:** The exported MP4/WebM is a video file, not an installed WhatsApp sticker. WhatsApp has no public format for native sound stickers; only some Android WhatsApp Beta accounts can import an MP4 from the gallery under *Stickers -> Create*.

## Requirements

- **Node.js 22+**
- **FFmpeg** (`ffmpeg` and `ffprobe`) installed and available on `PATH` (or pointed to via `STIKSOUND_FFMPEG` / `STIKSOUND_FFPROBE`).
  - macOS: `brew install ffmpeg`
  - Debian / Ubuntu: `sudo apt install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg`

Static WebP encoding uses libwebp compiled to WebAssembly (`@jsquash/webp`), so FFmpeg does not need `libwebp`.

## Build and run

From the repository root:

```bash
npm install
npm run build --workspace=@stiksound/cli
node apps/cli/dist/cli.mjs --help
```

Or install from a GitHub Release archive (`StikSound-<version>-cli.zip`): extract it and run `bin/stiksound` (macOS / Linux) or `bin\stiksound.cmd` (Windows), or add `bin/` to your `PATH`.

## Commands

### `stiksound doctor`

Checks Node, FFmpeg, ffprobe, available encoders (H.264, AAC, VP9, Opus), and the WebP WASM encoder:

```bash
stiksound doctor
stiksound doctor --json
```

### `stiksound probe <file>`

Inspects an image, GIF, short video clip, audio file, or `.stiksound.zip` project without modifying anything.

```bash
stiksound probe ./cat.png
stiksound probe ./cat.png --crop-x 0.2 --preview ./crop-preview.webp
stiksound probe ./sound.mp3 --json
stiksound probe ./saved.stiksound.zip
```

### `stiksound create <image> [options]`

Creates a sticker from a local image (`PNG`, `JPG`, `WebP`, `GIF`) or short video clip (`MP4`, `MOV`, `WebM`) plus a local audio file (`MP3`, `WAV`, `OGG`, `M4A`, `AAC`) or a public HTTPS link (a `myinstants.com` page or a direct audio file URL).

```bash
# Default 10s MP4 in ~/Downloads/StikSound
stiksound create cat.png -a boom.mp3

# Pick the loudest 5s window automatically and write to a specific file
stiksound create cat.png -a song.mp3 --trim loudest -d 5 -o ./out/cat-5s.mp4

# Explicit trim using ms, seconds, or mm:ss + custom crop and MP4 matte color
stiksound create cat.png -a song.mp3 --start 0:12.5 --end 17.5s --crop-x 0.2 --matte "#111111"

# Download audio directly from MyInstants (strict HTTPS allowlist + private IP protection)
stiksound create cat.png -u "https://www.myinstants.com/en/instant/vine-boom-sound-70972/"

# Download audio from any direct HTTPS link
stiksound create cat.png -u "https://example.com/sounds/boom.mp3"

# Transparent WebM (VP9 + Opus)
stiksound create cat.png -a boom.mp3 --profile video-webm-alpha

# Portable sound bundle (sticker.webp + sound.ogg + manifest.json) + editable project
stiksound create cat.png -a boom.mp3 --profile sound-bundle --save-project

# Static 512px WebP sticker (<= 100 KB, no audio)
stiksound create cat.png --profile standard-webp -o cat.webp

# Machine-readable JSON output for scripts
stiksound create cat.png -a boom.mp3 --json
```

Key flags:

| Flag | Default | Description |
| --- | --- | --- |
| `-a, --audio <path>` | | Local audio file (max 25 MB / 3 min) |
| `-u, --url <url>` | | MyInstants instant page or direct HTTPS audio link (`MP3`, `WAV`, `OGG`, `M4A`) |
| `--start <time>`, `--end <time>` | `0` .. max | Trim range (`1500`, `1500ms`, `1.5s`, `0:05`) |
| `--trim <start\|loudest>` | `start` | Auto-trim strategy when `--start`/`--end` are omitted |
| `-d, --max-duration <5\|10>` | `10` | Maximum fragment duration in seconds |
| `--volume <0..1>` | `1` | Audio gain |
| `--crop-x <0..1>`, `--crop-y <0..1>` | `0.5` | Square crop anchor |
| `--matte, --bg <#RRGGBB>` | `#FFFFFF` | Background color behind transparency in MP4 |
| `-p, --profile <profile>` | `video-mp4` | `video-mp4`, `video-webm-alpha`, `sound-bundle`, `standard-webp` |
| `-n, --name <name>` | image name | Project and output base name |
| `-o, --output <path>` | | Explicit destination file or directory (refuses overwrite without `--force`) |
| `--output-dir <dir>` | `~/Downloads/StikSound` | Destination folder (auto-suffixes `-2`, `-3`, ...; never overwrites) |
| `-f, --force` | `false` | Overwrite destination file when using `--output <file>` |
| `--save-project [path]` | `false` | Also write an editable `.stiksound.zip` |
| `--copy` | `false` | Copy exported file to the system clipboard (macOS, Windows, Linux Wayland/X11) |
| `--json` | `false` | Print structured JSON output to stdout |

### `stiksound export <project.stiksound.zip> [options]`

Reopens a saved `.stiksound.zip` project and exports it again, optionally changing `--profile`, `--start`, `--end`, `--volume`, `--crop-x`, `--crop-y`, `--matte`, or `--name`.

```bash
stiksound export ./cat.stiksound.zip --profile video-webm-alpha -o ./cat.webm
```

### `stiksound mcp` (optional MCP server)

Starts a local Model Context Protocol (MCP) server over stdio exposing `probe_media`, `create_sound_sticker`, and `export_project`. The MCP SDK is only loaded when this subcommand is invoked.

Print ready-to-use client configuration snippets (Claude Code, Claude Desktop, Cursor, Codex):

```bash
stiksound mcp --print-config
```

Or start directly as a stdio MCP server:

```bash
stiksound mcp [--output-dir /path/to/output]
```

In MCP mode, all file paths must be absolute or start with `~/`.

## Environment variables

| Variable | Description |
| --- | --- |
| `STIKSOUND_FFMPEG` | Explicit path to `ffmpeg` (implies sibling `ffprobe` unless `STIKSOUND_FFPROBE` is set) |
| `STIKSOUND_FFPROBE` | Explicit path to `ffprobe` |

## Security and privacy

- All media processing runs locally on your machine.
- Outbound network access only happens for the audio link you pass: HTTPS only, port 443, no userinfo, no raw IPs or local hostnames, max 2 redirects, 25 MB / 20 s limits, and pre-connection DNS validation rejecting loopback, private, link-local, and reserved IP addresses. HTML pages are rejected unless they are MyInstants instant pages.
- FFmpeg and clipboard utilities are always invoked with argument arrays (`shell: false`), never interpolated into a shell command string.

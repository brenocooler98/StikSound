import { LIMITS, StikSoundError, type SoundProvider } from "@stiksound/core";
import { fetchLimitedBytes, type FetchLike } from "./limited-fetch";
import { isMyInstantsHost, validatePublicHttpsUrl } from "./url-policy";

const HTML_CONTENT_TYPE_REGEX = /^\s*(text\/html|application\/xhtml\+xml)/i;
const HTML_SNIFF_REGEX = /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i;
const AUDIO_EXTENSION_REGEX = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|webm)$/i;

export function titleFromAudioUrl(url: URL): string | null {
  const lastSegment = url.pathname.split("/").filter(Boolean).pop();
  if (!lastSegment) return null;
  let decoded = lastSegment;
  try {
    decoded = decodeURIComponent(lastSegment);
  } catch {
    decoded = lastSegment;
  }
  const cleaned = decoded
    .replace(AUDIO_EXTENSION_REGEX, "")
    .replace(/[_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

function looksLikeHtml(bytes: Uint8Array, contentType: string | null): boolean {
  if (contentType && HTML_CONTENT_TYPE_REGEX.test(contentType)) return true;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512));
  return HTML_SNIFF_REGEX.test(head);
}

export class DirectAudioUrlProvider implements SoundProvider {
  public readonly id = "url";

  constructor(private readonly fetchFn: FetchLike = (input, init) => globalThis.fetch(input, init)) {}

  public canResolve(rawUrl: string): boolean {
    try {
      const url = validatePublicHttpsUrl(rawUrl);
      return !isMyInstantsHost(url.hostname);
    } catch {
      return false;
    }
  }

  public async resolve(rawUrl: string): Promise<{
    page_url: string | null;
    media_url: string;
    title: string | null;
    bytes: Uint8Array;
  }> {
    const initialUrl = validatePublicHttpsUrl(rawUrl);
    if (isMyInstantsHost(initialUrl.hostname)) {
      throw new StikSoundError("url-rejected", "MyInstants links are handled by the MyInstants provider.");
    }

    const fetched = await fetchLimitedBytes(initialUrl.toString(), {
      fetchFn: this.fetchFn,
      validate: validatePublicHttpsUrl,
      maxBytes: LIMITS.MAX_AUDIO_BYTES,
      sourceLabel: initialUrl.hostname
    });

    if (fetched.bytes.byteLength === 0) {
      throw new StikSoundError("unsupported-audio", "The link returned an empty file.");
    }
    if (looksLikeHtml(fetched.bytes, fetched.contentType)) {
      throw new StikSoundError("unsupported-audio", "The link points to a web page, not to an audio file.");
    }

    return {
      page_url: null,
      media_url: fetched.url,
      title: titleFromAudioUrl(new URL(fetched.url)),
      bytes: fetched.bytes
    };
  }
}

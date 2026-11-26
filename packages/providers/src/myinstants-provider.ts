import { LIMITS, StikSoundError, type SoundProvider } from "@stiksound/core";
import { fetchLimitedBytes, type FetchLike } from "./limited-fetch";
import { extractMyInstantsFromHtml } from "./myinstants-extractor";
import { validateMyInstantsUrl } from "./url-policy";

export type { FetchLike } from "./limited-fetch";

const DIRECT_MEDIA_PATH_REGEX = /^\/media\/sounds\/[^/]+\.(mp3|wav|ogg|m4a)$/i;
const INSTANT_PAGE_PATH_REGEX = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?instant\/[^/]+\/?$/i;

export class MyInstantsProvider implements SoundProvider {
  public readonly id = "myinstants";

  constructor(private readonly fetchFn: FetchLike = (input, init) => globalThis.fetch(input, init)) {}

  public canResolve(rawUrl: string): boolean {
    try {
      const url = validateMyInstantsUrl(rawUrl);
      return DIRECT_MEDIA_PATH_REGEX.test(url.pathname) || INSTANT_PAGE_PATH_REGEX.test(url.pathname);
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
    const initialUrl = validateMyInstantsUrl(rawUrl);

    if (DIRECT_MEDIA_PATH_REGEX.test(initialUrl.pathname)) {
      const bytes = await this.fetchLimitedBytes(initialUrl.toString());
      return {
        page_url: null,
        media_url: initialUrl.toString(),
        title: null,
        bytes
      };
    }

    if (!INSTANT_PAGE_PATH_REGEX.test(initialUrl.pathname)) {
      throw new StikSoundError("url-rejected", "URL is not a MyInstants instant page or direct media file.");
    }

    // Strip query strings and normalize trailing slash for instant pages
    const normalizedPath = initialUrl.pathname.endsWith("/")
      ? initialUrl.pathname
      : `${initialUrl.pathname}/`;
    const canonicalPageUrl = `${initialUrl.origin}${normalizedPath}`;
    const htmlBytes = await this.fetchLimitedBytes(canonicalPageUrl, 2 * 1024 * 1024);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(htmlBytes);
    const extracted = extractMyInstantsFromHtml(html);
    const audioBytes = await this.fetchLimitedBytes(extracted.media_url, LIMITS.MAX_AUDIO_BYTES);

    return {
      page_url: canonicalPageUrl,
      media_url: extracted.media_url,
      title: extracted.title,
      bytes: audioBytes
    };
  }

  private async fetchLimitedBytes(
    targetUrl: string,
    maxBytes: number = LIMITS.MAX_AUDIO_BYTES
  ): Promise<Uint8Array> {
    const result = await fetchLimitedBytes(targetUrl, {
      fetchFn: this.fetchFn,
      validate: validateMyInstantsUrl,
      maxBytes,
      sourceLabel: "MyInstants"
    });
    return result.bytes;
  }
}

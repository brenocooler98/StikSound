import { LIMITS, StikSoundError } from "@stiksound/core";

export type FetchLike = typeof fetch;

export interface LimitedFetchResult {
  url: string;
  bytes: Uint8Array;
  contentType: string | null;
}

export interface LimitedFetchOptions {
  fetchFn: FetchLike;
  validate: (rawUrl: string) => URL;
  maxBytes: number;
  sourceLabel: string;
}

export async function fetchLimitedBytes(targetUrl: string, options: LimitedFetchOptions): Promise<LimitedFetchResult> {
  const { fetchFn, validate, maxBytes, sourceLabel } = options;
  let currentUrl = validate(targetUrl).toString();

  for (let redirectCount = 0; redirectCount <= LIMITS.MAX_REDIRECTS; redirectCount++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchFn(currentUrl, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof StikSoundError) throw err;
      throw new StikSoundError("remote-unavailable", `Network error, timeout or CORS block while contacting ${sourceLabel}.`);
    }
    clearTimeout(timer);

    if (response.type === "opaqueredirect") {
      throw new StikSoundError("remote-unavailable", `${sourceLabel} answered with a redirect the browser cannot follow safely.`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === LIMITS.MAX_REDIRECTS) {
        throw new StikSoundError("url-rejected", "Too many redirects or missing Location header.");
      }
      currentUrl = validate(new URL(location, currentUrl).toString()).toString();
      continue;
    }

    if (response.status === 413) {
      throw new StikSoundError("file-too-large", `Remote response exceeds ${maxBytes} bytes.`);
    }
    if (response.status === 403) {
      throw new StikSoundError("url-rejected", `URL rejected by ${sourceLabel} security policy.`);
    }
    if (!response.ok) {
      throw new StikSoundError("remote-unavailable", `HTTP ${response.status} from ${sourceLabel}.`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const len = Number(contentLengthHeader);
      if (Number.isFinite(len) && len > maxBytes) {
        throw new StikSoundError("file-too-large", `Remote response exceeds ${maxBytes} bytes.`);
      }
    }

    const contentType = response.headers.get("content-type");

    if (!response.body) {
      const arr = new Uint8Array(await response.arrayBuffer());
      if (arr.byteLength > maxBytes) {
        throw new StikSoundError("file-too-large", `Remote body exceeds ${maxBytes} bytes.`);
      }
      return { url: currentUrl, bytes: arr, contentType };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new StikSoundError("file-too-large", `Remote stream exceeded ${maxBytes} bytes.`);
        }
        chunks.push(value);
      }
    }

    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return { url: currentUrl, bytes: out, contentType };
  }

  throw new StikSoundError("url-rejected", "Redirect limit exceeded.");
}

import { describe, expect, it } from "vitest";
import { LIMITS } from "@stiksound/core";
import {
  DirectAudioUrlProvider,
  titleFromAudioUrl,
  validatePublicHttpsUrl,
  type FetchLike
} from "../src/index";

const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function audioResponse(bytes: Uint8Array = MP3_BYTES, contentType = "audio/mpeg"): Response {
  return new Response(bytes.slice().buffer, { status: 200, headers: { "content-type": contentType } });
}

describe("packages/providers direct audio URL", () => {
  it("accepts public HTTPS hosts and rejects unsafe URLs", () => {
    expect(validatePublicHttpsUrl("https://cdn.example.com/sounds/boom.mp3").hostname).toBe("cdn.example.com");
    expect(() => validatePublicHttpsUrl("http://cdn.example.com/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("https://user:pass@cdn.example.com/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("https://cdn.example.com:8443/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("https://127.0.0.1/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("https://[::1]/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("https://localhost/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("https://router.local/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("https://intranet/a.mp3")).toThrowError(/url-rejected/);
    expect(() => validatePublicHttpsUrl("file:///etc/passwd")).toThrowError(/url-rejected/);
  });

  it("leaves MyInstants links to the MyInstants provider", () => {
    const provider = new DirectAudioUrlProvider(async () => audioResponse());
    expect(provider.canResolve("https://cdn.example.com/sounds/boom.mp3")).toBe(true);
    expect(provider.canResolve("https://www.myinstants.com/media/sounds/boom.mp3")).toBe(false);
    expect(provider.canResolve("http://cdn.example.com/boom.mp3")).toBe(false);
  });

  it("downloads the bytes and derives a title from the file name", async () => {
    const seen: string[] = [];
    const fetchFn: FetchLike = async (input) => {
      seen.push(String(input));
      return audioResponse();
    };
    const provider = new DirectAudioUrlProvider(fetchFn);
    const result = await provider.resolve("https://cdn.example.com/sounds/vine_boom%20remix.mp3?dl=1");
    expect(seen).toEqual(["https://cdn.example.com/sounds/vine_boom%20remix.mp3?dl=1"]);
    expect(result.bytes).toEqual(MP3_BYTES);
    expect(result.page_url).toBeNull();
    expect(result.media_url).toBe("https://cdn.example.com/sounds/vine_boom%20remix.mp3?dl=1");
    expect(result.title).toBe("vine boom remix");
  });

  it("follows safe redirects and rejects redirects to private hosts", async () => {
    let calls = 0;
    const redirectOnce: FetchLike = async () => {
      calls++;
      return calls === 1
        ? new Response(null, { status: 302, headers: { location: "https://files.example.net/boom.ogg" } })
        : audioResponse(MP3_BYTES, "audio/ogg");
    };
    const ok = await new DirectAudioUrlProvider(redirectOnce).resolve("https://short.example.com/x");
    expect(ok.media_url).toBe("https://files.example.net/boom.ogg");

    const toLoopback: FetchLike = async () =>
      new Response(null, { status: 302, headers: { location: "https://localhost/secret.mp3" } });
    await expect(new DirectAudioUrlProvider(toLoopback).resolve("https://short.example.com/x")).rejects.toMatchObject({
      code: "url-rejected"
    });
  });

  it("rejects HTML pages, empty bodies and oversized files", async () => {
    const html: FetchLike = async () =>
      new Response("<!DOCTYPE html><html><body>hi</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    await expect(new DirectAudioUrlProvider(html).resolve("https://cdn.example.com/page")).rejects.toMatchObject({
      code: "unsupported-audio"
    });

    const empty: FetchLike = async () => audioResponse(new Uint8Array(0));
    await expect(new DirectAudioUrlProvider(empty).resolve("https://cdn.example.com/a.mp3")).rejects.toMatchObject({
      code: "unsupported-audio"
    });

    const huge: FetchLike = async () =>
      new Response(MP3_BYTES.slice().buffer, {
        status: 200,
        headers: { "content-length": String(LIMITS.MAX_AUDIO_BYTES + 1) }
      });
    await expect(new DirectAudioUrlProvider(huge).resolve("https://cdn.example.com/a.mp3")).rejects.toMatchObject({
      code: "file-too-large"
    });
  });

  it("maps network and CORS failures to remote-unavailable", async () => {
    const blocked: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(new DirectAudioUrlProvider(blocked).resolve("https://cdn.example.com/a.mp3")).rejects.toMatchObject({
      code: "remote-unavailable"
    });
  });

  it("builds readable titles", () => {
    expect(titleFromAudioUrl(new URL("https://a.example.com/x/Bruh_Sound.WAV"))).toBe("Bruh Sound");
    expect(titleFromAudioUrl(new URL("https://a.example.com/"))).toBeNull();
  });
});

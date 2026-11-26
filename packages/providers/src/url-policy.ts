import { ALLOWED_MYINSTANTS_HOSTS, StikSoundError } from "@stiksound/core";

const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return true;

  // IPv6 checks
  if (normalized.includes(":")) {
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1
    const mappedPrefix = "::ffff:";
    if (normalized.startsWith(mappedPrefix)) {
      return isPrivateOrReservedIp(normalized.slice(mappedPrefix.length));
    }
    return false;
  }

  if (!IPV4_PATTERN.test(normalized)) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];

  if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".arpa", ".onion"];

export function validatePublicHttpsUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new StikSoundError("url-rejected", "Empty URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new StikSoundError("url-rejected", "Malformed URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new StikSoundError("url-rejected", `Only https URLs are allowed (got ${parsed.protocol}).`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new StikSoundError("url-rejected", "URL userinfo is forbidden.");
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new StikSoundError("url-rejected", `Non-443 port rejected: ${parsed.port}`);
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || IPV4_PATTERN.test(host) || host.includes(":") || host.startsWith("[")) {
    throw new StikSoundError("url-rejected", `Raw IP or localhost rejected: ${host}`);
  }
  if (!host.includes(".") || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new StikSoundError("url-rejected", `Non-public host rejected: ${host}`);
  }

  return parsed;
}

export function isMyInstantsHost(hostname: string): boolean {
  return (ALLOWED_MYINSTANTS_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

export function validateMyInstantsUrl(rawUrl: string): URL {
  const parsed = validatePublicHttpsUrl(rawUrl);
  const host = parsed.hostname.toLowerCase();
  if (!isMyInstantsHost(host)) {
    throw new StikSoundError("url-rejected", `Host not on MyInstants allowlist: ${host}`);
  }
  return parsed;
}

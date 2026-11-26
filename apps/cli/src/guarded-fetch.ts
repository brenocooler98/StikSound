import { lookup } from "node:dns/promises";
import { StikSoundError } from "@stiksound/core";
import { isPrivateOrReservedIp, type FetchLike } from "@stiksound/providers";

export type HostResolver = (hostname: string) => Promise<string[]>;

const USER_AGENT = "Mozilla/5.0 (compatible; StikSound/1.1; +https://github.com/SilverFeit/StikSound)";

async function resolveWithSystemDns(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map((record) => record.address);
}

/**
 * Wraps fetch for the MyInstants and direct audio URL providers. The provider validates scheme, host, port and every
 * redirect hop; in Node we also resolve DNS before connecting and refuse loopback, private,
 * link-local or reserved addresses, and default redirect mode to "manual" as defense in depth.
 */
export function createGuardedFetch(
  resolveHost: HostResolver = resolveWithSystemDns,
  baseFetch: FetchLike = globalThis.fetch
): FetchLike {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

    let addresses: string[];
    try {
      addresses = await resolveHost(url.hostname);
    } catch {
      throw new StikSoundError("remote-unavailable", `DNS lookup failed for ${url.hostname}.`);
    }
    if (addresses.length === 0) {
      throw new StikSoundError("remote-unavailable", `DNS returned no addresses for ${url.hostname}.`);
    }
    if (addresses.some((address) => isPrivateOrReservedIp(address))) {
      throw new StikSoundError("url-rejected", `${url.hostname} resolves to a private or reserved address.`);
    }

    const headers = new Headers(init?.headers);
    if (!headers.has("user-agent")) {
      headers.set("user-agent", USER_AGENT);
    }
    return baseFetch(input, {
      ...init,
      redirect: init?.redirect ?? "manual",
      headers
    });
  };
}

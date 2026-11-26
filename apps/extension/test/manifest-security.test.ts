import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SEC-011: Chrome Extension Manifest V3 security boundary", () => {
  it("contains only downloads, storage, MyInstants host permissions and optional HTTPS access with no content scripts", () => {
    const manifestPath = path.resolve(__dirname, "../public/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      manifest_version: number;
      permissions: string[];
      host_permissions: string[];
      optional_host_permissions?: string[];
      content_scripts?: unknown;
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions.slice().sort()).toEqual(["downloads", "storage"]);
    expect(manifest.host_permissions.slice().sort()).toEqual([
      "https://myinstants.com/*",
      "https://www.myinstants.com/*"
    ]);
    expect(manifest.optional_host_permissions).toEqual(["https://*/*"]);
    expect(manifest.content_scripts).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain("whatsapp");
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  });
});

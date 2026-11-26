import React from "react";
import { createRoot } from "react-dom/client";
import { detectLocale, StikSoundError, type ExportArtifact } from "@stiksound/core";
import { WebMediaEngine } from "@stiksound/media-web";
import { DirectAudioUrlProvider, MyInstantsProvider, type FetchLike } from "@stiksound/providers";
import { StikSoundMinimalApp, type ShellBridge } from "@stiksound/ui";
import "../../../packages/ui/src/styles.css";

async function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): Promise<void> {
  const blob = new Blob([bytes.slice().buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    if (typeof chrome !== "undefined" && chrome.downloads?.download) {
      await chrome.downloads.download({
        url,
        filename: fileName,
        saveAs: false
      });
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

const shell: ShellBridge = {
  async saveArtifact(artifact: ExportArtifact) {
    await downloadBytes(artifact.bytes, artifact.fileName, artifact.mimeType);
  },
  async copyArtifactToClipboard(artifact: ExportArtifact) {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        const blob = new Blob([artifact.bytes.slice().buffer], { type: artifact.mimeType });
        await navigator.clipboard.write([new ClipboardItem({ [artifact.mimeType]: blob })]);
      } catch {
        // Fallback: user can use the inline Download button or drag the preview video
      }
    }
  },
  async saveProjectZip(zipBytes: Uint8Array, suggestedName: string) {
    await downloadBytes(zipBytes, suggestedName, "application/zip");
  }
};

const engine = new WebMediaEngine();
function requestOriginAccess(url: string): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions?.request) return Promise.resolve(true);
  const origin = `${new URL(url).origin}/*`;
  return chrome.permissions.request({ origins: [origin] }).catch(() => false);
}

const permissionedFetch: FetchLike = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const access = requestOriginAccess(url);
  return access.then((granted) => {
    if (!granted) {
      throw new StikSoundError("url-rejected", `Access to ${new URL(url).origin} was not granted.`);
    }
    return globalThis.fetch(input, init);
  });
};

const providers = [new MyInstantsProvider(), new DirectAudioUrlProvider(permissionedFetch)];
const locale = detectLocale(navigator.language);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StikSoundMinimalApp
      engine={engine}
      providers={providers}
      shell={shell}
      initialLocale={locale}
    />
  </React.StrictMode>
);

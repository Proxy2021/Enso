import { resolveMediaUrl } from "./connection";
import { isNative } from "./platform";
import { nativeShare } from "./native-share";

/**
 * Derive a reasonable filename from a URL path.
 */
function deriveFilename(url: string): string {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const segments = pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "photo.jpg";
  } catch {
    return "photo.jpg";
  }
}

/**
 * Download an image to the user's device.
 * Fetches as blob and triggers browser download via <a download>.
 */
export async function savePhoto(
  url: string,
  filename?: string,
): Promise<void> {
  const resolved = resolveMediaUrl(url);
  const response = await fetch(resolved);
  const blob = await response.blob();

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename || deriveFilename(url);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Share an image via Web Share API (with file) or native share sheet.
 * Falls back to savePhoto if sharing is not supported.
 */
export async function sharePhoto(
  url: string,
  filename?: string,
): Promise<void> {
  const resolved = resolveMediaUrl(url);
  const name = filename || deriveFilename(url);

  // Android native: share the URL via system share sheet
  if (isNative) {
    await nativeShare({
      title: name,
      text: `Photo: ${name}`,
      url: resolved,
    });
    return;
  }

  // Web Share API with file support (Chrome, Safari, Edge)
  if (navigator.share && navigator.canShare) {
    try {
      const response = await fetch(resolved);
      const blob = await response.blob();
      const file = new File([blob], name, {
        type: blob.type || "image/jpeg",
      });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: name, files: [file] });
        return;
      }
    } catch (err) {
      // User cancelled share — don't fall through to download
      if ((err as DOMException)?.name === "AbortError") return;
    }
  }

  // Fallback: just download
  await savePhoto(url, filename);
}

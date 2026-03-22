import { resolveMediaUrl } from "./connection";
import { isNative } from "./platform";
import { nativeShare } from "./native-share";

// ── Image Compression ──

const COMPRESS_MAX_DIMENSION = 1920;
const COMPRESS_QUALITY = 0.80;
const COMPRESS_THRESHOLD_BYTES = 800_000; // only compress files > 800KB

/**
 * Compress an image File using canvas downscaling + JPEG re-encoding.
 * Skips non-image files and small images. Returns the original file
 * unchanged if compression isn't beneficial.
 */
export function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return Promise.resolve(file);
  }
  if (file.size <= COMPRESS_THRESHOLD_BYTES) {
    return Promise.resolve(file);
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width <= COMPRESS_MAX_DIMENSION && height <= COMPRESS_MAX_DIMENSION && file.size <= COMPRESS_THRESHOLD_BYTES * 2) {
        resolve(file);
        return;
      }

      const scale = Math.min(COMPRESS_MAX_DIMENSION / width, COMPRESS_MAX_DIMENSION / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          });
          resolve(compressed);
        },
        "image/jpeg",
        COMPRESS_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

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

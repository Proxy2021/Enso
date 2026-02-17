import { useState } from "react";

const getMediaType = (url: string) => {
  // For /media/ URLs the path is base64url-encoded with no extension.
  // The server appends ?ext=.mp4 etc. so check that first.
  const extParam = new URL(url, "http://localhost").searchParams.get("ext");
  const extension = (extParam ?? url.split(".").pop() ?? "").replace(/^\./, "").toLowerCase();
  if (!extension) return "unknown";

  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(extension)) return "image";
  if (["mp4", "webm", "ogg"].includes(extension)) return "video";
  if (["mp3", "wav", "aac", "ogg"].includes(extension)) return "audio";

  return "unknown";
};

export default function MediaGallery({ urls }: { urls: string[] }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const validUrls = urls.filter((u) => !failedUrls.has(u));
  if (validUrls.length === 0) return null;

  return (
    <div
      className={`grid gap-1.5 mt-2 ${
        validUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
      }`}
    >
      {validUrls.map((url, i) => {
        const mediaType = getMediaType(url);
        const handleError = () =>
          setFailedUrls((prev) => new Set(prev).add(url));

        let mediaElement = null;
        if (mediaType === "image") {
          mediaElement = (
            <img
              src={url}
              alt={`Media ${i + 1}`}
              className="w-full h-auto max-h-64 object-cover bg-gray-900"
              loading="lazy"
              onError={handleError}
            />
          );
        } else if (mediaType === "video") {
          mediaElement = (
            <video
              src={url}
              controls
              className="w-full h-auto max-h-64 object-cover bg-gray-900"
              onError={handleError}
            >
              Your browser does not support the video tag.
            </video>
          );
        } else if (mediaType === "audio") {
          mediaElement = (
            <audio
              src={url}
              controls
              className="w-full h-16 bg-gray-900"
              onError={handleError}
            >
              Your browser does not support the audio element.
            </audio>
          );
        } else {
          // Fallback for unknown types or failed attempts (e.g., if a video URL was meant to be an image)
          mediaElement = (
            <img
              src={url}
              alt={`Unsupported media type: ${url}`}
              className="w-full h-auto max-h-64 object-cover bg-gray-900"
              loading="lazy"
              onError={handleError}
            />
          );
        }

        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-gray-700/50 hover:border-gray-500 transition-colors"
          >
            {mediaElement}
          </a>
        );
      })}
    </div>
  );
}

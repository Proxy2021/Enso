import { useState } from "react";

type MediaType = "image" | "video" | "audio" | "document" | "unknown";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "avi", "mov"];
const AUDIO_EXTS = ["mp3", "wav", "aac", "flac", "m4a", "wma"];
const DOC_EXTS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "md", "json", "xml", "rtf", "zip"];

const getMediaType = (url: string): MediaType => {
  if (url.startsWith("blob:")) return "image";

  const extParam = new URL(url, "http://localhost").searchParams.get("ext");
  const extension = (extParam ?? url.split(".").pop() ?? "").replace(/^\./, "").toLowerCase();
  if (!extension) return "unknown";

  if (IMAGE_EXTS.includes(extension)) return "image";
  if (VIDEO_EXTS.includes(extension)) return "video";
  if (AUDIO_EXTS.includes(extension)) return "audio";
  if (DOC_EXTS.includes(extension)) return "document";

  return "unknown";
};

function getExtLabel(url: string): string {
  const extParam = new URL(url, "http://localhost").searchParams.get("ext");
  const ext = (extParam ?? "").replace(/^\./, "").toUpperCase();
  return ext || "FILE";
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function MediaGallery({ urls }: { urls: string[] }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const validUrls = urls.filter((u) => !failedUrls.has(u));
  if (validUrls.length === 0) return null;

  const allNonVisual = validUrls.every((u) => {
    const t = getMediaType(u);
    return t === "document" || t === "audio";
  });

  return (
    <div
      className={`grid gap-1.5 mt-2 ${
        allNonVisual ? "grid-cols-1" : validUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
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
              className="w-full h-auto max-h-96 object-contain bg-gray-900"
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
        } else if (mediaType === "document") {
          mediaElement = (
            <div className="flex items-center gap-2.5 px-3 py-3 bg-gray-800 min-h-[3rem]">
              <FileIcon className="w-5 h-5 text-indigo-400 shrink-0" />
              <span className="text-xs text-gray-300 truncate flex-1">{getExtLabel(url)} Document</span>
              <DownloadIcon className="w-4 h-4 text-gray-500 shrink-0" />
            </div>
          );
        } else {
          mediaElement = (
            <div className="flex items-center gap-2.5 px-3 py-3 bg-gray-800 min-h-[3rem]">
              <FileIcon className="w-5 h-5 text-gray-500 shrink-0" />
              <span className="text-xs text-gray-400 truncate flex-1">Attachment</span>
              <DownloadIcon className="w-4 h-4 text-gray-500 shrink-0" />
            </div>
          );
        }

        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-gray-700/50 hover:border-gray-500 transition-all duration-150"
          >
            {mediaElement}
          </a>
        );
      })}
    </div>
  );
}

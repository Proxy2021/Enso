import { useState } from "react";

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
      {validUrls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg border border-gray-700/50 hover:border-gray-500 transition-colors"
        >
          <img
            src={url}
            alt={`Media ${i + 1}`}
            className="w-full h-auto max-h-64 object-cover bg-gray-900"
            loading="lazy"
            onError={() =>
              setFailedUrls((prev) => new Set(prev).add(url))
            }
          />
        </a>
      ))}
    </div>
  );
}

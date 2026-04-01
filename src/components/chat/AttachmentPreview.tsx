import { useRef, useCallback, useEffect } from "react";
import { getFileCategory, getFileExt } from "./chat-utils";

interface AttachmentPreviewProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function AttachmentPreview({ files, onRemove }: AttachmentPreviewProps) {
  // Stable blob URL map — avoids creating new blob URLs on every render
  // and revokes stale ones to prevent memory leaks.
  const blobUrlMapRef = useRef<Map<File, string>>(new Map());

  const getFileBlobUrl = useCallback((file: File): string => {
    const map = blobUrlMapRef.current;
    let url = map.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      map.set(file, url);
    }
    return url;
  }, []);

  // Revoke blob URLs for files that have been removed
  useEffect(() => {
    const map = blobUrlMapRef.current;
    const currentFiles = new Set(files);
    for (const [file, url] of map) {
      if (!currentFiles.has(file)) {
        URL.revokeObjectURL(url);
        map.delete(file);
      }
    }
  }, [files]);

  // Cleanup all blob URLs on unmount
  useEffect(() => {
    const map = blobUrlMapRef.current;
    return () => {
      for (const url of map.values()) {
        URL.revokeObjectURL(url);
      }
      map.clear();
    };
  }, []);

  if (files.length === 0) return null;

  return (
    <div className="flex gap-2 mb-2 flex-wrap">
      {files.map((file, i) => {
        const cat = getFileCategory(file);
        return (
          <div
            key={i}
            className="relative group rounded-lg overflow-hidden border border-gray-700 bg-gray-800"
          >
            {cat === "image" ? (
              <img
                src={getFileBlobUrl(file)}
                alt={file.name}
                className="h-16 w-16 object-cover"
              />
            ) : (
              <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 px-1">
                {cat === "video" && (
                  <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
                {cat === "audio" && (
                  <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                )}
                {cat === "document" && (
                  <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
                <span className="text-[8px] text-gray-400 truncate w-full text-center">
                  {getFileExt(file) || file.name.slice(0, 8)}
                </span>
              </div>
            )}
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-2 -right-2 flex items-center justify-center w-11 h-11 text-gray-300 hover:text-white active:text-white text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-900/80 text-[10px]">&times;</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

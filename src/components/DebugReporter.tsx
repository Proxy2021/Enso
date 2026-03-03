import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bug, Camera, ImagePlus, X } from "lucide-react";
import { useChatStore } from "../store/chat";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";

interface CapturedImage {
  blob: Blob;
  url: string;
  isScreenshot: boolean; // true for the auto-captured screenshot
}

/** Downscale and JPEG-compress an image blob to reduce context token usage in Claude Code. */
async function compressImage(blob: Blob, maxDim = 1200, quality = 0.80): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b!), "image/jpeg", quality);
  });
}

export default function DebugReporter() {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [description, setDescription] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const connectionState = useChatStore((s) => s.connectionState);
  const ensoProjectPath = useChatStore((s) => s.ensoProjectPath);
  const sendDebugReport = useChatStore((s) => s.sendDebugReport);
  const disabled = connectionState !== "connected" || !ensoProjectPath;

  // Close on click outside sheet
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Cleanup all object URLs on unmount
  useEffect(() => {
    return () => { images.forEach((img) => URL.revokeObjectURL(img.url)); };
  }, []);

  const captureScreenshot = useCallback(async (): Promise<CapturedImage | null> => {
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(document.documentElement, {
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        cacheBust: true,
      });
      if (blob) {
        return { blob, url: URL.createObjectURL(blob), isScreenshot: true };
      }
    } catch (err) {
      console.error("[debug-reporter] Screenshot capture failed:", err);
    }
    return null;
  }, []);

  // Auto-capture screenshot when bug icon is clicked
  const handleBugClick = useCallback(async () => {
    if (disabled || isCapturing) return;
    setIsCapturing(true);

    // Capture with modal closed so it's not in the shot
    const img = await captureScreenshot();

    if (img) {
      // Replace any existing screenshot, keep user-added photos
      setImages((prev) => {
        const old = prev.find((i) => i.isScreenshot);
        if (old) URL.revokeObjectURL(old.url);
        return [img, ...prev.filter((i) => !i.isScreenshot)];
      });
    }

    setIsOpen(true);
    setIsCapturing(false);
  }, [disabled, isCapturing, captureScreenshot]);

  // Recapture the screenshot (tap on thumbnail)
  const handleRecapture = useCallback(async () => {
    setIsOpen(false);
    setIsCapturing(true);
    await new Promise((r) => setTimeout(r, 200));

    const img = await captureScreenshot();
    if (img) {
      setImages((prev) => {
        const old = prev.find((i) => i.isScreenshot);
        if (old) URL.revokeObjectURL(old.url);
        return [img, ...prev.filter((i) => !i.isScreenshot)];
      });
    }

    setIsOpen(true);
    setIsCapturing(false);
  }, [captureScreenshot]);

  // Add photos from file picker
  const handleAddPhotos = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: CapturedImage[] = [];
    for (var i = 0; i < files.length; i++) {
      newImages.push({
        blob: files[i],
        url: URL.createObjectURL(files[i]),
        isScreenshot: false,
      });
    }
    setImages((prev) => [...prev, ...newImages]);
    e.target.value = ""; // reset so same file can be re-selected
  }, []);

  const removeImage = useCallback((idx: number) => {
    setImages((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setDescription("");
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
  }, [images]);

  const handleSubmit = useCallback(async () => {
    if (images.length === 0 && !description.trim()) return;
    setIsSubmitting(true);

    // Compress and upload all images
    const paths: string[] = [];
    for (const img of images) {
      try {
        const compressed = await compressImage(img.blob);
        const res = await fetch(`${getBackendBaseUrl()}/upload`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "image/jpeg" }),
          body: compressed,
        });
        if (res.ok) {
          const data = await res.json();
          paths.push(data.filePath);
        }
      } catch (err) {
        console.error("[debug-reporter] Image upload failed:", err);
      }
    }

    sendDebugReport(description.trim(), paths);

    // Reset and close
    setDescription("");
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
    setIsOpen(false);
    setIsSubmitting(false);
  }, [description, images, sendDebugReport]);

  return (
    <>
      {/* Header bug icon */}
      <button
        onClick={handleBugClick}
        disabled={disabled || isCapturing}
        className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-30"
        title="Report & auto-fix a bug"
      >
        <Bug size={16} />
      </button>

      {/* Portal: render modal outside header (backdrop-filter breaks fixed positioning) */}
      {isOpen && createPortal(
        <>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddPhotos}
            className="hidden"
          />

          {/* Overlay */}
          <div className="fixed inset-0 z-40 bg-black/50" />

          {/* Sheet */}
          <div
            ref={sheetRef}
            className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 border-t border-gray-700 rounded-t-2xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">Report & Auto-Fix</h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Image previews — horizontal scroll */}
            {images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {images.map((img, idx) => (
                  <div key={img.url} className="relative shrink-0 group">
                    <button
                      onClick={img.isScreenshot ? handleRecapture : undefined}
                      className={`block rounded-lg overflow-hidden border border-gray-700 ${img.isScreenshot ? "hover:border-gray-500 cursor-pointer" : ""}`}
                      title={img.isScreenshot ? "Tap to recapture" : undefined}
                      disabled={!img.isScreenshot}
                    >
                      <img
                        src={img.url}
                        alt={img.isScreenshot ? "Screenshot" : `Photo ${idx}`}
                        className="h-28 w-auto object-contain bg-gray-800"
                      />
                    </button>
                    {/* Recapture badge on screenshot */}
                    {img.isScreenshot && (
                      <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/70 rounded px-1.5 py-0.5 text-[10px] text-gray-300 pointer-events-none">
                        <Camera size={10} /> Screenshot
                      </div>
                    )}
                    {/* Remove button */}
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-gray-400 hover:text-red-400 hover:border-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}

                {/* Add photos button — inline in the scroll row */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 h-28 w-20 rounded-lg border border-dashed border-gray-600 hover:border-gray-400 flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ImagePlus size={18} />
                  <span className="text-[10px]">Add</span>
                </button>
              </div>
            )}

            {/* Description input */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the bug (optional)..."
              rows={3}
              className="w-full bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-amber-500/50 placeholder-gray-500 border border-gray-700"
            />

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (images.length === 0 && !description.trim())}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:hover:bg-amber-600"
            >
              {isSubmitting ? "Sending..." : "Report & Fix"}
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

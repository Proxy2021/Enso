import { useState, useRef, useEffect, useCallback } from "react";
import { Bug, Camera, X } from "lucide-react";
import { useChatStore } from "../store/chat";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";

export default function DebugReporter() {
  const [isOpen, setIsOpen] = useState(false);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const connectionState = useChatStore((s) => s.connectionState);
  const ensoProjectPath = useChatStore((s) => s.ensoProjectPath);
  const sendDebugReport = useChatStore((s) => s.sendDebugReport);
  const disabled = connectionState !== "connected" || !ensoProjectPath;

  // Close on click outside sheet
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const captureScreenshot = useCallback(async () => {
    setIsCapturing(true);
    setIsOpen(false); // hide modal so it's not in the screenshot

    // Wait for modal to close and DOM to repaint
    await new Promise((r) => setTimeout(r, 200));

    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(document.documentElement, {
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        cacheBust: true,
      });
      if (blob) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setScreenshotBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      console.error("[debug-reporter] Screenshot capture failed:", err);
    }

    setIsOpen(true);
    setIsCapturing(false);
  }, [previewUrl]);

  const handleSubmit = useCallback(async () => {
    if (!description.trim() && !screenshotBlob) return;
    setIsSubmitting(true);

    let screenshotPath: string | null = null;

    // Upload screenshot if captured
    if (screenshotBlob) {
      try {
        const res = await fetch(`${getBackendBaseUrl()}/upload`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "image/png" }),
          body: screenshotBlob,
        });
        if (res.ok) {
          const data = await res.json();
          screenshotPath = data.filePath;
        }
      } catch (err) {
        console.error("[debug-reporter] Screenshot upload failed:", err);
      }
    }

    // Dispatch to store
    sendDebugReport(description.trim(), screenshotPath);

    // Reset and close
    setDescription("");
    setScreenshotBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setIsOpen(false);
    setIsSubmitting(false);
  }, [description, screenshotBlob, previewUrl, sendDebugReport]);

  return (
    <>
      {/* Header bug icon */}
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-30"
        title="Report & auto-fix a bug"
      >
        <Bug size={16} />
      </button>

      {/* Bottom sheet modal */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 z-40 bg-black/50" />

          {/* Sheet */}
          <div
            ref={sheetRef}
            className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 border-t border-gray-700 rounded-t-2xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 animate-in slide-in-from-bottom"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">Report & Auto-Fix</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Screenshot preview */}
            {previewUrl && (
              <button
                onClick={captureScreenshot}
                className="w-full rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors"
                title="Tap to recapture"
              >
                <img
                  src={previewUrl}
                  alt="Bug screenshot"
                  className="w-full max-h-48 object-contain bg-gray-800"
                />
              </button>
            )}

            {/* Capture button */}
            <button
              onClick={captureScreenshot}
              disabled={isCapturing}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-50 w-full justify-center"
            >
              <Camera size={14} />
              {isCapturing ? "Capturing..." : previewUrl ? "Recapture Screen" : "Capture Screen"}
            </button>

            {/* Description input */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the bug..."
              rows={3}
              className="w-full bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-amber-500/50 placeholder-gray-500 border border-gray-700"
            />

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (!description.trim() && !screenshotBlob)}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:hover:bg-amber-600"
            >
              {isSubmitting ? "Sending..." : "Report & Fix"}
            </button>
          </div>
        </>
      )}
    </>
  );
}

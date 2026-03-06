import { useState, useEffect, useCallback, useRef } from "react";
import { App } from "@capacitor/app";
import { isNative } from "../lib/platform";
import {
  checkForUpdate,
  downloadAndInstall,
  startPeriodicChecks,
  stopPeriodicChecks,
  type UpdateInfo,
} from "../lib/version-check";
import type { DownloadProgress } from "../lib/app-updater";

type BannerState = "hidden" | "available" | "downloading" | "installing" | "signature_error" | "error";

export default function UpdateBanner() {
  const [state, setState] = useState<BannerState>("hidden");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const handleUpdateAvailable = useCallback((info: UpdateInfo) => {
    if (dismissed) return;
    setUpdateInfo(info);
    setState("available");
  }, [dismissed]);

  // Track whether we just triggered an install so we can detect failure on resume
  const installTriggeredRef = useRef(false);

  useEffect(() => {
    if (!isNative) return;
    startPeriodicChecks(handleUpdateAvailable);
    return () => stopPeriodicChecks();
  }, [handleUpdateAvailable]);

  useEffect(() => {
    if (!isNative) return;
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      // When the app resumes after we triggered the installer, the install must have
      // failed (a successful install kills the old app process). Show signature mismatch help.
      if (isActive && installTriggeredRef.current) {
        installTriggeredRef.current = false;
        setState("signature_error");
      }
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  // No-op on web or when hidden/dismissed
  if (!isNative || state === "hidden" || dismissed) return null;

  async function handleDownload() {
    setState("downloading");
    setProgress(null);
    try {
      await downloadAndInstall((p) => setProgress(p));
      // The system installer has been triggered. If install succeeds, the old app is
      // killed. If the user returns here, we detect it in the appStateChange listener.
      installTriggeredRef.current = true;
      setState("installing");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDismiss() {
    setDismissed(true);
    setState("hidden");
  }

  const sizeDisplay = updateInfo?.apkSizeBytes
    ? `${(updateInfo.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : "";

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0;

  return (
    <div className="mx-4 mt-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
      {state === "available" && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-200">
              Update available: <span className="font-medium">v{updateInfo?.serverVersionName}</span>
              {sizeDisplay ? <span className="text-blue-300/60 ml-1">({sizeDisplay})</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDismiss}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 transition-colors"
            >
              Later
            </button>
            <button
              onClick={handleDownload}
              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors font-medium"
            >
              Update
            </button>
          </div>
        </div>
      )}

      {state === "downloading" && (
        <div>
          <p className="text-sm text-blue-200 mb-2">
            Downloading update{progressPercent > 0 ? `... ${progressPercent}%` : "..."}
          </p>
          <div className="h-1.5 rounded-full bg-blue-900/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {state === "installing" && (
        <div>
          <p className="text-sm text-blue-200">
            Installing update... Follow the system prompts.
          </p>
          <p className="text-xs text-blue-300/60 mt-1">
            If installation fails, you may need to uninstall the app first (one-time only).
          </p>
        </div>
      )}

      {state === "signature_error" && (
        <div>
          <p className="text-sm text-amber-200">
            Installation failed — likely due to a signing key change.
          </p>
          <p className="text-xs text-amber-300/80 mt-1">
            Please uninstall Enso, then tap Update below to reinstall. Your data is stored on the server and won't be lost.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleDismiss}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={handleDownload}
              className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-500 transition-colors font-medium"
            >
              Update
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-red-300 flex-1 min-w-0 truncate">
            Update failed: {errorMsg}
          </p>
          <button
            onClick={handleDownload}
            className="text-xs px-3 py-1 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

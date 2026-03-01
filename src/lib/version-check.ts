import { isNative } from "./platform";
import { getActiveBackend } from "./connection";
import { AppUpdater, type AppVersionInfo, type DownloadProgress } from "./app-updater";

export interface UpdateInfo {
  available: boolean;
  currentVersionCode: number;
  currentVersionName: string;
  serverVersionCode: number;
  serverVersionName: string;
  apkSizeBytes: number;
}

let cachedLocalVersion: AppVersionInfo | null = null;

/** Get the installed app's version (cached after first call). */
async function getLocalVersion(): Promise<AppVersionInfo> {
  if (cachedLocalVersion) return cachedLocalVersion;
  if (!isNative) return { versionCode: 0, versionName: "web" };
  const info = await AppUpdater.getVersionInfo();
  cachedLocalVersion = info;
  return info;
}

/** Check the connected backend for a newer version. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const local = await getLocalVersion();
  const backend = getActiveBackend();

  if (!backend?.url) {
    return {
      available: false,
      currentVersionCode: local.versionCode,
      currentVersionName: local.versionName,
      serverVersionCode: 0,
      serverVersionName: "",
      apkSizeBytes: 0,
    };
  }

  const res = await fetch(`${backend.url}/api/version`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Version check failed: ${res.status}`);

  const data = await res.json();

  return {
    available: data.apkAvailable && data.versionCode > local.versionCode,
    currentVersionCode: local.versionCode,
    currentVersionName: local.versionName,
    serverVersionCode: data.versionCode,
    serverVersionName: data.versionName,
    apkSizeBytes: data.apkSizeBytes,
  };
}

/** Download and install the APK from the connected backend. */
export async function downloadAndInstall(
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  const backend = getActiveBackend();
  if (!backend?.url) throw new Error("No backend connected");

  const apkUrl = `${backend.url}/api/apk${backend.token ? `?token=${encodeURIComponent(backend.token)}` : ""}`;

  let listener: { remove: () => void } | null = null;
  if (onProgress) {
    listener = await AppUpdater.addListener("downloadProgress", onProgress);
  }

  try {
    await AppUpdater.installApk({ url: apkUrl, token: backend.token });
  } finally {
    listener?.remove();
  }
}

/** Interval ID for periodic checks. */
let checkIntervalId: ReturnType<typeof setInterval> | null = null;

/** Start periodic version checks (every 30 minutes). */
export function startPeriodicChecks(onUpdate: (info: UpdateInfo) => void): void {
  if (!isNative) return;
  if (checkIntervalId) return;

  // Initial check after 10 seconds (let the app fully initialize)
  setTimeout(async () => {
    try {
      const info = await checkForUpdate();
      if (info.available) onUpdate(info);
    } catch { /* silent */ }
  }, 10_000);

  // Then every 30 minutes
  checkIntervalId = setInterval(async () => {
    try {
      const info = await checkForUpdate();
      if (info.available) onUpdate(info);
    } catch { /* silent */ }
  }, 30 * 60 * 1000);
}

export function stopPeriodicChecks(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
}

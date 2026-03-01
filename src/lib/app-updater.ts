import { registerPlugin } from "@capacitor/core";

export interface AppVersionInfo {
  versionCode: number;
  versionName: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

interface AppUpdaterPlugin {
  getVersionInfo(): Promise<AppVersionInfo>;
  installApk(options: { url: string; token?: string }): Promise<void>;
  addListener(
    event: "downloadProgress",
    callback: (data: DownloadProgress) => void,
  ): Promise<{ remove: () => void }>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");

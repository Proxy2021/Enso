import { isNative } from "./platform";

/**
 * Initialize Capacitor native plugins (status bar, back button).
 * No-op on web — safe to call unconditionally.
 */
export async function initNativePlugins(): Promise<void> {
  if (!isNative) return;

  const { StatusBar, Style } = await import("@capacitor/status-bar");
  const { App: CapApp } = await import("@capacitor/app");

  // Dark status bar to match Enso's dark theme
  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: "#030712" });

  // Handle Android back button — minimize instead of closing
  CapApp.addListener("backButton", ({ canGoBack }) => {
    if (!canGoBack) {
      CapApp.minimizeApp();
    }
  });
}

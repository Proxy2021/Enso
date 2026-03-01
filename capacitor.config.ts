import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.enso.app",
  appName: "Enso",
  webDir: "dist",
  server: {
    // Allow connections to arbitrary remote backends
    allowNavigation: ["*"],
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#030712",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#030712",
      showSpinner: false,
    },
  },
};

export default config;

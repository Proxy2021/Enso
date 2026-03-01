import { Capacitor } from "@capacitor/core";

/** True when running inside a Capacitor native shell (Android/iOS). */
export const isNative = Capacitor.isNativePlatform();

/** True when running in a browser (dev mode or PWA). */
export const isWeb = !isNative;

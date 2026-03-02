import { registerPlugin } from "@capacitor/core";
import { isNative } from "./platform";

interface SharePlugin {
  share(options: { title?: string; text?: string; url?: string }): Promise<void>;
}

const Share = registerPlugin<SharePlugin>("Share");

/**
 * Open the Android system share sheet with a link and description.
 * Falls back silently on non-native platforms.
 */
export async function nativeShare(options: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<void> {
  if (!isNative) return;
  await Share.share(options);
}

export { isNative };

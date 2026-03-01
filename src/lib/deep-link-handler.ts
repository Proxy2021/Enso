import { App as CapApp } from "@capacitor/app";
import { isNative } from "./platform";
import { addBackend, setActiveBackend, loadBackends } from "./connection";
import type { BackendConfig } from "./connection";

/**
 * Initialize a listener for `enso://connect` deep links.
 * When the user scans a QR code with their phone camera, the OS opens this URL
 * and Capacitor fires the `appUrlOpen` event.
 *
 * Expected format:
 *   enso://connect?backend=http://192.168.1.5:3001&token=abc-123&name=My+PC
 */
export function initDeepLinkListener(
  connectFn: (config: BackendConfig) => void,
  closeWizardFn?: () => void,
): void {
  if (!isNative) return;

  CapApp.addListener("appUrlOpen", (event) => {
    try {
      const url = new URL(event.url);
      if (url.protocol !== "enso:" || url.hostname !== "connect") return;

      const backend = url.searchParams.get("backend");
      const token = url.searchParams.get("token") ?? "";
      const name = url.searchParams.get("name") ?? "";

      if (!backend) return;

      // Check if this backend already exists (by URL)
      const existing = loadBackends().find((b) => b.url === backend);
      if (existing) {
        // Update token if different, then connect
        setActiveBackend(existing.id);
        connectFn({ ...existing, token: token || existing.token });
      } else {
        // Create new backend entry
        const fallbackName = name || new URL(backend).hostname;
        const config = addBackend({
          name: fallbackName,
          url: backend,
          token,
        });
        setActiveBackend(config.id);
        connectFn(config);
      }

      // Close the setup wizard if it's open
      closeWizardFn?.();
    } catch {
      // Malformed URL — ignore silently
    }
  });
}

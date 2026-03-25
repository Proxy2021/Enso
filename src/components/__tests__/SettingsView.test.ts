import { describe, it, expect } from "vitest";

/**
 * Tests for the connection status display logic in SettingsView.
 * Bug B1: The label used `active.name` (backend config) instead of
 * connectionState, causing "Not connected" to show when connected in
 * same-origin mode (where getActiveBackend() returns null).
 *
 * Fixed logic: state === "connected" ? (active?.name || "Enso Server") : "Not connected"
 */

type ConnectionState = "connecting" | "connected" | "disconnected";

interface BackendConfig {
  name: string;
}

/** Extracted display logic from SettingsView.tsx:66 (post-fix) */
function connectionLabel(state: ConnectionState, active: BackendConfig | null): string {
  return state === "connected" ? (active?.name || "Enso Server") : "Not connected";
}

/** Extracted dot color logic from SettingsView.tsx:64 */
function connectionDotClass(state: ConnectionState): string {
  if (state === "connected") return "bg-emerald-400";
  if (state === "connecting") return "bg-amber-400 animate-pulse";
  return "bg-red-400";
}

describe("SettingsView: connection status display", () => {
  describe("connectionLabel", () => {
    it("shows 'Enso Server' when connected with no backend config (same-origin)", () => {
      expect(connectionLabel("connected", null)).toBe("Enso Server");
    });

    it("shows backend name when connected with backend config", () => {
      expect(connectionLabel("connected", { name: "My Server" })).toBe("My Server");
    });

    it("shows 'Not connected' when disconnected regardless of backend config", () => {
      expect(connectionLabel("disconnected", null)).toBe("Not connected");
      expect(connectionLabel("disconnected", { name: "My Server" })).toBe("Not connected");
    });

    it("shows 'Not connected' when connecting regardless of backend config", () => {
      expect(connectionLabel("connecting", null)).toBe("Not connected");
      expect(connectionLabel("connecting", { name: "My Server" })).toBe("Not connected");
    });
  });

  describe("connectionDotClass", () => {
    it("shows green dot when connected", () => {
      expect(connectionDotClass("connected")).toBe("bg-emerald-400");
    });

    it("shows amber pulsing dot when connecting", () => {
      expect(connectionDotClass("connecting")).toContain("bg-amber-400");
      expect(connectionDotClass("connecting")).toContain("animate-pulse");
    });

    it("shows red dot when disconnected", () => {
      expect(connectionDotClass("disconnected")).toBe("bg-red-400");
    });
  });
});

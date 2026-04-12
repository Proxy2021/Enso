// ── Active client tracking (per-request) ──
// Set before entering the agent pipeline, so tools can access the current client.

let _activeClientId: string | null = null;

export function setActiveClientId(id: string | null): void {
  _activeClientId = id;
}

export function getActiveClientId(): string | null {
  return _activeClientId;
}

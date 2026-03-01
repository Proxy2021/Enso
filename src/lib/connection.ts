/**
 * Connection manager — handles multi-backend configuration, URL resolution,
 * and token authentication for remote Enso connections.
 *
 * When `config.url` is empty → same-origin mode (backward compatible with Vite proxy).
 * When set → all URLs become absolute with token auth.
 */

export interface BackendConfig {
  id: string;
  name: string;
  url: string;   // e.g. "https://my-server:3001" or "" for same-origin
  token: string;
  lastConnected?: number;
}

const STORAGE_KEY = "enso_backends";
const ACTIVE_KEY = "enso_active_backend";

// ── localStorage CRUD ─────────────────────────────────────────────────────

export function loadBackends(): BackendConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBackends(backends: BackendConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backends));
}

export function addBackend(config: Omit<BackendConfig, "id">): BackendConfig {
  const backends = loadBackends();
  const entry: BackendConfig = { ...config, id: crypto.randomUUID() };
  backends.push(entry);
  saveBackends(backends);
  return entry;
}

export function removeBackend(id: string): void {
  const backends = loadBackends().filter((b) => b.id !== id);
  saveBackends(backends);
  if (getActiveBackendId() === id) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function updateBackend(id: string, updates: Partial<Omit<BackendConfig, "id">>): void {
  const backends = loadBackends();
  const idx = backends.findIndex((b) => b.id === id);
  if (idx >= 0) {
    backends[idx] = { ...backends[idx], ...updates };
    saveBackends(backends);
  }
}

// ── Active backend ────────────────────────────────────────────────────────

function getActiveBackendId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function getActiveBackend(): BackendConfig | null {
  const id = getActiveBackendId();
  if (!id) return null;
  return loadBackends().find((b) => b.id === id) ?? null;
}

export function setActiveBackend(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
  // Update lastConnected timestamp
  updateBackend(id, { lastConnected: Date.now() });
}

export function clearActiveBackend(): void {
  localStorage.removeItem(ACTIVE_KEY);
}

// ── URL builders ──────────────────────────────────────────────────────────

/** Build the WebSocket URL for a backend config. */
export function buildWsUrl(config: BackendConfig | null): string {
  if (!config || !config.url) {
    // Same-origin mode
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }
  // Remote mode: convert http(s) to ws(s)
  const wsBase = config.url.replace(/^http/, "ws");
  const url = new URL("/ws", wsBase);
  if (config.token) url.searchParams.set("token", config.token);
  return url.toString();
}

/** Get the base URL for HTTP API calls. Empty string = same-origin. */
export function getBackendBaseUrl(): string {
  const config = getActiveBackend();
  return config?.url || "";
}

/** Build auth headers for fetch calls. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const config = getActiveBackend();
  const headers: Record<string, string> = { ...extra };
  if (config?.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }
  return headers;
}

/**
 * Resolve a relative media URL to an absolute one for remote backends.
 * Passthrough for same-origin mode or already-absolute URLs.
 */
export function resolveMediaUrl(url: string): string {
  if (!url) return url;
  // Already absolute or blob
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  const config = getActiveBackend();
  if (!config?.url) return url; // same-origin — relative URLs work via Vite proxy

  // Remote mode — prepend backend URL and append token
  const resolved = new URL(url, config.url);
  if (config.token) resolved.searchParams.set("token", config.token);
  return resolved.toString();
}

// ── Deep-link support ─────────────────────────────────────────────────────

/** Parse ?backend=...&token=... from URL params and create/connect a backend. */
export function parseDeepLink(): BackendConfig | null {
  const params = new URLSearchParams(window.location.search);
  const backendUrl = params.get("backend");
  if (!backendUrl) return null;

  const token = params.get("token") ?? "";
  const name = new URL(backendUrl).hostname;

  // Check if we already have this backend saved
  const existing = loadBackends().find((b) => b.url === backendUrl);
  if (existing) {
    // Update token if different
    if (token && existing.token !== token) {
      updateBackend(existing.id, { token });
    }
    return { ...existing, token: token || existing.token };
  }

  // Create new backend entry
  return addBackend({ name, url: backendUrl, token });
}

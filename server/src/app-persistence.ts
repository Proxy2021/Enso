import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { PluginSpec, PluginToolDef } from "./tool-factory.js";
import type { ExecutorContext } from "./types.js";
import {
  registerAppTool,
  registerAppTemplate,
  registerToolTemplate,
  registerToolTemplateDataHint,
  registerDynamicAppPrefix,
  unregisterAppTool,
  unregisterAppTemplate,
  unregisterToolTemplate,
  unregisterToolTemplateDataHints,
  executeToolDirect,
  type ToolTemplate,
} from "./native-tools/registry.js";
import { registerApp, unregisterApp as unregisterAppFromCatalog } from "./app-catalog.js";
import { getDocCollection } from "./persistence.js";
import { logAction, logError } from "./action-log.js";
import { BRAVE_WEB_SEARCH, BRAVE_SEARCH_TIMEOUT_MS, ENSO_HOME } from "./config.js";

// ── Codebase Apps Directory ──

const PLUGIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Shipped apps directory — checked into git, ships with the project */
export const SHIPPED_APPS_DIR = path.join(PLUGIN_DIR, "apps");

// ── Auto-heal: Spec Tracking ──

/** In-memory map of loaded app specs, keyed by toolFamily. Used by auto-heal to look up sampleData. */
const loadedAppSpecs = new Map<string, PluginSpec>();

/** Track an app spec so auto-heal can look up sampleData and requiredDataKeys. */
export function trackAppSpec(spec: PluginSpec): void {
  loadedAppSpecs.set(spec.toolFamily, spec);
}

/** Find the PluginSpec that owns a given tool name (by prefix match). */
export function getAppSpecForTool(toolName: string): PluginSpec | undefined {
  for (const spec of loadedAppSpecs.values()) {
    if (toolName.startsWith(spec.toolPrefix)) return spec;
  }
  return undefined;
}

/** Persist a fixed executor body to disk (user apps first, then codebase). */
export function persistExecutorFix(toolFamily: string, suffix: string, body: string): void {
  for (const dir of [appsDir(), SHIPPED_APPS_DIR]) {
    const execPath = path.join(dir, toolFamily, "executors", `${suffix}.js`);
    if (fs.existsSync(execPath)) {
      fs.writeFileSync(execPath, body, "utf-8");
      logAction({ ts: Date.now(), type: "action", category: "persistence", message: `persisted executor fix for ${toolFamily}/${suffix} at ${execPath}` });
      return;
    }
  }
  logAction({ ts: Date.now(), type: "action", category: "persistence", message: `could not find executor file on disk for ${toolFamily}/${suffix} — fix is in-memory only` });
}

/** Persist a fixed template JSX to disk (user apps first, then codebase). */
export function persistTemplateFix(toolFamily: string, templateJSX: string): void {
  for (const dir of [appsDir(), SHIPPED_APPS_DIR]) {
    const templatePath = path.join(dir, toolFamily, "template.jsx");
    if (fs.existsSync(templatePath)) {
      fs.writeFileSync(templatePath, templateJSX, "utf-8");
      logAction({ ts: Date.now(), type: "action", category: "persistence", message: `persisted template fix for ${toolFamily} at ${templatePath}` });
      return;
    }
  }
  logAction({ ts: Date.now(), type: "action", category: "persistence", message: `could not find template file on disk for ${toolFamily} — fix is in-memory only` });
}

// ── Types ──

export interface SavedApp {
  spec: PluginSpec;
  executors: Map<string, string>; // suffix → function body
  templateJSX: string;
  skillMd: string;
  createdAt: number;
}

export interface LoadedApp {
  spec: PluginSpec;
  executors: Map<string, string>; // suffix → function body
  templateJSX: string;
}

interface AppManifest {
  version: 1;
  spec: PluginSpec;
  createdAt: number;
}

// ── Executor Context ──

const EXECUTOR_CTX_TIMEOUT_MS = 60_000;
const EXECUTOR_CTX_EXTENDED_TIMEOUT_MS = 180_000; // For heavy network tools (YouTube feed, data source scans)
const EXECUTOR_CTX_MAX_DEPTH = 3;
const EXECUTOR_FETCH_MAX_BYTES = 512 * 1024; // 512KB
const STORE_MAX_SIZE = 1024 * 1024; // 1MB per family store

// ── Shipped App Tracking ──

/** Tracks which apps have a version in the shipped apps directory */
const shippedAppIds = new Set<string>();

/** Check whether an app has a shipped version (in server/apps/) */
export function isShippedApp(appId: string): boolean {
  return shippedAppIds.has(appId);
}

// ── Key-Value Store ──

const storeCache = new Map<string, Record<string, unknown>>();

function loadStoreForFamily(family: string): Record<string, unknown> {
  if (storeCache.has(family)) return storeCache.get(family)!;
  const storePath = path.join(ENSO_HOME, "apps", family, "store.json");
  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      storeCache.set(family, data);
      return data;
    }
  } catch {
    // Corrupt store — start fresh
  }
  const empty: Record<string, unknown> = {};
  storeCache.set(family, empty);
  return empty;
}

function saveStoreForFamily(family: string, data: Record<string, unknown>): void {
  const storePath = path.join(ENSO_HOME, "apps", family, "store.json");
  const json = JSON.stringify(data, null, 2);
  if (json.length > STORE_MAX_SIZE) {
    throw new Error(`Store for "${family}" exceeds ${STORE_MAX_SIZE} bytes`);
  }
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, json);
}

/**
 * Build an ExecutorContext that bridges generated app executors to real
 * Enso capabilities. Each call is logged, timed, and guarded with a timeout.
 * Recursive depth is tracked only for callTool (the only op that can cause
 * executor-to-executor recursion). Leaf I/O ops (fetch/search/ask) are
 * deliberately NOT depth-tracked so executors can call them in parallel.
 */
export function buildExecutorContext(toolFamily?: string, toolSuffix?: string, apiKey?: string): ExecutorContext {
  let callDepth = 0;
  const tag = toolFamily && toolSuffix ? `${toolFamily}/${toolSuffix}` : "executor";

  // trackDepth=true only for callTool (which can recursively invoke other executors).
  // Leaf I/O ops (fetch, search, ask, fs) run in parallel and must NOT share the depth
  // counter — they are concurrent leaf calls, not recursive executor invocations.
  async function withTimeout<T>(label: string, fn: () => Promise<T>, trackDepth = false, timeoutMs?: number): Promise<T> {
    const effectiveTimeout = timeoutMs ?? EXECUTOR_CTX_TIMEOUT_MS;
    const t0 = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), effectiveTimeout);

    try {
      if (trackDepth) {
        if (callDepth >= EXECUTOR_CTX_MAX_DEPTH) {
          throw new Error(`ctx call depth exceeded (max ${EXECUTOR_CTX_MAX_DEPTH})`);
        }
        callDepth++;
      }
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          ac.signal.addEventListener("abort", () => reject(new Error(`ctx.${label} timed out after ${effectiveTimeout}ms`)));
        }),
      ]);
      const cat = label.startsWith("search(") ? "search-api" : label.startsWith("fetch(") ? "fetch" : label.startsWith("ask(") ? "llm" : "persistence";
      logAction({ ts: Date.now(), type: "action", category: cat, message: `executor-ctx ${tag} → ${label} [${Date.now() - t0}ms]` });
      return result;
    } catch (err) {
      const errCat = label.startsWith("search(") ? "search-api" : label.startsWith("fetch(") ? "fetch" : label.startsWith("ask(") ? "llm" : "persistence";
      logError(errCat, `executor-ctx ${tag} → ${label} FAILED [${Date.now() - t0}ms]`, err);
      throw err;
    } finally {
      if (trackDepth) callDepth--;
      clearTimeout(timer);
    }
  }

  return {
    async callTool(toolName: string, params: Record<string, unknown>, options?: { timeoutMs?: number }) {
      return withTimeout(`callTool("${toolName}")`, async () => {
        const result = await executeToolDirect(toolName, params);
        return { success: result.success, data: result.data, error: result.error ?? undefined };
      }, true, options?.timeoutMs); // trackDepth=true: callTool can recursively invoke other executors
    },

    async listDir(dirPath: string) {
      return withTimeout(`listDir("${dirPath}")`, async () => {
        const result = await executeToolDirect("enso_fs_list_directory", { path: dirPath });
        return { success: result.success, data: result.data, error: result.error ?? undefined };
      });
    },

    async readFile(filePath: string) {
      return withTimeout(`readFile("${filePath}")`, async () => {
        const result = await executeToolDirect("enso_fs_read_text_file", { path: filePath });
        return { success: result.success, data: result.data, error: result.error ?? undefined };
      });
    },

    async searchFiles(rootPath: string, name: string) {
      return withTimeout(`searchFiles("${rootPath}", "${name}")`, async () => {
        const result = await executeToolDirect("enso_fs_search_paths", { root_path: rootPath, name });
        return { success: result.success, data: result.data, error: result.error ?? undefined };
      });
    },

    async fetch(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }) {
      const fetchTimeout = options?.timeoutMs ?? EXECUTOR_CTX_TIMEOUT_MS;
      return withTimeout(`fetch("${url}")`, async () => {
        // Enforce HTTPS only (allow localhost for internal API calls)
        if (!url.startsWith("https://") && !url.startsWith("http://localhost") && !url.startsWith("http://127.0.0.1")) {
          return { ok: false, status: 0, data: "Only HTTPS URLs are allowed" };
        }

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), fetchTimeout);
        try {
          const resp = await globalThis.fetch(url, {
            method: options?.method ?? "GET",
            headers: options?.headers,
            body: options?.body,
            signal: ac.signal,
          });

          // Read with size limit
          const buf = await resp.arrayBuffer();
          if (buf.byteLength > EXECUTOR_FETCH_MAX_BYTES) {
            return { ok: false, status: resp.status, data: `Response too large (${buf.byteLength} bytes, max ${EXECUTOR_FETCH_MAX_BYTES})` };
          }

          const text = new TextDecoder().decode(buf);
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }

          return { ok: resp.ok, status: resp.status, data };
        } finally {
          clearTimeout(timer);
        }
      }, false, fetchTimeout);
    },

    async search(query: string, options?: { count?: number; country?: string }) {
      const sanitized = query
        .replace(/[:\(\)\[\]"']/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      return withTimeout(`search("${sanitized}")`, async () => {
        let apiKey = process.env.BRAVE_API_KEY;
        if (!apiKey) {
          try {
            const keysPath = path.join(ENSO_HOME, "api-keys.json");
            const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as Record<string, string>;
            if (keys.brave) { process.env.BRAVE_API_KEY = keys.brave; apiKey = keys.brave; }
          } catch { /* ignore */ }
        }
        if (!apiKey) {
          logAction({ ts: Date.now(), type: "action", category: "search-api", message: `executor-ctx ${tag} → search: no BRAVE_API_KEY, returning empty` });
          return { ok: false as const, results: [] };
        }

        const count = Math.min(Math.max(options?.count ?? 3, 1), 10);
        const searchUrl = new URL(BRAVE_WEB_SEARCH);
        searchUrl.searchParams.set("q", sanitized);
        searchUrl.searchParams.set("count", String(count));
        if (options?.country) searchUrl.searchParams.set("country", options.country);

        let lastFetchErr: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), BRAVE_SEARCH_TIMEOUT_MS);
          try {
            const resp = await globalThis.fetch(searchUrl.toString(), {
              method: "GET",
              headers: {
                Accept: "application/json",
                "X-Subscription-Token": apiKey,
              },
              signal: ac.signal,
            });

            if (!resp.ok) {
              return { ok: false as const, results: [] };
            }

            const data = await resp.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
            const rawResults = data?.web?.results ?? [];
            const results = rawResults.slice(0, count).map((r) => ({
              title: r.title ?? "",
              url: r.url ?? "",
              description: r.description ?? "",
            }));

            return { ok: true as const, results };
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              logAction({ ts: Date.now(), type: "action", category: "search-api", message: `executor-ctx ${tag} → search timeout for "${sanitized.slice(0, 50)}"` });
              return { ok: false as const, results: [] };
            }
            lastFetchErr = err;
          } finally {
            clearTimeout(timer);
          }
        }
        throw lastFetchErr;
      });
    },

    async ask(prompt: string, _options?: { maxTokens?: number }) {
      return withTimeout(`ask("${prompt.slice(0, 40)}...")`, async () => {
        if (!apiKey) {
          return { ok: false as const, text: "No LLM API key available" };
        }
        try {
          const { llm } = await import("./llm.js");
          const text = await llm({ prompt, tier: "fast", apiKey });
          return { ok: true as const, text };
        } catch (err) {
          return { ok: false as const, text: err instanceof Error ? err.message : String(err) };
        }
      });
    },

    store: {
      async get(key: string): Promise<unknown | null> {
        if (!toolFamily) return null;
        const data = loadStoreForFamily(toolFamily);
        return key in data ? data[key] : null;
      },
      async set(key: string, value: unknown): Promise<void> {
        if (!toolFamily) throw new Error("No tool family for store");
        const data = loadStoreForFamily(toolFamily);
        data[key] = value;
        saveStoreForFamily(toolFamily, data);
      },
      async delete(key: string): Promise<boolean> {
        if (!toolFamily) return false;
        const data = loadStoreForFamily(toolFamily);
        if (!(key in data)) return false;
        delete data[key];
        saveStoreForFamily(toolFamily, data);
        return true;
      },
      docs<T = unknown>(collection: string, opts?: { maxEntries?: number }) {
        if (!toolFamily) throw new Error("No tool family for docs");
        const coll = getDocCollection<T>(toolFamily, collection, opts);
        return {
          async list() { return coll.list(); },
          async save(id: string, data: T, meta?: Record<string, string | number | boolean>) {
            coll.save(id, data, meta ?? ({} as Record<string, string | number | boolean>));
          },
          async load(id: string) { return coll.load(id); },
          async has(id: string) { return coll.has(id); },
          async remove(id: string) { return coll.remove(id); },
          async clear() { coll.clear(); },
          async count() { return coll.count(); },
        };
      },
      interactions() {
        if (!toolFamily) throw new Error("No tool family for interactions");
        const family = toolFamily;
        return {
          async list(count?: number) {
            const { getRecentInteractions } = await import("./interaction-tracker.js");
            return getRecentInteractions(family, count ?? 20);
          },
          async count() {
            const coll = getDocCollection(family, "interactions", { maxEntries: 200 });
            return coll.count();
          },
        };
      },
    },

    uuid(): string {
      return crypto.randomUUID();
    },

    hash(text: string, algorithm?: string): string {
      const algo = algorithm ?? "sha256";
      return crypto.createHash(algo).update(text).digest("hex");
    },

    async sleep(ms: number): Promise<void> {
      const capped = Math.min(Math.max(0, ms), 10_000);
      return new Promise((resolve) => setTimeout(resolve, capped));
    },

    log(message: string): void {
      logAction({ ts: Date.now(), type: "action", category: `executor:${toolFamily ?? "unknown"}`, message });
    },

    formatDate(date?: string | number, format?: string): string {
      const d = date ? new Date(date) : new Date();
      if (isNaN(d.getTime())) return "Invalid Date";
      switch (format) {
        case "iso": return d.toISOString();
        case "date": return d.toISOString().slice(0, 10);
        case "time": return d.toTimeString().slice(0, 8);
        case "relative": {
          const diff = Date.now() - d.getTime();
          const secs = Math.floor(Math.abs(diff) / 1000);
          if (secs < 60) return diff >= 0 ? "just now" : "in a moment";
          const mins = Math.floor(secs / 60);
          if (mins < 60) return diff >= 0 ? `${mins}m ago` : `in ${mins}m`;
          const hours = Math.floor(mins / 60);
          if (hours < 24) return diff >= 0 ? `${hours}h ago` : `in ${hours}h`;
          const days = Math.floor(hours / 24);
          return diff >= 0 ? `${days}d ago` : `in ${days}d`;
        }
        default: return d.toLocaleString();
      }
    },

    now(): number {
      return Date.now();
    },
  };
}

// ── Paths ──

function resolveBasePath(basePath?: string): string {
  return basePath ?? ENSO_HOME;
}

function appsDir(basePath?: string): string {
  return path.join(resolveBasePath(basePath), "apps");
}

function skillsDir(basePath?: string): string {
  return path.join(resolveBasePath(basePath), "skills");
}

// ── Save ──

export function saveApp(app: SavedApp, basePath?: string): void {
  const appDir = path.join(appsDir(basePath), app.spec.toolFamily);
  const execDir = path.join(appDir, "executors");
  fs.mkdirSync(execDir, { recursive: true });

  // Write app manifest
  const manifest: AppManifest = {
    version: 1,
    spec: app.spec,
    createdAt: app.createdAt,
  };
  fs.writeFileSync(path.join(appDir, "app.json"), JSON.stringify(manifest, null, 2));

  // Write executor bodies
  for (const [suffix, body] of app.executors) {
    fs.writeFileSync(path.join(execDir, `${suffix}.js`), body);
  }

  // Write template
  fs.writeFileSync(path.join(appDir, "template.jsx"), app.templateJSX);

  // Write SKILL.md to the skills directory
  const skillDir = path.join(skillsDir(basePath), app.spec.toolFamily);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), app.skillMd);

  logAction({ ts: Date.now(), type: "action", category: "persistence", message: `saved app "${app.spec.toolFamily}" (${app.executors.size} tools)` });
}

// ── Load ──

/**
 * Scan a directory for app subdirectories and load them.
 * Each subdirectory is expected to contain: app.json, template.jsx, executors/*.js
 */
export function loadAppsFromDir(dir: string): LoadedApp[] {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const apps: LoadedApp[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const appDir = path.join(dir, entry.name);
      const manifestPath = path.join(appDir, "app.json");
      if (!fs.existsSync(manifestPath)) continue; // skip non-app directories
      const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
      const manifest: AppManifest = JSON.parse(manifestRaw);

      if (!manifest.spec?.toolFamily || !Array.isArray(manifest.spec.tools)) {
        logAction({ ts: Date.now(), type: "action", category: "persistence", message: `skipping corrupt app "${entry.name}": invalid manifest` });
        continue;
      }

      const templateJSX = fs.readFileSync(path.join(appDir, "template.jsx"), "utf-8");

      const executors = new Map<string, string>();
      const execDir = path.join(appDir, "executors");
      if (fs.existsSync(execDir)) {
        for (const file of fs.readdirSync(execDir)) {
          if (file.endsWith(".js")) {
            const suffix = file.replace(/\.js$/, "");
            executors.set(suffix, fs.readFileSync(path.join(execDir, file), "utf-8"));
          }
        }
      }

      apps.push({ spec: manifest.spec, executors, templateJSX });
    } catch (err) {
      logError("persistence", `Failed to load app "${entry.name}"`, err);
    }
  }

  return apps;
}

/** Load apps from the user directory (~/.enso/apps/) */
export function loadApps(basePath?: string): LoadedApp[] {
  return loadAppsFromDir(appsDir(basePath));
}

/**
 * Load apps from both codebase (server/apps/) and user (~/.enso/apps/)
 * directories. User apps override codebase apps with the same toolFamily (for dev iteration).
 * Updates the shippedAppIds tracking set.
 */
export function loadAllApps(basePath?: string): LoadedApp[] {
  const codebaseApps = loadAppsFromDir(SHIPPED_APPS_DIR);
  const userApps = loadApps(basePath);

  // Reset codebase tracking
  shippedAppIds.clear();

  // Build merged map: codebase first, user overrides
  const merged = new Map<string, LoadedApp>();
  for (const app of codebaseApps) {
    merged.set(app.spec.toolFamily, app);
    shippedAppIds.add(app.spec.toolFamily);
  }
  for (const app of userApps) {
    if (merged.has(app.spec.toolFamily)) {
      logAction({ ts: Date.now(), type: "action", category: "persistence", message: `user app "${app.spec.toolFamily}" overrides codebase version` });
    }
    merged.set(app.spec.toolFamily, app);
  }

  return Array.from(merged.values());
}

// ── Register ──

// AsyncFunction constructor: supports `await` in executor bodies
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as typeof Function;

// Provide CJS require() for executor bodies that use require("os"), require("fs"), etc.
import { createRequire } from "node:module";
const executorRequire = createRequire(import.meta.url);

export function registerLoadedApp(app: LoadedApp): void {
  const { spec } = app;
  trackAppSpec(spec);
  const registeredToolNames: string[] = [];
  const actionSuffixes: string[] = [];

  for (const toolDef of spec.tools) {
    const body = app.executors.get(toolDef.suffix);
    if (!body) continue;

    const toolName = `${spec.toolPrefix}${toolDef.suffix}`;
    // Executor receives 4 args: callId, params, ctx, require — uses AsyncFunction to support await
    // `require` is injected so executor bodies can use require("os"), require("fs"), etc.
    const executeFn = new AsyncFunction("callId", "params", "ctx", "require", body) as (
      callId: string,
      params: Record<string, unknown>,
      ctx: ExecutorContext,
      require: NodeRequire,
    ) => Promise<{ content: Array<{ type: string; text?: string }> }>;

    registerAppTool({
      name: toolName,
      description: toolDef.description,
      parameters: toolDef.parameters,
      body,
      execute: async (callId: string, toolParams: Record<string, unknown>) => {
        // Lazy API key resolution — apps are loaded at startup before any account is active
        const { getActiveAccount } = await import("./server.js");
        const activeApiKey = getActiveAccount()?.geminiApiKey;
        const ctx = buildExecutorContext(spec.toolFamily, toolDef.suffix, activeApiKey);
        try {
          const result = await executeFn(callId, toolParams, ctx, executorRequire);
          return result;
        } catch (err) {
          // Record error interaction for Living Apps contextual debugging
          const { recordAppInteraction } = await import("./interaction-tracker.js");
          recordAppInteraction(spec.toolFamily, {
            type: "error",
            toolName,
            params: toolParams,
            error: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
          throw err;
        }
      },
    });

    registeredToolNames.push(toolName);
    actionSuffixes.push(toolDef.suffix);
  }

  if (registeredToolNames.length === 0) return;

  // Register template metadata
  const template: ToolTemplate = {
    toolFamily: spec.toolFamily,
    signatureId: spec.signatureId,
    templateId: `generated-${spec.signatureId}-v1`,
    supportedActions: actionSuffixes.map((s) => `${spec.toolPrefix}${s}`),
    coverageStatus: "covered",
  };
  registerToolTemplate(template);

  // Register prefix so detectToolTemplateForToolName resolves dynamic app
  // tools before shorter built-in prefixes (e.g. enso_media_gallery_ before enso_media_)
  registerDynamicAppPrefix(spec.toolPrefix, spec.toolFamily, spec.signatureId);

  // Register data hint
  const primaryDef = spec.tools.find((t) => t.isPrimary) ?? spec.tools[0];
  if (primaryDef.requiredDataKeys?.length) {
    registerToolTemplateDataHint({
      toolFamily: spec.toolFamily,
      signatureId: spec.signatureId,
      requiredKeys: primaryDef.requiredDataKeys,
    });
  }

  // Register template JSX code
  registerAppTemplate(spec.signatureId, app.templateJSX);

  // Register in app catalog
  const primaryToolName = `${spec.toolPrefix}${primaryDef.suffix}`;
  registerApp({
    appId: spec.toolFamily,
    primaryTool: primaryToolName,
    actions: actionSuffixes,
    signatureId: spec.signatureId,
    description: spec.description,
  });

  logAction({ ts: Date.now(), type: "action", category: "persistence", message: `registered app "${spec.toolFamily}" (${registeredToolNames.length} tools: ${registeredToolNames.join(", ")})` });
}

// ── Startup convenience ──

/**
 * Load and register apps from both codebase (server/apps/) and user
 * (~/.enso/apps/) directories. User apps override codebase versions.
 */
export function loadAndRegisterApps(basePath?: string): number {
  const apps = loadAllApps(basePath);
  for (const app of apps) {
    try {
      const source = shippedAppIds.has(app.spec.toolFamily) ? "shipped" : "user";
      registerLoadedApp(app);
      logAction({ ts: Date.now(), type: "action", category: "persistence", message: `loaded ${source} app "${app.spec.toolFamily}"` });
    } catch (err) {
      logError("persistence", `Failed to register app "${app.spec.toolFamily}"`, err);
    }
  }

  // Ensure SKILL.md exists for each loaded app (idempotent — won't overwrite existing)
  for (const app of apps) {
    try {
      ensureSkillMd(app, basePath);
    } catch (err) {
      logError("persistence", `Failed to ensure SKILL.md for "${app.spec.toolFamily}"`, err);
    }
  }

  return apps.length;
}

/**
 * Ensure a SKILL.md file exists for a loaded app, so the agent can
 * discover and invoke its tools. Idempotent — never overwrites existing files.
 *
 * - All apps: writes to ~/.enso/skills/<family>/SKILL.md (managed skills dir)
 * - Shipped apps: also writes to server/skills/<family>/SKILL.md (plugin-shipped)
 */
function ensureSkillMd(app: LoadedApp, basePath?: string): void {
  const family = app.spec.toolFamily;

  // 1. Ensure managed skill (~/.enso/skills/<family>/SKILL.md)
  const managedSkillDir = path.join(skillsDir(basePath), family);
  const managedSkillPath = path.join(managedSkillDir, "SKILL.md");
  if (!fs.existsSync(managedSkillPath)) {
    fs.mkdirSync(managedSkillDir, { recursive: true });
    fs.writeFileSync(managedSkillPath, generateSkillMd(app.spec));
    logAction({ ts: Date.now(), type: "action", category: "persistence", message: `generated SKILL.md for "${family}" at ${managedSkillDir}` });
  }

  // 2. For shipped apps, also ensure plugin-shipped skill exists
  if (shippedAppIds.has(family)) {
    const pluginSkillDir = path.join(PLUGIN_DIR, "skills", family);
    const pluginSkillPath = path.join(pluginSkillDir, "SKILL.md");
    if (!fs.existsSync(pluginSkillPath)) {
      fs.mkdirSync(pluginSkillDir, { recursive: true });
      fs.writeFileSync(pluginSkillPath, generateSkillMd(app.spec));
      logAction({ ts: Date.now(), type: "action", category: "persistence", message: `generated plugin SKILL.md for shipped app "${family}" (consider committing)` });
    }
  }
}

// ── Delete ──

export function deleteApp(toolFamily: string, basePath?: string): boolean {
  let removed = false;

  const appDir = path.join(appsDir(basePath), toolFamily);
  if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
    removed = true;
  }

  const skillDir = path.join(skillsDir(basePath), toolFamily);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  if (removed) {
    logAction({ ts: Date.now(), type: "action", category: "persistence", message: `deleted app "${toolFamily}"` });
  }
  return removed;
}

/**
 * Promote an app from the user directory (~/.enso/apps/<family>/)
 * to the shipped directory (server/apps/<family>/).
 * The user can then `git add` and `git commit` the result.
 */
export function promoteApp(toolFamily: string, basePath?: string): { success: boolean; path?: string; error?: string } {
  const sourceDir = path.join(appsDir(basePath), toolFamily);
  if (!fs.existsSync(sourceDir)) {
    return { success: false, error: `App "${toolFamily}" not found in user directory` };
  }

  const targetDir = path.join(SHIPPED_APPS_DIR, toolFamily);

  try {
    // Create target directory
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy app.json
    const appJsonPath = path.join(sourceDir, "app.json");
    if (fs.existsSync(appJsonPath)) {
      fs.copyFileSync(appJsonPath, path.join(targetDir, "app.json"));
    }

    // Copy template.jsx
    const templatePath = path.join(sourceDir, "template.jsx");
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, path.join(targetDir, "template.jsx"));
    }

    // Copy executors
    const sourceExecDir = path.join(sourceDir, "executors");
    if (fs.existsSync(sourceExecDir)) {
      const targetExecDir = path.join(targetDir, "executors");
      fs.mkdirSync(targetExecDir, { recursive: true });
      for (const file of fs.readdirSync(sourceExecDir)) {
        fs.copyFileSync(path.join(sourceExecDir, file), path.join(targetExecDir, file));
      }
    }

    // Copy/generate SKILL.md into plugin skills directory
    const pluginSkillDir = path.join(PLUGIN_DIR, "skills", toolFamily);
    fs.mkdirSync(pluginSkillDir, { recursive: true });

    // Prefer existing SKILL.md from user skills dir (may be hand-crafted or from build pipeline)
    const userSkillMd = path.join(skillsDir(basePath), toolFamily, "SKILL.md");
    if (fs.existsSync(userSkillMd)) {
      fs.copyFileSync(userSkillMd, path.join(pluginSkillDir, "SKILL.md"));
    } else {
      // Generate from spec
      const manifestPath = path.join(sourceDir, "app.json");
      if (fs.existsSync(manifestPath)) {
        const manifest: AppManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        fs.writeFileSync(path.join(pluginSkillDir, "SKILL.md"), generateSkillMd(manifest.spec));
      }
    }

    // Update tracking
    shippedAppIds.add(toolFamily);

    logAction({ ts: Date.now(), type: "action", category: "persistence", message: `promoted app "${toolFamily}" to shipped at ${targetDir}` });
    return { success: true, path: targetDir };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Unregister a loaded app from all in-memory registries.
 * This reverses everything `registerLoadedApp()` does.
 */
export function unregisterLoadedApp(spec: PluginSpec): void {
  // Remove generated tool executors
  for (const toolDef of spec.tools) {
    const toolName = `${spec.toolPrefix}${toolDef.suffix}`;
    unregisterAppTool(toolName);
  }

  // Remove template code
  unregisterAppTemplate(spec.signatureId);

  // Remove tool template (signature)
  unregisterToolTemplate(spec.toolFamily, spec.signatureId);

  // Remove data hints
  unregisterToolTemplateDataHints(spec.toolFamily);

  // Remove from app catalog
  unregisterAppFromCatalog(spec.toolFamily);

  logAction({ ts: Date.now(), type: "action", category: "persistence", message: `unregistered app "${spec.toolFamily}" from memory` });
}

/**
 * Delete ALL user-created apps — disk files + in-memory registries.
 * Shipped apps (in server/apps/) are NOT deleted — they are managed via git.
 * Returns the list of tool families that were deleted.
 */
export function deleteAllApps(basePath?: string): string[] {
  const apps = loadApps(basePath);
  const deleted: string[] = [];

  for (const app of apps) {
    try {
      // Unregister from memory
      unregisterLoadedApp(app.spec);
      // Delete from disk
      deleteApp(app.spec.toolFamily, basePath);
      deleted.push(app.spec.toolFamily);
    } catch (err) {
      logError("persistence", `Failed to delete app "${app.spec.toolFamily}"`, err);
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "persistence", message: `deleted all apps: ${deleted.length} removed (${deleted.join(", ") || "none"})` });
  return deleted;
}

// ── SKILL.md generation ──

/**
 * Generate a SKILL.md for an app.
 *
 * When `userProposal` is provided (from the auto-proposal flow), it becomes
 * the body of the SKILL.md — enhanced with YAML frontmatter and a precise
 * tool reference section showing actual tool names and parameter schemas.
 *
 * Without `userProposal`, the SKILL.md is generated entirely from the spec
 * (the original behavior).
 */
export function generateSkillMd(spec: PluginSpec, userProposal?: string): string {
  const lines: string[] = [];

  // YAML frontmatter (always from spec — it has the canonical names)
  lines.push("---");
  lines.push(`name: ${spec.toolFamily}`);
  lines.push(`description: "${spec.description.replace(/"/g, '\\"')}"`);
  lines.push("---");
  lines.push("");

  if (userProposal) {
    // Use the user's proposal as the body
    lines.push(userProposal);
    lines.push("");
    lines.push("## Tool Reference");
    lines.push("");

    // Append precise tool names + parameter schemas from the generated spec
    for (const tool of spec.tools) {
      const fullName = `${spec.toolPrefix}${tool.suffix}`;
      const tag = tool.isPrimary ? " (primary)" : "";
      lines.push(`### ${fullName}${tag}`);
      lines.push("");
      lines.push(tool.description);
      lines.push("");

      const props = (tool.parameters as { properties?: Record<string, unknown> }).properties;
      if (props && Object.keys(props).length > 0) {
        lines.push("Parameters:");
        for (const [key, schema] of Object.entries(props)) {
          const s = schema as { type?: string; description?: string };
          const desc = s.description ? `: ${s.description}` : "";
          lines.push(`- \`${key}\` (${s.type ?? "any"})${desc}`);
        }
        lines.push("");
      }
    }
  } else {
    // Fallback: generate entirely from spec (existing behavior)
    const title = spec.toolFamily
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    lines.push(`# ${title}`);
    lines.push("");
    lines.push(spec.description);
    lines.push("");
    lines.push("## Available Tools");
    lines.push("");

    for (const tool of spec.tools) {
      const fullName = `${spec.toolPrefix}${tool.suffix}`;
      const tag = tool.isPrimary ? " (primary)" : "";
      lines.push(`### ${fullName}${tag}`);
      lines.push("");
      lines.push(tool.description);
      lines.push("");

      const props = (tool.parameters as { properties?: Record<string, unknown> }).properties;
      if (props && Object.keys(props).length > 0) {
        lines.push("Parameters:");
        for (const [key, schema] of Object.entries(props)) {
          const s = schema as { type?: string; description?: string };
          const desc = s.description ? `: ${s.description}` : "";
          lines.push(`- \`${key}\` (${s.type ?? "any"})${desc}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Execute a tool executor body string directly (for REST API calls from Cortex tab).
 * Creates a minimal ExecutorContext and runs the executor.
 */
export async function executeToolBody(
  body: string,
  params: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const { getActiveAccount } = await import("./server.js");
  const activeApiKey = getActiveAccount()?.geminiApiKey;
  const ctx = buildExecutorContext("api", "run", activeApiKey);
  const executeFn = new AsyncFunction("callId", "params", "ctx", "require", body) as (
    callId: string,
    params: Record<string, unknown>,
    ctx: ExecutorContext,
    require: NodeRequire,
  ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  return await executeFn("api-run", params, ctx, executorRequire);
}

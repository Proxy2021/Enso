import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { PluginSpec, PluginToolDef } from "./tool-factory.js";
import type { ExecutorContext } from "./types.js";
import {
  registerGeneratedTool,
  registerGeneratedTemplateCode,
  registerToolTemplate,
  registerToolTemplateDataHint,
  unregisterGeneratedTool,
  unregisterGeneratedTemplateCode,
  unregisterToolTemplate,
  unregisterToolTemplateDataHints,
  executeToolDirect,
  type ToolTemplate,
} from "./native-tools/registry.js";
import { addCapability, removeCapability } from "./tool-families/catalog.js";
import { getDocCollection } from "./persistence.js";

// ── Codebase Apps Directory ──

const PLUGIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Codebase apps directory — checked into git, ships with the project */
export const CODEBASE_APPS_DIR = path.join(PLUGIN_DIR, "apps");

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
  for (const dir of [appsDir(), CODEBASE_APPS_DIR]) {
    const execPath = path.join(dir, toolFamily, "executors", `${suffix}.js`);
    if (fs.existsSync(execPath)) {
      fs.writeFileSync(execPath, body, "utf-8");
      console.log(`[enso:autoheal] persisted executor fix for ${toolFamily}/${suffix} at ${execPath}`);
      return;
    }
  }
  console.log(`[enso:autoheal] could not find executor file on disk for ${toolFamily}/${suffix} — fix is in-memory only`);
}

/** Persist a fixed template JSX to disk (user apps first, then codebase). */
export function persistTemplateFix(toolFamily: string, templateJSX: string): void {
  for (const dir of [appsDir(), CODEBASE_APPS_DIR]) {
    const templatePath = path.join(dir, toolFamily, "template.jsx");
    if (fs.existsSync(templatePath)) {
      fs.writeFileSync(templatePath, templateJSX, "utf-8");
      console.log(`[enso:autoheal] persisted template fix for ${toolFamily} at ${templatePath}`);
      return;
    }
  }
  console.log(`[enso:autoheal] could not find template file on disk for ${toolFamily} — fix is in-memory only`);
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

const EXECUTOR_CTX_TIMEOUT_MS = 10_000;
const EXECUTOR_CTX_MAX_DEPTH = 3;
const EXECUTOR_FETCH_MAX_BYTES = 512 * 1024; // 512KB
const STORE_MAX_SIZE = 1024 * 1024; // 1MB per family store

// ── Codebase App Tracking ──

/** Tracks which tool families have a version in the codebase apps directory */
const codebaseFamilies = new Set<string>();

/** Check whether a tool family has a codebase version (in openclaw-plugin/apps/) */
export function isCodebaseApp(toolFamily: string): boolean {
  return codebaseFamilies.has(toolFamily);
}

// ── Key-Value Store ──

const storeCache = new Map<string, Record<string, unknown>>();

function loadStoreForFamily(family: string): Record<string, unknown> {
  if (storeCache.has(family)) return storeCache.get(family)!;
  const storePath = path.join(os.homedir(), ".openclaw", "enso-apps", family, "store.json");
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
  const storePath = path.join(os.homedir(), ".openclaw", "enso-apps", family, "store.json");
  const json = JSON.stringify(data, null, 2);
  if (json.length > STORE_MAX_SIZE) {
    throw new Error(`Store for "${family}" exceeds ${STORE_MAX_SIZE} bytes`);
  }
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, json);
}

/**
 * Build an ExecutorContext that bridges generated app executors to real
 * OpenClaw capabilities. Each call is logged, timed, and guarded with
 * a timeout + max nesting depth.
 */
export function buildExecutorContext(toolFamily?: string, toolSuffix?: string, apiKey?: string): ExecutorContext {
  let callDepth = 0;
  const tag = toolFamily && toolSuffix ? `${toolFamily}/${toolSuffix}` : "executor";

  async function withTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), EXECUTOR_CTX_TIMEOUT_MS);

    try {
      if (callDepth >= EXECUTOR_CTX_MAX_DEPTH) {
        throw new Error(`ctx call depth exceeded (max ${EXECUTOR_CTX_MAX_DEPTH})`);
      }
      callDepth++;
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          ac.signal.addEventListener("abort", () => reject(new Error(`ctx.${label} timed out after ${EXECUTOR_CTX_TIMEOUT_MS}ms`)));
        }),
      ]);
      console.log(`[enso:executor-ctx] ${tag} → ${label} [${Date.now() - t0}ms]`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[enso:executor-ctx] ${tag} → ${label} FAILED [${Date.now() - t0}ms] — ${msg}`);
      throw err;
    } finally {
      callDepth--;
      clearTimeout(timer);
    }
  }

  return {
    async callTool(toolName: string, params: Record<string, unknown>) {
      return withTimeout(`callTool("${toolName}")`, async () => {
        const result = await executeToolDirect(toolName, params);
        return { success: result.success, data: result.data, error: result.error ?? undefined };
      });
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

    async fetch(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) {
      return withTimeout(`fetch("${url}")`, async () => {
        // Enforce HTTPS only
        if (!url.startsWith("https://")) {
          return { ok: false, status: 0, data: "Only HTTPS URLs are allowed" };
        }

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), EXECUTOR_CTX_TIMEOUT_MS);
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
      });
    },

    async search(query: string, options?: { count?: number; country?: string }) {
      return withTimeout(`search("${query}")`, async () => {
        const apiKey = process.env.BRAVE_API_KEY;
        if (!apiKey) {
          console.log(`[enso:executor-ctx] ${tag} → search: no BRAVE_API_KEY, returning empty`);
          return { ok: false as const, results: [] };
        }

        const count = Math.min(Math.max(options?.count ?? 3, 1), 5);
        const searchUrl = new URL("https://api.search.brave.com/res/v1/web/search");
        searchUrl.searchParams.set("q", query);
        searchUrl.searchParams.set("count", String(count));
        if (options?.country) searchUrl.searchParams.set("country", options.country);

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), EXECUTOR_CTX_TIMEOUT_MS);
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
        } finally {
          clearTimeout(timer);
        }
      });
    },

    async ask(prompt: string, _options?: { maxTokens?: number }) {
      return withTimeout(`ask("${prompt.slice(0, 40)}...")`, async () => {
        if (!apiKey) {
          return { ok: false as const, text: "No LLM API key available" };
        }
        try {
          const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
          const text = await callGeminiLLMWithRetry(prompt, apiKey);
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
    },
  };
}

// ── Paths ──

function resolveBasePath(basePath?: string): string {
  return basePath ?? path.join(os.homedir(), ".openclaw");
}

function appsDir(basePath?: string): string {
  return path.join(resolveBasePath(basePath), "enso-apps");
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

  // Write SKILL.md to the skills directory (auto-watched by OpenClaw)
  const skillDir = path.join(skillsDir(basePath), app.spec.toolFamily);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), app.skillMd);

  console.log(`[enso:persistence] saved app "${app.spec.toolFamily}" (${app.executors.size} tools)`);
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
        console.log(`[enso:persistence] skipping corrupt app "${entry.name}": invalid manifest`);
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
      console.log(`[enso:persistence] skipping corrupt app "${entry.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return apps;
}

/** Load apps from the user directory (~/.openclaw/enso-apps/) */
export function loadApps(basePath?: string): LoadedApp[] {
  return loadAppsFromDir(appsDir(basePath));
}

/**
 * Load apps from both codebase (openclaw-plugin/apps/) and user (~/.openclaw/enso-apps/)
 * directories. User apps override codebase apps with the same toolFamily (for dev iteration).
 * Updates the codebaseFamilies tracking set.
 */
export function loadAllApps(basePath?: string): LoadedApp[] {
  const codebaseApps = loadAppsFromDir(CODEBASE_APPS_DIR);
  const userApps = loadApps(basePath);

  // Reset codebase tracking
  codebaseFamilies.clear();

  // Build merged map: codebase first, user overrides
  const merged = new Map<string, LoadedApp>();
  for (const app of codebaseApps) {
    merged.set(app.spec.toolFamily, app);
    codebaseFamilies.add(app.spec.toolFamily);
  }
  for (const app of userApps) {
    if (merged.has(app.spec.toolFamily)) {
      console.log(`[enso:persistence] user app "${app.spec.toolFamily}" overrides codebase version`);
    }
    merged.set(app.spec.toolFamily, app);
  }

  return Array.from(merged.values());
}

// ── Register ──

// AsyncFunction constructor: supports `await` in executor bodies
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as typeof Function;

export function registerLoadedApp(app: LoadedApp): void {
  const { spec } = app;
  trackAppSpec(spec);
  const registeredToolNames: string[] = [];
  const actionSuffixes: string[] = [];

  for (const toolDef of spec.tools) {
    const body = app.executors.get(toolDef.suffix);
    if (!body) continue;

    const toolName = `${spec.toolPrefix}${toolDef.suffix}`;
    // Executor receives 3 args: callId, params, ctx — uses AsyncFunction to support await
    const executeFn = new AsyncFunction("callId", "params", "ctx", body) as (
      callId: string,
      params: Record<string, unknown>,
      ctx: ExecutorContext,
    ) => Promise<{ content: Array<{ type: string; text?: string }> }>;

    registerGeneratedTool({
      name: toolName,
      description: toolDef.description,
      parameters: toolDef.parameters,
      body,
      execute: async (callId: string, toolParams: Record<string, unknown>) => {
        // Lazy API key resolution — apps are loaded at startup before any account is active
        const { getActiveAccount } = await import("./server.js");
        const activeApiKey = getActiveAccount()?.geminiApiKey;
        const ctx = buildExecutorContext(spec.toolFamily, toolDef.suffix, activeApiKey);
        const result = await executeFn(callId, toolParams, ctx);
        return result;
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

  // Register data hint
  const primaryDef = spec.tools.find((t) => t.isPrimary) ?? spec.tools[0];
  registerToolTemplateDataHint({
    toolFamily: spec.toolFamily,
    signatureId: spec.signatureId,
    requiredKeys: primaryDef.requiredDataKeys,
  });

  // Register template JSX code
  registerGeneratedTemplateCode(spec.signatureId, app.templateJSX);

  // Register in capability catalog
  const fallbackToolName = `${spec.toolPrefix}${primaryDef.suffix}`;
  addCapability({
    toolFamily: spec.toolFamily,
    fallbackToolName,
    actionSuffixes,
    signatureId: spec.signatureId,
    description: spec.description,
  });

  console.log(`[enso:persistence] registered app "${spec.toolFamily}" (${registeredToolNames.length} tools: ${registeredToolNames.join(", ")})`);
}

// ── Startup convenience ──

/**
 * Load and register apps from both codebase (openclaw-plugin/apps/) and user
 * (~/.openclaw/enso-apps/) directories. User apps override codebase versions.
 */
export function loadAndRegisterSavedApps(basePath?: string): number {
  const apps = loadAllApps(basePath);
  for (const app of apps) {
    try {
      const source = codebaseFamilies.has(app.spec.toolFamily) ? "codebase" : "user";
      registerLoadedApp(app);
      console.log(`[enso:persistence] loaded ${source} app "${app.spec.toolFamily}"`);
    } catch (err) {
      console.log(`[enso:persistence] failed to register app "${app.spec.toolFamily}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Ensure SKILL.md exists for each loaded app (idempotent — won't overwrite existing)
  for (const app of apps) {
    try {
      ensureSkillMd(app, basePath);
    } catch (err) {
      console.log(`[enso:persistence] failed to ensure SKILL.md for "${app.spec.toolFamily}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return apps.length;
}

/**
 * Ensure a SKILL.md file exists for a loaded app, so OpenClaw's agent can
 * discover and invoke its tools. Idempotent — never overwrites existing files.
 *
 * - All apps: writes to ~/.openclaw/skills/<family>/SKILL.md (managed skills dir)
 * - Codebase apps: also writes to openclaw-plugin/skills/<family>/SKILL.md (plugin-shipped)
 */
function ensureSkillMd(app: LoadedApp, basePath?: string): void {
  const family = app.spec.toolFamily;

  // 1. Ensure managed skill (~/.openclaw/skills/<family>/SKILL.md)
  const managedSkillDir = path.join(skillsDir(basePath), family);
  const managedSkillPath = path.join(managedSkillDir, "SKILL.md");
  if (!fs.existsSync(managedSkillPath)) {
    fs.mkdirSync(managedSkillDir, { recursive: true });
    fs.writeFileSync(managedSkillPath, generateSkillMd(app.spec));
    console.log(`[enso:persistence] generated SKILL.md for "${family}" at ${managedSkillDir}`);
  }

  // 2. For codebase apps, also ensure plugin-shipped skill exists
  if (codebaseFamilies.has(family)) {
    const pluginSkillDir = path.join(PLUGIN_DIR, "skills", family);
    const pluginSkillPath = path.join(pluginSkillDir, "SKILL.md");
    if (!fs.existsSync(pluginSkillPath)) {
      fs.mkdirSync(pluginSkillDir, { recursive: true });
      fs.writeFileSync(pluginSkillPath, generateSkillMd(app.spec));
      console.log(`[enso:persistence] generated plugin SKILL.md for codebase app "${family}" (consider committing)`);
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
    console.log(`[enso:persistence] deleted app "${toolFamily}"`);
  }
  return removed;
}

/**
 * Copy an app from the user directory (~/.openclaw/enso-apps/<family>/)
 * to the codebase directory (openclaw-plugin/apps/<family>/).
 * The user can then `git add` and `git commit` the result.
 */
export function saveAppToCodebase(toolFamily: string, basePath?: string): { success: boolean; path?: string; error?: string } {
  const sourceDir = path.join(appsDir(basePath), toolFamily);
  if (!fs.existsSync(sourceDir)) {
    return { success: false, error: `App "${toolFamily}" not found in user directory` };
  }

  const targetDir = path.join(CODEBASE_APPS_DIR, toolFamily);

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
    codebaseFamilies.add(toolFamily);

    console.log(`[enso:persistence] saved app "${toolFamily}" to codebase at ${targetDir}`);
    return { success: true, path: targetDir };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Unregister a loaded app from all in-memory registries.
 * This reverses everything `registerLoadedApp()` does.
 */
export function unregisterApp(spec: PluginSpec): void {
  // Remove generated tool executors
  for (const toolDef of spec.tools) {
    const toolName = `${spec.toolPrefix}${toolDef.suffix}`;
    unregisterGeneratedTool(toolName);
  }

  // Remove template code
  unregisterGeneratedTemplateCode(spec.signatureId);

  // Remove tool template (signature)
  unregisterToolTemplate(spec.toolFamily, spec.signatureId);

  // Remove data hints
  unregisterToolTemplateDataHints(spec.toolFamily);

  // Remove from capability catalog
  removeCapability(spec.toolFamily);

  console.log(`[enso:persistence] unregistered app "${spec.toolFamily}" from memory`);
}

/**
 * Delete ALL user-created apps — disk files + in-memory registries.
 * Codebase apps (in openclaw-plugin/apps/) are NOT deleted — they are managed via git.
 * Returns the list of tool families that were deleted.
 */
export function deleteAllApps(basePath?: string): string[] {
  const apps = loadApps(basePath);
  const deleted: string[] = [];

  for (const app of apps) {
    try {
      // Unregister from memory
      unregisterApp(app.spec);
      // Delete from disk
      deleteApp(app.spec.toolFamily, basePath);
      deleted.push(app.spec.toolFamily);
    } catch (err) {
      console.log(`[enso:persistence] failed to delete app "${app.spec.toolFamily}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[enso:persistence] deleted all apps: ${deleted.length} removed (${deleted.join(", ") || "none"})`);
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

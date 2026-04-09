/**
 * settings-transfer.ts — Export/import Enso settings between machines.
 *
 * Export: bundles selected categories from ~/.enso/ into a single JSON file.
 * Import: writes bundle data back, with merge-or-replace semantics.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { ENSO_HOME } from "./utils/home.js";
import { loadApiKeys } from "./api-keys.js";
import { logAction, logError } from "./action-log.js";
import type { Request, Response } from "express";

// ── Types ──

interface ExportBundle {
  _enso: {
    version: 1;
    exportedAt: string;
    machine: string;
    categories: string[];
  };
  apiKeys?: Record<string, string>;
  providers?: Record<string, unknown>;
  scheduledTasks?: unknown[];
  memory?: { user?: string; memory?: string };
  conversations?: Record<string, { metadata: unknown; journal: string }>;
  apps?: Record<string, unknown>;
  skills?: Record<string, string>;
  projects?: Record<string, unknown>;
  cortex?: Record<string, Record<string, string>>;
  deepContent?: Record<string, unknown>;
  dataSources?: Record<string, unknown>;
  entityIndex?: Record<string, unknown>;
  orchestrations?: Record<string, Record<string, string>>;
}

interface CategoryInfo {
  id: string;
  label: string;
  description: string;
  sensitive: boolean;
}

const CATEGORIES: CategoryInfo[] = [
  { id: "apiKeys", label: "API Keys", description: "Gemini, Brave, Gmail, YouTube, BytePlus, Replicate, Remove.bg", sensitive: true },
  { id: "providers", label: "LLM Providers", description: "OpenAI, Anthropic, DeepSeek, OpenRouter + custom models", sensitive: true },
  { id: "scheduledTasks", label: "Scheduled Tasks", description: "Cron schedules, prompts, and task definitions", sensitive: false },
  { id: "memory", label: "Memory", description: "User profile and accumulated conversation memory", sensitive: false },
  { id: "conversations", label: "Conversations", description: "Chat history and card journals", sensitive: false },
  { id: "apps", label: "App State", description: "Per-app persistent data (galleries, settings)", sensitive: false },
  { id: "skills", label: "Skills", description: "User-created skill definitions", sensitive: false },
  { id: "projects", label: "Projects", description: "Project definitions (team, personas, vision)", sensitive: false },
  { id: "cortex", label: "Knowledge Cortex", description: "AI-maintained knowledge base (entities, concepts, sources, synthesis)", sensitive: false },
  { id: "deepContent", label: "Deep Content", description: "AI podcast metadata, research, scripts (audio files exported separately)", sensitive: false },
  { id: "dataSources", label: "Data Source Caches", description: "Kindle, WeRead, Steam, YouTube, Movies, Photos, QQ Music library caches", sensitive: false },
  { id: "entityIndex", label: "Entity Index", description: "Cross-source entity registry with types, sources, and cortex paths", sensitive: false },
  { id: "orchestrations", label: "Orchestrations & Discoveries", description: "Sprint outputs, persona reports, discovery artifacts", sensitive: false },
];

// ── Readers ──

function readJsonFile(path: string): unknown | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch { return null; }
}

function readTextFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  } catch { return null; }
}

let _includeAudio = false;
function readCategory(id: string): unknown | null {
  switch (id) {
    case "apiKeys":
      return readJsonFile(join(ENSO_HOME, "api-keys.json"));

    case "providers":
      return readJsonFile(join(ENSO_HOME, "providers.json"));

    case "scheduledTasks":
      return readJsonFile(join(ENSO_HOME, "scheduled-tasks", "tasks.json"));

    case "memory": {
      const user = readTextFile(join(ENSO_HOME, "memory", "ENSO_USER.md"));
      const memory = readTextFile(join(ENSO_HOME, "memory", "ENSO_MEMORY.md"));
      if (!user && !memory) return null;
      return { user, memory };
    }

    case "conversations": {
      const cardsDir = join(ENSO_HOME, "cards");
      if (!existsSync(cardsDir)) return null;
      const result: Record<string, { metadata: unknown; journal: string }> = {};

      for (const clientDir of readdirSync(cardsDir)) {
        const clientPath = join(cardsDir, clientDir);
        if (!statSync(clientPath).isDirectory()) continue;

        const convFile = join(clientPath, "conversations.json");
        const convs = readJsonFile(convFile) as Record<string, unknown> | unknown[] | null;
        if (!convs) continue;

        // conversations.json can be an array or object
        const convList = Array.isArray(convs) ? convs : Object.values(convs);

        for (const conv of convList as any[]) {
          const convId = conv?.id;
          if (!convId || result[convId]) continue;

          const journalFile = join(clientPath, `${convId}.jsonl`);
          const journal = readTextFile(journalFile);
          result[convId] = { metadata: conv, journal: journal || "" };
        }

        // Also check for JSONL files without a conversations.json entry
        for (const file of readdirSync(clientPath)) {
          if (!file.endsWith(".jsonl")) continue;
          const convId = basename(file, ".jsonl");
          if (result[convId]) continue;
          const journal = readTextFile(join(clientPath, file));
          if (journal) result[convId] = { metadata: { id: convId }, journal };
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    }

    case "apps": {
      const appsDir = join(ENSO_HOME, "apps");
      if (!existsSync(appsDir)) return null;
      const result: Record<string, unknown> = {};
      for (const appDir of readdirSync(appsDir)) {
        const storeFile = join(appsDir, appDir, "store.json");
        const data = readJsonFile(storeFile);
        if (data) result[appDir] = data;
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    case "skills": {
      const skillsDir = join(ENSO_HOME, "skills");
      if (!existsSync(skillsDir)) return null;
      const result: Record<string, string> = {};
      for (const skillDir of readdirSync(skillsDir)) {
        const skillFile = join(skillsDir, skillDir, "SKILL.md");
        const content = readTextFile(skillFile);
        if (content) result[skillDir] = content;
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    case "projects": {
      const projDir = join(ENSO_HOME, "projects");
      if (!existsSync(projDir)) return null;
      const result: Record<string, unknown> = {};
      for (const pDir of readdirSync(projDir)) {
        const projFile = join(projDir, pDir, "project.json");
        const data = readJsonFile(projFile);
        if (data) result[pDir] = data;
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    case "cortex": {
      const cortexDir = join(ENSO_HOME, "wiki");
      if (!existsSync(cortexDir)) return null;
      const result: Record<string, Record<string, string>> = {};
      const subdirs = ["entities", "concepts", "sources", "synthesis"];

      // Root metadata files
      const indexContent = readTextFile(join(cortexDir, "_index.md"));
      const logContent = readTextFile(join(cortexDir, "_log.md"));
      if (indexContent || logContent) {
        result["_root"] = {};
        if (indexContent) result["_root"]["_index.md"] = indexContent;
        if (logContent) result["_root"]["_log.md"] = logContent;
      }

      // Subdirectory pages
      for (const subdir of subdirs) {
        const subdirPath = join(cortexDir, subdir);
        if (!existsSync(subdirPath)) continue;
        const files: Record<string, string> = {};
        for (const file of readdirSync(subdirPath)) {
          if (!file.endsWith(".md")) continue;
          const content = readTextFile(join(subdirPath, file));
          if (content) files[file] = content;
        }
        if (Object.keys(files).length > 0) result[subdir] = files;
      }

      return Object.keys(result).length > 0 ? result : null;
    }

    case "deepContent": {
      const dcDir = join(ENSO_HOME, "data", "deep-content");
      const audioDir = join(dcDir, "audio");
      if (!existsSync(dcDir)) return null;
      const result: Record<string, unknown> = {};
      // JSON metadata
      for (const file of readdirSync(dcDir)) {
        if (!file.endsWith(".json")) continue;
        const data = readJsonFile(join(dcDir, file));
        if (data) result[file] = data;
      }
      // Audio files as base64 (when _includeAudio flag is set via export handler)
      if (_includeAudio && existsSync(audioDir)) {
        const audioFiles: Record<string, string> = {};
        for (const file of readdirSync(audioDir)) {
          if (!file.endsWith(".wav")) continue;
          const filePath = join(audioDir, file);
          try {
            const audioData = readFileSync(filePath);
            audioFiles[file] = audioData.toString("base64");
          } catch { /* skip files that can't be read */ }
        }
        if (Object.keys(audioFiles).length > 0) {
          result["_audio"] = audioFiles;
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    case "dataSources": {
      const cacheDir = join(ENSO_HOME, "data", "user-context", "cache");
      if (!existsSync(cacheDir)) return null;
      const result: Record<string, unknown> = {};
      for (const file of readdirSync(cacheDir)) {
        if (!file.endsWith(".json")) continue;
        const data = readJsonFile(join(cacheDir, file));
        if (data) result[file] = data;
      }
      // Also include consent
      const consentData = readJsonFile(join(ENSO_HOME, "data", "user-context", "consent.json"));
      if (consentData) result["_consent.json"] = consentData;
      const scanLog = readJsonFile(join(ENSO_HOME, "data", "user-context", "scan-log.json"));
      if (scanLog) result["_scan-log.json"] = scanLog;
      return Object.keys(result).length > 0 ? result : null;
    }

    case "entityIndex":
      return readJsonFile(join(ENSO_HOME, "data", "entity-index.json"));

    case "orchestrations": {
      const result: Record<string, Record<string, string>> = {};
      // Orchestration outputs
      const orchDir = join(ENSO_HOME, "orchestrations");
      if (existsSync(orchDir)) {
        for (const orchId of readdirSync(orchDir)) {
          const orchPath = join(orchDir, orchId);
          if (!statSync(orchPath).isDirectory()) continue;
          const files: Record<string, string> = {};
          // Read outputs directory
          const outputsDir = join(orchPath, "outputs");
          if (existsSync(outputsDir)) {
            for (const f of readdirSync(outputsDir)) {
              const content = readTextFile(join(outputsDir, f));
              if (content) files[`outputs/${f}`] = content;
            }
          }
          if (Object.keys(files).length > 0) result[orchId] = files;
        }
      }
      // Discoveries
      const discDir = join(ENSO_HOME, "discoveries");
      if (existsSync(discDir)) {
        for (const dId of readdirSync(discDir)) {
          const dPath = join(discDir, dId);
          if (!statSync(dPath).isDirectory()) continue;
          const files: Record<string, string> = {};
          for (const f of readdirSync(dPath)) {
            if (f.endsWith(".md") || f.endsWith(".json") || f.endsWith(".jsx")) {
              const content = readTextFile(join(dPath, f));
              if (content) files[f] = content;
            }
          }
          if (Object.keys(files).length > 0) result[`discovery-${dId}`] = files;
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    default:
      return null;
  }
}

function estimateSize(data: unknown): number {
  if (data === null || data === undefined) return 0;
  return JSON.stringify(data).length;
}

// ── Export Handler ──

export async function handleExport(req: Request, res: Response): Promise<void> {
  const dryRun = req.query.dryRun === "true";
  _includeAudio = req.query.includeAudio === "true";
  const requestedCategories = req.query.categories
    ? (req.query.categories as string).split(",").map((s) => s.trim())
    : CATEGORIES.map((c) => c.id);

  const validCategories = requestedCategories.filter((id) =>
    CATEGORIES.some((c) => c.id === id)
  );

  if (dryRun) {
    // Return category info with sizes
    const info = CATEGORIES.map((cat) => {
      const data = validCategories.includes(cat.id) ? readCategory(cat.id) : null;
      return {
        ...cat,
        available: data !== null,
        sizeBytes: estimateSize(data),
      };
    });
    res.json({ categories: info, machine: hostname() });
    return;
  }

  // Build export bundle
  const bundle: ExportBundle = {
    _enso: {
      version: 1,
      exportedAt: new Date().toISOString(),
      machine: hostname(),
      categories: [],
    },
  };

  for (const catId of validCategories) {
    const data = readCategory(catId);
    if (data !== null) {
      (bundle as any)[catId] = data;
      bundle._enso.categories.push(catId);
    }
  }

  logAction({
    ts: Date.now(),
    type: "action",
    category: "settings-transfer",
    message: `Exported ${bundle._enso.categories.length} categories: ${bundle._enso.categories.join(", ")}`,
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="enso-export-${dateStr}.json"`);
  _includeAudio = false;
  res.json(bundle);
}

// ── Import Handler ──

interface ImportSummary {
  imported: number;
  skipped: number;
  details?: string;
}

export async function handleImport(req: Request, res: Response): Promise<void> {
  try {
    const { bundle, options } = req.body as {
      bundle: ExportBundle;
      options?: { categories?: string[]; mergeMode?: "skip" | "replace" };
    };

    if (!bundle?._enso?.version) {
      res.status(400).json({ error: "Invalid bundle: missing _enso.version" });
      return;
    }
    if (bundle._enso.version !== 1) {
      res.status(400).json({ error: `Unsupported bundle version: ${bundle._enso.version}` });
      return;
    }

    const mergeMode = options?.mergeMode || "skip";
    const requestedCategories = options?.categories || bundle._enso.categories || [];
    const summary: Record<string, ImportSummary> = {};

    for (const catId of requestedCategories) {
      const data = (bundle as any)[catId];
      if (data === undefined || data === null) continue;

      try {
        summary[catId] = importCategory(catId, data, mergeMode);
      } catch (err) {
        summary[catId] = { imported: 0, skipped: 0, details: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // Reload API keys into process.env if they were imported
    if (summary.apiKeys && summary.apiKeys.imported > 0) {
      loadApiKeys();
    }

    logAction({
      ts: Date.now(),
      type: "action",
      category: "settings-transfer",
      message: `Imported from "${bundle._enso.machine}": ${Object.entries(summary).map(([k, v]) => `${k}(+${v.imported}/${v.skipped}s)`).join(", ")}`,
    });

    res.json({ success: true, summary });
  } catch (err) {
    logError("settings-transfer", "Import failed", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Import failed" });
  }
}

// ── Category Importers ──

function importCategory(id: string, data: unknown, mergeMode: "skip" | "replace"): ImportSummary {
  switch (id) {
    case "apiKeys":
      return importApiKeys(data as Record<string, string>, mergeMode);
    case "providers":
      return importProviders(data as Record<string, unknown>, mergeMode);
    case "scheduledTasks":
      return importScheduledTasks(data as unknown[], mergeMode);
    case "memory":
      return importMemory(data as { user?: string; memory?: string }, mergeMode);
    case "conversations":
      return importConversations(data as Record<string, { metadata: unknown; journal: string }>, mergeMode);
    case "apps":
      return importApps(data as Record<string, unknown>, mergeMode);
    case "skills":
      return importSkills(data as Record<string, string>, mergeMode);
    case "projects":
      return importProjects(data as Record<string, unknown>, mergeMode);
    case "cortex":
      return importCortex(data as Record<string, Record<string, string>>, mergeMode);
    case "deepContent":
      return importDeepContent(data as Record<string, unknown>, mergeMode);
    case "dataSources":
      return importDataSources(data as Record<string, unknown>, mergeMode);
    case "entityIndex":
      return importEntityIndex(data as Record<string, unknown>, mergeMode);
    case "orchestrations":
      return importOrchestrations(data as Record<string, Record<string, string>>, mergeMode);
    default:
      return { imported: 0, skipped: 0, details: "Unknown category" };
  }
}

function importApiKeys(data: Record<string, string>, mergeMode: "skip" | "replace"): ImportSummary {
  const file = join(ENSO_HOME, "api-keys.json");
  const existing = (readJsonFile(file) as Record<string, string>) || {};
  let imported = 0, skipped = 0;

  for (const [key, value] of Object.entries(data)) {
    if (!value) continue;
    if (mergeMode === "skip" && existing[key]) { skipped++; continue; }
    existing[key] = value;
    imported++;
  }

  mkdirSync(ENSO_HOME, { recursive: true });
  writeFileSync(file, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  return { imported, skipped };
}

function importProviders(data: Record<string, unknown>, mergeMode: "skip" | "replace"): ImportSummary {
  const file = join(ENSO_HOME, "providers.json");
  let imported = 0, skipped = 0;

  if (mergeMode === "replace") {
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
    const keyCount = Object.keys((data as any).apiKeys || {}).length;
    const modelCount = ((data as any).customModels || []).length;
    return { imported: keyCount + modelCount, skipped: 0 };
  }

  // Merge mode
  const existing = (readJsonFile(file) as Record<string, unknown>) || {};
  const existingKeys = (existing.apiKeys as Record<string, string>) || {};
  const existingModels = (existing.customModels as any[]) || [];
  const importKeys = ((data as any).apiKeys as Record<string, string>) || {};
  const importModels = ((data as any).customModels as any[]) || [];

  for (const [key, value] of Object.entries(importKeys)) {
    if (existingKeys[key]) { skipped++; continue; }
    existingKeys[key] = value;
    imported++;
  }

  const existingModelIds = new Set(existingModels.map((m: any) => m.id));
  for (const model of importModels) {
    if (existingModelIds.has(model.id)) { skipped++; continue; }
    existingModels.push(model);
    imported++;
  }

  existing.apiKeys = existingKeys;
  existing.customModels = existingModels;
  writeFileSync(file, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  return { imported, skipped };
}

function importScheduledTasks(data: unknown[], mergeMode: "skip" | "replace"): ImportSummary {
  const file = join(ENSO_HOME, "scheduled-tasks", "tasks.json");
  mkdirSync(join(ENSO_HOME, "scheduled-tasks"), { recursive: true });
  const existing = (readJsonFile(file) as any[]) || [];
  const existingIds = new Set(existing.map((t: any) => t.taskId));
  let imported = 0, skipped = 0;

  for (const task of data as any[]) {
    if (!task.taskId) continue;

    if (existingIds.has(task.taskId)) {
      if (mergeMode === "replace") {
        const idx = existing.findIndex((t: any) => t.taskId === task.taskId);
        existing[idx] = { ...task, enabled: false, nextFireAt: undefined, lastFiredAt: undefined, lastRunStatus: undefined };
        imported++;
      } else {
        skipped++;
      }
      continue;
    }

    // Import as disabled to prevent surprise executions
    existing.push({ ...task, enabled: false, nextFireAt: undefined, lastFiredAt: undefined, lastRunStatus: undefined });
    imported++;
  }

  writeFileSync(file, JSON.stringify(existing, null, 2), "utf-8");
  return { imported, skipped, details: imported > 0 ? "Tasks imported as disabled — enable manually" : undefined };
}

function importMemory(data: { user?: string; memory?: string }, mergeMode: "skip" | "replace"): ImportSummary {
  const memDir = join(ENSO_HOME, "memory");
  mkdirSync(memDir, { recursive: true });
  let imported = 0, skipped = 0;

  const writeIfNeeded = (filename: string, content: string | undefined) => {
    if (!content) return;
    const file = join(memDir, filename);
    if (mergeMode === "skip" && existsSync(file)) {
      const existing = readFileSync(file, "utf-8").trim();
      if (existing.length > 0) { skipped++; return; }
    }
    writeFileSync(file, content, "utf-8");
    imported++;
  };

  writeIfNeeded("ENSO_USER.md", data.user);
  writeIfNeeded("ENSO_MEMORY.md", data.memory);
  return { imported, skipped };
}

function importConversations(
  data: Record<string, { metadata: unknown; journal: string }>,
  mergeMode: "skip" | "replace"
): ImportSummary {
  const cardsDir = join(ENSO_HOME, "cards");
  mkdirSync(cardsDir, { recursive: true });

  // Scan ALL existing client dirs to build a set of known convIds
  const allExistingConvIds = new Set<string>();
  let primaryClientId: string | null = null;

  if (existsSync(cardsDir)) {
    for (const d of readdirSync(cardsDir)) {
      const dirPath = join(cardsDir, d);
      if (!statSync(dirPath).isDirectory()) continue;
      if (!primaryClientId) primaryClientId = d;

      // Check conversations.json
      const convs = readJsonFile(join(dirPath, "conversations.json")) as any;
      const convList = Array.isArray(convs) ? convs : [];
      for (const c of convList) {
        if (c?.id) allExistingConvIds.add(c.id);
      }

      // Check JSONL files
      for (const f of readdirSync(dirPath)) {
        if (f.endsWith(".jsonl")) allExistingConvIds.add(basename(f, ".jsonl"));
      }
    }
  }

  const clientId = primaryClientId || randomUUID();
  const clientDir = join(cardsDir, clientId);
  mkdirSync(clientDir, { recursive: true });

  // Load target client's conversations.json for appending
  const convFile = join(clientDir, "conversations.json");
  let convList: any[] = [];
  const existing = readJsonFile(convFile);
  if (Array.isArray(existing)) convList = existing;

  const existingIds = allExistingConvIds;
  let imported = 0, skipped = 0;

  for (const [convId, { metadata, journal }] of Object.entries(data)) {
    if (existingIds.has(convId) && mergeMode === "skip") { skipped++; continue; }

    // Write journal JSONL
    if (journal) {
      writeFileSync(join(clientDir, `${convId}.jsonl`), journal, "utf-8");
    }

    // Add/update conversation metadata
    if (existingIds.has(convId)) {
      const idx = convList.findIndex((c: any) => c.id === convId);
      convList[idx] = metadata;
    } else {
      convList.push(metadata);
      existingIds.add(convId);
    }
    imported++;
  }

  writeFileSync(convFile, JSON.stringify(convList, null, 2), "utf-8");
  return { imported, skipped };
}

function importApps(data: Record<string, unknown>, mergeMode: "skip" | "replace"): ImportSummary {
  const appsDir = join(ENSO_HOME, "apps");
  let imported = 0, skipped = 0;

  for (const [appId, storeData] of Object.entries(data)) {
    const appDir = join(appsDir, appId);
    const storeFile = join(appDir, "store.json");
    if (mergeMode === "skip" && existsSync(storeFile)) { skipped++; continue; }
    mkdirSync(appDir, { recursive: true });
    writeFileSync(storeFile, JSON.stringify(storeData, null, 2), "utf-8");
    imported++;
  }
  return { imported, skipped };
}

function importSkills(data: Record<string, string>, mergeMode: "skip" | "replace"): ImportSummary {
  const skillsDir = join(ENSO_HOME, "skills");
  let imported = 0, skipped = 0;

  for (const [skillId, content] of Object.entries(data)) {
    const skillDir = join(skillsDir, skillId);
    const skillFile = join(skillDir, "SKILL.md");
    if (mergeMode === "skip" && existsSync(skillFile)) { skipped++; continue; }
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillFile, content, "utf-8");
    imported++;
  }
  return { imported, skipped };
}

function importProjects(data: Record<string, unknown>, mergeMode: "skip" | "replace"): ImportSummary {
  const projDir = join(ENSO_HOME, "projects");
  let imported = 0, skipped = 0;

  for (const [projectId, projData] of Object.entries(data)) {
    const pDir = join(projDir, projectId);
    const pFile = join(pDir, "project.json");
    if (mergeMode === "skip" && existsSync(pFile)) { skipped++; continue; }
    mkdirSync(pDir, { recursive: true });
    writeFileSync(pFile, JSON.stringify(projData, null, 2), "utf-8");
    imported++;
  }
  return { imported, skipped };
}

function importCortex(data: Record<string, Record<string, string>>, mergeMode: "skip" | "replace"): ImportSummary {
  const cortexDir = join(ENSO_HOME, "wiki");
  mkdirSync(cortexDir, { recursive: true });
  let imported = 0, skipped = 0;

  for (const [category, files] of Object.entries(data)) {
    if (category === "_root") {
      for (const [filename, content] of Object.entries(files)) {
        const filePath = join(cortexDir, filename);
        if (mergeMode === "skip" && existsSync(filePath)) { skipped++; continue; }
        writeFileSync(filePath, content, "utf-8");
        imported++;
      }
      continue;
    }

    const categoryDir = join(cortexDir, category);
    mkdirSync(categoryDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      const filePath = join(categoryDir, filename);
      if (mergeMode === "skip" && existsSync(filePath)) { skipped++; continue; }
      writeFileSync(filePath, content, "utf-8");
      imported++;
    }
  }

  return { imported, skipped };
}

// ─── New Category Importers ────────────────────────────────────────────────

function importDeepContent(data: Record<string, unknown>, mergeMode: "skip" | "replace"): ImportSummary {
  const dcDir = join(ENSO_HOME, "data", "deep-content");
  const audioDir = join(dcDir, "audio");
  mkdirSync(dcDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });
  let imported = 0, skipped = 0;

  for (const [filename, content] of Object.entries(data)) {
    // Handle audio files (base64-encoded WAV)
    if (filename === "_audio" && typeof content === "object" && content !== null) {
      for (const [audioFile, base64Data] of Object.entries(content as Record<string, string>)) {
        if (!audioFile.endsWith(".wav")) continue;
        const audioPath = join(audioDir, audioFile);
        if (mergeMode === "skip" && existsSync(audioPath)) { skipped++; continue; }
        writeFileSync(audioPath, Buffer.from(base64Data, "base64"));
        imported++;
      }
      continue;
    }

    // Handle JSON metadata
    if (!filename.endsWith(".json")) continue;
    const filePath = join(dcDir, filename);
    if (mergeMode === "skip" && existsSync(filePath)) { skipped++; continue; }
    writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
    imported++;
  }
  return { imported, skipped };
}

function importDataSources(data: Record<string, unknown>, mergeMode: "skip" | "replace"): ImportSummary {
  const cacheDir = join(ENSO_HOME, "data", "user-context", "cache");
  const ctxDir = join(ENSO_HOME, "data", "user-context");
  mkdirSync(cacheDir, { recursive: true });
  let imported = 0, skipped = 0;
  for (const [filename, content] of Object.entries(data)) {
    if (!filename.endsWith(".json")) continue;
    const targetDir = filename.startsWith("_") ? ctxDir : cacheDir;
    const targetFile = filename.startsWith("_") ? filename.slice(1) : filename;
    const filePath = join(targetDir, targetFile);
    if (mergeMode === "skip" && existsSync(filePath)) { skipped++; continue; }
    writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
    imported++;
  }
  return { imported, skipped };
}

function importEntityIndex(data: Record<string, unknown>, mergeMode: "skip" | "replace"): ImportSummary {
  const file = join(ENSO_HOME, "data", "entity-index.json");
  mkdirSync(join(ENSO_HOME, "data"), { recursive: true });
  if (mergeMode === "replace" || !existsSync(file)) {
    writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    return { imported: Object.keys(data).length, skipped: 0 };
  }
  const existing = (readJsonFile(file) as Record<string, unknown>) || {};
  let imported = 0, skipped = 0;
  for (const [entityId, entry] of Object.entries(data)) {
    if (existing[entityId]) { skipped++; continue; }
    existing[entityId] = entry;
    imported++;
  }
  writeFileSync(file, JSON.stringify(existing, null, 2), "utf-8");
  return { imported, skipped };
}

function importOrchestrations(data: Record<string, Record<string, string>>, mergeMode: "skip" | "replace"): ImportSummary {
  let imported = 0, skipped = 0;
  for (const [dirName, files] of Object.entries(data)) {
    const isDiscovery = dirName.startsWith("discovery-");
    const baseDir = isDiscovery
      ? join(ENSO_HOME, "discoveries", dirName.replace("discovery-", ""))
      : join(ENSO_HOME, "orchestrations", dirName);
    if (mergeMode === "skip" && existsSync(baseDir)) { skipped++; continue; }
    mkdirSync(baseDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      const filePath = join(baseDir, filename);
      const fileDir = join(filePath, "..");
      mkdirSync(fileDir, { recursive: true });
      writeFileSync(filePath, content, "utf-8");
    }
    imported++;
  }
  return { imported, skipped };
}

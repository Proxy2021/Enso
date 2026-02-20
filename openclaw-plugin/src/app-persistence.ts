import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PluginSpec, PluginToolDef } from "./tool-factory.js";
import {
  registerGeneratedTool,
  registerGeneratedTemplateCode,
  registerToolTemplate,
  registerToolTemplateDataHint,
  unregisterGeneratedTool,
  unregisterGeneratedTemplateCode,
  unregisterToolTemplate,
  unregisterToolTemplateDataHints,
  type ToolTemplate,
} from "./native-tools/registry.js";
import { addCapability, removeCapability } from "./tool-families/catalog.js";

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

export function loadApps(basePath?: string): LoadedApp[] {
  const dir = appsDir(basePath);
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const apps: LoadedApp[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const appDir = path.join(dir, entry.name);
      const manifestRaw = fs.readFileSync(path.join(appDir, "app.json"), "utf-8");
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

// ── Register ──

export function registerLoadedApp(app: LoadedApp): void {
  const { spec } = app;
  const registeredToolNames: string[] = [];
  const actionSuffixes: string[] = [];

  for (const toolDef of spec.tools) {
    const body = app.executors.get(toolDef.suffix);
    if (!body) continue;

    const toolName = `${spec.toolPrefix}${toolDef.suffix}`;
    const executeFn = new Function("callId", "params", body) as (
      callId: string,
      params: Record<string, unknown>,
    ) => Promise<{ content: Array<{ type: string; text?: string }> }> | { content: Array<{ type: string; text?: string }> };

    registerGeneratedTool({
      name: toolName,
      description: toolDef.description,
      parameters: toolDef.parameters,
      execute: async (callId: string, toolParams: Record<string, unknown>) => {
        const result = await Promise.resolve(executeFn(callId, toolParams));
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

export function loadAndRegisterSavedApps(basePath?: string): number {
  const apps = loadApps(basePath);
  for (const app of apps) {
    try {
      registerLoadedApp(app);
    } catch (err) {
      console.log(`[enso:persistence] failed to register app "${app.spec.toolFamily}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return apps.length;
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
 * Delete ALL dynamically created apps — disk files + in-memory registries.
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

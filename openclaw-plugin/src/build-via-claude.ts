/**
 * Build App via Claude Code
 *
 * Replaces the old Gemini-based tool-factory pipeline with a Claude Code
 * session that is visible in a terminal card. After the session writes the
 * app files, a post-build hook auto-registers the app and delivers the
 * result to the original source card.
 */

import { randomUUID } from "crypto";
import { statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runClaudeCode } from "./claude-code.js";
import {
  loadAllApps,
  registerLoadedApp,
  CODEBASE_APPS_DIR,
  generateSkillMd,
  type LoadedApp,
} from "./app-persistence.js";
import { executeToolDirect } from "./native-tools/registry.js";
import { registerCardContext } from "./outbound.js";
import { TOOL_FAMILY_CAPABILITIES } from "./tool-families/catalog.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { ServerMessage, ToolBuildSummary, EnhanceResult } from "./types.js";
import { logAction, logError, logFix } from "./action-log.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

// ── Public API ──

interface BuildViaClaude {
  cardId: string;
  cardText: string;
  buildAppDefinition: string;
  conversationContext?: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

export async function handleBuildAppViaClaude(params: BuildViaClaude): Promise<void> {
  const { cardId, cardText, buildAppDefinition, conversationContext, client, account } = params;
  const buildTerminalCardId = randomUUID();
  const runId = randomUUID();

  // 1. Snapshot existing app families before the build starts
  const preExistingFamilies = new Set(TOOL_FAMILY_CAPABILITIES.map((c) => c.toolFamily));
  const buildStartTime = Date.now();
  logAction({ ts: buildStartTime, type: "build", category: "build-via-claude", message: `Build start: ${buildAppDefinition.slice(0, 100)}`, cardId });

  // 2. Create a terminal card on the client
  const send = (msg: Partial<ServerMessage>) => {
    client.send({
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: 0,
      timestamp: Date.now(),
      ...msg,
    } as ServerMessage);
  };

  send({
    state: "delta",
    text: "",
    toolMeta: { toolId: "claude-code" },
    targetCardId: buildTerminalCardId,
    cardType: "terminal",
  });

  // 3. Craft the build prompt
  const prompt = buildAppPrompt(cardText, buildAppDefinition, conversationContext);

  // 4. Run Claude Code — the terminal card will show full streaming output
  let sessionId: string | undefined;
  try {
    const result = await runClaudeCode({
      prompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: buildTerminalCardId,
    });
    sessionId = result.sessionId;
  } catch (err) {
    console.error(`[enso:build-via-claude] Claude Code error:`, err);
    logError("build-via-claude", "Claude Code build error", err, { cardId });
    sendBuildComplete(send, cardId, false, undefined, `Claude Code error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // 5. Post-build: detect new app, register, execute, deliver
  console.log(`[enso:build-via-claude] Claude Code session complete (${sessionId}). Scanning for new app...`);
  await postBuildRegistration(params, send, preExistingFamilies, buildStartTime);

  // 6. Post-build validation: compile-check the template, auto-fix if broken
  const freshApps = loadAllApps().filter((a) => !preExistingFamilies.has(a.spec.toolFamily));
  if (freshApps.length > 0 && sessionId) {
    const app = freshApps[0];
    try {
      const { transform } = await import("sucrase");
      transform(app.templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
      console.log(`[enso:build-via-claude] Template compile check: OK`);
    } catch (compileErr) {
      console.log(`[enso:build-via-claude] Template compile error, resuming session to fix`);
      logError("build-via-claude", "Template compile error, auto-fixing", compileErr, { cardId });
      const fixPrompt = [
        "The template.jsx you just created has a compile error:",
        "```",
        String(compileErr),
        "```",
        "",
        "Please fix template.jsx to resolve this error.",
        "Read CLAUDE-REFERENCE.md for the template format rules.",
        "Common issues: unclosed JSX tags, invalid expressions, missing parentheses.",
      ].join("\n");

      try {
        await runClaudeCode({
          prompt: fixPrompt,
          cwd: PROJECT_ROOT,
          toolSessionId: sessionId,
          client,
          runId: randomUUID(),
          targetCardId: buildTerminalCardId,
        });
        // Re-scan and re-deliver after fix
        await postBuildRegistration(params, send, preExistingFamilies, buildStartTime);
        logFix({ description: "Template compile error in build", error: String(compileErr), resolution: "Auto-fixed via Claude Code session", category: "build-via-claude" });
      } catch (fixErr) {
        console.error(`[enso:build-via-claude] Auto-fix session failed:`, fixErr);
      }
    }
  }
}

// ── Post-Build Registration ──

async function postBuildRegistration(
  params: BuildViaClaude,
  send: (msg: Partial<ServerMessage>) => void,
  preExistingFamilies: Set<string>,
  buildStartTime: number,
): Promise<void> {
  const { cardId, cardText, buildAppDefinition, account } = params;

  // Rescan all apps from both directories
  let allApps: LoadedApp[];
  try {
    allApps = loadAllApps();
  } catch (err) {
    console.error(`[enso:build-via-claude] Failed to scan apps:`, err);
    sendBuildComplete(send, cardId, false, undefined, "Failed to scan app directories after build.");
    return;
  }

  // Find newly created apps (family not in pre-existing set)
  let freshApps = allApps.filter((a) => !preExistingFamilies.has(a.spec.toolFamily));

  // Also check for modified existing apps (file mtime after build start)
  if (freshApps.length === 0) {
    for (const app of allApps) {
      for (const dir of [CODEBASE_APPS_DIR, join(process.env.HOME || process.env.USERPROFILE || "", ".openclaw", "enso-apps")]) {
        const manifestPath = join(dir, app.spec.toolFamily, "app.json");
        try {
          const stat = statSync(manifestPath);
          if (stat.mtimeMs >= buildStartTime) {
            freshApps.push(app);
            break;
          }
        } catch {
          // Not in this directory
        }
      }
    }
  }

  if (freshApps.length === 0) {
    console.warn(`[enso:build-via-claude] No new or modified app detected after build.`);
    sendBuildComplete(send, cardId, false, undefined, "Claude Code session completed but no new app was detected. Check the terminal output for details.");
    return;
  }

  // Register the first new app
  const app = freshApps[0];
  const spec = app.spec;
  console.log(`[enso:build-via-claude] Found new app: ${spec.toolFamily} (${spec.tools.length} tools)`);

  try {
    registerLoadedApp(app);
  } catch (err) {
    console.error(`[enso:build-via-claude] Registration failed:`, err);
    sendBuildComplete(send, cardId, false, undefined, `App registration failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Generate SKILL.md if Claude Code didn't create one
  try {
    const { writeFileSync } = await import("fs");
    const skillPath = join(CODEBASE_APPS_DIR, spec.toolFamily, "SKILL.md");
    if (!existsSync(skillPath)) {
      const skillMd = generateSkillMd(spec, buildAppDefinition);
      writeFileSync(skillPath, skillMd);
      console.log(`[enso:build-via-claude] Generated SKILL.md for ${spec.toolFamily}`);
    }
  } catch (err) {
    console.warn(`[enso:build-via-claude] SKILL.md generation warning:`, err);
    // Non-fatal
  }

  // Execute primary tool to get initial data
  const primaryDef = spec.tools.find((t) => t.isPrimary) ?? spec.tools[0];
  const primaryToolName = `${spec.toolPrefix}${primaryDef.suffix}`;

  let data: unknown = primaryDef.sampleData;
  try {
    const result = await executeToolDirect(primaryToolName, primaryDef.sampleParams);
    if (result.success && result.data != null) {
      data = result.data;
    } else {
      console.warn(`[enso:build-via-claude] Primary tool returned no data, using sampleData. Error: ${result.error}`);
    }
  } catch (err) {
    console.warn(`[enso:build-via-claude] Primary tool execution failed, using sampleData:`, err);
  }

  // Register card context for future action dispatch
  registerCardContext(cardId, {
    cardId,
    originalPrompt: buildAppDefinition,
    originalResponse: cardText,
    currentData: structuredClone(data),
    geminiApiKey: account.geminiApiKey,
    account,
    mode: account.mode,
    actionHistory: [],
    nativeToolHint: {
      toolName: primaryToolName,
      params: primaryDef.sampleParams,
      handlerPrefix: spec.toolPrefix,
    },
    interactionMode: "tool",
    toolFamily: spec.toolFamily,
    signatureId: spec.signatureId,
    coverageStatus: "covered",
  });

  // Build summary
  const registeredToolNames = spec.tools.map((t) => `${spec.toolPrefix}${t.suffix}`);
  const buildSummary: ToolBuildSummary = {
    toolFamily: spec.toolFamily,
    toolNames: registeredToolNames,
    description: spec.description,
    scenario: buildAppDefinition,
    actions: spec.tools.map((t) => t.suffix),
    steps: [
      { label: "Claude Code build session", status: "passed" },
      { label: "App registration", status: "passed" },
      { label: "Primary tool execution", status: data !== primaryDef.sampleData ? "passed" : "failed" },
    ],
    persisted: true,
    skillGenerated: true,
  };

  // Send enhanceResult to the source card (triggers app view)
  const enhanceResult: EnhanceResult = {
    data,
    generatedUI: app.templateJSX,
    cardMode: {
      interactionMode: "tool",
      toolFamily: spec.toolFamily,
      signatureId: spec.signatureId,
      coverageStatus: "covered",
    },
    buildSummary,
  };

  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult,
  });

  // Send buildComplete notification (creates a notification card)
  sendBuildComplete(send, cardId, true, buildSummary);

  console.log(`[enso:build-via-claude] ✓ App "${spec.toolFamily}" built and registered (${registeredToolNames.length} tools)`);
  logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: `Build success: ${spec.toolFamily} (${registeredToolNames.length} tools)`, cardId, toolFamily: spec.toolFamily });
}

// ── Helpers ──

function sendBuildComplete(
  send: (msg: Partial<ServerMessage>) => void,
  cardId: string,
  success: boolean,
  summary?: ToolBuildSummary,
  error?: string,
): void {
  send({
    state: "final",
    buildComplete: { cardId, success, summary, error },
  });
}

function buildAppPrompt(
  cardText: string,
  buildDefinition: string,
  conversationContext?: string,
): string {
  const lines: string[] = [];

  lines.push(`You are building an Enso app. Your task is to create a complete, working dynamic Enso app.`);
  lines.push(``);
  lines.push(`## Step 1: Read the Reference Guide`);
  lines.push(`Read the app building guide: CLAUDE-REFERENCE.md`);
  lines.push(`Focus on the "Dynamic Apps" section — it describes app.json, template.jsx, and executors format in detail.`);
  lines.push(``);
  lines.push(`## Step 2: Study Existing Apps for Patterns`);
  lines.push(`Browse openclaw-plugin/apps/ to see how real apps are structured. Pick 1-2 to read in full as reference.`);
  lines.push(``);
  lines.push(`## Step 3: Design and Build the App`);
  lines.push(`Write the app files to: openclaw-plugin/apps/<family_name>/`);
  lines.push(`Required files:`);
  lines.push(`- app.json — manifest with PluginSpec (tools array, sampleData, sampleParams)`);
  lines.push(`- template.jsx — React component as JSX string`);
  lines.push(`- executors/<suffix>.js — one function body per tool`);
  lines.push(``);

  if (conversationContext) {
    lines.push(`## Conversation Context`);
    lines.push(`Recent conversation that led to this request:`);
    lines.push(conversationContext);
    lines.push(``);
  }

  lines.push(`## Original Content to Enhance`);
  lines.push(`This AI response should be turned into an interactive app:`);
  lines.push("```");
  lines.push(cardText.slice(0, 4000));
  lines.push("```");
  lines.push(``);
  lines.push(`## User's Instructions`);
  lines.push(buildDefinition);
  lines.push(``);
  lines.push(`## Critical Rules (MUST follow)`);
  lines.push(`1. Family name: snake_case, unique, descriptive (e.g. weather_dashboard)`);
  lines.push(`2. Tool prefix: always "enso_<family>_"`);
  lines.push(`3. Every executor output JSON MUST include "tool": "enso_<family>_<suffix>"`);
  lines.push(`4. All parameter schemas MUST have "additionalProperties": false`);
  lines.push(`5. Exactly ONE tool must have "isPrimary": true`);
  lines.push(`6. Executors: use var (not const/let), no imports, return {content:[{type:"text", text:JSON.stringify(data)}]}`);
  lines.push(`7. Template: no imports, all hooks at top level (NEVER inside if/loops), use EnsoUI components`);
  lines.push(`8. Template: use data.tool field for polymorphic rendering (switching views based on which tool produced the data)`);
  lines.push(`9. Use EnsoUI.Tooltip (NOT Tooltip which conflicts with Recharts)`);
  lines.push(`10. sampleData must be realistic and match what the executor would actually return`);
  lines.push(``);
  lines.push(`## After Writing Files`);
  lines.push(`DO NOT restart the server. The system automatically detects and registers new apps.`);
  lines.push(`Just confirm the app structure is complete and all files are valid.`);
  lines.push(``);
  lines.push(`## Validation Checklist`);
  lines.push(`After writing all files, verify:`);
  lines.push(`1. app.json is valid JSON with all required fields`);
  lines.push(`2. Each executor in executors/ is a valid async function body`);
  lines.push(`3. template.jsx exports default function GeneratedUI({ data, onAction })`);
  lines.push(`4. The "tool" field in every sampleData matches the full tool name`);
  lines.push(`5. All parameter schemas have additionalProperties: false`);

  return lines.join("\n");
}

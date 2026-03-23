/**
 * card-evolution.ts — App-aware card evolution.
 *
 * Two paths:
 * 1. App-based cards (dynamic apps with server/apps/ or ~/.enso/apps/ directory):
 *    Uses Claude Code to read, analyze, and improve the app's source files in place.
 * 2. Standard cards (chat, terminal, or cards without an app directory):
 *    Falls back to orchestration-based content evolution (builds a one-off .orchestration-ui.jsx).
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { handleOrchestration } from "./orchestrator.js";
import { extractCardContent } from "./card-summarizer.js";
import { runClaudeCode } from "./claude-code.js";
import {
  loadAllApps,
  registerLoadedApp,
  persistTemplateFix,
  SHIPPED_APPS_DIR,
  type LoadedApp,
} from "./app-persistence.js";
import { executeToolDirect, registerAppTemplate } from "./native-tools/registry.js";
import { registerCardContext } from "./outbound.js";
import { logAction, logError, logFix } from "./action-log.js";
import { getEnsoPath } from "./utils/home.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CardSummary } from "./card-summarizer.js";
import type { ServerMessage, EnhanceResult } from "./types.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

// ── Types ──

export interface CardEvolutionParams {
  cardId: string;
  cardType: string;
  cardContent: {
    text?: string;
    data?: unknown;
    taskTerminals?: Record<string, { text: string; status: string }>;
    summary?: CardSummary;
  };
  appId?: string;
  toolFamily?: string;
  evolutionGoal?: string;
  includeResearch?: boolean;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

// ── App Directory Resolution ──

function resolveAppDirectory(appId?: string, toolFamily?: string): string | null {
  const family = toolFamily ?? appId;
  if (!family) return null;
  const userDir = join(getEnsoPath("apps"), family);
  if (existsSync(join(userDir, "app.json"))) return userDir;
  const shippedDir = join(SHIPPED_APPS_DIR, family);
  if (existsSync(join(shippedDir, "app.json"))) return shippedDir;
  return null;
}

// ── Native App Resolution ──

interface NativeAppInfo {
  family: string;
  signatureId: string;
  templateFile: string;
  toolsFile?: string;
  templateVarName: string;
}

const NATIVE_APPS: Record<string, NativeAppInfo> = {
  researcher: {
    family: "researcher",
    signatureId: "research_board",
    templateFile: "server/src/native-tools/templates/researcher.ts",
    toolsFile: "server/src/researcher-tools.ts",
    templateVarName: "RESEARCHER_TEMPLATE",
  },
  web_browser: {
    family: "web_browser",
    signatureId: "remote_browser",
    templateFile: "server/src/native-tools/templates/browser.ts",
    templateVarName: "BROWSER_TEMPLATE",
  },
  clawhub: {
    family: "clawhub",
    signatureId: "clawhub_browse",
    templateFile: "server/src/native-tools/templates/clawhub.ts",
    templateVarName: "CLAWHUB_TEMPLATE",
  },
  filesystem: {
    family: "filesystem",
    signatureId: "filesystem_explorer",
    templateFile: "server/src/native-tools/templates/filesystem.ts",
    templateVarName: "FILESYSTEM_TEMPLATE",
  },
};

function resolveNativeApp(appId?: string, toolFamily?: string): NativeAppInfo | null {
  const family = toolFamily ?? appId;
  if (!family) return null;
  const info = NATIVE_APPS[family];
  if (!info) return null;
  const absPath = join(PROJECT_ROOT, info.templateFile);
  if (!existsSync(absPath)) return null;
  return info;
}

function extractTemplateFromSource(filePath: string, varName: string): string | null {
  try {
    const src = readFileSync(filePath, "utf-8");
    const marker = `const ${varName} = \``;
    const startIdx = src.indexOf(marker);
    if (startIdx === -1) return null;
    const contentStart = startIdx + marker.length;
    const endIdx = src.lastIndexOf("`;");
    if (endIdx <= contentStart) return null;
    return src.slice(contentStart, endIdx);
  } catch {
    return null;
  }
}

// ── Template Sanitization ──
// The client sandbox uses `new Function(...)` which means `var` (function-scoped,
// hoisted) works correctly, but `const`/`let` (block-scoped, TDZ) can cause
// "Cannot access X before initialization" runtime errors when variables are
// referenced before their declaration line. Claude Code sometimes ignores the
// `var`-only instruction, so we auto-fix it deterministically after extraction.

interface SanitizeResult {
  code: string;
  fixes: string[];
}

function sanitizeTemplate(templateCode: string): SanitizeResult {
  const fixes: string[] = [];

  // Replace const/let with var inside the component body.
  // Match `const `, `let ` at the start of a line (with optional leading whitespace)
  // but NOT inside strings or comments.
  let sanitized = templateCode.replace(
    /^(\s*)(const|let)\s+/gm,
    (match, indent, keyword) => {
      fixes.push(`${keyword} → var`);
      return `${indent}var `;
    },
  );

  if (fixes.length > 0) {
    const unique = [...new Set(fixes)];
    fixes.length = 0;
    fixes.push(`Replaced ${unique.length > 1 ? `${unique.join(", ")}` : unique[0]} declarations with var (${sanitized.split(/\bvar\s/).length - 1} total)`);
  }

  return { code: sanitized, fixes };
}

/**
 * For native apps: write the sanitized template back into the .ts source file,
 * replacing the content of the template literal.
 */
function writeSanitizedTemplateToSource(
  filePath: string,
  varName: string,
  sanitizedCode: string,
): boolean {
  try {
    const src = readFileSync(filePath, "utf-8");
    const marker = `const ${varName} = \``;
    const startIdx = src.indexOf(marker);
    if (startIdx === -1) return false;
    const contentStart = startIdx + marker.length;
    const endIdx = src.lastIndexOf("`;");
    if (endIdx <= contentStart) return false;
    const newSrc = src.slice(0, contentStart) + sanitizedCode + src.slice(endIdx);
    writeFileSync(filePath, newSrc, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ── Main Entry Point ──

export async function handleCardEvolution(params: CardEvolutionParams): Promise<void> {
  const { cardId, cardType, appId, toolFamily, evolutionGoal } = params;

  const family = toolFamily ?? appId;
  const appDir = resolveAppDirectory(appId, toolFamily);
  const nativeApp = !appDir ? resolveNativeApp(appId, toolFamily) : null;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "card-evolution",
    message: `Card evolution start: ${cardType} card ${cardId.slice(0, 20)}${family ? ` (app: ${family}, ${appDir ? "dynamic" : nativeApp ? "native" : "none"})` : ""}${evolutionGoal ? ` — goal: ${evolutionGoal.slice(0, 80)}` : ""}`,
  });

  if (appDir && family) {
    return evolveAppViaClaude(params, appDir, family);
  }

  if (nativeApp) {
    return evolveNativeAppViaClaude(params, nativeApp);
  }

  return evolveViaOrchestration(params);
}

// ═══════════════════════════════════════════════════════════════════════════
// PATH 1: App Evolution via Claude Code
// ═══════════════════════════════════════════════════════════════════════════

async function evolveAppViaClaude(
  params: CardEvolutionParams,
  appDir: string,
  family: string,
): Promise<void> {
  const { cardId, cardContent, evolutionGoal, client, account } = params;
  const runId = randomUUID();
  const buildStartTime = Date.now();

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

  // Put card in building mode
  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult: {
      data: null,
      generatedUI: undefined as unknown as string,
      cardMode: {
        interactionMode: "tool",
        appId: family,
        toolFamily: family,
        signatureId: "card_evolution_building",
      },
    },
  });

  // Build the 3-phase evolution prompt
  const prompt = buildAppEvolutionPrompt(params, appDir, family);

  // Run Claude Code — streams terminal output to the same card
  let sessionId: string | undefined;
  try {
    const result = await runClaudeCode({
      prompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: cardId,
      skipPersist: true,
    });
    sessionId = result.sessionId;
  } catch (err) {
    logError("card-evolution", "Claude Code evolution error", err, { cardId, family });
    send({
      state: "final",
      targetCardId: cardId,
      enhanceResult: null as unknown as EnhanceResult,
    });
    return;
  }

  logAction({
    ts: Date.now(),
    type: "action",
    category: "card-evolution",
    message: `Claude Code session complete (${sessionId}). Reloading app ${family}...`,
    cardId,
  });

  // Reload all apps and find the evolved one
  let allApps: LoadedApp[];
  try {
    allApps = loadAllApps();
  } catch (err) {
    logError("card-evolution", "App reload failed after evolution", err, { cardId, family });
    return;
  }

  let evolvedApp = allApps.find((a) => a.spec.toolFamily === family);
  if (!evolvedApp) {
    logError("card-evolution", `App ${family} not found after reload`, undefined, { cardId });
    return;
  }

  // Sanitize template: const/let → var (prevents TDZ runtime errors in sandbox)
  const sanitized = sanitizeTemplate(evolvedApp.templateJSX);
  if (sanitized.fixes.length > 0) {
    evolvedApp.templateJSX = sanitized.code;
    persistTemplateFix(family, sanitized.code);
    logAction({ ts: Date.now(), type: "action", category: "card-evolution", message: `Template sanitized: ${sanitized.fixes.join("; ")}`, cardId });
  }

  // Compile-check the template, auto-fix if broken
  if (sessionId) {
    try {
      const { transform } = await import("sucrase");
      transform(evolvedApp.templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
      logAction({ ts: Date.now(), type: "action", category: "card-evolution", message: "Template compile check: OK", cardId });
    } catch (compileErr) {
      logAction({ ts: Date.now(), type: "action", category: "card-evolution", message: "Template compile error, resuming session to fix", cardId });
      logError("card-evolution", "Template compile error after evolution, auto-fixing", compileErr, { cardId, family });

      const fixPrompt = [
        "The template.jsx you just modified has a compile error:",
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
          targetCardId: cardId,
          skipPersist: true,
        });
        allApps = loadAllApps();
        evolvedApp = allApps.find((a) => a.spec.toolFamily === family);
        if (!evolvedApp) return;
        // Re-sanitize after Claude Code fix
        const reSanitized = sanitizeTemplate(evolvedApp.templateJSX);
        if (reSanitized.fixes.length > 0) {
          evolvedApp.templateJSX = reSanitized.code;
          persistTemplateFix(family, reSanitized.code);
        }
        logFix({ description: `Template compile error in ${family} evolution`, error: String(compileErr), resolution: "Auto-fixed via Claude Code session", category: "card-evolution" });
      } catch (fixErr) {
        logError("card-evolution", "Auto-fix session failed", fixErr, { cardId, family });
      }
    }
  }

  // Re-register the evolved app
  try {
    registerLoadedApp(evolvedApp);
  } catch (err) {
    logError("card-evolution", "App re-registration failed", err, { cardId, family });
    return;
  }

  // Execute primary tool to get data for the evolved template
  const spec = evolvedApp.spec;
  const primaryDef = spec.tools.find((t) => t.isPrimary) ?? spec.tools[0];
  const primaryToolName = `${spec.toolPrefix}${primaryDef.suffix}`;

  let data: unknown = primaryDef.sampleData;
  try {
    const result = await executeToolDirect(primaryToolName, primaryDef.sampleParams);
    if (result.success && result.data != null) {
      data = result.data;
    } else {
      logError("card-evolution", "Primary tool returned no data, using sampleData", result.error, { cardId, toolName: primaryToolName });
    }
  } catch (err) {
    logError("card-evolution", "Primary tool execution failed, using sampleData", err, { cardId, toolName: primaryToolName });
  }

  // Register card context for future interactions
  registerCardContext(cardId, {
    cardId,
    originalPrompt: evolutionGoal ?? `Evolved ${family} app`,
    originalResponse: params.cardContent.text ?? "",
    currentData: data,
    geminiApiKey: account.geminiApiKey,
    account,
    mode: account.mode,
    actionHistory: [],
    appToolHint: {
      toolName: primaryToolName,
      params: primaryDef.sampleParams,
      handlerPrefix: spec.toolPrefix,
    },
    interactionMode: "tool",
    toolFamily: spec.toolFamily,
    signatureId: spec.signatureId,
    coverageStatus: "covered",
  });

  // Deliver the evolved app to the card
  const enhanceResult: EnhanceResult = {
    data,
    generatedUI: evolvedApp.templateJSX,
    cardMode: {
      interactionMode: "tool",
      toolFamily: spec.toolFamily,
      signatureId: spec.signatureId,
      coverageStatus: "covered",
    },
  };

  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult,
  });

  const elapsed = ((Date.now() - buildStartTime) / 1000).toFixed(1);
  logAction({
    ts: Date.now(),
    type: "action",
    category: "card-evolution",
    message: `App "${family}" evolved and re-registered (${spec.tools.length} tools, ${elapsed}s)`,
    cardId,
    toolFamily: family,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PATH 1b: Native App Evolution via Claude Code
// ═══════════════════════════════════════════════════════════════════════════

async function evolveNativeAppViaClaude(
  params: CardEvolutionParams,
  nativeApp: NativeAppInfo,
): Promise<void> {
  const { cardId, client, account } = params;
  const { family, signatureId, templateFile, templateVarName } = nativeApp;
  const runId = randomUUID();
  const buildStartTime = Date.now();

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

  // Put card in building mode
  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult: {
      data: null,
      generatedUI: undefined as unknown as string,
      cardMode: {
        interactionMode: "tool",
        appId: family,
        toolFamily: family,
        signatureId: "card_evolution_building",
      },
    },
  });

  // Build the native-app-specific evolution prompt
  const prompt = buildNativeAppEvolutionPrompt(params, nativeApp);

  // Run Claude Code — streams terminal output to the same card
  let sessionId: string | undefined;
  try {
    const result = await runClaudeCode({
      prompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: cardId,
      skipPersist: true,
    });
    sessionId = result.sessionId;
  } catch (err) {
    logError("card-evolution", "Claude Code native evolution error", err, { cardId, family });
    send({
      state: "final",
      targetCardId: cardId,
      enhanceResult: null as unknown as EnhanceResult,
    });
    return;
  }

  logAction({
    ts: Date.now(),
    type: "action",
    category: "card-evolution",
    message: `Claude Code session complete (${sessionId}). Extracting evolved template for ${family}...`,
    cardId,
  });

  // Extract the evolved template string from the modified source file
  const absTemplatePath = join(PROJECT_ROOT, templateFile);
  let templateCode = extractTemplateFromSource(absTemplatePath, templateVarName);

  if (!templateCode) {
    logError("card-evolution", `Failed to extract template from ${templateFile}`, undefined, { cardId, family });
    return;
  }

  // Sanitize template: const/let → var (prevents TDZ runtime errors in sandbox)
  const sanitized = sanitizeTemplate(templateCode);
  if (sanitized.fixes.length > 0) {
    templateCode = sanitized.code;
    writeSanitizedTemplateToSource(absTemplatePath, templateVarName, sanitized.code);
    logAction({ ts: Date.now(), type: "action", category: "card-evolution", message: `Native template sanitized: ${sanitized.fixes.join("; ")}`, cardId });
  }

  // Compile-check the extracted template
  if (sessionId) {
    try {
      const { transform } = await import("sucrase");
      transform(templateCode, { transforms: ["jsx"], jsxRuntime: "classic" });
      logAction({ ts: Date.now(), type: "action", category: "card-evolution", message: "Native template compile check: OK", cardId });
    } catch (compileErr) {
      logAction({ ts: Date.now(), type: "action", category: "card-evolution", message: "Native template compile error, resuming session to fix", cardId });
      logError("card-evolution", "Native template compile error, auto-fixing", compileErr, { cardId, family });

      const fixPrompt = [
        `The template in ${templateFile} has a compile error after your changes:`,
        "```",
        String(compileErr),
        "```",
        "",
        `Please fix the ${templateVarName} template string in ${templateFile}.`,
        "Read CLAUDE-REFERENCE.md for the template format rules.",
        "Common issues: unclosed JSX tags, invalid expressions, missing parentheses.",
        "IMPORTANT: The template is a backtick template literal. Do NOT use backticks inside it.",
      ].join("\n");

      try {
        await runClaudeCode({
          prompt: fixPrompt,
          cwd: PROJECT_ROOT,
          toolSessionId: sessionId,
          client,
          runId: randomUUID(),
          targetCardId: cardId,
          skipPersist: true,
        });
        templateCode = extractTemplateFromSource(absTemplatePath, templateVarName);
        if (!templateCode) return;
        // Re-sanitize after Claude Code fix
        const reSanitized = sanitizeTemplate(templateCode);
        if (reSanitized.fixes.length > 0) {
          templateCode = reSanitized.code;
          writeSanitizedTemplateToSource(absTemplatePath, templateVarName, reSanitized.code);
        }
        logFix({ description: `Native template compile error in ${family} evolution`, error: String(compileErr), resolution: "Auto-fixed via Claude Code session", category: "card-evolution" });
      } catch (fixErr) {
        logError("card-evolution", "Auto-fix session failed", fixErr, { cardId, family });
      }
    }
  }

  // Register the evolved template as an override (takes precedence over built-in)
  registerAppTemplate(signatureId, templateCode);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "card-evolution",
    message: `Native template override registered for ${signatureId}`,
    cardId,
  });

  // Use the card's existing data — the tools didn't change, only the template
  const existingData = params.cardContent.data;

  // Deliver the evolved template to the card
  const enhanceResult: EnhanceResult = {
    data: existingData,
    generatedUI: templateCode,
    cardMode: {
      interactionMode: "tool",
      appId: family,
      toolFamily: family,
      signatureId,
      coverageStatus: "covered",
    },
  };

  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult,
  });

  const elapsed = ((Date.now() - buildStartTime) / 1000).toFixed(1);
  logAction({
    ts: Date.now(),
    type: "action",
    category: "card-evolution",
    message: `Native app "${family}" evolved (template override active, ${elapsed}s)`,
    cardId,
    toolFamily: family,
  });
}

// ── App Evolution Prompt (3-phase: audit → evaluate → evolve) ──

function buildAppEvolutionPrompt(
  params: CardEvolutionParams,
  appDir: string,
  family: string,
): string {
  const { cardContent, evolutionGoal } = params;

  const extracted = extractCardContent(
    params.cardType,
    cardContent.text,
    cardContent.data,
    cardContent.taskTerminals,
  );

  const relativeAppDir = appDir.startsWith(PROJECT_ROOT)
    ? relative(PROJECT_ROOT, appDir).replace(/\\/g, "/")
    : appDir;

  const contentExcerpt = extracted.body.slice(0, 8000);

  const goalBlock = evolutionGoal
    ? `\n## User's Evolution Goal\n${evolutionGoal}\n`
    : "";

  const summaryBlock = cardContent.summary
    ? `\nPre-computed Summary:\n- Overview: ${cardContent.summary.overview}\n- Key Outcomes: ${cardContent.summary.keyOutcomes.map((o) => `  - ${o}`).join("\n")}\n`
    : "";

  return `You are evolving an existing Enso app to make it fundamentally more capable. This is NOT about cosmetic changes — you are improving the app's architecture, data processing, and effectiveness.

## Phase 1: Deep App Audit

Read every file in ${relativeAppDir}/:
- app.json — tool definitions, parameters, descriptions
- template.jsx — the UI component
- executors/*.js — server-side tool implementations
- Any other files (SKILL.md, lib/, etc.)

Also read CLAUDE-REFERENCE.md for Enso app conventions and format rules.

Understand the app as a complete system: how tools are defined, how executors process data, and how the template renders results.

## Phase 2: Critical Evaluation

The user triggered this evolution from a card that produced the following output. Use it as a diagnostic specimen to assess the app's full stack:

### Card Output (${extracted.cardType})
Title: ${extracted.title}

${contentExcerpt}
${summaryBlock}${goalBlock}
### Evaluate: Tool Architecture (app.json)
- Are the tools well-decomposed? Should any be split into more focused tools or merged?
- Are parameters generic enough for reuse across different queries, or too narrow?
- Are there missing tools that would add significant capability? (e.g., compare, timeline, export, deep-dive)
- Are tool descriptions clear and specific enough for the LLM to invoke them correctly?
- Are sampleParams and sampleData representative and useful?

### Evaluate: Data Pipeline (executors)
- Are executors doing meaningful computation, or just proxying raw API responses?
- What derived metrics, confidence scores, cross-references, or aggregations should be computed server-side?
- Is error handling robust? Are edge cases (empty data, partial results, rate limits) handled gracefully?
- Could data be enriched with additional processing steps, normalization, or structure?
- Are there opportunities to add caching, batching, or smarter data fetching?

### Evaluate: Presentation & Interaction (template.jsx)
- Does the template use all available data fields, or ignore some?
- What interactions does the data support that the UI doesn't offer? (filter, sort, compare, drill-down, export)
- Is state management clean? Can it handle complex workflows and multiple tool outputs?
- Are there missing views or modes that would make the app more useful?
- Is the visual hierarchy effective? Does it guide the user to what matters?

## Phase 3: Evolve the App

Based on your analysis, modify the app files in place at ${relativeAppDir}/.

CRITICAL SANDBOX RULES for template.jsx (violations cause runtime crashes):
- **NEVER use \`const\`, \`let\`, or \`class\`** — use \`var\` for ALL variable declarations. The template runs inside \`new Function(...)\` where \`const\`/\`let\` cause "Cannot access X before initialization" TDZ errors. \`var\` hoists safely.
- **Declare variables before use** — any \`useMemo\` callback that references a variable must appear AFTER that variable's declaration in source order.
- No imports — everything is pre-injected into the sandbox scope.
- No backticks inside template strings.

Prioritize changes that improve the app's fundamental effectiveness:
1. **Add missing tools** that unlock new capabilities
2. **Enrich executors** with meaningful data processing, derived metrics, and robust error handling
3. **Upgrade the template** to leverage all data, add interactive controls, and support new tools
4. **Improve tool descriptions** so the LLM invokes them more effectively
5. **Update sampleParams and sampleData** to reflect the enhanced capabilities

Every change should address a specific gap you identified in Phase 2. Do not make changes that are purely cosmetic without also improving substance.

IMPORTANT: This is an in-place evolution of a reusable app. The improvements must work for ANY user of this app, not just the specific content shown in the card output above. Keep all tools parameterized and general-purpose.`;
}

// ── Native App Evolution Prompt ──

function buildNativeAppEvolutionPrompt(
  params: CardEvolutionParams,
  nativeApp: NativeAppInfo,
): string {
  const { cardContent, evolutionGoal } = params;
  const { family, templateFile, toolsFile, templateVarName } = nativeApp;

  const extracted = extractCardContent(
    params.cardType,
    cardContent.text,
    cardContent.data,
    cardContent.taskTerminals,
  );

  const contentExcerpt = extracted.body.slice(0, 8000);

  const goalBlock = evolutionGoal
    ? `\n## User's Evolution Goal\n${evolutionGoal}\n`
    : "";

  const summaryBlock = cardContent.summary
    ? `\nPre-computed Summary:\n- Overview: ${cardContent.summary.overview}\n- Key Outcomes: ${cardContent.summary.keyOutcomes.map((o) => `  - ${o}`).join("\n")}\n`
    : "";

  const toolsBlock = toolsFile
    ? `- ${toolsFile} — the tool implementations (TypeScript functions that fetch/process data)\n`
    : "";

  return `You are evolving a built-in Enso native app to make it fundamentally more capable. This is NOT about cosmetic changes — you are improving the app's template, data rendering, and user interaction patterns.

## Phase 1: Deep Template Audit

Read the following source files:
- ${templateFile} — contains the UI template as a TypeScript template literal (the \`${templateVarName}\` constant)
${toolsBlock}
Also read CLAUDE-REFERENCE.md for Enso template conventions and format rules.

The template is stored as a backtick template literal in TypeScript:
\`\`\`
const ${templateVarName} = \\\`
  export default function GeneratedUI({ data, onAction }) {
    // ... template code ...
  }
\\\`;
\`\`\`

Understand how the template handles different tool outputs, phases, and data shapes.
${toolsFile ? `Also study the tools file to understand what data fields are available and how data is structured.` : ""}

## Phase 2: Critical Evaluation

The user triggered this evolution from a card that produced the following output. Use it as a diagnostic specimen:

### Card Output (${extracted.cardType})
Title: ${extracted.title}

${contentExcerpt}
${summaryBlock}${goalBlock}
### Evaluate: Template Effectiveness
- Does the template use all available data fields, or ignore useful ones?
- Are there interactive controls (filter, sort, search, compare) that the data supports but the template doesn't offer?
- Is state management clean? Can it handle different phases and tool outputs elegantly?
- Are there missing views, modes, or visualizations that would make the app more useful?
- Is the visual hierarchy effective? Does it surface the most important information first?
- Are error states, loading states, and edge cases handled gracefully?

### Evaluate: Data Utilization
- What data fields are available from the tools but not rendered?
- Could derived metrics, summaries, or aggregations be computed from the existing data?
- Are there opportunities for cross-referencing, comparison, or highlighting patterns?

## Phase 3: Evolve the Template

Modify the template in ${templateFile}. Edit ONLY the \`${templateVarName}\` constant — do NOT change the function signatures, exports, or other code outside the template literal.

CRITICAL SANDBOX RULES (violations cause runtime crashes):
1. The template is a backtick template literal. Do NOT use backticks inside it — use regular quotes or single quotes instead.
2. **NEVER use \`const\`, \`let\`, or \`class\`** — use \`var\` for ALL variable declarations. The template runs inside \`new Function(...)\` where \`const\`/\`let\` cause "Cannot access X before initialization" TDZ errors. \`var\` hoists safely.
3. **Declare variables before use** — even with \`var\`, any \`useMemo\` callback that references a variable must appear AFTER that variable's declaration in source order.
4. Keep the \`export default function GeneratedUI({ data, onAction })\` signature.
5. Use React hooks (\`useState\`, \`useMemo\`, \`useEffect\`, \`useCallback\`, \`useRef\`) — they are available as globals.
6. Available UI primitives: \`UICard\`, \`Button\`, \`EmptyState\`, \`Dialog\`, \`Badge\`, \`LucideReact\` icons.
7. No imports — everything is pre-injected into the sandbox scope.

Prioritize changes that improve the template's fundamental effectiveness:
1. **Surface unused data** that the tools already provide
2. **Add interactive controls** (filtering, sorting, searching, comparing)
3. **Improve data visualization** with charts, metrics, and visual hierarchies
4. **Handle more edge cases** and states robustly
5. **Enhance the information architecture** so users find what they need faster

Every change should address a specific gap you identified in Phase 2.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PATH 2: Content Evolution via Orchestration (fallback)
// ═══════════════════════════════════════════════════════════════════════════

function buildCardEvolutionPlanningPrompt(
  params: CardEvolutionParams,
  orchestrationId: string,
  planFilePath: string,
): string {
  const { cardType, cardContent, evolutionGoal, includeResearch } = params;

  const extracted = extractCardContent(
    cardType,
    cardContent.text,
    cardContent.data,
    cardContent.taskTerminals,
  );

  const summaryBlock = cardContent.summary
    ? `\n## Pre-computed Summary\nOverview: ${cardContent.summary.overview}\nKey Outcomes:\n${cardContent.summary.keyOutcomes.map((o) => `- ${o}`).join("\n")}\nNarrative:\n${cardContent.summary.narrative}\n`
    : "";

  const contentBlock = `## Card Content (${extracted.cardType})\nTitle: ${extracted.title}\n\n${extracted.body.slice(0, 6000)}`;

  const typeGuidance = getTypeGuidance(cardType, includeResearch);
  const userGoalBlock = evolutionGoal
    ? `\n## User's Evolution Goal\n${evolutionGoal}\n`
    : "";

  return `You are planning a focused evolution sprint for a single Enso card. Your job is to create a short, targeted plan that transforms this card into a polished, fully-functional interactive app — not just a new UI, but the complete component: data handling, business logic, and presentation.

${contentBlock}
${summaryBlock}${userGoalBlock}
## Card Type: ${cardType}

${typeGuidance}

## Task Guidelines

Design 2-4 focused tasks. Each task should have a clear, achievable outcome.
${includeResearch ? "Include a researcher task to gather real-world data that enriches the final result." : ""}

Available agent roles: researcher, architect, builder, coder, reviewer
Available output types: app, research, code, document, decision, review

IMPORTANT: The final task MUST be a builder that creates a polished .orchestration-ui.jsx file at the project root. This file will be delivered as the evolved card. The component should be self-contained with its own state management, data processing, and UI — think of it as evolving the entire card, not just reskinning it. Include computed metrics, derived insights, interactive controls, and any logic that makes the component genuinely more capable than the original.

Write the plan as a JSON file to: ${planFilePath}

The JSON must have this structure:
{
  "tasks": [
    {
      "taskId": "t1",
      "title": "Task title",
      "description": "What to do",
      "agentRole": "researcher|architect|builder|coder|reviewer",
      "dependsOn": [],
      "outputType": "research|document|app|code|review"
    }
  ]
}

Orchestration ID: ${orchestrationId}
Keep the plan lean. 2-4 tasks. Focus on quality over quantity.`;
}

function getTypeGuidance(cardType: string, includeResearch?: boolean): string {
  const researchNote = includeResearch
    ? "\nInclude a researcher task first to gather real-world data, statistics, and examples that make the final app authoritative and data-rich."
    : "";

  switch (cardType) {
    case "chat":
      return `This is a chat response from an AI assistant. Evolve it into a comprehensive interactive app component.
- Identify the core topic and domain, then build logic that processes and enriches the content
- Compute derived metrics, comparisons, or summaries from the raw content
- Design a UI that makes the content explorable, not just readable
- Add structure: sections, tabs, comparison tables, visual hierarchies
- If the topic involves data, include visualizations with interactive controls
- Make it useful as a reference tool with filtering, search, and export${researchNote}`;

    case "terminal":
      return `This is a Claude Code session transcript. Evolve it into a full project dashboard component.
- Parse and extract files changed, created, or deleted — compute change statistics
- Identify key decisions made during the session and surface them prominently
- Aggregate test results, coverage data, and error counts
- Build a timeline of actions taken with interactive navigation
- Highlight errors encountered and how they were resolved
- Include computed summaries: lines changed, session duration, success rate${researchNote}`;

    case "orchestration":
      return `This is a multi-agent orchestration run. Evolve it into a full executive dashboard component.
- Parse task statuses and compute aggregate metrics (completion rate, timing, dependencies)
- Create a visual task dependency graph or timeline with interactive drill-down
- Highlight successes and failures with clear indicators and computed statistics
- Summarize agent contributions with effort and output metrics
- Include a "next steps" section based on what was accomplished vs what failed
- If tasks produced research or code, make it browseable with search and filtering${researchNote}`;

    case "dynamic-ui":
      return `This is an existing dynamic app. Evolve the entire component to the next level.
- Analyze the current data and UI structure, then add deeper processing logic
- Identify missing features and build them (computed metrics, derived insights, correlations)
- Improve data visualization with interactive charts, filters, and drill-downs
- Add filtering, sorting, export, comparison, and search capabilities
- Enhance the visual design with better layouts and typography
- Keep all existing functionality while adding substantial new depth and capability${researchNote}`;

    default:
      return `Evolve this card into a polished, fully-capable interactive component.
- Identify the key information and build logic to process, enrich, and derive insights from it
- Design a clear, intuitive UI with appropriate visualizations and interactive controls
- Add computed metrics, filtering, sorting, search, and export capabilities
- Focus on making the content actionable, explorable, and referenceable${researchNote}`;
  }
}

async function evolveViaOrchestration(params: CardEvolutionParams): Promise<void> {
  const { cardId, cardType, evolutionGoal, client, account } = params;

  try {
    await handleOrchestration({
      userMessage: `Evolve this ${cardType} card into a polished, fully-functional interactive component — not just a new UI, but improved data handling, logic, and presentation${evolutionGoal ? `: ${evolutionGoal}` : ""}`,
      classification: {
        complexity: "orchestrated" as const,
        reasoning: `Focused card evolution for ${cardType} card — multi-agent sprint to transform the entire component`,
      },
      client,
      account,
      maxConcurrency: 3,
      planningModel: "opus",
      targetCardId: cardId,
      planningPromptBuilder: (orchestrationId, planFilePath) =>
        buildCardEvolutionPlanningPrompt(params, orchestrationId, planFilePath),
      onComplete: (orchId, status) => {
        logAction({
          ts: Date.now(),
          type: "action",
          category: "card-evolution",
          message: `Card evolution ${orchId} ${status} for ${cardType} card ${cardId.slice(0, 20)}`,
        });
      },
    });
  } catch (err) {
    logError("card-evolution", `Evolution failed for ${cardType} card`, err, { cardId });
    throw err;
  }
}

/**
 * Build App via Claude Code
 *
 * Replaces the old Gemini-based tool-factory pipeline with a Claude Code
 * session that is visible in a terminal card. After the session writes the
 * app files, a post-build hook auto-registers the app and delivers the
 * result to the original source card.
 */

import { randomUUID } from "crypto";
import { statSync, existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runClaudeCode } from "./claude-code.js";
import {
  loadAllApps,
  registerLoadedApp,
  SHIPPED_APPS_DIR,
  generateSkillMd,
  type LoadedApp,
} from "./app-persistence.js";
import { executeToolDirect } from "./native-tools/registry.js";
import { registerCardContext } from "./outbound.js";
import { APP_CATALOG } from "./app-catalog.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { ServerMessage, ToolBuildSummary, EnhanceResult } from "./types.js";
import { logAction, logError, logFix } from "./action-log.js";
import { getEnsoPath } from "./utils/home.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

// ── Public API ──

interface BuildViaClaude {
  cardId?: string;
  cardText?: string;
  buildAppDefinition?: string;
  instruction?: string;        // Alternative to cardText (from action API)
  originalText?: string;       // Alternative source text
  targetCardId?: string;       // Alternative to cardId
  conversationContext?: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

export async function handleBuildAppViaClaude(params: BuildViaClaude): Promise<void> {
  const { conversationContext, client, account } = params;
  const cardId = params.cardId ?? params.targetCardId ?? randomUUID();
  const cardText = params.cardText ?? params.instruction ?? params.originalText ?? "";
  const buildAppDefinition = params.buildAppDefinition ?? "";
  const buildTerminalCardId = randomUUID();
  const runId = randomUUID();

  // 1. Snapshot existing app families before the build starts
  const preExistingFamilies = new Set(APP_CATALOG.map((c) => c.appId));
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
    toolMeta: { toolId: "claude-code", cwd: PROJECT_ROOT },
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
      skipPersist: true,
    });
    sessionId = result.sessionId;
  } catch (err) {
    logError("build-via-claude", "Claude Code build error", err, { cardId });
    sendBuildComplete(send, cardId, false, undefined, `Claude Code error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // 5. Post-build: detect new app, register, execute, deliver
  logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: `Claude Code session complete (${sessionId}). Scanning for new app...`, cardId });
  await postBuildRegistration(params, send, preExistingFamilies, buildStartTime);

  // 6. Post-build validation: compile-check the template, auto-fix if broken
  const freshApps = loadAllApps().filter((a) => !preExistingFamilies.has(a.spec.toolFamily));
  if (freshApps.length > 0 && sessionId) {
    const app = freshApps[0];
    try {
      const { transform } = await import("sucrase");
      transform(app.templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
      logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: "Template compile check: OK", cardId });
    } catch (compileErr) {
      logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: "Template compile error, resuming session to fix", cardId });
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
          skipPersist: true,
        });
        // Re-scan and re-deliver after fix
        await postBuildRegistration(params, send, preExistingFamilies, buildStartTime);
        logFix({ description: "Template compile error in build", error: String(compileErr), resolution: "Auto-fixed via Claude Code session", category: "build-via-claude" });
      } catch (fixErr) {
        logError("build-via-claude", "Auto-fix session failed", fixErr, { cardId });
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
  const { account } = params;
  const cardId = params.cardId ?? params.targetCardId ?? "";
  const cardText = params.cardText ?? params.instruction ?? params.originalText ?? "";
  const buildAppDefinition = params.buildAppDefinition ?? "";

  // Rescan all apps from both directories
  let allApps: LoadedApp[];
  try {
    allApps = loadAllApps();
  } catch (err) {
    logError("build-via-claude", "App scan failed after build", err, { cardId });
    sendBuildComplete(send, cardId, false, undefined, "Failed to scan app directories after build.");
    return;
  }

  // Find newly created apps (family not in pre-existing set)
  let freshApps = allApps.filter((a) => !preExistingFamilies.has(a.spec.toolFamily));

  // Also check for modified existing apps (file mtime after build start)
  if (freshApps.length === 0) {
    for (const app of allApps) {
      for (const dir of [SHIPPED_APPS_DIR, getEnsoPath("apps")]) {
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
    // Check for incomplete apps (app.json exists but template.jsx missing)
    const recovered = await recoverIncompleteApps(preExistingFamilies, buildStartTime);
    if (recovered) {
      // Reload after recovery
      try {
        allApps = loadAllApps();
        freshApps = allApps.filter((a) => !preExistingFamilies.has(a.spec.toolFamily));
      } catch {}
    }
    if (freshApps.length === 0) {
      logError("build-via-claude", "No new or modified app detected after build", undefined, { cardId });
      sendBuildComplete(send, cardId, false, undefined, "Claude Code session completed but no new app was detected. Check the terminal output for details.");
      return;
    }
  }

  // Register the first new app
  const app = freshApps[0];
  const spec = app.spec;
  logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: `Found new app: ${spec.toolFamily} (${spec.tools.length} tools)`, cardId, toolFamily: spec.toolFamily });

  try {
    registerLoadedApp(app);
  } catch (err) {
    logError("build-via-claude", "App registration failed", err, { cardId, toolFamily: spec.toolFamily });
    sendBuildComplete(send, cardId, false, undefined, `App registration failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Generate SKILL.md if Claude Code didn't create one
  try {
    const { writeFileSync } = await import("fs");
    const skillPath = join(SHIPPED_APPS_DIR, spec.toolFamily, "SKILL.md");
    if (!existsSync(skillPath)) {
      const skillMd = generateSkillMd(spec, buildAppDefinition);
      writeFileSync(skillPath, skillMd);
      logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: `Generated SKILL.md for ${spec.toolFamily}`, cardId, toolFamily: spec.toolFamily });
    }
  } catch (err) {
    logError("build-via-claude", "SKILL.md generation warning", err, { cardId, toolFamily: spec.toolFamily });
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
      logError("build-via-claude", "Primary tool returned no data, using sampleData", result.error, { cardId, toolName: primaryToolName });
    }
  } catch (err) {
    logError("build-via-claude", "Primary tool execution failed, using sampleData", err, { cardId, toolName: primaryToolName });
  }

  // Register card context for future action dispatch
  registerCardContext(cardId, {
    cardId,
    originalPrompt: buildAppDefinition,
    originalResponse: cardText,
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

  logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: `App "${spec.toolFamily}" built and registered (${registeredToolNames.length} tools)`, cardId, toolFamily: spec.toolFamily });
  logAction({ ts: Date.now(), type: "build", category: "build-via-claude", message: `Build success: ${spec.toolFamily} (${registeredToolNames.length} tools)`, cardId, toolFamily: spec.toolFamily });
}

// ── Deep Research → Custom Template (no app registration) ──

interface DeepResearchBuild {
  topic: string;
  language: string;
  cardId: string;      // The researcher card that initiated this
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

/**
 * Deep research that generates a custom JSX template tailored to the topic.
 * Claude Code researches the topic, then writes a single .deep-research-ui.jsx
 * file with all research data embedded. The template is read back and delivered
 * as `generatedUI` on the researcher card — no app registration needed.
 *
 * Returns the JSX string if successful, null if failed (caller falls back to standard).
 */
export async function handleDeepResearchBuild(params: DeepResearchBuild): Promise<string | null> {
  const { topic, language, cardId, client } = params;
  const runId = randomUUID();
  const outputFile = join(PROJECT_ROOT, ".deep-research-ui.jsx");

  logAction({ ts: Date.now(), type: "build", category: "deep-research-build", message: `Deep research UI build start: "${topic}"`, cardId });

  // Clean up any previous output file
  try { if (existsSync(outputFile)) unlinkSync(outputFile); } catch { /* ignore */ }

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

  // Send initial enhanceResult to show pulsing Deep toggle (building state)
  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult: {
      data: null,
      generatedUI: undefined as unknown as string,
      cardMode: { interactionMode: "tool", appId: "researcher", toolFamily: "researcher", signatureId: "deep_research_building" },
    },
  });

  // Craft prompt and run Claude Code
  // Stream terminal output to the SAME card (store accumulates in buildTerminalText)
  const prompt = buildDeepResearchUIPrompt(topic, language);

  let sessionId: string | undefined;
  try {
    const result = await runClaudeCode({
      prompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: cardId,
      skipPersist: true, // Deep research results persisted by card-actions completion handler
    });
    sessionId = result.sessionId;
  } catch (err) {
    logError("deep-research-build", "Claude Code session error", err, { cardId, topic });
    return null;
  }

  // Read the generated template
  if (!existsSync(outputFile)) {
    logError("deep-research-build", "No output file after Claude Code session", undefined, { cardId, topic });
    return null;
  }

  let templateJSX: string;
  try {
    templateJSX = readFileSync(outputFile, "utf-8").trim();
    unlinkSync(outputFile); // clean up
  } catch (err) {
    logError("deep-research-build", "Failed to read output file", err, { cardId, topic });
    return null;
  }

  if (!templateJSX || templateJSX.length < 100) {
    logError("deep-research-build", "Output file too small or empty", undefined, { cardId, topic });
    return null;
  }

  // Compile-check with Sucrase
  try {
    const { transform } = await import("sucrase");
    transform(templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
    logAction({ ts: Date.now(), type: "build", category: "deep-research-build", message: "Template compile check: OK", cardId });
  } catch (compileErr) {
    logAction({ ts: Date.now(), type: "build", category: "deep-research-build", message: "Compile error, attempting auto-fix", cardId });

    if (sessionId) {
      // Write it back so Claude Code can fix it
      writeFileSync(outputFile, templateJSX);
      const fixPrompt = [
        "The .deep-research-ui.jsx you just created has a compile error:",
        "```",
        String(compileErr),
        "```",
        "",
        "Fix the file. Common issues: unclosed JSX tags, invalid expressions, missing parentheses.",
        "Remember: no imports allowed. All hooks at top level. Use EnsoUI.Tooltip (not Tooltip).",
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

        if (existsSync(outputFile)) {
          templateJSX = readFileSync(outputFile, "utf-8").trim();
          unlinkSync(outputFile);
          // Verify fix
          const { transform } = await import("sucrase");
          transform(templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
          logFix({ description: "Template compile error in deep research", error: String(compileErr), resolution: "Auto-fixed via Claude Code", category: "deep-research-build" });
        } else {
          return null;
        }
      } catch (fixErr) {
        logError("deep-research-build", "Auto-fix failed", fixErr, { cardId });
        try { unlinkSync(outputFile); } catch { /* ignore */ }
        return null;
      }
    } else {
      return null;
    }
  }

  logAction({ ts: Date.now(), type: "build", category: "deep-research-build", message: `Deep research UI generated for "${topic}" (${templateJSX.length} chars)`, cardId });
  return templateJSX;
}

function buildDeepResearchUIPrompt(topic: string, language: string): string {
  const lines: string[] = [];

  lines.push(`You have TWO jobs: (1) deeply research a topic, then (2) write a single self-contained JSX component that presents your findings in the best possible interactive experience, custom-designed for this specific topic.`);
  lines.push(``);
  lines.push(`## PERFORMANCE: Be efficient. Target 5-8 minutes total. Don't over-search — 5-10 focused searches beats 20 broad ones. Prioritize quality findings over volume.`);
  lines.push(``);
  lines.push(`## Topic: "${topic}"`);
  lines.push(``);

  // Phase 1: Research
  lines.push(`## Phase 1: Deep Research`);
  lines.push(``);
  lines.push(`Research this topic thoroughly:`);
  lines.push(`1. Run 5-10 web searches covering different angles, aspects, and subtopics`);
  lines.push(`2. Read the most important articles/pages in full for depth`);
  lines.push(`3. Search for specific data: statistics, timelines, comparisons, rankings`);
  lines.push(`4. Find multimedia: YouTube videos (get URLs), notable books, documentaries`);
  lines.push(`5. Identify key entities, relationships, controversies, trends`);
  lines.push(`6. Note source URLs, titles, and key facts for attribution`);
  lines.push(``);
  lines.push(`Take detailed mental notes — you'll embed ALL findings directly into the component.`);
  lines.push(``);

  // Phase 2: Design
  lines.push(`## Phase 2: Design the Experience`);
  lines.push(``);
  lines.push(`Analyze what interactive experience would BEST serve THIS specific topic:`);
  lines.push(``);
  lines.push(`| Topic Type | Ideal Experience |`);
  lines.push(`|------------|-----------------|`);
  lines.push(`| Historical/chronological | Timeline explorer with era cards, key events, figure profiles |`);
  lines.push(`| Data/statistics | Dashboard with Recharts (LineChart, BarChart, PieChart), stat cards, trend analysis |`);
  lines.push(`| Geographic/location | Region tabs, location cards, neighborhood breakdowns, ratings |`);
  lines.push(`| People/entities | Profile cards with bios, achievement timelines, connection diagrams |`);
  lines.push(`| Comparison/vs | Side-by-side panels, scoring matrices, pros/cons, radar charts |`);
  lines.push(`| Technical/scientific | Concept breakdowns, complexity levels, interactive Q&A, diagrams |`);
  lines.push(`| Creative/artistic | Gallery layouts, style comparisons, influence maps |`);
  lines.push(`| Industry/market | Player profiles, market share charts, trend dashboards |`);
  lines.push(`| Process/how-to | Step-by-step cards, checklists, tip collections, resource links |`);
  lines.push(``);
  lines.push(`DO NOT make a generic "research board." Design something that feels CUSTOM-MADE.`);
  lines.push(``);

  // Phase 3: Write the JSX
  lines.push(`## Phase 3: Write the JSX Component`);
  lines.push(``);
  lines.push(`Write a SINGLE file: \`.deep-research-ui.jsx\` in the project root.`);
  lines.push(``);
  lines.push(`The file must contain a function like this:`);
  lines.push("```jsx");
  lines.push(`function GeneratedUI({ data, onAction }) {`);
  lines.push(`  // Your research data is embedded directly as constants here`);
  lines.push(`  var findings = [ ... ];`);
  lines.push(`  var timeline = [ ... ];`);
  lines.push(`  // ... all your researched data as JS objects/arrays`);
  lines.push(``);
  lines.push(`  // React hooks`);
  lines.push(`  var [activeTab, setActiveTab] = React.useState("overview");`);
  lines.push(`  // ... your UI state`);
  lines.push(``);
  lines.push(`  return ( /* your custom JSX */ );`);
  lines.push(`}`);
  lines.push("```");
  lines.push(``);

  // Rules
  lines.push(`## Template Rules (MUST follow)`);
  lines.push(``);
  lines.push(`### Available in the sandbox (no imports needed):`);
  lines.push(`- **React hooks**: React.useState, React.useEffect, React.useMemo, React.useCallback, React.useRef`);
  lines.push(`- **EnsoUI**: Tabs, DataTable, Stat, Badge, Button, UICard, Progress, Accordion, Dialog, Select, Input, Switch, Slider, Separator, EmptyState, EnsoUI.Tooltip, EnsoUI.VideoPlayer`);
  lines.push(`- **Recharts**: LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip (Recharts Tooltip — for EnsoUI tooltip use EnsoUI.Tooltip)`);
  lines.push(`- **Lucide icons**: any icon, e.g. Clock, Star, MapPin, Users, TrendingUp, BookOpen, Film, Music, etc.`);
  lines.push(`- **Color palette for accent colors**: emerald, blue, violet, amber, rose, cyan, orange, lime, pink, indigo, teal, fuchsia, sky`);
  lines.push(``);
  lines.push(`### Critical rules:`);
  lines.push(`1. NO imports — everything is injected into the sandbox`);
  lines.push(`2. Use \`var\` (not const/let) for all declarations`);
  lines.push(`3. ALL React hooks MUST be at the top level of the function — NEVER inside conditionals, loops, or callbacks`);
  lines.push(`4. Inline styles only (no CSS classes except Tailwind-style via style objects)`);
  lines.push(`5. No fetch(), no DOM access, no window/document globals`);
  lines.push(`6. Use EnsoUI.Tooltip for tooltips (not Tooltip which is Recharts)`);
  lines.push(`7. Embed your research data directly as \`var\` declarations at the top of the function`);
  lines.push(`8. \`onAction(name, payload)\` for user interactions — e.g., \`onAction("open_url", { url: "https://..." })\` to open links`);
  lines.push(`9. Use Tabs component for multi-view navigation — aim for 3-6 tabs. CRITICAL: Tabs uses a RENDER FUNCTION as children, NOT plain JSX children:`);
  lines.push(`   CORRECT: <Tabs tabs={[{value:"overview",label:"Overview"},{value:"details",label:"Details"}]} defaultValue="overview" variant="underline">{(activeTab) => activeTab === "overview" ? <OverviewContent /> : <DetailsContent />}</Tabs>`);
  lines.push(`   WRONG: <Tabs tabs={[...]}><div>content</div></Tabs> — this will NOT switch tabs!`);
  lines.push(`10. Videos: use EnsoUI.VideoPlayer for YouTube embeds`);
  lines.push(`11. The \`data\` prop will be \`{ tool: "enso_researcher_search", phase: "app_built", topic: "${topic}" }\` — you can ignore it and use your embedded data`);
  lines.push(``);

  lines.push(`### Null Safety (CRITICAL — render errors crash the entire UI):`);
  lines.push(`- NEVER call .toUpperCase(), .toLowerCase(), .trim(), .split(), .map(), .filter(), .length on a value without guarding`);
  lines.push(`- Use: (val || "").toUpperCase(), (arr || []).map(), (str ?? "").split()`);
  lines.push(`- Use optional chaining: item?.category NOT item.category`);
  lines.push(`- Provide fallbacks for display: {item.name || "Unknown"}, {item.count ?? 0}`);
  lines.push(``);

  lines.push(`### Design quality:`);
  lines.push(`- Dark theme (dark backgrounds: #0f172a, #1e293b, #334155; light text: #e2e8f0, #f8fafc)`);
  lines.push(`- Professional typography: clear hierarchy, good spacing`);
  lines.push(`- Interactive: clickable cards, expandable sections, tab navigation`);
  lines.push(`- Source attribution: link to sources, show credibility`);
  lines.push(`- Rich: use icons, badges, stat cards, charts where appropriate`);
  lines.push(`- Make it feel like a premium, bespoke experience for this specific topic`);
  lines.push(``);

  // Language
  if (language !== "English") {
    lines.push(`## Language`);
    lines.push(`CRITICAL: All user-facing text must be in ${language}.`);
    lines.push(`Only code identifiers and JSX variable names stay in English.`);
    lines.push(``);
  }

  lines.push(`## Output`);
  lines.push(`Write the JSX to: .deep-research-ui.jsx`);
  lines.push(`This should be a SINGLE file containing ONLY the function. No imports, no exports, no wrapping.`);
  lines.push(`The function signature must be: function GeneratedUI({ data, onAction })`);

  return lines.join("\n");
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
  lines.push(`Browse server/apps/ to see how real apps are structured. Pick 1-2 to read in full as reference.`);
  lines.push(``);
  lines.push(`## Step 2.5: Design for Reuse (CRITICAL — read before building)`);
  lines.push(`You are building a GENERAL-PURPOSE tool, not a one-off solution.`);
  lines.push(`The app must work for ANY user with similar needs, not just this specific request.`);
  lines.push(``);
  lines.push(`### Gold Standard: media_gallery`);
  lines.push(`Study server/apps/media_gallery/ — it exemplifies perfect reusability:`);
  lines.push(`- 7 focused tools (browse, view, favorite, rate, collection, search, inspect)`);
  lines.push(`- Every tool is parameterized (path, filter, sort, query — no hardcoded values)`);
  lines.push(`- Multi-view template that renders differently based on data.tool`);
  lines.push(`- Works for ANY folder of photos, videos, or documents — not one specific collection`);
  lines.push(``);
  lines.push(`### Anti-Patterns — DO NOT:`);
  lines.push(`- Name an app after one specific use case (e.g. "wkw_photobook" for Wong Kar-wai photos)`);
  lines.push(`- Hardcode file paths, location lists, or user-specific content in executors`);
  lines.push(`- Build a single monolithic tool that does everything — split into focused tools`);
  lines.push(`- Limit to just file I/O when ctx.search(), ctx.ask(), ctx.store are available`);
  lines.push(``);
  lines.push(`### Reusability Checklist (follow ALL):`);
  lines.push(`1. BUILD THE CATEGORY, not the instance: If asked "make a WKW photo book", build a "Photo Studio" app that works for any photo collection with any style`);
  lines.push(`2. PARAMETERIZE everything: Source paths, styles, filters, sort orders are tool PARAMETERS — never hardcoded in executor bodies`);
  lines.push(`3. AIM FOR 4-7 TOOLS: Split into browse/view/create/edit/search/manage actions. Each tool handles one concern.`);
  lines.push(`4. TEMPLATE uses data.tool branching: Each tool gets its own view mode (see media_gallery template)`);
  lines.push(`5. LEVERAGE ctx capabilities: ctx.search() for web data, ctx.ask() for AI analysis, ctx.store for persistence — don't limit to file I/O`);
  lines.push(`6. REALISTIC sampleData: 3-5 representative items showing the full data shape`);
  lines.push(`7. GENERIC family name: Use category names like "photo_studio", "trip_planner", "recipe_manager" — NOT "wkw_photobook", "japan_trip", "italian_recipes"`);
  lines.push(`8. NO HARDCODED domain data: All domain-specific content comes from parameters or runtime discovery, never baked into executors`);
  lines.push(``);

  lines.push(`## Step 3: Design and Build the App`);
  lines.push(`Write the app files to: server/apps/<family_name>/`);
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
  lines.push(`## File Writing Order (IMPORTANT)`);
  lines.push(`Write files in this exact order:`);
  lines.push(`1. template.jsx FIRST — this is the most critical file (the app cannot load without it)`);
  lines.push(`2. app.json — the manifest`);
  lines.push(`3. executors/*.js — the backend logic`);
  lines.push(`If you run out of space, at minimum template.jsx and app.json MUST exist.`);
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

/**
 * Recover incomplete apps that have app.json but are missing template.jsx.
 * Generates a basic template from the app's sampleData so the app can load.
 * Returns true if any apps were recovered.
 */
async function recoverIncompleteApps(
  preExistingFamilies: Set<string>,
  buildStartTime: number,
): Promise<boolean> {
  let recovered = false;
  for (const dir of [SHIPPED_APPS_DIR, getEnsoPath("apps")]) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (preExistingFamilies.has(entry.name)) continue;

      const appDir = join(dir, entry.name);
      const appJsonPath = join(appDir, "app.json");
      const templatePath = join(appDir, "template.jsx");

      // Skip if app.json doesn't exist or was created before this build
      if (!existsSync(appJsonPath)) continue;
      try {
        const stat = statSync(appJsonPath);
        if (stat.mtimeMs < buildStartTime) continue;
      } catch { continue; }

      // Only recover if template.jsx is missing
      if (existsSync(templatePath)) continue;

      try {
        const manifest = JSON.parse(readFileSync(appJsonPath, "utf-8"));
        const spec = manifest.spec;
        if (!spec || !spec.tools || !spec.tools.length) continue;

        // Generate a basic template from sampleData
        const primaryTool = spec.tools.find((t: any) => t.isPrimary) || spec.tools[0];
        const toolFamily = spec.toolFamily || entry.name;
        const description = spec.description || toolFamily;

        const basicTemplate = generateBasicTemplate(toolFamily, description, primaryTool, spec.tools);
        writeFileSync(templatePath, basicTemplate);

        logFix({
          description: `Recovered missing template.jsx for ${toolFamily}`,
          error: "template.jsx not created by builder",
          resolution: "Generated basic template from app.json sampleData",
          category: "build-via-claude",
        });
        recovered = true;
      } catch (err) {
        logError("build-via-claude", `Recovery failed for ${entry.name}`, err);
      }
    }
  }

  return recovered;
}

/**
 * Generate a basic but functional template.jsx from an app's tool spec.
 */
function generateBasicTemplate(
  toolFamily: string,
  description: string,
  primaryTool: any,
  allTools: any[],
): string {
  const prefix = `enso_${toolFamily}_`;
  const primaryToolName = `${prefix}${primaryTool.suffix}`;
  const title = toolFamily.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  // Generate action buttons for non-primary tools
  const actionButtons = allTools
    .filter((t: any) => !t.isPrimary)
    .map((t: any) => {
      const actionName = t.suffix;
      return `        <Button onClick={() => onAction("${actionName}")} variant="outline" size="sm">${actionName.replace(/_/g, " ")}</Button>`;
    })
    .join("\n");

  return `function GeneratedUI({ data, onAction }) {
  var [activeTab, setActiveTab] = React.useState("overview");

  if (!data) return <EmptyState title="Loading ${title}..." subtitle="Waiting for data" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>${title}</h2>
          <p style={{ fontSize: "12px", color: "#888", margin: "4px 0 0 0" }}>${description}</p>
        </div>
      </div>

${actionButtons ? `      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
${actionButtons}
      </div>` : ""}

      <UICard>
        <pre style={{ fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#ddd" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </UICard>
    </div>
  );
}`;
}

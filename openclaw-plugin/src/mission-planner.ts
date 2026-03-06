/**
 * Mission Planner
 *
 * Analyzes user interests/goals and proposes a set of Enso apps to build,
 * then orchestrates sequential builds via Claude Code.
 */

import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runClaudeCode } from "./claude-code.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type {
  ServerMessage,
  MissionPlan,
  MissionAppProposal,
  MissionProgress,
} from "./types.js";
import { logAction, logError } from "./action-log.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

// Track active missions so we can reference them on approve
const activeMissions = new Map<string, { plan: MissionPlan; account: ResolvedEnsoAccount }>();

// ── Public API ──

interface MissionStartParams {
  description: string;
  cardId: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

/**
 * Phase 1: Analyze user's mission and propose apps.
 * Uses Claude Code to generate a structured plan.
 */
export async function handleMissionStart(params: MissionStartParams): Promise<void> {
  const { description, cardId, client, account } = params;
  const missionId = randomUUID();
  const runId = randomUUID();
  const terminalCardId = randomUUID();

  logAction({
    ts: Date.now(),
    type: "action",
    category: "mission-planner",
    message: `Mission start: ${description.slice(0, 100)}`,
    cardId,
  });

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

  // Send progress: analyzing
  send({
    state: "delta",
    targetCardId: cardId,
    missionProgress: {
      missionId,
      currentIndex: 0,
      totalApps: 0,
      currentApp: "",
      stage: "analyzing",
    },
  });

  // Create a terminal card for the analysis session
  send({
    state: "delta",
    text: "",
    toolMeta: { toolId: "claude-code" },
    targetCardId: terminalCardId,
    cardType: "terminal",
  });

  // Build the analysis prompt
  const prompt = buildAnalysisPrompt(description);

  let sessionId: string | undefined;
  try {
    const result = await runClaudeCode({
      prompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: terminalCardId,
    });
    sessionId = result.sessionId;
  } catch (err) {
    logError("mission-planner", "Analysis failed", err, { cardId });
    send({
      state: "final",
      targetCardId: cardId,
      missionProgress: {
        missionId,
        currentIndex: 0,
        totalApps: 0,
        currentApp: "",
        stage: "failed",
        error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
    return;
  }

  // After Claude Code finishes, read the generated plan file
  let plan: MissionPlan;
  try {
    const { readFileSync, existsSync } = await import("fs");
    const planPath = join(PROJECT_ROOT, "openclaw-plugin", ".mission-plan.json");

    if (!existsSync(planPath)) {
      throw new Error("Claude Code did not generate a mission plan file.");
    }

    const raw = JSON.parse(readFileSync(planPath, "utf-8"));
    plan = {
      missionId,
      description,
      research: raw.research ?? undefined,
      apps: (raw.apps || []).map((app: any, i: number) => ({
        id: `${missionId}-app-${i}`,
        name: app.name || `App ${i + 1}`,
        family: app.family || app.name?.toLowerCase().replace(/\s+/g, "_") || `app_${i}`,
        description: app.description || "",
        capabilities: app.capabilities || [],
        inspiredBy: app.inspiredBy || "",
        approved: true, // default to approved
      })),
    };

    // Clean up the plan file
    const { unlinkSync } = await import("fs");
    try { unlinkSync(planPath); } catch { /* ignore */ }
  } catch (err) {
    logError("mission-planner", "Plan parsing failed", err, { cardId });
    send({
      state: "final",
      targetCardId: cardId,
      missionProgress: {
        missionId,
        currentIndex: 0,
        totalApps: 0,
        currentApp: "",
        stage: "failed",
        error: `Could not parse mission plan: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
    return;
  }

  // Store the plan for later approval
  activeMissions.set(missionId, { plan, account });

  // Send the plan to the client
  send({
    state: "final",
    targetCardId: cardId,
    missionPlan: plan,
    missionProgress: {
      missionId,
      currentIndex: 0,
      totalApps: plan.apps.length,
      currentApp: "",
      stage: "proposing",
    },
  });

  logAction({
    ts: Date.now(),
    type: "action",
    category: "mission-planner",
    message: `Mission plan proposed: ${plan.apps.length} apps`,
    cardId,
  });
}

interface MissionApproveParams {
  missionId: string;
  approvedApps: MissionAppProposal[];
  cardId: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

/**
 * Phase 2: Build approved apps sequentially via Claude Code.
 */
export async function handleMissionApprove(params: MissionApproveParams): Promise<void> {
  const { missionId, approvedApps, cardId, client, account } = params;

  const appsToBuilt = approvedApps.filter((a) => a.approved);
  if (appsToBuilt.length === 0) {
    const send = (msg: Partial<ServerMessage>) => {
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        timestamp: Date.now(),
        ...msg,
      } as ServerMessage);
    };
    send({
      state: "final",
      targetCardId: cardId,
      missionProgress: {
        missionId,
        currentIndex: 0,
        totalApps: 0,
        currentApp: "",
        stage: "complete",
        builtApps: [],
      },
    });
    return;
  }

  logAction({
    ts: Date.now(),
    type: "action",
    category: "mission-planner",
    message: `Mission approved: building ${appsToBuilt.length} apps`,
    cardId,
  });

  const builtApps: Array<{ family: string; success: boolean; error?: string }> = [];

  for (let i = 0; i < appsToBuilt.length; i++) {
    const app = appsToBuilt[i];
    const runId = randomUUID();

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

    // Send progress update
    send({
      state: "delta",
      targetCardId: cardId,
      missionProgress: {
        missionId,
        currentIndex: i,
        totalApps: appsToBuilt.length,
        currentApp: app.name,
        stage: "building",
        builtApps: [...builtApps],
      },
    });

    // Build each app using the existing build-via-claude pipeline
    try {
      const { handleBuildAppViaClaude } = await import("./build-via-claude.js");
      await handleBuildAppViaClaude({
        cardId, // source card stays the same
        cardText: `Mission: ${app.description}\n\nCapabilities: ${app.capabilities.join(", ")}`,
        buildAppDefinition: buildAppDefinitionForMission(app),
        conversationContext: `This app is part of a mission plan. Mission: "${activeMissions.get(missionId)?.plan.description ?? ""}"`,
        client,
        account,
      });
      builtApps.push({ family: app.family, success: true });
    } catch (err) {
      logError("mission-planner", `Build failed for ${app.family}`, err, { cardId });
      builtApps.push({
        family: app.family,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Send progress: app built (or failed)
    send({
      state: "delta",
      targetCardId: cardId,
      missionProgress: {
        missionId,
        currentIndex: i + 1,
        totalApps: appsToBuilt.length,
        currentApp: app.name,
        stage: builtApps[builtApps.length - 1].success ? "built" : "failed",
        builtApps: [...builtApps],
      },
    });
  }

  // Final completion
  const finalSend = (msg: Partial<ServerMessage>) => {
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      timestamp: Date.now(),
      ...msg,
    } as ServerMessage);
  };

  finalSend({
    state: "final",
    targetCardId: cardId,
    missionProgress: {
      missionId,
      currentIndex: appsToBuilt.length,
      totalApps: appsToBuilt.length,
      currentApp: "",
      stage: "complete",
      builtApps,
    },
  });

  // Clean up
  activeMissions.delete(missionId);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "mission-planner",
    message: `Mission complete: ${builtApps.filter((a) => a.success).length}/${appsToBuilt.length} apps built`,
    cardId,
  });
}

// ── Prompt Builders ──

function buildAnalysisPrompt(description: string): string {
  const planPath = join("openclaw-plugin", ".mission-plan.json");

  return [
    `You are a product designer for Enso, an interactive app platform. A user has described their interests and goals. Your job is to research the best existing solutions, then design Enso apps that match or surpass them by leveraging Enso's unique capabilities.`,
    ``,
    `## Step 1: Read the Reference Guide`,
    `Read CLAUDE-REFERENCE.md to understand what Enso apps can do — their capabilities, the component library (EnsoUI), and the executor context (ctx) which provides file access, web search, HTTP fetch, LLM calls, etc.`,
    ``,
    `## Step 2: Browse Existing Apps`,
    `Browse openclaw-plugin/apps/ to see what apps already exist. Don't propose apps that already exist.`,
    ``,
    `## Step 3: Competitive Research`,
    `The user said:`,
    `"${description}"`,
    ``,
    `Before designing apps, research the current landscape:`,
    `1. **Identify the top 3-5 apps/services** that address this user's interests (use web search). Look at the leading solutions — popular apps, SaaS tools, websites, and specialized platforms.`,
    `2. **Analyze their best features**: What makes each one great? What do users love? What are their core workflows?`,
    `3. **Find their gaps**: Where do they fall short? What are common complaints? What's missing? What requires paid subscriptions that could be free?`,
    ``,
    `Document your research findings briefly — you'll use them to design superior apps.`,
    ``,
    `## Step 4: Design Apps with Enso's Unique Edge`,
    `Now design apps that borrow the best ideas from the market leaders AND add what only Enso can offer:`,
    ``,
    `**Enso's unique advantages to leverage:**`,
    `- **Live web search + LLM synthesis**: Apps can search the web in real-time and use AI to synthesize, summarize, and analyze results — no stale data`,
    `- **Multi-source aggregation**: A single app can pull from multiple APIs, websites, and data sources simultaneously, then present a unified view`,
    `- **AI-powered analysis**: Every app has access to LLM calls (ctx.ask) for intelligent summarization, recommendations, trend analysis, and natural language queries`,
    `- **Local file access**: Apps can read/write local files, enabling workflows that bridge online data with the user's own documents and data`,
    `- **No account required**: Everything runs through the user's own Enso instance — no sign-ups, no subscriptions, no data sold to advertisers`,
    `- **Fully interactive UI**: Rich dashboards with charts (Recharts), data tables, tabs, accordions, dialogs — not just static text`,
    `- **Action-oriented**: Apps can trigger follow-up actions (refine, sort, filter, export) — they're tools, not just displays`,
    ``,
    `Think about what interactive tools/dashboards would help this person. Consider:`,
    `- What data do they need to access or visualize?`,
    `- What workflows could be streamlined?`,
    `- What information would they want at their fingertips?`,
    `- What actions would they want to take frequently?`,
    `- What do the best competing apps do well that we should match?`,
    `- What can we do BETTER because of Enso's live data + AI + local file access?`,
    ``,
    `## Step 5: Write the Plan`,
    `Write a JSON file to: ${planPath}`,
    ``,
    `The file must contain:`,
    `\`\`\`json`,
    `{`,
    `  "research": {`,
    `    "competitors": [`,
    `      { "name": "App Name", "strengths": ["..."], "gaps": ["..."] }`,
    `    ],`,
    `    "keyInsights": "Brief summary of what we learned and how our apps will be better"`,
    `  },`,
    `  "apps": [`,
    `    {`,
    `      "name": "Human readable name",`,
    `      "family": "snake_case_family_name",`,
    `      "description": "What this app does and why it helps the user",`,
    `      "capabilities": ["capability 1", "capability 2", "..."],`,
    `      "inspiredBy": "Which competitor features this borrows from + what Enso advantage makes it better"`,
    `    }`,
    `  ]`,
    `}`,
    `\`\`\``,
    ``,
    `## Guidelines`,
    `- Propose 2-5 apps (quality over quantity)`,
    `- Each app should be focused on one clear purpose`,
    `- Family names must be unique snake_case identifiers`,
    `- Capabilities should describe concrete features, not vague promises`,
    `- Consider what's achievable with the executor context (file access, web search, fetch, LLM)`,
    `- Don't propose apps that duplicate existing ones in openclaw-plugin/apps/`,
    `- Each app should clearly surpass what's available in the market by leveraging Enso's unique capabilities`,
    `- Prefer apps that combine data/features that competitors keep siloed in separate products`,
    ``,
    `## Important`,
    `Just write the JSON plan file and confirm what you proposed. Do NOT build any apps yet — that happens in a separate step after user approval.`,
  ].join("\n");
}

function buildAppDefinitionForMission(app: MissionAppProposal): string {
  const inspiredBy = (app as MissionAppProposal & { inspiredBy?: string }).inspiredBy;
  return [
    `Build an Enso app called "${app.name}" with family name "${app.family}".`,
    ``,
    `Description: ${app.description}`,
    ``,
    `Required capabilities:`,
    ...app.capabilities.map((c) => `- ${c}`),
    ``,
    ...(inspiredBy ? [
      `## Competitive Edge`,
      `${inspiredBy}`,
      ``,
      `When building this app, make sure it matches or exceeds the best features from existing solutions.`,
      `Leverage Enso's unique advantages — live web search (ctx.search), LLM analysis (ctx.ask),`,
      `multi-source data aggregation (ctx.fetch), and local file access (ctx.readFile) — to create`,
      `something that standalone apps and SaaS tools cannot replicate.`,
      ``,
    ] : []),
    `This app is part of a larger mission plan. Make it polished and functional.`,
    `The family name MUST be exactly "${app.family}" — do not change it.`,
  ].join("\n");
}

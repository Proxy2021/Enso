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
      apps: (raw.apps || []).map((app: any, i: number) => ({
        id: `${missionId}-app-${i}`,
        name: app.name || `App ${i + 1}`,
        family: app.family || app.name?.toLowerCase().replace(/\s+/g, "_") || `app_${i}`,
        description: app.description || "",
        capabilities: app.capabilities || [],
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
    `You are a product designer for Enso, an interactive app platform. A user has described their interests and goals. Your job is to analyze their needs and propose a set of Enso apps that would serve them well.`,
    ``,
    `## Step 1: Read the Reference Guide`,
    `Read CLAUDE-REFERENCE.md to understand what Enso apps can do — their capabilities, the component library (EnsoUI), and the executor context (ctx) which provides file access, web search, HTTP fetch, LLM calls, etc.`,
    ``,
    `## Step 2: Browse Existing Apps`,
    `Browse openclaw-plugin/apps/ to see what apps already exist. Don't propose apps that already exist.`,
    ``,
    `## Step 3: Analyze the User's Mission`,
    `The user said:`,
    `"${description}"`,
    ``,
    `Think about what interactive tools/dashboards would help this person. Consider:`,
    `- What data do they need to access or visualize?`,
    `- What workflows could be streamlined?`,
    `- What information would they want at their fingertips?`,
    `- What actions would they want to take frequently?`,
    ``,
    `## Step 4: Write the Plan`,
    `Write a JSON file to: ${planPath}`,
    ``,
    `The file must contain:`,
    `\`\`\`json`,
    `{`,
    `  "apps": [`,
    `    {`,
    `      "name": "Human readable name",`,
    `      "family": "snake_case_family_name",`,
    `      "description": "What this app does and why it helps the user",`,
    `      "capabilities": ["capability 1", "capability 2", "..."]`,
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
    ``,
    `## Important`,
    `Just write the JSON plan file and confirm what you proposed. Do NOT build any apps yet — that happens in a separate step after user approval.`,
  ].join("\n");
}

function buildAppDefinitionForMission(app: MissionAppProposal): string {
  return [
    `Build an Enso app called "${app.name}" with family name "${app.family}".`,
    ``,
    `Description: ${app.description}`,
    ``,
    `Required capabilities:`,
    ...app.capabilities.map((c) => `- ${c}`),
    ``,
    `This app is part of a larger mission plan. Make it polished and functional.`,
    `The family name MUST be exactly "${app.family}" — do not change it.`,
  ].join("\n");
}

/**
 * Team Leader — The living organization that runs Enso.
 *
 * A single coordinating agent that wakes up on a configurable schedule,
 * analyzes everything happening across the platform, prioritizes actions,
 * delegates to specialist agents, and pushes Enso's own evolution.
 *
 * The TL's north star: "Make this user's life better, every single day."
 * Whether that means delivering a focus pulse or building a missing feature.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export interface TeamLeaderConfig {
  schedule: {
    /** Full assessment + briefing. Default: "0 9 * * *" (9am daily) */
    morningRoutine: string;
    /** Lightweight scan for urgent items. Default: every 6 hours */
    checkIn: string;
  };
  channels: {
    email: boolean;
    wechat: boolean;
    inApp: boolean;
  };
  /** Whether TL can launch evolution sprints autonomously */
  autoEvolve: boolean;
}

export interface SystemSignals {
  recentErrors: Array<{ ts: number; category: string; message: string }>;
  recentActions: Array<{ ts: number; category: string; message: string }>;
  focusAnalyses: Array<{
    focusId: string; title: string; recommendedAction: string;
    actionReason: string; daysSinceActivity: number; hasUnreviewedResults: boolean;
  }>;
  cortexStats: { totalPages: number; entityCount: number; recentUpdates: string[] };
  taskResults: Array<{ taskId: string; taskName: string; status: string; firedAt: number; resultSummary?: string }>;
  platformHealth: { errorRate: number; failedTasks: string[]; uptimeHours: number };
  /** Pending user remarks awaiting processing */
  pendingRemarks: Array<{ id: string; channel: string; text: string; action?: string; contextSummary: string; timestamp: string }>;
  /** Self-queued tasks from previous cycles */
  pendingTasks: Array<{ id: string; title: string; description: string; source: string }>;
}

export interface TeamLeaderAction {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  type: "user-task" | "platform-fix" | "platform-feature" | "maintenance";
  title: string;
  reasoning: string;
  delegation: "focus" | "knowledge" | "research" | "builder" | "outreach" | "self";
  estimatedEffort: string;
  /** TL can auto-execute anything that doesn't need user's brain */
  autoExecute: boolean;
  /** True only when TL literally needs user input (preference, decision, review) */
  needsUserInput?: boolean;
  status: "proposed" | "approved" | "executing" | "completed" | "skipped";
}

export interface DailyBriefing {
  timestamp: string;
  headline: string;
  sections: Array<{ emoji: string; title: string; items: string[] }>;
  proposedActions: TeamLeaderAction[];
  textSummary: string;
  htmlEmail: string;
  wechatMessage: string;
}

/** Tasks the TL has queued for itself — processed on next routine */
export interface QueuedTask {
  id: string;
  title: string;
  description: string;
  /** Where this task came from */
  source: "self" | "user-remark" | "error-detected" | "follow-up";
  /** When this was queued */
  createdAt: string;
  /** Has this been processed? */
  processed: boolean;
  processedAt?: string;
  result?: string;
}

interface TeamLeaderState {
  lastMorningRoutineAt: string | null;
  lastCheckInAt: string | null;
  lastBriefing: DailyBriefing | null;
  recentActions: TeamLeaderAction[];
  /** Tasks the TL has assigned to itself for next cycle */
  taskQueue: QueuedTask[];
}

// ── Paths ──

const ENSO_HOME = join(homedir(), ".enso");
const CONFIG_PATH = join(ENSO_HOME, "data", "team-leader-config.json");
const STATE_PATH = join(ENSO_HOME, "data", "team-leader-state.json");

// ── Config ──

const DEFAULT_CONFIG: TeamLeaderConfig = {
  schedule: {
    morningRoutine: "0 9 * * *",
    checkIn: "0 */6 * * *",
  },
  channels: { email: true, wechat: true, inApp: true },
  autoEvolve: false,
};

export function loadConfig(): TeamLeaderConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Partial<TeamLeaderConfig>;
      return { ...DEFAULT_CONFIG, ...raw, schedule: { ...DEFAULT_CONFIG.schedule, ...(raw.schedule || {}) }, channels: { ...DEFAULT_CONFIG.channels, ...(raw.channels || {}) } };
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: TeamLeaderConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  logAction({ ts: Date.now(), type: "action", category: "team-leader", message: "Config updated" });
}

// ── State ──

function loadState(): TeamLeaderState {
  const defaults: TeamLeaderState = { lastMorningRoutineAt: null, lastCheckInAt: null, lastBriefing: null, recentActions: [], taskQueue: [] };
  try {
    if (existsSync(STATE_PATH)) {
      const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      return { ...defaults, ...raw };
    }
  } catch { /* fresh state */ }
  return defaults;
}

function saveState(state: TeamLeaderState): void {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

// ── 1. Gather Signals (zero LLM) ──

export async function gatherSignals(): Promise<SystemSignals> {
  // Action log
  const { getRecentLog } = await import("./action-log.js");
  const rawErrors = getRecentLog(30, "error");
  const rawActions = getRecentLog(80, "action");
  const recentErrors = rawErrors.map(e => ({ ts: e.ts, category: e.category || "", message: e.message || "" }));
  const recentActions = rawActions.map(e => ({ ts: e.ts, category: e.category || "", message: e.message || "" }));

  // Focus areas
  let focusAnalyses: SystemSignals["focusAnalyses"] = [];
  try {
    const { analyzeFocusAreas } = await import("./focus-agent.js");
    const analyses = await analyzeFocusAreas();
    focusAnalyses = analyses.map(a => ({
      focusId: a.focusId, title: a.title, recommendedAction: a.recommendedAction,
      actionReason: a.actionReason, daysSinceActivity: a.daysSinceActivity, hasUnreviewedResults: a.hasUnreviewedResults,
    }));
  } catch { /* focus agent not available */ }

  // Cortex stats
  let cortexStats: SystemSignals["cortexStats"] = { totalPages: 0, entityCount: 0, recentUpdates: [] };
  try {
    const { readIndex } = await import("./cortex-tools.js");
    const index = readIndex();
    cortexStats.totalPages = index.length;
    const { getEntityIndex } = await import("./entity-model.js");
    cortexStats.entityCount = getEntityIndex().size;
    cortexStats.recentUpdates = index
      .filter(e => e.updated)
      .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
      .slice(0, 5)
      .map(e => `${e.title} (${e.path})`);
  } catch { /* cortex not available */ }

  // Scheduled task results (last 24h)
  let taskResults: SystemSignals["taskResults"] = [];
  try {
    const { listTasks, getTaskRuns } = await import("./scheduled-tasks.js");
    const allTasks = listTasks();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const task of allTasks) {
      const runs = getTaskRuns(task.taskId, 5);
      for (const run of runs) {
        if (run.firedAt >= cutoff) {
          taskResults.push({
            taskId: task.taskId, taskName: task.name, status: run.status,
            firedAt: run.firedAt, resultSummary: run.resultSummary,
          });
        }
      }
    }
  } catch { /* scheduler not available */ }

  // Platform health
  const errorRate = recentErrors.length / Math.max(recentActions.length, 1);
  const failedTasks = taskResults.filter(r => r.status === "failed").map(r => r.taskName);

  // Pending user remarks
  let pendingRemarks: SystemSignals["pendingRemarks"] = [];
  try {
    const { getPendingRemarks } = await import("./remarks.js");
    pendingRemarks = getPendingRemarks().map(r => ({
      id: r.id,
      channel: r.channel,
      text: r.text,
      action: r.action,
      contextSummary: `${r.context.type}: ${r.context.summary}`,
      timestamp: r.timestamp,
    }));
  } catch { /* remarks system not available */ }

  // Self-queued tasks from previous cycles
  const pendingTasks = getPendingTasks().map(t => ({
    id: t.id, title: t.title, description: t.description, source: t.source,
  }));

  return {
    recentErrors, recentActions, focusAnalyses, cortexStats, taskResults,
    platformHealth: { errorRate, failedTasks, uptimeHours: Math.round(process.uptime() / 3600) },
    pendingRemarks, pendingTasks,
  };
}

// ── 2. Assess & Prioritize (LLM) ──

export async function assessAndPrioritize(signals: SystemSignals): Promise<TeamLeaderAction[]> {
  const { llm } = await import("./llm.js");
  const config = loadConfig();

  // Build compact signal summary for LLM
  const signalText = [
    `## Platform Health`,
    `Error rate: ${(signals.platformHealth.errorRate * 100).toFixed(1)}% | Failed tasks: ${signals.platformHealth.failedTasks.join(", ") || "none"} | Uptime: ${signals.platformHealth.uptimeHours}h`,
    signals.recentErrors.length > 0 ? `Recent errors (${signals.recentErrors.length}):\n${signals.recentErrors.slice(0, 5).map(e => `  - [${e.category}] ${e.message}`).join("\n")}` : "No recent errors.",
    "",
    `## Focus Areas (${signals.focusAnalyses.length} active)`,
    ...signals.focusAnalyses.map(f =>
      `- "${f.title}" — ${f.recommendedAction}: ${f.actionReason}${f.hasUnreviewedResults ? " [UNREVIEWED RESULTS]" : ""} (${f.daysSinceActivity}d inactive)`
    ),
    "",
    `## Cortex`,
    `${signals.cortexStats.totalPages} wiki pages, ${signals.cortexStats.entityCount} entities`,
    signals.cortexStats.recentUpdates.length > 0 ? `Recent: ${signals.cortexStats.recentUpdates.join(", ")}` : "No recent updates.",
    "",
    `## Scheduled Tasks (last 24h)`,
    signals.taskResults.length > 0
      ? signals.taskResults.map(t => `- ${t.taskName}: ${t.status}${t.resultSummary ? ` — ${t.resultSummary.slice(0, 100)}` : ""}`).join("\n")
      : "No task runs in last 24h.",
    "",
    `## User Remarks (${signals.pendingRemarks.length} pending)`,
    signals.pendingRemarks.length > 0
      ? signals.pendingRemarks.map(r => `- [${r.channel}] "${r.text}" (re: ${r.contextSummary}) — ${r.action || "custom"}`).join("\n")
      : "No pending remarks from user.",
    "",
    `## Self-Queued Tasks (${signals.pendingTasks.length} pending)`,
    signals.pendingTasks.length > 0
      ? signals.pendingTasks.map(t => `- "${t.title}": ${t.description} (source: ${t.source})`).join("\n")
      : "No self-queued tasks.",
  ].join("\n");

  const prompt = `You are the Team Leader of Enso, a personal AI assistant platform.
Your single mission: make this user's life better, every single day.
You can serve the user directly (focus pulse, research, recommendations) OR improve Enso itself (fix bugs, build features, improve UX). Both count as serving the user.

TODAY'S SYSTEM STATE:
${signalText}

AUTONOMY POLICY:
You are the decision-maker. You should AUTO-EXECUTE anything that:
- Does not require the user's ideas, opinions, or creative input
- You are confident is the right thing to do for Enso
- Includes: fixing bugs, enriching data, running evaluations, triggering research, building features, resolving errors

You should PROPOSE (not auto-execute) only when:
- The action requires the user's personal preference or creative direction (e.g., "which goal matters more?")
- The action is irreversible AND you're unsure it's correct
- The user explicitly needs to review something (e.g., sprint results they haven't seen)

When in doubt, ACT. The user wants a proactive partner, not a cautious assistant.
Do NOT defer work to "next cycle" — execute everything you can right now.
You can also CREATE NEW TASKS for yourself if you identify follow-up work during assessment.
You run the organization. Be decisive, be thorough, be proactive.

Produce a prioritized action plan as a JSON array. Include 3-7 actions, most impactful first.

[
  {
    "priority": "critical|high|medium|low",
    "type": "user-task|platform-fix|platform-feature|maintenance",
    "title": "concise action title",
    "reasoning": "WHY this matters — reference specific signals",
    "delegation": "focus|knowledge|research|builder|outreach|self",
    "estimatedEffort": "5min|15min|30min|1h|sprint",
    "autoExecute": true/false,
    "needsUserInput": true/false
  }
]

Rules:
- Reference SPECIFIC data from the signals (error counts, focus area names, entity counts)
- "reasoning" must explain impact on the user, not just describe the action
- "autoExecute" = true for ANYTHING that doesn't need the user's brain. Effort is irrelevant.
- "needsUserInput" = true ONLY when you literally need the user to tell you something (a preference, a decision, a review)
- For recurring errors (same error appearing multiple times), prioritize as critical and auto-execute the fix
- Include at least one platform improvement if any gaps are visible
- Order by impact, not effort`;

  const response = await llm({
    prompt,
    tier: "utility",
    maxOutputTokens: 4000,
    responseMimeType: "application/json",
    temperature: 0.3,
    timeoutMs: 30_000,
  });

  // Robust JSON parsing
  let jsonStr = response.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const braceStart = jsonStr.indexOf("[");
  const braceEnd = jsonStr.lastIndexOf("]");
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }

  const raw = JSON.parse(jsonStr) as Array<Omit<TeamLeaderAction, "id" | "status">>;
  return raw.map(a => ({
    ...a,
    id: randomUUID(),
    status: "proposed" as const,
  }));
}

// ── 3. Generate Briefing (LLM) ──

export async function generateBriefing(signals: SystemSignals, actions: TeamLeaderAction[]): Promise<DailyBriefing> {
  const { llm } = await import("./llm.js");

  const actionsText = actions.map((a, i) =>
    `${i + 1}. [${a.priority}] ${a.title} — ${a.reasoning} (${a.delegation}, ${a.estimatedEffort})`
  ).join("\n");

  const prompt = `You are writing the daily briefing for Enso's user. Be concise, warm, and actionable.

SYSTEM STATE SUMMARY:
- ${signals.focusAnalyses.length} active focus areas, ${signals.focusAnalyses.filter(f => f.hasUnreviewedResults).length} with unreviewed results
- ${signals.cortexStats.totalPages} Cortex pages, ${signals.cortexStats.entityCount} entities
- ${signals.platformHealth.failedTasks.length} failed tasks, ${(signals.platformHealth.errorRate * 100).toFixed(0)}% error rate
- ${signals.taskResults.filter(t => t.status === "success").length} tasks completed in last 24h

ACTION PLAN:
${actionsText}

Generate JSON:
{
  "headline": "short headline like '2 things done, 1 needs your input'",
  "sections": [
    { "emoji": "🎯", "title": "section title", "items": ["item 1", "item 2"] }
  ],
  "textSummary": "full text version for WeChat (compact, no HTML)",
  "wechatMessage": "ultra-compact version under 500 chars for WeChat push"
}

Rules:
- headline: max 60 chars, quantified ("3 done, 1 needs input" not "Updates available")
- sections: 2-4 sections. "What I Did" for completed, "Needs Your Input" for approval-needed, "Coming Up" for planned
- Each item: one line, starts with emoji, references specific deliverable/focus/entity names
- textSummary: 5-15 lines, no markdown formatting
- wechatMessage: 2-4 lines, just the essentials`;

  const response = await llm({
    prompt,
    tier: "fast",
    maxOutputTokens: 3000,
    responseMimeType: "application/json",
    temperature: 0.4,
    timeoutMs: 20_000,
  });

  let jsonStr = response.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const bs = jsonStr.indexOf("{");
  const be = jsonStr.lastIndexOf("}");
  if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);

  const parsed = JSON.parse(jsonStr) as {
    headline: string;
    sections: Array<{ emoji: string; title: string; items: string[] }>;
    textSummary: string;
    wechatMessage: string;
  };

  // Register notification context for remark tracking
  let notificationId = "";
  try {
    const { registerNotification, emailRemarkActions } = await import("./remarks.js");
    notificationId = registerNotification(
      { type: "briefing", summary: parsed.headline },
      { isEmail: true },
    );
  } catch { /* remarks system not critical */ }

  // Build HTML email
  const sectionHtml = parsed.sections.map(s => {
    const itemsHtml = s.items.map(item =>
      `<div style="padding:8px 0;border-bottom:1px solid #1f2937;font-size:14px;color:#d1d5db;">${item}</div>`
    ).join("");
    return `<div style="margin-bottom:20px;">
      <h3 style="font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">${s.emoji} ${s.title}</h3>
      ${itemsHtml}
    </div>`;
  }).join("");

  // Build remark actions for email footer
  let remarkActionsHtml = "";
  if (notificationId) {
    try {
      const { emailRemarkActions } = await import("./remarks.js");
      remarkActionsHtml = emailRemarkActions(notificationId, getEnsoUrl());
    } catch { /* non-critical */ }
  }

  const htmlEmail = `<div style="max-width:600px;margin:0 auto;background:#111827;border-radius:12px;overflow:hidden;font-family:-apple-system,sans-serif;color:#f9fafb;">
    <div style="background:linear-gradient(135deg,#1e1b4b,#4c1d95);padding:20px 24px;">
      <h2 style="margin:0;font-size:18px;color:#fff;">Enso Daily Briefing</h2>
      <p style="margin:4px 0 0;font-size:14px;color:#c4b5fd;">${parsed.headline}</p>
    </div>
    <div style="padding:20px 24px;">
      ${sectionHtml}
      ${remarkActionsHtml}
    </div>
    <div style="padding:16px 24px;text-align:center;border-top:1px solid #1f2937;">
      <a href="${getEnsoUrl()}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Open Enso →</a>
    </div>
  </div>`;

  return {
    timestamp: new Date().toISOString(),
    headline: parsed.headline,
    sections: parsed.sections,
    proposedActions: actions,
    textSummary: parsed.textSummary,
    htmlEmail,
    wechatMessage: parsed.wechatMessage,
  };
}

// ── 4. Deliver Briefing ──

export async function deliverBriefing(briefing: DailyBriefing): Promise<string[]> {
  const config = loadConfig();
  const delivered: string[] = [];

  // In-app
  if (config.channels.inApp) {
    try {
      const { getAllClients } = await import("./server.js");
      const { persistCard } = await import("./memory-bridge.js");
      const clients = getAllClients();
      if (clients.length > 0) {
        const client = clients[0];
        const cardId = randomUUID();
        persistCard(client.id, "main", {
          id: cardId, runId: cardId, type: "chat", role: "assistant",
          text: `📋 **Enso Daily** — ${briefing.headline}\n\n${briefing.textSummary}`,
          timestamp: Date.now(),
        });
        client.send({
          id: cardId, runId: cardId, sessionKey: client.sessionKey,
          seq: 0, state: "final" as const,
          text: `📋 **Enso Daily** — ${briefing.headline}\n\n${briefing.textSummary}`,
          conversationId: "main", timestamp: Date.now(),
        });
        delivered.push("in-app");
      }
    } catch (err) {
      logError("team-leader", "In-app delivery failed", err);
    }
  }

  // Email
  if (config.channels.email) {
    try {
      const { getNotifyEmail } = await import("./shareable-pages.js");
      const email = getNotifyEmail();
      if (email) {
        const { sendHtmlEmail } = await import("./email.js");
        const result = await sendHtmlEmail({
          to: email,
          subject: `📋 Enso Daily — ${briefing.headline}`,
          html: briefing.htmlEmail,
          textFallback: briefing.textSummary,
        });
        if (result.success) delivered.push("email");
      }
    } catch (err) {
      logError("team-leader", "Email delivery failed", err);
    }
  }

  // WeChat
  if (config.channels.wechat) {
    try {
      const { getFollowerOpenIds, isWithinServiceWindow, sendTextMessage } = await import("./wechat.js");
      const followers = await getFollowerOpenIds();
      for (const openId of followers) {
        if (!isWithinServiceWindow(openId)) continue;
        const result = await sendTextMessage(openId, `📋 Enso Daily\n${briefing.wechatMessage}`);
        if (result.success) delivered.push("wechat");
        break;
      }
    } catch (err) {
      logError("team-leader", "WeChat delivery failed", err);
    }
  }

  return delivered;
}

// ── 5. Execute Actions ──

export async function executeActions(actions: TeamLeaderAction[]): Promise<TeamLeaderAction[]> {
  for (const action of actions) {
    // Only auto-execute if the LLM determined this doesn't need user input
    if (!action.autoExecute) continue;

    try {
      action.status = "executing";

      switch (action.delegation) {
        case "focus": {
          // Focus-related actions: pulse, evaluate, analyze
          const { generateProgressPulse, analyzeFocusAreas } = await import("./focus-agent.js");
          if (action.type === "user-task" && action.title.toLowerCase().includes("pulse")) {
            await generateProgressPulse();
          } else {
            await analyzeFocusAreas(); // Refresh analysis
          }
          action.status = "completed";
          break;
        }

        case "knowledge": {
          // Cortex operations: enrichment, cross-referencing, gap filling
          const { enrichNewEntities, crossReferenceNewEntities } = await import("./cortex-enrichment.js");
          const { getEntityIndex } = await import("./entity-model.js");
          const index = getEntityIndex();
          // Find entities needing enrichment
          const untagged = Array.from(index.values())
            .filter(e => !e.semanticTags?.length)
            .slice(0, 30)
            .map(e => e.entityId);
          const underConnected = Array.from(index.values())
            .filter(e => !e.crossReferences?.length)
            .slice(0, 20)
            .map(e => e.entityId);
          if (untagged.length > 0) await enrichNewEntities(untagged);
          if (underConnected.length > 0) await crossReferenceNewEntities(underConnected);
          action.status = "completed";
          break;
        }

        case "builder": {
          // Launch a real Claude Code session to fix/build
          await launchBuilderTask(action);
          break;
        }

        case "research": {
          // Launch a Claude Code research session
          await launchBuilderTask(action);
          break;
        }

        case "outreach": {
          // Notification/communication tasks — already handled by briefing delivery
          action.status = "completed";
          break;
        }

        case "self": {
          // TL handles directly — log and complete
          action.status = "completed";
          break;
        }

        default:
          action.status = "completed";
      }

      if (action.status === "completed") {
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Executed: "${action.title}" (${action.delegation})` });
      }
    } catch (err) {
      logError("team-leader", `Failed to execute "${action.title}"`, err);
      action.status = "proposed"; // Fall back to user visibility on failure
    }
  }

  return actions;
}

// ── 5b. Launch Builder/Research Tasks via Claude Code ──

/**
 * Launch a task via Claude Code (simple) or orchestration (complex).
 *
 * Simple tasks (≤30min, single-agent): Direct Claude Code session
 * Complex tasks (sprint-level, multi-agent): Full orchestration with DAG
 */
async function launchBuilderTask(action: TeamLeaderAction): Promise<void> {
  const isComplex = action.estimatedEffort === "sprint" || action.estimatedEffort === "1h";

  if (isComplex) {
    // Full orchestration — multi-agent team with DAG execution
    await launchOrchestration(action);
  } else {
    // Simple — single Claude Code session
    await launchClaudeCodeSession(action);
  }
}

/** Launch a single Claude Code session for simple tasks */
async function launchClaudeCodeSession(action: TeamLeaderAction): Promise<void> {
  try {
    const { runClaudeCode } = await import("./claude-code.js");
    const { getAllClients } = await import("./server.js");

    const clients = getAllClients();
    let client: unknown;
    if (clients.length > 0) {
      client = clients[0];
    } else {
      const noop = () => {};
      client = {
        id: "team-leader-builder",
        sessionKey: "team-leader",
        ws: { send: noop, readyState: 1, close: noop, on: noop, off: noop, ping: noop },
        send: noop,
        _disconnectedBuffer: [],
        conversationId: "default",
      };
    }

    const runId = randomUUID();
    const prompt = `[Team Leader Task: ${action.title}]

You are executing a task assigned by the Enso Team Leader.

TASK: ${action.title}
TYPE: ${action.type}
PRIORITY: ${action.priority}
REASONING: ${action.reasoning}

The Enso codebase is at D:/Github/Enso. Execute this task now.
Be thorough but focused. When done, summarize what you changed.`;

    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Launching Claude Code session for: "${action.title}"` });

    runClaudeCode({
      prompt,
      client: client as Parameters<typeof runClaudeCode>[0]["client"],
      runId,
      targetCardId: `tl-${action.id.slice(0, 8)}`,
      model: "sonnet",
      skipPersist: true,
    }).then(() => {
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Claude Code task completed: "${action.title}"` });
    }).catch(err => {
      logError("team-leader", `Claude Code task failed: "${action.title}"`, err);
    });

    action.status = "executing";
  } catch (err) {
    logError("team-leader", `Failed to launch Claude Code for "${action.title}"`, err);
    action.status = "proposed";
  }
}

/** Launch a full orchestration sprint for complex multi-agent tasks */
async function launchOrchestration(action: TeamLeaderAction): Promise<void> {
  try {
    const { handleOrchestration } = await import("./orchestrator.js");
    const { getAllClients, getActiveAccount } = await import("./server.js");

    const clients = getAllClients();
    const account = getActiveAccount();
    if (!account) {
      logError("team-leader", `Cannot launch orchestration for "${action.title}" — no active account`);
      action.status = "proposed";
      return;
    }

    // Use connected client or create a headless one
    let client: unknown;
    if (clients.length > 0) {
      client = clients[0];
    } else {
      const noop = () => {};
      client = {
        id: "team-leader-orchestrator",
        sessionKey: "team-leader",
        ws: { send: noop, readyState: 1, close: noop, on: noop, off: noop, ping: noop },
        send: noop,
        _disconnectedBuffer: [],
        conversationId: "default",
      };
    }

    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Launching orchestration sprint for: "${action.title}"` });

    handleOrchestration({
      userMessage: `[Team Leader] ${action.title}`,
      classification: { complexity: "orchestrated" as const, reasoning: `Team Leader priority: ${action.reasoning}` },
      client: client as Parameters<typeof handleOrchestration>[0]["client"],
      account,
      skipApproval: true,
      maxConcurrency: 3,
      useGeminiPlanning: true,
      onComplete: async (orchId, status) => {
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Orchestration ${status} for: "${action.title}" (${orchId})` });
      },
    }).catch(err => {
      logError("team-leader", `Orchestration failed for "${action.title}"`, err);
    });

    action.status = "executing";
  } catch (err) {
    logError("team-leader", `Failed to launch orchestration for "${action.title}"`, err);
    action.status = "proposed";
  }
}

// ── 5c. Self-Tasking ──

/**
 * TL queues a task for immediate or next-cycle execution.
 * Called during assessment when TL identifies follow-up work.
 */
export function queueTask(task: Omit<QueuedTask, "id" | "createdAt" | "processed">): QueuedTask {
  const state = loadState();
  const queued: QueuedTask = {
    ...task,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    processed: false,
  };
  state.taskQueue.push(queued);
  // Keep queue manageable
  if (state.taskQueue.length > 100) state.taskQueue = state.taskQueue.slice(-100);
  saveState(state);
  logAction({ ts: Date.now(), type: "action", category: "team-leader",
    message: `Self-tasked: "${task.title}" (source: ${task.source})` });
  return queued;
}

/**
 * Get pending queued tasks (for inclusion in next signal gathering).
 */
export function getPendingTasks(): QueuedTask[] {
  return loadState().taskQueue.filter(t => !t.processed);
}

// ── 6. Morning Routine (full pipeline) ──

export async function runMorningRoutine(): Promise<DailyBriefing> {
  logAction({ ts: Date.now(), type: "action", category: "team-leader", message: "Morning routine starting..." });

  // 1. Gather signals
  const signals = await gatherSignals();
  logAction({ ts: Date.now(), type: "action", category: "team-leader",
    message: `Signals: ${signals.focusAnalyses.length} focus areas, ${signals.recentErrors.length} errors, ${signals.taskResults.length} task runs` });

  // 2. Assess & prioritize
  const actions = await assessAndPrioritize(signals);
  logAction({ ts: Date.now(), type: "action", category: "team-leader",
    message: `Plan: ${actions.length} actions prioritized` });

  // 3. Execute auto-executable actions
  const executedActions = await executeActions(actions);
  const completed = executedActions.filter(a => a.status === "completed").length;
  const proposed = executedActions.filter(a => a.status === "proposed").length;

  // 3b. Mark pending remarks as processed (TL has seen them and incorporated into plan)
  if (signals.pendingRemarks.length > 0) {
    try {
      const { resolveRemark } = await import("./remarks.js");
      for (const r of signals.pendingRemarks) {
        resolveRemark(r.id, `Processed in morning routine — incorporated into ${actions.length} action plan`);
      }
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Processed ${signals.pendingRemarks.length} user remark(s)` });
    } catch { /* best effort */ }
  }

  // 4. Generate briefing
  const briefing = await generateBriefing(signals, executedActions);

  // 5. Deliver
  const channels = await deliverBriefing(briefing);

  // 6. Save state
  const state = loadState();
  state.lastMorningRoutineAt = new Date().toISOString();
  state.lastBriefing = briefing;
  state.recentActions = [...executedActions, ...state.recentActions].slice(0, 50);
  saveState(state);

  logAction({ ts: Date.now(), type: "action", category: "team-leader",
    message: `Morning routine complete: ${completed} executed, ${proposed} proposed, delivered via [${channels.join(", ")}]` });

  return briefing;
}

// ── 7. Quick Check-In (lightweight) ──

export async function runCheckIn(): Promise<{ urgent: boolean; message: string }> {
  logAction({ ts: Date.now(), type: "action", category: "team-leader", message: "Check-in starting..." });

  const signals = await gatherSignals();

  // Check for urgent items only
  const urgent = signals.recentErrors.filter(e => Date.now() - e.ts < 6 * 60 * 60 * 1000);
  const unreviewedFocus = signals.focusAnalyses.filter(f => f.hasUnreviewedResults);
  const failedTasks = signals.platformHealth.failedTasks;

  if (urgent.length === 0 && unreviewedFocus.length === 0 && failedTasks.length === 0) {
    const state = loadState();
    state.lastCheckInAt = new Date().toISOString();
    saveState(state);
    return { urgent: false, message: "All clear — no urgent items." };
  }

  // Something needs attention — notify
  const items: string[] = [];
  if (urgent.length > 0) items.push(`${urgent.length} error(s) in last 6h`);
  if (unreviewedFocus.length > 0) items.push(`${unreviewedFocus.length} focus area(s) with unreviewed results`);
  if (failedTasks.length > 0) items.push(`${failedTasks.length} failed task(s): ${failedTasks.join(", ")}`);

  const message = `⚠️ Attention needed: ${items.join("; ")}`;

  // Deliver alert via available channels
  const config = loadConfig();
  if (config.channels.email) {
    try {
      const { getNotifyEmail } = await import("./shareable-pages.js");
      const email = getNotifyEmail();
      if (email) {
        const { sendHtmlEmail } = await import("./email.js");
        await sendHtmlEmail({
          to: email,
          subject: `⚠️ Enso Alert — ${items.length} item(s) need attention`,
          html: `<div style="max-width:600px;margin:0 auto;background:#111827;border-radius:12px;padding:24px;font-family:-apple-system,sans-serif;color:#f9fafb;">
            <h2 style="color:#fbbf24;margin:0 0 12px;">⚠️ Enso Alert</h2>
            <ul style="color:#d1d5db;font-size:14px;">${items.map(i => `<li>${i}</li>`).join("")}</ul>
            <a href="${getEnsoUrl()}" style="display:inline-block;margin-top:16px;background:#7c3aed;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:14px;">Open Enso →</a>
          </div>`,
          textFallback: message,
        });
      }
    } catch { /* best effort */ }
  }

  const state = loadState();
  state.lastCheckInAt = new Date().toISOString();
  saveState(state);

  logAction({ ts: Date.now(), type: "action", category: "team-leader", message: `Check-in: ${message}` });
  return { urgent: true, message };
}

// ── Tool Registration ──

export function createTeamLeaderTools(): Array<import("./local-types.js").EnsoAgentTool> {
  return [
    {
      name: "enso_team_leader",
      label: "Team Leader",
      description:
        "Run the Team Leader's morning routine — analyzes the entire Enso system, prioritizes actions, " +
        "delegates to specialist agents, and delivers a unified daily briefing via email/WeChat/in-app. " +
        "Use when the user asks about system status, daily briefing, or says '/briefing' or '/morning'.",
      isPrimary: true,
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["morning", "checkin"],
            description: "morning = full routine with briefing, checkin = quick scan for urgent items",
          },
        },
        additionalProperties: false,
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        const mode = (params.mode as string) || "morning";
        if (mode === "checkin") {
          const result = await runCheckIn();
          return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_team_leader", mode: "checkin", ...result }) }] };
        }
        const briefing = await runMorningRoutine();
        return { content: [{ type: "text", text: JSON.stringify({
          tool: "enso_team_leader", mode: "morning",
          headline: briefing.headline,
          sections: briefing.sections,
          actions: briefing.proposedActions.map(a => ({ title: a.title, priority: a.priority, status: a.status })),
          message: briefing.textSummary,
        }) }] };
      },
    },
  ];
}

// ── Public Accessors ──

export function getLastBriefing(): DailyBriefing | null {
  return loadState().lastBriefing;
}

export function getTeamLeaderState(): TeamLeaderState {
  return loadState();
}

// ── Helpers ──

function parseEffort(effort: string): number {
  if (effort.includes("sprint") || effort.includes("orchestration")) return 120;
  const match = effort.match(/(\d+)\s*(min|h)/);
  if (!match) return 60;
  const num = parseInt(match[1], 10);
  return match[2] === "h" ? num * 60 : num;
}

function getEnsoUrl(): string {
  const name = process.env.ENSO_MACHINE_NAME || hostname();
  return process.env.ENSO_TUNNEL_URL || `https://${name}.enso.net`;
}

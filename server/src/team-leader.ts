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
    focusId: string; title: string; focusType?: string; recommendedAction: string;
    actionReason: string; daysSinceActivity: number; hasUnreviewedResults: boolean;
    experts: Array<{ id: string; name: string; role: string; hasConversation: boolean }>;
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

/** Tracks a background task launched by the TL */
interface BackgroundTask {
  actionId: string;
  actionTitle: string;
  type: "claude-code" | "orchestration";
  launchedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  result?: string;
}

interface TeamLeaderState {
  lastMorningRoutineAt: string | null;
  lastCheckInAt: string | null;
  lastBriefing: DailyBriefing | null;
  recentActions: TeamLeaderAction[];
  /** Tasks the TL has assigned to itself for next cycle */
  taskQueue: QueuedTask[];
  /** Background tasks from the current/last routine */
  backgroundTasks: BackgroundTask[];
  /** Whether a restart is pending (code was changed by a TL session) */
  restartPending: boolean;
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
  const defaults: TeamLeaderState = { lastMorningRoutineAt: null, lastCheckInAt: null, lastBriefing: null, recentActions: [], taskQueue: [], backgroundTasks: [], restartPending: false };
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
      focusId: a.focusId, title: a.title, focusType: a.focusType, recommendedAction: a.recommendedAction,
      actionReason: a.actionReason, daysSinceActivity: a.daysSinceActivity, hasUnreviewedResults: a.hasUnreviewedResults,
      experts: a.experts,
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
    ...signals.focusAnalyses.map(f => {
      let expertLine: string;
      if (f.experts.length > 0) {
        const expertDetails = f.experts.map(e => {
          const m = (e as Record<string, unknown>).metrics as { conversationCount?: number; lastActiveAt?: string | null; sprintCount?: number; lastEvaluation?: string } | undefined;
          const convos = m?.conversationCount ?? 0;
          const lastActive = m?.lastActiveAt ? `${Math.floor((Date.now() - new Date(m.lastActiveAt).getTime()) / 86400000)}d ago` : "never";
          const eval_ = m?.lastEvaluation ? ` [eval: ${m.lastEvaluation}]` : "";
          return `${e.name} (${e.role}, ${convos} convos, active: ${lastActive}${eval_})`;
        }).join("; ");
        expertLine = `\n    Expert team (${f.experts.length}): ${expertDetails}`;
      } else {
        expertLine = "\n    ⚠️ No expert team — NEEDS STAFFING";
      }
      // Include assessment data if available
      const assessment = (f as Record<string, unknown>).assessment as { understanding?: number; progress?: number } | undefined;
      const assessLine = assessment ? ` | Understanding: ${assessment.understanding}%, Progress: ${assessment.progress}%` : "";
      return `- "${f.title}" [${f.focusType || "general"}] — ${f.recommendedAction}: ${f.actionReason}${f.hasUnreviewedResults ? " [UNREVIEWED RESULTS]" : ""} (${f.daysSinceActivity}d inactive)${assessLine}${expertLine}`;
    }),
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
You are the decision-maker. You drive the ENTIRE focus evolution cycle autonomously.

FOCUS EVOLUTION — YOU DRIVE THIS, NOT THE USER:
- Focus has no evaluation? → Auto-execute: "Evaluate [focus name]" (delegation: focus)
- Focus is evaluated but no sprint? → Auto-execute: "Launch evolution sprint for [focus name]" (delegation: focus)
- Focus has sprint results? → Auto-execute: "Review results for [focus name]" (delegation: focus)
  The review handler will use LLM to decide if user action is genuinely needed.
  Most results DON'T need user involvement — only surface items when the user needs to
  personally READ, DECIDE, or APPLY something in real life.
- After review, queue next evaluation cycle automatically.

The user should NOT be a bottleneck in the evolution loop. You drive progress.
Only pull the user in when their brain is genuinely needed.

GENERAL AUTONOMY:
- AUTO-EXECUTE anything that doesn't require the user's ideas, opinions, or creative input
- This includes: fixing bugs, enriching data, running evaluations, launching sprints, reviewing results, building features
- PROPOSE (not auto-execute) ONLY when the action requires personal preference, creative direction, or a real-life decision
- When in doubt, ACT. The user wants a proactive partner, not a cautious assistant.
- Do NOT defer work to "next cycle" — execute everything you can right now.
- CREATE NEW TASKS for yourself when you identify follow-up work.
- You run the organization. Be decisive, be thorough, be proactive.

EXPERT TEAM MANAGEMENT (you own the org chart):
- If ANY focus area has NO experts yet → ALWAYS create an action to "Generate expert team for [focus]" with delegation "focus"
- If experts have 0 conversations and have never been active → flag for restructuring or outreach
- If the focus direction has shifted significantly since experts were created → create "Restructure expert team for [focus]" action
- Periodically (at least weekly) create "Evaluate expert teams" actions to review team performance
- Consider "Team sync for [focus]" if experts haven't been consulted in 7+ days
- Use delegation "focus" for all expert management actions (staffing, evaluation, restructuring)
- Title patterns the system recognizes: "Generate/Staff/Assign expert team...", "Evaluate/Review expert...", "Restructure/Replace/Remove expert..."

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

        // Send individual attention cards for proposed actions that need user input
        const proposedActions = briefing.proposedActions.filter(a => a.status === "proposed" || a.needsUserInput);
        if (proposedActions.length > 0) {
          // Match actions to focus areas for actionable links
          let focusAreas: Array<{ id: string; title: string }> = [];
          try {
            const { loadFocusState } = await import("./focus-areas.js");
            const state = loadFocusState();
            focusAreas = (state?.areas || []).map(a => ({ id: a.id, title: a.title }));
          } catch { /* focus areas not available */ }

          const actionLines = proposedActions.map(a => {
            const titleLower = a.title.toLowerCase();
            const matched = focusAreas.find(f => titleLower.includes(f.title.toLowerCase()));
            const pEmoji = a.priority === "critical" ? "🔴" : a.priority === "high" ? "🟠" : a.priority === "medium" ? "🟡" : "⚪";
            // Give a direct instruction the user can act on
            let actionHint = "";
            if (matched) {
              if (titleLower.includes("review")) actionHint = `\n→ Go to **Focus** tab → **${matched.title}** → click **📬 Review Results**`;
              else if (titleLower.includes("discuss")) actionHint = `\n→ Go to **Focus** tab → **${matched.title}** → click **💬 Discuss**`;
              else actionHint = `\n→ Go to **Focus** tab → **${matched.title}**`;
            }
            return `${pEmoji} **${a.title}**\n${a.reasoning}${actionHint}`;
          }).join("\n\n");

          const attentionCardId = randomUUID();
          const attentionText = `🙋 **Needs Your Input** (${proposedActions.length} item${proposedActions.length > 1 ? "s" : ""})\n\n${actionLines}`;
          persistCard(client.id, "main", {
            id: attentionCardId, runId: attentionCardId, type: "chat", role: "assistant",
            text: attentionText, timestamp: Date.now() + 1,
          });
          client.send({
            id: attentionCardId, runId: attentionCardId, sessionKey: client.sessionKey,
            seq: 0, state: "final" as const,
            text: attentionText,
            conversationId: "main", timestamp: Date.now() + 1,
          });
        }

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
          // Focus-related actions: pulse, evaluate, analyze, expert staffing
          const titleLower = action.title.toLowerCase();

          if (titleLower.includes("expert") && (titleLower.includes("generate") || titleLower.includes("staff") || titleLower.includes("assign"))) {
            // Expert team generation — find which focus area(s) need staffing
            await handleExpertStaffing(action);
          } else if (titleLower.includes("expert") && (titleLower.includes("evaluat") || titleLower.includes("review") || titleLower.includes("sync"))) {
            // Expert team evaluation / sync
            await handleExpertEvaluation(action);
          } else if (titleLower.includes("expert") && (titleLower.includes("restructur") || titleLower.includes("replace") || titleLower.includes("remove"))) {
            // Expert team restructuring
            await handleExpertRestructuring(action);
          } else if (titleLower.includes("evaluat") && !titleLower.includes("expert")) {
            // Focus evaluation — run the prepare/evaluate step for a specific focus
            await handleFocusEvaluate(action);
          } else if (titleLower.includes("evolve") || titleLower.includes("sprint") || titleLower.includes("launch")) {
            // Launch an evolution sprint for a focus area
            await handleFocusEvolve(action);
          } else if (titleLower.includes("review") && titleLower.includes("result")) {
            // TL reviews sprint results autonomously — only surfaces to user if action needed
            await handleFocusReviewResults(action);
          } else if (titleLower.includes("pulse")) {
            const { generateProgressPulse } = await import("./focus-agent.js");
            await generateProgressPulse();
          } else {
            const { analyzeFocusAreas } = await import("./focus-agent.js");
            await analyzeFocusAreas();
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

// ── 5a. Expert Team Management ──

/**
 * Generate expert teams for focus areas that don't have them yet.
 * TL autonomously staffs unstaffed focus areas.
 */
async function handleExpertStaffing(action: TeamLeaderAction): Promise<void> {
  const { loadFocusState, updateFocusArea } = await import("./focus-areas.js");
  const { generateFocusExperts } = await import("./team-generator.js");
  const state = loadFocusState();
  if (!state?.areas.length) return;

  const unstaffed = state.areas.filter(a =>
    a.status !== "completed" && a.status !== "paused" && (!a.experts || a.experts.length === 0)
  );

  for (const area of unstaffed) {
    try {
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Generating expert team for "${area.title}" [${area.focusType || "general"}]` });

      const experts = await generateFocusExperts({
        focusId: area.id,
        focusTitle: area.title,
        focusType: area.focusType,
        intent: area.intent,
        deeperIntent: area.deeperIntent,
        semanticTags: area.semanticTags,
        evidence: area.evidence,
        codebasePath: area.codebasePath,
      });

      // Initialize metrics on each expert
      const expertsWithMetrics = experts.map(e => ({
        ...e,
        metrics: { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 },
      }));

      updateFocusArea(area.id, { experts: expertsWithMetrics });

      // Also persist experts as Cortex wiki pages
      try {
        await persistExpertsToCortex(area.id, area.title, expertsWithMetrics);
      } catch { /* non-critical */ }

      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Staffed "${area.title}" with ${experts.length} experts: ${experts.map(e => e.name).join(", ")}` });
    } catch (err) {
      logError("team-leader", `Failed to generate experts for "${area.title}"`, err);
    }
  }
}

/**
 * Evaluate expert performance — review metrics, flag underperformers.
 * TL "syncs" with each expert by reviewing their activity and writing evaluations.
 */
async function handleExpertEvaluation(action: TeamLeaderAction): Promise<void> {
  const { loadFocusState, updateFocusArea } = await import("./focus-areas.js");
  const { llm } = await import("./llm.js");
  const state = loadFocusState();
  if (!state?.areas.length) return;

  const areasWithExperts = state.areas.filter(a =>
    a.status !== "completed" && a.experts && a.experts.length > 0
  );

  for (const area of areasWithExperts) {
    const expertSummaries = area.experts!.map(e => {
      const m = e.metrics || { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 };
      const daysSinceActive = m.lastActiveAt
        ? Math.floor((Date.now() - new Date(m.lastActiveAt).getTime()) / (24 * 60 * 60 * 1000))
        : -1;
      return `- [id="${e.id}"] ${e.name} (${e.role}): ${m.conversationCount} conversations, ${m.sprintCount} sprints, last active ${daysSinceActive >= 0 ? `${daysSinceActive}d ago` : "never"}`;
    }).join("\n");

    try {
      const evaluation = await llm({
        prompt: `You are the Team Leader evaluating expert performance for the focus area "${area.title}".

EXPERTS:
${expertSummaries}

FOCUS CONTEXT: ${area.intent || area.description}
FOCUS TYPE: ${area.focusType || "general"}
CLARITY: ${area.clarity}

For each expert, write a ONE-LINE evaluation: are they contributing? underperforming? should they be replaced or reassigned?
If the team composition no longer fits the focus direction, note what changes you'd make.

Return JSON: { "evaluations": [{ "expertId": "exact id from brackets above", "status": "active|idle|stale", "note": "brief evaluation" }], "teamNote": "overall team assessment" }
IMPORTANT: Use the EXACT expertId shown in [id="..."] brackets above.`,
        tier: "fast",
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
        temperature: 0.3,
        timeoutMs: 15_000,
      });

      let parsed: { evaluations: Array<{ expertId: string; status: string; note: string }>; teamNote: string };
      try {
        let jsonStr = evaluation.trim();
        const fm = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fm) jsonStr = fm[1].trim();
        const bs = jsonStr.indexOf("{"), be = jsonStr.lastIndexOf("}");
        if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);
        parsed = JSON.parse(jsonStr);
      } catch { continue; }

      // Write evaluations back to expert metrics (match by ID or name)
      const updatedExperts = area.experts!.map(expert => {
        const eval_ = parsed.evaluations.find(e =>
          e.expertId === expert.id ||
          e.expertId.toLowerCase() === expert.name.toLowerCase() ||
          expert.name.toLowerCase().includes(e.expertId.toLowerCase())
        );
        if (!eval_) return expert;
        return {
          ...expert,
          metrics: {
            ...(expert.metrics || { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 }),
            lastEvaluation: eval_.note,
            lastEvaluatedAt: new Date().toISOString(),
          },
        };
      });

      updateFocusArea(area.id, { experts: updatedExperts });

      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Evaluated experts for "${area.title}": ${parsed.teamNote}` });
    } catch (err) {
      logError("team-leader", `Expert evaluation failed for "${area.title}"`, err);
    }
  }
}

/**
 * Restructure expert teams — add, remove, or replace experts based on TL's assessment.
 * Called when focus direction has shifted significantly.
 */
async function handleExpertRestructuring(action: TeamLeaderAction): Promise<void> {
  const { loadFocusState, updateFocusArea } = await import("./focus-areas.js");
  const { generateFocusExperts } = await import("./team-generator.js");
  const { llm } = await import("./llm.js");
  const state = loadFocusState();
  if (!state?.areas.length) return;

  // Find focus areas where restructuring is needed based on action reasoning
  const areasWithExperts = state.areas.filter(a =>
    a.status !== "completed" && a.experts && a.experts.length > 0
  );

  for (const area of areasWithExperts) {
    // Check if this area's experts have stale evaluations or zero activity
    const hasStaleExperts = area.experts!.some(e => {
      const m = e.metrics || { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 };
      return m.conversationCount === 0 && !m.lastActiveAt;
    });
    if (!hasStaleExperts && !action.reasoning.toLowerCase().includes(area.title.toLowerCase())) continue;

    try {
      // Ask LLM which experts to keep/replace
      const currentTeam = area.experts!.map(e => {
        const m = e.metrics || { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 };
        return `${e.name} (${e.role}): ${m.conversationCount} convos, ${m.sprintCount} sprints, eval: ${m.lastEvaluation || "none"}`;
      }).join("\n");

      const decision = await llm({
        prompt: `You are the Team Leader restructuring the expert team for "${area.title}" (${area.focusType || "general"}).

CURRENT TEAM:
${currentTeam}

FOCUS INTENT: ${area.intent || area.description}
DEEPER INTENT: ${area.deeperIntent || "not defined"}

Should this team be restructured? Consider:
1. Are experts aligned with current focus direction?
2. Are any experts never used (0 conversations)?
3. Does the team have the right mix of skills?

Return JSON: { "action": "keep|regenerate|partial", "reason": "why", "keepIds": ["id1"] }
- "keep" = team is fine as-is
- "regenerate" = replace entire team with fresh experts
- "partial" = keep some, regenerate the rest (list keepIds)`,
        tier: "fast",
        maxOutputTokens: 1500,
        responseMimeType: "application/json",
        temperature: 0.3,
        timeoutMs: 15_000,
      });

      let parsed: { action: string; reason: string; keepIds?: string[] };
      try {
        let jsonStr = decision.trim();
        const fm = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fm) jsonStr = fm[1].trim();
        const bs = jsonStr.indexOf("{"), be = jsonStr.lastIndexOf("}");
        if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);
        parsed = JSON.parse(jsonStr);
      } catch { continue; }

      if (parsed.action === "keep") {
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Expert team for "${area.title}" reviewed — keeping as-is: ${parsed.reason}` });
        continue;
      }

      if (parsed.action === "regenerate") {
        // Full team regeneration
        const newExperts = await generateFocusExperts({
          focusId: area.id, focusTitle: area.title, focusType: area.focusType,
          intent: area.intent, deeperIntent: area.deeperIntent,
          semanticTags: area.semanticTags, evidence: area.evidence,
          codebasePath: area.codebasePath,
        });
        const withMetrics = newExperts.map(e => ({
          ...e,
          metrics: { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 },
        }));
        updateFocusArea(area.id, { experts: withMetrics });
        try { await persistExpertsToCortex(area.id, area.title, withMetrics); } catch { /* non-critical */ }
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Regenerated expert team for "${area.title}": ${newExperts.map(e => e.name).join(", ")} (reason: ${parsed.reason})` });
      } else if (parsed.action === "partial") {
        // Keep some, regenerate others
        const keepIds = new Set(parsed.keepIds || []);
        const kept = area.experts!.filter(e => keepIds.has(e.id));
        const slotsNeeded = Math.max(1, area.experts!.length - kept.length);
        const newExperts = await generateFocusExperts({
          focusId: area.id, focusTitle: area.title, focusType: area.focusType,
          intent: area.intent, deeperIntent: area.deeperIntent,
          semanticTags: area.semanticTags, evidence: area.evidence,
          codebasePath: area.codebasePath,
        });
        // Take only the needed slots from new generation
        const newSlots = newExperts.slice(0, slotsNeeded).map(e => ({
          ...e,
          metrics: { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 },
        }));
        const merged = [...kept, ...newSlots];
        updateFocusArea(area.id, { experts: merged });
        try { await persistExpertsToCortex(area.id, area.title, merged); } catch { /* non-critical */ }
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Restructured "${area.title}" team: kept ${kept.map(e => e.name).join(", ")}, added ${newSlots.map(e => e.name).join(", ")} (reason: ${parsed.reason})` });
      }
    } catch (err) {
      logError("team-leader", `Expert restructuring failed for "${area.title}"`, err);
    }
  }
}

/**
 * Persist expert definitions as Cortex wiki pages for cross-focus discoverability.
 */
async function persistExpertsToCortex(
  focusId: string,
  focusTitle: string,
  experts: Array<import("./project-manager.js").TeamAgent>,
): Promise<void> {
  const { ensureEnsoDir } = await import("./utils/home.js");
  const focusWikiDir = ensureEnsoDir("wiki", "focuses", focusId);

  for (const expert of experts) {
    const slug = expert.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const pagePath = join(focusWikiDir, `expert-${slug}.md`);
    const metrics = expert.metrics || { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 };
    const content = [
      `# ${expert.name}`,
      `> ${expert.role} — Expert for "${focusTitle}"`,
      "",
      `**Agent Role:** ${expert.agentRole}`,
      `**Responsibilities:** ${expert.responsibilities}`,
      `**Perspective:** ${expert.perspective}`,
      "",
      `## Goals`,
      ...expert.goals.map(g => `- ${g}`),
      "",
      `## Activity`,
      `- Conversations: ${metrics.conversationCount}`,
      `- Sprint participations: ${metrics.sprintCount}`,
      `- Last active: ${metrics.lastActiveAt || "never"}`,
      metrics.lastEvaluation ? `- Last evaluation: ${metrics.lastEvaluation}` : "",
    ].filter(Boolean).join("\n");

    writeFileSync(pagePath, content, "utf-8");
  }
}

// ── 5a-2. Focus Evolution Cycle (autonomous) ──

/**
 * Run evaluation (prepare) for a focus area autonomously.
 * TL triggers the deep study without user involvement.
 */
async function handleFocusEvaluate(action: TeamLeaderAction): Promise<void> {
  const { loadFocusState } = await import("./focus-areas.js");
  const state = loadFocusState();
  if (!state?.areas.length) return;

  const titleLower = action.title.toLowerCase();
  const area = state.areas.find(a => titleLower.includes(a.title.toLowerCase()) || titleLower.includes(a.id));
  if (!area) return;

  // Skip if already evaluated
  if (area.preparedBriefing) {
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `"${area.title}" already evaluated — skipping` });
    return;
  }

  try {
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Evaluating focus area: "${area.title}"` });

    const resp = await fetch(`http://localhost:3001/api/focus-areas/${area.id}/prepare`, { method: "POST" });
    if (resp.ok) {
      const result = await resp.json();

      const { updateFocusAssessment } = await import("./focus-areas.js");

      if (result.orchestrated) {
        // Orchestrated evaluation is async — assessment will happen when briefing is ready
        // Just mark that evaluation was launched
        updateFocusAssessment(area.id, {
          understanding: 15, // Slight bump: eval launched but not done yet
          assessedBy: "tl-evaluate",
          notes: "Evaluation in progress — assessment will update when briefing completes",
        });
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Orchestrated evaluation launched for "${area.title}" — will complete asynchronously` });
      } else {
        // Non-orchestrated: briefing ready immediately — run LLM assessment
        await assessFocusUnderstanding(area, updateFocusAssessment);
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Evaluation complete for "${area.title}" — briefing ready` });
        // Queue next step: launch sprint
        queueTask({ title: `Launch evolution sprint for "${area.title}"`, description: `Evaluation complete. Launch sprint to make progress.`, source: "follow-up" });
      }
    }
  } catch (err) {
    logError("team-leader", `Failed to evaluate "${area.title}"`, err);
  }
}

/**
 * LLM-driven assessment of how well the TL understands a focus area.
 * Called after evaluation briefing is ready (both sync and async orchestration paths).
 * Exported so focus-areas.ts can call it when an orchestrated evaluation completes.
 */
export async function assessFocusUnderstanding(
  area: { id: string; title: string; description: string; intent?: string; focusType?: string; lastSprintResults?: string; evidence?: string[]; experts?: Array<{ id: string }>; preparedBriefing?: string; assessment?: { understanding: number } },
  updateFn: (id: string, update: { understanding?: number; progress?: number; assessedBy: string; notes: string }) => void,
): Promise<void> {
  try {
    const { llm } = await import("./llm.js");
    const briefingSnippet = area.preparedBriefing ? area.preparedBriefing.slice(0, 500) : "No briefing available yet";
    const assessResult = await llm({
      prompt: `You are the Team Leader assessing your understanding of a focus area after evaluation.

FOCUS: "${area.title}"
DESCRIPTION: ${area.description}
INTENT: ${area.intent || "Not yet defined"}
TYPE: ${area.focusType || "general"}
HAS BRIEFING: ${area.preparedBriefing ? "Yes" : "No"}
BRIEFING PREVIEW: ${briefingSnippet}
HAS PRIOR SPRINTS: ${area.lastSprintResults ? "Yes" : "No"}
EVIDENCE POINTS: ${area.evidence?.length || 0}
EXPERTS ASSIGNED: ${area.experts?.length || 0}

Rate your UNDERSTANDING of this goal on 0-100:
- 0-20: Barely know what this is. Just inferred from data.
- 20-40: Surface understanding. Know the topic, not the user's specific angle.
- 40-60: Good understanding. Know what they want and why, gaps in specifics.
- 60-80: Strong. Clear picture of goals, constraints, approach.
- 80-100: Deep. Could independently make strategic decisions.

First evaluation with briefing: typically 35-55. Only with sprint results and user feedback: 60+.

Return ONLY valid JSON: { "understanding": <number>, "notes": "<one sentence>" }`,
      tier: "utility",
      maxOutputTokens: 200,
      temperature: 0.3,
      timeoutMs: 30_000,
    });
    const { cleanJson } = await import("./json-utils.js");
    const parsed = JSON.parse(cleanJson(assessResult));
    updateFn(area.id, {
      understanding: Math.max(10, Math.min(95, parsed.understanding || 35)),
      assessedBy: "tl-evaluate",
      notes: parsed.notes || "Evaluation completed",
    });
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Assessment for "${area.title}": understanding=${parsed.understanding}% — ${parsed.notes || ""}` });
  } catch (err) {
    // Fallback: modest value based on whether briefing exists
    updateFn(area.id, {
      understanding: area.preparedBriefing ? 40 : Math.min(50, (area.assessment?.understanding ?? 10) + 15),
      assessedBy: "tl-evaluate",
      notes: "Evaluation complete (assessment LLM failed, using estimate)",
    });
    logError("team-leader", `Assessment LLM failed for "${area.title}"`, err);
  }
}

/**
 * Event-driven TL processing. Called when focus lifecycle events happen
 * (evaluation complete, sprint complete) so the TL immediately pushes
 * the next step without waiting for the morning routine.
 *
 * Events:
 * - "evaluation.completed" → queue sprint launch immediately
 * - "sprint.completed" → review results + assess holistic progress immediately
 */
export async function onFocusEvent(
  event: "evaluation.completed" | "sprint.completed",
  focusId: string,
): Promise<void> {
  const { loadFocusState, updateFocusAssessment } = await import("./focus-areas.js");
  const state = loadFocusState();
  if (!state?.areas.length) return;
  const area = state.areas.find(a => a.id === focusId);
  if (!area) return;

  if (event === "evaluation.completed") {
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `[Event] Evaluation completed for "${area.title}" — queuing sprint immediately` });

    // Queue the sprint as a self-task, then process it right away
    const action: TeamLeaderAction = {
      id: randomUUID(),
      title: `Launch evolution sprint for "${area.title}"`,
      description: `Evaluation complete. Launch sprint to make progress.`,
      priority: "high",
      type: "maintenance",
      delegation: "focus",
      effort: "30min",
      autoExecute: true,
      reasoning: "Event-driven: evaluation just completed",
    };
    await handleFocusEvolve(action);
  }

  if (event === "sprint.completed") {
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `[Event] Sprint completed for "${area.title}" — reviewing results + assessing progress` });

    // 1. Assess holistic progress toward the goal
    await assessFocusProgress(area, updateFocusAssessment);

    // 2. Review results to determine if user action is needed
    const reviewAction: TeamLeaderAction = {
      id: randomUUID(),
      title: `Review results for "${area.title}"`,
      description: `Sprint completed — reviewing deliverables to decide next step.`,
      priority: "high",
      type: "maintenance",
      delegation: "focus",
      effort: "5min",
      autoExecute: true,
      reasoning: "Event-driven: sprint just completed",
    };
    await handleFocusReviewResults(reviewAction);
  }
}

/**
 * LLM-driven holistic assessment of how far a focus area is toward its goal.
 * NOT based on sprint count — based on the actual goal intent, what's been
 * accomplished, and what remains. Called after each sprint completes.
 */
export async function assessFocusProgress(
  area: { id: string; title: string; description: string; intent?: string; focusType?: string; lastSprintResults?: string; lastSprintSummary?: any; evidence?: string[]; experts?: Array<{ id: string }>; preparedBriefing?: string; assessment?: { understanding: number; progress: number } },
  updateFn: (id: string, update: { understanding?: number; progress?: number; assessedBy: string; notes: string }) => void,
): Promise<void> {
  try {
    const { llm } = await import("./llm.js");
    const { cleanJson } = await import("./json-utils.js");

    const deliverables = area.lastSprintSummary?.deliverables?.map((d: any) =>
      `- ${d.taskTitle} [${d.entityType}]: ${d.howItHelps}`
    ).join("\n") || "No structured deliverables";
    const sprintSummary = area.lastSprintSummary?.sprintSummary || "Sprint completed.";

    const result = await llm({
      prompt: `You are the Team Leader assessing OVERALL PROGRESS toward a focus area goal.

FOCUS: "${area.title}"
GOAL: ${area.intent || area.description}
TYPE: ${area.focusType || "general"}
CURRENT UNDERSTANDING: ${area.assessment?.understanding ?? 30}%
CURRENT PROGRESS: ${area.assessment?.progress ?? 0}%

LATEST SPRINT RESULTS:
${sprintSummary}

DELIVERABLES:
${deliverables}

Assess how far the user is toward COMPLETING this goal, considering ALL factors:
- What has been accomplished so far (across all sprints, not just this one)?
- How much of the original goal remains?
- Are there tangible deliverables the user can use?
- Has the direction become clearer?

PROGRESS SCALE (holistic — this is NOT sprint counting):
- 0-10: Just getting started. Goal identified but no real work done.
- 10-25: Foundation laid. Research done, direction chosen, first outputs produced.
- 25-40: Early momentum. Several deliverables exist, approach is clear.
- 40-60: Significant progress. Major components in place, user can see value.
- 60-80: Well advanced. Most of the goal achieved, in refinement/polish phase.
- 80-95: Near complete. Goal essentially met, only minor improvements remain.
- 95-100: Goal fully achieved.

Also re-assess understanding if the sprint revealed new insights.

Return ONLY valid JSON: { "understanding": <number>, "progress": <number>, "notes": "<one sentence on overall progress>" }`,
      tier: "utility",
      maxOutputTokens: 200,
      temperature: 0.3,
      timeoutMs: 30_000,
    });

    const parsed = JSON.parse(cleanJson(result));
    updateFn(area.id, {
      understanding: Math.max(10, Math.min(95, parsed.understanding || area.assessment?.understanding || 30)),
      progress: Math.max(0, Math.min(100, parsed.progress ?? area.assessment?.progress ?? 0)),
      assessedBy: "tl-sprint-review",
      notes: parsed.notes || "Sprint reviewed",
    });
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Progress assessment for "${area.title}": understanding=${parsed.understanding}%, progress=${parsed.progress}% — ${parsed.notes || ""}` });
  } catch (err) {
    // Fallback: keep current values
    logError("team-leader", `Progress assessment failed for "${area.title}"`, err);
  }
}

/**
 * Launch an evolution sprint for a focus area autonomously.
 * TL drives the evolve step without user approval.
 */
async function handleFocusEvolve(action: TeamLeaderAction): Promise<void> {
  const { loadFocusState } = await import("./focus-areas.js");
  const state = loadFocusState();
  if (!state?.areas.length) return;

  const titleLower = action.title.toLowerCase();
  const area = state.areas.find(a => titleLower.includes(a.title.toLowerCase()) || titleLower.includes(a.id));
  if (!area) return;

  // Need evaluation first
  if (!area.preparedBriefing) {
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Cannot evolve "${area.title}" — needs evaluation first. Queuing evaluation.` });
    queueTask({ title: `Evaluate "${area.title}"`, description: `Need evaluation before sprint.`, source: "follow-up" });
    return;
  }

  try {
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Launching evolution sprint for "${area.title}"` });

    // Use the focus evolve function — build a brief from the evaluation
    const brief = area.preparedBriefing.slice(0, 2000);
    const { launchFocusEvolve } = await import("./focus-areas.js");
    const { getActiveAccount, getAllClients } = await import("./server.js");
    const account = getActiveAccount();
    if (!account) {
      logError("team-leader", `Cannot evolve "${area.title}" — no active account`);
      return;
    }
    // Use headless client for autonomous sprints
    const noop = () => {};
    const headlessClient = {
      id: "team-leader-evolve", sessionKey: "team-leader",
      ws: { send: noop, readyState: 1, close: noop, on: noop, off: noop, ping: noop },
      send: noop, _disconnectedBuffer: [], conversationId: "tl-background",
    } as unknown as import("./server.js").ConnectedClient;
    await launchFocusEvolve({ focusId: area.id, brief, client: headlessClient, account });

    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Evolution sprint launched for "${area.title}"` });
  } catch (err) {
    logError("team-leader", `Failed to launch sprint for "${area.title}"`, err);
  }
}

/**
 * TL reviews sprint results autonomously.
 * Uses LLM to determine if user action is needed or if TL can proceed to next cycle.
 */
async function handleFocusReviewResults(action: TeamLeaderAction): Promise<void> {
  const { loadFocusState } = await import("./focus-areas.js");
  const { llm } = await import("./llm.js");
  const state = loadFocusState();
  if (!state?.areas.length) return;

  const titleLower = action.title.toLowerCase();
  const area = state.areas.find(a => titleLower.includes(a.title.toLowerCase()) || titleLower.includes(a.id));
  if (!area?.lastSprintResults) return;

  try {
    // Have the TL assess whether user action is needed
    const summary = area.lastSprintSummary;
    const deliverables = summary?.deliverables.map(d =>
      `- ${d.taskTitle} [${d.entityType}]: ${d.howItHelps} → quickStart: ${d.quickStart}`
    ).join("\n") || "No structured summary available.";

    const assessment = await llm({
      prompt: `You are the Team Leader reviewing sprint results for "${area.title}".

SPRINT SUMMARY: ${summary?.sprintSummary || "Sprint completed."}

DELIVERABLES:
${deliverables}

NEXT STEPS FROM SPRINT:
${summary?.nextSteps?.join("\n") || "None specified."}

Question: Does the user need to personally act on any of these deliverables, or can you (the TL) proceed to the next evolution cycle autonomously?

User action is needed ONLY when:
- A deliverable requires the user to READ something and form an opinion
- A deliverable requires a PERSONAL DECISION (which direction to take, what to prioritize)
- A deliverable requires the user to APPLY something in real life (use a tool, follow a guide on a trip)

User action is NOT needed when:
- Deliverables are internal improvements (code, architecture, documentation)
- Results are incremental progress that the TL can build upon
- Next steps are things the TL or experts can handle

Return JSON: { "needsUser": true/false, "reason": "why", "userTasks": ["specific thing user should do"] }`,
      tier: "fast",
      maxOutputTokens: 1500,
      responseMimeType: "application/json",
      temperature: 0.3,
      timeoutMs: 15_000,
    });

    let parsed: { needsUser: boolean; reason: string; userTasks?: string[] };
    try {
      let jsonStr = assessment.trim();
      const fm = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fm) jsonStr = fm[1].trim();
      const bs = jsonStr.indexOf("{"), be = jsonStr.lastIndexOf("}");
      if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);
      parsed = JSON.parse(jsonStr);
    } catch {
      // Default to surfacing to user if parse fails
      parsed = { needsUser: true, reason: "Could not assess — surfacing to user for safety." };
    }

    // Note: holistic progress assessment is handled by onFocusEvent("sprint.completed")
    // which calls assessFocusProgress() — no duplicate assessment needed here.

    if (parsed.needsUser) {
      // Surface specific tasks to user — DON'T auto-complete this action
      action.autoExecute = false;
      action.needsUserInput = true;
      action.status = "proposed";
      action.reasoning = `${parsed.reason}${parsed.userTasks?.length ? `\n→ ${parsed.userTasks.join("\n→ ")}` : ""}`;
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Sprint results for "${area.title}" need user action: ${parsed.reason}` });
    } else {
      // TL handles it — clear the results and queue next cycle
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Sprint results for "${area.title}" reviewed by TL — no user action needed: ${parsed.reason}. Queuing next cycle.` });
      // Queue the next evaluation cycle
      queueTask({
        title: `Evaluate "${area.title}" for next sprint`,
        description: `Previous sprint reviewed. ${parsed.reason}. Ready for next cycle.`,
        source: "follow-up",
      });
      action.status = "completed";
    }
  } catch (err) {
    logError("team-leader", `Failed to review results for "${area.title}"`, err);
  }
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

    // Always use a headless noop client for TL sessions — never use the user's real client.
    // Using the real client causes TL terminal cards to show up in whatever conversation
    // the user is viewing, polluting their chat experience.
    const noop = () => {};
    const client: unknown = {
      id: "team-leader-builder",
      sessionKey: "team-leader",
      ws: { send: noop, readyState: 1, close: noop, on: noop, off: noop, ping: noop },
      send: noop,
      _disconnectedBuffer: [],
      conversationId: "tl-background",
    };

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

    // Register background task
    registerBackgroundTask(action.id, action.title, "claude-code");

    runClaudeCode({
      prompt,
      client: client as Parameters<typeof runClaudeCode>[0]["client"],
      runId,
      targetCardId: `tl-${action.id.slice(0, 8)}`,
      model: "sonnet",
      skipPersist: true,
    }).then(async () => {
      action.status = "completed";
      updateActionStatus(action.id, "completed");
      completeBackgroundTask(action.id, "completed");
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Claude Code task completed: "${action.title}"` });
      // Check if code was changed and restart may be needed
      await checkForCodeChangesAndRestart(action.title);
    }).catch(err => {
      action.status = "proposed";
      updateActionStatus(action.id, "proposed");
      completeBackgroundTask(action.id, "failed", String(err));
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
    const { getActiveAccount } = await import("./server.js");

    const account = getActiveAccount();
    if (!account) {
      logError("team-leader", `Cannot launch orchestration for "${action.title}" — no active account`);
      action.status = "proposed";
      return;
    }

    // Always use headless client — never pollute user's active conversation
    const noop = () => {};
    const client: unknown = {
      id: "team-leader-orchestrator",
      sessionKey: "team-leader",
      ws: { send: noop, readyState: 1, close: noop, on: noop, off: noop, ping: noop },
      send: noop,
      _disconnectedBuffer: [],
      conversationId: "tl-background",
    };

    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Launching orchestration sprint for: "${action.title}"` });

    registerBackgroundTask(action.id, action.title, "orchestration");

    handleOrchestration({
      userMessage: `[Team Leader] ${action.title}`,
      classification: { complexity: "orchestrated" as const, reasoning: `Team Leader priority: ${action.reasoning}` },
      client: client as Parameters<typeof handleOrchestration>[0]["client"],
      account,
      skipApproval: true,
      maxConcurrency: 3,
      useGeminiPlanning: true,
      onComplete: async (orchId, status) => {
        action.status = status === "completed" ? "completed" : "proposed";
        updateActionStatus(action.id, action.status);
        completeBackgroundTask(action.id, status === "completed" ? "completed" : "failed");
        logAction({ ts: Date.now(), type: "action", category: "team-leader",
          message: `Orchestration ${status} for: "${action.title}" (${orchId})` });
        await checkForCodeChangesAndRestart(action.title);
      },
    }).catch(err => {
      action.status = "proposed";
      updateActionStatus(action.id, "proposed");
      completeBackgroundTask(action.id, "failed", String(err));
      if (found) found.status = "proposed";
      saveState(st);
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

// ── 5d. Background Task Tracking ──

/** Helper to update an action's status in persisted state */
function updateActionStatus(actionId: string, status: string): void {
  const st = loadState();
  const found = st.recentActions.find(a => a.id === actionId);
  if (found) found.status = status;
  if (st.lastBriefing) {
    const ba = st.lastBriefing.proposedActions.find(a => a.id === actionId);
    if (ba) ba.status = status;
  }
  saveState(st);
}

/** Register a background task for tracking */
function registerBackgroundTask(actionId: string, title: string, type: "claude-code" | "orchestration"): void {
  const st = loadState();
  st.backgroundTasks = st.backgroundTasks || [];
  st.backgroundTasks.push({
    actionId, actionTitle: title, type,
    launchedAt: new Date().toISOString(),
    status: "running",
  });
  saveState(st);
}

/** Mark a background task as completed/failed and check if all tasks are done */
function completeBackgroundTask(actionId: string, status: "completed" | "failed", result?: string): void {
  const st = loadState();
  st.backgroundTasks = st.backgroundTasks || [];
  const task = st.backgroundTasks.find(t => t.actionId === actionId);
  if (task) {
    task.status = status;
    task.completedAt = new Date().toISOString();
    task.result = result;
  }
  saveState(st);

  // Check if ALL background tasks from this routine are now done
  const running = st.backgroundTasks.filter(t => t.status === "running");
  if (running.length === 0 && st.backgroundTasks.length > 0) {
    deliverRoutineCompletionSummary().catch(err =>
      logError("team-leader", "Failed to deliver completion summary", err));
  }
}

/**
 * When all background tasks from a routine are done, deliver a summary.
 * This is the "all clear" notification — everything the TL launched has finished.
 */
async function deliverRoutineCompletionSummary(): Promise<void> {
  const st = loadState();
  const tasks = st.backgroundTasks || [];
  if (tasks.length === 0) return;

  const completedTasks = tasks.filter(t => t.status === "completed");
  const failedTasks = tasks.filter(t => t.status === "failed");

  logAction({ ts: Date.now(), type: "action", category: "team-leader",
    message: `All background tasks finished: ${completedTasks.length} done, ${failedTasks.length} failed. Delivering final briefing.` });

  // Regenerate the briefing with FINAL action statuses (all tasks now resolved)
  // This ensures the email shows accurate ✓/✗ instead of ◉
  if (st.lastBriefing) {
    // Update the briefing's proposed actions with final statuses
    for (const action of st.lastBriefing.proposedActions) {
      const recent = st.recentActions.find(a => a.id === action.id);
      if (recent) action.status = recent.status;
    }

    // Now deliver the full briefing via all channels (email, WeChat, in-app)
    // This is the ONLY email the user receives — with final, accurate status
    await deliverBriefing(st.lastBriefing);

    // Also send the "Needs Your Input" attention cards
    const proposedActions = st.lastBriefing.proposedActions.filter(a => a.status === "proposed" || a.needsUserInput);
    if (proposedActions.length > 0) {
      try {
        const { getAllClients } = await import("./server.js");
        const { persistCard } = await import("./memory-bridge.js");
        const clients = getAllClients();
        if (clients.length > 0) {
          const client = clients[0];

          let focusAreas: Array<{ id: string; title: string }> = [];
          try {
            const { loadFocusState } = await import("./focus-areas.js");
            const fState = loadFocusState();
            focusAreas = (fState?.areas || []).map(a => ({ id: a.id, title: a.title }));
          } catch { /* focus areas not available */ }

          const actionLines = proposedActions.map(a => {
            const titleLower = a.title.toLowerCase();
            const matched = focusAreas.find(f => titleLower.includes(f.title.toLowerCase()));
            const pEmoji = a.priority === "critical" ? "🔴" : a.priority === "high" ? "🟠" : a.priority === "medium" ? "🟡" : "⚪";
            let actionHint = "";
            if (matched) {
              if (titleLower.includes("review")) actionHint = `\n→ Go to **Focus** tab → **${matched.title}** → click **📬 Review Results**`;
              else if (titleLower.includes("discuss")) actionHint = `\n→ Go to **Focus** tab → **${matched.title}** → click **💬 Discuss**`;
              else actionHint = `\n→ Go to **Focus** tab → **${matched.title}**`;
            }
            return `${pEmoji} **${a.title}**\n${a.reasoning}${actionHint}`;
          }).join("\n\n");

          const attentionCardId = randomUUID();
          const attentionText = `🙋 **Needs Your Input** (${proposedActions.length} item${proposedActions.length > 1 ? "s" : ""})\n\n${actionLines}`;
          persistCard(client.id, "main", {
            id: attentionCardId, runId: attentionCardId, type: "chat", role: "assistant",
            text: attentionText, timestamp: Date.now() + 1,
          });
          client.send({
            id: attentionCardId, runId: attentionCardId, sessionKey: client.sessionKey,
            seq: 0, state: "final" as const,
            text: attentionText,
            conversationId: "main", timestamp: Date.now() + 1,
          });
        }
      } catch { /* best effort */ }
    }

    saveState(st);
  }

  // Check if restart is needed
  if (st.restartPending) {
    await handleAutoRestart();
  }

  // Clear background tasks for next routine
  const st2 = loadState();
  st2.backgroundTasks = [];
  saveState(st2);

  logAction({ ts: Date.now(), type: "action", category: "team-leader",
    message: `Routine complete: ${completedTasks.length} done, ${failedTasks.length} failed — briefing delivered` });
}

// ── 5e. Auto-Restart After Code Changes ──

/**
 * Check if a Claude Code session changed server/frontend code.
 * If so, flag a restart for when all background tasks complete.
 */
async function checkForCodeChangesAndRestart(taskTitle: string): Promise<void> {
  try {
    const { execSync } = await import("node:child_process");
    const diff = execSync("git diff --name-only", { cwd: "D:/Github/Enso", encoding: "utf-8", timeout: 5000 });
    if (!diff.trim()) return; // No changes

    const changedFiles = diff.trim().split("\n");
    const serverFiles = changedFiles.filter(f => f.startsWith("server/") || f.startsWith("shared/"));
    const frontendFiles = changedFiles.filter(f => f.startsWith("src/"));

    if (serverFiles.length === 0 && frontendFiles.length === 0) return;

    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Code changes detected after "${taskTitle}": ${changedFiles.length} file(s) — ${serverFiles.length} server, ${frontendFiles.length} frontend` });

    // Verify the build passes before flagging restart
    try {
      execSync("npm run build", { cwd: "D:/Github/Enso", encoding: "utf-8", timeout: 60000, stdio: "pipe" });
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Build passed after code changes — restart flagged` });

      // Auto-commit the changes
      execSync('git add -A && git commit -m "fix: TL auto-fix — ' + taskTitle.replace(/"/g, '\\"').slice(0, 60) + '"', {
        cwd: "D:/Github/Enso", encoding: "utf-8", timeout: 15000, stdio: "pipe",
      });
      execSync("git push", { cwd: "D:/Github/Enso", encoding: "utf-8", timeout: 15000, stdio: "pipe" });
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Code changes committed and pushed` });
    } catch (buildErr) {
      logError("team-leader", `Build failed after code changes from "${taskTitle}" — NOT restarting. Changes left uncommitted.`, buildErr);
      return;
    }

    // Flag restart pending — will happen when all background tasks complete
    const st = loadState();
    st.restartPending = true;
    saveState(st);
  } catch (err) {
    logError("team-leader", `Failed to check code changes after "${taskTitle}"`, err);
  }
}

/**
 * Perform auto-restart: exit with code 78 (self-heal) so guardian restarts the process.
 * Only called when all background tasks are done and build has passed.
 */
async function handleAutoRestart(): Promise<void> {
  // Verify no active sessions before restarting
  try {
    const { getActiveSessions } = await import("./session-registry.js");
    const active = getActiveSessions();
    if (active.length > 0) {
      logAction({ ts: Date.now(), type: "action", category: "team-leader",
        message: `Restart deferred — ${active.length} active session(s) still running` });
      return;
    }
  } catch { /* registry not available, proceed cautiously */ }

  logAction({ ts: Date.now(), type: "action", category: "team-leader",
    message: `Auto-restart initiated — code changes applied, build passed, all tasks complete` });

  // Clear the restart flag
  const st = loadState();
  st.restartPending = false;
  saveState(st);

  // Give 2 seconds for log flush, then exit with code 78 (guardian restarts)
  setTimeout(() => {
    process.exit(78);
  }, 2000);
}

// ── 6. Morning Routine (full pipeline) ──

export async function runMorningRoutine(): Promise<DailyBriefing> {
  logAction({ ts: Date.now(), type: "action", category: "team-leader", message: "Morning routine starting..." });

  // 0. Clear background tasks from previous routine
  const prevState = loadState();
  prevState.backgroundTasks = [];
  prevState.restartPending = false;
  saveState(prevState);

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

  // 4. Check if there are background tasks still running
  const currentState = loadState();
  const hasBackgroundTasks = (currentState.backgroundTasks || []).some(t => t.status === "running");

  if (hasBackgroundTasks) {
    // Background tasks still running — defer full briefing to completion summary.
    // Save state now so the TL dashboard shows actions immediately.
    currentState.lastMorningRoutineAt = new Date().toISOString();
    currentState.recentActions = [...executedActions, ...currentState.recentActions].slice(0, 50);
    saveState(currentState);

    // Send a lightweight in-app-only notification that the routine started
    try {
      const { getAllClients } = await import("./server.js");
      const { persistCard } = await import("./memory-bridge.js");
      const clients = getAllClients();
      if (clients.length > 0) {
        const client = clients[0];
        const cardId = randomUUID();
        const inProgressText = `⏳ **TL Routine Running** — ${executedActions.filter(a => a.status === "completed").length} instant tasks done, ${(currentState.backgroundTasks || []).filter(t => t.status === "running").length} background tasks in progress. Full briefing will arrive when everything completes.`;
        persistCard(client.id, "main", { id: cardId, runId: cardId, type: "chat", role: "assistant", text: inProgressText, timestamp: Date.now() });
        client.send({ id: cardId, runId: cardId, sessionKey: client.sessionKey, seq: 0, state: "final" as const, text: inProgressText, conversationId: "main", timestamp: Date.now() });
      }
    } catch { /* best effort */ }

    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Routine in progress: ${completed} instant, ${(currentState.backgroundTasks || []).filter(t => t.status === "running").length} background tasks running. Briefing deferred.` });

    // Generate briefing but store it — don't deliver yet. Completion summary will deliver it.
    const briefing = await generateBriefing(signals, executedActions);
    const st2 = loadState();
    st2.lastBriefing = briefing;
    saveState(st2);

    return briefing;
  }

  // No background tasks — deliver briefing immediately (all tasks were synchronous)
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

/**
 * Cleanup stale "executing"/"running" statuses on server startup.
 * If the server restarted while tasks were running, their callbacks never fired.
 * Mark them as completed (best-effort) so the UI doesn't show stuck blue dots.
 */
export function cleanupStaleTasksOnStartup(): void {
  const st = loadState();
  let changed = false;

  // Clean up background tasks stuck on "running"
  for (const task of (st.backgroundTasks || [])) {
    if (task.status === "running") {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      task.result = "Server restarted — assumed completed";
      changed = true;
    }
  }

  // Clean up actions stuck on "executing"
  for (const action of st.recentActions) {
    if (action.status === "executing") {
      action.status = "completed";
      changed = true;
    }
  }
  if (st.lastBriefing) {
    for (const action of st.lastBriefing.proposedActions) {
      if (action.status === "executing") {
        action.status = "completed";
        changed = true;
      }
    }
  }

  if (changed) {
    saveState(st);
    logAction({ ts: Date.now(), type: "action", category: "team-leader",
      message: `Cleaned up stale executing/running statuses after server restart` });
  }
}

/**
 * Mark a user-facing action as completed.
 * Called when user acts on a proposed item (reviews results, starts discussion, etc.)
 */
export function completeAction(actionId: string): boolean {
  const state = loadState();
  if (!state.lastBriefing) return false;
  const action = state.lastBriefing.proposedActions.find(a => a.id === actionId);
  if (!action) {
    // Also check recentActions
    const recent = state.recentActions.find(a => a.id === actionId);
    if (recent) { recent.status = "completed"; saveState(state); return true; }
    return false;
  }
  action.status = "completed";
  // Also update in recentActions
  const recent = state.recentActions.find(a => a.id === actionId);
  if (recent) recent.status = "completed";
  saveState(state);
  logAction({ ts: Date.now(), type: "action", category: "team-leader", message: `User completed: "${action.title}"` });
  return true;
}

/**
 * Get pending user actions — items that need user input and haven't been completed.
 */
export function getPendingUserActions(): TeamLeaderAction[] {
  const state = loadState();
  if (!state.lastBriefing) return [];
  return state.lastBriefing.proposedActions.filter(a =>
    (a.status === "proposed" || a.needsUserInput) && a.status !== "completed"
  );
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

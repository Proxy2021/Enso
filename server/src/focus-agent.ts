/**
 * Focus Utilities — Reusable functions for focus area analysis, pulse generation,
 * and sprint result delivery.
 *
 * These are building blocks called by the Team Leader or directly via chat tools.
 * There is no independent "Focus Agent" — the Team Leader is the only agent.
 */

import { randomUUID } from "node:crypto";
import { homedir, hostname } from "node:os";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export interface FocusAnalysis {
  focusId: string;
  title: string;
  status: string;
  clarity: string;
  daysSinceActivity: number;
  trend: "growing" | "steady" | "quiet";
  hasUnreviewedResults: boolean;
  hasEvaluation: boolean;
  hasSprint: boolean;
  recommendedAction: "evaluate" | "discuss" | "evolve" | "review_results" | "continue" | "reactivate" | "none";
  actionReason: string;
}

export interface ProgressPulse {
  timestamp: string;
  analyses: FocusAnalysis[];
  items: PulseItem[];
  headline: string;
  textSummary: string;
  htmlSummary: string;
}

export interface PulseItem {
  focusId: string;
  title: string;
  statusEmoji: string;
  statusLabel: string;
  oneLiner: string;
  recommendedAction: string;
  urgency: "high" | "medium" | "low";
}

// ── Analyze Focus Areas (zero LLM) ──

/**
 * Analyze all active focus areas — determine status, detect stalls, recommend actions.
 * Pure state machine logic, no LLM cost.
 */
export async function analyzeFocusAreas(): Promise<FocusAnalysis[]> {
  const { loadFocusState } = await import("./focus-areas.js");
  const state = loadFocusState();
  if (!state?.areas.length) return [];

  const now = Date.now();
  const analyses: FocusAnalysis[] = [];

  for (const area of state.areas) {
    if (area.status === "completed" || area.status === "paused") continue;

    const lastActive = area.progress?.lastActiveAt ? new Date(area.progress.lastActiveAt).getTime() : new Date(area.createdAt).getTime();
    const daysSinceActivity = Math.floor((now - lastActive) / (24 * 60 * 60 * 1000));

    const hasSprint = !!area.lastSprintResults;
    const hasEvaluation = !!area.preparedBriefing;
    const sprintDate = area.lastSprintDate ? new Date(area.lastSprintDate).getTime() : 0;
    const daysSinceSprint = sprintDate ? Math.floor((now - sprintDate) / (24 * 60 * 60 * 1000)) : -1;

    const hasUnreviewedResults = hasSprint && daysSinceSprint >= 1 && daysSinceActivity > daysSinceSprint;

    let recommendedAction: FocusAnalysis["recommendedAction"] = "none";
    let actionReason = "";

    if (hasUnreviewedResults) {
      recommendedAction = "review_results";
      actionReason = `Sprint completed ${daysSinceSprint} day(s) ago but results haven't been reviewed.`;
    } else if (!hasEvaluation && !hasSprint) {
      recommendedAction = "evaluate";
      actionReason = `Hasn't been studied yet. An evaluation will map the landscape and identify the highest-leverage action.`;
    } else if (hasEvaluation && !hasSprint && !area.conversationId) {
      recommendedAction = "discuss";
      actionReason = `Evaluation complete — ready to discuss approach and decide on a sprint plan.`;
    } else if (hasEvaluation && !hasSprint && area.conversationId) {
      recommendedAction = "evolve";
      actionReason = `Evaluation studied, discussion started — ready to launch an execution sprint.`;
    } else if (hasSprint && daysSinceActivity > 7) {
      recommendedAction = "reactivate";
      actionReason = `Last sprint was ${daysSinceSprint} days ago and no activity since. Time to re-evaluate.`;
    } else if (hasSprint && !hasUnreviewedResults) {
      recommendedAction = "continue";
      actionReason = `Sprint completed and reviewed. Ready for the next cycle.`;
    }

    analyses.push({
      focusId: area.id, title: area.title, status: area.status, clarity: area.clarity,
      daysSinceActivity, trend: area.progress?.trend || "steady",
      hasUnreviewedResults, hasEvaluation, hasSprint, recommendedAction, actionReason,
    });
  }

  return analyses;
}

// ── Generate Progress Pulse (LLM) ──

/**
 * Generate a Progress Pulse — concise, actionable status update for all focus areas.
 */
export async function generateProgressPulse(): Promise<ProgressPulse> {
  const analyses = await analyzeFocusAreas();
  if (analyses.length === 0) {
    return { timestamp: new Date().toISOString(), analyses: [], items: [], headline: "No active focus areas",
      textSummary: "No active focus areas found.", htmlSummary: "<p>No active focus areas found.</p>" };
  }

  const { llm } = await import("./llm.js");

  const analysisContext = analyses.map(a => {
    const flags: string[] = [];
    if (a.hasUnreviewedResults) flags.push("UNREVIEWED SPRINT RESULTS");
    if (a.daysSinceActivity > 7) flags.push(`QUIET (${a.daysSinceActivity} days)`);
    if (!a.hasEvaluation && !a.hasSprint) flags.push("NOT YET STARTED");
    if (a.hasSprint && !a.hasUnreviewedResults) flags.push("SPRINT COMPLETE");
    if (a.hasEvaluation && !a.hasSprint) flags.push("EVALUATED, NO SPRINT");
    return `- "${a.title}" [${a.clarity}] — ${flags.join(", ") || "active"}\n  Recommended: ${a.recommendedAction} — ${a.actionReason}`;
  }).join("\n\n");

  const response = await llm({
    prompt: `You are generating a concise progress pulse for a personal AI assistant's focus areas.

FOCUS AREAS:
${analysisContext}

Generate JSON: { "headline": "short (e.g. '2 areas need attention')", "items": [{ "focusId": "exact-id", "title": "exact title", "statusEmoji": "🎯|🟢|🟡|💤|⚡", "statusLabel": "2-3 words", "oneLiner": "one specific sentence", "recommendedAction": "one concrete action", "urgency": "high|medium|low" }] }

Rules: Use EXACT focusId/title. Be specific not generic. Order by urgency.`,
    tier: "fast",
    maxOutputTokens: 4000,
    responseMimeType: "application/json",
    temperature: 0.3,
    timeoutMs: 30_000,
  });

  let jsonStr = response.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const bs = jsonStr.indexOf("{"), be = jsonStr.lastIndexOf("}");
  if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);
  const parsed = JSON.parse(jsonStr) as { headline: string; items: PulseItem[] };

  // Build text summary
  const textLines = [`📊 Focus Pulse — ${parsed.headline}\n`];
  for (const item of parsed.items) {
    textLines.push(`${item.statusEmoji} ${item.title} — ${item.statusLabel}`);
    textLines.push(`   ${item.oneLiner}`);
    textLines.push(`   → ${item.recommendedAction}\n`);
  }
  const textSummary = textLines.join("\n");

  // Build HTML summary
  const htmlItems = parsed.items.map(item => {
    const c = item.urgency === "high" ? "#ef4444" : item.urgency === "medium" ? "#f59e0b" : "#6b7280";
    return `<tr><td style="padding:12px 16px;border-bottom:1px solid #374151;">
      <div style="font-size:16px;margin-bottom:4px;">${item.statusEmoji} <strong>${item.title}</strong> <span style="color:${c};font-size:12px;margin-left:8px;">${item.statusLabel}</span></div>
      <div style="color:#d1d5db;font-size:14px;margin-bottom:6px;">${item.oneLiner}</div>
      <div style="color:#a78bfa;font-size:13px;">→ ${item.recommendedAction}</div>
    </td></tr>`;
  }).join("\n");

  let remarkHtml = "";
  try {
    const { registerNotification, emailRemarkActions } = await import("./remarks.js");
    const nId = registerNotification({ type: "pulse", summary: parsed.headline }, { isEmail: true });
    remarkHtml = emailRemarkActions(nId, getEnsoUrl());
  } catch { /* non-critical */ }

  const htmlSummary = `<div style="max-width:600px;margin:0 auto;background:#111827;border-radius:12px;overflow:hidden;font-family:-apple-system,sans-serif;color:#f9fafb;">
    <div style="background:linear-gradient(135deg,#4c1d95,#7c3aed);padding:20px 24px;">
      <h2 style="margin:0;font-size:18px;color:#fff;">📊 Focus Pulse</h2>
      <p style="margin:4px 0 0;font-size:14px;color:#c4b5fd;">${parsed.headline}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;">${htmlItems}</table>
    <div style="padding:16px 24px;">${remarkHtml}</div>
    <div style="padding:8px 24px 16px;text-align:center;border-top:1px solid #1f2937;">
      <a href="${getEnsoUrl()}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Open Enso →</a>
    </div>
  </div>`;

  return { timestamp: new Date().toISOString(), analyses, items: parsed.items, headline: parsed.headline, textSummary, htmlSummary };
}

// ── Deliver Sprint Results (multi-channel) ──

/**
 * Deliver sprint completion notification through email + WeChat.
 * Called from focus-areas.ts onComplete callback.
 */
export async function deliverSprintResults(
  focusId: string,
  focusTitle: string,
  summary: import("../../shared/types.js").SprintResultsSummary,
): Promise<void> {
  const recommended = summary.deliverables[summary.recommendedFirstAction?.deliverableIndex ?? 0];
  const startAction = recommended?.quickStart || "Open the Focus tab to review results.";

  const text = [
    `✅ Sprint complete for "${focusTitle}"!`, "",
    summary.sprintSummary, "",
    `▸ Start here: ${startAction}`, "",
    `Next steps:`, ...summary.nextSteps.map(s => `  • ${s}`),
  ].join("\n");

  // Remark actions
  let remarkHtml = "";
  try {
    const { registerNotification, emailRemarkActions } = await import("./remarks.js");
    const nId = registerNotification({ type: "sprint-complete", summary: `Sprint: ${focusTitle}`, focusId }, { isEmail: true });
    remarkHtml = emailRemarkActions(nId, getEnsoUrl());
  } catch { /* non-critical */ }

  const deliverableCards = summary.deliverables.map((d, i) => {
    const isRec = i === (summary.recommendedFirstAction?.deliverableIndex ?? -1);
    const colors: Record<string, string> = { app: "#10b981", article: "#3b82f6", idea: "#f59e0b", synthesis: "#8b5cf6" };
    const color = colors[d.entityType] || "#6b7280";
    return `<div style="padding:12px;border-left:3px solid ${color};background:#1f2937;border-radius:0 8px 8px 0;margin-bottom:8px;">
      <div style="font-size:14px;font-weight:600;color:#f9fafb;">${d.taskTitle} <span style="font-size:11px;color:${color};margin-left:8px;">${d.entityType}</span>${isRec ? ' <span style="font-size:11px;color:#10b981;margin-left:8px;">⭐ START HERE</span>' : ""}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">${d.painPoint}</div>
      <div style="font-size:13px;color:#d1d5db;margin-top:4px;">${d.howItHelps}</div>
      <div style="font-size:12px;color:#a78bfa;margin-top:6px;">→ ${d.quickStart}</div>
    </div>`;
  }).join("\n");

  const html = `<div style="max-width:600px;margin:0 auto;background:#111827;border-radius:12px;overflow:hidden;font-family:-apple-system,sans-serif;color:#f9fafb;">
    <div style="background:linear-gradient(135deg,#065f46,#10b981);padding:20px 24px;">
      <h2 style="margin:0;font-size:18px;color:#fff;">✅ Sprint Complete</h2>
      <p style="margin:4px 0 0;font-size:14px;color:#a7f3d0;">${focusTitle}</p>
    </div>
    <div style="padding:20px 24px;">
      <p style="font-size:14px;color:#d1d5db;line-height:1.6;margin:0 0 16px;">${summary.sprintSummary}</p>
      <h3 style="font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Deliverables</h3>
      ${deliverableCards}
      <h3 style="font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;">Next Steps</h3>
      <ul style="margin:0;padding-left:20px;color:#d1d5db;font-size:14px;">${summary.nextSteps.map(s => `<li style="margin-bottom:4px;">${s}</li>`).join("\n")}</ul>
    </div>
    <div style="padding:16px 24px;">${remarkHtml}</div>
    <div style="padding:8px 24px 16px;text-align:center;border-top:1px solid #1f2937;">
      <a href="${getEnsoUrl()}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Open in Enso →</a>
    </div>
  </div>`;

  // Email
  try {
    const { getNotifyEmail } = await import("./shareable-pages.js");
    const email = getNotifyEmail();
    if (email) {
      const { sendHtmlEmail } = await import("./email.js");
      await sendHtmlEmail({ to: email, subject: `✅ Sprint complete: ${focusTitle}`, html, textFallback: text });
      logAction({ ts: Date.now(), type: "action", category: "focus-agent", message: `Sprint results emailed for "${focusTitle}"` });
    }
  } catch (err) { logError("focus-agent", "Email sprint delivery failed", err); }

  // WeChat
  try {
    const { getFollowerOpenIds, isWithinServiceWindow, sendTextMessage } = await import("./wechat.js");
    for (const openId of await getFollowerOpenIds()) {
      if (!isWithinServiceWindow(openId)) continue;
      await sendTextMessage(openId, [`✅ Sprint complete: ${focusTitle}`, "", summary.sprintSummary, "", `▸ ${startAction}`].join("\n"));
      logAction({ ts: Date.now(), type: "action", category: "focus-agent", message: `Sprint results sent via WeChat for "${focusTitle}"` });
      break;
    }
  } catch (err) { logError("focus-agent", "WeChat sprint delivery failed", err); }
}

// ── Chat Tool ──

/**
 * Focus pulse tool — callable via chat when user asks about their goals.
 * The Team Leader uses analyzeFocusAreas() directly; this is for ad-hoc user requests.
 */
export function createFocusAgentTools(): Array<import("./local-types.js").EnsoAgentTool> {
  return [{
    name: "enso_focus_pulse",
    label: "Focus Pulse",
    description: "Generate a Focus Pulse — concise progress report on all active focus areas with recommended next actions. Use when user asks about goals, progress, or says '/pulse'.",
    isPrimary: true,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_callId: string, _params: Record<string, unknown>) => {
      const pulse = await generateProgressPulse();
      const msg = [`📊 **Focus Pulse** — ${pulse.headline}`, "",
        ...pulse.items.map(i => `${i.statusEmoji} **${i.title}** — ${i.statusLabel}\n${i.oneLiner}\n→ ${i.recommendedAction}`),
      ].join("\n");
      return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_focus_pulse", headline: pulse.headline, items: pulse.items, message: msg }) }] };
    },
  }];
}

// ── Helper ──

function getEnsoUrl(): string {
  const name = process.env.ENSO_MACHINE_NAME || hostname();
  return process.env.ENSO_TUNNEL_URL || `https://${name}.enso.net`;
}

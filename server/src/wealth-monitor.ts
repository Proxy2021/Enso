/**
 * wealth-monitor.ts — Monitoring, threshold evaluation, and notification
 * formatting for the Team Leader's wealth/finance signal pipeline.
 *
 * Extends finances-summary.ts with:
 * 1. Per-account staleness with severity levels
 * 2. Threshold-based alerts (daily swing, milestones, concentration)
 * 3. Refresh execution with result tracking
 * 4. Multi-channel notification formatting
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { logAction, logError } from "./action-log.js";

// ── Paths ──

const HOME = homedir();
const FINANCES_DIR = join(HOME, ".enso", "data", "finances");
const INDEX_PATH = join(FINANCES_DIR, "accounts.json");
const HISTORY_PATH = join(FINANCES_DIR, "net_worth_history.jsonl");
const REFRESH_LOG_PATH = join(FINANCES_DIR, "refresh-log.jsonl");
const MILESTONES_PATH = join(FINANCES_DIR, "milestones.json");
const LOCK_PATH = join(FINANCES_DIR, ".refresh-lock");

// ── Config Types ──

export interface WealthMonitorConfig {
  refreshSchedule: {
    kkLive: { enabled: boolean; cron: string };
    rmEmails: { enabled: boolean; cron: string };
  };
  staleness: {
    warnDays: number;
    alertDays: number;
    criticalDays: number;
  };
  thresholds: {
    dailyChangePct: number;
    milestones: number[];
    concentrationPct: number;
  };
  suppressNoChange: boolean;
  channels: { email: boolean; wechat: boolean; inApp: boolean };
}

export const DEFAULT_WEALTH_CONFIG: WealthMonitorConfig = {
  refreshSchedule: {
    kkLive: { enabled: true, cron: "0 8 * * 1-5" },
    rmEmails: { enabled: true, cron: "0 9 * * 1" },
  },
  staleness: { warnDays: 7, alertDays: 14, criticalDays: 30 },
  thresholds: {
    dailyChangePct: 3.0,
    milestones: [1_000_000, 5_000_000, 10_000_000],
    concentrationPct: 25,
  },
  suppressNoChange: true,
  channels: { email: true, wechat: true, inApp: true },
};

// ── Alert Types ──

export interface WealthAlert {
  id: string;
  type: "daily-swing" | "milestone-crossed" | "concentration" | "staleness" | "refresh-failure";
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  accountId?: string;
  value?: number;
  threshold?: number;
}

export interface AccountStaleness {
  accountId: string;
  displayName: string;
  daysSinceUpdate: number;
  severity: "ok" | "warn" | "alert" | "critical";
}

export interface RefreshStatus {
  lastKkLiveRefresh: string | null;
  lastRmEmailRefresh: string | null;
  pendingRefresh: boolean;
  lastRefreshResult: "success" | "failure" | "partial" | null;
  lastRefreshError: string | null;
}

export interface WealthSignal {
  snapshot: import("./finances-summary.js").FinancesSnapshot | null;
  alerts: WealthAlert[];
  refreshStatus: RefreshStatus;
  accountStaleness: AccountStaleness[];
  briefingLine: string;
}

export interface RefreshResult {
  success: boolean;
  source: "kk-live" | "rm-emails";
  duration: number;
  accountsUpdated: number;
  newStatements?: number;
  netWorthDelta?: number;
  error?: string;
  trigger: "scheduled" | "manual" | "react";
  summary: string;
}

interface RefreshLogEntry {
  ts: string;
  source: string;
  success: boolean;
  duration: number;
  accountsUpdated?: number;
  newStatements?: number;
  netWorthDelta?: number;
  error?: string;
  trigger: string;
}

interface AccountIndexEntry {
  accountId: string;
  slug: string;
  displayName: string;
  institution: string;
  accountType: string;
  baseCurrency: string;
  currentValue: number;
  cash: number | null;
  holdingsCount?: number;
  statementCount: number;
  lastUpdated: string;
  sourceKind?: string;
}

// ── Helpers ──

function loadConfig(): WealthMonitorConfig {
  try {
    const configPath = join(HOME, ".enso", "data", "team-leader-config.json");
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
      if (cfg.wealthMonitor) {
        return { ...DEFAULT_WEALTH_CONFIG, ...cfg.wealthMonitor };
      }
    }
  } catch { /* use defaults */ }
  return DEFAULT_WEALTH_CONFIG;
}

function loadAccounts(): AccountIndexEntry[] {
  if (!existsSync(INDEX_PATH)) return [];
  try {
    const idx = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
    return Array.isArray(idx.accounts) ? idx.accounts : [];
  } catch { return []; }
}

function loadNetWorthHistory(): Array<{ date: string; primaryCurrency: string; primaryTotal: number; byCurrency: Record<string, number> }> {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const lines = readFileSync(HISTORY_PATH, "utf-8").trim().split(/\r?\n/).filter(Boolean);
    const entries: Array<{ date: string; primaryCurrency: string; primaryTotal: number; byCurrency: Record<string, number> }> = [];
    for (const l of lines) {
      try { entries.push(JSON.parse(l)); } catch { /* skip */ }
    }
    return entries;
  } catch { return []; }
}

function loadRefreshLog(): RefreshLogEntry[] {
  if (!existsSync(REFRESH_LOG_PATH)) return [];
  try {
    const lines = readFileSync(REFRESH_LOG_PATH, "utf-8").trim().split(/\r?\n/).filter(Boolean);
    return lines.map(l => JSON.parse(l)).filter(Boolean);
  } catch { return []; }
}

function appendRefreshLog(entry: RefreshLogEntry): void {
  if (!existsSync(FINANCES_DIR)) mkdirSync(FINANCES_DIR, { recursive: true });
  appendFileSync(REFRESH_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

function loadCrossedMilestones(): Record<string, { direction: "up" | "down"; ts: string }> {
  if (!existsSync(MILESTONES_PATH)) return {};
  try { return JSON.parse(readFileSync(MILESTONES_PATH, "utf-8")); } catch { return {}; }
}

function saveCrossedMilestones(m: Record<string, { direction: "up" | "down"; ts: string }>): void {
  if (!existsSync(FINANCES_DIR)) mkdirSync(FINANCES_DIR, { recursive: true });
  writeFileSync(MILESTONES_PATH, JSON.stringify(m, null, 2), "utf-8");
}

function fmtMoney(v: number, currency: string): string {
  return `${currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── 1. Evaluate Wealth Signals ──

export async function evaluateWealthSignals(): Promise<WealthSignal> {
  const config = loadConfig();
  const accounts = loadAccounts();
  const history = loadNetWorthHistory();
  const refreshLog = loadRefreshLog();

  // Get base snapshot from finances-summary
  let snapshot: WealthSignal["snapshot"] = null;
  try {
    const { getFinancesSnapshot } = await import("./finances-summary.js");
    snapshot = getFinancesSnapshot();
  } catch { /* not available */ }

  const alerts: WealthAlert[] = [];
  const now = Date.now();

  // ── Per-account staleness ──
  const accountStaleness: AccountStaleness[] = accounts.map(a => {
    const updated = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
    const daysSince = updated ? (now - updated) / (24 * 60 * 60 * 1000) : Infinity;
    let severity: AccountStaleness["severity"] = "ok";
    if (daysSince >= config.staleness.criticalDays) severity = "critical";
    else if (daysSince >= config.staleness.alertDays) severity = "alert";
    else if (daysSince >= config.staleness.warnDays) severity = "warn";
    return {
      accountId: a.accountId,
      displayName: a.displayName,
      daysSinceUpdate: Math.round(daysSince * 10) / 10,
      severity,
    };
  });

  // Staleness alerts — warn+ severity generates reminders; alert/critical escalate severity
  for (const s of accountStaleness) {
    if (s.severity === "warn" || s.severity === "alert" || s.severity === "critical") {
      const alertSeverity: WealthAlert["severity"] =
        s.severity === "critical" ? "critical" : s.severity === "alert" ? "warn" : "info";
      const threshold =
        s.severity === "critical" ? config.staleness.criticalDays
        : s.severity === "alert" ? config.staleness.alertDays
        : config.staleness.warnDays;
      alerts.push({
        id: randomUUID(),
        type: "staleness",
        severity: alertSeverity,
        title: `${s.displayName} needs a refresh (${Math.round(s.daysSinceUpdate)}d old)`,
        detail: `Account "${s.displayName}" has not been refreshed in ${Math.round(s.daysSinceUpdate)} days. Run a wealth refresh to keep net worth accurate.`,
        accountId: s.accountId,
        value: s.daysSinceUpdate,
        threshold,
      });
    }
  }

  // ── Daily swing detection ──
  if (snapshot && snapshot.deltaPct != null) {
    const absPct = Math.abs(snapshot.deltaPct);
    if (absPct >= config.thresholds.dailyChangePct) {
      const dir = snapshot.deltaPct >= 0 ? "up" : "down";
      alerts.push({
        id: randomUUID(),
        type: "daily-swing",
        severity: "warn",
        title: `Portfolio ${dir} ${absPct.toFixed(1)}% (${fmtMoney(snapshot.delta!, snapshot.primaryCurrency)})`,
        detail: `Net worth moved ${dir} by ${absPct.toFixed(1)}% since ${snapshot.deltaPeriod}. Threshold: ${config.thresholds.dailyChangePct}%.`,
        value: snapshot.deltaPct,
        threshold: config.thresholds.dailyChangePct,
      });
    }
  }

  // ── Milestone crossing ──
  if (snapshot && snapshot.primaryTotal > 0) {
    const crossed = loadCrossedMilestones();
    const prevTotal = history.length >= 2
      ? history[history.length - 2]?.primaryTotal ?? 0
      : 0;

    for (const m of config.thresholds.milestones) {
      const key = `${snapshot.primaryCurrency}-${m}`;
      const crossedUp = prevTotal < m && snapshot.primaryTotal >= m;
      const crossedDown = prevTotal >= m && snapshot.primaryTotal < m;

      if (crossedUp && crossed[key]?.direction !== "up") {
        alerts.push({
          id: randomUUID(),
          type: "milestone-crossed",
          severity: "info",
          title: `Milestone reached: ${fmtMoney(m, snapshot.primaryCurrency)}`,
          detail: `Net worth crossed ${fmtMoney(m, snapshot.primaryCurrency)} upward!`,
          value: snapshot.primaryTotal,
          threshold: m,
        });
        crossed[key] = { direction: "up", ts: new Date().toISOString() };
      } else if (crossedDown && crossed[key]?.direction !== "down") {
        alerts.push({
          id: randomUUID(),
          type: "milestone-crossed",
          severity: "warn",
          title: `Milestone lost: dropped below ${fmtMoney(m, snapshot.primaryCurrency)}`,
          detail: `Net worth fell below ${fmtMoney(m, snapshot.primaryCurrency)}.`,
          value: snapshot.primaryTotal,
          threshold: m,
        });
        crossed[key] = { direction: "down", ts: new Date().toISOString() };
      }
    }
    saveCrossedMilestones(crossed);
  }

  // ── Concentration risk ──
  for (const acct of accounts) {
    if (!acct.currentValue || acct.currentValue <= 0) continue;
    // Read holdings from the entity page if available
    try {
      const entityPath = join(HOME, ".enso", "wiki", "entities", `account-${acct.slug}.md`);
      if (existsSync(entityPath)) {
        const content = readFileSync(entityPath, "utf-8");
        const holdingLines = content.split("\n").filter(l => l.startsWith("- **[[") && l.includes("shares"));
        // Rough check: if only 1-2 holdings, concentration is likely high
        if (holdingLines.length === 1 && acct.currentValue > 10000) {
          alerts.push({
            id: randomUUID(),
            type: "concentration",
            severity: "warn",
            title: `${acct.displayName}: single-stock concentration`,
            detail: `Account "${acct.displayName}" appears to hold a single position. Consider diversification.`,
            accountId: acct.accountId,
            threshold: config.thresholds.concentrationPct,
          });
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Refresh status ──
  const kkLiveEntries = refreshLog.filter(e => e.source === "kk-live");
  const rmEmailEntries = refreshLog.filter(e => e.source === "rm-emails");
  const lastKk = kkLiveEntries.length > 0 ? kkLiveEntries[kkLiveEntries.length - 1] : null;
  const lastRm = rmEmailEntries.length > 0 ? rmEmailEntries[rmEmailEntries.length - 1] : null;
  const lastEntry = refreshLog.length > 0 ? refreshLog[refreshLog.length - 1] : null;

  const refreshStatus: RefreshStatus = {
    lastKkLiveRefresh: lastKk?.ts ?? null,
    lastRmEmailRefresh: lastRm?.ts ?? null,
    pendingRefresh: existsSync(LOCK_PATH),
    lastRefreshResult: lastEntry ? (lastEntry.success ? "success" : "failure") : null,
    lastRefreshError: lastEntry && !lastEntry.success ? (lastEntry.error ?? null) : null,
  };

  // Add refresh failure alert if the most recent refresh failed
  if (lastEntry && !lastEntry.success) {
    const failureAge = (now - new Date(lastEntry.ts).getTime()) / (60 * 60 * 1000);
    if (failureAge < 24) {
      alerts.push({
        id: randomUUID(),
        type: "refresh-failure",
        severity: "critical",
        title: `Wealth refresh failed (${lastEntry.source})`,
        detail: `Last ${lastEntry.source} refresh failed: ${lastEntry.error || "unknown error"}. ${Math.round(failureAge)}h ago.`,
      });
    }
  }

  // ── Briefing line ──
  const briefingParts: string[] = [];
  if (snapshot) {
    briefingParts.push(`Net worth ${fmtMoney(snapshot.primaryTotal, snapshot.primaryCurrency)} across ${snapshot.accountCount} account${snapshot.accountCount === 1 ? "" : "s"}`);
    if (snapshot.delta != null && snapshot.deltaPct != null) {
      const dir = snapshot.delta >= 0 ? "+" : "";
      briefingParts.push(`${dir}${fmtMoney(snapshot.delta, snapshot.primaryCurrency)} (${dir}${snapshot.deltaPct}%)`);
    }
  }
  if (alerts.length > 0) {
    const critCount = alerts.filter(a => a.severity === "critical").length;
    const warnCount = alerts.filter(a => a.severity === "warn").length;
    if (critCount > 0) briefingParts.push(`${critCount} critical alert${critCount > 1 ? "s" : ""}`);
    if (warnCount > 0) briefingParts.push(`${warnCount} warning${warnCount > 1 ? "s" : ""}`);
  }
  const staleCount = accountStaleness.filter(a => a.severity !== "ok").length;
  if (staleCount > 0) briefingParts.push(`${staleCount} stale account${staleCount > 1 ? "s" : ""}`);

  return {
    snapshot,
    alerts,
    refreshStatus,
    accountStaleness,
    briefingLine: briefingParts.join(" · ") || "No financial accounts indexed yet.",
  };
}

// ── 2. Execute Refresh ──

export async function executeWealthRefresh(
  source: "kk-live" | "rm-emails",
  trigger: "scheduled" | "manual" | "react" = "scheduled"
): Promise<RefreshResult> {
  const startTime = Date.now();

  // Lock check
  if (existsSync(LOCK_PATH)) {
    try {
      const lockData = JSON.parse(readFileSync(LOCK_PATH, "utf-8"));
      const lockAge = (Date.now() - new Date(lockData.ts).getTime()) / 60_000;
      if (lockAge < 5) {
        return {
          success: false, source, duration: 0, accountsUpdated: 0, trigger,
          error: "Another refresh is in progress (lock age: " + Math.round(lockAge) + "min)",
          summary: "Skipped — refresh already running",
        };
      }
    } catch { /* stale lock, proceed */ }
  }

  // Acquire lock
  if (!existsSync(FINANCES_DIR)) mkdirSync(FINANCES_DIR, { recursive: true });
  writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, ts: new Date().toISOString(), source }), "utf-8");

  // Snapshot before
  let beforeTotal = 0;
  try {
    const { getFinancesSnapshot } = await import("./finances-summary.js");
    const before = getFinancesSnapshot();
    if (before) beforeTotal = before.primaryTotal;
  } catch { /* no prior data */ }

  let result: RefreshResult;

  try {
    if (source === "kk-live") {
      result = await executeKkLiveRefresh(trigger, beforeTotal, startTime);
    } else {
      result = await executeRmEmailsRefresh(trigger, beforeTotal, startTime);
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    result = {
      success: false, source, duration, accountsUpdated: 0, trigger,
      error: err?.message || String(err),
      summary: `${source} refresh failed: ${err?.message || "unknown error"}`,
    };
    logError("wealth-monitor", `Refresh ${source} failed`, err);
  }

  // Release lock
  try { if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH); } catch { /* ok */ }

  // Log result
  const logEntry: RefreshLogEntry = {
    ts: new Date().toISOString(),
    source,
    success: result.success,
    duration: result.duration,
    accountsUpdated: result.accountsUpdated,
    newStatements: result.newStatements,
    netWorthDelta: result.netWorthDelta,
    error: result.error,
    trigger,
  };
  appendRefreshLog(logEntry);

  logAction({
    ts: Date.now(), type: "action", category: "wealth-monitor",
    message: result.success
      ? `Refresh ${source} complete: ${result.accountsUpdated} accounts updated`
      : `Refresh ${source} failed: ${result.error}`,
  });

  return result;
}

async function executeKkLiveRefresh(
  trigger: string, beforeTotal: number, startTime: number
): Promise<RefreshResult> {
  const { executeToolDirect } = await import("./native-tools/registry.js");

  const toolResult = await executeToolDirect("enso_finances_refresh_kk_live", {});
  const duration = Date.now() - startTime;

  // Parse result from rawText
  let parsed: any = {};
  if (toolResult.rawText) {
    try { parsed = JSON.parse(toolResult.rawText); } catch { /* ok */ }
  }

  if (!toolResult.success || parsed.error) {
    return {
      success: false, source: "kk-live", duration, accountsUpdated: 0, trigger: trigger as any,
      error: parsed.message || toolResult.error || "Unknown error from refresh_kk_live",
      summary: `KK Live refresh failed: ${parsed.message || toolResult.error || "unknown"}`,
    };
  }

  // Compute delta
  let afterTotal = 0;
  try {
    const { getFinancesSnapshot } = await import("./finances-summary.js");
    const after = getFinancesSnapshot();
    if (after) afterTotal = after.primaryTotal;
  } catch { /* ok */ }

  const netWorthDelta = afterTotal - beforeTotal;

  return {
    success: true,
    source: "kk-live",
    duration,
    accountsUpdated: parsed.accountsScanned || 0,
    newStatements: parsed.statementsWritten || 0,
    netWorthDelta: netWorthDelta !== 0 ? netWorthDelta : undefined,
    trigger: trigger as any,
    summary: `Updated ${parsed.accountsScanned || 0} accounts` +
      (netWorthDelta !== 0 ? ` (${netWorthDelta >= 0 ? "+" : ""}${Math.round(netWorthDelta).toLocaleString()})` : ""),
  };
}

async function executeRmEmailsRefresh(
  trigger: string, beforeTotal: number, startTime: number
): Promise<RefreshResult> {
  const { executeToolDirect } = await import("./native-tools/registry.js");

  const toolResult = await executeToolDirect("enso_finances_refresh_rm_emails", {});
  const duration = Date.now() - startTime;

  let parsed: any = {};
  if (toolResult.rawText) {
    try { parsed = JSON.parse(toolResult.rawText); } catch { /* ok */ }
  }

  if (!toolResult.success || parsed.error) {
    return {
      success: false, source: "rm-emails", duration, accountsUpdated: 0, trigger: trigger as any,
      error: parsed.message || toolResult.error || "Unknown error from refresh_rm_emails",
      summary: `RM emails refresh failed: ${parsed.message || toolResult.error || "unknown"}`,
    };
  }

  let afterTotal = 0;
  try {
    const { getFinancesSnapshot } = await import("./finances-summary.js");
    const after = getFinancesSnapshot();
    if (after) afterTotal = after.primaryTotal;
  } catch { /* ok */ }

  const netWorthDelta = afterTotal - beforeTotal;

  return {
    success: true,
    source: "rm-emails",
    duration,
    accountsUpdated: parsed.accountsProcessed || 0,
    newStatements: parsed.newStatements || 0,
    netWorthDelta: netWorthDelta !== 0 ? netWorthDelta : undefined,
    trigger: trigger as any,
    summary: `Processed ${parsed.accountsProcessed || 0} accounts, ${parsed.newStatements || 0} new statements` +
      (netWorthDelta !== 0 ? ` (${netWorthDelta >= 0 ? "+" : ""}${Math.round(netWorthDelta).toLocaleString()})` : ""),
  };
}

// ── 3. Notification Formatting ──

export function formatWealthNotification(signal: WealthSignal): {
  subject: string;
  html: string;
  wechat: string;
  briefingSection: { emoji: string; title: string; items: string[] };
} {
  const snap = signal.snapshot;
  const hasCritical = signal.alerts.some(a => a.severity === "critical");

  // Subject
  let subject: string;
  if (hasCritical) {
    const critAlert = signal.alerts.find(a => a.severity === "critical")!;
    subject = `⚠️ ${critAlert.title}`;
  } else if (snap) {
    const dir = (snap.delta ?? 0) >= 0 ? "+" : "";
    subject = `💰 Wealth Update — ${fmtMoney(snap.primaryTotal, snap.primaryCurrency)}`;
    if (snap.deltaPct != null) subject += ` (${dir}${snap.deltaPct}%)`;
  } else {
    subject = "💰 Wealth Monitor Update";
  }

  // HTML
  const htmlParts: string[] = [];
  htmlParts.push(`<h2 style="margin:0 0 12px;font-size:18px">Wealth Summary</h2>`);
  if (snap) {
    htmlParts.push(`<p style="font-size:24px;font-weight:700;margin:0">${fmtMoney(snap.primaryTotal, snap.primaryCurrency)}</p>`);
    if (snap.delta != null && snap.deltaPct != null) {
      const color = snap.delta >= 0 ? "#22c55e" : "#ef4444";
      const dir = snap.delta >= 0 ? "+" : "";
      htmlParts.push(`<p style="color:${color};font-size:14px;margin:4px 0">${dir}${fmtMoney(snap.delta, snap.primaryCurrency)} (${dir}${snap.deltaPct}%) since ${snap.deltaPeriod}</p>`);
    }
    htmlParts.push(`<p style="color:#888;font-size:12px;margin:4px 0">${snap.accountCount} accounts · ${signal.accountStaleness.filter(a => a.severity === "ok").length} fresh</p>`);
  }

  if (signal.alerts.length > 0) {
    htmlParts.push(`<h3 style="margin:16px 0 8px;font-size:14px">Alerts</h3>`);
    htmlParts.push(`<ul style="padding-left:16px;margin:0">`);
    for (const a of signal.alerts) {
      const icon = a.severity === "critical" ? "🔴" : a.severity === "warn" ? "🟡" : "🔵";
      htmlParts.push(`<li style="margin:4px 0">${icon} ${a.title}</li>`);
    }
    htmlParts.push(`</ul>`);
  }

  if (signal.accountStaleness.some(a => a.severity !== "ok")) {
    htmlParts.push(`<h3 style="margin:16px 0 8px;font-size:14px">Account Refresh Needed</h3>`);
    htmlParts.push(`<ul style="padding-left:16px;margin:0">`);
    for (const s of signal.accountStaleness.filter(a => a.severity !== "ok")) {
      const icon = s.severity === "critical" ? "🔴" : s.severity === "alert" ? "🟡" : "🔵";
      htmlParts.push(`<li style="margin:4px 0">${icon} ${s.displayName}: ${Math.round(s.daysSinceUpdate)}d since last refresh [${s.severity}]</li>`);
    }
    htmlParts.push(`</ul>`);
    htmlParts.push(`<p style="color:#888;font-size:12px;margin:8px 0 0">Run <code>enso_finances_refresh_kk_live</code> or <code>enso_finances_refresh_rm_emails</code> to update.</p>`);
  }

  const html = htmlParts.join("\n");

  // WeChat (compact text)
  const wcParts: string[] = [];
  wcParts.push("📊 Wealth Update");
  if (snap) {
    const dir = (snap.delta ?? 0) >= 0 ? "+" : "";
    wcParts.push(`Net worth: ${fmtMoney(snap.primaryTotal, snap.primaryCurrency)}` +
      (snap.deltaPct != null ? ` (${dir}${snap.deltaPct}%)` : ""));
  }
  const staleCount = signal.accountStaleness.filter(a => a.severity !== "ok").length;
  wcParts.push(`Accounts: ${signal.accountStaleness.length} total, ${staleCount} stale`);
  for (const a of signal.alerts.slice(0, 3)) {
    const icon = a.severity === "critical" ? "⚠️" : "•";
    wcParts.push(`${icon} ${a.title}`);
  }
  if (signal.alerts.length > 3) wcParts.push(`...and ${signal.alerts.length - 3} more`);
  const wechat = wcParts.join("\n");

  // Briefing section
  const items: string[] = [];
  if (snap) {
    const dir = (snap.delta ?? 0) >= 0 ? "+" : "";
    items.push(`Net worth: ${fmtMoney(snap.primaryTotal, snap.primaryCurrency)}${snap.deltaPct != null ? ` (${dir}${snap.deltaPct}%)` : ""}`);
  }
  for (const a of signal.alerts) items.push(`[${a.severity.toUpperCase()}] ${a.title}`);
  if (staleCount > 0) {
    const reminderAccounts = signal.accountStaleness.filter(a => a.severity !== "ok");
    items.push(`${staleCount} account${staleCount > 1 ? "s" : ""} need refresh: ${reminderAccounts.map(a => `${a.displayName} (${Math.round(a.daysSinceUpdate)}d)`).join(", ")}`);
  }

  return {
    subject, html, wechat,
    briefingSection: { emoji: "💰", title: "Wealth", items },
  };
}

// ── 4. Refresh Result Notification Formatting ──

export function formatRefreshResultNotification(result: RefreshResult): {
  subject: string;
  html: string;
  wechat: string;
} {
  if (result.success) {
    const subject = `✅ Wealth refresh complete — ${result.summary}`;
    const html = [
      `<h2 style="margin:0 0 8px;font-size:16px">✅ Refresh Complete</h2>`,
      `<p><strong>Source:</strong> ${result.source}</p>`,
      `<p><strong>Accounts updated:</strong> ${result.accountsUpdated}</p>`,
      result.newStatements ? `<p><strong>New statements:</strong> ${result.newStatements}</p>` : "",
      result.netWorthDelta != null ? `<p><strong>Net worth change:</strong> ${result.netWorthDelta >= 0 ? "+" : ""}${Math.round(result.netWorthDelta).toLocaleString()}</p>` : "",
      `<p style="color:#888;font-size:12px">Duration: ${(result.duration / 1000).toFixed(1)}s · Trigger: ${result.trigger}</p>`,
    ].filter(Boolean).join("\n");
    const wechat = `✅ Wealth refresh done\n${result.summary}\nDuration: ${(result.duration / 1000).toFixed(1)}s`;
    return { subject, html, wechat };
  } else {
    const subject = `⚠️ Wealth refresh failed — ${result.source}`;
    const html = [
      `<h2 style="margin:0 0 8px;font-size:16px;color:#ef4444">⚠️ Refresh Failed</h2>`,
      `<p><strong>Source:</strong> ${result.source}</p>`,
      `<p><strong>Error:</strong> ${result.error || "Unknown"}</p>`,
      `<p style="color:#888;font-size:12px">Duration: ${(result.duration / 1000).toFixed(1)}s · Trigger: ${result.trigger}</p>`,
    ].join("\n");
    const wechat = `⚠️ Wealth refresh failed (${result.source})\nError: ${result.error || "unknown"}`;
    return { subject, html, wechat };
  }
}

// ── 5. Schedule Matching ──

export function shouldRefreshNow(source: "kk-live" | "rm-emails"): boolean {
  const config = loadConfig();
  const schedule = source === "kk-live" ? config.refreshSchedule.kkLive : config.refreshSchedule.rmEmails;
  if (!schedule.enabled) return false;

  // Simple cron match for the current hour/day
  const now = new Date();
  const parts = schedule.cron.split(/\s+/);
  if (parts.length < 5) return false;

  const [minute, hour, , , dow] = parts;

  // Match hour
  if (hour !== "*" && parseInt(hour) !== now.getHours()) return false;
  // Match minute (within 30-min window to account for TL check-in timing)
  if (minute !== "*") {
    const targetMin = parseInt(minute);
    const currentMin = now.getMinutes();
    if (Math.abs(currentMin - targetMin) > 30) return false;
  }
  // Match day of week
  if (dow !== "*") {
    const days = dow.split(",").flatMap(d => {
      if (d.includes("-")) {
        const [s, e] = d.split("-").map(Number);
        const range: number[] = [];
        for (let i = s; i <= e; i++) range.push(i);
        return range;
      }
      return [parseInt(d)];
    });
    if (!days.includes(now.getDay())) return false;
  }

  // Check we haven't already refreshed in the last 4 hours
  const log = loadRefreshLog().filter(e => e.source === source);
  if (log.length > 0) {
    const lastTs = new Date(log[log.length - 1].ts).getTime();
    if (Date.now() - lastTs < 4 * 60 * 60 * 1000) return false;
  }

  return true;
}

// ── 6. Get Refresh History (for TL briefing inclusion) ──

export function getRefreshHistory(days: number = 7): RefreshLogEntry[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return loadRefreshLog().filter(e => new Date(e.ts).getTime() > cutoff);
}

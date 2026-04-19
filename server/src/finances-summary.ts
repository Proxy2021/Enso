/**
 * finances-summary.ts — Read-only helpers for the Team Leader morning routine
 * to surface a one-liner about the user's financial position alongside other
 * signals.
 *
 * Purely local: reads ~/.enso/data/finances/{accounts.json, net_worth_history.jsonl}.
 * No network, no LLM. Returns null when no data is indexed yet.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const FINANCES_DIR = join(homedir(), ".enso", "data", "finances");
const INDEX_PATH = join(FINANCES_DIR, "accounts.json");
const HISTORY_PATH = join(FINANCES_DIR, "net_worth_history.jsonl");

interface AccountIndexEntry {
  accountId: string;
  slug: string;
  displayName: string;
  institution: string;
  accountType: string;
  baseCurrency: string;
  currentValue: number;
  cash: number | null;
  statementCount: number;
  lastUpdated: string;
  sourceKind?: string;
}

interface HistorySnapshot {
  date: string;
  ts: string;
  accountCount: number;
  byCurrency: Record<string, number>;
  primaryCurrency: string;
  primaryTotal: number;
}

export interface FinancesSnapshot {
  accountCount: number;
  primaryCurrency: string;
  primaryTotal: number;
  byCurrency: Record<string, number>;
  delta: number | null;
  deltaPct: number | null;
  deltaPeriod: string | null;
  staleAccounts: number;        // # accounts not refreshed in > 7 days
  oldestRefreshAgeDays: number | null;
}

function fmtMoney(v: number, currency: string): string {
  return `${currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Build a structured snapshot of the user's financial state. Returns null if
 * no accounts have been indexed yet.
 */
export function getFinancesSnapshot(): FinancesSnapshot | null {
  if (!existsSync(INDEX_PATH)) return null;

  let idx: { accounts?: AccountIndexEntry[]; lastRefreshAt?: string } = {};
  try { idx = JSON.parse(readFileSync(INDEX_PATH, "utf-8")); } catch { return null; }
  const accounts = Array.isArray(idx.accounts) ? idx.accounts : [];
  if (accounts.length === 0) return null;

  // Per-currency rollup
  const byCurrency: Record<string, number> = {};
  for (const a of accounts) {
    const c = a.baseCurrency || "USD";
    byCurrency[c] = (byCurrency[c] || 0) + (a.currentValue || 0);
  }
  // Pick primary currency = largest total
  let primaryCurrency = "USD";
  let primaryTotal = 0;
  for (const c of Object.keys(byCurrency)) {
    if (byCurrency[c] > primaryTotal) { primaryTotal = byCurrency[c]; primaryCurrency = c; }
  }

  // Delta vs previous snapshot
  let delta: number | null = null;
  let deltaPct: number | null = null;
  let deltaPeriod: string | null = null;
  if (existsSync(HISTORY_PATH)) {
    try {
      const lines = readFileSync(HISTORY_PATH, "utf-8").trim().split(/\r?\n/).filter(Boolean);
      const history: HistorySnapshot[] = [];
      for (const l of lines) { try { history.push(JSON.parse(l)); } catch { /* skip */ } }
      // Find the most recent snapshot from a different day
      const todayKey = new Date().toISOString().slice(0, 10);
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].date !== todayKey) {
          const prevVal = history[i].byCurrency?.[primaryCurrency];
          if (typeof prevVal === "number" && prevVal > 0) {
            delta = primaryTotal - prevVal;
            deltaPct = Math.round((delta / prevVal) * 10000) / 100;
            deltaPeriod = history[i].date;
          }
          break;
        }
      }
    } catch { /* fresh */ }
  }

  // Staleness check
  const now = Date.now();
  let staleAccounts = 0;
  let oldestAge: number | null = null;
  for (const a of accounts) {
    const updated = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
    if (!updated) continue;
    const ageDays = (now - updated) / (24 * 60 * 60 * 1000);
    if (ageDays > 7) staleAccounts++;
    if (oldestAge === null || ageDays > oldestAge) oldestAge = ageDays;
  }

  return {
    accountCount: accounts.length,
    primaryCurrency,
    primaryTotal,
    byCurrency,
    delta,
    deltaPct,
    deltaPeriod,
    staleAccounts,
    oldestRefreshAgeDays: oldestAge != null ? Math.round(oldestAge * 10) / 10 : null,
  };
}

/**
 * One-line text summary for inclusion in the TL morning briefing.
 * Returns null when there's no signal worth surfacing.
 */
export function getFinancesBriefingLine(): string | null {
  const s = getFinancesSnapshot();
  if (!s) return null;

  const head = `Net worth ${fmtMoney(s.primaryTotal, s.primaryCurrency)} across ${s.accountCount} account${s.accountCount === 1 ? "" : "s"}`;
  const parts: string[] = [head];

  if (s.delta != null && s.deltaPct != null) {
    const dir = s.delta >= 0 ? "+" : "";
    parts.push(`${dir}${fmtMoney(s.delta, s.primaryCurrency)} (${dir}${s.deltaPct}%) since ${s.deltaPeriod}`);
  }
  if (s.staleAccounts > 0) {
    parts.push(`${s.staleAccounts} account${s.staleAccounts === 1 ? "" : "s"} stale (>7d) — consider refresh`);
  }
  return parts.join(" · ");
}

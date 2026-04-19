/**
 * Stocks Daily Briefing — end-to-end delivery for the FactorStrategies feed.
 *
 * Pipeline:
 *   1. Run the stocks_daily app's primary tool to get today's portfolio data.
 *   2. Render an email summary (text + HTML) of the flagship preset.
 *   3. Send via sendBriefingEmail — registers a notificationId and adds the
 *      standard react buttons + landing-page link.
 *   4. Attach the full interactive card snapshot to that notification so
 *      /share/<id> renders the same dashboard the in-app card uses.
 *   5. Optionally fan out to WeChat followers.
 *
 * Used by the daily-stocks scheduled task and exposed as the
 * `enso_stocks_daily_briefing` tool so the agent can run it on demand.
 */

import { executeToolDirect } from "./native-tools/registry.js";
import { sendHtmlEmail } from "./email.js";
import { attachCardSnapshot, registerNotification, storeBriefingHtml, type SharedCardSnapshot } from "./reacts.js";
import { loadAllApps } from "./app-persistence.js";
import { getEnsoUrl } from "./shareable-pages.js";
import { logAction, logError } from "./action-log.js";

const APP_ID = "stocks_daily";
const PRIMARY_SUFFIX = "today";
const FS_REPO_DIR = "D:/Github/FactorStrategies";
const FS_PYTHON = "D:/Github/FactorStrategies/.venv/Scripts/python.exe";
const REFRESH_TIMEOUT_MS = 10 * 60 * 1000; // 10 min — daily_routine fetches Alpha Vantage data
// Actions the recipient can invoke from the public landing page.
// add_to_watchlist + factor_info + stock_detail = read/write to ~/.enso/data only.
// portfolio_checkin spawns the FactorStrategies python script; with the trade
// password configured it can submit orders. Allowed because the unguessable
// notification ID is the auth boundary (per project policy).
const PUBLIC_ALLOWED_ACTIONS = ["add_to_watchlist", "factor_info", "stock_detail", "portfolio_checkin"];
// Daily content is reasonable to revisit for ~30 days; default 7 is too short.
const SNAPSHOT_TTL_DAYS = 30;

export interface StocksDailyBriefingResult {
  ok: boolean;
  message: string;
  notificationId?: string;
  briefingUrl?: string;
  shareUrl?: string;
  /** Whether email delivery actually went out (vs. preview-only). */
  emailSent?: boolean;
  /** Number of WeChat followers messaged. */
  wechatRecipients?: number;
}

export interface StocksDailyBriefingParams {
  /** Recipient(s). Comma-separated for multiple. Defaults to env DEFAULT_RECIPIENT_EMAIL. */
  to?: string;
  /** Skip email send — useful for testing the snapshot+share flow without spamming. */
  skipEmail?: boolean;
  /** Skip WeChat fanout. Defaults to true if no followers. */
  skipWechat?: boolean;
  /** Override subject. Defaults to "FactorStrategies Daily — <panelDate>". */
  subject?: string;
  /** Skip the git-pull + daily_routine.py refresh. Useful for smoke tests that
   *  just want to rebuild the snapshot off whatever latest.json is on disk. */
  skipRefresh?: boolean;
}

/** Run a child process and return captured stdout/stderr + exit code. */
async function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string; durationMs: number }> {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } }, timeoutMs);
    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => { stderr += b.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, exitCode: code, stdout, stderr, durationMs: Date.now() - startedAt });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: -1, stdout, stderr: stderr + "\n[spawn error] " + err.message, durationMs: Date.now() - startedAt });
    });
  });
}

/**
 * Refresh the FactorStrategies project: git pull → python daily_routine.py.
 * git pull failures are non-fatal (just log a warning — local data still usable).
 * daily_routine failures ARE fatal — we don't want to send picks computed off
 * stale data without telling the user.
 */
export async function refreshFactorStrategies(): Promise<{
  ok: boolean;
  message: string;
  gitStatus?: { ok: boolean; output: string };
  routineStatus?: { ok: boolean; durationMs: number; output: string };
}> {
  const t0 = Date.now();

  // 1. git pull (non-fatal if it fails)
  const gp = await runProcess("git", ["pull", "--ff-only"], FS_REPO_DIR, 60_000);
  const gitOutput = (gp.stdout + (gp.stderr ? "\n[stderr]\n" + gp.stderr : "")).trim();
  if (!gp.ok) {
    logError("stocks-daily-briefing", `git pull failed (continuing with local code): ${gitOutput.slice(0, 400)}`);
  } else {
    logAction({ ts: Date.now(), type: "action", category: "stocks-daily-briefing", message: `git pull ok (${gp.durationMs}ms): ${gitOutput.split("\n")[0].slice(0, 120)}` });
  }

  // 2. python daily_routine.py (fatal if it fails)
  const dr = await runProcess(FS_PYTHON, ["daily_routine.py"], FS_REPO_DIR, REFRESH_TIMEOUT_MS);
  const routineOutput = (dr.stdout + (dr.stderr ? "\n[stderr]\n" + dr.stderr : "")).trim();
  if (!dr.ok) {
    logError("stocks-daily-briefing", `daily_routine.py failed (exit ${dr.exitCode}): ${routineOutput.slice(-500)}`);
    return {
      ok: false,
      message: `daily_routine.py failed (exit ${dr.exitCode}). Picks not refreshed.`,
      gitStatus: { ok: gp.ok, output: gitOutput.slice(-2000) },
      routineStatus: { ok: false, durationMs: dr.durationMs, output: routineOutput.slice(-3000) },
    };
  }

  logAction({
    ts: Date.now(),
    type: "action",
    category: "stocks-daily-briefing",
    message: `Refresh complete (git ${gp.ok ? "ok" : "failed"} + daily_routine ok in ${(dr.durationMs / 1000).toFixed(1)}s, total ${(Date.now() - t0) / 1000}s)`,
  });

  return {
    ok: true,
    message: `Refreshed FactorStrategies in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    gitStatus: { ok: gp.ok, output: gitOutput.slice(-1000) },
    routineStatus: { ok: true, durationMs: dr.durationMs, output: routineOutput.slice(-2000) },
  };
}

interface PresetForEmail {
  id: string;
  label: string;
  theme: string;
  factorBlend: string;
  isFlagship?: boolean;
  cashPct?: number;
  nQualify?: number;
  nFilled?: number;
  nTarget?: number;
  holdings: Array<{ ticker: string; weightPct: number; rank: number; watching?: boolean }>;
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

function renderEmailHtml(data: any, shareUrl: string): string {
  const presets = (Array.isArray(data?.presets) ? data.presets : []) as PresetForEmail[];
  if (presets.length === 0) {
    return `<div style="background:#0a0e1a;color:#e2e8f0;padding:24px;border-radius:12px;font-family:-apple-system,sans-serif">
      <h2 style="margin:0 0 8px;color:#f8fafc">Daily Stock Picks</h2>
      <p style="color:#94a3b8;margin:0">No presets in today's holdings file. Run <code>python daily_picks.py --no-refresh</code> in the FactorStrategies project to generate it.</p>
    </div>`;
  }

  const flagship = presets.find((p) => p.isFlagship) ?? presets[0];
  const consensusTickers: Array<{ ticker: string; presetCount: number }> =
    Array.isArray(data?.consensusTickers) ? data.consensusTickers : [];

  const flagshipRows = flagship.holdings.map((h) => `
    <tr>
      <td style="padding:6px 8px;border-top:1px solid #1e293b;color:#475569;font-family:monospace;font-size:11px;width:32px">#${h.rank}</td>
      <td style="padding:6px 8px;border-top:1px solid #1e293b;color:#f1f5f9;font-family:monospace;font-weight:600">${escapeHtml(h.ticker)}</td>
      <td style="padding:6px 8px;border-top:1px solid #1e293b;color:#cbd5e1;font-family:monospace;text-align:right;width:60px">${h.weightPct.toFixed(1)}%</td>
    </tr>`).join("");

  const consensusChips = consensusTickers.slice(0, 12).map((c) => `
    <span style="display:inline-block;padding:3px 9px;margin:2px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#cbd5e1;font-family:monospace;font-size:12px">${escapeHtml(c.ticker)} <span style="color:#64748b">×${c.presetCount}</span></span>`).join("");

  const otherPresets = presets.filter((p) => p.id !== flagship.id).map((p) => `
    <div style="padding:10px 12px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;margin-top:6px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8">
        <span style="color:#cbd5e1;font-family:monospace;font-weight:600">${escapeHtml(p.id)}</span>
        <span>${p.holdings.length} holdings · ${p.nQualify ?? "?"} qualifying</span>
      </div>
      <div style="margin-top:4px;color:#64748b;font-size:11px">${escapeHtml(p.factorBlend)}</div>
      <div style="margin-top:6px;font-family:monospace;font-size:12px;color:#e2e8f0">${p.holdings.slice(0, 8).map((h) => escapeHtml(h.ticker)).join(" · ")}${p.holdings.length > 8 ? "…" : ""}</div>
    </div>`).join("");

  return `<div style="background:#020617;padding:20px 16px;color:#e2e8f0;font-family:-apple-system,system-ui,sans-serif">
  <div style="max-width:600px;margin:0 auto">

    <div style="background:linear-gradient(135deg,#0f172a,#1e1b4b);border-radius:12px;padding:18px 22px;border:1px solid #1e293b">
      <div style="color:#a5b4fc;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Daily Stock Picks</div>
      <div style="color:#f8fafc;font-size:22px;font-weight:700;margin-top:4px">${escapeHtml(data.panelDate ?? "—")}</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:6px">${presets.length} preset${presets.length === 1 ? "" : "s"} · ${data.universeSize ?? "?"}-ticker universe</div>
    </div>

    ${consensusChips ? `
    <div style="margin-top:14px;background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px 16px">
      <div style="color:#10b981;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:6px">High-conviction (in 2+ presets)</div>
      ${consensusChips}
    </div>` : ""}

    <div style="margin-top:14px;background:#0f172a;border:1px solid #4c1d95;border-radius:10px;overflow:hidden">
      <div style="padding:14px 18px;background:linear-gradient(90deg,#1e1b4b,#0f172a);border-bottom:1px solid #1e293b">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="background:#92400e;color:#fbbf24;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Flagship</span>
          <span style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px">${escapeHtml(flagship.theme)}</span>
        </div>
        <div style="color:#f1f5f9;font-size:16px;font-weight:700">${escapeHtml(flagship.label)}</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:6px;line-height:1.5">${escapeHtml(flagship.factorBlend)}</div>
        <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:#94a3b8">
          <span><b style="color:#10b981">${flagship.nFilled ?? "?"}/${flagship.nTarget ?? "?"}</b> filled</span>
          <span><b style="color:#cbd5e1">${flagship.nQualify ?? "?"}</b> qualifying</span>
          ${flagship.cashPct ? `<span><b style="color:#fbbf24">${flagship.cashPct}%</b> cash</span>` : ""}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#0f172a">
        ${flagshipRows}
      </table>
    </div>

    <div style="text-align:center;margin-top:20px">
      <a href="${shareUrl}" style="display:inline-block;background:#312e81;color:#e0e7ff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;border:1px solid #4c1d95">
        Open interactive dashboard →
      </a>
      <div style="color:#475569;font-size:11px;margin-top:8px">Tap any ticker to add to your watchlist · view factor methodology · explore all presets</div>
    </div>

    ${otherPresets ? `
    <div style="margin-top:20px;padding-top:14px;border-top:1px solid #1e293b">
      <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:8px">Other presets</div>
      ${otherPresets}
    </div>` : ""}

  </div>
</div>`;
}

function renderTextFallback(data: any, shareUrl: string): string {
  const presets = (Array.isArray(data?.presets) ? data.presets : []) as PresetForEmail[];
  if (presets.length === 0) return "No presets in today's holdings file.";
  const flagship = presets.find((p) => p.isFlagship) ?? presets[0];
  const lines = [
    `Daily Stock Picks — ${data.panelDate ?? "—"}`,
    `${presets.length} presets · ${data.universeSize ?? "?"}-ticker universe`,
    "",
    `★ ${flagship.label}`,
    `   ${flagship.factorBlend}`,
    `   ${flagship.nFilled ?? "?"}/${flagship.nTarget ?? "?"} filled · ${flagship.nQualify ?? "?"} qualifying${flagship.cashPct ? ` · ${flagship.cashPct}% cash` : ""}`,
    "",
    ...flagship.holdings.map((h) => `   #${h.rank.toString().padStart(2, " ")}  ${h.ticker.padEnd(6, " ")}  ${h.weightPct.toFixed(1)}%`),
    "",
    `Open interactive dashboard: ${shareUrl}`,
  ];
  return lines.join("\n");
}

function renderWechatSummary(data: any, shareUrl: string): string {
  const presets = (Array.isArray(data?.presets) ? data.presets : []) as PresetForEmail[];
  if (presets.length === 0) return "Daily picks: no presets available today.";
  const flagship = presets.find((p) => p.isFlagship) ?? presets[0];
  const consensusTickers: Array<{ ticker: string; presetCount: number }> =
    Array.isArray(data?.consensusTickers) ? data.consensusTickers : [];

  const lines = [
    `📈 Daily Stock Picks — ${data.panelDate ?? "—"}`,
    "",
    `★ ${flagship.label}`,
    `${flagship.holdings.slice(0, 10).map((h) => h.ticker).join(" · ")}`,
  ];
  if (consensusTickers.length > 0) {
    lines.push("");
    lines.push(`High-conviction (in ≥2 presets):`);
    lines.push(consensusTickers.slice(0, 8).map((c) => `${c.ticker}×${c.presetCount}`).join("  "));
  }
  lines.push("");
  lines.push(`Tap to interact: ${shareUrl}`);
  return lines.join("\n");
}

// ── Main entrypoint ──

export async function runStocksDailyBriefing(params: StocksDailyBriefingParams = {}): Promise<StocksDailyBriefingResult> {
  // 1. Resolve recipient
  const to = (params.to ?? process.env.DEFAULT_RECIPIENT_EMAIL ?? process.env.SMTP_EMAIL ?? "").trim();
  if (!to && !params.skipEmail) {
    return { ok: false, message: "No recipient configured (set DEFAULT_RECIPIENT_EMAIL or pass `to`)" };
  }

  // 2. Refresh FactorStrategies — git pull + daily_routine.py — so latest.json
  // reflects today's compute. Skippable for tests; fatal if daily_routine errors.
  if (!params.skipRefresh) {
    const refresh = await refreshFactorStrategies();
    if (!refresh.ok) {
      return { ok: false, message: refresh.message };
    }
  }

  // 3. Resolve loaded app + run primary tool
  const apps = loadAllApps();
  const app = apps.find((a) => a.spec.toolFamily === APP_ID);
  if (!app) return { ok: false, message: `App "${APP_ID}" not registered` };

  const primaryToolName = `${app.spec.toolPrefix}${PRIMARY_SUFFIX}`;
  const primaryResult = await executeToolDirect(primaryToolName, {});
  if (!primaryResult.success) {
    return { ok: false, message: `Primary tool "${primaryToolName}" failed: ${primaryResult.error ?? "unknown"}` };
  }
  const data: any = primaryResult.data;
  if (data?.error) {
    return { ok: false, message: `Picks unavailable: ${data.message ?? "unknown"}` };
  }

  // 3. Build subject
  const panelDate = data.panelDate ?? new Date().toISOString().slice(0, 10);
  const subject = (params.subject ?? "").trim() || `FactorStrategies Daily — ${panelDate}`;
  const summary = `Today's picks across ${data.presetCount ?? "?"} presets · flagship ${data.flagshipPresetId ?? "?"}`;

  // 4. Send the email — this registers a notificationId we'll attach the snapshot to.
  // Use a placeholder share URL during HTML render; we'll replace after we know the notificationId.
  // (Cleaner approach would be a two-step API; here we send with a /share/__pending__ marker
  //  then re-render is unnecessary — the email's "View online" button hits /briefing/<id>
  //  which already redirects, and our explicit "Open interactive dashboard" links to /share/<id>.)
  let result: StocksDailyBriefingResult = { ok: false, message: "" };
  let snapshot: SharedCardSnapshot | null = null;

  if (params.skipEmail) {
    // No email: still register snapshot under a synthetic notification so /share works for testing.
    const { registerNotification } = await import("./reacts.js");
    const notificationId = registerNotification({ type: "stocks-daily", summary });
    const baseUrl = getEnsoUrl();
    const shareUrl = `${baseUrl}/share/${notificationId}`;

    snapshot = {
      appId: APP_ID, toolPrefix: app.spec.toolPrefix, primaryToolName,
      templateJSX: app.templateJSX, data,
      allowedActions: PUBLIC_ALLOWED_ACTIONS, refreshable: true,
      title: subject, ttlDays: SNAPSHOT_TTL_DAYS,
    };
    attachCardSnapshot(notificationId, snapshot);

    logAction({ ts: Date.now(), type: "action", category: "stocks-daily-briefing", message: `Snapshot-only run: ${shareUrl}` });
    return { ok: true, message: `Snapshot ready at ${shareUrl}`, notificationId, shareUrl, emailSent: false };
  }

  // Pre-allocate notificationId so we can bake the real /share/<id> URL into
  // the email body before sending (the email is the only delivery — no
  // post-send rewrite is possible).
  try {
    const baseUrl = getEnsoUrl();
    const notificationId = registerNotification(
      { type: "stocks-daily", summary },
      { isEmail: true },
    );
    const realShareUrl = `${baseUrl}/share/${notificationId}`;

    // Attach snapshot first so the link is live the moment the email lands.
    snapshot = {
      appId: APP_ID, toolPrefix: app.spec.toolPrefix, primaryToolName,
      templateJSX: app.templateJSX, data,
      allowedActions: PUBLIC_ALLOWED_ACTIONS, refreshable: true,
      title: subject, ttlDays: SNAPSHOT_TTL_DAYS,
    };
    attachCardSnapshot(notificationId, snapshot);

    // Email body is the picks summary; the prominent in-body "Open interactive
    // dashboard →" button is the action surface. Skip the generic Approve/Defer/Reply
    // footer (added by sendBriefingEmail) — picks-specific actions live on /share/<id>.
    const finalHtml = renderEmailHtml(data, realShareUrl);

    // Stash the final HTML so /briefing/<id> mirrors what was sent.
    storeBriefingHtml(notificationId, finalHtml, subject);

    const send = await sendHtmlEmail({
      to,
      subject,
      html: finalHtml,
      textFallback: renderTextFallback(data, realShareUrl),
    });

    if (!send.success) {
      return { ok: false, message: send.message };
    }

    result = {
      ok: true,
      message: `Briefing sent to ${to} — interactive dashboard at ${realShareUrl}`,
      notificationId,
      briefingUrl: `${baseUrl}/briefing/${notificationId}`,
      shareUrl: realShareUrl,
      emailSent: true,
    };

    logAction({ ts: Date.now(), type: "action", category: "stocks-daily-briefing", message: result.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("stocks-daily-briefing", `Briefing send failed: ${msg}`);
    return { ok: false, message: msg };
  }

  // 5. WeChat fanout (best-effort — never fails the whole pipeline)
  if (!params.skipWechat) {
    try {
      const { getFollowerOpenIds, sendTextMessage } = await import("./wechat.js");
      const followers = await getFollowerOpenIds().catch(() => [] as string[]);
      if (followers.length > 0 && result.shareUrl) {
        const text = renderWechatSummary(data, result.shareUrl);
        let sent = 0;
        for (const openId of followers) {
          try {
            const ok = await sendTextMessage(openId, text);
            if (ok) sent++;
          } catch { /* per-follower failures don't block */ }
        }
        result.wechatRecipients = sent;
      }
    } catch (err) {
      logError("stocks-daily-briefing", "WeChat fanout error (non-fatal)", err);
    }
  }

  return result;
}

// ── Tool Registration ──

export function createStocksDailyBriefingTools(): Array<import("./local-types.js").EnsoAgentTool> {
  return [
    {
      name: "enso_stocks_daily_briefing",
      label: "Stocks Daily Briefing",
      description:
        "Send today's FactorStrategies stock picks as a notification (email + WeChat + interactive landing page). " +
        "Pipeline: git pull FactorStrategies → run daily_routine.py to refresh holdings → render flagship-preset " +
        "summary → send notification with /share/<id> link to the full interactive dashboard. " +
        "Used by the daily-stocks scheduled task; can also be invoked on demand.",
      isPrimary: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          to: { type: "string", description: "Recipient email(s). Defaults to DEFAULT_RECIPIENT_EMAIL." },
          subject: { type: "string", description: "Override email subject. Defaults to 'FactorStrategies Daily — <date>'." },
          skipEmail: { type: "boolean", description: "If true, only build the snapshot + return the share URL. Useful for testing." },
          skipWechat: { type: "boolean", description: "If true, skip WeChat fanout to followers." },
          skipRefresh: { type: "boolean", description: "If true, skip the git-pull + daily_routine.py refresh — use whatever latest.json is already on disk. Useful for fast smoke tests." },
        },
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        const result = await runStocksDailyBriefing({
          to: typeof params.to === "string" ? params.to : undefined,
          subject: typeof params.subject === "string" ? params.subject : undefined,
          skipEmail: params.skipEmail === true,
          skipWechat: params.skipWechat === true,
          skipRefresh: params.skipRefresh === true,
        });
        return { content: [{ type: "text", text: JSON.stringify({
          tool: "enso_stocks_daily_briefing",
          ...result,
        }) }] };
      },
    },
  ];
}

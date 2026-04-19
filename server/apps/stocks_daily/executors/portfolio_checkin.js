// Portfolio check-in — runs `python portfolio_manager.py checkin <account>` against
// the live FactorStrategies portfolio. Reports current holdings, target holdings,
// and any rebalance the strategy thinks is needed.
//
// NOTE: The underlying script can submit orders. The trade password gates that
// behavior — without FACTORSTRATEGIES_TRADE_PASSWORD set, the script falls back
// to a dry-run-style report without trading.

var child_process = require("child_process");

var FS_BASE = "D:/Github/FactorStrategies";
var pythonPath = FS_BASE + "/.venv/Scripts/python.exe";
var scriptPath = FS_BASE + "/portfolio_manager.py";
var account = (params && typeof params.account === "string" && params.account.trim()) ? params.account.trim() : "KK_Live";
var dryRun = !!(params && params.dryRun);

var tradePassword = process.env.FACTORSTRATEGIES_TRADE_PASSWORD || "";

// Build args. With trade password → real check-in (may rebalance). Without → text report only.
var args = [scriptPath, "checkin", account];
if (tradePassword && !dryRun) args.push("--trade-password", tradePassword);

var startedAt = Date.now();
var stdout = "";
var stderr = "";
var exitCode = null;

try {
  var result = child_process.spawnSync(pythonPath, args, {
    cwd: FS_BASE,
    encoding: "utf-8",
    timeout: 180000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  stdout = result.stdout || "";
  stderr = result.stderr || "";
  exitCode = result.status;
  if (result.error) stderr += "\n[spawn error] " + result.error.message;
} catch (e) {
  stderr += "\n[exception] " + (e && e.message ? e.message : String(e));
  exitCode = -1;
}

var combined = stdout + (stderr ? "\n\n[stderr]\n" + stderr : "");
var success = exitCode === 0;
var durationMs = Date.now() - startedAt;

// Parse a few useful summary signals from the stdout for the UI.
var summary = {
  currentValue: null,
  totalReturnPct: null,
  rebalanceNeeded: null,
  swaps: []
};
var valMatch = stdout.match(/Current value:\s*\$([\d,.]+)\s*\(return\s*([+-]?[\d.]+)%\)/);
if (valMatch) {
  summary.currentValue = parseFloat(valMatch[1].replace(/,/g, ""));
  summary.totalReturnPct = parseFloat(valMatch[2]);
}
if (/REBALANCE NEEDED|swaps to execute|Adding:|Removing:/i.test(stdout)) summary.rebalanceNeeded = true;
else if (/No rebalance needed|already aligned|holdings match target/i.test(stdout)) summary.rebalanceNeeded = false;

var addLines = stdout.match(/(?:Adding|BUY|Adding stock):\s*[A-Z]{1,5}/g) || [];
var removeLines = stdout.match(/(?:Removing|SELL|Removing stock):\s*[A-Z]{1,5}/g) || [];
for (var i = 0; i < addLines.length; i++) summary.swaps.push({ action: "buy", ticker: addLines[i].split(/:\s*/).pop().trim() });
for (var j = 0; j < removeLines.length; j++) summary.swaps.push({ action: "sell", ticker: removeLines[j].split(/:\s*/).pop().trim() });

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_stocks_daily_portfolio_checkin",
  success: success,
  account: account,
  exitCode: exitCode,
  durationMs: durationMs,
  hasTradePassword: !!tradePassword,
  dryRun: dryRun || !tradePassword,
  summary: summary,
  output: combined.slice(-6000), // tail — full transcript truncated for UI
  outputLength: combined.length,
  message: success
    ? "Portfolio check-in completed for " + account + (summary.rebalanceNeeded === false ? " — no rebalance needed" : (summary.rebalanceNeeded === true ? " — rebalance executed/proposed" : ""))
    : "Portfolio check-in failed (exit code " + exitCode + ")"
}) }] };

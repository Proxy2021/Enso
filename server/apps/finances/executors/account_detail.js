// account_detail — drill into one financial-account, return its current
// holdings + recent statements + recent activity. Reads from the index +
// the underlying source file (FactorStrategies JSON for KK_Live-class
// accounts). Pure read.

var fs = require("fs");
var path = require("path");

var home = process.env.HOME || process.env.USERPROFILE || ".";
var INDEX_PATH = path.join(home, ".enso", "data", "finances", "accounts.json");

var requestedId = (params && typeof params.accountId === "string") ? params.accountId.trim() : "";
if (!requestedId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_account_detail",
    error: true,
    message: "accountId is required"
  }) }] };
}

if (!fs.existsSync(INDEX_PATH)) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_account_detail",
    error: true,
    message: "No accounts index. Run refresh first."
  }) }] };
}

var idx;
try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); }
catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_account_detail",
    error: true,
    message: "Failed to parse accounts index: " + e.message
  }) }] };
}

var account = (idx.accounts || []).find(function(a) { return a.accountId === requestedId; });
if (!account) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_account_detail",
    error: true,
    message: "Account not found: " + requestedId
  }) }] };
}

// Re-read the source file for fresh holdings + activity (don't trust cache)
var sourceData = null;
if (account.sourceFile && fs.existsSync(account.sourceFile)) {
  try { sourceData = JSON.parse(fs.readFileSync(account.sourceFile, "utf-8")); } catch (e) { /* ignore */ }
}

var holdings = [];
if (sourceData && sourceData.portfolio) {
  var pkeys = Object.keys(sourceData.portfolio);
  for (var pi = 0; pi < pkeys.length; pi++) {
    var t = pkeys[pi];
    var p = sourceData.portfolio[t] || {};
    holdings.push({
      ticker: t,
      shares: p.shares || p.qty || 0,
      buyPrice: p.buy_price || null,
      currentPrice: p.current_price || null,
      value: p.value || null,
      pnl: p.pnl || null,
      pnlPct: p.pnl_pct || null
    });
  }
  holdings.sort(function(a, b) { return (b.value || 0) - (a.value || 0); });
}

var rebalances = (sourceData && Array.isArray(sourceData.rebalancing_history)) ? sourceData.rebalancing_history : [];
var trades = (sourceData && Array.isArray(sourceData.trade_history)) ? sourceData.trade_history : [];

// Build statements list — for sourceFile-backed accounts (KK_Live), use rebalancing_history.
// For RM-sourced accounts, scan the synthesis directory for statement-<slug>-* pages.
var statements = [];
if (rebalances.length > 0) {
  for (var ri = rebalances.length - 1; ri >= Math.max(0, rebalances.length - 12); ri--) {
    var r = rebalances[ri];
    statements.push({
      statementId: "finances:financial-statement:" + account.slug + "-" + (r.date || ("entry-" + ri)),
      period: r.date || ("entry-" + ri),
      action: r.action || "rebalance",
      totalValue: r.total_value || null,
      cash: r.cash || null,
      plannedBoughtCount: Array.isArray(r.planned_bought) ? r.planned_bought.length : 0,
      plannedSoldCount: Array.isArray(r.planned_sold) ? r.planned_sold.length : 0,
      preset: (r.strategy_meta && r.strategy_meta.preset) || null
    });
  }
} else {
  // Fall back to scanning synthesis pages for this account's slug prefix.
  var synDir = path.join(home, ".enso", "wiki", "synthesis");
  var prefix = "statement-" + account.slug + "-";
  if (fs.existsSync(synDir)) {
    var pageFiles = fs.readdirSync(synDir).filter(function(f) { return f.indexOf(prefix) === 0 && /\.md$/.test(f); });
    for (var pf = 0; pf < pageFiles.length; pf++) {
      var fname = pageFiles[pf];
      var period = fname.slice(prefix.length).replace(/\.md$/, "");
      // Parse a few key fields from the markdown
      var bodyText = "";
      try { bodyText = fs.readFileSync(path.join(synDir, fname), "utf-8"); } catch (e) { /* skip */ }
      var closingMatch = bodyText.match(/\*\*Closing value\*\*:\s*([A-Z]{3})\s*([\d,.]+)/);
      var totalValue = null;
      if (closingMatch) {
        var n = parseFloat(closingMatch[2].replace(/,/g, ""));
        if (!isNaN(n)) totalValue = n;
      }
      statements.push({
        statementId: "finances:financial-statement:" + account.slug + "-" + period,
        period: period,
        action: "rm-statement",
        totalValue: totalValue,
        cash: null,
        plannedBoughtCount: 0,
        plannedSoldCount: 0,
        preset: null
      });
    }
    statements.sort(function(a, b) { return (a.period < b.period) ? 1 : -1; });
    statements = statements.slice(0, 12);
  }
}

// Recent activity (most recent 10 trades)
var recentActivity = [];
for (var ti = trades.length - 1; ti >= Math.max(0, trades.length - 10); ti--) {
  var tr = trades[ti];
  recentActivity.push({
    date: tr.date || tr.timestamp || null,
    action: tr.action || tr.side || "?",
    ticker: tr.ticker || tr.symbol || "?",
    shares: tr.shares || tr.qty || null,
    price: tr.price || null,
    value: tr.value || null
  });
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_finances_account_detail",
  accountId: account.accountId,
  slug: account.slug,
  displayName: account.displayName,
  institution: account.institution,
  accountType: account.accountType,
  baseCurrency: account.baseCurrency,
  currentValue: (sourceData && sourceData.current_capital) || account.currentValue,
  initialCapital: (sourceData && sourceData.initial_capital) || null,
  cash: (sourceData && sourceData.cash) || account.cash,
  lastRebalanceDate: (sourceData && sourceData.last_rebalance_date) || null,
  strategyType: (sourceData && sourceData.strategy_type) || null,
  holdings: holdings,
  statements: statements,
  recentActivity: recentActivity,
  lastUpdated: account.lastUpdated
}) }] };

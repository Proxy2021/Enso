// list_accounts — read the local accounts index plus all RM-statement sidecars,
// roll up: per-currency totals, per-account-type breakdown, consolidated top
// holdings across all accounts, and net-worth delta vs. the previous snapshot.
//
// Side effect: appends a snapshot to ~/.enso/data/finances/net_worth_history.jsonl
// so the dashboard + TL briefing can show a delta over time.
//
// All reads + writes stay under ~/.enso/. Repo never sees real figures.

var fs = require("fs");
var path = require("path");

var home = process.env.HOME || process.env.USERPROFILE || ".";
var FINANCES_DIR = path.join(home, ".enso", "data", "finances");
var INDEX_PATH = path.join(FINANCES_DIR, "accounts.json");
var STATEMENTS_DIR = path.join(FINANCES_DIR, "statements");
var HISTORY_PATH = path.join(FINANCES_DIR, "net_worth_history.jsonl");

if (!fs.existsSync(INDEX_PATH)) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_list_accounts",
    totalAccounts: 0,
    accounts: [],
    netWorth: { byCurrency: {}, total: 0, breakdown: [] },
    consolidatedHoldings: [],
    history: [],
    lastRefreshAt: null,
    message: "No accounts indexed yet. Run a refresh action to scan local sources."
  }) }] };
}

var idx;
try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); }
catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_list_accounts",
    error: true,
    message: "Failed to parse accounts index: " + e.message
  }) }] };
}

var accounts = (idx && Array.isArray(idx.accounts)) ? idx.accounts : [];

// ── Roll up per-currency + per-account-type ──
var totalsByCurrency = {};
var totalsByType = {};
for (var ai = 0; ai < accounts.length; ai++) {
  var a = accounts[ai];
  var c = a.baseCurrency || "USD";
  var t = a.accountType || "unknown";
  totalsByCurrency[c] = (totalsByCurrency[c] || 0) + (a.currentValue || 0);
  if (!totalsByType[t]) totalsByType[t] = { accountCount: 0, byCurrency: {} };
  totalsByType[t].accountCount++;
  totalsByType[t].byCurrency[c] = (totalsByType[t].byCurrency[c] || 0) + (a.currentValue || 0);
}

// ── Consolidated holdings across accounts ──
// For KK_Live-style accounts, read holdings from the source JSON.
// For RM-style accounts, read each statement sidecar's most-recent extracted holdings.
var holdingMap = {};
function addHolding(ticker, value, accountSlug, currency) {
  if (!ticker) return;
  var key = String(ticker).trim().toUpperCase();
  if (!key) return;
  if (!holdingMap[key]) holdingMap[key] = { ticker: key, totalValue: 0, accountCount: 0, accounts: [], currency: currency || "USD" };
  if (typeof value === "number" && !isNaN(value)) holdingMap[key].totalValue += value;
  if (holdingMap[key].accounts.indexOf(accountSlug) < 0) {
    holdingMap[key].accounts.push(accountSlug);
    holdingMap[key].accountCount = holdingMap[key].accounts.length;
  }
}

for (var ai2 = 0; ai2 < accounts.length; ai2++) {
  var acc = accounts[ai2];
  if (acc.sourceFile && fs.existsSync(acc.sourceFile)) {
    try {
      var src = JSON.parse(fs.readFileSync(acc.sourceFile, "utf-8"));
      var pf = src.portfolio || {};
      var pkeys = Object.keys(pf);
      for (var pi = 0; pi < pkeys.length; pi++) {
        var pp = pf[pkeys[pi]] || {};
        addHolding(pkeys[pi], pp.value, acc.slug, acc.baseCurrency);
      }
    } catch (e) { /* skip */ }
  } else {
    // RM account — find the most-recent sidecar for this account
    if (fs.existsSync(STATEMENTS_DIR)) {
      var sidecars = fs.readdirSync(STATEMENTS_DIR).filter(function(f) {
        return f.indexOf(acc.slug + "-") === 0 && /\.json$/.test(f);
      });
      sidecars.sort(); // YYYY-MM-DD lex sort works
      var latest = sidecars.length > 0 ? sidecars[sidecars.length - 1] : null;
      if (latest) {
        try {
          var sc = JSON.parse(fs.readFileSync(path.join(STATEMENTS_DIR, latest), "utf-8"));
          var ex = sc.extracted || {};
          if (Array.isArray(ex.holdings)) {
            for (var hi = 0; hi < ex.holdings.length; hi++) {
              var h = ex.holdings[hi];
              addHolding(h.ticker, h.value, acc.slug, ex.currency || acc.baseCurrency);
            }
          }
        } catch (e) { /* skip */ }
      }
    }
  }
}

var consolidatedHoldings = Object.keys(holdingMap).map(function(k) { return holdingMap[k]; });
consolidatedHoldings.sort(function(a, b) {
  if (b.accountCount !== a.accountCount) return b.accountCount - a.accountCount;
  return (b.totalValue || 0) - (a.totalValue || 0);
});

// ── Sort accounts: largest first ──
accounts.sort(function(x, y) {
  return (y.currentValue || 0) - (x.currentValue || 0);
});

// ── Compute net-worth delta vs previous snapshot ──
var primaryCurrency = "USD";
var maxCurrencyTotal = 0;
var ckeys = Object.keys(totalsByCurrency);
for (var ck = 0; ck < ckeys.length; ck++) {
  if (totalsByCurrency[ckeys[ck]] > maxCurrencyTotal) {
    maxCurrencyTotal = totalsByCurrency[ckeys[ck]];
    primaryCurrency = ckeys[ck];
  }
}
var primaryTotal = totalsByCurrency[primaryCurrency] || 0;

// Read history (last 30 entries) to compute deltas
var history = [];
if (fs.existsSync(HISTORY_PATH)) {
  try {
    var raw = fs.readFileSync(HISTORY_PATH, "utf-8");
    var lines = raw.trim().split(/\r?\n/).filter(Boolean);
    for (var li = 0; li < lines.length; li++) {
      try { history.push(JSON.parse(lines[li])); } catch (e) { /* skip */ }
    }
  } catch (e) { /* fresh */ }
}
history = history.slice(-30);

// Find the most recent snapshot from a DIFFERENT day for the delta comparison —
// today's snapshot would compare against itself and always read zero.
var todayKeyForCompare = new Date().toISOString().slice(0, 10);
var prev = null;
for (var pi = history.length - 1; pi >= 0; pi--) {
  if (history[pi].date !== todayKeyForCompare) { prev = history[pi]; break; }
}
var delta = null;
var deltaPct = null;
if (prev && typeof prev.byCurrency === "object" && prev.byCurrency[primaryCurrency] != null && primaryTotal > 0) {
  var prevVal = prev.byCurrency[primaryCurrency];
  delta = primaryTotal - prevVal;
  if (prevVal !== 0) deltaPct = Math.round((delta / prevVal) * 10000) / 100;
}

// Append a new snapshot (only if it's a meaningful change OR no entry today)
var todayKey = new Date().toISOString().slice(0, 10);
var lastSnapshotToday = history.length > 0 && history[history.length - 1].date === todayKey;
var sigChange = !prev || !lastSnapshotToday;
if (sigChange) {
  var snap = {
    date: todayKey,
    ts: new Date().toISOString(),
    accountCount: accounts.length,
    byCurrency: totalsByCurrency,
    primaryCurrency: primaryCurrency,
    primaryTotal: primaryTotal
  };
  try {
    if (!fs.existsSync(FINANCES_DIR)) fs.mkdirSync(FINANCES_DIR, { recursive: true });
    if (lastSnapshotToday) {
      // Replace the day's last entry (keep history compact)
      history[history.length - 1] = snap;
      fs.writeFileSync(HISTORY_PATH, history.map(function(h) { return JSON.stringify(h); }).join("\n") + "\n", "utf-8");
    } else {
      fs.appendFileSync(HISTORY_PATH, JSON.stringify(snap) + "\n", "utf-8");
      history.push(snap);
    }
  } catch (e) { /* non-fatal */ }
}

// Build a compact sparkline series (last 14 days, primary currency)
var sparkline = history.slice(-14).map(function(h) {
  return { date: h.date, value: (h.byCurrency && h.byCurrency[primaryCurrency]) || 0 };
});

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_finances_list_accounts",
  totalAccounts: accounts.length,
  totalValueByCurrency: totalsByCurrency,
  netWorth: {
    primaryCurrency: primaryCurrency,
    primaryTotal: primaryTotal,
    byCurrency: totalsByCurrency,
    delta: delta,
    deltaPct: deltaPct,
    deltaPeriod: prev ? prev.date : null,
    breakdown: Object.keys(totalsByType).map(function(t) {
      return {
        type: t,
        accountCount: totalsByType[t].accountCount,
        byCurrency: totalsByType[t].byCurrency,
        primaryValue: totalsByType[t].byCurrency[primaryCurrency] || 0
      };
    }).sort(function(a, b) { return b.primaryValue - a.primaryValue; })
  },
  consolidatedHoldings: consolidatedHoldings.slice(0, 12),
  sparkline: sparkline,
  lastRefreshAt: idx.lastRefreshAt || null,
  accounts: accounts.map(function(a) {
    return {
      accountId: a.accountId,
      slug: a.slug,
      displayName: a.displayName,
      institution: a.institution,
      accountType: a.accountType,
      baseCurrency: a.baseCurrency,
      currentValue: a.currentValue,
      cash: a.cash,
      holdingsCount: a.holdingsCount,
      statementCount: a.statementCount,
      lastUpdated: a.lastUpdated,
      sourceKind: a.sourceKind || "kk-live"
    };
  })
}) }] };

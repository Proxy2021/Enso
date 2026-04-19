// refresh_kk_live — read FactorStrategies' local accounts directory and write
// financial-account entity pages + per-rebalance financial-statement synthesis
// pages into the Cortex. Also maintains a local index at
// ~/.enso/data/finances/accounts.json for fast list_accounts lookups.
//
// All output stays under ~/.enso/ — never touches the repo.

var fs = require("fs");
var path = require("path");

var home = process.env.HOME || process.env.USERPROFILE || ".";
var DEFAULT_ACCOUNTS_DIR = "D:/Github/FactorStrategies/data/development/accounts";
var WIKI_DIR = path.join(home, ".enso", "wiki");
var ENTITIES_DIR = path.join(WIKI_DIR, "entities");
var SYNTHESIS_DIR = path.join(WIKI_DIR, "synthesis");
var FINANCES_DATA_DIR = path.join(home, ".enso", "data", "finances");
var INDEX_PATH = path.join(FINANCES_DATA_DIR, "accounts.json");

var accountsDir = (params && typeof params.accountsDir === "string" && params.accountsDir.trim())
  ? params.accountsDir.trim() : DEFAULT_ACCOUNTS_DIR;

if (!fs.existsSync(accountsDir)) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_refresh_kk_live",
    success: false,
    error: true,
    message: "Accounts directory not found: " + accountsDir
  }) }] };
}

[ENTITIES_DIR, SYNTHESIS_DIR, FINANCES_DATA_DIR].forEach(function(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function fmtMoney(v, currency) {
  if (v == null || isNaN(v)) return "—";
  var c = currency || "USD";
  return c + " " + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Discover accounts ──
var files = fs.readdirSync(accountsDir).filter(function(f) {
  return /\.json$/i.test(f) && !f.startsWith("_");
});

var accountsScanned = 0;
var statementsWritten = 0;
var indexEntries = [];

for (var fi = 0; fi < files.length; fi++) {
  var fpath = path.join(accountsDir, files[fi]);
  var raw;
  try { raw = JSON.parse(fs.readFileSync(fpath, "utf-8")); }
  catch (e) { continue; }

  var accountName = raw.account_name || files[fi].replace(/\.json$/i, "");
  var broker = raw.broker || "unknown";
  var currency = raw.currency || raw.base_currency || "USD";
  var slug = slugify(accountName);
  var accountId = "finances:financial-account:" + slug;
  var rebalances = Array.isArray(raw.rebalancing_history) ? raw.rebalancing_history : [];
  var trades = Array.isArray(raw.trade_history) ? raw.trade_history : [];

  // Current portfolio summary
  var portfolio = raw.portfolio || {};
  var holdings = [];
  var holdingsKeys = Object.keys(portfolio);
  for (var hi = 0; hi < holdingsKeys.length; hi++) {
    var t = holdingsKeys[hi];
    var p = portfolio[t] || {};
    holdings.push({
      ticker: t,
      shares: p.shares || p.qty || 0,
      buyPrice: p.buy_price || null,
      currentPrice: p.current_price || null,
      value: p.value || null
    });
  }

  // ── Entity page (one per account) ──
  var entityLines = [];
  entityLines.push("# " + accountName);
  entityLines.push("");
  entityLines.push("**" + (raw.strategy_type || "account") + "** at **" + broker + "**" + (currency ? " · " + currency : "") + ".");
  entityLines.push("");
  entityLines.push("## Snapshot");
  entityLines.push("- **Current value**: " + fmtMoney(raw.current_capital, currency));
  entityLines.push("- **Cash**: " + fmtMoney(raw.cash, currency));
  entityLines.push("- **Initial capital**: " + fmtMoney(raw.initial_capital, currency));
  if (raw.last_rebalance_date) entityLines.push("- **Last rebalance**: " + raw.last_rebalance_date);
  entityLines.push("- **Holdings**: " + holdings.length);
  entityLines.push("- **Trade history**: " + trades.length + " entries");
  entityLines.push("- **Rebalances**: " + rebalances.length);
  entityLines.push("");
  if (holdings.length > 0) {
    entityLines.push("## Current Holdings");
    for (var hh = 0; hh < holdings.length; hh++) {
      var h = holdings[hh];
      entityLines.push("- **[[" + h.ticker.toLowerCase() + "]]** · " + (h.shares || "?") + " shares" + (h.value ? " · " + fmtMoney(h.value, currency) : ""));
    }
    entityLines.push("");
  }
  entityLines.push("## Periodic Statements");
  if (rebalances.length === 0) {
    entityLines.push("_No statements yet._");
  } else {
    for (var ri = rebalances.length - 1; ri >= Math.max(0, rebalances.length - 12); ri--) {
      var rb = rebalances[ri];
      var sslug = slug + "-" + (rb.date || "unknown");
      entityLines.push("- [[statement-" + sslug + "|" + (rb.date || "?") + " — " + (rb.action || "rebalance") + "]]");
    }
  }
  entityLines.push("");
  entityLines.push("---");
  entityLines.push("EntityId: " + accountId);
  entityLines.push("Type: financial-account");
  entityLines.push("Source: finances");
  entityLines.push("Updated: " + new Date().toISOString());
  entityLines.push("");

  var entityPath = path.join(ENTITIES_DIR, "account-" + slug + ".md");
  fs.writeFileSync(entityPath, entityLines.join("\n"), "utf-8");
  accountsScanned++;

  // Register in Cortex index so search/list/graph find it
  await ctx.callTool("enso_wiki_register_page", {
    path: "entities/account-" + slug + ".md",
    title: accountName,
    summary: "Brokerage account at " + broker + " · " + holdings.length + " holdings · " + rebalances.length + " rebalances",
    tags: ["financial-account", "finances", "brokerage", broker],
    entityId: accountId,
    type: "financial-account",
    source: "finances"
  }).catch(function(e) { /* non-fatal */ });

  // ── Statement pages (one per rebalance entry) ──
  for (var rb_i = 0; rb_i < rebalances.length; rb_i++) {
    var r = rebalances[rb_i];
    var period = r.date || ("entry-" + rb_i);
    var statementSlug = slug + "-" + period;
    var statementId = "finances:financial-statement:" + statementSlug;
    var statementPath = path.join(SYNTHESIS_DIR, "statement-" + statementSlug + ".md");

    if (fs.existsSync(statementPath) && !params.force) continue;

    var sm = r.strategy_meta || {};
    var sLines = [];
    sLines.push("# " + accountName + " — " + period);
    sLines.push("");
    sLines.push("Periodic statement (`" + (r.action || "rebalance") + "`) for **[[account-" + slug + "|" + accountName + "]]**.");
    sLines.push("");
    sLines.push("## Snapshot");
    sLines.push("- **Date**: " + period);
    sLines.push("- **Action**: " + (r.action || "rebalance"));
    sLines.push("- **Total value**: " + fmtMoney(r.total_value, currency));
    sLines.push("- **Cash**: " + fmtMoney(r.cash, currency));
    if (sm.preset) sLines.push("- **Strategy preset**: `" + sm.preset + "`");
    sLines.push("");

    if (Array.isArray(r.planned_bought) && r.planned_bought.length > 0) {
      sLines.push("## Planned Buys");
      for (var pb = 0; pb < r.planned_bought.length; pb++) {
        sLines.push("- [[" + String(r.planned_bought[pb]).toLowerCase() + "]]");
      }
      sLines.push("");
    }
    if (Array.isArray(r.planned_sold) && r.planned_sold.length > 0) {
      sLines.push("## Planned Sells");
      for (var ps = 0; ps < r.planned_sold.length; ps++) {
        sLines.push("- [[" + String(r.planned_sold[ps]).toLowerCase() + "]]");
      }
      sLines.push("");
    }
    if (Array.isArray(r.confirmed_bought) && r.confirmed_bought.length > 0) {
      sLines.push("## Confirmed Buys");
      for (var cb = 0; cb < r.confirmed_bought.length; cb++) {
        sLines.push("- [[" + String(r.confirmed_bought[cb]).toLowerCase() + "]]");
      }
      sLines.push("");
    }
    if (sm.holdings && Array.isArray(sm.holdings) && sm.holdings.length > 0) {
      sLines.push("## Target Holdings");
      var weights = sm.weights || {};
      for (var th = 0; th < sm.holdings.length; th++) {
        var tk = sm.holdings[th];
        var w = weights[tk];
        sLines.push("- [[" + String(tk).toLowerCase() + "]]" + (w ? " · " + Math.round(w * 1000) / 10 + "%" : ""));
      }
      sLines.push("");
    }
    sLines.push("---");
    sLines.push("EntityId: " + statementId);
    sLines.push("Type: financial-statement");
    sLines.push("Source: finances");
    sLines.push("AccountId: " + accountId);
    sLines.push("Period: " + period);
    sLines.push("Updated: " + new Date().toISOString());
    sLines.push("");

    fs.writeFileSync(statementPath, sLines.join("\n"), "utf-8");
    statementsWritten++;

    await ctx.callTool("enso_wiki_register_page", {
      path: "synthesis/statement-" + statementSlug + ".md",
      title: accountName + " — " + period,
      summary: (r.action || "rebalance") + " statement for " + accountName + " on " + period,
      tags: ["financial-statement", "finances", "statement"],
      entityId: statementId,
      type: "financial-statement",
      source: "finances"
    }).catch(function(e) { /* non-fatal */ });
  }

  indexEntries.push({
    accountId: accountId,
    slug: slug,
    displayName: accountName,
    institution: broker,
    accountType: (raw.strategy_type ? "brokerage" : "unknown"),
    baseCurrency: currency,
    currentValue: raw.current_capital || 0,
    cash: raw.cash || 0,
    holdingsCount: holdings.length,
    statementCount: rebalances.length,
    lastUpdated: new Date().toISOString(),
    cortexPath: "entities/account-" + slug + ".md",
    sourceFile: fpath
  });
}

// ── Update local accounts index ──
var existingIndex = { accounts: [], lastRefreshAt: null };
if (fs.existsSync(INDEX_PATH)) {
  try { existingIndex = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); } catch (e) { /* fresh */ }
}

// Merge: replace any account from this scan, keep accounts from other sources
var merged = (existingIndex.accounts || []).filter(function(a) {
  return !indexEntries.some(function(n) { return n.accountId === a.accountId; });
});
for (var ie = 0; ie < indexEntries.length; ie++) merged.push(indexEntries[ie]);

var newIndex = {
  accounts: merged,
  lastRefreshAt: new Date().toISOString()
};
fs.writeFileSync(INDEX_PATH, JSON.stringify(newIndex, null, 2), "utf-8");

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_finances_refresh_kk_live",
  success: true,
  accountsScanned: accountsScanned,
  statementsWritten: statementsWritten,
  totalAccountsInIndex: merged.length,
  indexPath: INDEX_PATH,
  message: "Refreshed " + accountsScanned + " account(s), wrote " + statementsWritten + " statement page(s) to ~/.enso/wiki/"
}) }] };

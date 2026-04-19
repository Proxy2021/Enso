// statement_detail — render one periodic statement page from its accountId
// + period. Reads from the source file (FactorStrategies JSON) so the data
// is always current.

var fs = require("fs");
var path = require("path");

var home = process.env.HOME || process.env.USERPROFILE || ".";
var INDEX_PATH = path.join(home, ".enso", "data", "finances", "accounts.json");

var statementId = (params && typeof params.statementId === "string") ? params.statementId.trim() : "";
if (!statementId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    error: true,
    message: "statementId is required"
  }) }] };
}

// Parse: finances:financial-statement:<accountSlug>-<period>
var m = statementId.match(/^finances:financial-statement:(.+)-(\d{4}-\d{2}-\d{2}|entry-\d+)$/);
if (!m) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    error: true,
    message: "Malformed statementId: " + statementId
  }) }] };
}
var accountSlug = m[1];
var period = m[2];

if (!fs.existsSync(INDEX_PATH)) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    error: true,
    message: "No accounts index. Run refresh first."
  }) }] };
}

var idx;
try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); }
catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    error: true,
    message: "Failed to parse index: " + e.message
  }) }] };
}

var account = (idx.accounts || []).find(function(a) { return a.slug === accountSlug; });
if (!account) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    error: true,
    message: "Account not found for slug: " + accountSlug
  }) }] };
}

// RM-sourced accounts have a sidecar JSON instead of a sourceFile —
// served from ~/.enso/data/finances/statements/<accountSlug>-<period>.json
if (!account.sourceFile || !fs.existsSync(account.sourceFile)) {
  var sidecarPath = path.join(home, ".enso", "data", "finances", "statements", accountSlug + "-" + period + ".json");
  if (!fs.existsSync(sidecarPath)) {
    return { content: [{ type: "text", text: JSON.stringify({
      tool: "enso_finances_statement_detail",
      error: true,
      message: "No statement data found (no source file, no sidecar)."
    }) }] };
  }
  var sidecar;
  try { sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf-8")); }
  catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({
      tool: "enso_finances_statement_detail",
      error: true,
      message: "Failed to parse sidecar: " + e.message
    }) }] };
  }
  var ex = sidecar.extracted || {};
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    statementId: statementId,
    accountId: account.accountId,
    accountSlug: accountSlug,
    accountName: sidecar.accountName || account.displayName,
    institution: sidecar.institution || account.institution,
    baseCurrency: sidecar.baseCurrency || ex.currency || account.baseCurrency,
    period: period,
    action: "rm-statement",
    receivedAt: sidecar.receivedAt,
    subject: sidecar.subject,
    sourceKind: "rm-emails",
    openingValue: ex.openingValue != null ? ex.openingValue : null,
    closingValue: ex.closingValue != null ? ex.closingValue : null,
    netChange: ex.netChange != null ? ex.netChange : null,
    netChangePct: ex.netChangePct != null ? ex.netChangePct : null,
    cash: null,
    fees: ex.fees != null ? ex.fees : null,
    dividends: ex.dividends != null ? ex.dividends : null,
    holdings: Array.isArray(ex.holdings) ? ex.holdings : [],
    targetHoldings: [],
    transactions: Array.isArray(ex.transactions) ? ex.transactions : [],
    rmCommentary: ex.rmCommentary || "",
    preset: null,
    presetMeta: { factors: [], nQualify: null, nTarget: null, nFilled: null, cashFraction: 0 },
    plannedBought: [], plannedSold: [], confirmedBought: [], confirmedSold: [], held: []
  }) }] };
}

var src;
try { src = JSON.parse(fs.readFileSync(account.sourceFile, "utf-8")); }
catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    error: true,
    message: "Failed to read source: " + e.message
  }) }] };
}

var rebalances = Array.isArray(src.rebalancing_history) ? src.rebalancing_history : [];
var rb = null;
for (var ri = 0; ri < rebalances.length; ri++) {
  if (rebalances[ri].date === period) { rb = rebalances[ri]; break; }
}
if (!rb) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_statement_detail",
    error: true,
    message: "No statement found for period: " + period
  }) }] };
}

var sm = rb.strategy_meta || {};
var weights = sm.weights || {};
var targetHoldings = (Array.isArray(sm.holdings) ? sm.holdings : []).map(function(t) {
  var w = weights[t];
  return { ticker: t, weight: w != null ? w : null, weightPct: w != null ? Math.round(w * 1000) / 10 : null };
});

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_finances_statement_detail",
  statementId: statementId,
  accountId: account.accountId,
  accountSlug: accountSlug,
  accountName: account.displayName,
  institution: account.institution,
  baseCurrency: account.baseCurrency,
  period: period,
  action: rb.action || "rebalance",
  openingValue: null,
  closingValue: rb.total_value || null,
  cash: rb.cash || null,
  holdings: rb.holdings || [],
  targetHoldings: targetHoldings,
  preset: sm.preset || null,
  presetMeta: {
    factors: (sm.meta && sm.meta.factors) || [],
    nQualify: sm.n_qualify || null,
    nTarget: sm.n_target || null,
    nFilled: sm.n_filled || null,
    cashFraction: sm.cash_fraction || 0
  },
  plannedBought: rb.planned_bought || [],
  plannedSold: rb.planned_sold || [],
  confirmedBought: rb.confirmed_bought || [],
  confirmedSold: rb.confirmed_sold || [],
  held: rb.held || []
}) }] };

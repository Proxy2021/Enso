// Daily Stock Picks — primary loader.
// Reads FactorStrategies' latest.json plus per-ticker overview JSONs to give
// the dashboard a list of picks (per chosen preset) with concise descriptions
// and a "why chosen" rationale.

var fs = require("fs");
var path = require("path");

var FS_BASE = "D:/Github/FactorStrategies";
var holdingsPath = FS_BASE + "/data/development/daily_holdings/latest.json";
var financialsDir = FS_BASE + "/data/development/financials";
var watchlistPath = (process.env.HOME || process.env.USERPROFILE || "~") + "/.enso/data/factor-strategies/watchlist.json";

// Static preset metadata — keeps the template purely presentational.
var PRESET_META = {
  "M9_4f_consensus":           { label: "M9 · 4-factor consensus (top 10)", theme: "Multi-factor balanced", factorIds: ["F1","F2","F4","F7"], blend: "Value × Quality × Short Reversal + Quality-Growth + Momentum + Defensive" },
  "M11_6f_consensus":          { label: "M11 · 6-factor consensus (top 10)", theme: "Wide-blend balanced", factorIds: ["F1","F2","F4","F5","F7","F8"], blend: "M9 + Book Growth × Quality + Asset Efficiency × Quality" },
  "M19_voltgt_QQQ_v2":         { label: "M19 · QQQ vol-targeted", theme: "Index + cash overlay", factorIds: [], blend: "Single-asset (QQQ) with volatility-target sizing — cash buffer when realized vol exceeds budget" },
  "M21_trend_QQQ_cash":        { label: "M21 · QQQ trend / cash", theme: "Trend-following", factorIds: [], blend: "QQQ when price > moving average, else cash" },
  "M22_F13F14_consensus":      { label: "M22 · F13+F14 consensus (top 5)", theme: "Conditional defensive", factorIds: ["F13","F14"], blend: "Low-beta × efficiency + Contrarian EPS" },
  "M23_4f_TTM_top10":          { label: "M23 · 4-factor TTM (top 10)", theme: "TTM-blend balanced", factorIds: ["F1","F2","F4","F7"], blend: "M9 blend rebuilt on trailing-12-month signals" },
  "M23_4f_top5":               { label: "M23 · 4-factor (top 5)", theme: "Concentrated balanced", factorIds: ["F1","F2","F4","F7"], blend: "M9 blend, concentrated to highest-conviction 5 names" },
  "M24_5f_consensus":          { label: "M24 · 5-factor consensus (top 10)", theme: "Flagship multi-factor", factorIds: ["F1","F2","F4","F5","F7"], blend: "Value × Quality × Reversal + Quality-Growth + Momentum + Book-Growth + Defensive — flagship blend" },
  "M25_F2F13F20F22_consensus": { label: "M25 · 4-factor consensus (top 5)", theme: "Conditional + GARP", factorIds: ["F2","F13","F20","F22"], blend: "Quality-Growth + Low-beta×efficiency + GARP + Deep-value" },
  "M26_F1F13F16F20F22_consensus": { label: "M26 · 5-factor consensus (top 5)", theme: "Wide conditional", factorIds: ["F1","F13","F16","F20","F22"], blend: "Value-Quality-Reversal + Low-beta×efficiency + GARP variant + GARP + Deep-value" },
  "M27_F16F17F20F21_consensus":   { label: "M27 · 4-factor consensus (top 5)", theme: "Value + GARP cluster", factorIds: ["F16","F17","F20","F21"], blend: "GARP variant + Deep-value + GARP + Value-momentum" }
};

// "Latest" = highest M-number in the holdings file. Treated as the flagship
// (default selection) so newly-shipped presets automatically take over without
// any code change here.
function presetSortKey(id) {
  var m = id.match(/^M(\d+)/i);
  return m ? parseInt(m[1], 10) : -1;
}
function findLatestPreset(ids) {
  var best = null;
  var bestKey = -1;
  for (var i = 0; i < ids.length; i++) {
    var k = presetSortKey(ids[i]);
    if (k > bestKey) { bestKey = k; best = ids[i]; }
  }
  return best || (ids.length > 0 ? ids[0] : null);
}

function readJsonDirect(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) { return null; }
}

function loadOverview(ticker) {
  return readJsonDirect(path.join(financialsDir, ticker + "_overview.json"));
}

function shortDescription(text) {
  if (!text || typeof text !== "string") return "";
  // First 1-2 sentences (~180 chars max) for the card
  var trimmed = text.trim();
  var match = trimmed.match(/^[^.!?]*[.!?](?:\s+[^.!?]*[.!?])?/);
  var snippet = (match ? match[0] : trimmed).trim();
  if (snippet.length > 180) snippet = snippet.slice(0, 177).replace(/\s+\S*$/, "") + "…";
  return snippet;
}

var holdings = readJsonDirect(holdingsPath);
if (!holdings || !holdings.presets) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_stocks_daily_today",
    error: true,
    message: "Could not read daily holdings — expected " + holdingsPath + ". Run `python daily_picks.py --no-refresh` in the FactorStrategies project to generate it.",
    panelDate: null,
    presets: []
  }) }] };
}

var watchlistData = readJsonDirect(watchlistPath);
var watchlist = (watchlistData && Array.isArray(watchlistData.tickers)) ? watchlistData.tickers : [];
var watchSet = {};
for (var wi = 0; wi < watchlist.length; wi++) watchSet[watchlist[wi]] = true;

// Compute ticker → set of preset IDs containing it (for "Why chosen" reasoning).
var tickerPresetIndex = {};
var presetIds = Object.keys(holdings.presets);
for (var ai = 0; ai < presetIds.length; ai++) {
  var pid = presetIds[ai];
  var pa = holdings.presets[pid];
  if (!pa || !Array.isArray(pa.holdings)) continue;
  for (var ah = 0; ah < pa.holdings.length; ah++) {
    var tk = pa.holdings[ah];
    if (!tickerPresetIndex[tk]) tickerPresetIndex[tk] = [];
    tickerPresetIndex[tk].push(pid);
  }
}

var FLAGSHIP = findLatestPreset(presetIds);
var requestedPreset = (params && typeof params.preset === "string" && params.preset.trim())
  ? params.preset.trim() : FLAGSHIP;

// Build presets list (all of them — for the switcher chips), with full enrichment
// only for the chosen preset (overview lookups are cheap but unnecessary for non-active).
var presetList = [];
for (var pi = 0; pi < presetIds.length; pi++) {
  var id = presetIds[pi];
  var p = holdings.presets[id] || {};
  var meta = PRESET_META[id] || { label: id, theme: "Custom", factorIds: [], blend: "Custom blend — see preset id for composition" };
  var rawWeights = p.weights || {};
  var rawHoldings = Array.isArray(p.holdings) ? p.holdings : [];
  var enriched = id === requestedPreset;

  var holdingsOut = [];
  for (var hi = 0; hi < rawHoldings.length; hi++) {
    var t = rawHoldings[hi];
    var w = (typeof rawWeights[t] === "number") ? rawWeights[t] : 0;
    var ov = enriched ? loadOverview(t) : null;
    var presetsContaining = tickerPresetIndex[t] || [];
    var otherPresets = presetsContaining.filter(function(x) { return x !== id; });

    holdingsOut.push({
      ticker: t,
      weight: w,
      weightPct: Math.round(w * 1000) / 10,
      rank: hi + 1,
      watching: !!watchSet[t],
      // Enrichment (only populated for the active preset)
      companyName: ov ? (ov.Name || "") : "",
      sector: ov ? (ov.Sector || "") : "",
      industry: ov ? (ov.Industry || "") : "",
      description: ov ? shortDescription(ov.Description || "") : "",
      hasDetail: !!ov,
      // "Why chosen" inputs
      presetCount: presetsContaining.length,
      otherPresetIds: otherPresets,
      factorIds: meta.factorIds.slice(),
      whyChosen: buildWhyChosen(meta, presetsContaining.length)
    });
  }

  presetList.push({
    id: id,
    label: meta.label,
    theme: meta.theme,
    factorBlend: meta.blend,
    factorIds: meta.factorIds,
    holdings: holdingsOut,
    cashFraction: typeof p.cash_fraction === "number" ? p.cash_fraction : 0,
    cashPct: typeof p.cash_fraction === "number" ? Math.round(p.cash_fraction * 1000) / 10 : 0,
    nQualify: p.n_qualify || 0,
    nTarget: p.n_target || 0,
    nFilled: p.n_filled || 0,
    fillRatio: (p.n_target > 0) ? (p.n_filled / p.n_target) : 1,
    isFlagship: id === FLAGSHIP,
    isActive: id === requestedPreset
  });
}

function buildWhyChosen(presetMeta, presetCount) {
  var parts = [];
  if (presetMeta.factorIds && presetMeta.factorIds.length > 0) {
    parts.push(presetMeta.factorIds.join("/") + " factors voted it in (" + presetMeta.theme.toLowerCase() + ")");
  } else {
    parts.push(presetMeta.theme || "Single-asset preset");
  }
  if (presetCount >= 3) parts.push("high consensus — also in " + (presetCount - 1) + " other presets");
  else if (presetCount === 2) parts.push("also in 1 other preset");
  return parts.join(" · ");
}

// Sort by M-number descending — latest preset first (so the default selection
// sits at the top of the dropdown). Falls back to id-localeCompare for non-numeric.
presetList.sort(function(a, b) {
  var ka = presetSortKey(a.id);
  var kb = presetSortKey(b.id);
  if (ka !== kb) return kb - ka;
  return a.id.localeCompare(b.id);
});

var active = null;
for (var ki = 0; ki < presetList.length; ki++) { if (presetList[ki].id === requestedPreset) { active = presetList[ki]; break; } }
if (!active && presetList.length > 0) active = presetList[0];

var result = {
  tool: "enso_stocks_daily_today",
  panelDate: holdings.panel_date || null,
  generatedAt: holdings.generated_at || null,
  panelFirstDate: holdings.panel_first_date || null,
  universeSize: holdings.panel_n_tickers || 0,
  presetCount: presetList.length,
  flagshipPresetId: FLAGSHIP,
  activePresetId: active ? active.id : null,
  watchlist: watchlist,
  watchlistSize: watchlist.length,
  presets: presetList,
  activePreset: active
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

var featuresInput = (params.features || "").trim();
var model = (params.model || "").trim() || "M6";
var topN = params.topN || 20;
var features = [];

if (featuresInput) {
  try { features = JSON.parse(featuresInput); } catch(e) { features = []; }
}

// Try stored state
if (!features || features.length === 0) {
  try {
    var stored = await ctx.store.get("feature_importance_" + model);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      features = stored;
    }
  } catch(e) {}
}

// Default sample data
if (!features || features.length === 0) {
  features = [
    { rank: 1, name: "book_to_market", importance: 0.087, category: "value", stability: 0.92, recommendation: "keep" },
    { rank: 2, name: "earnings_yield", importance: 0.076, category: "value", stability: 0.88, recommendation: "keep" },
    { rank: 3, name: "rsi_14d", importance: 0.065, category: "momentum", stability: 0.45, recommendation: "cut" },
    { rank: 4, name: "roe_ttm", importance: 0.061, category: "quality", stability: 0.85, recommendation: "keep" },
    { rank: 5, name: "debt_to_equity", importance: 0.058, category: "quality", stability: 0.81, recommendation: "keep" },
    { rank: 6, name: "vol_20d", importance: 0.054, category: "volatility", stability: 0.72, recommendation: "keep" },
    { rank: 7, name: "momentum_12m", importance: 0.051, category: "momentum", stability: 0.38, recommendation: "cut" },
    { rank: 8, name: "pe_ratio", importance: 0.048, category: "value", stability: 0.90, recommendation: "keep" },
    { rank: 9, name: "free_cash_flow_yield", importance: 0.045, category: "value", stability: 0.87, recommendation: "keep" },
    { rank: 10, name: "revenue_growth_yoy", importance: 0.042, category: "growth", stability: 0.68, recommendation: "keep" },
    { rank: 11, name: "beta_60d", importance: 0.039, category: "volatility", stability: 0.75, recommendation: "keep" },
    { rank: 12, name: "short_interest_ratio", importance: 0.036, category: "sentiment", stability: 0.32, recommendation: "cut" },
    { rank: 13, name: "macd_signal", importance: 0.034, category: "momentum", stability: 0.41, recommendation: "cut" },
    { rank: 14, name: "current_ratio", importance: 0.031, category: "quality", stability: 0.79, recommendation: "keep" },
    { rank: 15, name: "dividend_yield", importance: 0.029, category: "value", stability: 0.91, recommendation: "keep" },
    { rank: 16, name: "vol_ratio_5_20", importance: 0.027, category: "volatility", stability: 0.55, recommendation: "review" },
    { rank: 17, name: "eps_surprise_pct", importance: 0.025, category: "sentiment", stability: 0.48, recommendation: "review" },
    { rank: 18, name: "asset_turnover", importance: 0.023, category: "quality", stability: 0.82, recommendation: "keep" },
    { rank: 19, name: "price_to_sales", importance: 0.021, category: "value", stability: 0.86, recommendation: "keep" },
    { rank: 20, name: "adv_20d", importance: 0.019, category: "liquidity", stability: 0.70, recommendation: "keep" }
  ];
}

// Trim to topN
features = features.slice(0, topN);

// Ensure ranks are assigned
for (var i = 0; i < features.length; i++) {
  if (!features[i].rank) features[i].rank = i + 1;
}

// Compute category breakdown
var catMap = {};
for (var j = 0; j < features.length; j++) {
  var f = features[j];
  var cat = f.category || "unknown";
  if (!catMap[cat]) {
    catMap[cat] = { category: cat, count: 0, totalImportance: 0, totalStability: 0 };
  }
  catMap[cat].count++;
  catMap[cat].totalImportance += (f.importance || 0);
  catMap[cat].totalStability += (f.stability || 0);
}

var categoryBreakdown = [];
var catKeys = Object.keys(catMap);
for (var k = 0; k < catKeys.length; k++) {
  var c = catMap[catKeys[k]];
  categoryBreakdown.push({
    category: c.category,
    count: c.count,
    avgImportance: Math.round((c.totalImportance / c.count) * 1000) / 1000,
    avgStability: Math.round((c.totalStability / c.count) * 100) / 100
  });
}
categoryBreakdown.sort(function(a, b) { return b.avgImportance - a.avgImportance; });

// Compute summary
var keepCount = 0;
var cutCount = 0;
var reviewCount = 0;
var unstable = [];
for (var m = 0; m < features.length; m++) {
  var rec = features[m].recommendation || "keep";
  if (rec === "keep") keepCount++;
  else if (rec === "cut") cutCount++;
  else reviewCount++;
  if ((features[m].stability || 0) < 0.5) unstable.push(features[m].name);
}

// Persist
try {
  await ctx.store.set("feature_importance_" + model, features);
} catch(e) {}

var result = {
  tool: "enso_alpharank_validation_features",
  model: model,
  topN: topN,
  features: features,
  categoryBreakdown: categoryBreakdown,
  summary: {
    keepCount: keepCount,
    cutCount: cutCount,
    reviewCount: reviewCount,
    dominantCategory: categoryBreakdown.length > 0 ? categoryBreakdown[0].category : "unknown",
    unstableFeatures: unstable
  }
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

var configInput = (params.configurations || "").trim();
var configurations = [];

if (configInput) {
  try { configurations = JSON.parse(configInput); } catch(e) { configurations = []; }
}

// Try stored configurations
if (!configurations || configurations.length === 0) {
  try {
    var stored = await ctx.store.get("model_configurations");
    if (stored && Array.isArray(stored) && stored.length > 0) {
      configurations = stored;
    }
  } catch(e) {}
}

// Default sample data
if (!configurations || configurations.length === 0) {
  configurations = [
    {
      name: "Baseline (158 features)", version: "v1.0", date: "2026-03-15",
      testIC: 0.013, icir: 0.31, pbo: 0.72, sharpe: 0.24,
      annualReturn: -0.0264, maxDrawdown: -0.187,
      featureCount: 158, turnover: 2.4, trainTestGap: 6.31
    },
    {
      name: "Pruned (45 features)", version: "v1.1", date: "2026-04-01",
      testIC: 0.028, icir: 0.52, pbo: 0.48, sharpe: 0.47,
      annualReturn: 0.041, maxDrawdown: -0.132,
      featureCount: 45, turnover: 1.6, trainTestGap: 2.85
    },
    {
      name: "Pruned + CPCV (45 features)", version: "v1.2", date: "2026-04-10",
      testIC: 0.035, icir: 0.58, pbo: 0.38, sharpe: 0.62,
      annualReturn: 0.072, maxDrawdown: -0.108,
      featureCount: 45, turnover: 1.2, trainTestGap: 1.94
    }
  ];
}

// Compute deltas (compare all against first as baseline)
var baseline = configurations[0];
var deltas = [];

var metricDefs = [
  { key: "testIC", label: "Test IC", higherBetter: true, format: "decimal" },
  { key: "icir", label: "ICIR", higherBetter: true, format: "decimal" },
  { key: "pbo", label: "PBO", higherBetter: false, format: "decimal" },
  { key: "sharpe", label: "Sharpe", higherBetter: true, format: "decimal" },
  { key: "annualReturn", label: "Annual Return", higherBetter: true, format: "percent" },
  { key: "maxDrawdown", label: "Max Drawdown", higherBetter: false, format: "percent" },
  { key: "trainTestGap", label: "Train-Test Gap", higherBetter: false, format: "ratio" }
];

for (var i = 0; i < metricDefs.length; i++) {
  var md = metricDefs[i];
  var baseVal = baseline[md.key];
  if (baseVal === undefined || baseVal === null) continue;

  // Find best value
  var bestVal = baseVal;
  var bestName = baseline.name;
  for (var j = 1; j < configurations.length; j++) {
    var val = configurations[j][md.key];
    if (val === undefined || val === null) continue;
    var isBetter = md.higherBetter ? (val > bestVal) : (val < bestVal);
    if (isBetter) {
      bestVal = val;
      bestName = configurations[j].name;
    }
  }

  // Compute delta string
  var deltaStr = "";
  if (baseVal !== 0) {
    if (md.format === "percent") {
      var pp = (bestVal - baseVal) * 100;
      deltaStr = (pp >= 0 ? "+" : "") + pp.toFixed(1) + "pp";
    } else {
      var pctChange = ((bestVal - baseVal) / Math.abs(baseVal)) * 100;
      deltaStr = (pctChange >= 0 ? "+" : "") + Math.round(pctChange) + "%";
    }
  }

  deltas.push({
    metric: md.label,
    baseline: baseVal,
    best: bestVal,
    delta: deltaStr,
    winner: bestName
  });
}

// Determine recommendation
var bestOverall = configurations[0];
var bestScore = 0;
for (var k = 0; k < configurations.length; k++) {
  var cfg = configurations[k];
  var score = 0;
  if (cfg.testIC >= 0.03) score += 25;
  if (cfg.icir >= 0.5) score += 25;
  if (cfg.pbo < 0.5) score += 25;
  if (cfg.sharpe >= 0.5) score += 25;
  cfg._score = score;
  if (score > bestScore) {
    bestScore = score;
    bestOverall = cfg;
  }
}

var recommendation = bestOverall.name + " (" + bestOverall.version + ") is the strongest configuration";
if (bestScore === 100) {
  recommendation += " — it passes all 4 validation gates";
} else {
  recommendation += " — it passes " + (bestScore / 25) + " of 4 validation gates";
}

if (configurations.length >= 2) {
  var gapReduction = baseline.trainTestGap > 0 && bestOverall.trainTestGap > 0
    ? Math.round((1 - bestOverall.trainTestGap / baseline.trainTestGap) * 100)
    : 0;
  if (gapReduction > 0) {
    recommendation += " and reduces overfitting by " + gapReduction + "%";
  }
}

// Persist
try {
  await ctx.store.set("model_configurations", configurations);
} catch(e) {}

var result = {
  tool: "enso_alpharank_validation_compare",
  configurations: configurations,
  deltas: deltas,
  recommendation: recommendation
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

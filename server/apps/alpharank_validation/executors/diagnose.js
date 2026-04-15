var diagnosticsInput = (params.diagnostics || "").trim();
var model = (params.model || "").trim() || "M1";
var diagnostics = null;

if (diagnosticsInput) {
  try { diagnostics = JSON.parse(diagnosticsInput); } catch(e) { diagnostics = null; }
}

// Try stored state
if (!diagnostics) {
  try {
    var stored = await ctx.store.get("diagnostics_" + model);
    if (stored) diagnostics = stored;
  } catch(e) {}
}

// Default sample data
if (!diagnostics) {
  diagnostics = {
    trainTestComparison: {
      trainIC: 0.082, testIC: 0.013, gap: 6.31,
      trainSharpe: 1.85, testSharpe: 0.24,
      trainReturn: 0.182, testReturn: -0.0264
    },
    icDecayCurve: [
      { period: "2003-2006", ic: 0.042 },
      { period: "2006-2009", ic: 0.028 },
      { period: "2009-2012", ic: 0.019 },
      { period: "2012-2015", ic: 0.011 },
      { period: "2015-2018", ic: 0.008 },
      { period: "2018-2021", ic: 0.005 },
      { period: "2021-2024", ic: 0.003 }
    ],
    rollingIC: [
      { date: "2020-01", ic: 0.021, upper: 0.035, lower: 0.007 },
      { date: "2020-07", ic: 0.018, upper: 0.032, lower: 0.004 },
      { date: "2021-01", ic: 0.015, upper: 0.029, lower: 0.001 },
      { date: "2021-07", ic: 0.012, upper: 0.026, lower: -0.002 },
      { date: "2022-01", ic: 0.009, upper: 0.023, lower: -0.005 },
      { date: "2022-07", ic: 0.011, upper: 0.025, lower: -0.003 },
      { date: "2023-01", ic: 0.008, upper: 0.022, lower: -0.006 },
      { date: "2023-07", ic: 0.010, upper: 0.024, lower: -0.004 },
      { date: "2024-01", ic: 0.006, upper: 0.020, lower: -0.008 },
      { date: "2024-07", ic: 0.007, upper: 0.021, lower: -0.007 }
    ],
    degreesOfFreedom: {
      numFeatures: 158, numTrials: 48, effectiveTrials: 12,
      dataPoints: 5280, ratio: 0.009
    }
  };
}

// Generate recommendations based on the data
var recommendations = [];
var ttc = diagnostics.trainTestComparison || {};

// Check train-test gap
var gap = ttc.gap || (ttc.trainIC && ttc.testIC ? ttc.trainIC / ttc.testIC : 0);
if (gap > 5) {
  recommendations.push({
    severity: "critical",
    issue: Math.round(gap) + "x train-test IC gap indicates severe overfitting",
    action: "Apply CPCV with 10 folds and 2 test groups instead of walk-forward"
  });
} else if (gap > 3) {
  recommendations.push({
    severity: "high",
    issue: Math.round(gap * 10) / 10 + "x train-test IC gap indicates moderate overfitting",
    action: "Consider additional cross-validation techniques like purged k-fold"
  });
}

// Check degrees of freedom
var dof = diagnostics.degreesOfFreedom || {};
if (dof.numFeatures && dof.effectiveTrials) {
  if (dof.numFeatures > 100 && dof.effectiveTrials < 20) {
    recommendations.push({
      severity: "critical",
      issue: dof.numFeatures + " features with only " + dof.effectiveTrials + " effective trials — high multiple testing risk",
      action: "Run PBO test and apply Deflated Sharpe Ratio correction"
    });
  }
}

// Check IC decay
var decay = diagnostics.icDecayCurve || [];
if (decay.length >= 3) {
  var firstIC = decay[0].ic || 0;
  var lastIC = decay[decay.length - 1].ic || 0;
  if (firstIC > 0 && lastIC > 0 && lastIC / firstIC < 0.2) {
    recommendations.push({
      severity: "high",
      issue: "IC decaying monotonically from " + firstIC + " to " + lastIC + " over " + (decay.length * 3) + " years",
      action: "Feature importance is not stable — prune to top 30 features with stability > 0.7"
    });
  }
}

// Check for negative test returns
if (ttc.testReturn && ttc.testReturn < 0) {
  recommendations.push({
    severity: "high",
    issue: "Negative out-of-sample return (" + (ttc.testReturn * 100).toFixed(2) + "%)",
    action: "Model destroys value OOS — do not deploy without fixing overfitting first"
  });
}

// Always recommend transaction costs if not explicitly present
recommendations.push({
  severity: "medium",
  issue: "Transaction cost modeling may be missing or insufficient",
  action: "Add 50bps round-trip cost and 20bps slippage to all backtests"
});

recommendations.push({
  severity: "medium",
  issue: "Monthly rebalancing generates high turnover",
  action: "Target 80-100% annual turnover; add turnover penalty to objective"
});

// Use LLM for additional insight if available
var llmInsight = "";
try {
  var askResult = await ctx.ask(
    "Given these quant model diagnostics, provide a one-sentence actionable insight: " +
    "Train IC=" + (ttc.trainIC || "?") + ", Test IC=" + (ttc.testIC || "?") +
    ", Gap=" + (gap || "?") + "x, Features=" + (dof.numFeatures || "?") +
    ", Effective trials=" + (dof.effectiveTrials || "?") +
    ". Be specific and quantitative.",
    { maxTokens: 150 }
  );
  if (askResult && askResult.ok && askResult.text) {
    llmInsight = askResult.text.trim();
  }
} catch(e) {}

// Persist
try {
  await ctx.store.set("diagnostics_" + model, diagnostics);
} catch(e) {}

var result = {
  tool: "enso_alpharank_validation_diagnose",
  model: model,
  trainTestComparison: ttc,
  icDecayCurve: diagnostics.icDecayCurve || [],
  rollingIC: diagnostics.rollingIC || [],
  degreesOfFreedom: dof,
  recommendations: recommendations,
  llmInsight: llmInsight
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

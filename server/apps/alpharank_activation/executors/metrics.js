var action = (params.action || "view").trim();
var metricId = (params.metricId || "").trim();
var value = params.value;
var date = (params.date || new Date().toISOString().split("T")[0]).trim();

// Default metric definitions
var defaultMetrics = {
  ic: { label: "Information Coefficient", current: null, target: 0.05, gate1Target: 0.03, gate2Target: 0.05, unit: "", history: [] },
  icir: { label: "IC Information Ratio", current: null, target: 1.0, gate1Target: null, gate2Target: null, unit: "", history: [] },
  sharpe: { label: "Sharpe Ratio", current: null, target: 1.0, gate1Target: 0.5, gate2Target: 0.8, unit: "", history: [] },
  max_dd: { label: "Max Drawdown", current: null, target: -0.20, gate1Target: null, gate2Target: -0.25, unit: "%", history: [], lowerIsBetter: true },
  pbo: { label: "PBO Score", current: null, target: 0.1, gate1Target: null, gate2Target: null, unit: "", history: [], lowerIsBetter: true },
  cagr: { label: "CAGR", current: null, target: 0.14, gate1Target: null, gate2Target: 0.10, unit: "%", history: [] },
  turnover: { label: "Annual Turnover", current: null, target: 2.0, gate1Target: null, gate2Target: null, unit: "x", history: [], lowerIsBetter: true }
};

// Load persisted metrics
var metrics = await ctx.store.get("activation_metrics");
if (!metrics) {
  metrics = defaultMetrics;
  await ctx.store.set("activation_metrics", metrics);
}

// Ensure all metric keys exist (in case new ones were added)
var keys = ["ic", "icir", "sharpe", "max_dd", "pbo", "cagr", "turnover"];
for (var k = 0; k < keys.length; k++) {
  if (!metrics[keys[k]]) {
    metrics[keys[k]] = defaultMetrics[keys[k]];
  }
}

if (action === "update") {
  if (!metricId || value === undefined || value === null) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_activation_metrics",
          success: false,
          error: "metricId and value are required for update action. Valid IDs: " + keys.join(", ")
        })
      }]
    };
  }

  if (!metrics[metricId]) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_activation_metrics",
          success: false,
          error: "Unknown metric '" + metricId + "'. Valid IDs: " + keys.join(", ")
        })
      }]
    };
  }

  var numVal = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(numVal)) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_activation_metrics",
          success: false,
          error: "Value must be a valid number"
        })
      }]
    };
  }

  metrics[metricId].current = numVal;
  metrics[metricId].history.push({ date: date, value: numVal });

  // Keep only last 50 history entries
  if (metrics[metricId].history.length > 50) {
    metrics[metricId].history = metrics[metricId].history.slice(-50);
  }

  await ctx.store.set("activation_metrics", metrics);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_activation_metrics",
        success: true,
        action: "update",
        metricId: metricId,
        label: metrics[metricId].label,
        value: numVal,
        target: metrics[metricId].target,
        message: metrics[metricId].label + " updated to " + numVal
      })
    }]
  };
}

// View action — build gate status
var gate1Criteria = [];
var gate2Criteria = [];

// Gate 1: IC > 0.03, Sharpe > 0.5
var gate1Pass = true;
var g1ic = { metric: "IC", target: "> 0.03", current: metrics.ic.current, pass: metrics.ic.current !== null && metrics.ic.current > 0.03 };
if (!g1ic.pass) gate1Pass = false;
gate1Criteria.push(g1ic);

var g1sharpe = { metric: "Sharpe", target: "> 0.5", current: metrics.sharpe.current, pass: metrics.sharpe.current !== null && metrics.sharpe.current > 0.5 };
if (!g1sharpe.pass) gate1Pass = false;
gate1Criteria.push(g1sharpe);

// Gate 2: IC > 0.05, Sharpe > 0.8, Max DD < 25%
var gate2Pass = true;
var g2ic = { metric: "IC", target: "> 0.05", current: metrics.ic.current, pass: metrics.ic.current !== null && metrics.ic.current > 0.05 };
if (!g2ic.pass) gate2Pass = false;
gate2Criteria.push(g2ic);

var g2sharpe = { metric: "Sharpe", target: "> 0.8", current: metrics.sharpe.current, pass: metrics.sharpe.current !== null && metrics.sharpe.current > 0.8 };
if (!g2sharpe.pass) gate2Pass = false;
gate2Criteria.push(g2sharpe);

var g2dd = { metric: "Max DD", target: "< 25%", current: metrics.max_dd.current, pass: metrics.max_dd.current !== null && metrics.max_dd.current > -0.25 };
if (!g2dd.pass) gate2Pass = false;
gate2Criteria.push(g2dd);

var g2cagr = { metric: "CAGR", target: "> 10%", current: metrics.cagr.current, pass: metrics.cagr.current !== null && metrics.cagr.current > 0.10 };
if (!g2cagr.pass) gate2Pass = false;
gate2Criteria.push(g2cagr);

// Determine gate statuses
var gate1HasData = metrics.ic.current !== null || metrics.sharpe.current !== null;
var gate2HasData = gate1HasData || metrics.max_dd.current !== null || metrics.cagr.current !== null;

var gates = [
  {
    id: "gate1",
    label: "GO/NO-GO Gate #1 (Day 15-16)",
    status: !gate1HasData ? "pending" : (gate1Pass ? "pass" : "fail"),
    criteria: gate1Criteria
  },
  {
    id: "gate2",
    label: "GO/NO-GO Gate #2 (Day 29-30)",
    status: !gate2HasData ? "pending" : (gate2Pass ? "pass" : "fail"),
    criteria: gate2Criteria
  }
];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_activation_metrics",
      action: "view",
      metrics: metrics,
      gates: gates
    })
  }]
};

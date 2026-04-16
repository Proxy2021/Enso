var action = (params.action || "").trim() || "status";
var gateNumber = params.gate ? Number(params.gate) : 0;
var metricsInput = (params.metrics || "").trim();
var notesInput = (params.notes || "").trim();

// Gate definitions with thresholds and pivot actions
var GATE_DEFS = [
  {
    id: 1,
    name: "IC Baseline",
    description: "Verify predictive signal exists out-of-sample",
    metrics: {
      ic: { label: "IC", threshold: 0.03, comparison: ">=", unit: "" },
      icir: { label: "ICIR", threshold: 0.5, comparison: ">=", unit: "" }
    },
    pivotAction: "Reduce features, try different model hyperparameters, check data quality"
  },
  {
    id: 2,
    name: "PBO / DSR",
    description: "Confirm signal is not a product of overfitting or multiple testing",
    metrics: {
      pbo: { label: "PBO", threshold: 0.5, comparison: "<", unit: "" },
      dsr_pvalue: { label: "DSR p-value", threshold: 0.05, comparison: "<", unit: "" }
    },
    pivotAction: "Too many features or too many strategy variants tested. Simplify."
  },
  {
    id: 3,
    name: "Cost Survival",
    description: "Verify alpha survives real-world transaction costs",
    metrics: {
      after_cost_sharpe: { label: "After-cost Sharpe", threshold: 0.3, comparison: ">=", unit: "" },
      after_cost_alpha: { label: "After-cost Alpha", threshold: 0, comparison: ">", unit: "%" }
    },
    pivotAction: "Alpha is real but too small to survive costs. Increase holding period or reduce turnover."
  },
  {
    id: 4,
    name: "Data Integrity",
    description: "Ensure no data biases contaminate the signal",
    metrics: {
      survivorship_bias_delta: { label: "Survivorship Bias Delta", threshold: 20, comparison: "<", unit: "%" },
      lookahead_detected: { label: "Lookahead Leakage", threshold: 0, comparison: "==", unit: "bool" }
    },
    pivotAction: "Data integrity issues. Fix survivorship bias, check for lookahead leakage."
  },
  {
    id: 5,
    name: "Paper Trading",
    description: "Validate live execution matches backtest expectations",
    metrics: {
      live_backtest_sharpe_ratio: { label: "Live/Backtest Sharpe Ratio", threshold: 50, comparison: ">=", unit: "%" },
      weeks_trading: { label: "Weeks Trading", threshold: 6, comparison: ">=", unit: "wk" }
    },
    pivotAction: "Backtest-to-live gap too large. Investigate execution quality and market regime."
  }
];

// Load existing gate state
var gateState = null;
try {
  var stored = await ctx.store.get("validation_gates");
  if (stored && stored.gates && Array.isArray(stored.gates) && stored.gates.length === 5) {
    gateState = stored;
  }
} catch(e) {}

// Initialize default state if nothing stored
if (!gateState) {
  var defaultGates = [];
  for (var g = 0; g < GATE_DEFS.length; g++) {
    var def = GATE_DEFS[g];
    var metricEntries = {};
    var metricKeys = Object.keys(def.metrics);
    for (var mk = 0; mk < metricKeys.length; mk++) {
      var key = metricKeys[mk];
      metricEntries[key] = {
        label: def.metrics[key].label,
        value: null,
        threshold: def.metrics[key].threshold,
        comparison: def.metrics[key].comparison,
        unit: def.metrics[key].unit,
        pass: null
      };
    }
    defaultGates.push({
      id: def.id,
      name: def.name,
      description: def.description,
      status: g === 0 ? "active" : "locked",
      metrics: metricEntries,
      verdict: null,
      timestamp: null,
      notes: "",
      pivotAction: def.pivotAction
    });
  }
  gateState = {
    gates: defaultGates,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
}

// Helper: evaluate a single metric
var evaluateMetric = function(value, threshold, comparison) {
  if (value === null || value === undefined) return null;
  if (comparison === ">=") return value >= threshold;
  if (comparison === ">") return value > threshold;
  if (comparison === "<") return value < threshold;
  if (comparison === "<=") return value <= threshold;
  if (comparison === "==") return value === threshold;
  return null;
};

// Helper: find the current active gate index
var findActiveGateIndex = function(gates) {
  for (var i = 0; i < gates.length; i++) {
    if (gates[i].status === "active") return i;
  }
  return -1;
};

// Helper: recalculate progression after any state change
var recalculateProgression = function(gates) {
  for (var i = 0; i < gates.length; i++) {
    if (gates[i].status === "pass") continue;
    if (gates[i].status === "fail") {
      // Gates after a failed gate stay locked
      for (var j = i + 1; j < gates.length; j++) {
        if (gates[j].status !== "pass" && gates[j].status !== "fail") {
          gates[j].status = "locked";
        }
      }
      break;
    }
    // First non-pass gate becomes active
    if (gates[i].status === "locked" || gates[i].status === "active") {
      gates[i].status = "active";
      // Lock everything after
      for (var k = i + 1; k < gates.length; k++) {
        if (gates[k].status !== "pass" && gates[k].status !== "fail") {
          gates[k].status = "locked";
        }
      }
      break;
    }
  }
  return gates;
};

// ──────── SUBMIT action ────────
if (action === "submit") {
  if (!gateNumber || gateNumber < 1 || gateNumber > 5) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_validation_gates",
          error: "Invalid gate number. Provide gate: 1-5.",
          action: "submit"
        })
      }]
    };
  }

  var gateIdx = gateNumber - 1;
  var gate = gateState.gates[gateIdx];

  if (gate.status === "locked") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_validation_gates",
          error: "Gate " + gateNumber + " is locked. Complete Gate " + (gateIdx > 0 ? gateIdx : 1) + " first.",
          action: "submit"
        })
      }]
    };
  }

  // Parse submitted metrics
  var submittedMetrics = {};
  if (metricsInput) {
    try { submittedMetrics = JSON.parse(metricsInput); } catch(e) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tool: "enso_alpharank_validation_gates",
            error: "Invalid metrics JSON. Expected object with metric keys.",
            action: "submit"
          })
        }]
      };
    }
  }

  // Update metric values and evaluate
  var allMetricsPassed = true;
  var anyMetricSubmitted = false;
  var metKeys = Object.keys(gate.metrics);
  for (var mi = 0; mi < metKeys.length; mi++) {
    var mKey = metKeys[mi];
    if (submittedMetrics[mKey] !== undefined) {
      anyMetricSubmitted = true;
      gate.metrics[mKey].value = Number(submittedMetrics[mKey]);
      gate.metrics[mKey].pass = evaluateMetric(
        gate.metrics[mKey].value,
        gate.metrics[mKey].threshold,
        gate.metrics[mKey].comparison
      );
    }
    if (gate.metrics[mKey].pass !== true) {
      allMetricsPassed = false;
    }
  }

  if (!anyMetricSubmitted) {
    var expectedKeys = metKeys.join(", ");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_validation_gates",
          error: "No recognized metrics submitted. Expected keys: " + expectedKeys,
          action: "submit",
          gate: gateNumber
        })
      }]
    };
  }

  // Determine verdict
  gate.timestamp = new Date().toISOString();
  if (allMetricsPassed) {
    gate.status = "pass";
    gate.verdict = "PASS — All metrics meet thresholds";
  } else {
    gate.status = "fail";
    var failedMetrics = [];
    for (var fi = 0; fi < metKeys.length; fi++) {
      if (gate.metrics[metKeys[fi]].pass === false) {
        failedMetrics.push(gate.metrics[metKeys[fi]].label);
      }
    }
    gate.verdict = "FAIL — " + failedMetrics.join(", ") + " below threshold";
  }

  gateState.gates[gateIdx] = gate;

  // Recalculate progression
  gateState.gates = recalculateProgression(gateState.gates);
  gateState.lastUpdated = new Date().toISOString();
}

// ──────── RESET action ────────
if (action === "reset") {
  if (!gateNumber || gateNumber < 1 || gateNumber > 5) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_validation_gates",
          error: "Invalid gate number. Provide gate: 1-5.",
          action: "reset"
        })
      }]
    };
  }

  var resetIdx = gateNumber - 1;
  var resetGate = gateState.gates[resetIdx];
  var resetDef = GATE_DEFS[resetIdx];

  // Reset metrics to null
  var resetMetricKeys = Object.keys(resetGate.metrics);
  for (var ri = 0; ri < resetMetricKeys.length; ri++) {
    resetGate.metrics[resetMetricKeys[ri]].value = null;
    resetGate.metrics[resetMetricKeys[ri]].pass = null;
  }
  resetGate.status = "active";
  resetGate.verdict = null;
  resetGate.timestamp = null;

  gateState.gates[resetIdx] = resetGate;

  // Also reset all subsequent gates
  for (var si = resetIdx + 1; si < gateState.gates.length; si++) {
    var subGate = gateState.gates[si];
    var subKeys = Object.keys(subGate.metrics);
    for (var ski = 0; ski < subKeys.length; ski++) {
      subGate.metrics[subKeys[ski]].value = null;
      subGate.metrics[subKeys[ski]].pass = null;
    }
    subGate.status = "locked";
    subGate.verdict = null;
    subGate.timestamp = null;
  }

  gateState.lastUpdated = new Date().toISOString();
}

// ──────── NOTES action ────────
if (action === "notes") {
  if (!gateNumber || gateNumber < 1 || gateNumber > 5) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_validation_gates",
          error: "Invalid gate number. Provide gate: 1-5.",
          action: "notes"
        })
      }]
    };
  }
  if (!notesInput) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_validation_gates",
          error: "No notes provided. Use the 'notes' parameter.",
          action: "notes"
        })
      }]
    };
  }

  var notesIdx = gateNumber - 1;
  var existingNotes = gateState.gates[notesIdx].notes || "";
  var timestamp = new Date().toISOString().substring(0, 10);
  gateState.gates[notesIdx].notes = existingNotes
    ? existingNotes + "\n[" + timestamp + "] " + notesInput
    : "[" + timestamp + "] " + notesInput;

  gateState.lastUpdated = new Date().toISOString();
}

// Persist state
try {
  await ctx.store.set("validation_gates", gateState);
} catch(e) {}

// Compute summary stats
var passCount = 0;
var failCount = 0;
var activeGate = null;
var lockedCount = 0;
for (var sc = 0; sc < gateState.gates.length; sc++) {
  var gs = gateState.gates[sc].status;
  if (gs === "pass") passCount++;
  else if (gs === "fail") failCount++;
  else if (gs === "active") activeGate = gateState.gates[sc].id;
  else if (gs === "locked") lockedCount++;
}

var overallStatus = "in_progress";
if (passCount === 5) overallStatus = "all_pass";
else if (failCount > 0) overallStatus = "blocked";

var overallVerdict = "";
if (passCount === 5) {
  overallVerdict = "ALL GATES PASSED — Strategy validated for deployment";
} else if (failCount > 0) {
  overallVerdict = "BLOCKED at Gate " + gateState.gates.filter(function(g) { return g.status === "fail"; })[0].id + " — Review pivot action";
} else if (activeGate) {
  overallVerdict = "Gate " + activeGate + " active — Submit validation results to proceed";
} else {
  overallVerdict = "Pipeline initialized — Begin with Gate 1";
}

var result = {
  tool: "enso_alpharank_validation_gates",
  action: action,
  gates: gateState.gates,
  summary: {
    totalGates: 5,
    passed: passCount,
    failed: failCount,
    locked: lockedCount,
    activeGate: activeGate,
    overallStatus: overallStatus,
    overallVerdict: overallVerdict
  },
  startedAt: gateState.startedAt,
  updatedAt: gateState.lastUpdated
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

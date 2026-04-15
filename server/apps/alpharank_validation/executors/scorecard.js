var metricsInput = (params.metrics || "").trim();
var filePath = (params.filePath || "").trim();
var models = [];

// Priority: explicit metrics > file > stored state > sample data
if (metricsInput) {
  try { models = JSON.parse(metricsInput); } catch(e) { models = []; }
} else if (filePath) {
  try {
    var fileResult = await ctx.readFile(filePath);
    if (fileResult.success) {
      var parsed = JSON.parse(typeof fileResult.data === "string" ? fileResult.data : JSON.stringify(fileResult.data));
      models = Array.isArray(parsed) ? parsed : (parsed.models || []);
    }
  } catch(e) { models = []; }
}

// Try stored state
if (!models || models.length === 0) {
  try {
    var stored = await ctx.store.get("scorecard_models");
    if (stored && Array.isArray(stored) && stored.length > 0) {
      models = stored;
    }
  } catch(e) {}
}

// Default sample data if nothing else available
if (!models || models.length === 0) {
  models = [
    { name: "M1", horizon: "1-month", trainIC: 0.082, testIC: 0.013, icir: 0.31, pbo: 0.72, dsr: 0.38, sharpe: 0.24, annualReturn: -0.0264, maxDrawdown: -0.187 },
    { name: "M3", horizon: "3-month", trainIC: 0.095, testIC: 0.018, icir: 0.42, pbo: 0.65, dsr: 0.45, sharpe: 0.35, annualReturn: -0.0112, maxDrawdown: -0.154 },
    { name: "M6", horizon: "6-month", trainIC: 0.110, testIC: 0.025, icir: 0.55, pbo: 0.52, dsr: 0.51, sharpe: 0.48, annualReturn: 0.032, maxDrawdown: -0.122 },
    { name: "M12", horizon: "12-month", trainIC: 0.125, testIC: 0.031, icir: 0.61, pbo: 0.44, dsr: 0.58, sharpe: 0.56, annualReturn: 0.058, maxDrawdown: -0.098 }
  ];
}

// Compute gates for each model
var IC_THRESHOLD = 0.03;
var ICIR_THRESHOLD = 0.5;
var PBO_THRESHOLD = 0.5;
var SHARPE_THRESHOLD = 0.5;

var passingCount = 0;
var totalTestIC = 0;
var totalGap = 0;
var bestModel = null;
var worstModel = null;
var bestIC = -999;
var worstIC = 999;

for (var i = 0; i < models.length; i++) {
  var m = models[i];
  var gates = {
    ic: { value: m.testIC, threshold: IC_THRESHOLD, pass: m.testIC >= IC_THRESHOLD },
    icir: { value: m.icir, threshold: ICIR_THRESHOLD, pass: m.icir >= ICIR_THRESHOLD },
    pbo: { value: m.pbo, threshold: PBO_THRESHOLD, pass: m.pbo < PBO_THRESHOLD },
    sharpe: { value: m.sharpe, threshold: SHARPE_THRESHOLD, pass: m.sharpe >= SHARPE_THRESHOLD }
  };
  m.gates = gates;

  var allPass = gates.ic.pass && gates.icir.pass && gates.pbo.pass && gates.sharpe.pass;
  if (allPass) passingCount++;

  totalTestIC += (m.testIC || 0);
  var gap = m.trainIC > 0 ? m.trainIC / m.testIC : 0;
  totalGap += gap;

  if (m.testIC > bestIC) { bestIC = m.testIC; bestModel = m.name; }
  if (m.testIC < worstIC) { worstIC = m.testIC; worstModel = m.name; }
}

var avgTestIC = models.length > 0 ? totalTestIC / models.length : 0;
var avgGap = models.length > 0 ? totalGap / models.length : 0;

var verdict = passingCount === models.length
  ? "PASS — All " + models.length + " models pass validation gates"
  : "FAIL — " + (models.length - passingCount) + " of " + models.length + " models fail validation gates";

// Persist for future reference
try {
  await ctx.store.set("scorecard_models", models);
} catch(e) {}

var result = {
  tool: "enso_alpharank_validation_scorecard",
  models: models,
  summary: {
    totalModels: models.length,
    passingModels: passingCount,
    avgTestIC: Math.round(avgTestIC * 10000) / 10000,
    avgTrainTestGap: Math.round(avgGap * 100) / 100,
    bestModel: bestModel,
    worstModel: worstModel,
    overallVerdict: verdict
  },
  updatedAt: new Date().toISOString()
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

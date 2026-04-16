var focusId = (params.focusId || "").trim();
if (!focusId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_trend_analysis",
    error: true,
    message: "focusId is required",
    focusId: "",
    focusTitle: "Unknown",
    history: [],
    trend: {},
    current: {},
    allAreas: []
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

var focusState = null;
try {
  var raw = await ctx.readFile(focusPath);
  if (raw && typeof raw === "string") {
    focusState = JSON.parse(raw);
  } else if (raw && raw.success && raw.data) {
    focusState = typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
  }
} catch(e) {}

if (!focusState || !focusState.areas) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_trend_analysis",
    error: true,
    message: "No focus areas found",
    focusId: focusId,
    focusTitle: "Unknown",
    history: [],
    trend: {},
    current: {},
    allAreas: []
  }) }] };
}

// Build area list
var allAreas = [];
var target = null;
for (var i = 0; i < focusState.areas.length; i++) {
  var a = focusState.areas[i];
  allAreas.push({ id: a.id, title: a.title });
  if (a.id === focusId) target = a;
}

if (!target) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_trend_analysis",
    error: true,
    message: "Focus area not found: " + focusId,
    focusId: focusId,
    focusTitle: "Unknown",
    history: [],
    trend: {},
    current: {},
    allAreas: allAreas
  }) }] };
}

var assess = target.assessment || {};
var history = target.assessmentHistory || [];

// If no formal history exists, construct a synthetic timeline from available data
var chartHistory = [];
if (history.length > 0) {
  // Use real assessment history
  for (var hi = 0; hi < history.length; hi++) {
    var rec = history[hi];
    chartHistory.push({
      date: rec.timestamp ? rec.timestamp.substring(0, 10) : "unknown",
      understanding: rec.understanding || 0,
      progress: rec.progress || 0,
      confidence: rec.confidence || 0,
      engagementScore: rec.engagementScore || 0,
      source: rec.source || "unknown"
    });
  }
} else {
  // Construct minimal timeline: creation → refinements → current assessment
  var createdDate = target.createdAt ? target.createdAt.substring(0, 10) : new Date().toISOString().substring(0, 10);

  // Initial point at creation
  chartHistory.push({
    date: createdDate,
    understanding: 5,
    progress: 0,
    confidence: 20,
    engagementScore: 10,
    source: "creation"
  });

  // Add points from refinements
  if (target.refinements && target.refinements.length > 0) {
    for (var ri = 0; ri < target.refinements.length; ri++) {
      var ref = target.refinements[ri];
      var refDate = ref.date ? ref.date.substring(0, 10) : createdDate;
      // Estimate progressive improvement
      var fraction = (ri + 1) / (target.refinements.length + 1);
      chartHistory.push({
        date: refDate,
        understanding: Math.round(5 + fraction * ((assess.understanding || 15) - 5)),
        progress: Math.round(fraction * ((assess.progress || 10) * 0.5)),
        confidence: Math.round(20 + fraction * 20),
        engagementScore: Math.round(10 + fraction * 30),
        source: ref.source || "refinement"
      });
    }
  }

  // Current assessment point
  if (assess.assessedAt) {
    chartHistory.push({
      date: assess.assessedAt.substring(0, 10),
      understanding: assess.understanding || 0,
      progress: assess.progress || 0,
      confidence: assess.confidence || 50,
      engagementScore: 0,
      source: assess.assessedBy || "tl-evaluate"
    });
  }
}

// Deduplicate by date (keep latest per date)
var dateMap = {};
for (var di = 0; di < chartHistory.length; di++) {
  dateMap[chartHistory[di].date] = chartHistory[di];
}
chartHistory = [];
var dateKeys = Object.keys(dateMap).sort();
for (var dk = 0; dk < dateKeys.length; dk++) {
  chartHistory.push(dateMap[dateKeys[dk]]);
}

// Compute trend metrics
var progressVelocity = 0;
var progressAcceleration = 0;
var understandingVelocity = 0;
var avgCycleDays = 0;
var projectedProgress = assess.progress || 0;

if (chartHistory.length >= 2) {
  var last = chartHistory[chartHistory.length - 1];
  var prev = chartHistory[chartHistory.length - 2];
  var dtMs = new Date(last.date).getTime() - new Date(prev.date).getTime();
  var dtDays = Math.max(dtMs / 86400000, 0.5);
  progressVelocity = Math.round(((last.progress - prev.progress) / dtDays) * 10) / 10;
  understandingVelocity = Math.round(((last.understanding - prev.understanding) / dtDays) * 10) / 10;

  // Average cycle days
  var totalDt = new Date(chartHistory[chartHistory.length - 1].date).getTime() - new Date(chartHistory[0].date).getTime();
  avgCycleDays = chartHistory.length > 1 ? Math.round((totalDt / 86400000) / (chartHistory.length - 1) * 10) / 10 : 0;

  // Acceleration (need 3+ points)
  if (chartHistory.length >= 3) {
    var prev2 = chartHistory[chartHistory.length - 3];
    var dt2Ms = new Date(prev.date).getTime() - new Date(prev2.date).getTime();
    var dt2Days = Math.max(dt2Ms / 86400000, 0.5);
    var prevVelocity = (prev.progress - prev2.progress) / dt2Days;
    var currVelocity = (last.progress - prev.progress) / dtDays;
    progressAcceleration = Math.round((currVelocity - prevVelocity) * 10) / 10;
  }

  // Project next
  projectedProgress = Math.round(Math.min(100, Math.max(0, last.progress + progressVelocity * (avgCycleDays || 3))));
}

var result = {
  tool: "enso_focus_evaluator_trend_analysis",
  focusId: target.id,
  focusTitle: target.title,
  history: chartHistory,
  trend: {
    progressVelocity: progressVelocity,
    progressAcceleration: progressAcceleration,
    understandingVelocity: understandingVelocity,
    avgCycleDays: avgCycleDays,
    evaluationCount: chartHistory.length,
    projectedProgress: projectedProgress
  },
  current: {
    understanding: assess.understanding || 0,
    progress: assess.progress || 0,
    confidence: assess.confidence || null
  },
  allAreas: allAreas
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

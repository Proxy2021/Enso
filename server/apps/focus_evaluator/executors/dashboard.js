var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

// Load focus state
var focusState = null;
try {
  var raw = await ctx.readFile(focusPath);
  if (raw && typeof raw === "string") {
    focusState = JSON.parse(raw);
  } else if (raw && raw.success && raw.data) {
    focusState = typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
  }
} catch(e) {}

if (!focusState || !focusState.areas || focusState.areas.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_dashboard",
    areas: [],
    driftAlerts: [],
    globalMetrics: { avgUnderstanding: 0, avgProgress: 0, avgEngagement: 0, totalAssessments: 0, areasWithDrift: 0 },
    totalAreas: 0,
    activeAreas: 0,
    generatedAt: new Date().toISOString()
  }) }] };
}

var areas = focusState.areas;
var now = Date.now();
var driftAlerts = [];
var areaResults = [];
var totalU = 0, totalP = 0, totalEng = 0, totalAssessments = 0, areasWithDrift = 0;
var activeCount = 0;

for (var i = 0; i < areas.length; i++) {
  var a = areas[i];
  var assess = a.assessment || {};
  var u = assess.understanding || 0;
  var p = assess.progress || 0;
  var history = a.assessmentHistory || [];
  var lastActive = a.progress && a.progress.lastActiveAt ? new Date(a.progress.lastActiveAt).getTime() : now;
  var daysSince = Math.floor((now - lastActive) / 86400000);
  var trend = a.progress ? a.progress.trend : "steady";

  // Compute engagement score from available signals
  var engScore = 0;
  var signalCount = 0;

  // Signal 1: Activity recency (0-100)
  var recencyScore = daysSince <= 1 ? 90 : daysSince <= 3 ? 70 : daysSince <= 7 ? 45 : daysSince <= 14 ? 20 : 5;
  engScore += recencyScore * 0.25;

  // Signal 2: Trend indicator
  var trendScore = trend === "growing" ? 85 : trend === "steady" ? 50 : 15;
  engScore += trendScore * 0.2;

  // Signal 3: Sprint activity
  var hasSprint = !!(a.lastSprintSummary || a.lastSprintResults);
  var sprintScore = hasSprint ? 70 : 10;
  engScore += sprintScore * 0.15;

  // Signal 4: Evidence count (proxy for cortex growth)
  var evidenceCount = a.evidence ? a.evidence.length : 0;
  var evidenceScore = evidenceCount >= 5 ? 80 : evidenceCount >= 3 ? 60 : evidenceCount >= 1 ? 35 : 0;
  engScore += evidenceScore * 0.15;

  // Signal 5: Refinement count (proxy for conversation depth)
  var refCount = a.refinements ? a.refinements.length : 0;
  var refScore = refCount >= 5 ? 80 : refCount >= 3 ? 55 : refCount >= 1 ? 30 : 0;
  engScore += refScore * 0.1;

  // Signal 6: Clarity advancement
  var clarityScore = a.clarity === "clear" ? 80 : a.clarity === "developing" ? 50 : 20;
  engScore += clarityScore * 0.15;

  engScore = Math.round(engScore);

  // Compute velocity from assessment history
  var velocity = 0;
  if (history.length >= 2) {
    var latest = history[history.length - 1];
    var prev = history[history.length - 2];
    var dt = (new Date(latest.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 86400000;
    if (dt > 0) velocity = Math.round(((latest.progress - prev.progress) / dt) * 10) / 10;
  }

  // Drift detection
  var driftStatus = "healthy";
  if (history.length >= 3) {
    var last3 = history.slice(-3);
    var vel1 = last3[1].progress - last3[0].progress;
    var vel2 = last3[2].progress - last3[1].progress;
    if (vel2 < 2 && vel1 < 2) {
      driftStatus = "stalling";
      driftAlerts.push({
        type: "stalling",
        severity: "warning",
        focusId: a.id,
        focusTitle: a.title,
        message: "Progress velocity below 2pts/cycle for 2 consecutive cycles",
        suggestedAction: "Re-evaluate approach, consider scope reduction or fresh sprint"
      });
      areasWithDrift++;
    }
    if (last3[2].progress < last3[1].progress) {
      driftStatus = "regressing";
      driftAlerts.push({
        type: "regressing",
        severity: "critical",
        focusId: a.id,
        focusTitle: a.title,
        message: "Progress decreased from " + last3[1].progress + "% to " + last3[2].progress + "%",
        suggestedAction: "Immediate re-evaluation needed — investigate root cause"
      });
      areasWithDrift++;
    }
  } else {
    // With no history, use heuristics
    if (daysSince > 10 && engScore < 25) {
      driftStatus = "disengaged";
      driftAlerts.push({
        type: "disengaged",
        severity: "warning",
        focusId: a.id,
        focusTitle: a.title,
        message: "Low engagement (" + engScore + ") with " + daysSince + " days since last activity",
        suggestedAction: "Consider pausing or reprioritizing this focus area"
      });
      areasWithDrift++;
    } else if (daysSince > 5 && trend === "quiet") {
      driftStatus = "stalling";
      areasWithDrift++;
    }
  }

  if (a.status === "active") activeCount++;
  totalU += u;
  totalP += p;
  totalEng += engScore;
  totalAssessments += history.length || (assess.assessedAt ? 1 : 0);

  // Sprint count: count from history of sprints
  var sprintCount = 0;
  if (a.lastSprintSummary) sprintCount++;
  if (history.length > 0) {
    for (var hi = 0; hi < history.length; hi++) {
      if (history[hi].trigger === "post-sprint") sprintCount++;
    }
  }

  areaResults.push({
    id: a.id,
    title: a.title,
    status: a.status || "active",
    clarity: a.clarity || "emerging",
    focusType: a.focusType || "general",
    understanding: u,
    progress: p,
    trend: trend,
    daysSinceActivity: daysSince,
    driftStatus: driftStatus,
    engagementScore: engScore,
    assessmentCount: history.length || (assess.assessedAt ? 1 : 0),
    lastAssessed: assess.assessedAt || null,
    sprintCount: sprintCount,
    progressVelocity: velocity,
    tags: a.semanticTags || [],
    confidence: assess.confidence || a.assessmentConfidence || null
  });
}

var n = areas.length || 1;
var result = {
  tool: "enso_focus_evaluator_dashboard",
  generatedAt: new Date().toISOString(),
  totalAreas: areas.length,
  activeAreas: activeCount,
  areas: areaResults,
  driftAlerts: driftAlerts,
  globalMetrics: {
    avgUnderstanding: Math.round(totalU / n),
    avgProgress: Math.round(totalP / n),
    avgEngagement: Math.round(totalEng / n),
    totalAssessments: totalAssessments,
    areasWithDrift: areasWithDrift
  }
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

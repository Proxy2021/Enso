var focusIdsParam = (params.focusIds || "").trim();
var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

var focusState = null;
try {
  var raw = await ctx.readFile(focusPath);
  if (raw && typeof raw === "string") focusState = JSON.parse(raw);
  else if (raw && raw.success && raw.data) focusState = typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
} catch(e) {}

if (!focusState || !focusState.areas || focusState.areas.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_compare",
    generatedAt: new Date().toISOString(),
    areas: [],
    rankings: {}
  }) }] };
}

var allAreas = focusState.areas;
var now = Date.now();

// Filter areas if specific IDs provided
var targetAreas = [];
if (focusIdsParam) {
  var requestedIds = focusIdsParam.split(",").map(function(s) { return s.trim(); });
  for (var i = 0; i < allAreas.length; i++) {
    if (requestedIds.indexOf(allAreas[i].id) !== -1) targetAreas.push(allAreas[i]);
  }
} else {
  // Compare all active areas
  for (var j = 0; j < allAreas.length; j++) {
    if (allAreas[j].status === "active") targetAreas.push(allAreas[j]);
  }
}

var comparisonData = [];

for (var k = 0; k < targetAreas.length; k++) {
  var a = targetAreas[k];
  var assess = a.assessment || {};
  var history = a.assessmentHistory || [];
  var lastActive = a.progress && a.progress.lastActiveAt ? new Date(a.progress.lastActiveAt).getTime() : now;
  var daysSince = Math.floor((now - lastActive) / 86400000);
  var trend = a.progress ? a.progress.trend : "steady";

  // Engagement score (lightweight version)
  var engScore = 0;
  var recencyScore = daysSince <= 1 ? 90 : daysSince <= 3 ? 70 : daysSince <= 7 ? 45 : daysSince <= 14 ? 20 : 5;
  engScore += recencyScore * 0.25;
  var trendScore = trend === "growing" ? 85 : trend === "steady" ? 50 : 15;
  engScore += trendScore * 0.2;
  var hasSprint = !!(a.lastSprintSummary || a.lastSprintResults);
  engScore += (hasSprint ? 70 : 10) * 0.15;
  var evidenceCount = a.evidence ? a.evidence.length : 0;
  engScore += (evidenceCount >= 5 ? 80 : evidenceCount >= 3 ? 60 : evidenceCount >= 1 ? 35 : 0) * 0.15;
  var refCount = a.refinements ? a.refinements.length : 0;
  engScore += (refCount >= 5 ? 80 : refCount >= 3 ? 55 : refCount >= 1 ? 30 : 0) * 0.1;
  var clarityScore = a.clarity === "clear" ? 80 : a.clarity === "developing" ? 50 : 20;
  engScore += clarityScore * 0.15;
  engScore = Math.round(engScore);

  // Velocity from history
  var velocity = 0;
  if (history.length >= 2) {
    var latest = history[history.length - 1];
    var prev = history[history.length - 2];
    var dt = (new Date(latest.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 86400000;
    if (dt > 0) velocity = Math.round(((latest.progress - prev.progress) / dt) * 10) / 10;
  }

  // Drift status
  var driftStatus = "healthy";
  if (history.length >= 3) {
    var last3 = history.slice(-3);
    var vel1 = last3[1].progress - last3[0].progress;
    var vel2 = last3[2].progress - last3[1].progress;
    if (vel2 < 2 && vel1 < 2) driftStatus = "stalling";
    if (last3[2].progress < last3[1].progress) driftStatus = "regressing";
  } else if (daysSince > 10 && engScore < 25) {
    driftStatus = "disengaged";
  } else if (daysSince > 5 && trend === "quiet") {
    driftStatus = "stalling";
  }

  var sprintCount = 0;
  if (a.lastSprintSummary) sprintCount++;
  for (var hi = 0; hi < history.length; hi++) {
    if (history[hi].trigger === "post-sprint") sprintCount++;
  }

  comparisonData.push({
    id: a.id,
    title: a.title,
    understanding: assess.understanding || 0,
    progress: assess.progress || 0,
    engagementScore: engScore,
    velocity: velocity,
    driftStatus: driftStatus,
    sprintCount: sprintCount,
    daysSinceActivity: daysSince,
    cortexEntities: (a.relatedEntityIds || []).length,
    evidenceCount: evidenceCount,
    clarity: a.clarity || "emerging",
    focusType: a.focusType || "general",
    trend: trend
  });
}

// Build rankings
var byProgress = comparisonData.slice().sort(function(a, b) { return b.progress - a.progress; }).map(function(x) { return x.id; });
var byUnderstanding = comparisonData.slice().sort(function(a, b) { return b.understanding - a.understanding; }).map(function(x) { return x.id; });
var byEngagement = comparisonData.slice().sort(function(a, b) { return b.engagementScore - a.engagementScore; }).map(function(x) { return x.id; });
var byVelocity = comparisonData.slice().sort(function(a, b) { return b.velocity - a.velocity; }).map(function(x) { return x.id; });

// Radar chart data for each area (normalized 0-100)
var radarData = [];
for (var ri = 0; ri < comparisonData.length; ri++) {
  var cd = comparisonData[ri];
  radarData.push({
    name: cd.title.length > 25 ? cd.title.substring(0, 22) + "..." : cd.title,
    understanding: cd.understanding,
    progress: cd.progress,
    engagement: cd.engagementScore,
    velocity: Math.min(100, Math.max(0, cd.velocity * 10)),
    evidence: Math.min(100, cd.evidenceCount * 15)
  });
}

var result = {
  tool: "enso_focus_evaluator_compare",
  generatedAt: new Date().toISOString(),
  areas: comparisonData,
  rankings: {
    byProgress: byProgress,
    byUnderstanding: byUnderstanding,
    byEngagement: byEngagement,
    byVelocity: byVelocity
  },
  radarData: radarData
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

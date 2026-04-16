var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

var focusState = null;
try {
  var raw = await ctx.readFile(focusPath);
  if (raw && typeof raw === "string") focusState = JSON.parse(raw);
  else if (raw && raw.success && raw.data) focusState = typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
} catch(e) {}

if (!focusState || !focusState.areas) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_drift_scan",
    generatedAt: new Date().toISOString(),
    totalAreas: 0,
    healthyCount: 0,
    alertCount: 0,
    alerts: [],
    areaStatuses: []
  }) }] };
}

var areas = focusState.areas;
var now = Date.now();
var alerts = [];
var areaStatuses = [];
var healthyCount = 0;

for (var i = 0; i < areas.length; i++) {
  var a = areas[i];
  if (a.status !== "active") continue;

  var history = a.assessmentHistory || [];
  var assess = a.assessment || {};
  var lastActive = a.progress && a.progress.lastActiveAt ? new Date(a.progress.lastActiveAt).getTime() : now;
  var daysSince = Math.floor((now - lastActive) / 86400000);
  var trend = a.progress ? a.progress.trend : "steady";

  // Compute engagement score (same logic as dashboard)
  var engScore = 0;
  var recencyScore = daysSince <= 1 ? 90 : daysSince <= 3 ? 70 : daysSince <= 7 ? 45 : daysSince <= 14 ? 20 : 5;
  engScore += recencyScore * 0.3;
  var trendScore = trend === "growing" ? 85 : trend === "steady" ? 50 : 15;
  engScore += trendScore * 0.25;
  var hasSprint = !!(a.lastSprintSummary || a.lastSprintResults);
  engScore += (hasSprint ? 70 : 10) * 0.15;
  var evidenceCount = a.evidence ? a.evidence.length : 0;
  engScore += (evidenceCount >= 5 ? 80 : evidenceCount >= 3 ? 60 : evidenceCount >= 1 ? 35 : 0) * 0.15;
  var clarityScore = a.clarity === "clear" ? 80 : a.clarity === "developing" ? 50 : 20;
  engScore += clarityScore * 0.15;
  engScore = Math.round(engScore);

  var velocity = 0;
  var driftStatus = "healthy";
  var driftEvidence = [];

  if (history.length >= 3) {
    // ── Rule 1: Stalling ──
    var last3 = history.slice(-3);
    var vel1 = last3[1].progress - last3[0].progress;
    var vel2 = last3[2].progress - last3[1].progress;
    velocity = Math.round(vel2 * 10) / 10;

    if (vel2 < 2 && vel1 < 2) {
      driftStatus = "stalling";
      driftEvidence.push("Progress: " + last3[0].progress + " → " + last3[1].progress + " → " + last3[2].progress + " (velocity: " + velocity + "pts/cycle)");
      if (engScore < 40) driftEvidence.push("Engagement score: " + engScore + " (below average)");
      alerts.push({
        type: "stalling",
        severity: "warning",
        focusId: a.id,
        focusTitle: a.title,
        message: "Progress velocity dropped below 2pts/cycle for 2 consecutive evaluations",
        evidence: driftEvidence,
        suggestedAction: "Re-evaluate approach, consider scope reduction or fresh sprint"
      });
    }

    // ── Rule 2: Regressing ──
    if (last3[2].progress < last3[1].progress) {
      driftStatus = "regressing";
      driftEvidence = [
        "Progress decreased: " + last3[1].progress + "% → " + last3[2].progress + "%",
        "This is rare and indicates a significant setback"
      ];
      alerts.push({
        type: "regressing",
        severity: "critical",
        focusId: a.id,
        focusTitle: a.title,
        message: "Progress decreased from " + last3[1].progress + "% to " + last3[2].progress + "%",
        evidence: driftEvidence,
        suggestedAction: "Immediate re-evaluation — investigate root cause of regression"
      });
    }

    // ── Rule 3: Disengaged ──
    if (engScore < 20) {
      var prevEng = last3[1].engagementScore || 0;
      if (prevEng < 20 || engScore < 15) {
        driftStatus = "disengaged";
        driftEvidence = [
          "Engagement: " + engScore + "/100 (very low)",
          daysSince + " days since last activity"
        ];
        alerts.push({
          type: "disengaged",
          severity: "warning",
          focusId: a.id,
          focusTitle: a.title,
          message: "Engagement score below 20 for extended period",
          evidence: driftEvidence,
          suggestedAction: "Consider pausing or reprioritizing this focus area"
        });
      }
    }

    // ── Rule 4: Accelerating (positive) ──
    if (vel2 > 15 && engScore > 80) {
      driftStatus = "accelerating";
      alerts.push({
        type: "accelerating",
        severity: "info",
        focusId: a.id,
        focusTitle: a.title,
        message: "Strong acceleration detected — progress velocity " + vel2 + "pts/cycle with high engagement",
        evidence: ["Velocity: " + vel2 + "pts/cycle", "Engagement: " + engScore + "/100"],
        suggestedAction: "Positive signal — consider expanding scope or targeting completion"
      });
    }

    // ── Rule 5: Confidence Drop ──
    if (last3[2].confidence && last3[1].confidence) {
      var confDrop = last3[1].confidence - last3[2].confidence;
      var progressChange = Math.abs(last3[2].progress - last3[1].progress);
      if (confDrop >= 20 && progressChange < 5) {
        if (driftStatus === "healthy") driftStatus = "confidence_drop";
        alerts.push({
          type: "confidence_drop",
          severity: "warning",
          focusId: a.id,
          focusTitle: a.title,
          message: "Confidence dropped " + confDrop + " points without significant progress change",
          evidence: [
            "Confidence: " + last3[1].confidence + " → " + last3[2].confidence,
            "Progress barely changed: " + last3[1].progress + " → " + last3[2].progress
          ],
          suggestedAction: "Assessment uncertainty — gather more signals before acting"
        });
      }
    }
  } else {
    // Heuristic-based drift for areas without enough history
    if (daysSince > 10 && engScore < 25) {
      driftStatus = "disengaged";
      alerts.push({
        type: "disengaged",
        severity: "warning",
        focusId: a.id,
        focusTitle: a.title,
        message: "Low engagement (" + engScore + ") with " + daysSince + " days of inactivity",
        evidence: [daysSince + " days since last activity", "Engagement score: " + engScore],
        suggestedAction: "Consider pausing this focus or scheduling dedicated time"
      });
    } else if (daysSince > 5 && trend === "quiet") {
      driftStatus = "stalling";
    }
  }

  if (driftStatus === "healthy") healthyCount++;

  areaStatuses.push({
    id: a.id,
    title: a.title,
    status: driftStatus,
    velocity: velocity,
    engagementScore: engScore,
    daysSinceActivity: daysSince,
    understanding: assess.understanding || 0,
    progress: assess.progress || 0
  });
}

var result = {
  tool: "enso_focus_evaluator_drift_scan",
  generatedAt: new Date().toISOString(),
  totalAreas: areaStatuses.length,
  healthyCount: healthyCount,
  alertCount: alerts.length,
  alerts: alerts,
  areaStatuses: areaStatuses
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

var focusIdParam = (params.focusId || "").trim();
var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

// Load activation state from store
var activationState = await ctx.store.get("activation_state") || { version: 1, records: {} };
var allRecords = [];
var keys = Object.keys(activationState.records || {});
for (var ki = 0; ki < keys.length; ki++) {
  allRecords.push(activationState.records[keys[ki]]);
}

// Filter by focusId if provided
var filtered = [];
if (focusIdParam) {
  for (var fi = 0; fi < allRecords.length; fi++) {
    if (allRecords[fi].focusId === focusIdParam) filtered.push(allRecords[fi]);
  }
} else {
  filtered = allRecords;
}

// Load focus area titles
var focusTitles = {};
var focusAreas = [];
try {
  var focusResult = await ctx.readFile(focusPath);
  var focusState = null;
  if (focusResult && typeof focusResult === "string") {
    focusState = JSON.parse(focusResult);
  } else if (focusResult && focusResult.success && focusResult.data) {
    focusState = typeof focusResult.data === "string" ? JSON.parse(focusResult.data) : focusResult.data;
  }
  if (focusState && focusState.areas) {
    for (var ai = 0; ai < focusState.areas.length; ai++) {
      var a = focusState.areas[ai];
      focusTitles[a.id] = a.title || a.id;
      focusAreas.push(a);
    }
  }
} catch(e) {}

// If no activation records exist yet, scan focus areas for deliverables
if (filtered.length === 0) {
  var scanAreas = focusIdParam
    ? focusAreas.filter(function(a) { return a.id === focusIdParam; })
    : focusAreas;

  for (var sa = 0; sa < scanAreas.length; sa++) {
    var area = scanAreas[sa];
    if (area.lastSprintSummary && area.lastSprintSummary.deliverables) {
      for (var sd = 0; sd < area.lastSprintSummary.deliverables.length; sd++) {
        var del = area.lastSprintSummary.deliverables[sd];
        // Check if there's a status in the old status tracker
        var stMap = await ctx.store.get("status_" + area.id) || {};
        var oldStatus = stMap[del.entityId] || "new";
        filtered.push({
          entityId: del.entityId,
          focusId: area.id,
          focusTitle: area.title,
          taskTitle: del.taskTitle || "Untitled",
          entityType: del.entityType || "synthesis",
          painPoint: del.painPoint || "",
          howItHelps: del.howItHelps || "",
          status: oldStatus === "acted_on" ? "completed" : "pending",
          steps: [],
          activatedAt: null,
          completedAt: null
        });
      }
    }
  }
}

// Aggregate by status
var completedCount = 0;
var inProgressCount = 0;
var pendingCount = 0;
var skippedCount = 0;
for (var si = 0; si < filtered.length; si++) {
  var st = filtered[si].status;
  if (st === "completed") completedCount++;
  else if (st === "in_progress") inProgressCount++;
  else if (st === "skipped") skippedCount++;
  else pendingCount++;
}
var total = filtered.length;

// Group by focus area
var byFocusMap = {};
for (var gi = 0; gi < filtered.length; gi++) {
  var r = filtered[gi];
  var fid = r.focusId;
  if (!byFocusMap[fid]) {
    byFocusMap[fid] = {
      focusId: fid,
      focusTitle: focusTitles[fid] || r.focusTitle || fid,
      total: 0, activated: 0, inProgress: 0, pending: 0, skipped: 0
    };
  }
  var g = byFocusMap[fid];
  g.total++;
  if (r.status === "completed") g.activated++;
  else if (r.status === "in_progress") g.inProgress++;
  else if (r.status === "skipped") g.skipped++;
  else g.pending++;
}
var byFocus = [];
var bfKeys = Object.keys(byFocusMap);
for (var bfi = 0; bfi < bfKeys.length; bfi++) {
  byFocus.push(byFocusMap[bfKeys[bfi]]);
}

// Build records list for the template
var recordsList = [];
for (var ri = 0; ri < filtered.length; ri++) {
  var rec = filtered[ri];
  var stepsCompleted = 0;
  var stepsTotal = rec.steps ? rec.steps.length : 0;
  if (rec.steps) {
    for (var sti = 0; sti < rec.steps.length; sti++) {
      if (rec.steps[sti].completed) stepsCompleted++;
    }
  }
  recordsList.push({
    entityId: rec.entityId,
    taskTitle: rec.taskTitle,
    entityType: rec.entityType,
    focusId: rec.focusId,
    focusTitle: focusTitles[rec.focusId] || rec.focusTitle || rec.focusId,
    painPoint: rec.painPoint || "",
    status: rec.status,
    stepsCompleted: stepsCompleted,
    stepsTotal: stepsTotal,
    activatedAt: rec.activatedAt || null,
    completedAt: rec.completedAt || null
  });
}

// Find recommended next deliverable (first pending deliverable)
var recommended = null;
for (var rci = 0; rci < filtered.length; rci++) {
  if (filtered[rci].status === "pending") {
    recommended = {
      entityId: filtered[rci].entityId,
      taskTitle: filtered[rci].taskTitle,
      entityType: filtered[rci].entityType,
      focusId: filtered[rci].focusId,
      reason: "This deliverable addresses: " + (filtered[rci].painPoint || "a key pain point")
    };
    break;
  }
}
// Fallback: first in_progress
if (!recommended) {
  for (var rpi = 0; rpi < filtered.length; rpi++) {
    if (filtered[rpi].status === "in_progress") {
      recommended = {
        entityId: filtered[rpi].entityId,
        taskTitle: filtered[rpi].taskTitle,
        entityType: filtered[rpi].entityType,
        focusId: filtered[rpi].focusId,
        reason: "Continue where you left off — this is already in progress"
      };
      break;
    }
  }
}

// ── Feedback integration ──
var feedbackInsights = null;
try {
  var aggregator = require("../apps/sprint_results/lib/feedback-aggregator.cjs");
  feedbackInsights = aggregator.getActivationInsights();
} catch (e) {
  // Aggregator not available — continue without feedback data
}

// Merge feedback ratings into per-record data
var feedbackByEntity = {};
if (feedbackInsights && feedbackInsights.totalFeedback > 0) {
  try {
    var fs = require("fs");
    var fbPath = (process.env.HOME || process.env.USERPROFILE || "~") + "/.enso/data/activation-feedback.json";
    var fbRaw = fs.readFileSync(fbPath, "utf8");
    var fbData = JSON.parse(fbRaw);
    for (var fbi = 0; fbi < (fbData.feedbackEntries || []).length; fbi++) {
      var entry = fbData.feedbackEntries[fbi];
      feedbackByEntity[entry.entityId] = { rating: entry.rating, actionTaken: entry.actionTaken || "" };
    }
  } catch (e2) {}
}

// Attach feedback to records and compute per-type stats
var typeStats = {};
for (var rli = 0; rli < recordsList.length; rli++) {
  var rl = recordsList[rli];
  if (feedbackByEntity[rl.entityId]) {
    rl.feedback = feedbackByEntity[rl.entityId];
  }
  // Track type activation counts
  var et = rl.entityType || "unknown";
  if (!typeStats[et]) typeStats[et] = { total: 0, activated: 0 };
  typeStats[et].total++;
  if (rl.status === "completed") typeStats[et].activated++;
}

// Identify most/least activated types
var mostActivatedType = null;
var leastActivatedType = null;
var tsKeys = Object.keys(typeStats);
for (var tsi = 0; tsi < tsKeys.length; tsi++) {
  var tsKey = tsKeys[tsi];
  var tsVal = typeStats[tsKey];
  var tsRate = tsVal.total > 0 ? tsVal.activated / tsVal.total : 0;
  if (!mostActivatedType || tsRate > mostActivatedType.rate) {
    mostActivatedType = { type: tsKey, rate: Math.round(tsRate * 100), activated: tsVal.activated, total: tsVal.total };
  }
  if (!leastActivatedType || tsRate < leastActivatedType.rate) {
    leastActivatedType = { type: tsKey, rate: Math.round(tsRate * 100), activated: tsVal.activated, total: tsVal.total };
  }
}

// Enrich byFocus with feedback average ratings
if (feedbackInsights && feedbackInsights.ratingsByFocus) {
  for (var efi = 0; efi < byFocus.length; efi++) {
    var focusFb = feedbackInsights.ratingsByFocus[byFocus[efi].focusId];
    if (focusFb) {
      byFocus[efi].avgRating = focusFb.averageRating;
      byFocus[efi].feedbackCount = focusFb.count;
    }
  }
}

var result = {
  tool: "enso_sprint_results_progress",
  success: true,
  totalDeliverables: total,
  activated: completedCount,
  inProgress: inProgressCount,
  pending: pendingCount,
  skipped: skippedCount,
  completionPercent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
  byFocus: byFocus,
  records: recordsList,
  recommended: recommended,
  focusId: focusIdParam || null,
  typeStats: typeStats,
  mostActivatedType: mostActivatedType,
  leastActivatedType: leastActivatedType,
  feedback: feedbackInsights ? {
    totalFeedback: feedbackInsights.totalFeedback,
    averageRating: feedbackInsights.averageRating,
    ratingsByType: feedbackInsights.ratingsByType,
    trend: feedbackInsights.recentTrend,
    topSuggestions: feedbackInsights.topSuggestions ? feedbackInsights.topSuggestions.slice(0, 3) : []
  } : null
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

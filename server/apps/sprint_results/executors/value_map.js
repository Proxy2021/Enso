var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

// Load focus state
var focusState = null;
try {
  var focusResult = await ctx.readFile(focusPath);
  if (focusResult && typeof focusResult === "string") {
    focusState = JSON.parse(focusResult);
  } else if (focusResult && focusResult.success && focusResult.data) {
    focusState = typeof focusResult.data === "string" ? JSON.parse(focusResult.data) : focusResult.data;
  }
} catch(e) {}

if (!focusState || !focusState.areas || focusState.areas.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_value_map",
    success: false,
    error: "No focus areas found"
  }) }] };
}

// Load activation state from store
var activationState = await ctx.store.get("activation_state") || { version: 1, records: {} };

var areas = focusState.areas;

// Collect all deliverables across all focus areas
var painPointMap = [];
var focusSummaries = [];
var totalDeliverables = 0;
var totalActivated = 0;
var dormantCount = 0;

for (var ai = 0; ai < areas.length; ai++) {
  var area = areas[ai];
  var summary = area.lastSprintSummary;
  if (!summary || !summary.deliverables || summary.deliverables.length === 0) continue;

  var areaActivated = 0;
  var areaTotal = summary.deliverables.length;

  for (var di = 0; di < summary.deliverables.length; di++) {
    var d = summary.deliverables[di];
    totalDeliverables++;

    var activation = activationState.records[d.entityId];

    // Also check old status tracker as fallback
    var oldStatusMap = await ctx.store.get("status_" + area.id) || {};
    var oldStatus = oldStatusMap[d.entityId] || "new";

    var status = "pending";
    if (activation) {
      status = activation.status;
    } else if (oldStatus === "acted_on") {
      status = "completed";
    }

    if (status === "completed") { totalActivated++; areaActivated++; }
    if (status === "pending") { dormantCount++; }

    var stepsCompleted = 0;
    var stepsTotal = 0;
    if (activation && activation.steps) {
      stepsTotal = activation.steps.length;
      for (var si = 0; si < activation.steps.length; si++) {
        if (activation.steps[si].completed) stepsCompleted++;
      }
    }

    // Group by pain point + focus area
    var painKey = (d.painPoint || "General") + "|" + area.id;
    var group = null;
    for (var pi = 0; pi < painPointMap.length; pi++) {
      if ((painPointMap[pi].painPoint + "|" + painPointMap[pi].focusId) === painKey) {
        group = painPointMap[pi];
        break;
      }
    }
    if (!group) {
      group = {
        painPoint: d.painPoint || "General",
        focusId: area.id,
        focusTitle: area.title || area.id,
        deliverables: []
      };
      painPointMap.push(group);
    }

    group.deliverables.push({
      taskTitle: d.taskTitle || "Untitled",
      entityType: d.entityType || "synthesis",
      entityId: d.entityId,
      howItHelps: d.howItHelps || "",
      quickStart: d.quickStart || "",
      actionType: d.actionType || "review",
      status: status,
      stepsCompleted: stepsCompleted,
      stepsTotal: stepsTotal
    });
  }

  var areaProgress = 0;
  var areaUnderstanding = 0;
  if (area.assessment) {
    areaProgress = area.assessment.progress || 0;
    areaUnderstanding = area.assessment.understanding || 0;
  }

  focusSummaries.push({
    focusId: area.id,
    focusTitle: area.title || area.id,
    lastSprintDate: area.lastSprintDate || null,
    deliverableCount: areaTotal,
    activatedCount: areaActivated,
    activationPercent: areaTotal > 0 ? Math.round((areaActivated / areaTotal) * 100) : 0,
    progress: areaProgress,
    understanding: areaUnderstanding
  });
}

// Sort pain points by number of deliverables (most addressed first)
painPointMap.sort(function(a, b) { return b.deliverables.length - a.deliverables.length; });

// Sort focus summaries by deliverable count
focusSummaries.sort(function(a, b) { return b.deliverableCount - a.deliverableCount; });

var result = {
  tool: "enso_sprint_results_value_map",
  success: true,
  totalFocusAreas: focusSummaries.length,
  totalDeliverables: totalDeliverables,
  totalActivated: totalActivated,
  activationPercent: totalDeliverables > 0 ? Math.round((totalActivated / totalDeliverables) * 100) : 0,
  dormantCount: dormantCount,
  painPointMap: painPointMap,
  focusSummaries: focusSummaries
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

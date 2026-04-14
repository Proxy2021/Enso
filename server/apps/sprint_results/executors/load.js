var focusId = (params.focusId || "").trim();
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
    tool: "enso_sprint_results_load",
    error: true,
    message: "No focus areas found. Start by creating focus areas in Enso.",
    focusTitle: "No Focus Areas",
    deliverables: [],
    nextSteps: [],
    allFocusAreas: []
  }) }] };
}

var areas = focusState.areas;

// Build focus area list for the selector
var allFocusAreas = [];
for (var ai = 0; ai < areas.length; ai++) {
  var a = areas[ai];
  allFocusAreas.push({
    id: a.id || ("focus-" + ai),
    title: a.title || "Untitled",
    hasSprint: !!(a.lastSprintSummary || a.lastSprintResults),
    lastSprintDate: a.lastSprintDate || null,
    cycleCount: a.cycleCount || 0
  });
}

// Find target area: by focusId, or the one with the most recent sprint
var targetArea = null;
if (focusId) {
  for (var fi = 0; fi < areas.length; fi++) {
    if (areas[fi].id === focusId) { targetArea = areas[fi]; break; }
  }
} else {
  // Find area with most recent sprint
  var latestDate = 0;
  for (var li = 0; li < areas.length; li++) {
    var areaDate = areas[li].lastSprintDate ? new Date(areas[li].lastSprintDate).getTime() : 0;
    if ((areas[li].lastSprintSummary || areas[li].lastSprintResults) && areaDate > latestDate) {
      latestDate = areaDate;
      targetArea = areas[li];
    }
  }
}

if (!targetArea) {
  // Fallback to first area
  targetArea = areas[0];
}

var areaId = targetArea.id || "focus-0";
var areaTitle = targetArea.title || "Untitled Focus Area";

// Load status tracking from store
var statusMap = await ctx.store.get("status_" + areaId) || {};

// Extract sprint summary data
var summary = targetArea.lastSprintSummary;
var sprintDate = targetArea.lastSprintDate || null;
var cycleCount = targetArea.cycleCount || 0;

// Count related entities
var entityCount = 0;
if (targetArea.relatedEntityIds && Array.isArray(targetArea.relatedEntityIds)) {
  entityCount = targetArea.relatedEntityIds.length;
}

// Build deliverables list
var deliverables = [];
var sprintSummaryText = "";
var recommendedFirstAction = null;
var nextSteps = [];

if (summary && summary.deliverables) {
  sprintSummaryText = summary.sprintSummary || "";
  recommendedFirstAction = summary.recommendedFirstAction || null;
  nextSteps = summary.nextSteps || [];

  for (var di = 0; di < summary.deliverables.length; di++) {
    var del = summary.deliverables[di];
    var entId = del.entityId || ("deliverable-" + di);
    deliverables.push({
      taskTitle: del.taskTitle || "Untitled Deliverable",
      entityType: del.entityType || "synthesis",
      entityId: entId,
      painPoint: del.painPoint || "",
      howItHelps: del.howItHelps || "",
      quickStart: del.quickStart || "",
      actionType: del.actionType || "review",
      status: statusMap[entId] || "new"
    });
  }
} else if (targetArea.lastSprintResults) {
  // Fallback: parse raw text results
  sprintSummaryText = targetArea.lastSprintResults;
  nextSteps = ["Review the raw sprint results above", "Start a new evolution cycle to get structured deliverables"];
}

// ── Contextual Next Actions ──
// Derive typed, semantic action suggestions from each deliverable's content.
// Rules:
//   idea       → research (gap in understanding) + optional design (Enso-specific)
//   app        → experiment (validate before extending) + implement (next feature)
//   article    → apply (concrete use of insights this week)
//   synthesis  → extract patterns (inform next sprint direction)
// Sprint summary text is also scanned for AI/agent domain keywords to add meta-research actions.
var contextualActions = [];

if (deliverables.length > 0) {
  var researchKw = ["research","explore","pattern","approach","mechanism","technique","investigate","analyze","study","understand"];
  var implementKw = ["implement","build","code","integrate","add","create","develop","extend","configure","connect"];
  var experimentKw = ["test","experiment","try","evaluate","benchmark","prototype","validate","measure","compare"];
  var designKw = ["design","architecture","strategy","framework","structure","model","schema","plan","organize"];

  function kwScore(text, kws) {
    var lower = text.toLowerCase();
    var score = 0;
    for (var k = 0; k < kws.length; k++) if (lower.indexOf(kws[k]) !== -1) score++;
    return score;
  }

  function extractPhrase(text, fallback) {
    var patterns = [
      /for\s+([a-zA-Z][^,\.;\n]{3,40})/,
      /about\s+([a-zA-Z][^,\.;\n]{3,40})/,
      /([a-zA-Z][^,\.;\n]{3,35})\s+(?:pattern|approach|technique|mechanism)/i,
      /([a-zA-Z][^,\.;\n]{3,35})\s+(?:integration|implementation|architecture)/i
    ];
    for (var p = 0; p < patterns.length; p++) {
      var m = text.match(patterns[p]);
      if (m && m[1] && m[1].trim().length > 3 && m[1].trim().length < 55) return m[1].trim();
    }
    return fallback;
  }

  var seenLabels = {};

  function pushAction(type, label, reason, delId, delTitle, priority) {
    if (seenLabels[label]) return;
    seenLabels[label] = true;
    contextualActions.push({ type: type, label: label, reason: reason,
      deliverableId: delId || null, deliverableTitle: delTitle || null, priority: priority || 2 });
  }

  for (var cai = 0; cai < deliverables.length; cai++) {
    var cad = deliverables[cai];
    var combined = cad.taskTitle + " " + cad.painPoint + " " + cad.howItHelps + " " + cad.quickStart;
    var isEnsoRelated = (areaTitle.toLowerCase().indexOf("enso") !== -1) ||
                        (combined.toLowerCase().indexOf("enso") !== -1);

    if (cad.entityType === "idea") {
      var topic = extractPhrase(cad.howItHelps + " " + cad.painPoint, cad.taskTitle);
      pushAction("research", "Research: " + topic,
        "'" + cad.taskTitle + "' is still conceptual — deepen understanding before committing to an implementation path.",
        cad.entityId, cad.taskTitle, 1);
      if (isEnsoRelated) {
        pushAction("design", "Design: " + cad.taskTitle.replace(/\b(idea|concept)\b/gi,"").trim() + " architecture",
          "Translate this idea into concrete interfaces, data flow, and integration points within Enso.",
          cad.entityId, cad.taskTitle, 2);
      }
    } else if (cad.entityType === "app") {
      var qs = cad.quickStart ? cad.quickStart.split(/[.!?]/)[0].trim() : "Test " + cad.taskTitle + " on real data";
      pushAction("experiment", "Experiment: " + qs,
        "Validate '" + cad.taskTitle + "' against your real workflow before investing in new features.",
        cad.entityId, cad.taskTitle, 1);
      pushAction("implement", "Extend: " + cad.taskTitle + " — add next highest-value feature",
        "The app is running. Surface what's missing via actual use, then implement one focused extension.",
        cad.entityId, cad.taskTitle, 3);
    } else if (cad.entityType === "article") {
      var insight = extractPhrase(cad.howItHelps, cad.taskTitle + " insights");
      pushAction("apply", "Apply: " + insight + " to current project",
        "Take one concrete finding from '" + cad.taskTitle + "' and apply it this week — don't let it stay theoretical.",
        cad.entityId, cad.taskTitle, 2);
    } else { // synthesis
      pushAction("extract", "Extract patterns from: " + cad.taskTitle,
        "Review this synthesis for recurring themes that could sharpen the direction of the next sprint.",
        cad.entityId, cad.taskTitle, 2);
    }
  }

  // Scan sprint summary text for AI/agent domain keywords → add meta-research actions
  // These are the cross-cutting topics that signal where Enso needs deeper capability work.
  var domainPatterns = [
    /\b(activation steering)\b/gi, /\b(context retrieval)\b/gi, /\b(memory (?:graph|layer|system))\b/gi,
    /\b(embedding(?:\s+\w+)?)\b/gi, /\b(agent routing)\b/gi, /\b(LLM (?:signal|pattern|output))\b/gi,
    /\b(proactive (?:trigger|action|message))\b/gi, /\b(vector (?:store|search|index))\b/gi,
    /\b(few-shot (?:prompt|example))\b/gi, /\b(RAG (?:pipeline|pattern))\b/gi
  ];
  if (sprintSummaryText) {
    var metaSeen = {};
    for (var dp = 0; dp < domainPatterns.length; dp++) {
      var dm = sprintSummaryText.match(domainPatterns[dp]);
      if (dm) {
        for (var dmi = 0; dmi < Math.min(dm.length, 1); dmi++) {
          var mt = dm[dmi].trim();
          if (!metaSeen[mt]) {
            metaSeen[mt] = true;
            pushAction("research", "Research: " + mt,
              "Sprint synthesis mentions '" + mt + "' — a deep-dive will directly inform Enso's next capability improvement.",
              null, null, 1);
          }
        }
      }
    }
  }

  // Sort by priority (lower number = show first)
  contextualActions.sort(function(a, b) { return a.priority - b.priority; });
}

var result = {
  tool: "enso_sprint_results_load",
  focusId: areaId,
  focusTitle: areaTitle,
  sprintDate: sprintDate,
  cycleCount: cycleCount,
  entityCount: entityCount,
  sprintSummary: sprintSummaryText,
  deliverables: deliverables,
  recommendedFirstAction: recommendedFirstAction,
  nextSteps: nextSteps,
  contextualActions: contextualActions,
  allFocusAreas: allFocusAreas,
  hasStructuredResults: !!(summary && summary.deliverables),
  phase: targetArea.phase || "unknown"
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

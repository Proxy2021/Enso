var focusId = (params.focusId || "").trim();
var entityId = (params.entityId || "").trim();
var completeStep = params.completeStep;

if (!focusId || !entityId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_activate",
    success: false,
    error: "Missing required parameters: focusId and entityId"
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

// Load activation state from store
var activationState = await ctx.store.get("activation_state") || { version: 1, records: {} };
var record = activationState.records[entityId] || null;

// ── Completing a step on an existing record ──
if (typeof completeStep === "number" && record) {
  var step = record.steps[completeStep];
  if (step && !step.completed) {
    step.completed = true;
    step.completedAt = new Date().toISOString();
  }

  // Check if all steps complete
  var allDone = true;
  for (var ci = 0; ci < record.steps.length; ci++) {
    if (!record.steps[ci].completed) { allDone = false; break; }
  }
  if (allDone) {
    record.status = "completed";
    record.completedAt = new Date().toISOString();
  }

  activationState.records[entityId] = record;
  activationState.updatedAt = new Date().toISOString();
  await ctx.store.set("activation_state", activationState);

  // Also update mark_status
  var stKey = "status_" + record.focusId;
  var stMap = await ctx.store.get(stKey) || {};
  stMap[entityId] = "acted_on";
  await ctx.store.set(stKey, stMap);

  var completedCount = 0;
  for (var sc = 0; sc < record.steps.length; sc++) {
    if (record.steps[sc].completed) completedCount++;
  }
  var nextStepObj = null;
  for (var ns = 0; ns < record.steps.length; ns++) {
    if (!record.steps[ns].completed) { nextStepObj = record.steps[ns]; break; }
  }

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_activate",
    success: true,
    entityId: entityId,
    taskTitle: record.taskTitle,
    entityType: record.entityType,
    focusId: record.focusId,
    focusTitle: record.focusTitle || "",
    painPoint: record.painPoint,
    howItHelps: record.howItHelps,
    status: record.status,
    steps: record.steps,
    progress: { completed: completedCount, total: record.steps.length, percent: Math.round((completedCount / record.steps.length) * 100) },
    nextStep: nextStepObj ? nextStepObj.instruction : null,
    message: allDone
      ? "All steps completed! \"" + record.taskTitle + "\" is fully activated."
      : "Step " + completeStep + " completed. Next: " + (nextStepObj ? nextStepObj.instruction : "")
  }) }] };
}

// ── Load deliverable info from focus area sprint summary ──
var deliverable = null;
var focusTitle = "";
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
      var area = focusState.areas[ai];
      if (area.id === focusId) {
        focusTitle = area.title || "";
        if (area.lastSprintSummary && area.lastSprintSummary.deliverables) {
          for (var di = 0; di < area.lastSprintSummary.deliverables.length; di++) {
            var d = area.lastSprintSummary.deliverables[di];
            if (d.entityId === entityId) {
              deliverable = d;
              break;
            }
          }
        }
        break;
      }
    }
  }
} catch(e) {}

if (!deliverable && !record) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_activate",
    success: false,
    error: "Deliverable not found in sprint results or activation state"
  }) }] };
}

// ── Smart classifier (content-aware steps) with generic fallback ──
var classifier = null;
try {
  classifier = require("../apps/sprint_results/lib/deliverable-classifier.cjs");
} catch (e) {
  // Classifier not available — will use generic fallback
}

function generateGenericSteps(entityType, quickStart, taskTitle) {
  var qs = quickStart || taskTitle;
  if (entityType === "app") {
    return [
      { stepIndex: 0, instruction: "Open and run the app: " + qs, completed: false },
      { stepIndex: 1, instruction: "Run it with real data to validate it works for your use case", completed: false },
      { stepIndex: 2, instruction: "Note what works and what needs adjustment", completed: false },
      { stepIndex: 3, instruction: "Integrate into your regular workflow or request improvements", completed: false }
    ];
  } else if (entityType === "article") {
    return [
      { stepIndex: 0, instruction: "Read the article: " + qs, completed: false },
      { stepIndex: 1, instruction: "Identify the top 2-3 insights most relevant to your situation", completed: false },
      { stepIndex: 2, instruction: "Apply at least one insight to a current task or decision", completed: false }
    ];
  } else if (entityType === "idea") {
    return [
      { stepIndex: 0, instruction: "Explore the idea: " + qs, completed: false },
      { stepIndex: 1, instruction: "Research one aspect that excites you most", completed: false },
      { stepIndex: 2, instruction: "Sketch a quick prototype or outline for how you'd use it", completed: false }
    ];
  } else {
    return [
      { stepIndex: 0, instruction: "Review the synthesis: " + qs, completed: false },
      { stepIndex: 1, instruction: "Extract the key patterns or frameworks", completed: false },
      { stepIndex: 2, instruction: "Cross-reference with your existing knowledge in Cortex", completed: false }
    ];
  }
}

/**
 * Generate steps using the smart classifier (reads wiki content, extracts
 * headings/bullets/action items, generates content-specific steps).
 * Falls back to generic templates on any error.
 */
async function generateSmartSteps(src) {
  if (!classifier) return null;
  try {
    var classification = await classifier.classifyDeliverable(ctx, {
      entityId: src.entityId || entityId,
      entityType: src.entityType || "synthesis",
      taskTitle: src.taskTitle || "Untitled",
      painPoint: src.painPoint || "",
      howItHelps: src.howItHelps || "",
      quickStart: src.quickStart || ""
    });
    if (!classification || !classification.activationSteps || classification.activationSteps.length === 0) {
      return null;
    }
    // Convert classifier output to step records with stepIndex
    var steps = [];
    for (var si = 0; si < classification.activationSteps.length; si++) {
      var cs = classification.activationSteps[si];
      steps.push({
        stepIndex: si,
        instruction: cs.instruction,
        context: cs.context || "",
        estimatedMinutes: cs.estimatedMinutes || 5,
        completed: false
      });
    }
    return {
      steps: steps,
      activationType: classification.activationType,
      contentSummary: classification.contentSummary,
      keyTopics: classification.keyTopics,
      relatedActions: classification.relatedActions
    };
  } catch (e) {
    return null;
  }
}

// ── Create or resume activation record ──
if (!record) {
  var src = deliverable;
  var smartResult = await generateSmartSteps(src);
  record = {
    entityId: entityId,
    focusId: focusId,
    focusTitle: focusTitle,
    sprintDate: new Date().toISOString(),
    taskTitle: src.taskTitle || "Untitled",
    entityType: src.entityType || "synthesis",
    painPoint: src.painPoint || "",
    howItHelps: src.howItHelps || "",
    quickStart: src.quickStart || "",
    actionType: src.actionType || "review",
    status: "in_progress",
    activatedAt: new Date().toISOString(),
    steps: smartResult ? smartResult.steps : generateGenericSteps(src.entityType || "synthesis", src.quickStart, src.taskTitle),
    activationType: smartResult ? smartResult.activationType : null,
    contentSummary: smartResult ? smartResult.contentSummary : null,
    keyTopics: smartResult ? smartResult.keyTopics : null,
    relatedActions: smartResult ? smartResult.relatedActions : null,
    classifiedByContent: !!smartResult
  };
  activationState.records[entityId] = record;
  activationState.updatedAt = new Date().toISOString();
  await ctx.store.set("activation_state", activationState);
} else if (record.status === "pending") {
  record.status = "in_progress";
  record.activatedAt = new Date().toISOString();
  if (!record.steps || record.steps.length === 0) {
    var smartPending = await generateSmartSteps(record);
    if (smartPending) {
      record.steps = smartPending.steps;
      record.activationType = smartPending.activationType;
      record.contentSummary = smartPending.contentSummary;
      record.keyTopics = smartPending.keyTopics;
      record.relatedActions = smartPending.relatedActions;
      record.classifiedByContent = true;
    } else {
      record.steps = generateGenericSteps(record.entityType || "synthesis", record.quickStart || "", record.taskTitle || "");
    }
  }
  activationState.records[entityId] = record;
  activationState.updatedAt = new Date().toISOString();
  await ctx.store.set("activation_state", activationState);
}

// Mark as acted_on in status tracker
var statusKey = "status_" + focusId;
var statusMap = await ctx.store.get(statusKey) || {};
if (!statusMap[entityId] || statusMap[entityId] !== "acted_on") {
  statusMap[entityId] = "acted_on";
  await ctx.store.set(statusKey, statusMap);
}

var doneCount = 0;
for (var dc = 0; dc < record.steps.length; dc++) {
  if (record.steps[dc].completed) doneCount++;
}
var nextStepItem = null;
for (var ni = 0; ni < record.steps.length; ni++) {
  if (!record.steps[ni].completed) { nextStepItem = record.steps[ni]; break; }
}

var result = {
  tool: "enso_sprint_results_activate",
  success: true,
  entityId: entityId,
  taskTitle: record.taskTitle,
  entityType: record.entityType,
  focusId: focusId,
  focusTitle: focusTitle,
  painPoint: record.painPoint,
  howItHelps: record.howItHelps,
  quickStart: record.quickStart || "",
  actionType: record.actionType || "review",
  status: record.status,
  steps: record.steps,
  progress: { completed: doneCount, total: record.steps.length, percent: Math.round((doneCount / record.steps.length) * 100) },
  nextStep: nextStepItem ? nextStepItem.instruction : null,
  nextStepContext: nextStepItem ? (nextStepItem.context || "") : "",
  activationType: record.activationType || null,
  contentSummary: record.contentSummary || null,
  keyTopics: record.keyTopics || null,
  relatedActions: record.relatedActions || null,
  classifiedByContent: record.classifiedByContent || false,
  message: record.status === "completed"
    ? "\"" + record.taskTitle + "\" is fully activated!"
    : "Activation started. First step: " + (nextStepItem ? nextStepItem.instruction : "")
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

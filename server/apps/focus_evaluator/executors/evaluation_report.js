var focusId = (params.focusId || "").trim();
if (!focusId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_evaluation_report",
    error: true,
    message: "focusId is required",
    focusId: "",
    focusTitle: "Unknown",
    findings: [],
    metrics: {},
    allAreas: []
  }) }] };
}

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
    tool: "enso_focus_evaluator_evaluation_report",
    error: true,
    message: "No focus areas found",
    focusId: focusId,
    focusTitle: "Unknown",
    findings: [],
    metrics: {},
    allAreas: []
  }) }] };
}

var allAreas = [];
var target = null;
for (var i = 0; i < focusState.areas.length; i++) {
  var a = focusState.areas[i];
  allAreas.push({ id: a.id, title: a.title });
  if (a.id === focusId) target = a;
}

if (!target) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_evaluation_report",
    error: true,
    message: "Focus area not found: " + focusId,
    focusId: focusId,
    focusTitle: "Unknown",
    findings: [],
    metrics: {},
    allAreas: allAreas
  }) }] };
}

var assess = target.assessment || {};
var history = target.assessmentHistory || [];
var now = Date.now();
var daysSinceCreation = Math.floor((now - new Date(target.createdAt).getTime()) / 86400000);
var lastActive = target.progress && target.progress.lastActiveAt ? new Date(target.progress.lastActiveAt).getTime() : now;
var daysSinceActivity = Math.floor((now - lastActive) / 86400000);

// Check if structured evaluation already exists
if (target.structuredEvaluation && target.structuredEvaluation.findings) {
  // Use existing structured evaluation
  var existing = target.structuredEvaluation;
  var result = {
    tool: "enso_focus_evaluator_evaluation_report",
    focusId: target.id,
    focusTitle: target.title,
    evaluatedAt: existing.evaluatedAt || new Date().toISOString(),
    findings: existing.findings,
    metrics: existing.metrics || {
      understanding: assess.understanding || 0,
      progress: assess.progress || 0,
      confidence: assess.confidence || 50,
      engagementScore: 0,
      cortexEntityCount: (target.relatedEntityIds || []).length,
      sprintCount: target.lastSprintSummary ? 1 : 0,
      daysSinceCreation: daysSinceCreation
    },
    delta: existing.delta || null,
    textBriefing: target.preparedBriefing || null,
    allAreas: allAreas
  };
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

// ── Generate findings from available data using LLM ──
var briefingText = target.preparedBriefing || "";
var contextParts = [];
contextParts.push("Focus Area: " + target.title);
contextParts.push("Type: " + (target.focusType || "general"));
contextParts.push("Status: " + target.status + " | Clarity: " + target.clarity);
contextParts.push("Understanding: " + (assess.understanding || 0) + "% | Progress: " + (assess.progress || 0) + "%");
contextParts.push("Days since creation: " + daysSinceCreation + " | Days since activity: " + daysSinceActivity);
contextParts.push("Activity trend: " + (target.progress ? target.progress.trend : "unknown"));
contextParts.push("Evidence sources: " + (target.evidence || []).length);
contextParts.push("Related entities: " + (target.relatedEntityIds || []).length);
contextParts.push("Has sprint results: " + (target.lastSprintSummary ? "yes" : "no"));
if (target.intent) contextParts.push("Intent: " + target.intent);
if (target.suggestedActions && target.suggestedActions.length > 0) {
  contextParts.push("Suggested actions: " + target.suggestedActions.join("; "));
}
if (target.nextSteps && target.nextSteps.length > 0) {
  contextParts.push("Next steps: " + target.nextSteps.join("; "));
}
if (briefingText) {
  contextParts.push("\nEvaluation Briefing:\n" + briefingText.substring(0, 2000));
}

var prompt = "Analyze this focus area and return ONLY a JSON array of 5-8 findings. Each finding must have: id (F1, F2...), category (strength|gap|risk|opportunity), title (5-10 words), detail (one sentence), impact (high|medium|low).\n\nContext:\n" + contextParts.join("\n") + "\n\nReturn ONLY the JSON array, no other text.";

var findings = [];
try {
  var llmResult = await ctx.ask(prompt);
  var llmText = "";
  if (llmResult && llmResult.ok && llmResult.text) llmText = llmResult.text;
  else if (llmResult && typeof llmResult === "object" && llmResult.text) llmText = llmResult.text;
  else if (typeof llmResult === "string") llmText = llmResult;

  // Extract JSON from response
  var jsonMatch = llmText.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    findings = JSON.parse(jsonMatch[0]);
  }
} catch(e) {
  // Fallback: generate findings heuristically
  findings = [];
  var fid = 1;

  if (assess.understanding > 50) {
    findings.push({ id: "F" + fid++, category: "strength", title: "Good understanding level achieved", detail: "Understanding at " + assess.understanding + "% indicates solid grasp of the domain.", impact: "medium" });
  } else if (assess.understanding < 30) {
    findings.push({ id: "F" + fid++, category: "gap", title: "Understanding still developing", detail: "Understanding at " + assess.understanding + "% — more research or evaluation cycles needed.", impact: "high" });
  }

  if (assess.progress > 40) {
    findings.push({ id: "F" + fid++, category: "strength", title: "Meaningful progress achieved", detail: "Progress at " + assess.progress + "% shows tangible advancement.", impact: "high" });
  } else {
    findings.push({ id: "F" + fid++, category: "gap", title: "Progress needs acceleration", detail: "Progress at " + assess.progress + "% — consider more sprint cycles or scope adjustment.", impact: "high" });
  }

  if (daysSinceActivity > 7) {
    findings.push({ id: "F" + fid++, category: "risk", title: "Extended period of inactivity", detail: daysSinceActivity + " days since last activity may indicate loss of momentum.", impact: "medium" });
  }

  if (target.evidence && target.evidence.length > 3) {
    findings.push({ id: "F" + fid++, category: "strength", title: "Rich evidence base", detail: target.evidence.length + " evidence sources provide strong foundation for assessment.", impact: "medium" });
  }

  if (target.clarity === "clear" && target.nextSteps && target.nextSteps.length > 0) {
    findings.push({ id: "F" + fid++, category: "opportunity", title: "Clear next steps defined", detail: target.nextSteps.length + " concrete actions ready to be executed.", impact: "high" });
  }

  if (!target.lastSprintSummary) {
    findings.push({ id: "F" + fid++, category: "gap", title: "No sprint deliverables yet", detail: "No evolution sprint has been completed — consider triggering one to generate actionable outputs.", impact: "medium" });
  }
}

// Compute metrics
var sprintCount = 0;
if (target.lastSprintSummary) sprintCount = 1;
if (history.length > 0) {
  for (var hi = 0; hi < history.length; hi++) {
    if (history[hi].trigger === "post-sprint") sprintCount++;
  }
}

var metrics = {
  understanding: assess.understanding || 0,
  progress: assess.progress || 0,
  confidence: assess.confidence || 50,
  engagementScore: 0,
  cortexEntityCount: (target.relatedEntityIds || []).length,
  sprintCount: sprintCount,
  daysSinceCreation: daysSinceCreation
};

// Compute delta from evaluation history if available
var delta = null;
if (target.evaluationHistory && target.evaluationHistory.length > 0) {
  var prevEval = target.evaluationHistory[target.evaluationHistory.length - 1];
  var prevFindings = prevEval.findings || [];
  var prevMetrics = prevEval.metrics || {};

  var currentTitles = {};
  for (var ci = 0; ci < findings.length; ci++) currentTitles[findings[ci].title] = findings[ci].id;
  var prevTitles = {};
  for (var pi = 0; pi < prevFindings.length; pi++) prevTitles[prevFindings[pi].title] = prevFindings[pi].id;

  var added = [];
  for (var ct in currentTitles) {
    if (!prevTitles[ct]) added.push(currentTitles[ct]);
  }
  var resolved = [];
  for (var pt in prevTitles) {
    if (!currentTitles[pt]) resolved.push(pt);
  }

  var metricsChange = {};
  var metricKeys = ["understanding", "progress", "confidence", "engagementScore"];
  for (var mk = 0; mk < metricKeys.length; mk++) {
    var k = metricKeys[mk];
    if (metrics[k] !== undefined && prevMetrics[k] !== undefined) {
      metricsChange[k] = metrics[k] - prevMetrics[k];
    }
  }

  var changeParts = [];
  if (added.length > 0) changeParts.push(added.length + " new findings");
  if (resolved.length > 0) changeParts.push(resolved.length + " findings resolved");
  if (metricsChange.progress) changeParts.push("progress " + (metricsChange.progress >= 0 ? "+" : "") + metricsChange.progress + "%");
  if (metricsChange.understanding) changeParts.push("understanding " + (metricsChange.understanding >= 0 ? "+" : "") + metricsChange.understanding + "%");

  delta = {
    findingsAdded: added,
    findingsResolved: resolved,
    metricsChange: metricsChange,
    summary: changeParts.length > 0 ? "Since last evaluation: " + changeParts.join(", ") : "No significant changes since last evaluation"
  };
}

var result = {
  tool: "enso_focus_evaluator_evaluation_report",
  focusId: target.id,
  focusTitle: target.title,
  evaluatedAt: new Date().toISOString(),
  findings: findings,
  metrics: metrics,
  delta: delta,
  textBriefing: briefingText || null,
  allAreas: allAreas
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

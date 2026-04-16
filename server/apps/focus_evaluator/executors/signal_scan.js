var focusId = (params.focusId || "").trim();
var periodDays = params.periodDays || 14;

if (!focusId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_signal_scan",
    error: true,
    message: "focusId is required",
    focusId: "",
    focusTitle: "Unknown",
    periodDays: periodDays,
    engagementScore: 0,
    breakdown: {},
    summary: "",
    allAreas: []
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";
var entityIndexPath = homeDir + "/.enso/wiki/entity-index.json";

var focusState = null;
try {
  var raw = await ctx.readFile(focusPath);
  if (raw && typeof raw === "string") focusState = JSON.parse(raw);
  else if (raw && raw.success && raw.data) focusState = typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
} catch(e) {}

if (!focusState || !focusState.areas) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_focus_evaluator_signal_scan",
    error: true,
    message: "No focus areas found",
    focusId: focusId,
    focusTitle: "Unknown",
    periodDays: periodDays,
    engagementScore: 0,
    breakdown: {},
    summary: "",
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
    tool: "enso_focus_evaluator_signal_scan",
    error: true,
    message: "Focus area not found: " + focusId,
    focusId: focusId,
    focusTitle: "Unknown",
    periodDays: periodDays,
    engagementScore: 0,
    breakdown: {},
    summary: "",
    allAreas: allAreas
  }) }] };
}

var now = Date.now();
var periodMs = periodDays * 86400000;
var cutoff = now - periodMs;
var isProject = target.focusType === "project";

// ── Signal 1: Cortex Growth (25%) ──
var cortexCount = 0;
try {
  var entityRaw = await ctx.readFile(entityIndexPath);
  var entityIndex = null;
  if (entityRaw && typeof entityRaw === "string") entityIndex = JSON.parse(entityRaw);
  else if (entityRaw && entityRaw.success && entityRaw.data) entityIndex = typeof entityRaw.data === "string" ? JSON.parse(entityRaw.data) : entityRaw.data;

  if (entityIndex && entityIndex.entities) {
    var tags = target.semanticTags || [];
    var entities = entityIndex.entities;
    for (var ei = 0; ei < entities.length; ei++) {
      var ent = entities[ei];
      var entTime = ent.createdAt ? new Date(ent.createdAt).getTime() : 0;
      if (entTime < cutoff) continue;

      // Match by semantic tags or related entity IDs
      var matched = false;
      if (target.relatedEntityIds && target.relatedEntityIds.indexOf(ent.id) !== -1) matched = true;
      if (!matched && ent.tags) {
        for (var ti = 0; ti < tags.length; ti++) {
          if (ent.tags.indexOf(tags[ti]) !== -1) { matched = true; break; }
        }
      }
      if (matched) cortexCount++;
    }
  }
} catch(e) {}
var cortexScore = cortexCount === 0 ? 0 : cortexCount <= 2 ? 30 : cortexCount <= 5 ? 60 : 90;

// ── Signal 2: Git Velocity (20%, project only) ──
var gitCommits = 0;
var gitScore = 0;
if (isProject && target.codebasePath) {
  try {
    var gitResult = await ctx.callTool("enso_shell_execute", {
      command: "git -C \"" + target.codebasePath.replace(/\\/g, "/") + "\" log --since=\"" + periodDays + " days ago\" --oneline 2>/dev/null | wc -l"
    });
    if (gitResult && gitResult.success && gitResult.data) {
      var gitText = typeof gitResult.data === "string" ? gitResult.data : (gitResult.data.output || "");
      gitCommits = parseInt(gitText.trim()) || 0;
    }
  } catch(e) {}
  gitScore = gitCommits === 0 ? 0 : gitCommits <= 5 ? 30 : gitCommits <= 15 ? 60 : 90;
}

// ── Signal 3: Content Creation (15%) ──
var contentCount = 0;
if (target.relatedEntityIds && target.relatedEntityIds.length > 0) {
  contentCount = target.relatedEntityIds.length;
}
var contentScore = contentCount === 0 ? 0 : contentCount === 1 ? 40 : contentCount <= 3 ? 70 : 90;

// ── Signal 4: Refinement Activity (proxy for conversation depth, 10%) ──
var recentRefinements = 0;
if (target.refinements) {
  for (var ri = 0; ri < target.refinements.length; ri++) {
    var refTime = new Date(target.refinements[ri].date).getTime();
    if (refTime >= cutoff) recentRefinements++;
  }
}
var convScore = recentRefinements === 0 ? 0 : recentRefinements <= 2 ? 30 : recentRefinements <= 5 ? 60 : 80;
var wordCount = recentRefinements * 150; // estimate

// ── Signal 5: Sprint Deliverable Activation (10%) ──
var activatedCount = 0;
var totalDeliverables = 0;
if (target.lastSprintSummary && target.lastSprintSummary.deliverables) {
  var dels = target.lastSprintSummary.deliverables;
  totalDeliverables = dels.length;
  // Check status from store
  try {
    var statusMap = await ctx.store.get("sprint_status_" + target.id) || {};
    for (var si = 0; si < dels.length; si++) {
      if (statusMap[dels[si].entityId] === "acted_on" || statusMap[dels[si].entityId] === "completed") {
        activatedCount++;
      }
    }
  } catch(e) {}
}
var activationScore = totalDeliverables === 0 ? 0 :
  (activatedCount / totalDeliverables) >= 0.75 ? 90 :
  (activatedCount / totalDeliverables) >= 0.5 ? 70 :
  (activatedCount / totalDeliverables) >= 0.25 ? 40 : 0;

// ── Signal 6: Evidence & Knowledge Depth (15%) ──
var evidenceCount = target.evidence ? target.evidence.length : 0;
var evidenceScore = evidenceCount === 0 ? 0 : evidenceCount <= 2 ? 30 : evidenceCount <= 5 ? 60 : 85;

// ── Compute weighted engagement score ──
var weights = {};
if (isProject) {
  weights = { cortex: 0.25, git: 0.20, content: 0.15, conv: 0.10, activation: 0.10, evidence: 0.20 };
} else {
  // Non-project: redistribute git weight
  weights = { cortex: 0.30, git: 0, content: 0.20, conv: 0.15, activation: 0.10, evidence: 0.25 };
}

var engagementScore = Math.round(
  cortexScore * weights.cortex +
  gitScore * weights.git +
  contentScore * weights.content +
  convScore * weights.conv +
  activationScore * weights.activation +
  evidenceScore * weights.evidence
);

// Build summary text
var summaryParts = [];
if (cortexCount > 0) summaryParts.push(cortexCount + " Cortex entities linked");
if (gitCommits > 0) summaryParts.push(gitCommits + " git commits");
if (contentCount > 0) summaryParts.push(contentCount + " related content items");
if (recentRefinements > 0) summaryParts.push(recentRefinements + " recent refinements");
if (activatedCount > 0) summaryParts.push(activatedCount + "/" + totalDeliverables + " deliverables activated");
if (evidenceCount > 0) summaryParts.push(evidenceCount + " evidence sources");

var summaryText = engagementScore >= 70 ? "Strong engagement: " :
  engagementScore >= 40 ? "Moderate engagement: " : "Low engagement: ";
summaryText += summaryParts.length > 0 ? summaryParts.join(", ") + "." : "Limited activity signals detected.";

var result = {
  tool: "enso_focus_evaluator_signal_scan",
  focusId: target.id,
  focusTitle: target.title,
  periodDays: periodDays,
  engagementScore: engagementScore,
  breakdown: {
    cortexGrowth: { count: cortexCount, score: cortexScore, weight: Math.round(weights.cortex * 100) },
    gitVelocity: isProject ? { commits: gitCommits, score: gitScore, weight: Math.round(weights.git * 100) } : null,
    contentCreation: { count: contentCount, score: contentScore, weight: Math.round(weights.content * 100) },
    conversationDepth: { wordCount: wordCount, score: convScore, weight: Math.round(weights.conv * 100) },
    deliverableActivation: { activated: activatedCount, total: totalDeliverables, score: activationScore, weight: Math.round(weights.activation * 100) },
    evidenceDepth: { count: evidenceCount, score: evidenceScore, weight: Math.round(weights.evidence * 100) }
  },
  summary: summaryText,
  allAreas: allAreas
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

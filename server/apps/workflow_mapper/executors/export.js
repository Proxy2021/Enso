// Export workflow map, integration analysis, and automation plan as a report
var format = (params.format || "summary").toLowerCase();
var tools = (await ctx.store.get("tools")) || [];
var workflows = (await ctx.store.get("workflows")) || [];
var automations = (await ctx.store.get("automations")) || [];

// Compute stats
var totalDailyMinutes = 0;
var allFriction = [];
for (var w = 0; w < workflows.length; w++) {
  var steps = workflows[w].steps || [];
  for (var s = 0; s < steps.length; s++) {
    totalDailyMinutes += steps[s].minutes || 0;
    if (steps[s].friction) {
      allFriction.push({ workflow: workflows[w].name, step: steps[s].label, friction: steps[s].friction });
    }
  }
}

// Tools by category
var toolsByCategory = {};
for (var t = 0; t < tools.length; t++) {
  var cat = tools[t].category || "Other";
  toolsByCategory[cat] = (toolsByCategory[cat] || 0) + 1;
}

// Automations by priority
var automationsByPriority = {};
for (var a = 0; a < automations.length; a++) {
  var prio = automations[a].priority || "medium";
  automationsByPriority[prio] = (automationsByPriority[prio] || 0) + 1;
}

// Integration score
var score = 0;
if (tools.length > 0) score += Math.min(30, tools.length * 6);
if (workflows.length > 0) score += Math.min(30, workflows.length * 10);
if (automations.length > 0) score += Math.min(20, automations.length * 5);
if (allFriction.length > 0) score += Math.min(20, allFriction.length * 4);
score = Math.min(100, score);

// Estimate time savings (rough: 15% of total daily time + 5 min per automation)
var potentialTimeSaved = Math.round(totalDailyMinutes * 0.15) + (automations.length * 5);

// Top opportunities based on pain points
var topOpportunities = [];
for (var f = 0; f < allFriction.length && topOpportunities.length < 5; f++) {
  topOpportunities.push({
    title: "Fix: " + allFriction[f].friction,
    impact: topOpportunities.length < 2 ? "high" : "medium",
    source: allFriction[f].workflow + " → " + allFriction[f].step,
    timeSaved: Math.round(5 + Math.random() * 10)
  });
}

var profile = {
  toolCount: tools.length,
  workflowCount: workflows.length,
  automationCount: automations.length,
  integrationScore: score,
  totalDailyMinutes: totalDailyMinutes,
  potentialTimeSaved: potentialTimeSaved,
  topOpportunities: topOpportunities,
  toolsByCategory: toolsByCategory,
  automationsByPriority: automationsByPriority,
  frictionPoints: allFriction
};

if (format === "detailed" || format === "json") {
  profile.tools = tools;
  profile.workflows = workflows.map(function(ww) {
    return { id: ww.id, name: ww.name, steps: ww.steps, createdAt: ww.createdAt };
  });
  profile.automations = automations;
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_workflow_mapper_export",
  format: format,
  profile: profile,
  exportedAt: new Date().toISOString()
}) }] };

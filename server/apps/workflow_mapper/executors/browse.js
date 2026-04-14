// Browse workflow profile: tool inventory, workflows, automations, integration score
var tools = (await ctx.store.get("tools")) || [];
var workflows = (await ctx.store.get("workflows")) || [];
var automations = (await ctx.store.get("automations")) || [];

// Compute integration score based on coverage
var score = 0;
var maxScore = 100;
if (tools.length > 0) score += Math.min(30, tools.length * 6);
if (workflows.length > 0) score += Math.min(30, workflows.length * 10);
if (automations.length > 0) score += Math.min(20, automations.length * 5);
// Bonus for friction points identified (shows engagement)
var frictionCount = 0;
for (var i = 0; i < workflows.length; i++) {
  var steps = workflows[i].steps || [];
  for (var j = 0; j < steps.length; j++) {
    if (steps[j].friction) frictionCount++;
  }
}
if (frictionCount > 0) score += Math.min(20, frictionCount * 4);
score = Math.min(maxScore, score);

// Build summary workflows
var workflowSummaries = workflows.map(function(w) {
  var totalMin = 0;
  var frictions = 0;
  var wSteps = w.steps || [];
  for (var k = 0; k < wSteps.length; k++) {
    totalMin += wSteps[k].minutes || 0;
    if (wSteps[k].friction) frictions++;
  }
  return {
    id: w.id,
    name: w.name,
    stepCount: wSteps.length,
    totalMinutes: totalMin,
    frictionPoints: frictions,
    createdAt: w.createdAt
  };
});

// Build summary automations
var automationSummaries = automations.map(function(a) {
  return {
    id: a.id,
    trigger: a.trigger,
    triggerTool: a.triggerTool,
    action: a.action,
    priority: a.priority,
    status: a.status || "planned"
  };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_workflow_mapper_browse",
      toolCount: tools.length,
      workflowCount: workflows.length,
      automationCount: automations.length,
      integrationScore: score,
      tools: tools,
      workflows: workflowSummaries,
      automations: automationSummaries
    })
  }]
};

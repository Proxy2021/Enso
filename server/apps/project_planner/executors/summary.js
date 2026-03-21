var planId = (params.planId || "").trim();
if (!planId) planId = await ctx.store.get("latest_plan_id") || "";

if (!planId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_project_planner_summary",
        error: "No plan found. Create a plan first."
      })
    }]
  };
}

var raw = await ctx.store.get(planId);
var plan = {};
try { plan = JSON.parse(raw || "{}"); } catch(e) { plan = {}; }

var milestones = plan.milestones || [];
var phases = plan.phases || [];

var totalMilestones = milestones.length;
var totalDeliverables = 0;
var completedMilestones = 0;
var risksCount = (plan.risks || []).length;

for (var i = 0; i < milestones.length; i++) {
  totalDeliverables += (milestones[i].deliverables || []).length;
  if ((milestones[i].status || "") === "Complete") completedMilestones++;
}

var completionPct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

var phaseBreakdown = [];
for (var p = 0; p < phases.length; p++) {
  var phaseId = phases[p].id || "";
  var phaseLabel = phases[p].label || phaseId;
  var pMilestones = milestones.filter(function(m) { return (m.phase || "") === phaseId; });
  var pDeliverables = 0;
  var pCompleted = 0;
  var pInProgress = 0;
  for (var j = 0; j < pMilestones.length; j++) {
    pDeliverables += (pMilestones[j].deliverables || []).length;
    if ((pMilestones[j].status || "") === "Complete") pCompleted++;
    if ((pMilestones[j].status || "") === "In Progress") pInProgress++;
  }
  var pStatus = pCompleted === pMilestones.length && pMilestones.length > 0 ? "Complete" : pInProgress > 0 || pCompleted > 0 ? "In Progress" : "Planned";
  phaseBreakdown.push({
    phase: phaseLabel,
    milestones: pMilestones.length,
    deliverables: pDeliverables,
    completed: pCompleted,
    status: pStatus
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_project_planner_summary",
      planId: planId,
      stats: {
        totalMilestones: totalMilestones,
        totalDeliverables: totalDeliverables,
        completedMilestones: completedMilestones,
        risksCount: risksCount,
        completionPct: completionPct
      },
      phaseBreakdown: phaseBreakdown
    })
  }]
};
var planId = (params.planId || "").trim();
if (!planId) {
  planId = await ctx.store.get("latest_plan_id") || "";
}

if (!planId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_project_planner_timeline",
        error: "No plan found. Create a plan first."
      })
    }]
  };
}

var raw = await ctx.store.get(planId);
var plan = {};
try { plan = JSON.parse(raw || "{}"); } catch(e) { plan = {}; }

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_project_planner_timeline",
      planId: planId,
      planName: plan.planName || "Project Plan",
      totalDays: plan.totalDays || 90,
      phases: plan.phases || [],
      milestones: plan.milestones || []
    })
  }]
};
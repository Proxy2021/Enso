var planId = (params.planId || "").trim();
if (!planId) planId = await ctx.store.get("latest_plan_id") || "";

if (!planId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_project_planner_risks",
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
      tool: "enso_project_planner_risks",
      planId: planId,
      risks: plan.risks || []
    })
  }]
};
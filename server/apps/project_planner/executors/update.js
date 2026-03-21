var planId = (params.planId || "").trim();
if (!planId) planId = await ctx.store.get("latest_plan_id") || "";

if (!planId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_project_planner_update",
        error: "No plan found. Create a plan first."
      })
    }]
  };
}

var raw = await ctx.store.get(planId);
var plan = {};
try { plan = JSON.parse(raw || "{}"); } catch(e) { plan = {}; }

var milestoneId = (params.milestoneId || "").trim();
var newStatus = (params.status || "").trim() || "In Progress";
var itemName = "";

var milestones = plan.milestones || [];
for (var i = 0; i < milestones.length; i++) {
  if ((milestones[i].id || "") === milestoneId) {
    milestones[i].status = newStatus;
    itemName = milestones[i].name || "Milestone";
    if (newStatus === "Complete") {
      var deliverables = milestones[i].deliverables || [];
      for (var j = 0; j < deliverables.length; j++) {
        deliverables[j].status = "Complete";
      }
    }
    break;
  }
}

plan.milestones = milestones;
await ctx.store.set(planId, JSON.stringify(plan));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_project_planner_update",
      planId: planId,
      milestoneId: milestoneId,
      itemName: itemName,
      newStatus: newStatus
    })
  }]
};
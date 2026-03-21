var planId = (params.planId || "").trim();
if (!planId) planId = await ctx.store.get("latest_plan_id") || "";

if (!planId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_project_planner_add_milestone",
        error: "No plan found. Create a plan first."
      })
    }]
  };
}

var raw = await ctx.store.get(planId);
var plan = {};
try { plan = JSON.parse(raw || "{}"); } catch(e) { plan = {}; }

var milestones = plan.milestones || [];
var newId = "m" + (milestones.length + 1);
var name = (params.name || "").trim() || "New Milestone";
var phase = (params.phase || "").trim();
var dayRange = (params.dayRange || "").trim() || "TBD";
var owner = (params.owner || "").trim() || "Unassigned";
var deliverablesStr = (params.deliverables || "").trim();

var deliverables = [];
if (deliverablesStr) {
  var parts = deliverablesStr.split(",");
  for (var i = 0; i < parts.length; i++) {
    var title = (parts[i] || "").trim();
    if (title) {
      deliverables.push({ title: title, owner: owner, day: 0 });
    }
  }
}

var milestone = {
  id: newId,
  phase: phase,
  name: name,
  dayRange: dayRange,
  owner: owner,
  status: "Planned",
  deliverables: deliverables
};

milestones.push(milestone);
plan.milestones = milestones;

await ctx.store.set(planId, JSON.stringify(plan));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_project_planner_add_milestone",
      planId: planId,
      milestone: milestone
    })
  }]
};
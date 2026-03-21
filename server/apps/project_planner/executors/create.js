var topic = (params.topic || "").trim() || "project plan";
var duration = params.duration || 90;
var teamsStr = (params.teams || "").trim();

var prompt = "Create a detailed project plan for: " + topic + ".\n" +
  "Duration: " + duration + " days.\n" +
  (teamsStr ? "Teams/owners to assign: " + teamsStr + ".\n" : "") +
  "Return a JSON object with this EXACT structure:\n" +
  "{\n" +
  '  "planName": "descriptive plan name",\n' +
  '  "totalDays": ' + duration + ',\n' +
  '  "phases": [\n' +
  '    { "id": "phase_id", "label": "Phase Name", "days": "Days X-Y", "pct": percentage_of_total }\n' +
  "  ],\n" +
  '  "milestones": [\n' +
  '    {\n' +
  '      "id": "m1", "phase": "phase_id", "name": "Milestone Name",\n' +
  '      "dayRange": "Days X-Y", "owner": "Team Name", "status": "Planned",\n' +
  '      "deliverables": [\n' +
  '        { "title": "Deliverable description", "owner": "Team Name", "day": target_day_number }\n' +
  "      ]\n" +
  "    }\n" +
  "  ],\n" +
  '  "risks": [\n' +
  '    { "name": "Risk description", "likelihood": "high|low", "impact": "high|low", "phase": "phase_id" }\n' +
  "  ]\n" +
  "}\n" +
  "Create 3-5 phases. Each phase should have 2-4 milestones. Each milestone should have 2-4 deliverables.\n" +
  "Include 6-10 risks spread across likelihood/impact quadrants.\n" +
  "Make it realistic and specific to the topic. ONLY return the JSON, nothing else.";

var result = await ctx.ask(prompt);
var plan = {};
try {
  var text = (result.text || "").trim();
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    plan = JSON.parse(jsonMatch[0]);
  }
} catch(e) {
  plan = { planName: topic, totalDays: duration, phases: [], milestones: [], risks: [] };
}

var planId = "plan-" + Date.now();

// Store the plan
await ctx.store.set(planId, JSON.stringify({
  planName: plan.planName || topic,
  totalDays: plan.totalDays || duration,
  phases: plan.phases || [],
  milestones: plan.milestones || [],
  risks: plan.risks || []
}));
await ctx.store.set("latest_plan_id", planId);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_project_planner_create",
      planId: planId,
      planName: plan.planName || topic,
      topic: topic,
      totalDays: plan.totalDays || duration,
      phases: plan.phases || [],
      milestones: plan.milestones || [],
      risks: plan.risks || []
    })
  }]
};
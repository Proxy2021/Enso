// Create, view, edit, or delete workflow mappings
var action = (params.action || "list").toLowerCase();
var workflows = (await ctx.store.get("workflows")) || [];

var TEMPLATES = {
  morning_routine: {
    name: "Morning routine",
    steps: [
      { id: "s1", order: 1, label: "Check email inbox", tool: "Email", minutes: 10, friction: "Too many unread, hard to prioritize" },
      { id: "s2", order: 2, label: "Review calendar for today", tool: "Calendar", minutes: 5, friction: "" },
      { id: "s3", order: 3, label: "Check team messages", tool: "Chat", minutes: 10, friction: "Catching up on overnight messages" },
      { id: "s4", order: 4, label: "Review task list", tool: "Task Manager", minutes: 5, friction: "Prioritization takes effort" },
      { id: "s5", order: 5, label: "Plan day's focus", tool: "Notes", minutes: 15, friction: "Context switching between tools" }
    ]
  },
  deep_focus: {
    name: "Work deep focus",
    steps: [
      { id: "s1", order: 1, label: "Silence notifications", tool: "Phone", minutes: 2, friction: "" },
      { id: "s2", order: 2, label: "Open project workspace", tool: "IDE", minutes: 3, friction: "Finding where I left off" },
      { id: "s3", order: 3, label: "Review yesterday's progress", tool: "Notes", minutes: 5, friction: "Scattered notes" },
      { id: "s4", order: 4, label: "Deep work session", tool: "IDE", minutes: 90, friction: "Interruptions break flow" },
      { id: "s5", order: 5, label: "Document progress", tool: "Notes", minutes: 10, friction: "Forgetting what I did" }
    ]
  },
  meeting_prep: {
    name: "Meeting prep",
    steps: [
      { id: "s1", order: 1, label: "Check meeting agenda", tool: "Calendar", minutes: 3, friction: "Often no agenda set" },
      { id: "s2", order: 2, label: "Review past meeting notes", tool: "Notes", minutes: 5, friction: "Hard to find relevant notes" },
      { id: "s3", order: 3, label: "Gather relevant documents", tool: "Drive", minutes: 7, friction: "Files scattered across tools" },
      { id: "s4", order: 4, label: "Prepare talking points", tool: "Notes", minutes: 5, friction: "" }
    ]
  },
  end_of_day: {
    name: "End of day review",
    steps: [
      { id: "s1", order: 1, label: "Clear remaining emails", tool: "Email", minutes: 10, friction: "Always more than expected" },
      { id: "s2", order: 2, label: "Update task statuses", tool: "Task Manager", minutes: 5, friction: "Manual status updates" },
      { id: "s3", order: 3, label: "Write daily standup notes", tool: "Notes", minutes: 5, friction: "Recalling what I accomplished" },
      { id: "s4", order: 4, label: "Plan tomorrow's priorities", tool: "Task Manager", minutes: 10, friction: "Hard to predict capacity" }
    ]
  },
  weekend_planning: {
    name: "Weekend planning",
    steps: [
      { id: "s1", order: 1, label: "Review week's accomplishments", tool: "Notes", minutes: 10, friction: "Scattered across tools" },
      { id: "s2", order: 2, label: "Check upcoming events", tool: "Calendar", minutes: 5, friction: "" },
      { id: "s3", order: 3, label: "Plan personal goals", tool: "Notes", minutes: 15, friction: "Losing track of long-term goals" },
      { id: "s4", order: 4, label: "Organize reading/learning list", tool: "Browser", minutes: 10, friction: "Bookmarks scattered" }
    ]
  }
};

if (action === "create") {
  var name = (params.name || "").trim();
  var template = (params.template || "blank").toLowerCase();
  var tmpl = TEMPLATES[template];

  if (!name && tmpl) name = tmpl.name;
  if (!name) name = "New Workflow";

  var steps = tmpl ? tmpl.steps.map(function(s, i) {
    return { id: "s_" + Date.now() + "_" + i, order: s.order, label: s.label, tool: s.tool, minutes: s.minutes, friction: s.friction };
  }) : [];

  var wf = {
    id: "w_" + Date.now(),
    name: name,
    template: template,
    steps: steps,
    createdAt: new Date().toISOString()
  };
  workflows.push(wf);
  await ctx.store.set("workflows", workflows);

  var totalMin = 0;
  var frictionPts = 0;
  for (var i = 0; i < steps.length; i++) {
    totalMin += steps[i].minutes || 0;
    if (steps[i].friction) frictionPts++;
  }

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_map_workflow",
    action: "create",
    workflowId: wf.id,
    name: name,
    template: template,
    steps: steps,
    totalMinutes: totalMin,
    frictionPoints: frictionPts,
    message: "Created '" + name + "' workflow with " + steps.length + " steps"
  }) }] };
}

if (action === "view") {
  var wId = (params.workflowId || "").trim();
  var wf = null;
  for (var v = 0; v < workflows.length; v++) {
    if (workflows[v].id === wId) { wf = workflows[v]; break; }
  }
  if (!wf) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_map_workflow", action: "view", error: "Workflow not found" }) }] };
  }
  var wSteps = wf.steps || [];
  var tMin = 0;
  var fPts = 0;
  for (var vs = 0; vs < wSteps.length; vs++) {
    tMin += wSteps[vs].minutes || 0;
    if (wSteps[vs].friction) fPts++;
  }
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_map_workflow",
    action: "view",
    workflowId: wf.id,
    name: wf.name,
    steps: wSteps,
    totalMinutes: tMin,
    frictionPoints: fPts
  }) }] };
}

if (action === "add_step") {
  var asId = (params.workflowId || "").trim();
  var asWf = null;
  for (var as = 0; as < workflows.length; as++) {
    if (workflows[as].id === asId) { asWf = workflows[as]; break; }
  }
  if (!asWf) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_map_workflow", action: "add_step", error: "Workflow not found" }) }] };
  }
  var newStep = {
    id: "s_" + Date.now(),
    order: (asWf.steps || []).length + 1,
    label: (params.stepLabel || "New step").trim(),
    tool: (params.stepTool || "").trim(),
    minutes: params.stepMinutes || 5,
    friction: (params.stepFriction || "").trim()
  };
  asWf.steps = asWf.steps || [];
  asWf.steps.push(newStep);
  await ctx.store.set("workflows", workflows);

  var atMin = 0;
  var afPts = 0;
  for (var ai = 0; ai < asWf.steps.length; ai++) {
    atMin += asWf.steps[ai].minutes || 0;
    if (asWf.steps[ai].friction) afPts++;
  }
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_map_workflow",
    action: "add_step",
    workflowId: asWf.id,
    name: asWf.name,
    steps: asWf.steps,
    totalMinutes: atMin,
    frictionPoints: afPts,
    message: "Added step '" + newStep.label + "' to " + asWf.name
  }) }] };
}

if (action === "remove_step") {
  var rsWfId = (params.workflowId || "").trim();
  var rsStepId = (params.stepId || "").trim();
  var rsWf = null;
  for (var rs = 0; rs < workflows.length; rs++) {
    if (workflows[rs].id === rsWfId) { rsWf = workflows[rs]; break; }
  }
  if (!rsWf) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_map_workflow", action: "remove_step", error: "Workflow not found" }) }] };
  }
  var rsSteps = rsWf.steps || [];
  var rsIdx = -1;
  for (var rsi = 0; rsi < rsSteps.length; rsi++) {
    if (rsSteps[rsi].id === rsStepId) { rsIdx = rsi; break; }
  }
  if (rsIdx < 0) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_map_workflow", action: "remove_step", error: "Step not found" }) }] };
  }
  rsSteps.splice(rsIdx, 1);
  // Reorder
  for (var ro = 0; ro < rsSteps.length; ro++) { rsSteps[ro].order = ro + 1; }
  await ctx.store.set("workflows", workflows);
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_map_workflow",
    action: "remove_step",
    workflowId: rsWf.id,
    name: rsWf.name,
    steps: rsSteps,
    message: "Step removed"
  }) }] };
}

if (action === "delete") {
  var delId = (params.workflowId || "").trim();
  var delIdx = -1;
  for (var d = 0; d < workflows.length; d++) {
    if (workflows[d].id === delId) { delIdx = d; break; }
  }
  if (delIdx < 0) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_map_workflow", action: "delete", error: "Workflow not found" }) }] };
  }
  var deleted = workflows.splice(delIdx, 1)[0];
  await ctx.store.set("workflows", workflows);
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_map_workflow",
    action: "delete",
    message: "Deleted workflow '" + deleted.name + "'",
    workflowCount: workflows.length
  }) }] };
}

// Default: list all workflows
var summaries = workflows.map(function(w) {
  var tm = 0; var fp = 0;
  var ws = w.steps || [];
  for (var li = 0; li < ws.length; li++) { tm += ws[li].minutes || 0; if (ws[li].friction) fp++; }
  return { id: w.id, name: w.name, stepCount: ws.length, totalMinutes: tm, frictionPoints: fp, createdAt: w.createdAt };
});
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_workflow_mapper_map_workflow",
  action: "list",
  workflows: summaries,
  totalWorkflows: workflows.length
}) }] };

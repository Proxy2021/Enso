// Create, list, delete automation rules and access templates
var action = (params.action || "list").toLowerCase();
var automations = (await ctx.store.get("automations")) || [];

var TEMPLATES = [
  { id: "tmpl1", trigger: "New email from VIP contact", triggerTool: "Email", action: "Notify immediately with summary", priority: "high" },
  { id: "tmpl2", trigger: "Calendar event in 30 minutes", triggerTool: "Calendar", action: "Prepare meeting brief with attendee context", priority: "high" },
  { id: "tmpl3", trigger: "End of work day", triggerTool: "Calendar", action: "Compile daily accomplishments and tomorrow's priorities", priority: "medium" },
  { id: "tmpl4", trigger: "New PR assigned", triggerTool: "GitHub", action: "Summarize code changes and flag key areas", priority: "medium" },
  { id: "tmpl5", trigger: "Weekly on Monday morning", triggerTool: "Calendar", action: "Generate week-ahead briefing from all tools", priority: "low" },
  { id: "tmpl6", trigger: "Unread messages exceed 20", triggerTool: "Chat", action: "Summarize and surface top 5 must-read messages", priority: "medium" },
  { id: "tmpl7", trigger: "Focus session starts", triggerTool: "Calendar", action: "Mute notifications and prepare workspace summary", priority: "low" },
  { id: "tmpl8", trigger: "Task deadline approaching", triggerTool: "Task Manager", action: "Send reminder with progress status and next steps", priority: "high" }
];

if (action === "create") {
  var trigger = (params.trigger || "").trim();
  var triggerTool = (params.triggerTool || "").trim();
  var ensoAction = (params.ensoAction || "").trim();
  var priority = (params.priority || "medium").toLowerCase();

  if (!trigger || !ensoAction) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_automation", action: "create", error: "Both trigger and action are required" }) }] };
  }

  // Determine if this can be done today
  var availableTools = ["Email", "Calendar", "Notes", "Task Manager", "Browser"];
  var status = "planned";
  for (var a = 0; a < availableTools.length; a++) {
    if (triggerTool.toLowerCase().indexOf(availableTools[a].toLowerCase()) >= 0) {
      status = "available";
      break;
    }
  }

  var newAutomation = {
    id: "a_" + Date.now(),
    trigger: trigger,
    triggerTool: triggerTool,
    action: ensoAction,
    priority: priority,
    status: status,
    createdAt: new Date().toISOString()
  };
  automations.push(newAutomation);
  await ctx.store.set("automations", automations);

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_automation",
    action: "create",
    message: "Automation rule created",
    automation: newAutomation,
    automations: automations,
    templates: TEMPLATES,
    totalAutomations: automations.length
  }) }] };
}

if (action === "use_template") {
  var templateId = (params.templateId || "").trim();
  var tmpl = null;
  for (var t = 0; t < TEMPLATES.length; t++) {
    if (TEMPLATES[t].id === templateId) { tmpl = TEMPLATES[t]; break; }
  }
  if (!tmpl) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_automation", action: "use_template", error: "Template not found" }) }] };
  }

  var fromTmpl = {
    id: "a_" + Date.now(),
    trigger: tmpl.trigger,
    triggerTool: tmpl.triggerTool,
    action: tmpl.action,
    priority: tmpl.priority,
    status: "planned",
    createdAt: new Date().toISOString()
  };
  automations.push(fromTmpl);
  await ctx.store.set("automations", automations);

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_automation",
    action: "use_template",
    message: "Automation created from template: " + tmpl.trigger,
    automation: fromTmpl,
    automations: automations,
    templates: TEMPLATES,
    totalAutomations: automations.length
  }) }] };
}

if (action === "delete") {
  var delId = (params.automationId || "").trim();
  var delIdx = -1;
  for (var d = 0; d < automations.length; d++) {
    if (automations[d].id === delId) { delIdx = d; break; }
  }
  if (delIdx < 0) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_automation", action: "delete", error: "Automation not found" }) }] };
  }
  var removed = automations.splice(delIdx, 1)[0];
  await ctx.store.set("automations", automations);
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_automation",
    action: "delete",
    message: "Deleted automation: " + removed.trigger,
    automations: automations,
    templates: TEMPLATES,
    totalAutomations: automations.length
  }) }] };
}

// Default: list
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_workflow_mapper_automation",
  action: "list",
  automations: automations,
  templates: TEMPLATES,
  totalAutomations: automations.length
}) }] };

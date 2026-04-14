// Analyze tool inventory and workflows to discover Enso integration opportunities
var focus = (params.focus || "all").toLowerCase();
var tools = (await ctx.store.get("tools")) || [];
var workflows = (await ctx.store.get("workflows")) || [];

// Build tool name set for matching
var toolNames = {};
for (var i = 0; i < tools.length; i++) {
  toolNames[tools[i].name.toLowerCase()] = tools[i];
}

// Collect all friction points from workflows
var frictionSources = [];
for (var w = 0; w < workflows.length; w++) {
  var steps = workflows[w].steps || [];
  for (var s = 0; s < steps.length; s++) {
    if (steps[s].friction) {
      frictionSources.push({ workflow: workflows[w].name, step: steps[s].label, tool: steps[s].tool, friction: steps[s].friction });
    }
  }
}

// Build opportunities based on what tools user has and their pain points
var opportunities = [];
var oppId = 0;

// 1. Email-related opportunities
var hasEmail = toolNames["gmail"] || toolNames["email"] || toolNames["outlook"];
if (hasEmail && (focus === "all" || focus === "communication")) {
  opportunities.push({
    id: "opp" + (++oppId),
    title: "Morning Email Triage",
    impact: "high",
    description: "Enso reads your inbox, categorizes by priority, and delivers a concise briefing with action items",
    connects: [hasEmail.name || "Email"],
    timeSaved: 15,
    available: true,
    example: "Enso scans inbox → groups by sender importance → surfaces action-required emails first"
  });
}

// 2. Calendar/meeting prep
var hasCalendar = toolNames["calendar"] || toolNames["google calendar"] || toolNames["outlook calendar"];
if (hasCalendar && (focus === "all" || focus === "productivity")) {
  var calConnects = [hasCalendar.name || "Calendar"];
  if (hasEmail) calConnects.push(hasEmail.name || "Email");
  opportunities.push({
    id: "opp" + (++oppId),
    title: "Meeting Preparation Automation",
    impact: "high",
    description: "When a meeting appears on your calendar, Enso gathers relevant docs, past notes, and attendee context",
    connects: calConnects,
    timeSaved: 12,
    available: true,
    example: "Calendar event detected → Enso pulls attendee emails, related notes → pre-built agenda and talking points"
  });
}

// 3. Chat/messaging digest
var hasChat = toolNames["slack"] || toolNames["teams"] || toolNames["wechat"] || toolNames["discord"];
if (hasChat && (focus === "all" || focus === "communication")) {
  opportunities.push({
    id: "opp" + (++oppId),
    title: "Message Digest & Highlights",
    impact: "medium",
    description: "Enso summarizes key messages from your chat channels, highlighting decisions and action items",
    connects: [hasChat.name || "Chat"],
    timeSaved: 8,
    available: true,
    example: "Morning catch-up → Enso scans overnight messages → delivers 5-point summary with action items"
  });
}

// 4. Development workflow
var hasDev = toolNames["github"] || toolNames["gitlab"] || toolNames["vs code"] || toolNames["vscode"];
if (hasDev && (focus === "all" || focus === "automation")) {
  opportunities.push({
    id: "opp" + (++oppId),
    title: "Code Review Assistant",
    impact: "medium",
    description: "Enso summarizes PR changes, highlights key areas, and drafts review comments based on patterns",
    connects: [hasDev.name || "GitHub"],
    timeSaved: 8,
    available: false,
    example: "PR assigned → Enso reads diff, identifies patterns → suggests review focus areas"
  });
}

// 5. Task management
var hasTasks = toolNames["todoist"] || toolNames["notion"] || toolNames["asana"] || toolNames["linear"] || toolNames["jira"];
if (hasTasks && (focus === "all" || focus === "productivity")) {
  opportunities.push({
    id: "opp" + (++oppId),
    title: "Smart Task Prioritization",
    impact: "medium",
    description: "Enso analyzes your tasks against calendar, deadlines, and energy levels to suggest optimal daily ordering",
    connects: [hasTasks.name || "Task Manager"],
    timeSaved: 10,
    available: true,
    example: "Start of day → Enso reviews all tasks, considers today's meetings → suggests top 3 priorities"
  });
}

// 6. End-of-day digest (always relevant)
if (tools.length > 0 && (focus === "all" || focus === "time_saving")) {
  var digestTools = tools.slice(0, 4).map(function(t) { return t.name; });
  opportunities.push({
    id: "opp" + (++oppId),
    title: "End-of-Day Digest",
    impact: "medium",
    description: "Enso compiles what you accomplished, what's pending, and tomorrow's priorities from all your tools",
    connects: digestTools,
    timeSaved: 10,
    available: true,
    example: "5pm trigger → Enso aggregates completed tasks, messages, events → sends evening summary"
  });
}

// 7. Cross-tool context switching reduction
if (tools.length >= 3 && (focus === "all" || focus === "time_saving")) {
  opportunities.push({
    id: "opp" + (++oppId),
    title: "Unified Command Center",
    impact: "high",
    description: "Instead of switching between " + tools.length + " tools, Enso provides a single dashboard with key info from each",
    connects: tools.slice(0, 5).map(function(t) { return t.name; }),
    timeSaved: 20,
    available: true,
    example: "One screen shows: 3 urgent emails, 2 upcoming meetings, 5 open tasks, 1 PR to review"
  });
}

// 8. Friction-specific opportunities
for (var f = 0; f < frictionSources.length && opportunities.length < 10; f++) {
  var fric = frictionSources[f];
  if (fric.friction.toLowerCase().indexOf("prioriti") >= 0 || fric.friction.toLowerCase().indexOf("overwhelm") >= 0) {
    opportunities.push({
      id: "opp" + (++oppId),
      title: "AI Prioritization for " + fric.tool,
      impact: "medium",
      description: "Enso analyzes and prioritizes items in " + fric.tool + " to reduce overwhelm during '" + fric.workflow + "'",
      connects: [fric.tool],
      timeSaved: 5,
      available: true,
      example: "'" + fric.step + "' → Enso pre-sorts by importance → reduces decision fatigue"
    });
  }
}

// Calculate totals
var totalTimeSaveable = 0;
var availableNow = 0;
var needsDev = 0;
for (var o = 0; o < opportunities.length; o++) {
  totalTimeSaveable += opportunities[o].timeSaved || 0;
  if (opportunities[o].available) availableNow++;
  else needsDev++;
}

// Integration score
var integrationScore = 0;
if (tools.length > 0) integrationScore += Math.min(30, tools.length * 6);
if (workflows.length > 0) integrationScore += Math.min(30, workflows.length * 10);
if (opportunities.length > 0) integrationScore += Math.min(40, opportunities.length * 5);
integrationScore = Math.min(100, integrationScore);

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_workflow_mapper_analyze",
  focus: focus,
  integrationScore: integrationScore,
  totalTimeSaveable: totalTimeSaveable,
  opportunities: opportunities,
  frictionSources: frictionSources,
  categories: { available_now: availableNow, needs_development: needsDev }
}) }] };

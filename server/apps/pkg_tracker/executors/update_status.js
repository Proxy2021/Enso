var toolId = (params.toolId || "").trim();
var newStatus = (params.status || "").trim();

if (!toolId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_update_status", error: "toolId is required" }) }] };
}

var validStatuses = ["not_started", "in_progress", "deployed", "verified"];
if (validStatuses.indexOf(newStatus) === -1) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_update_status", error: "Invalid status. Must be: " + validStatuses.join(", ") }) }] };
}

var phases = await ctx.store.get("phases");
if (!phases) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_update_status", error: "No tracker data found. Run get_status first." }) }] };
}

var found = false;
var toolName = "";
var oldStatus = "";
var phaseProgress = 0;
var phaseName = "";

for (var pi = 0; pi < phases.length; pi++) {
  var phase = phases[pi];
  for (var ti = 0; ti < phase.tools.length; ti++) {
    if (phase.tools[ti].id === toolId) {
      oldStatus = phase.tools[ti].status;
      phase.tools[ti].status = newStatus;
      toolName = phase.tools[ti].name;
      phaseName = phase.name;
      found = true;

      // Recompute phase progress
      var phaseTotal = phase.tools.length;
      var phaseDone = 0;
      for (var j = 0; j < phase.tools.length; j++) {
        var s = phase.tools[j].status;
        if (s === "deployed" || s === "verified") phaseDone++;
        else if (s === "in_progress") phaseDone += 0.5;
      }
      phase.progress = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;
      phaseProgress = phase.progress;
      break;
    }
  }
  if (found) break;
}

if (!found) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_update_status", error: "Tool not found: " + toolId }) }] };
}

await ctx.store.set("phases", phases);

// Compute overall progress
var totalTools = 0;
var deployedTools = 0;
for (var oi = 0; oi < phases.length; oi++) {
  for (var oti = 0; oti < phases[oi].tools.length; oti++) {
    totalTools++;
    var ts = phases[oi].tools[oti].status;
    if (ts === "deployed" || ts === "verified") deployedTools++;
  }
}
var overallProgress = totalTools > 0 ? Math.round((deployedTools / totalTools) * 100) : 0;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_pkg_tracker_update_status",
      toolId: toolId,
      toolName: toolName,
      phaseName: phaseName,
      oldStatus: oldStatus,
      newStatus: newStatus,
      phaseProgress: phaseProgress,
      overallProgress: overallProgress
    })
  }]
};

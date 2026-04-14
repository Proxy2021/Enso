var toolId = (params.toolId || "").trim();

if (!toolId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_update_notes", error: "toolId is required" }) }] };
}

var phases = await ctx.store.get("phases");
if (!phases) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_update_notes", error: "No tracker data found. Run get_status first." }) }] };
}

var found = false;
var toolName = "";
var updatedNotes = "";
var updatedChecklist = [];

for (var pi = 0; pi < phases.length; pi++) {
  for (var ti = 0; ti < phases[pi].tools.length; ti++) {
    var t = phases[pi].tools[ti];
    if (t.id === toolId) {
      found = true;
      toolName = t.name;

      // Update notes if provided
      if (params.notes !== undefined && params.notes !== null) {
        t.notes = String(params.notes);
      }

      // Toggle checklist item if specified
      if (params.toggleCheckItem !== undefined && params.toggleCheckItem !== null) {
        var idx = Number(params.toggleCheckItem);
        if (t.checklist && idx >= 0 && idx < t.checklist.length) {
          t.checklist[idx].done = !t.checklist[idx].done;
        }
      }

      updatedNotes = t.notes;
      updatedChecklist = t.checklist || [];
      break;
    }
  }
  if (found) break;
}

if (!found) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_update_notes", error: "Tool not found: " + toolId }) }] };
}

await ctx.store.set("phases", phases);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_pkg_tracker_update_notes",
      toolId: toolId,
      toolName: toolName,
      notes: updatedNotes,
      checklist: updatedChecklist
    })
  }]
};

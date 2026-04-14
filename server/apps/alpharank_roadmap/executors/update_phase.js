var phaseId = (params.phaseId || "").trim();
var status = (params.status || "").trim();

var validStatuses = ["not_started", "in_progress", "complete"];
if (!phaseId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_update_phase",
        success: false,
        error: "phaseId is required"
      })
    }]
  };
}
if (validStatuses.indexOf(status) === -1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_update_phase",
        success: false,
        error: "status must be one of: not_started, in_progress, complete"
      })
    }]
  };
}

var phases = await ctx.store.get("phases");
if (!phases) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_update_phase",
        success: false,
        error: "No roadmap data found. Run overview first to initialize."
      })
    }]
  };
}

var found = false;
var phaseName = "";
for (var i = 0; i < phases.length; i++) {
  if (phases[i].id === phaseId) {
    phases[i].status = status;
    phaseName = phases[i].name;
    found = true;
    break;
  }
}

if (!found) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_update_phase",
        success: false,
        error: "Phase '" + phaseId + "' not found"
      })
    }]
  };
}

await ctx.store.set("phases", phases);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_roadmap_update_phase",
      success: true,
      phaseId: phaseId,
      status: status,
      message: "Phase '" + phaseName + "' updated to '" + status + "'"
    })
  }]
};

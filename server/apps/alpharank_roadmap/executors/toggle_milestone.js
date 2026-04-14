var phaseId = (params.phaseId || "").trim();
var milestoneId = (params.milestoneId || "").trim();

if (!phaseId || !milestoneId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_toggle_milestone",
        success: false,
        error: "Both phaseId and milestoneId are required"
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
        tool: "enso_alpharank_roadmap_toggle_milestone",
        success: false,
        error: "No roadmap data found. Run overview first to initialize."
      })
    }]
  };
}

var found = false;
var milestoneLabel = "";
var newDone = false;

for (var i = 0; i < phases.length; i++) {
  if (phases[i].id === phaseId) {
    var ms = phases[i].milestones || [];
    for (var j = 0; j < ms.length; j++) {
      if (ms[j].id === milestoneId) {
        ms[j].done = !ms[j].done;
        newDone = ms[j].done;
        milestoneLabel = ms[j].label;
        found = true;
        break;
      }
    }
    break;
  }
}

if (!found) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_toggle_milestone",
        success: false,
        error: "Milestone '" + milestoneId + "' not found in phase '" + phaseId + "'"
      })
    }]
  };
}

await ctx.store.set("phases", phases);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_roadmap_toggle_milestone",
      success: true,
      phaseId: phaseId,
      milestoneId: milestoneId,
      done: newDone,
      message: "Milestone '" + milestoneLabel + "' " + (newDone ? "marked as done" : "marked as not done")
    })
  }]
};

var techId = (params.techId || "").trim();

if (!techId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_toggle_tech",
        success: false,
        error: "techId is required"
      })
    }]
  };
}

var techStack = await ctx.store.get("techStack");
if (!techStack) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_toggle_tech",
        success: false,
        error: "No tech stack data found. Run overview first to initialize."
      })
    }]
  };
}

var found = false;
var techLabel = "";
var newDone = false;

for (var i = 0; i < techStack.length; i++) {
  if (techStack[i].id === techId) {
    techStack[i].done = !techStack[i].done;
    newDone = techStack[i].done;
    techLabel = techStack[i].label;
    found = true;
    break;
  }
}

if (!found) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_toggle_tech",
        success: false,
        error: "Technology '" + techId + "' not found"
      })
    }]
  };
}

await ctx.store.set("techStack", techStack);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_roadmap_toggle_tech",
      success: true,
      techId: techId,
      done: newDone,
      message: "Technology '" + techLabel + "' " + (newDone ? "marked as ready" : "marked as not ready")
    })
  }]
};

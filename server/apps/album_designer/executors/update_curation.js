var projectId = (params.projectId || "").trim();
var passNum = params.pass || null;
var remainingCount = params.remainingCount != null ? params.remainingCount : null;
var completed = params.completed != null ? params.completed : null;
var notes = params.notes != null ? params.notes : null;

if (!projectId) {
  // Try active project
  projectId = await ctx.store.get("active_project") || "";
}
if (!projectId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_update_curation", error: "No project ID provided and no active project" }) }] };
}

var curation = await ctx.store.get("curation_" + projectId);
if (!curation) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_update_curation", error: "Curation data not found for project: " + projectId }) }] };
}

// Update specific pass if provided
if (passNum && passNum >= 1 && passNum <= 5) {
  var passIdx = passNum - 1;
  var passData = curation.passes[passIdx];

  if (remainingCount !== null) {
    passData.remainingCount = remainingCount;
    // Calculate culled percent based on start count
    var startForPass = passData.startCount;
    if (passIdx > 0 && curation.passes[passIdx - 1].remainingCount !== null) {
      startForPass = curation.passes[passIdx - 1].remainingCount;
      passData.startCount = startForPass;
    }
    if (startForPass > 0) {
      passData.culledPercent = Math.round((1 - remainingCount / startForPass) * 1000) / 10;
    }

    // Update next pass's start count
    if (passIdx < 4) {
      curation.passes[passIdx + 1].startCount = remainingCount;
    }
  }

  if (completed !== null) {
    passData.completed = completed;
  }

  if (notes !== null) {
    passData.notes = notes;
  }

  curation.passes[passIdx] = passData;
}

// Calculate overall progress and current pass
var completedPasses = 0;
var currentPass = 1;
for (var i = 0; i < curation.passes.length; i++) {
  if (curation.passes[i].completed) {
    completedPasses++;
    currentPass = Math.min(i + 2, 5);
  }
}
curation.overallProgress = Math.round((completedPasses / 5) * 100);
curation.currentPass = currentPass;

await ctx.store.set("curation_" + projectId, curation);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_update_curation",
      projectId: projectId,
      curation: curation
    })
  }]
};

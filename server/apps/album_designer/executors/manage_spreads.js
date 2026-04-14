var projectId = (params.projectId || "").trim();
var action = (params.action || "").trim() || "list";

if (!projectId) {
  projectId = await ctx.store.get("active_project") || "";
}
if (!projectId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_manage_spreads", error: "No project ID" }) }] };
}

var allProjects = await ctx.store.get("album_projects") || {};
var project = allProjects[projectId];
if (!project) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_manage_spreads", error: "Project not found" }) }] };
}

var spreads = await ctx.store.get("spreads_" + projectId) || [];

var LAYOUT_IMAGE_COUNT = {
  full_bleed: 1,
  two_side_by_side: 2,
  large_small: 2,
  three_grid: 3,
  text_page: 0
};

if (action === "add") {
  var layout = (params.layout || "").trim() || "full_bleed";
  var imageDesc = (params.imageDesc || "").trim() || "";
  var themeTag = (params.themeTag || "").trim() || "nature";
  var narrativePos = (params.narrativePos || "").trim() || "rising";

  var spread = {
    index: spreads.length,
    layout: layout,
    imageDesc: imageDesc,
    themeTag: themeTag,
    narrativePos: narrativePos,
    imageCount: LAYOUT_IMAGE_COUNT[layout] || 1,
    createdAt: new Date().toISOString()
  };
  spreads.push(spread);
  await ctx.store.set("spreads_" + projectId, spreads);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_manage_spreads",
        projectId: projectId,
        action: "add",
        totalSpreads: spreads.length,
        targetSpreads: project.targetSpreads || 35,
        spreads: spreads
      })
    }]
  };
}

if (action === "update") {
  var idx = params.spreadIndex;
  if (idx === undefined || idx === null || idx < 0 || idx >= spreads.length) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_manage_spreads", error: "Invalid spread index" }) }] };
  }
  var s = spreads[idx];
  if (params.layout) { s.layout = params.layout; s.imageCount = LAYOUT_IMAGE_COUNT[params.layout] || 1; }
  if (params.imageDesc) s.imageDesc = params.imageDesc;
  if (params.themeTag) s.themeTag = params.themeTag;
  if (params.narrativePos) s.narrativePos = params.narrativePos;
  spreads[idx] = s;
  await ctx.store.set("spreads_" + projectId, spreads);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_manage_spreads",
        projectId: projectId,
        action: "update",
        totalSpreads: spreads.length,
        targetSpreads: project.targetSpreads || 35,
        spreads: spreads
      })
    }]
  };
}

if (action === "remove") {
  var ri = params.spreadIndex;
  if (ri === undefined || ri === null || ri < 0 || ri >= spreads.length) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_manage_spreads", error: "Invalid spread index" }) }] };
  }
  spreads.splice(ri, 1);
  // Re-index
  for (var r = 0; r < spreads.length; r++) {
    spreads[r].index = r;
  }
  await ctx.store.set("spreads_" + projectId, spreads);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_manage_spreads",
        projectId: projectId,
        action: "remove",
        totalSpreads: spreads.length,
        targetSpreads: project.targetSpreads || 35,
        spreads: spreads
      })
    }]
  };
}

if (action === "reorder") {
  var from = params.moveFrom;
  var to = params.moveTo;
  if (from === undefined || to === undefined || from < 0 || from >= spreads.length || to < 0 || to >= spreads.length) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_manage_spreads", error: "Invalid reorder indices" }) }] };
  }
  var item = spreads.splice(from, 1)[0];
  spreads.splice(to, 0, item);
  for (var ri2 = 0; ri2 < spreads.length; ri2++) {
    spreads[ri2].index = ri2;
  }
  await ctx.store.set("spreads_" + projectId, spreads);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_manage_spreads",
        projectId: projectId,
        action: "reorder",
        totalSpreads: spreads.length,
        targetSpreads: project.targetSpreads || 35,
        spreads: spreads
      })
    }]
  };
}

// Default: list
var totalImages = 0;
for (var li = 0; li < spreads.length; li++) {
  totalImages += (spreads[li].imageCount || 0);
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_manage_spreads",
      projectId: projectId,
      action: "list",
      totalSpreads: spreads.length,
      targetSpreads: project.targetSpreads || 35,
      totalImages: totalImages,
      targetImages: project.targetImages || 60,
      spreads: spreads
    })
  }]
};

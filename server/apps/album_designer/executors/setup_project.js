var action = (params.action || "").trim() || "list";
var projectId = (params.projectId || "").trim();
var title = (params.title || "").trim();
var recipient = (params.recipient || "").trim();
var theme = (params.theme || "").trim();
var targetSpreads = params.targetSpreads || 35;
var targetImages = params.targetImages || 60;

// Load all projects from store
var allProjects = await ctx.store.get("album_projects") || {};

var FORMAT = {
  printer: "Printique",
  size: "10\u00d710 inches",
  binding: "Lay-flat hardcover",
  finish: "Lustre",
  paper: "200+ gsm premium",
  colorProfile: "sRGB"
};

if (action === "create") {
  var id = "proj_" + Date.now();
  var now = new Date().toISOString();
  var project = {
    id: id,
    title: title || "Untitled Album",
    recipient: recipient || "",
    theme: theme || "",
    format: FORMAT,
    targetSpreads: targetSpreads,
    targetImages: targetImages,
    createdAt: now,
    updatedAt: now
  };
  allProjects[id] = project;
  await ctx.store.set("album_projects", allProjects);
  await ctx.store.set("active_project", id);

  // Initialize curation data
  var curation = {
    startCount: 124000,
    passes: [
      { pass: 1, name: "Technical Kill", targetRange: "~25,000", startCount: 124000, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 1 },
      { pass: 2, name: "Print Test", targetRange: "~5,000", startCount: 25000, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 2 },
      { pass: 3, name: "Thematic Grouping", targetRange: "~500", startCount: 5000, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 3 },
      { pass: 4, name: "Narrative Arc", targetRange: "~120", startCount: 500, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 4 },
      { pass: 5, name: "Album Cut", targetRange: "50\u201370", startCount: 120, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 5 }
    ],
    overallProgress: 0,
    currentPass: 1
  };
  await ctx.store.set("curation_" + id, curation);

  // Initialize empty spreads and checklist
  await ctx.store.set("spreads_" + id, []);
  await ctx.store.set("checklist_" + id, {
    dpi_300: false, srgb_profile: false, images_exported: false,
    proof_ordered: false, final_review: false,
    spine_text: false, cover_selected: false,
    spineText: "", coverImageDesc: "", notes: ""
  });

  var projectList = Object.keys(allProjects).map(function(k) { return allProjects[k]; });
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_setup_project",
        action: "create",
        project: project,
        projects: projectList
      })
    }]
  };
}

if (action === "load") {
  var proj = allProjects[projectId];
  if (!proj) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_setup_project", action: "load", error: "Project not found: " + projectId }) }] };
  }
  await ctx.store.set("active_project", projectId);
  var curationData = await ctx.store.get("curation_" + projectId) || {};
  var spreadsData = await ctx.store.get("spreads_" + projectId) || [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_setup_project",
        action: "load",
        project: proj,
        curation: curationData,
        spreadCount: spreadsData.length,
        projects: Object.keys(allProjects).map(function(k) { return allProjects[k]; })
      })
    }]
  };
}

if (action === "update") {
  var p = allProjects[projectId];
  if (!p) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_setup_project", action: "update", error: "Project not found" }) }] };
  }
  if (title) p.title = title;
  if (recipient) p.recipient = recipient;
  if (theme) p.theme = theme;
  if (params.targetSpreads) p.targetSpreads = targetSpreads;
  if (params.targetImages) p.targetImages = targetImages;
  p.updatedAt = new Date().toISOString();
  allProjects[projectId] = p;
  await ctx.store.set("album_projects", allProjects);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_setup_project",
        action: "update",
        project: p,
        projects: Object.keys(allProjects).map(function(k) { return allProjects[k]; })
      })
    }]
  };
}

if (action === "delete") {
  if (allProjects[projectId]) {
    delete allProjects[projectId];
    await ctx.store.set("album_projects", allProjects);
    await ctx.store.delete("curation_" + projectId);
    await ctx.store.delete("spreads_" + projectId);
    await ctx.store.delete("checklist_" + projectId);
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_setup_project",
        action: "delete",
        projectId: projectId,
        projects: Object.keys(allProjects).map(function(k) { return allProjects[k]; })
      })
    }]
  };
}

// Default: list
var activeId = await ctx.store.get("active_project") || "";
var projList = Object.keys(allProjects).map(function(k) { return allProjects[k]; });
var activeProject = allProjects[activeId] || null;
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_setup_project",
      action: "list",
      activeProjectId: activeId,
      project: activeProject,
      projects: projList
    })
  }]
};

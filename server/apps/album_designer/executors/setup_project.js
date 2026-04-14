var action = (params.action || "").trim() || "list";
var projectId = (params.projectId || "").trim();
var title = (params.title || "").trim();
var recipient = (params.recipient || "").trim();
var theme = (params.theme || "").trim();
var targetSpreads = params.targetSpreads || 35;
var targetImages = params.targetImages || 60;
var totalCandidates = params.totalCandidates || 0;
var printer = (params.printer || "").trim() || "saal_digital";
var dueDate = (params.dueDate || "").trim() || "";
var occasion = (params.occasion || "").trim() || "";
var status = (params.status || "").trim() || "planning";

// Load all projects from store
var allProjects = await ctx.store.get("album_projects") || {};

// Printer format presets
var PRINTER_FORMATS = {
  printique: {
    printer: "Printique",
    size: "10\u00d710 inches",
    binding: "Lay-flat hardcover",
    finish: "Lustre",
    paper: "200+ gsm premium",
    colorProfile: "sRGB",
    line: ""
  },
  saal_digital: {
    printer: "Saal Digital",
    size: "28\u00d728 cm",
    binding: "Lay-flat hardcover",
    finish: "",
    paper: "Fine Art print",
    colorProfile: "sRGB",
    line: "Professional Line"
  },
  whitewall: {
    printer: "WhiteWall",
    size: "30\u00d730 cm",
    binding: "Hardcover",
    finish: "Matte",
    paper: "Premium photo paper",
    colorProfile: "sRGB",
    line: "Coffee Table Book"
  }
};

var FORMAT = PRINTER_FORMATS[printer] || PRINTER_FORMATS.saal_digital;

if (action === "create") {
  var id = "proj_" + Date.now();
  var now = new Date().toISOString();

  // Calculate curation targets based on totalCandidates
  var startCount = totalCandidates || 2400;
  var pass1Target = Math.round(startCount * 0.25);
  var pass2Target = Math.round(pass1Target * 0.25);
  var pass3Target = Math.round(pass2Target * 0.55);
  var pass4Target = Math.round(pass3Target * 0.75);

  var project = {
    id: id,
    title: title || "Untitled Album",
    recipient: recipient || "",
    theme: theme || "",
    status: status,
    dueDate: dueDate,
    occasion: occasion,
    totalCandidates: startCount,
    printer: printer,
    format: FORMAT,
    targetSpreads: targetSpreads,
    targetImages: targetImages,
    createdAt: now,
    updatedAt: now
  };
  allProjects[id] = project;
  await ctx.store.set("album_projects", allProjects);
  await ctx.store.set("active_project", id);

  // Initialize curation data scaled to totalCandidates
  var curation = {
    startCount: startCount,
    passes: [
      { pass: 1, name: "Technical Kill", targetRange: "~" + pass1Target.toLocaleString(), startCount: startCount, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 1 },
      { pass: 2, name: "Print Test", targetRange: "~" + pass2Target.toLocaleString(), startCount: pass1Target, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 2 },
      { pass: 3, name: "Thematic Grouping", targetRange: "~" + pass3Target.toLocaleString(), startCount: pass2Target, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 3 },
      { pass: 4, name: "Narrative Arc", targetRange: "~" + pass4Target.toLocaleString(), startCount: pass3Target, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 4 },
      { pass: 5, name: "Album Cut", targetRange: targetImages + "\u201370", startCount: pass4Target, remainingCount: null, culledPercent: null, completed: false, notes: "", starRating: 5 }
    ],
    overallProgress: 0,
    currentPass: 1
  };
  await ctx.store.set("curation_" + id, curation);

  // Initialize empty spreads, chapters, and checklist
  await ctx.store.set("spreads_" + id, []);
  await ctx.store.set("chapters_" + id, []);
  await ctx.store.set("checklist_" + id, {
    dpi_300: false, srgb_profile: false, jpeg_quality: false, images_exported: false,
    color_calibrated: false, bleed_checked: false,
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
  var chaptersData = await ctx.store.get("chapters_" + projectId) || [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_setup_project",
        action: "load",
        project: proj,
        curation: curationData,
        spreadCount: spreadsData.length,
        chapterCount: chaptersData.length,
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
  if (params.totalCandidates) p.totalCandidates = totalCandidates;
  if (params.printer) { p.printer = printer; p.format = PRINTER_FORMATS[printer] || PRINTER_FORMATS.saal_digital; }
  if (params.dueDate) p.dueDate = dueDate;
  if (params.occasion) p.occasion = occasion;
  if (params.status) p.status = status;
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
    await ctx.store.delete("chapters_" + projectId);
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

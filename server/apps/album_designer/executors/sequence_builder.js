var projectId = (params.projectId || "").trim();
var action = (params.action || "").trim() || "list";

if (!projectId) {
  projectId = await ctx.store.get("active_project") || "";
}
if (!projectId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_sequence_builder", error: "No project ID" }) }] };
}

var allProjects = await ctx.store.get("album_projects") || {};
var project = allProjects[projectId];
if (!project) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_sequence_builder", error: "Project not found" }) }] };
}

var chapters = await ctx.store.get("chapters_" + projectId) || [];

// Printer cost calculation
var PRINTER_COSTS = {
  saal_digital: { basePrice: 59.95, perPage: 1.25, currency: "EUR", label: "Saal Digital", line: "Professional Line", paper: "Fine Art print", binding: "Lay-flat hardcover" },
  printique: { basePrice: 89.99, includedSpreads: 20, perExtraSpread: 1.99, currency: "USD", label: "Printique", line: "", paper: "200+ gsm premium", binding: "Lay-flat hardcover" },
  whitewall: { basePrice: 69.90, perPage: 1.50, currency: "EUR", label: "WhiteWall", line: "Coffee Table Book", paper: "Premium photo paper", binding: "Hardcover" }
};

var printerKey = project.printer || "saal_digital";
var costInfo = PRINTER_COSTS[printerKey] || PRINTER_COSTS.saal_digital;

function calcPrintSpec(chapterList) {
  var totalAllocated = 0;
  for (var c = 0; c < chapterList.length; c++) {
    totalAllocated += (chapterList[c].spreadCount || 0);
  }
  var pageCount = totalAllocated * 2;
  var cost = 0;
  if (printerKey === "printique") {
    var extra = Math.max(0, totalAllocated - (costInfo.includedSpreads || 20));
    cost = costInfo.basePrice + (extra * costInfo.perExtraSpread);
  } else {
    cost = costInfo.basePrice + (pageCount * costInfo.perPage);
  }
  return {
    pageCount: pageCount,
    printer: costInfo.label,
    line: costInfo.line,
    paper: costInfo.paper,
    binding: costInfo.binding,
    estimatedCost: Math.round(cost * 100) / 100,
    currency: costInfo.currency,
    totalAllocatedSpreads: totalAllocated,
    targetSpreads: project.targetSpreads || 35
  };
}

if (action === "add") {
  var name = (params.name || "").trim() || "New Chapter";
  var spreadCount = params.spreadCount || 4;
  var pacingNotes = (params.pacingNotes || "").trim() || "";
  var varietyStr = (params.varietyTags || "").trim() || "";
  var varietyTags = varietyStr ? varietyStr.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];

  var chapter = {
    index: chapters.length,
    name: name,
    spreadCount: spreadCount,
    pacingNotes: pacingNotes,
    varietyTags: varietyTags,
    createdAt: new Date().toISOString()
  };
  chapters.push(chapter);
  await ctx.store.set("chapters_" + projectId, chapters);

  var spec = calcPrintSpec(chapters);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_sequence_builder",
        projectId: projectId,
        action: "add",
        chapters: chapters,
        totalChapters: chapters.length,
        totalAllocatedSpreads: spec.totalAllocatedSpreads,
        targetSpreads: spec.targetSpreads,
        printSpec: spec
      })
    }]
  };
}

if (action === "update") {
  var idx = params.chapterIndex;
  if (idx === undefined || idx === null || idx < 0 || idx >= chapters.length) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_sequence_builder", error: "Invalid chapter index" }) }] };
  }
  var ch = chapters[idx];
  if (params.name) ch.name = params.name;
  if (params.spreadCount !== undefined) ch.spreadCount = params.spreadCount;
  if (params.pacingNotes !== undefined) ch.pacingNotes = params.pacingNotes;
  if (params.varietyTags !== undefined) {
    var vStr = (params.varietyTags || "").trim();
    ch.varietyTags = vStr ? vStr.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];
  }
  chapters[idx] = ch;
  await ctx.store.set("chapters_" + projectId, chapters);

  var spec2 = calcPrintSpec(chapters);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_sequence_builder",
        projectId: projectId,
        action: "update",
        chapters: chapters,
        totalChapters: chapters.length,
        totalAllocatedSpreads: spec2.totalAllocatedSpreads,
        targetSpreads: spec2.targetSpreads,
        printSpec: spec2
      })
    }]
  };
}

if (action === "remove") {
  var ri = params.chapterIndex;
  if (ri === undefined || ri === null || ri < 0 || ri >= chapters.length) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_sequence_builder", error: "Invalid chapter index" }) }] };
  }
  chapters.splice(ri, 1);
  for (var r = 0; r < chapters.length; r++) {
    chapters[r].index = r;
  }
  await ctx.store.set("chapters_" + projectId, chapters);

  var spec3 = calcPrintSpec(chapters);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_sequence_builder",
        projectId: projectId,
        action: "remove",
        chapters: chapters,
        totalChapters: chapters.length,
        totalAllocatedSpreads: spec3.totalAllocatedSpreads,
        targetSpreads: spec3.targetSpreads,
        printSpec: spec3
      })
    }]
  };
}

if (action === "reorder") {
  var from = params.moveFrom;
  var to = params.moveTo;
  if (from === undefined || to === undefined || from < 0 || from >= chapters.length || to < 0 || to >= chapters.length) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_sequence_builder", error: "Invalid reorder indices" }) }] };
  }
  var moved = chapters.splice(from, 1)[0];
  chapters.splice(to, 0, moved);
  for (var ri2 = 0; ri2 < chapters.length; ri2++) {
    chapters[ri2].index = ri2;
  }
  await ctx.store.set("chapters_" + projectId, chapters);

  var spec4 = calcPrintSpec(chapters);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_designer_sequence_builder",
        projectId: projectId,
        action: "reorder",
        chapters: chapters,
        totalChapters: chapters.length,
        totalAllocatedSpreads: spec4.totalAllocatedSpreads,
        targetSpreads: spec4.targetSpreads,
        printSpec: spec4
      })
    }]
  };
}

// Default: list
var spec5 = calcPrintSpec(chapters);
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_sequence_builder",
      projectId: projectId,
      action: "list",
      chapters: chapters,
      totalChapters: chapters.length,
      totalAllocatedSpreads: spec5.totalAllocatedSpreads,
      targetSpreads: spec5.targetSpreads,
      printSpec: spec5
    })
  }]
};

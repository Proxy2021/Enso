var filter = (params.filter || "").trim() || "all";

var allProjects = await ctx.store.get("album_projects") || {};
var projectIds = Object.keys(allProjects);

// Printer cost estimators
var PRINTER_COSTS = {
  saal_digital: { basePrice: 59.95, perPage: 1.25, currency: "EUR", label: "Saal Digital" },
  printique: { basePrice: 89.99, includedSpreads: 20, perExtraSpread: 1.99, currency: "USD", label: "Printique" },
  whitewall: { basePrice: 69.90, perPage: 1.50, currency: "EUR", label: "WhiteWall" }
};

var dashboardProjects = [];
var totalActive = 0;
var totalDone = 0;
var totalCost = 0;

for (var i = 0; i < projectIds.length; i++) {
  var proj = allProjects[projectIds[i]];
  var pid = proj.id || projectIds[i];

  // Load curation data
  var curation = await ctx.store.get("curation_" + pid) || {};
  var passes = curation.passes || [];
  var spreadsData = await ctx.store.get("spreads_" + pid) || [];
  var chaptersData = await ctx.store.get("chapters_" + pid) || [];

  // Calculate current photo count (last non-null remaining count)
  var currentCount = curation.startCount || proj.totalCandidates || 0;
  var finalCount = 0;
  for (var p = 0; p < passes.length; p++) {
    if (passes[p].remainingCount !== null) {
      currentCount = passes[p].remainingCount;
    }
    if (passes[p].completed && p === passes.length - 1) {
      finalCount = passes[p].remainingCount || 0;
    }
  }

  // Days remaining
  var daysRemaining = -1;
  if (proj.dueDate) {
    var due = new Date(proj.dueDate);
    var now = new Date();
    daysRemaining = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Cost estimate
  var printerKey = proj.printer || "saal_digital";
  var costInfo = PRINTER_COSTS[printerKey] || PRINTER_COSTS.saal_digital;
  var spreadCount = spreadsData.length || proj.targetSpreads || 35;
  var pageCount = spreadCount * 2;
  var estimatedCost = 0;

  if (printerKey === "printique") {
    var extraSpreads = Math.max(0, spreadCount - (costInfo.includedSpreads || 20));
    estimatedCost = costInfo.basePrice + (extraSpreads * costInfo.perExtraSpread);
  } else {
    estimatedCost = costInfo.basePrice + (pageCount * costInfo.perPage);
  }
  estimatedCost = Math.round(estimatedCost * 100) / 100;

  var projStatus = proj.status || "planning";
  if (projStatus === "done") {
    totalDone++;
  } else {
    totalActive++;
  }
  totalCost += estimatedCost;

  // Apply filter
  if (filter === "active" && projStatus === "done") continue;
  if (filter === "done" && projStatus !== "done") continue;

  dashboardProjects.push({
    id: pid,
    title: proj.title || "Untitled",
    recipient: proj.recipient || "",
    theme: proj.theme || "",
    status: projStatus,
    dueDate: proj.dueDate || "",
    occasion: proj.occasion || "",
    daysRemaining: daysRemaining,
    totalCandidates: curation.startCount || proj.totalCandidates || 0,
    currentCount: currentCount,
    finalCount: finalCount,
    targetImages: proj.targetImages || 60,
    curationProgress: curation.overallProgress || 0,
    spreadCount: spreadsData.length,
    chapterCount: chaptersData.length,
    targetSpreads: proj.targetSpreads || 35,
    estimatedCost: estimatedCost,
    currency: costInfo.currency,
    printer: costInfo.label,
    printerKey: printerKey,
    createdAt: proj.createdAt || ""
  });
}

// Sort: active projects first, then by due date (soonest first), then by name
dashboardProjects.sort(function(a, b) {
  if (a.status === "done" && b.status !== "done") return 1;
  if (a.status !== "done" && b.status === "done") return -1;
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return (a.title || "").localeCompare(b.title || "");
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_dashboard",
      filter: filter,
      projects: dashboardProjects,
      summary: {
        totalProjects: projectIds.length,
        activeProjects: totalActive,
        completedProjects: totalDone,
        totalEstimatedCost: Math.round(totalCost * 100) / 100
      }
    })
  }]
};

var entityId = (params.entityId || "").trim();
var entityType = (params.entityType || "").trim();
var focusIdParam = (params.focusId || "").trim();

if (!entityId || !entityType) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_launch",
    success: false,
    error: "Missing entityId or entityType parameter"
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";

// Mark as acted-on in store
if (focusIdParam) {
  var statusMap = await ctx.store.get("status_" + focusIdParam) || {};
  statusMap[entityId] = "acted_on";
  await ctx.store.set("status_" + focusIdParam, statusMap);
}

// Try to load entity from Cortex
var entityContent = "";
var entityTitle = "";
var entityFound = false;

// Determine entity path based on type
var typeDir = entityType === "app" ? "synthesis" :
              entityType === "article" ? "synthesis" :
              entityType === "idea" ? "synthesis" : "synthesis";

// Search for entity in wiki directories
var searchDirs = [
  homeDir + "/.enso/wiki/synthesis/",
  homeDir + "/.enso/wiki/entities/"
];

for (var si = 0; si < searchDirs.length; si++) {
  try {
    var dirResult = await ctx.listDir(searchDirs[si]);
    if (dirResult && Array.isArray(dirResult)) {
      for (var fi = 0; fi < dirResult.length; fi++) {
        var fname = dirResult[fi].name || dirResult[fi];
        if (typeof fname === "string" && fname.indexOf(entityId) >= 0) {
          var fileContent = await ctx.readFile(searchDirs[si] + fname);
          if (fileContent) {
            entityContent = typeof fileContent === "string" ? fileContent :
                          (fileContent.data || fileContent.content || "");
            entityTitle = fname.replace(/\.md$/, "").replace(/\.json$/, "");
            entityFound = true;
            break;
          }
        }
      }
    }
    if (entityFound) break;
  } catch(e) {}
}

// If not found by ID, try looking in focus-areas data
if (!entityFound) {
  try {
    var focusResult = await ctx.readFile(homeDir + "/.enso/data/focus-areas.json");
    var focusData = null;
    if (focusResult && typeof focusResult === "string") {
      focusData = JSON.parse(focusResult);
    } else if (focusResult && focusResult.success && focusResult.data) {
      focusData = typeof focusResult.data === "string" ? JSON.parse(focusResult.data) : focusResult.data;
    }

    if (focusData && focusData.areas) {
      for (var ai = 0; ai < focusData.areas.length; ai++) {
        var area = focusData.areas[ai];
        if (area.lastSprintSummary && area.lastSprintSummary.deliverables) {
          for (var di = 0; di < area.lastSprintSummary.deliverables.length; di++) {
            var del = area.lastSprintSummary.deliverables[di];
            if (del.entityId === entityId) {
              entityTitle = del.taskTitle;
              entityContent = "**" + del.taskTitle + "**\n\n" +
                "Pain Point: " + del.painPoint + "\n\n" +
                "How It Helps: " + del.howItHelps + "\n\n" +
                "Quick Start: " + del.quickStart;
              entityFound = true;
              break;
            }
          }
        }
        if (entityFound) break;
      }
    }
  } catch(e) {}
}

var actionLabel = entityType === "app" ? "Launched" :
                  entityType === "article" ? "Opened" :
                  entityType === "idea" ? "Exploring" : "Reviewing";

var result = {
  tool: "enso_sprint_results_launch",
  success: true,
  entityId: entityId,
  entityType: entityType,
  title: entityTitle || entityId,
  content: entityContent || "Entity content will be loaded when available.",
  found: entityFound,
  message: actionLabel + ": " + (entityTitle || entityId)
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

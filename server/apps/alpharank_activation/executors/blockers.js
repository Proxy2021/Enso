var action = (params.action || "list").trim();
var title = (params.title || "").trim();
var category = (params.category || "other").trim();
var description = (params.description || "").trim();
var solution = (params.solution || "").trim();
var blockerId = (params.blockerId || "").trim();
var hoursLost = params.hoursLost || 0;

var validCategories = ["data_quality", "package_compat", "config", "performance", "api", "other"];

// Load blockers
var blockers = await ctx.store.get("activation_blockers");
if (!blockers) {
  blockers = [];
}

if (action === "add") {
  if (!title) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_activation_blockers",
          success: false,
          error: "Title is required when adding a blocker"
        })
      }]
    };
  }

  if (validCategories.indexOf(category) === -1) {
    category = "other";
  }

  var newBlocker = {
    id: "blocker_" + Date.now(),
    title: title,
    category: category,
    description: description,
    hoursLost: hoursLost,
    status: "open",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    solution: null
  };

  blockers.push(newBlocker);
  await ctx.store.set("activation_blockers", blockers);

  // Compute stats
  var stats = computeStats(blockers);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_activation_blockers",
        action: "add",
        success: true,
        blocker: newBlocker,
        message: "Blocker added: " + title,
        blockers: blockers,
        stats: stats
      })
    }]
  };
}

if (action === "resolve") {
  if (!blockerId) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_activation_blockers",
          success: false,
          error: "blockerId is required when resolving a blocker"
        })
      }]
    };
  }

  var found = false;
  for (var r = 0; r < blockers.length; r++) {
    if (blockers[r].id === blockerId) {
      blockers[r].status = "resolved";
      blockers[r].resolvedAt = new Date().toISOString();
      blockers[r].solution = solution || "Resolved";
      found = true;
      break;
    }
  }

  if (!found) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_activation_blockers",
          success: false,
          error: "Blocker '" + blockerId + "' not found"
        })
      }]
    };
  }

  await ctx.store.set("activation_blockers", blockers);
  var stats2 = computeStats(blockers);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_activation_blockers",
        action: "resolve",
        success: true,
        blockerId: blockerId,
        message: "Blocker resolved",
        blockers: blockers,
        stats: stats2
      })
    }]
  };
}

// Default: list
var stats3 = computeStats(blockers);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_activation_blockers",
      action: "list",
      blockers: blockers,
      stats: stats3
    })
  }]
};

function computeStats(items) {
  var total = items.length;
  var open = 0;
  var resolved = 0;
  var totalHoursLost = 0;
  var byCategory = {};

  for (var i = 0; i < items.length; i++) {
    if (items[i].status === "open") open++;
    else resolved++;
    totalHoursLost += items[i].hoursLost || 0;
    var cat = items[i].category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  return {
    total: total,
    open: open,
    resolved: resolved,
    totalHoursLost: Math.round(totalHoursLost * 10) / 10,
    byCategory: byCategory
  };
}

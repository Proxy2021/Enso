var focusId = (params.focusId || "").trim();
var entityId = (params.entityId || "").trim();
var newStatus = (params.status || "").trim();

if (!focusId || !entityId || !newStatus) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_mark_status",
    success: false,
    error: "Missing required parameters: focusId, entityId, and status"
  }) }] };
}

var validStatuses = ["viewed", "acted_on"];
if (validStatuses.indexOf(newStatus) < 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_mark_status",
    success: false,
    error: "Invalid status. Use 'viewed' or 'acted_on'."
  }) }] };
}

// Load and update status map from store
var statusMap = await ctx.store.get("status_" + focusId) || {};

// Only escalate status (new -> viewed -> acted_on)
var statusRank = { "new": 0, "viewed": 1, "acted_on": 2 };
var currentStatus = statusMap[entityId] || "new";
var currentRank = statusRank[currentStatus] || 0;
var newRank = statusRank[newStatus] || 0;

if (newRank > currentRank) {
  statusMap[entityId] = newStatus;
  await ctx.store.set("status_" + focusId, statusMap);
}

// Count overall progress
var totalDeliverables = Object.keys(statusMap).length;
var viewedCount = 0;
var actedCount = 0;
var keys = Object.keys(statusMap);
for (var ki = 0; ki < keys.length; ki++) {
  if (statusMap[keys[ki]] === "viewed") viewedCount++;
  if (statusMap[keys[ki]] === "acted_on") actedCount++;
}

var result = {
  tool: "enso_sprint_results_mark_status",
  success: true,
  entityId: entityId,
  status: statusMap[entityId] || newStatus,
  message: "Deliverable marked as " + newStatus,
  progress: {
    total: totalDeliverables,
    viewed: viewedCount,
    actedOn: actedCount
  }
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };

var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var entityId = (params.entityId || "").trim();
var status = (params.status || "").trim();
var progress = (params.progress || "").trim();

var validStatuses = ["not_started", "in_progress", "completed", "dropped", "on_hold"];

if (!entityId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_status", error: "entityId is required", success: false })
    }]
  };
}

if (validStatuses.indexOf(status) === -1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_status", error: "Invalid status. Use: " + validStatuses.join(", "), success: false })
    }]
  };
}

var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_status", error: "Could not load entity index", success: false })
    }]
  };
}

if (!index[entityId]) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_status", error: "Entity not found: " + entityId, success: false })
    }]
  };
}

var entity = index[entityId];
var now = new Date().toISOString();
var oldStatus = entity.consumptionStatus || null;
entity.consumptionStatus = status;
entity.updatedAt = now;

if (progress) {
  entity.consumptionProgress = progress;
}

// Auto-set date fields based on status transitions
if (status === "in_progress" && !entity.dateStarted) {
  entity.dateStarted = now;
}
if (status === "completed") {
  entity.dateCompleted = now;
  if (!entity.dateStarted) entity.dateStarted = now;
}
if (status === "not_started") {
  delete entity.dateStarted;
  delete entity.dateCompleted;
  delete entity.consumptionProgress;
}

try {
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_status", error: "Failed to save: " + e.message, success: false })
    }]
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_status",
      entityId: entityId,
      title: entity.title,
      type: entity.type,
      consumptionStatus: entity.consumptionStatus,
      consumptionProgress: entity.consumptionProgress || null,
      dateStarted: entity.dateStarted || null,
      dateCompleted: entity.dateCompleted || null,
      previousStatus: oldStatus,
      success: true
    })
  }]
};

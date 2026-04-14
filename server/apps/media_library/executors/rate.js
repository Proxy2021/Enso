var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var entityId = (params.entityId || "").trim();
var rating = params.rating;
var notes = (params.notes || "").trim();

if (!entityId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "entityId is required", success: false })
    }]
  };
}

if (rating === undefined || rating === null || rating < 0 || rating > 10) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "rating must be 0-10", success: false })
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
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "Could not load entity index", success: false })
    }]
  };
}

if (!index[entityId]) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "Entity not found: " + entityId, success: false })
    }]
  };
}

var entity = index[entityId];
if (rating === 0) {
  delete entity.userRating;
  delete entity.userNotes;
} else {
  entity.userRating = rating;
  if (notes) entity.userNotes = notes;
}
entity.updatedAt = new Date().toISOString();

try {
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "Failed to save: " + e.message, success: false })
    }]
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_rate",
      entityId: entityId,
      title: entity.title,
      type: entity.type,
      userRating: entity.userRating || null,
      userNotes: entity.userNotes || null,
      success: true
    })
  }]
};

var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var entityId = (params.entityId || "").trim();
var favoriteParam = params.favorite;

if (!entityId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_favorite", error: "entityId is required", success: false })
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
      text: JSON.stringify({ tool: "enso_media_library_favorite", error: "Could not load entity index", success: false })
    }]
  };
}

if (!index[entityId]) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_favorite", error: "Entity not found: " + entityId, success: false })
    }]
  };
}

var entity = index[entityId];
if (favoriteParam === true || favoriteParam === false) {
  entity.isFavorite = favoriteParam;
} else {
  entity.isFavorite = !entity.isFavorite;
}
entity.updatedAt = new Date().toISOString();

try {
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_favorite", error: "Failed to save: " + e.message, success: false })
    }]
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_favorite",
      entityId: entityId,
      title: entity.title,
      type: entity.type,
      isFavorite: entity.isFavorite,
      success: true
    })
  }]
};

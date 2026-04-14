var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var type = (params.type || "").trim();
var title = (params.title || "").trim();
var imageUrl = (params.imageUrl || "").trim();
var tagsStr = (params.tags || "").trim();
var semanticTagsStr = (params.semanticTags || "").trim();

var validTypes = ["book", "movie", "tv-series", "documentary", "game", "album", "artist"];

if (!type || validTypes.indexOf(type) === -1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_add", error: "Valid type required: " + validTypes.join(", "), success: false })
    }]
  };
}

if (!title) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_add", error: "Title is required", success: false })
    }]
  };
}

// Generate slug
var slug = title.toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
  .replace(/^-|-$/g, "");
if (!slug) slug = "item-" + Date.now().toString(36);

var entityId = "manual:" + type + ":" + slug;

// Parse tags
var tags = [];
if (tagsStr) {
  var parts = tagsStr.split(",");
  for (var ti = 0; ti < parts.length; ti++) {
    var tag = parts[ti].trim();
    if (tag) tags.push(tag);
  }
}
tags.unshift(type);
tags.unshift("manual");

var semanticTags = [];
if (semanticTagsStr) {
  var sParts = semanticTagsStr.split(",");
  for (var si = 0; si < sParts.length; si++) {
    var sTag = sParts[si].trim();
    if (sTag) semanticTags.push(sTag);
  }
}

// Load index
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  index = {};
}

// Check for duplicate
if (index[entityId]) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_add", error: "Entity already exists: " + entityId, existingTitle: index[entityId].title, success: false })
    }]
  };
}

var now = new Date().toISOString();
var entity = {
  entityId: entityId,
  type: type,
  source: "manual",
  title: title,
  slug: slug,
  tags: tags,
  semanticTags: semanticTags,
  crossReferences: [],
  createdAt: now,
  updatedAt: now
};
if (imageUrl) entity.imageUrl = imageUrl;

index[entityId] = entity;

try {
  var dir = path.dirname(indexPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_add", error: "Failed to save: " + e.message, success: false })
    }]
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_add",
      entityId: entityId,
      type: type,
      title: title,
      tags: tags,
      semanticTags: semanticTags,
      success: true
    })
  }]
};

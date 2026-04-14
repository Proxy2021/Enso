var fs = require("fs");
var path = require("path");
var os = require("os");

var colDir = path.join(os.homedir(), ".enso", "data", "media-library");
var colPath = path.join(colDir, "collections.json");
var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var action = (params.action || "").trim() || "list";
var collectionId = (params.collectionId || "").trim();
var name = (params.name || "").trim();
var description = (params.description || "").trim();
var entityId = (params.entityId || "").trim();

// Load collections
var colData = { collections: [] };
try {
  var raw = fs.readFileSync(colPath, "utf8");
  colData = JSON.parse(raw);
  if (!colData.collections) colData.collections = [];
} catch (e) {
  colData = { collections: [] };
}

// Helper to save collections
var saveCollections = function() {
  try {
    fs.mkdirSync(colDir, { recursive: true });
    fs.writeFileSync(colPath, JSON.stringify(colData, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
};

// Helper to generate ID from name
var slugify = function(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

if (action === "create") {
  if (!name) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Collection name is required", success: false }) }] };
  }
  var newId = slugify(name) + "-" + Date.now().toString(36);
  var newCol = {
    id: newId,
    name: name,
    description: description || "",
    createdAt: new Date().toISOString(),
    entityIds: []
  };
  colData.collections.push(newCol);
  if (!saveCollections()) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Failed to save", success: false }) }] };
  }
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, collection: newCol, success: true }) }] };

} else if (action === "list") {
  var list = [];
  for (var li = 0; li < colData.collections.length; li++) {
    var c = colData.collections[li];
    list.push({ id: c.id, name: c.name, description: c.description, itemCount: (c.entityIds || []).length, createdAt: c.createdAt });
  }
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, collections: list }) }] };

} else if (action === "view") {
  if (!collectionId) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "collectionId is required", success: false }) }] };
  }
  var found = null;
  for (var vi = 0; vi < colData.collections.length; vi++) {
    if (colData.collections[vi].id === collectionId) { found = colData.collections[vi]; break; }
  }
  if (!found) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Collection not found", success: false }) }] };
  }
  // Resolve entities
  var index = {};
  try { index = JSON.parse(fs.readFileSync(indexPath, "utf8")); } catch (e) {}
  var resolvedItems = [];
  var ids = found.entityIds || [];
  for (var ri = 0; ri < ids.length; ri++) {
    var ent = index[ids[ri]];
    if (ent) {
      resolvedItems.push({ entityId: ent.entityId, type: ent.type, title: ent.title, imageUrl: ent.imageUrl || null, userRating: ent.userRating || null, isFavorite: !!ent.isFavorite, consumptionStatus: ent.consumptionStatus || null });
    } else {
      resolvedItems.push({ entityId: ids[ri], type: "unknown", title: ids[ri], missing: true });
    }
  }
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, collection: { id: found.id, name: found.name, description: found.description, createdAt: found.createdAt }, items: resolvedItems, itemCount: resolvedItems.length }) }] };

} else if (action === "add_item") {
  if (!collectionId || !entityId) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "collectionId and entityId are required", success: false }) }] };
  }
  var targetCol = null;
  for (var ai = 0; ai < colData.collections.length; ai++) {
    if (colData.collections[ai].id === collectionId) { targetCol = colData.collections[ai]; break; }
  }
  if (!targetCol) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Collection not found", success: false }) }] };
  }
  if (!targetCol.entityIds) targetCol.entityIds = [];
  if (targetCol.entityIds.indexOf(entityId) === -1) {
    targetCol.entityIds.push(entityId);
  }
  if (!saveCollections()) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Failed to save", success: false }) }] };
  }
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, collectionId: collectionId, entityId: entityId, itemCount: targetCol.entityIds.length, success: true }) }] };

} else if (action === "remove_item") {
  if (!collectionId || !entityId) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "collectionId and entityId are required", success: false }) }] };
  }
  var remCol = null;
  for (var rmi = 0; rmi < colData.collections.length; rmi++) {
    if (colData.collections[rmi].id === collectionId) { remCol = colData.collections[rmi]; break; }
  }
  if (!remCol) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Collection not found", success: false }) }] };
  }
  var eids = remCol.entityIds || [];
  var idx = eids.indexOf(entityId);
  if (idx !== -1) eids.splice(idx, 1);
  remCol.entityIds = eids;
  if (!saveCollections()) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Failed to save", success: false }) }] };
  }
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, collectionId: collectionId, entityId: entityId, itemCount: remCol.entityIds.length, success: true }) }] };

} else if (action === "delete") {
  if (!collectionId) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "collectionId is required", success: false }) }] };
  }
  var delIdx = -1;
  for (var di = 0; di < colData.collections.length; di++) {
    if (colData.collections[di].id === collectionId) { delIdx = di; break; }
  }
  if (delIdx === -1) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Collection not found", success: false }) }] };
  }
  var deleted = colData.collections.splice(delIdx, 1)[0];
  if (!saveCollections()) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Failed to save", success: false }) }] };
  }
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, collectionId: collectionId, deletedName: deleted.name, success: true }) }] };

} else {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_media_library_collection", action: action, error: "Unknown action. Use: create, list, view, add_item, remove_item, delete", success: false }) }] };
}

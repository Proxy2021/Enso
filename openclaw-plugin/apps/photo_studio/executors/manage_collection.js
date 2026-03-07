var action = (params.action || "").trim() || "list";
var name = (params.name || "").trim();
var newName = (params.newName || "").trim();
var photoId = (params.photoId || "").trim();

// Load collections
var colStored = await ctx.store.get("collections");
var collections = {};
if (colStored) {
  try { collections = JSON.parse(colStored); } catch(e) { collections = {}; }
}

// Load photos for resolving items
var photosStored = await ctx.store.get("photos");
var photos = [];
if (photosStored) {
  try { photos = JSON.parse(photosStored); } catch(e) { photos = []; }
}

var message = "";

if (action === "create") {
  if (!name) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_photo_studio_manage_collection", error: "Collection name is required" }) }] };
  }
  if (collections[name]) {
    message = "Collection '" + name + "' already exists.";
  } else {
    collections[name] = { name: name, photoIds: [], createdAt: new Date().toISOString() };
    await ctx.store.set("collections", JSON.stringify(collections));
    message = "Collection '" + name + "' created.";
  }
  action = "list";
}

if (action === "rename") {
  if (collections[name] && newName) {
    collections[newName] = collections[name];
    collections[newName].name = newName;
    delete collections[name];
    await ctx.store.set("collections", JSON.stringify(collections));
    message = "Renamed '" + name + "' to '" + newName + "'.";
  }
  action = "list";
}

if (action === "delete") {
  if (collections[name]) {
    delete collections[name];
    await ctx.store.set("collections", JSON.stringify(collections));
    message = "Collection '" + name + "' deleted.";
  }
  action = "list";
}

if (action === "add") {
  if (collections[name] && photoId) {
    if (collections[name].photoIds.indexOf(photoId) === -1) {
      collections[name].photoIds.push(photoId);
      await ctx.store.set("collections", JSON.stringify(collections));
      message = "Photo added to '" + name + "'.";
    }
  }
  action = "list";
}

if (action === "remove") {
  if (collections[name] && photoId) {
    var idx = collections[name].photoIds.indexOf(photoId);
    if (idx !== -1) {
      collections[name].photoIds.splice(idx, 1);
      await ctx.store.set("collections", JSON.stringify(collections));
      message = "Photo removed from '" + name + "'.";
    }
  }
  action = "list";
}

if (action === "view" && name && collections[name]) {
  var col = collections[name];
  var items = [];
  for (var i = 0; i < (col.photoIds || []).length; i++) {
    var pid = col.photoIds[i];
    for (var j = 0; j < photos.length; j++) {
      if (photos[j].id === pid) {
        items.push(photos[j]);
        break;
      }
    }
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_manage_collection",
        action: "view",
        name: name,
        items: items
      })
    }]
  };
}

// List view
var colList = [];
var colKeys = Object.keys(collections);
for (var c = 0; c < colKeys.length; c++) {
  var col = collections[colKeys[c]];
  var coverUrl = "";
  if (col.photoIds && col.photoIds.length > 0) {
    for (var p = 0; p < photos.length; p++) {
      if (photos[p].id === col.photoIds[0]) {
        coverUrl = photos[p].url || "";
        break;
      }
    }
  }
  colList.push({
    name: col.name,
    count: (col.photoIds || []).length,
    coverUrl: coverUrl,
    createdAt: col.createdAt || ""
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_manage_collection",
      action: "list",
      message: message,
      collections: colList
    })
  }]
};
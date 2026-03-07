var action = (params.action || "").trim() || "list";
var name = (params.name || "").trim();
var newName = (params.newName || "").trim();
var photoPath = (params.photoId || "").trim();

// Load collections (store file paths instead of IDs)
var colStored = await ctx.store.get("collections");
var collections = {};
if (colStored) {
  try { collections = JSON.parse(colStored); } catch(e) { collections = {}; }
}

var message = "";

if (action === "create") {
  if (!name) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_photo_studio_manage_collection", error: "Collection name is required" }) }] };
  }
  if (collections[name]) {
    message = "Collection '" + name + "' already exists.";
  } else {
    collections[name] = { name: name, photoPaths: [], createdAt: new Date().toISOString() };
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
  if (collections[name] && photoPath) {
    var paths = collections[name].photoPaths || collections[name].photoIds || [];
    if (paths.indexOf(photoPath) === -1) {
      paths.push(photoPath);
      collections[name].photoPaths = paths;
      await ctx.store.set("collections", JSON.stringify(collections));
      message = "Photo added to '" + name + "'.";
    }
  }
  action = "list";
}

if (action === "remove") {
  if (collections[name] && photoPath) {
    var paths = collections[name].photoPaths || collections[name].photoIds || [];
    var idx = paths.indexOf(photoPath);
    if (idx !== -1) {
      paths.splice(idx, 1);
      collections[name].photoPaths = paths;
      await ctx.store.set("collections", JSON.stringify(collections));
      message = "Photo removed from '" + name + "'.";
    }
  }
  action = "list";
}

if (action === "view" && name && collections[name]) {
  var col = collections[name];
  var photoPaths = col.photoPaths || col.photoIds || [];
  var items = [];
  for (var i = 0; i < photoPaths.length; i++) {
    var viewResult = await ctx.callTool("enso_media_view_photo", { path: photoPaths[i] });
    if (viewResult.success && viewResult.data) {
      items.push({
        id: photoPaths[i],
        name: viewResult.data.name,
        url: viewResult.data.mediaUrl,
        path: photoPaths[i],
        size: viewResult.data.size
      });
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
  var photoPaths = col.photoPaths || col.photoIds || [];
  var coverUrl = "";
  // Get cover from first photo in collection
  if (photoPaths.length > 0) {
    var coverResult = await ctx.callTool("enso_media_view_photo", { path: photoPaths[0] });
    if (coverResult.success && coverResult.data) {
      coverUrl = coverResult.data.mediaUrl || "";
    }
  }
  colList.push({
    name: col.name,
    count: photoPaths.length,
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

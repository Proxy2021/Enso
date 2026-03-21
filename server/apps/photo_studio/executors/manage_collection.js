var action = (params.action || "").trim() || "list";
var name = (params.name || "").trim();
var newName = (params.newName || "").trim();
var photoPath = (params.photoId || "").trim();

// ── One-time migration from ctx.store to native tool ──
var migrated = await ctx.store.get("collections_migrated");
if (!migrated) {
  var legacyStored = await ctx.store.get("collections");
  if (legacyStored) {
    try {
      var legacy = JSON.parse(legacyStored);
      var legacyKeys = Object.keys(legacy);
      for (var i = 0; i < legacyKeys.length; i++) {
        var col = legacy[legacyKeys[i]];
        await ctx.callTool("enso_media_manage_collection", {
          action: "create",
          collectionName: col.name
        });
        var paths = col.photoPaths || col.photoIds || [];
        for (var j = 0; j < paths.length; j++) {
          await ctx.callTool("enso_media_manage_collection", {
            action: "add",
            collectionName: col.name,
            photoPath: paths[j]
          });
        }
      }
    } catch(e) { /* migration best-effort */ }
  }
  await ctx.store.set("collections_migrated", "true");
}

// ── Delegate to native tool ──
var nativeParams = { action: action };
if (name) nativeParams.collectionName = name;
if (newName) nativeParams.newName = newName;
if (photoPath) nativeParams.photoPath = photoPath;

var result = await ctx.callTool("enso_media_manage_collection", nativeParams);

if (!result || !result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_manage_collection",
        error: (result && result.error) || "Collection operation failed",
        action: action
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Ensure the tool identity is preserved for template routing
data.tool = "enso_photo_studio_manage_collection";

return { content: [{ type: "text", text: JSON.stringify(data) }] };

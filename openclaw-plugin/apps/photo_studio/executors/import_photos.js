var urlsRaw = (params.urls || "").trim();
var collection = (params.collection || "").trim();

// Load existing photos from store
var stored = await ctx.store.get("photos");
var photos = [];
if (stored) {
  try { photos = JSON.parse(stored); } catch(e) { photos = []; }
}

// Parse new URLs if provided
if (urlsRaw) {
  var newUrls = urlsRaw.split(/[\n,]+/).map(function(u) { return u.trim(); }).filter(function(u) { return u.length > 0; });

  for (var i = 0; i < newUrls.length; i++) {
    var url = newUrls[i];
    var name = url.split("/").pop().split("?")[0] || ("photo_" + Date.now() + "_" + i + ".jpg");
    var id = "p_" + Date.now() + "_" + i;

    // Try to get image info
    var dimensions = "";
    try {
      var resp = await ctx.fetch(url, { method: "HEAD" });
      if (resp.ok && resp.headers) {
        // Best effort — dimensions may not be available from HEAD
      }
    } catch(e) { /* ignore */ }

    var photo = {
      id: id,
      name: name,
      url: url,
      dimensions: dimensions || "Unknown",
      importedAt: new Date().toISOString(),
      styledVersions: 0,
      size: 0
    };

    photos.push(photo);
  }

  // Save updated photos
  await ctx.store.set("photos", JSON.stringify(photos));

  // Add to collection if specified
  if (collection) {
    var colStored = await ctx.store.get("collections");
    var collections = {};
    if (colStored) {
      try { collections = JSON.parse(colStored); } catch(e) { collections = {}; }
    }
    if (!collections[collection]) {
      collections[collection] = { name: collection, photoIds: [], createdAt: new Date().toISOString() };
    }
    for (var j = 0; j < photos.length; j++) {
      if (collections[collection].photoIds.indexOf(photos[j].id) === -1) {
        collections[collection].photoIds.push(photos[j].id);
      }
    }
    await ctx.store.set("collections", JSON.stringify(collections));
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_import_photos",
      total: photos.length,
      photos: photos.slice(-50)
    })
  }]
};
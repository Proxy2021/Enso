var collection = (params.collection || "").trim();
var photoIdsRaw = (params.photoIds || "").trim();
var style = (params.style || "").trim() || "watercolor";
var intensity = params.intensity || 75;

// Load photos
var stored = await ctx.store.get("photos");
var photos = [];
if (stored) {
  try { photos = JSON.parse(stored); } catch(e) { photos = []; }
}

// Determine which photos to process
var targetIds = [];
if (collection) {
  var colStored = await ctx.store.get("collections");
  var collections = {};
  if (colStored) {
    try { collections = JSON.parse(colStored); } catch(e) { collections = {}; }
  }
  if (collections[collection] && collections[collection].photoIds) {
    targetIds = collections[collection].photoIds;
  }
} else if (photoIdsRaw) {
  targetIds = photoIdsRaw.split(",").map(function(id) { return id.trim(); }).filter(function(id) { return id.length > 0; });
} else {
  // Process all photos
  targetIds = photos.map(function(p) { return p.id; });
}

var results = [];
var completed = 0;

for (var i = 0; i < targetIds.length; i++) {
  var pid = targetIds[i];
  var photo = null;
  for (var j = 0; j < photos.length; j++) {
    if (photos[j].id === pid) { photo = photos[j]; break; }
  }
  if (!photo) {
    results.push({ id: pid, name: "Unknown", status: "error", error: "Photo not found" });
    continue;
  }

  // Create styled version
  var stylesStored = await ctx.store.get("styles_" + pid);
  var versions = [];
  if (stylesStored) {
    try { versions = JSON.parse(stylesStored); } catch(e) { versions = []; }
  }

  var styledId = "s_" + Date.now() + "_" + i;
  versions.push({
    id: styledId,
    style: style,
    intensity: intensity,
    url: photo.url,
    createdAt: new Date().toISOString()
  });
  await ctx.store.set("styles_" + pid, JSON.stringify(versions));

  // Update photo styled count
  for (var k = 0; k < photos.length; k++) {
    if (photos[k].id === pid) {
      photos[k].styledVersions = versions.length;
      break;
    }
  }

  completed++;
  results.push({
    id: pid,
    name: photo.name,
    originalUrl: photo.url,
    styledUrl: photo.url,
    status: "success"
  });
}

await ctx.store.set("photos", JSON.stringify(photos));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_batch_process",
      collection: collection || null,
      style: style,
      intensity: intensity,
      total: targetIds.length,
      completed: completed,
      status: "complete",
      results: results
    })
  }]
};
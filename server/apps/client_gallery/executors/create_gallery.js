var name = (params.name || "").trim();
var clientName = (params.clientName || "").trim();
var description = (params.description || "").trim();
var coverPhotoUrl = (params.coverPhotoUrl || "").trim();

// Load existing galleries index
var indexRaw = await ctx.store.get("galleries_index");
var galleries = [];
try { galleries = indexRaw ? JSON.parse(indexRaw) : []; } catch(e) { galleries = []; }

if (name && clientName) {
  // Create new gallery
  var id = "gal_" + Math.random().toString(36).substring(2, 10);
  var now = Date.now();

  var gallery = {
    id: id,
    name: name,
    clientName: clientName,
    description: description,
    coverPhotoUrl: coverPhotoUrl,
    status: "draft",
    photos: [],
    downloads: [],
    createdAt: now,
    updatedAt: now
  };

  // Store full gallery data
  await ctx.store.set("gallery_" + id, JSON.stringify(gallery));

  // Update index
  galleries.push({
    id: id,
    name: name,
    clientName: clientName,
    description: description,
    coverPhotoUrl: coverPhotoUrl,
    status: "draft",
    photoCount: 0,
    totalDownloads: 0,
    createdAt: now
  });
  await ctx.store.set("galleries_index", JSON.stringify(galleries));

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_create_gallery",
        action: "list",
        galleries: galleries,
        message: "Gallery '" + name + "' created successfully"
      })
    }]
  };
}

// No params = list galleries
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_client_gallery_create_gallery",
      action: "list",
      galleries: galleries
    })
  }]
};
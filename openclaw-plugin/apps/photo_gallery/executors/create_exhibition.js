var title = (params.title || "").trim() || "Untitled Exhibition";
var description = (params.description || "").trim();
var collection = (params.collection || "").trim();
var photoIds = (params.photoIds || "").trim();
var layout = (params.layout || "").trim() || "museum";

// Load photos from store
var storeKey = collection ? "collection_" + collection : "all_photos";
var stored = await ctx.store.get(storeKey);
var allPhotos = [];

if (stored) {
  try {
    allPhotos = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!Array.isArray(allPhotos)) allPhotos = [];
  } catch(e) { allPhotos = []; }
}

var exhibitPhotos = allPhotos;

// Filter by specific IDs if provided
if (photoIds) {
  var ids = photoIds.split(",").map(function(id) { return id.trim(); });
  exhibitPhotos = allPhotos.filter(function(p) { return ids.indexOf(p.id) >= 0; });
}

// If no description provided, ask AI to generate one
if (!description && exhibitPhotos.length > 0) {
  var photoSummary = exhibitPhotos.map(function(p) {
    return (p.title || p.name) + " (" + (p.style || "unspecified style") + ")";
  }).join(", ");

  var aiResult = await ctx.ask(
    "Write a brief 1-2 sentence curatorial statement for a photo exhibition titled '" + title +
    "' featuring these works: " + photoSummary +
    ". Be poetic and evocative. Return only the statement text, no quotes."
  );
  if (aiResult.ok && aiResult.text) {
    description = aiResult.text.trim();
  }
}

// Save exhibition to store
var exhibitions = await ctx.store.get("exhibitions") || [];
if (typeof exhibitions === "string") {
  try { exhibitions = JSON.parse(exhibitions); } catch(e) { exhibitions = []; }
}
var exhibition = {
  id: "ex_" + Date.now(),
  title: title,
  description: description,
  layout: layout,
  photoIds: exhibitPhotos.map(function(p) { return p.id; }),
  createdAt: new Date().toISOString()
};
exhibitions.push(exhibition);
await ctx.store.set("exhibitions", JSON.stringify(exhibitions));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_gallery_create_exhibition",
      title: title,
      description: description,
      layout: layout,
      curator: "AI Curator",
      photos: exhibitPhotos
    })
  }]
};

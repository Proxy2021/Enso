var collection = (params.collection || "").trim();
var query = (params.query || "").trim();
var filterStyle = (params.filterStyle || "").trim();
var tags = (params.tags || "").trim();
var dateFrom = (params.dateFrom || "").trim();
var dateTo = (params.dateTo || "").trim();
var limit = typeof params.limit === "number" ? params.limit : 30;

// Load all photos
var storeKey = collection ? "collection_" + collection : "all_photos";
var stored = await ctx.store.get(storeKey);
var allPhotos = [];

if (stored) {
  try {
    allPhotos = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!Array.isArray(allPhotos)) allPhotos = [];
  } catch(e) { allPhotos = []; }
}

var totalScanned = allPhotos.length;
var results = allPhotos;

// Filter by style
if (filterStyle) {
  results = results.filter(function(p) {
    return (p.style || "").toLowerCase() === filterStyle.toLowerCase();
  });
}

// Filter by tags
if (tags) {
  var tagList = tags.split(",").map(function(t) { return t.trim().toLowerCase(); });
  results = results.filter(function(p) {
    var pTags = (p.tags || []).map(function(t) { return t.toLowerCase(); });
    return tagList.some(function(t) { return pTags.indexOf(t) >= 0; });
  });
}

// Filter by date range
if (dateFrom) {
  var from = new Date(dateFrom);
  results = results.filter(function(p) { return new Date(p.date || 0) >= from; });
}
if (dateTo) {
  var to = new Date(dateTo);
  results = results.filter(function(p) { return new Date(p.date || 0) <= to; });
}

// Text search across title, description, tags, style
if (query) {
  var q = query.toLowerCase();
  results = results.filter(function(p) {
    return (p.title || "").toLowerCase().indexOf(q) >= 0 ||
      (p.description || "").toLowerCase().indexOf(q) >= 0 ||
      (p.style || "").toLowerCase().indexOf(q) >= 0 ||
      (p.name || "").toLowerCase().indexOf(q) >= 0 ||
      (p.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) >= 0; });
  });

  // Add match reasons
  results = results.map(function(p) {
    var reasons = [];
    if ((p.title || "").toLowerCase().indexOf(q) >= 0) reasons.push("title");
    if ((p.description || "").toLowerCase().indexOf(q) >= 0) reasons.push("description");
    if ((p.style || "").toLowerCase().indexOf(q) >= 0) reasons.push("style");
    if ((p.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) >= 0; })) reasons.push("tags");
    p.matchReason = reasons.join(", ");
    return p;
  });
}

// Apply limit
if (results.length > limit) {
  results = results.slice(0, limit);
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_gallery_filter_collection",
      collection: collection || null,
      query: query || null,
      filterStyle: filterStyle || null,
      totalScanned: totalScanned,
      results: results
    })
  }]
};

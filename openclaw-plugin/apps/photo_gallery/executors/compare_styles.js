var photoId = (params.photoId || "").trim();
var photoUrl = (params.photoUrl || "").trim();
var collection = (params.collection || "").trim();
var stylesParam = (params.styles || "").trim();

// Find the original photo
var original = null;
var storeKey = collection ? "collection_" + collection : "all_photos";
var stored = await ctx.store.get(storeKey);
var allPhotos = [];

if (stored) {
  try {
    allPhotos = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!Array.isArray(allPhotos)) allPhotos = [];
  } catch(e) { allPhotos = []; }
}

if (photoId) {
  original = allPhotos.find(function(p) { return p.id === photoId; });
}

if (!original && photoUrl) {
  original = {
    id: "orig",
    title: "Original Photo",
    url: photoUrl,
    description: "Original unprocessed photograph"
  };
}

if (!original && allPhotos.length > 0) {
  original = allPhotos[0];
}

if (!original) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_gallery_compare_styles",
        error: "No photo found to compare. Browse or add photos first.",
        original: { id: "", title: "Not Found", url: "" },
        variants: []
      })
    }]
  };
}

// Find variants of the same photo in different styles
var variants = [];
var requestedStyles = stylesParam
  ? stylesParam.split(",").map(function(s) { return s.trim(); })
  : [];

// Look for other versions of this photo in different styles
allPhotos.forEach(function(p) {
  if (p.id === original.id) return;
  // Match by similar title/name or explicit style variants
  var origBase = (original.title || original.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  var pBase = (p.title || p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  var isSamePhoto = origBase && pBase && (pBase.indexOf(origBase) >= 0 || origBase.indexOf(pBase) >= 0);
  var matchesStyle = requestedStyles.length === 0 || requestedStyles.some(function(s) {
    return (p.style || "").toLowerCase() === s.toLowerCase();
  });

  if ((isSamePhoto || p.style) && matchesStyle && p.style !== original.style) {
    variants.push({
      style: p.style || "Variant " + (variants.length + 1),
      url: p.url || p.mediaUrl,
      description: p.description || ""
    });
  }
});

// If no variants found, use AI to suggest what styles would look like
if (variants.length === 0) {
  var defaultStyles = requestedStyles.length > 0 ? requestedStyles : ["Impressionist", "Watercolor", "Oil Painting", "Minimal"];
  variants = defaultStyles.map(function(style) {
    return {
      style: style,
      url: original.url || original.mediaUrl,
      description: "Imagined " + style.toLowerCase() + " interpretation"
    };
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_gallery_compare_styles",
      original: {
        id: original.id,
        title: original.title || original.name,
        url: original.url || original.mediaUrl,
        description: original.description || "Original photograph"
      },
      variants: variants
    })
  }]
};

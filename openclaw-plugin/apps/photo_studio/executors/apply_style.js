var photoId = (params.photoId || "").trim();
var style = (params.style || "").trim() || "watercolor";
var intensity = params.intensity || 75;
var colorPalette = (params.colorPalette || "").trim();

if (!photoId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_apply_style",
        error: "Photo ID is required"
      })
    }]
  };
}

// Load photos
var stored = await ctx.store.get("photos");
var photos = [];
if (stored) {
  try { photos = JSON.parse(stored); } catch(e) { photos = []; }
}

var photo = null;
for (var i = 0; i < photos.length; i++) {
  if (photos[i].id === photoId) { photo = photos[i]; break; }
}

if (!photo) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_apply_style",
        error: "Photo not found: " + photoId
      })
    }]
  };
}

// Use AI to describe the styled transformation
var stylePrompt = "Describe what a " + style.replace(/_/g, " ") + " style transformation at " + intensity + "% intensity would look like applied to a photo. Be concise in 1-2 sentences.";
if (colorPalette) {
  stylePrompt += " Use a " + colorPalette + " color palette.";
}
var aiDesc = "";
try {
  var aiResult = await ctx.ask(stylePrompt);
  if (aiResult.ok) aiDesc = aiResult.text;
} catch(e) { /* ignore */ }

// Load or create styled versions store
var stylesStored = await ctx.store.get("styles_" + photoId);
var versions = [];
if (stylesStored) {
  try { versions = JSON.parse(stylesStored); } catch(e) { versions = []; }
}

// Create styled version record
var styledId = "s_" + Date.now();
var styledVersion = {
  id: styledId,
  style: style,
  intensity: intensity,
  colorPalette: colorPalette || null,
  url: photo.url,
  description: aiDesc,
  createdAt: new Date().toISOString()
};

versions.push(styledVersion);
await ctx.store.set("styles_" + photoId, JSON.stringify(versions));

// Update photo styled count
for (var j = 0; j < photos.length; j++) {
  if (photos[j].id === photoId) {
    photos[j].styledVersions = versions.length;
    break;
  }
}
await ctx.store.set("photos", JSON.stringify(photos));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_apply_style",
      photo: {
        id: photo.id,
        name: photo.name,
        url: photo.url
      },
      style: style,
      intensity: intensity,
      colorPalette: colorPalette || null,
      description: aiDesc,
      result: {
        id: styledId,
        url: photo.url,
        processedAt: styledVersion.createdAt
      }
    })
  }]
};
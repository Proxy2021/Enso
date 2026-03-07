var photoPath = (params.photoId || "").trim();
var style = (params.style || "").trim() || "watercolor";
var intensity = params.intensity || 75;
var colorPalette = (params.colorPalette || "").trim();

if (!photoPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_apply_style",
        error: "Photo path is required"
      })
    }]
  };
}

// Get photo details from filesystem via native tool
var viewResult = await ctx.callTool("enso_media_view_photo", { path: photoPath });
if (!viewResult.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_apply_style",
        error: "Photo not found: " + photoPath
      })
    }]
  };
}

var photo = viewResult.data;

// Use AI to describe the styled transformation
var stylePrompt = "Describe what a " + style.replace(/_/g, " ") + " style transformation at " + intensity + "% intensity would look like applied to a photo named '" + photo.name + "'. Be concise in 1-2 sentences.";
if (colorPalette) {
  stylePrompt += " Use a " + colorPalette + " color palette.";
}
var aiDesc = "";
try {
  var aiResult = await ctx.ask(stylePrompt);
  if (aiResult.ok) aiDesc = aiResult.text;
} catch(e) { /* ignore */ }

// Load or create styled versions for this photo path
var storeKey = "styles:" + photoPath;
var stylesStored = await ctx.store.get(storeKey);
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
  url: photo.mediaUrl,
  description: aiDesc,
  createdAt: new Date().toISOString()
};

versions.push(styledVersion);
await ctx.store.set(storeKey, JSON.stringify(versions));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_apply_style",
      photo: {
        id: photoPath,
        name: photo.name,
        url: photo.mediaUrl,
        path: photoPath,
        size: photo.size,
        dimensions: photo.dimensions || ""
      },
      style: style,
      intensity: intensity,
      colorPalette: colorPalette || null,
      description: aiDesc,
      result: {
        id: styledId,
        url: photo.mediaUrl,
        processedAt: styledVersion.createdAt
      }
    })
  }]
};

var photoPath = (params.path || "").trim();

if (!photoPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_adjust",
        error: "Photo path is required"
      })
    }]
  };
}

// Get photo details
var viewResult = await ctx.callTool("enso_media_view_photo", { path: photoPath });
if (!viewResult.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_adjust",
        error: "Photo not found: " + photoPath
      })
    }]
  };
}

var photo = viewResult.data;

// Collect adjustment values from params
var adjustments = {
  brightness: typeof params.brightness === "number" ? params.brightness : 0,
  contrast: typeof params.contrast === "number" ? params.contrast : 0,
  saturation: typeof params.saturation === "number" ? params.saturation : 0,
  temperature: typeof params.temperature === "number" ? params.temperature : 0,
  grain: typeof params.grain === "number" ? params.grain : 0,
  vignette: typeof params.vignette === "number" ? params.vignette : 0,
  fade: typeof params.fade === "number" ? params.fade : 0
};

// Store adjustments for this photo
var storeKey = "adjustments:" + photoPath;
await ctx.store.set(storeKey, JSON.stringify(adjustments));

// Use AI to describe the adjustment effect
var nonZero = Object.entries(adjustments).filter(function(e) { return e[1] !== 0; });
var desc = "";
if (nonZero.length > 0) {
  var adjDesc = nonZero.map(function(e) { return e[0] + ": " + (e[1] > 0 ? "+" : "") + e[1]; }).join(", ");
  try {
    var aiResult = await ctx.ask("Briefly describe the visual effect of these photo adjustments: " + adjDesc + ". Be concise in 1 sentence.");
    if (aiResult.ok) desc = aiResult.text;
  } catch(e) { /* ignore */ }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_adjust",
      path: photoPath,
      outputPath: photo.mediaUrl || photoPath,
      name: photo.name,
      mediaUrl: photo.mediaUrl,
      width: photo.width || 0,
      height: photo.height || 0,
      adjustments: adjustments,
      description: desc
    })
  }]
};

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

// Collect adjustment values from params (clamp to valid ranges)
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
var adjustments = {
  brightness: typeof params.brightness === "number" ? clamp(params.brightness, -100, 100) : 0,
  contrast: typeof params.contrast === "number" ? clamp(params.contrast, -100, 100) : 0,
  saturation: typeof params.saturation === "number" ? clamp(params.saturation, -100, 100) : 0,
  temperature: typeof params.temperature === "number" ? clamp(params.temperature, -100, 100) : 0,
  grain: typeof params.grain === "number" ? clamp(params.grain, 0, 100) : 0,
  vignette: typeof params.vignette === "number" ? clamp(params.vignette, 0, 100) : 0,
  fade: typeof params.fade === "number" ? clamp(params.fade, 0, 100) : 0
};

// Store adjustments for this photo
var storeKey = "adjustments:" + photoPath;
await ctx.store.set(storeKey, JSON.stringify(adjustments));

// Check if any adjustments are non-zero — if so, apply them via the processing engine
var nonZero = Object.entries(adjustments).filter(function(e) { return e[1] !== 0; });
var outputMediaUrl = photo.mediaUrl || photoPath;
var outputPath = photoPath;
var outputWidth = photo.width || 0;
var outputHeight = photo.height || 0;

if (nonZero.length > 0) {
  // Apply adjustments using the processing engine with a "custom" style + adjustment overrides
  try {
    var processResult = await ctx.callTool("enso_media_process_single_photo", {
      inputFile: photoPath,
      style: "custom",
      adjustments: adjustments
    });

    if (processResult && processResult.success) {
      var procData = processResult.data || processResult;
      if (typeof procData === "string") {
        try { procData = JSON.parse(procData); } catch(e) { procData = {}; }
      }
      outputMediaUrl = procData.mediaUrl || procData.thumbUrl || outputMediaUrl;
      outputPath = procData.outputFile || outputPath;
      outputWidth = procData.width || outputWidth;
      outputHeight = procData.height || outputHeight;
    }
  } catch(e) { console.warn("[adjust] processing failed:", e?.message || e); /* fall through to return current photo with adjustments metadata */ }
}

// Generate a concise local description (avoid AI call — too slow for real-time slider interaction)
var desc = "";
if (nonZero.length > 0) {
  var parts = [];
  for (var di = 0; di < nonZero.length; di++) {
    var dkey = nonZero[di][0];
    var dval = nonZero[di][1];
    var direction = dval > 0 ? "+" : "";
    parts.push(dkey + " " + direction + dval);
  }
  desc = parts.join(", ");
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_adjust",
      path: photoPath,
      outputPath: outputPath,
      name: photo.name,
      mediaUrl: outputMediaUrl,
      width: outputWidth,
      height: outputHeight,
      adjustments: adjustments,
      applied: nonZero.length > 0,
      description: desc
    })
  }]
};

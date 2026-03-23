// AI Photo Analysis — determines scene, recommends best style, generates caption
// Enriched with style registry metadata for richer UI display
var photoPath = (params.path || "").trim();

if (!photoPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_analyze_photo",
        error: "Photo path is required"
      })
    }]
  };
}

// Call the AI vision analysis tool
var result = await ctx.callTool("enso_media_analyze_photo", { path: photoPath });

// Check for explicit failure
if (!result || !result.success) {
  var errMsg = "Analysis failed";
  if (result && result.error) errMsg = result.error;
  if (result && result.data) {
    try {
      var d = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
      if (d.error) errMsg = d.error;
    } catch(e) {}
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_analyze_photo",
        error: errMsg
      })
    }]
  };
}

var data = result.data || result;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Check for error inside data (tool returned success but data contains error)
if (data.error) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_analyze_photo",
        error: data.error
      })
    }]
  };
}

// ── Enrich with style registry metadata ──
// Look up the recommended and alternate styles to add mood, intensity, bestFor, signature, era
try {
  var stylesResult = await ctx.callTool("enso_media_list_styles", {});
  if (stylesResult && stylesResult.success) {
    var stylesData = stylesResult.data || stylesResult;
    if (typeof stylesData === "string") stylesData = JSON.parse(stylesData);
    var allStyles = stylesData.styles || [];

    // Build a lookup map
    var styleMap = {};
    for (var i = 0; i < allStyles.length; i++) {
      styleMap[allStyles[i].id] = allStyles[i];
    }

    // Enrich primary recommendation
    var recStyle = data.recommendedStyle;
    if (recStyle && styleMap[recStyle]) {
      var s = styleMap[recStyle];
      data.styleName = s.name || data.styleName;
      data.styleSignature = s.signature || "";
      data.styleMood = s.mood || [];
      data.styleBestFor = s.best_for || [];
      data.styleIntensity = s.intensity || 3;
      data.styleEra = s.era || "";
      data.styleCategory = s.category || "";
    }

    // Enrich alternate recommendation
    var altStyle = data.alternateStyle;
    if (altStyle && styleMap[altStyle]) {
      var a = styleMap[altStyle];
      data.alternateStyleName = a.name || data.alternateStyleName;
      data.altStyleSignature = a.signature || "";
      data.altStyleMood = a.mood || [];
      data.altStyleBestFor = a.best_for || [];
      data.altStyleIntensity = a.intensity || 3;
    }

    // Provide a confidence score based on how well the style matches scene subjects
    var bestFor = (data.styleBestFor || []).map(function(b) { return b.toLowerCase(); });
    var sceneWords = (data.scene || "").toLowerCase().split(/\s+/);
    var matchCount = 0;
    for (var j = 0; j < bestFor.length; j++) {
      for (var k = 0; k < sceneWords.length; k++) {
        if (sceneWords[k].indexOf(bestFor[j]) >= 0 || bestFor[j].indexOf(sceneWords[k]) >= 0) {
          matchCount++;
          break;
        }
      }
    }
    data.matchConfidence = bestFor.length > 0 ? Math.min(100, Math.round((matchCount / bestFor.length) * 100)) : 50;
  }
} catch(e) { /* enrich is best-effort */ }

// ── Log to processing history ──
try {
  var histKey = "history";
  var histStored = await ctx.store.get(histKey);
  var histList = [];
  if (histStored) {
    try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
  }
  histList.unshift({
    action: "analyze",
    photoPath: photoPath,
    recommendedStyle: data.recommendedStyle || "",
    styleName: data.styleName || "",
    timestamp: new Date().toISOString()
  });
  if (histList.length > 50) histList = histList.slice(0, 50);
  await ctx.store.set(histKey, JSON.stringify(histList));
} catch(e) { /* skip */ }

// Re-tag for our template
data.tool = "enso_photo_studio_analyze_photo";
data.photoPath = photoPath;

return {
  content: [{
    type: "text",
    text: JSON.stringify(data)
  }]
};

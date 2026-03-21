// AI Photo Analysis — determines scene, recommends best style, generates caption
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

// Re-tag for our template
data.tool = "enso_photo_studio_analyze_photo";
data.photoPath = photoPath;

return {
  content: [{
    type: "text",
    text: JSON.stringify(data)
  }]
};

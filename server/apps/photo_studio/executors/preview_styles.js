var photoPath = (params.photoPath || "").trim();
var stylesToPreview = params.styles || [];

if (!photoPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_preview_styles",
        error: "Photo path is required. Browse a folder first, then preview styles."
      })
    }]
  };
}

// Call the media tool to generate style previews
var previewParams = { photoPath: photoPath };
if (stylesToPreview && stylesToPreview.length > 0) {
  previewParams.styles = stylesToPreview;
}

var result = await ctx.callTool("enso_media_style_previews", previewParams);

if (!result || !result.success) {
  var errMsg = (result && result.error) || "Preview generation failed";
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
        tool: "enso_photo_studio_preview_styles",
        error: errMsg
      })
    }]
  };
}

var data = result.data || result;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_preview_styles",
      photoPath: photoPath,
      total: data.total || 0,
      failed: data.failed || 0,
      categories: data.categories || {},
      results: data.results || []
    })
  }]
};

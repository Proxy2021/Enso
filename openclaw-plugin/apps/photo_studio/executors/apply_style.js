var photoPath = (params.photoId || "").trim();
var style = (params.style || "").trim();

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

if (!style) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_apply_style",
        error: "Style is required. Use preview_styles or list_styles to see available styles."
      })
    }]
  };
}

// Get photo details
var viewResult = await ctx.callTool("enso_media_view_photo", { path: photoPath });
var photo = viewResult.success ? viewResult.data : null;
var photoName = photo ? photo.name : photoPath.split("/").pop();
var originalUrl = photo ? photo.mediaUrl : "";

// Process the photo using the real processing engine
var processResult = await ctx.callTool("enso_media_process_single_photo", {
  inputFile: photoPath,
  style: style
});

if (!processResult || !processResult.success) {
  var errMsg = "Processing failed";
  if (processResult && processResult.data) {
    try {
      var d = typeof processResult.data === "string" ? JSON.parse(processResult.data) : processResult.data;
      if (d.error) errMsg = d.error;
    } catch(e) {}
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_apply_style",
        error: errMsg
      })
    }]
  };
}

var data = processResult.data || processResult;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Get style name from list_styles
var styleName = style.replace(/_/g, " ");
try {
  var stylesResult = await ctx.callTool("enso_media_list_styles", {});
  if (stylesResult && stylesResult.success) {
    var stylesData = stylesResult.data || stylesResult;
    if (typeof stylesData === "string") stylesData = JSON.parse(stylesData);
    var allStyles = stylesData.styles || [];
    for (var i = 0; i < allStyles.length; i++) {
      if (allStyles[i].id === style) {
        styleName = allStyles[i].name;
        break;
      }
    }
  }
} catch(e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_apply_style",
      photo: {
        id: photoPath,
        name: photoName,
        originalUrl: originalUrl,
        path: photoPath
      },
      style: style,
      styleName: styleName,
      result: {
        mediaUrl: data.mediaUrl || "",
        thumbUrl: data.thumbUrl || "",
        outputFile: data.outputFile || "",
        width: data.width || 0,
        height: data.height || 0,
        size_mb: data.size_mb || 0
      }
    })
  }]
};

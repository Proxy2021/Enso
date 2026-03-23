var path = (params.path || "").trim();

// ── Path normalization ──
if (path && path.charAt(0) !== '/' && path.charAt(0) !== '~' && !/^[A-Z]:/i.test(path)) {
  if (path.indexOf('/') > 0) {
    path = '/' + path;
  }
}

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_favorite",
        error: "No file path provided"
      })
    }]
  };
}

var toolParams = { path: path };
if (typeof params.favorite === "boolean") {
  toolParams.favorite = params.favorite;
}

var result = await ctx.callTool("enso_media_toggle_favorite", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_favorite",
        error: result.error || "Failed to toggle favorite",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_gallery_favorite";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

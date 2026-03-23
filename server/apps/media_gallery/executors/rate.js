var path = (params.path || "").trim();
var rating = typeof params.rating === "number" ? params.rating : 0;

// Clamp rating to valid 0-5 range
if (rating < 0) rating = 0;
if (rating > 5) rating = 5;
rating = Math.round(rating);

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
        tool: "enso_media_gallery_rate",
        error: "No file path provided"
      })
    }]
  };
}

var result = await ctx.callTool("enso_media_rate_photo", { path: path, rating: rating });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_rate",
        error: result.error || "Failed to rate photo",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_gallery_rate";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

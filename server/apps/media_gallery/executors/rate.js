var path = (params.path || "").trim();
var rating = typeof params.rating === "number" ? params.rating : 0;

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

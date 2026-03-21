var path = (params.path || "").trim();
if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_view",
        error: "No file path provided"
      })
    }]
  };
}

var result = await ctx.callTool("enso_media_view_photo", { path: path });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_view",
        error: result.error || "Failed to load photo",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_gallery_view";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

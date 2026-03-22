var path = (params.path || "").trim();
var scale = params.scale ? Number(params.scale) : 2;

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_upscale",
        error: "Please provide an image file path"
      })
    }]
  };
}

var result = await ctx.callTool("enso_media_upscale", { path: path, scale: scale });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_upscale",
        error: result.error || "Failed to upscale image",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_processing_upscale";
data.path = path;
return { content: [{ type: "text", text: JSON.stringify(data) }] };

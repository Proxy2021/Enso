var path = (params.path || "").trim();
var outputFormat = (params.outputFormat || "").trim() || "png";

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_rmbg",
        error: "Please provide an image file path"
      })
    }]
  };
}

var result = await ctx.callTool("enso_media_remove_bg", { path: path, outputFormat: outputFormat });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_rmbg",
        error: result.error || "Failed to remove background",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_processing_rmbg";
data.path = path;
return { content: [{ type: "text", text: JSON.stringify(data) }] };

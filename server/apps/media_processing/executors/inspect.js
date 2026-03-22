var path = (params.path || "").trim();

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_inspect",
        error: "Please provide a video file path"
      })
    }]
  };
}

var result = await ctx.callTool("enso_video_inspect", { path: path });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_inspect",
        error: result.error || "Failed to inspect video",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_processing_inspect";
data.path = path;
return { content: [{ type: "text", text: JSON.stringify(data) }] };

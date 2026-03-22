var path = (params.path || "").trim();
var time = params.time ? Number(params.time) : undefined;
var size = (params.size || "").trim() || undefined;

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_thumbnail",
        error: "Please provide a video file path"
      })
    }]
  };
}

var toolParams = { path: path };
if (time !== undefined && !isNaN(time)) toolParams.time = time;
if (size) toolParams.size = size;

var result = await ctx.callTool("enso_video_thumbnail", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_thumbnail",
        error: result.error || "Failed to generate thumbnail",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_processing_thumbnail";
data.path = path;
return { content: [{ type: "text", text: JSON.stringify(data) }] };

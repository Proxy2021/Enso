var path = (params.path || "").trim();
var threshold = params.threshold ? Number(params.threshold) : undefined;

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_scenes",
        error: "Please provide a video file path"
      })
    }]
  };
}

var toolParams = { path: path };
if (threshold !== undefined && !isNaN(threshold)) toolParams.threshold = threshold;

var result = await ctx.callTool("enso_video_detect_scenes", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_scenes",
        error: result.error || "Failed to detect scenes",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_processing_scenes";
data.path = path;
return { content: [{ type: "text", text: JSON.stringify(data) }] };

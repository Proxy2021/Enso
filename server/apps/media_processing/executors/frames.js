var path = (params.path || "").trim();
var mode = (params.mode || "").trim() || "count";
var value = params.value ? Number(params.value) : undefined;

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_frames",
        error: "Please provide a video file path"
      })
    }]
  };
}

var toolParams = { path: path, mode: mode };
if (value !== undefined && !isNaN(value)) toolParams.value = value;

var result = await ctx.callTool("enso_video_extract_frames", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_frames",
        error: result.error || "Failed to extract frames",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_processing_frames";
data.path = path;
return { content: [{ type: "text", text: JSON.stringify(data) }] };

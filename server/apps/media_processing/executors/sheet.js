var path = (params.path || "").trim();
var columns = params.columns ? Number(params.columns) : undefined;
var showExif = params.showExif !== undefined ? Boolean(params.showExif) : undefined;
var thumbSize = params.thumbSize ? Number(params.thumbSize) : undefined;

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_sheet",
        error: "Please provide a folder path containing photos"
      })
    }]
  };
}

var toolParams = { path: path };
if (columns !== undefined && !isNaN(columns)) toolParams.columns = columns;
if (showExif !== undefined) toolParams.showExif = showExif;
if (thumbSize !== undefined && !isNaN(thumbSize)) toolParams.thumbSize = thumbSize;

var result = await ctx.callTool("enso_media_contact_sheet", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_processing_sheet",
        error: result.error || "Failed to generate contact sheet",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_processing_sheet";
data.path = path;
return { content: [{ type: "text", text: JSON.stringify(data) }] };

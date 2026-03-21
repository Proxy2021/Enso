var path = (params.path || "").trim();
var filter = (params.filter || "").trim() || "all";
var sortBy = (params.sortBy || "").trim() || "name";
var sortDir = (params.sortDir || "").trim() || "asc";

var toolParams = {};
if (path) toolParams.path = path;
if (filter !== "all") toolParams.filter = filter;
if (sortBy !== "name") toolParams.sortBy = sortBy;
if (sortDir !== "asc") toolParams.sortDir = sortDir;

var result = await ctx.callTool("enso_media_browse_folder", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_browse",
        error: result.error || "Failed to browse folder",
        path: path || "~"
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_gallery_browse";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

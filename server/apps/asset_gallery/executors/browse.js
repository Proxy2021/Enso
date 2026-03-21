var path = (params.path || "").trim();
var campaign = (params.campaign || "").trim();
var status = (params.status || "").trim();
var format = (params.format || "").trim();
var sortBy = (params.sortBy || "").trim() || "dateAdded";
var sortDir = (params.sortDir || "").trim() || "desc";

var toolParams = {};
if (path) toolParams.path = path;
if (campaign) toolParams.campaign = campaign;
if (status) toolParams.status = status;
if (format) toolParams.format = format;
if (sortBy !== "dateAdded") toolParams.sortBy = sortBy;
if (sortDir !== "desc") toolParams.sortDir = sortDir;

var result = await ctx.callTool("enso_asset_browse", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_browse",
        error: result.error || "Failed to browse assets",
        path: path || "All Assets"
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_asset_gallery_browse";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

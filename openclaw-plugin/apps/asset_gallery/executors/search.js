var query = (params.query || "").trim();
var path = (params.path || "").trim();

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_search",
        query: "",
        results: [],
        error: "Search query is required"
      })
    }]
  };
}

var toolParams = { query: query };
if (path) toolParams.path = path;

var result = await ctx.callTool("enso_asset_search", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_search",
        query: query,
        results: [],
        error: result.error || "Search failed"
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_asset_gallery_search";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

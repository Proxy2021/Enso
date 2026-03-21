var path = (params.path || "").trim();
var query = (params.query || "").trim();
var limit = typeof params.limit === "number" ? params.limit : 30;

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_search",
        error: "No search query provided",
        path: path || "~",
        query: "",
        total: 0,
        results: []
      })
    }]
  };
}

var toolParams = { query: query };
if (path) toolParams.path = path;
if (limit !== 30) toolParams.limit = limit;

var result = await ctx.callTool("enso_media_search_photos", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_search",
        error: result.error || "Search failed",
        path: path || "~",
        query: query,
        total: 0,
        results: []
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_gallery_search";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

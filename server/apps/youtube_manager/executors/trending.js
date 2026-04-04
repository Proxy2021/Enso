var p = params || {};
// YouTube Manager — trending.js

var regionCode = p.regionCode || "HK";
var categoryId = p.categoryId || undefined;
var maxResults = p.maxResults || 20;

var toolParams = { maxResults: maxResults, regionCode: regionCode };
if (categoryId) toolParams.categoryId = categoryId;

var result = await ctx.callTool("enso_youtube_trending", toolParams);

var videos = [];
if (result && result.success && result.data) {
  videos = result.data.videos || [];
} else if (result && typeof result === "string") {
  try { videos = JSON.parse(result).videos || []; } catch(e) {}
}

var data = {
  tool: "enso_youtube_manager_trending",
  count: videos.length,
  videos: videos,
  regionCode: regionCode,
  categoryId: categoryId || null
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };

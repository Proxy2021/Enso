// YouTube Manager — trending.js

var regionCode = params.regionCode || "HK";
var categoryId = params.categoryId || undefined;
var maxResults = params.maxResults || 20;

var toolParams = { maxResults: maxResults, regionCode: regionCode };
if (categoryId) toolParams.categoryId = categoryId;

var result = await ctx.callTool("enso_youtube_trending", toolParams);
var parsed = typeof result === "string" ? JSON.parse(result) : result;
var videos = parsed.videos || parsed.data?.videos || [];

var data = {
  tool: "enso_youtube_manager_trending",
  count: videos.length,
  videos: videos,
  regionCode: regionCode,
  categoryId: categoryId || null
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };

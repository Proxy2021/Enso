// YouTube Manager — feed.js
// Personalized feed from subscriptions via enso_youtube_my_feed

var maxResults = params.maxResults || 20;

var result = await ctx.callTool("enso_youtube_my_feed", {
  maxResults: maxResults
});

var parsed = typeof result === "string" ? JSON.parse(result) : result;
var videos = parsed.videos || parsed.data?.videos || [];

var data = {
  tool: "enso_youtube_manager_feed",
  count: videos.length,
  videos: videos,
  category: params.category || null
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };

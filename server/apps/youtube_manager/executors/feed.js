var p = params || {};
// YouTube Manager — feed.js

var maxResults = p.maxResults || 20;

var result = await ctx.callTool("enso_youtube_my_feed", { maxResults: maxResults });

var videos = [];
if (result && result.success && result.data) {
  videos = result.data.videos || [];
} else if (result && typeof result === "string") {
  try { videos = JSON.parse(result).videos || []; } catch(e) {}
}

var data = {
  tool: "enso_youtube_manager_feed",
  count: videos.length,
  videos: videos,
  category: p.category || null
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };

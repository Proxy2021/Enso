var p = params || {};
// YouTube Manager — feed.js
// Supports optional category filtering via cached subscription data

var maxResults = p.maxResults || 20;
var categoryFilter = p.category || null;

// If category filter requested, load subscription data to resolve channel IDs in that category
var categoryChannelIds = null;
if (categoryFilter) {
  try {
    var cached = await ctx.store.get("yt_manager_subs");
    if (cached && cached.data && cached.data.channels) {
      categoryChannelIds = {};
      for (var c = 0; c < cached.data.channels.length; c++) {
        var ch = cached.data.channels[c];
        if (ch.category === categoryFilter) {
          categoryChannelIds[ch.channelId] = true;
          categoryChannelIds[(ch.title || "").toLowerCase()] = true;
        }
      }
    }
  } catch(e) {}
}

// Fetch more than needed when filtering so we have enough after pruning
var fetchCount = categoryChannelIds ? Math.min(maxResults * 4, 100) : maxResults;
var result = await ctx.callTool("enso_youtube_my_feed", { maxResults: fetchCount }, { timeoutMs: 180000 });

var videos = [];
var feedWarning = null;
if (result && result.success && result.data) {
  videos = result.data.videos || [];
  if (result.data.warning) feedWarning = result.data.warning;
} else if (result && typeof result === "string") {
  try {
    var parsed = JSON.parse(result);
    videos = parsed.videos || [];
    if (parsed.warning) feedWarning = parsed.warning;
  } catch(e) {}
}

// Apply category filter
if (categoryChannelIds && videos.length > 0) {
  videos = videos.filter(function(v) {
    return categoryChannelIds[v.channelId] || categoryChannelIds[(v.channelTitle || "").toLowerCase()];
  });
}

videos = videos.slice(0, maxResults);

// Include category list for the UI filter dropdown
var feedCategories = [];
try {
  var subCache = await ctx.store.get("yt_manager_subs");
  if (subCache && subCache.data && subCache.data.categories) {
    feedCategories = subCache.data.categories;
  }
} catch(e) {}

var data = {
  tool: "enso_youtube_manager_feed",
  count: videos.length,
  videos: videos,
  category: categoryFilter,
  feedCategories: feedCategories
};
if (feedWarning) data.warning = feedWarning;

return { content: [{ type: "text", text: JSON.stringify(data) }] };

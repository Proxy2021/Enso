var p = params || {};
// YouTube Manager — analytics.js
// Subscription analytics computed from cached subscription data

var CACHE_KEY = "yt_manager_subs";

// Try to load from manage cache
var channels = [];
try {
  var cached = await ctx.store.get(CACHE_KEY);
  if (cached && cached.data) {
    channels = cached.data.channels || [];
  }
} catch(e) {}

// If no cache, fetch fresh
if (channels.length === 0) {
  var result = await ctx.callTool("enso_youtube_manager_manage", { refresh: false });
  var parsed = typeof result === "string" ? JSON.parse(result) : result;
  channels = parsed.channels || parsed.data?.channels || [];
}

// Compute analytics
var totalChannels = channels.length;
var categoryDist = {};
var subRanges = { "0-1K": 0, "1K-10K": 0, "10K-100K": 0, "100K-1M": 0, "1M+": 0 };
var totalVideos = 0;
var totalSubscribers = 0;
var allSubCounts = [];

for (var i = 0; i < channels.length; i++) {
  var ch = channels[i];
  var cat = ch.category || "Other";
  categoryDist[cat] = (categoryDist[cat] || 0) + 1;

  var subs = ch.subscriberCount || 0;
  totalSubscribers += subs;
  allSubCounts.push(subs);
  if (subs >= 1000000) subRanges["1M+"]++;
  else if (subs >= 100000) subRanges["100K-1M"]++;
  else if (subs >= 10000) subRanges["10K-100K"]++;
  else if (subs >= 1000) subRanges["1K-10K"]++;
  else subRanges["0-1K"]++;

  totalVideos += (ch.videoCount || 0);
}

// Compute median subscriber count
allSubCounts.sort(function(a, b) { return a - b; });
var medianSubs = 0;
if (allSubCounts.length > 0) {
  var mid = Math.floor(allSubCounts.length / 2);
  medianSubs = allSubCounts.length % 2 !== 0 ? allSubCounts[mid] : Math.round((allSubCounts[mid - 1] + allSubCounts[mid]) / 2);
}
var avgSubs = totalChannels > 0 ? Math.round(totalSubscribers / totalChannels) : 0;

// Category chart data
var categoryChart = Object.keys(categoryDist)
  .map(function(cat) { return { name: cat, value: categoryDist[cat] }; })
  .sort(function(a, b) { return b.value - a.value; });

// Subscriber range chart
var subRangeChart = Object.keys(subRanges).map(function(range) {
  return { name: range, value: subRanges[range] };
});

// Top channels by subscriber count
var topBySize = channels.slice().sort(function(a, b) {
  return (b.subscriberCount || 0) - (a.subscriberCount || 0);
}).slice(0, 10).map(function(ch) {
  return { name: ch.title, value: ch.subscriberCount || 0, category: ch.category };
});

// Smallest channels (cleanup candidates)
var smallest = channels.slice().sort(function(a, b) {
  return (a.subscriberCount || 0) - (b.subscriberCount || 0);
}).slice(0, 10).map(function(ch) {
  return { name: ch.title, channelId: ch.channelId, value: ch.subscriberCount || 0, category: ch.category };
});

// Category percentage chart (for labels)
var categoryPctChart = categoryChart.map(function(c) {
  return { name: c.name, value: c.value, pct: totalChannels > 0 ? Math.round(c.value / totalChannels * 100) : 0 };
});

var data = {
  tool: "enso_youtube_manager_analytics",
  totalChannels: totalChannels,
  totalVideos: totalVideos,
  totalSubscribers: totalSubscribers,
  avgSubscribers: avgSubs,
  medianSubscribers: medianSubs,
  categoryChart: categoryPctChart,
  subRangeChart: subRangeChart,
  topBySize: topBySize,
  smallest: smallest,
  categoryCount: Object.keys(categoryDist).length
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };

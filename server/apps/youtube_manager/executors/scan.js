// YouTube Data Scan — fetch subscriptions, liked videos, and feed, cache for Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

var subscriptions = [];
var likedVideos = [];
var feed = [];

// Fetch subscriptions
try {
  var subResult = await ctx.callTool("enso_youtube_subscriptions", {});
  if (subResult && subResult.channels) {
    subscriptions = subResult.channels;
  }
} catch (e) { /* YouTube subscriptions not available */ }

// Fetch liked videos
try {
  var likedResult = await ctx.callTool("enso_youtube_liked_videos", {});
  if (likedResult && likedResult.videos) {
    likedVideos = likedResult.videos;
  }
} catch (e) { /* YouTube liked videos not available */ }

// Fetch recent feed
try {
  var feedResult = await ctx.callTool("enso_youtube_my_feed", { maxResults: 30 });
  if (feedResult && feedResult.videos) {
    feed = feedResult.videos;
  }
} catch (e) { /* YouTube feed not available */ }

var cacheData = {
  source: "youtube",
  subscriptions: subscriptions,
  likedVideos: likedVideos,
  feed: feed,
  totalSubscriptions: subscriptions.length,
  totalLikedVideos: likedVideos.length,
  totalFeedVideos: feed.length,
  scannedAt: new Date().toISOString(),
};

// Write cache
fs.writeFileSync(path.join(cacheDir, "youtube-data.json"), JSON.stringify(cacheData, null, 2));

result = {
  tool: "enso_youtube_manager_scan",
  totalSubscriptions: subscriptions.length,
  totalLikedVideos: likedVideos.length,
  totalFeedVideos: feed.length,
  scannedAt: cacheData.scannedAt,
};

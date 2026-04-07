// YouTube Data Scan — fetch subscriptions, liked videos, and feed, cache for Cortex
// NOTE: Don't use require() — executors may run in contexts without it.
// Use ctx.callTool for data fetching and store the cache via a helper tool.

var subscriptions = [];
var likedVideos = [];
var feed = [];

// Fetch subscriptions (all pages)
try {
  var subResult = await ctx.callTool("enso_youtube_subscriptions", { all: true });
  if (subResult && subResult.channels) {
    subscriptions = subResult.channels;
  }
} catch (e) { /* YouTube subscriptions not available */ }

// Fetch liked videos
try {
  var likedResult = await ctx.callTool("enso_youtube_liked_videos", { maxResults: 50 });
  if (likedResult && likedResult.videos) {
    likedVideos = likedResult.videos;
  }
} catch (e) { /* YouTube liked videos not available */ }

// Fetch recent feed
try {
  var feedResult = await ctx.callTool("enso_youtube_my_feed", { maxResults: 50 });
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

// Write cache using ctx.store (persists to app store, accessible by registry readCache)
// Actually, we need to write to the specific cache path. Use a filesystem tool.
try {
  var homedir = (typeof process !== "undefined" && process.env && (process.env.HOME || process.env.USERPROFILE)) || "";
  var cachePath = homedir + "/.enso/data/user-context/cache/youtube-data.json";
  // Use the filesystem tool to write the cache
  await ctx.callTool("enso_filesystem_write", { path: cachePath, content: JSON.stringify(cacheData, null, 2) });
} catch (e) {
  // Fallback: try direct fs if available in this context
  try {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "youtube-data.json"), JSON.stringify(cacheData, null, 2));
  } catch (e2) { /* cache write failed - data still in result */ }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_youtube_manager_scan",
  totalSubscriptions: subscriptions.length,
  totalLikedVideos: likedVideos.length,
  totalFeedVideos: feed.length,
  scannedAt: cacheData.scannedAt,
}) }] };
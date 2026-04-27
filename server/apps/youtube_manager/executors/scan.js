// YouTube Data Scan — fetch subscriptions, liked videos, and feed, cache for Cortex
// NOTE: Don't use require() — executors may run in contexts without it.
// Use ctx.callTool for data fetching and store the cache via a helper tool.

var subscriptions = [];
var likedVideos = [];
var feed = [];
var authError = null;

// Helper: detect auth error in a callTool result
function isAuthExpired(result) {
  if (!result) return false;
  if (result.success === false && result.error) {
    return /authorization expired|invalid_grant|token.*revoked|unauthorized/i.test(result.error);
  }
  return false;
}

// Fetch subscriptions (all pages)
try {
  var subResult = await ctx.callTool("enso_youtube_subscriptions", { all: true }, { timeoutMs: 180000 });
  if (isAuthExpired(subResult)) {
    authError = "YouTube authorization expired — re-authorize at /api/youtube/auth";
  } else if (subResult && subResult.success && subResult.data) {
    if (subResult.data.channels) subscriptions = subResult.data.channels;
    else if (subResult.data.subscriptions) subscriptions = subResult.data.subscriptions;
  }
} catch (e) { /* YouTube subscriptions not available */ }

// Fetch liked videos
try {
  var likedResult = await ctx.callTool("enso_youtube_liked_videos", { maxResults: 50 });
  if (isAuthExpired(likedResult)) {
    if (!authError) authError = "YouTube authorization expired — re-authorize at /api/youtube/auth";
  } else if (likedResult && likedResult.success && likedResult.data) {
    if (likedResult.data.videos) likedVideos = likedResult.data.videos;
    else if (likedResult.data.likedVideos) likedVideos = likedResult.data.likedVideos;
  }
} catch (e) { /* YouTube liked videos not available */ }

// Fetch recent feed
try {
  var feedResult = await ctx.callTool("enso_youtube_my_feed", { maxResults: 50 }, { timeoutMs: 180000 });
  if (isAuthExpired(feedResult)) {
    if (!authError) authError = "YouTube authorization expired — re-authorize at /api/youtube/auth";
  } else if (feedResult && feedResult.success && feedResult.data) {
    if (feedResult.data.videos) feed = feedResult.data.videos;
  }
} catch (e) { /* YouTube feed not available */ }

// Only write cache if we got actual data OR if there is no auth error
// Never overwrite a valid cache with empty data caused by auth failure
if (!authError) {
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

  try {
    var homedir = (typeof process !== "undefined" && process.env && (process.env.HOME || process.env.USERPROFILE)) || "";
    var cachePath = homedir + "/.enso/data/user-context/cache/youtube-data.json";
    await ctx.callTool("enso_filesystem_write", { path: cachePath, content: JSON.stringify(cacheData, null, 2) });
  } catch (e) {
    try {
      var fs = require("fs");
      var path = require("path");
      var os = require("os");
      var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, "youtube-data.json"), JSON.stringify(cacheData, null, 2));
    } catch (e2) { /* cache write failed - data still in result */ }
  }

  try {
    var pipeline = await import("../../../../server/src/data-source-pipeline.js");
    pipeline.runPostScanPipeline(["youtube"]).catch(function() {});
  } catch(e) { /* pipeline unavailable */ }
} else {
  // Auth failed — update cache metadata only, preserve existing data
  try {
    var homedir2 = (typeof process !== "undefined" && process.env && (process.env.HOME || process.env.USERPROFILE)) || "";
    var cachePath2 = homedir2 + "/.enso/data/user-context/cache/youtube-data.json";
    var existingResult = await ctx.callTool("enso_filesystem_read", { path: cachePath2 });
    if (existingResult && existingResult.success && existingResult.data) {
      var existing;
      try { existing = typeof existingResult.data === "string" ? JSON.parse(existingResult.data) : existingResult.data; } catch(e) { existing = null; }
      if (existing) {
        existing.authError = true;
        existing.authErrorMessage = authError;
        existing.authErrorAt = new Date().toISOString();
        await ctx.callTool("enso_filesystem_write", { path: cachePath2, content: JSON.stringify(existing, null, 2) });
      }
    }
  } catch (e) { /* cache update failed */ }
}

if (authError) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_youtube_manager_scan",
    success: false,
    authError: true,
    error: authError,
    message: "YouTube scan failed: authorization expired. Visit /api/youtube/auth to re-authorize.",
    scannedAt: new Date().toISOString(),
  }) }] };
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_youtube_manager_scan",
  success: true,
  totalSubscriptions: subscriptions.length,
  totalLikedVideos: likedVideos.length,
  totalFeedVideos: feed.length,
  scannedAt: new Date().toISOString(),
}) }] };

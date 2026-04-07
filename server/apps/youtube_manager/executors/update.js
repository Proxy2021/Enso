// YouTube Update — rescan subscriptions and feed, detect new channels/videos, ingest to Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
var subsCacheFile = path.join(cacheDir, "youtube-subscriptions.json");
var likedCacheFile = path.join(cacheDir, "youtube-liked.json");

// 1. Read existing caches
var existingSubs = [];
try { existingSubs = JSON.parse(fs.readFileSync(subsCacheFile, "utf-8")); } catch (e) {}
var existingChannelIds = new Set();
if (Array.isArray(existingSubs)) {
  existingSubs.forEach(function(s) { existingChannelIds.add(s.channelId || s.id); });
}
var beforeSubCount = existingSubs.length;

var existingLiked = [];
try { existingLiked = JSON.parse(fs.readFileSync(likedCacheFile, "utf-8")); } catch (e) {}
var existingVideoIds = new Set();
if (Array.isArray(existingLiked)) {
  existingLiked.forEach(function(v) { existingVideoIds.add(v.videoId || v.id); });
}
var beforeLikedCount = existingLiked.length;

// 2. Re-scan YouTube data (subscriptions + liked + feed)
var scanResult = await ctx.callTool("enso_youtube_manager_scan", {});

// 3. Read updated caches
var updatedSubs = [];
try { updatedSubs = JSON.parse(fs.readFileSync(subsCacheFile, "utf-8")); } catch (e) {}
var updatedLiked = [];
try { updatedLiked = JSON.parse(fs.readFileSync(likedCacheFile, "utf-8")); } catch (e) {}

// 4. Find new subscriptions and liked videos
var newSubs = [];
if (Array.isArray(updatedSubs)) {
  newSubs = updatedSubs.filter(function(s) {
    return !existingChannelIds.has(s.channelId || s.id);
  });
}
var newLiked = [];
if (Array.isArray(updatedLiked)) {
  newLiked = updatedLiked.filter(function(v) {
    return !existingVideoIds.has(v.videoId || v.id);
  });
}

// 5. Ingest new YouTube data to Cortex
var cortexIngested = false;
if (newSubs.length > 0 || newLiked.length > 3) {
  try {
    var parts = [];
    if (newSubs.length > 0) {
      parts.push("New YouTube subscriptions (" + newSubs.length + "):\n" +
        newSubs.map(function(s) { return "- " + (s.title || s.channelTitle || s.channelId); }).join("\n"));
    }
    if (newLiked.length > 0) {
      parts.push("New liked videos (" + newLiked.length + "):\n" +
        newLiked.slice(0, 15).map(function(v) {
          return "- " + (v.title || v.videoId) + (v.channelTitle ? " by " + v.channelTitle : "");
        }).join("\n"));
    }
    await ctx.callTool("enso_wiki_ingest", { text: parts.join("\n\n"), topic: "YouTube Activity Update" });
    cortexIngested = true;
  } catch (e) {}
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_youtube_manager_update",
  subscriptions: {
    before: beforeSubCount,
    after: Array.isArray(updatedSubs) ? updatedSubs.length : 0,
    new: newSubs.length,
    newChannels: newSubs.slice(0, 10).map(function(s) { return s.title || s.channelTitle; }),
  },
  likedVideos: {
    before: beforeLikedCount,
    after: Array.isArray(updatedLiked) ? updatedLiked.length : 0,
    new: newLiked.length,
  },
  cortexIngested: cortexIngested,
}) }] };
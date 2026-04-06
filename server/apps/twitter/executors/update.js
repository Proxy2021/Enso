var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "twitter-following.json");
var oldCache = null;
try { oldCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}
var oldHandles = new Set();
if (oldCache && oldCache.accounts) {
  oldCache.accounts.forEach(function(a) { oldHandles.add(a.handle); });
}

var scanResult = await ctx.callTool("enso_context_scan_twitter", {});

var newCache = null;
try { newCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

var newFollows = [];
var unfollowed = [];
if (newCache && newCache.accounts) {
  var newHandleSet = new Set();
  newCache.accounts.forEach(function(a) { newHandleSet.add(a.handle); });
  newFollows = newCache.accounts.filter(function(a) { return !oldHandles.has(a.handle); });
  oldHandles.forEach(function(h) { if (!newHandleSet.has(h)) unfollowed.push(h); });
}

// Ingest new follows to Cortex
if (newFollows.length > 0) {
  var names = newFollows.map(function(a) { return a.displayName + " (@" + a.handle + ")"; }).join(", ");
  try {
    await ctx.callTool("enso_wiki_ingest", { text: "New Twitter/X follows: " + names, topic: "Twitter Following Update" });
  } catch(e) {}
}

result = {
  tool: "enso_twitter_update",
  beforeCount: oldHandles.size,
  afterCount: newCache ? newCache.accounts.length : 0,
  newFollows: newFollows.map(function(a) { return a.displayName + " (@" + a.handle + ")"; }),
  unfollowed: unfollowed,
  message: (newFollows.length > 0 || unfollowed.length > 0) ?
    newFollows.length + " new follow(s), " + unfollowed.length + " unfollow(s)" : "No changes detected"
};

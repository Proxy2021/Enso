var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "twitter-following.json");
var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached || !cached.accounts || cached.accounts.length === 0) {
  result = { tool: "enso_twitter_browse", accounts: [], totalFollowing: 0, message: "No Twitter data. Run a scan first." };
} else {
  var accounts = cached.accounts.slice();

  if (params.query) {
    var q = params.query.toLowerCase();
    accounts = accounts.filter(function(a) {
      return a.displayName.toLowerCase().indexOf(q) >= 0 ||
        a.handle.toLowerCase().indexOf(q) >= 0 ||
        (a.bio && a.bio.toLowerCase().indexOf(q) >= 0);
    });
  }

  var sortBy = params.sortBy || "name";
  if (sortBy === "name") {
    accounts.sort(function(a, b) { return a.displayName.localeCompare(b.displayName); });
  } else if (sortBy === "handle") {
    accounts.sort(function(a, b) { return a.handle.localeCompare(b.handle); });
  }

  result = {
    tool: "enso_twitter_browse",
    accounts: accounts.slice(0, 200),
    totalFollowing: cached.accounts.length,
    filteredCount: accounts.length,
    scannedAt: cached.scannedAt
  };
}

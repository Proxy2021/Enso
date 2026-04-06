// System Info Update — rescan installed apps, detect new installations, ingest to Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "system.json");

// 1. Read existing cache to get known apps
var existing = { apps: [], processes: [] };
try { existing = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}
var existingApps = new Set();
if (existing.apps) {
  existing.apps.forEach(function(a) { existingApps.add(a.name || a.displayName); });
}
var beforeCount = existing.apps ? existing.apps.length : 0;

// 2. Re-scan system
var scanResult = await ctx.callTool("enso_context_scan_system", { include: ["apps"] });

// 3. Read updated cache
var updated = { apps: [], processes: [] };
try { updated = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}

// 4. Find new apps
var newApps = [];
if (updated.apps) {
  newApps = updated.apps.filter(function(a) {
    return !existingApps.has(a.name || a.displayName);
  });
}

// 5. Ingest new apps to Cortex
var cortexIngested = false;
if (newApps.length > 0) {
  try {
    var summary = "New software installed (" + newApps.length + "):\n" +
      newApps.map(function(a) {
        return "- " + (a.displayName || a.name) + (a.version ? " v" + a.version : "");
      }).join("\n");
    await ctx.callTool("enso_wiki_ingest", { text: summary, topic: "System Software Update" });
    cortexIngested = true;
  } catch (e) {}
}

result = {
  tool: "enso_system_info_update",
  beforeCount: beforeCount,
  afterCount: updated.apps ? updated.apps.length : 0,
  newApps: newApps.length,
  newNames: newApps.slice(0, 20).map(function(a) { return a.displayName || a.name; }),
  cortexIngested: cortexIngested,
};

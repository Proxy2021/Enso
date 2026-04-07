var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "system-info.json");
var platform = "";
var hostname = "";
var installedApps = [];
var runningProcesses = [];

try {
  var raw = fs.readFileSync(cacheFile, "utf-8");
  var data = JSON.parse(raw);
  platform = data.platform || os.platform();
  hostname = data.hostname || os.hostname();
  installedApps = data.installedApps || data.apps || [];
  runningProcesses = data.runningProcesses || data.processes || [];
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_system_info_browse",
    platform: os.platform(),
    hostname: os.hostname(),
    installedApps: [],
    runningProcesses: [],
    error: "No system data cached. Run a scan first.",
  }) }] };
}

// Apply query filter
var filteredApps = installedApps;
var p = params || {};
if (p.query) {
  var q = p.query.toLowerCase();
  filteredApps = installedApps.filter(function(app) {
    var name = (typeof app === "string") ? app : (app.name || "");
    return name.toLowerCase().indexOf(q) >= 0;
  });
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_system_info_browse",
  platform: platform,
  hostname: hostname,
  totalApps: installedApps.length,
  filteredApps: filteredApps.length,
  query: p.query || null,
  installedApps: filteredApps,
  runningProcesses: runningProcesses,
}) }] };
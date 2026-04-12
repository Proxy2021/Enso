// Cortex Data Source Update — scans all enabled data sources and optionally rebuilds the profile
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};
var rebuildProfile = !!p.rebuildProfile;

ctx.log("Data source update starting" + (rebuildProfile ? " (with profile rebuild)" : ""));

// Read consent to find enabled sources
var consentPath = path.join(os.homedir(), ".enso", "data", "user-context", "consent.json");
var consent = {};
try {
  if (fs.existsSync(consentPath)) consent = JSON.parse(fs.readFileSync(consentPath, "utf-8"));
} catch(e) { ctx.log("Could not read consent: " + (e.message || e)); }

// Map data source IDs to their scanner tool names
var scannerMap = {
  browserHistory: "enso_context_scan_browser_history",
  bookmarks: "enso_context_scan_bookmarks",
  email: "enso_context_scan_email",
  files: "enso_context_scan_files",
  system: "enso_context_scan_system",
  kindleLibrary: "enso_context_scan_kindle_library",
  wereadLibrary: "enso_context_scan_weread",
  youtube: "enso_context_scan_youtube",
  steam: "enso_context_scan_steam",
  moviesTv: "enso_context_scan_movies_tv",
  photos: "enso_context_scan_photos",
  twitter: "enso_context_scan_twitter",
  qqMusic: "enso_context_scan_qq_music",
};

var results = [];
var errors = [];

for (var sourceId in scannerMap) {
  // Skip if not consented
  if (consent[sourceId] === false) continue;
  // If no consent entry, default to scanning common sources
  if (consent[sourceId] === undefined) {
    var defaultEnabled = ["browserHistory", "bookmarks", "files", "system", "kindleLibrary", "wereadLibrary", "youtube"];
    if (defaultEnabled.indexOf(sourceId) === -1) continue;
  }

  var toolName = scannerMap[sourceId];
  ctx.log("Scanning: " + sourceId);
  try {
    var scanResult = await ctx.callTool(toolName, {});
    var success = !!(scanResult && (scanResult.success || (scanResult.data && !scanResult.error)));
    results.push({ source: sourceId, success: success });
    ctx.log("  " + sourceId + ": " + (success ? "OK" : "partial"));
  } catch(e) {
    errors.push({ source: sourceId, error: e.message || String(e) });
    ctx.log("  " + sourceId + " FAILED: " + (e.message || e));
  }
}

// Optionally rebuild profile
if (rebuildProfile) {
  ctx.log("Rebuilding user profile...");
  try {
    await ctx.fetch("http://localhost:3001/api/profile/rebuild", {
      method: "POST",
      headers: { "Origin": "http://localhost:3001" },
    });
    ctx.log("Profile rebuild triggered");
  } catch(e) {
    ctx.log("Profile rebuild failed: " + (e.message || e));
    errors.push({ source: "profile-rebuild", error: e.message || String(e) });
  }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_data_source_update",
  scanned: results.length,
  errors: errors.length,
  results: results,
  errorDetails: errors,
  profileRebuilt: rebuildProfile
}) }] };

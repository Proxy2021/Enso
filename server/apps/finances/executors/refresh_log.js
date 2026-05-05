var fs = require("fs");
var path = require("path");
var home = require("os").homedir();

var REFRESH_LOG_PATH = path.join(home, ".enso", "data", "finances", "refresh-log.jsonl");

var limit = (params && params.limit) ? Math.min(Math.max(parseInt(params.limit) || 50, 1), 200) : 50;
var sourceFilter = (params && params.source) ? params.source : null;

var entries = [];
try {
  if (fs.existsSync(REFRESH_LOG_PATH)) {
    var lines = fs.readFileSync(REFRESH_LOG_PATH, "utf-8").trim().split(/\r?\n/).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      try { entries.push(JSON.parse(lines[i])); } catch (e) { /* skip */ }
    }
  }
} catch (e) { /* empty */ }

// Filter by source if specified
if (sourceFilter) {
  entries = entries.filter(function(e) { return e.source === sourceFilter; });
}

// Take most recent N
var recent = entries.slice(-limit).reverse();

// Compute stats
var totalRefreshes = entries.length;
var successCount = entries.filter(function(e) { return e.success; }).length;
var failureCount = entries.filter(function(e) { return !e.success; }).length;
var avgDuration = entries.length > 0
  ? Math.round(entries.reduce(function(sum, e) { return sum + (e.duration || 0); }, 0) / entries.length)
  : 0;

// Last 7 days stats
var sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
var recentEntries = entries.filter(function(e) { return new Date(e.ts).getTime() > sevenDaysAgo; });
var recentSuccess = recentEntries.filter(function(e) { return e.success; }).length;
var recentFail = recentEntries.filter(function(e) { return !e.success; }).length;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_finances_refresh_log",
      totalRefreshes: totalRefreshes,
      successCount: successCount,
      failureCount: failureCount,
      successRate: totalRefreshes > 0 ? Math.round((successCount / totalRefreshes) * 100) : 0,
      avgDurationMs: avgDuration,
      last7Days: {
        total: recentEntries.length,
        success: recentSuccess,
        failures: recentFail
      },
      entries: recent.map(function(e) {
        return {
          ts: e.ts,
          source: e.source,
          success: e.success,
          duration: e.duration,
          accountsUpdated: e.accountsUpdated || 0,
          newStatements: e.newStatements || 0,
          netWorthDelta: e.netWorthDelta || null,
          error: e.error || null,
          trigger: e.trigger || "unknown"
        };
      })
    })
  }]
};

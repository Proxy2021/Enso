var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);
var minOccurrences = Math.max(parseInt(params.minOccurrences) || 2, 2);

var res = await ctx.fetch("http://localhost:3001/api/error-log?count=500");
var entries = res.ok && Array.isArray(res.data) ? res.data : [];

var cutoff = Date.now() - hours * 3600000;
var filtered = entries.filter(function(e) { return e.ts >= cutoff; });

// Group by fingerprint
var fpMap = {};
for (var i = 0; i < filtered.length; i++) {
  var e = filtered[i];
  var fp = e.fingerprint || "fp-" + i;
  if (!fpMap[fp]) {
    fpMap[fp] = {
      fingerprint: fp,
      count: 0,
      message: e.message,
      category: e.category,
      severity: e.severity,
      code: e.code || null,
      firstSeen: e.ts,
      lastSeen: e.ts,
      occurrences: []
    };
  }
  var cluster = fpMap[fp];
  cluster.count++;
  if (e.ts < cluster.firstSeen) cluster.firstSeen = e.ts;
  if (e.ts > cluster.lastSeen) cluster.lastSeen = e.ts;
  if (cluster.occurrences.length < 5) {
    cluster.occurrences.push({ ts: e.ts, message: e.message });
  }
}

var recurring = Object.values(fpMap)
  .filter(function(c) { return c.count >= minOccurrences; })
  .sort(function(a, b) { return b.count - a.count; });

// Compute frequency for each cluster
recurring.forEach(function(c) {
  var spanMs = c.lastSeen - c.firstSeen;
  if (spanMs > 0 && c.count > 1) {
    var avgIntervalMs = spanMs / (c.count - 1);
    if (avgIntervalMs < 60000) c.frequency = Math.round(avgIntervalMs / 1000) + "s";
    else if (avgIntervalMs < 3600000) c.frequency = Math.round(avgIntervalMs / 60000) + "m";
    else c.frequency = Math.round(avgIntervalMs / 3600000 * 10) / 10 + "h";
  } else {
    c.frequency = "single burst";
  }
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_recurring",
      hours: hours,
      minOccurrences: minOccurrences,
      patterns: recurring.slice(0, 20),
      totalPatterns: recurring.length,
      totalErrors: filtered.length,
      uniqueErrors: Object.keys(fpMap).length
    })
  }]
};

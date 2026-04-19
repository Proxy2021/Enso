var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);

var res = await ctx.fetch("http://localhost:3001/api/error-log?count=500&severity=");
var entries = res.ok && Array.isArray(res.data) ? res.data : [];

var cutoff = Date.now() - hours * 3600000;
var filtered = entries.filter(function(e) { return e.ts >= cutoff; });

var bucketMap = {};
for (var i = 0; i < hours; i++) {
  var bucketTime = new Date(cutoff + i * 3600000);
  var key = bucketTime.toISOString().slice(0, 13).replace("T", "T") + ":00";
  bucketMap[key] = { hour: key, critical: 0, error: 0, warning: 0, info: 0, total: 0 };
}

for (var j = 0; j < filtered.length; j++) {
  var e = filtered[j];
  var bucketKey = new Date(e.ts).toISOString().slice(0, 13) + ":00";
  if (bucketMap[bucketKey]) {
    var sev = e.severity || "error";
    bucketMap[bucketKey][sev] = (bucketMap[bucketKey][sev] || 0) + 1;
    bucketMap[bucketKey].total++;
  }
}

var buckets = Object.values(bucketMap).sort(function(a, b) { return a.hour < b.hour ? -1 : 1; });
var peak = buckets.reduce(function(max, b) { return b.total > max.total ? b : max; }, { hour: "-", total: 0 });
var totalErrors = filtered.length;
var average = hours > 0 ? Math.round((totalErrors / hours) * 10) / 10 : 0;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_trends",
      hours: hours,
      buckets: buckets,
      peak: peak,
      average: average,
      totalErrors: totalErrors
    })
  }]
};

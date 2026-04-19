var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);

var res = await ctx.fetch("http://localhost:3001/api/error-log?count=500");
var entries = res.ok && Array.isArray(res.data) ? res.data : [];

var cutoff = Date.now() - hours * 3600000;
var filtered = entries.filter(function(e) { return e.ts >= cutoff; });

var catMap = {};
for (var i = 0; i < filtered.length; i++) {
  var e = filtered[i];
  var cat = e.category || "unknown";
  if (!catMap[cat]) {
    catMap[cat] = { category: cat, count: 0, critical: 0, error: 0, warning: 0, info: 0, lastSeen: 0 };
  }
  catMap[cat].count++;
  var sev = e.severity || "error";
  catMap[cat][sev] = (catMap[cat][sev] || 0) + 1;
  if (e.ts > catMap[cat].lastSeen) catMap[cat].lastSeen = e.ts;
}

var totalErrors = filtered.length;
var categories = Object.values(catMap)
  .sort(function(a, b) { return b.count - a.count; })
  .map(function(c) {
    c.percentage = totalErrors > 0 ? Math.round((c.count / totalErrors) * 1000) / 10 : 0;
    return c;
  });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_categories",
      hours: hours,
      categories: categories,
      totalCategories: categories.length,
      totalErrors: totalErrors
    })
  }]
};

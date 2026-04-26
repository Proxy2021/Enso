var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);
var codeFilter = (params.code || "").trim();

var res = await ctx.fetch("http://localhost:3001/api/error-log?count=500");
var entries = res.ok && Array.isArray(res.data) ? res.data : [];

var cutoff = Date.now() - hours * 3600000;
var filtered = entries.filter(function(e) { return e.ts >= cutoff; });

if (codeFilter) {
  filtered = filtered.filter(function(e) { return (e.code || "UNKNOWN") === codeFilter; });
}

var codeMap = {};
for (var i = 0; i < filtered.length; i++) {
  var e = filtered[i];
  var code = e.code || "UNKNOWN";
  if (!codeMap[code]) {
    codeMap[code] = {
      code: code,
      count: 0,
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
      categories: {},
      firstSeen: e.ts,
      lastSeen: e.ts,
      sampleMessages: []
    };
  }
  var entry = codeMap[code];
  entry.count++;
  var sev = e.severity || "error";
  entry[sev] = (entry[sev] || 0) + 1;
  var cat = e.category || "unknown";
  entry.categories[cat] = (entry.categories[cat] || 0) + 1;
  if (e.ts < entry.firstSeen) entry.firstSeen = e.ts;
  if (e.ts > entry.lastSeen) entry.lastSeen = e.ts;
  if (entry.sampleMessages.length < 3) entry.sampleMessages.push(e.message);
}

var codes = Object.values(codeMap).sort(function(a, b) { return b.count - a.count; });
codes.forEach(function(c) {
  var catEntries = Object.entries(c.categories);
  catEntries.sort(function(a, b) { return b[1] - a[1]; });
  c.topCategories = catEntries.slice(0, 5).map(function(pair) { return { category: pair[0], count: pair[1] }; });
  delete c.categories;
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_error_codes",
      hours: hours,
      codeFilter: codeFilter || null,
      codes: codes,
      totalCodes: codes.length,
      totalErrors: filtered.length
    })
  }]
};

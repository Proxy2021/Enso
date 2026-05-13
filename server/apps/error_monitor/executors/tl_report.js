var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);

var summaryRes = await ctx.fetch("http://localhost:3001/api/error-summary?hours=" + hours);
var circuitRes = await ctx.fetch("http://localhost:3001/api/circuit-breakers");
var fixesRes = await ctx.fetch("http://localhost:3001/api/action-log?count=500&type=fix");
var errorsRes = await ctx.fetch("http://localhost:3001/api/error-log?count=500");
var healthRes = await ctx.fetch("http://localhost:3001/api/health");

var summary = summaryRes.ok ? summaryRes.data : { total: 0, bySeverity: {}, byCategory: [], recentErrors: [] };
var breakers = circuitRes.ok && Array.isArray(circuitRes.data) ? circuitRes.data : [];
var fixes = fixesRes.ok && Array.isArray(fixesRes.data) ? fixesRes.data : [];
var errors = errorsRes.ok && Array.isArray(errorsRes.data) ? errorsRes.data : [];
var health = healthRes.ok ? healthRes.data : {};

var sev = summary.bySeverity || {};
var openCircuits = breakers.filter(function(b) { return b.state === "open"; });
var cats = (summary.byCategory || []).slice(0, 10);

// Compute hourly trend buckets for sparkline
var now = Date.now();
var cutoff = now - hours * 3600000;
var hourBuckets = [];
for (var h = 0; h < Math.min(hours, 48); h++) {
  var bucketStart = cutoff + h * 3600000;
  var bucketEnd = bucketStart + 3600000;
  var count = 0;
  for (var i = 0; i < errors.length; i++) {
    if (errors[i].ts >= bucketStart && errors[i].ts < bucketEnd) count++;
  }
  var d = new Date(bucketStart);
  hourBuckets.push({
    hour: d.toISOString().slice(0, 13) + ":00",
    label: d.toISOString().slice(11, 16),
    count: count
  });
}

// Compute 7d baseline for comparison
var sevenDayRes = await ctx.fetch("http://localhost:3001/api/error-log?count=500");
var sevenDayErrors = sevenDayRes.ok && Array.isArray(sevenDayRes.data) ? sevenDayRes.data : [];
var weekCutoff = now - 7 * 24 * 3600000;
var weekErrors = sevenDayErrors.filter(function(e) { return e.ts >= weekCutoff; });
var dailyAvg7d = weekErrors.length / 7;
var todayCount = errors.filter(function(e) { return e.ts >= now - 24 * 3600000; }).length;
var trendDirection = dailyAvg7d > 0 ? ((todayCount / dailyAvg7d - 1) * 100) : 0;
trendDirection = Math.round(trendDirection);

// Spike detection — find hours with 3x the average
var avgPerHour = hourBuckets.length > 0 ? hourBuckets.reduce(function(s, b) { return s + b.count; }, 0) / hourBuckets.length : 0;
var spikes = hourBuckets.filter(function(b) { return avgPerHour > 0 && b.count >= avgPerHour * 3; });

// Error code breakdown
var codeMap = {};
for (var j = 0; j < errors.length; j++) {
  var e = errors[j];
  if (e.ts < cutoff) continue;
  var code = e.code || "UNCLASSIFIED";
  if (!codeMap[code]) codeMap[code] = { code: code, count: 0, severity: e.severity || "error", lastSeen: 0 };
  codeMap[code].count++;
  if (e.ts > codeMap[code].lastSeen) codeMap[code].lastSeen = e.ts;
}
var topCodes = Object.values(codeMap).sort(function(a, b) { return b.count - a.count; }).slice(0, 8);

// Fingerprint clusters for recurring
var fpMap = {};
for (var k = 0; k < errors.length; k++) {
  var err = errors[k];
  if (err.ts < cutoff) continue;
  var fp = err.fingerprint || null;
  if (!fp) continue;
  if (!fpMap[fp]) fpMap[fp] = { fingerprint: fp, count: 0, message: err.message, category: err.category, severity: err.severity };
  fpMap[fp].count++;
}
var recurring = Object.values(fpMap).filter(function(c) { return c.count >= 2; }).sort(function(a, b) { return b.count - a.count; }).slice(0, 5);

// Health score
var score = 100;
score -= Math.min((sev.critical || 0) * 20, 40);
score -= Math.min((sev.error || 0) * 2, 30);
score -= Math.min((sev.warning || 0) * 0.5, 10);
score -= openCircuits.length * 15;
score = Math.max(Math.round(score), 0);
var healthLevel = score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : score >= 30 ? "degraded" : "critical";

// Prioritized action items
var actions = [];
if (openCircuits.length > 0) {
  actions.push({ priority: "critical", action: "Restore circuit breakers: " + openCircuits.map(function(b) { return b.name; }).join(", "), type: "circuit" });
}
if ((sev.critical || 0) > 0) {
  actions.push({ priority: "critical", action: (sev.critical) + " critical error(s) need immediate investigation", type: "error" });
}
if (recurring.length > 0) {
  actions.push({ priority: "high", action: recurring.length + " recurring pattern(s) — top: \"" + (recurring[0].message || "").slice(0, 50) + "\" (" + recurring[0].count + "x)", type: "recurring" });
}
if (spikes.length > 0) {
  actions.push({ priority: "high", action: spikes.length + " error spike(s) detected in the last " + hours + "h", type: "spike" });
}
if (trendDirection > 50) {
  actions.push({ priority: "medium", action: "Error rate trending up " + trendDirection + "% vs 7-day average", type: "trend" });
}
var unackedFixes = fixes.filter(function(f) { return !f.acknowledged; });
if (unackedFixes.length > 0) {
  actions.push({ priority: "low", action: unackedFixes.length + " unacknowledged fix(es) awaiting review", type: "fix" });
}
if (actions.length === 0) {
  actions.push({ priority: "info", action: "System healthy — no action items", type: "none" });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_tl_report",
      hours: hours,
      score: score,
      healthLevel: healthLevel,
      errorRate: health.errorRate || null,
      uptime: health.uptime || null,
      summary: {
        total: summary.total,
        bySeverity: sev,
        categories: cats.slice(0, 5),
        todayCount: todayCount,
        dailyAvg7d: Math.round(dailyAvg7d * 10) / 10,
        trendDirection: trendDirection
      },
      circuitBreakers: breakers.map(function(b) { return { name: b.name, state: b.state, failures: b.failures }; }),
      hourlyTrend: hourBuckets,
      spikes: spikes,
      topCodes: topCodes,
      recurring: recurring,
      actions: actions,
      fixes: {
        total: fixes.length,
        unacknowledged: unackedFixes.length,
        recent: unackedFixes.slice(0, 3).map(function(f) { return { description: f.description || f.message, category: f.category, ts: f.timestamp || f.ts }; })
      },
      generatedAt: Date.now()
    })
  }]
};

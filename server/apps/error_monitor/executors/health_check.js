var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);

var summaryRes = await ctx.fetch("http://localhost:3001/api/error-summary?hours=" + hours);
var circuitRes = await ctx.fetch("http://localhost:3001/api/circuit-breakers");
var fixesRes = await ctx.fetch("http://localhost:3001/api/action-log?count=200&type=fix");
var recentRes = await ctx.fetch("http://localhost:3001/api/error-log?count=200");

var summary = summaryRes.ok ? summaryRes.data : { total: 0, bySeverity: {}, byCategory: [], recentErrors: [] };
var breakers = circuitRes.ok && Array.isArray(circuitRes.data) ? circuitRes.data : [];
var fixes = fixesRes.ok && Array.isArray(fixesRes.data) ? fixesRes.data : [];
var errors = recentRes.ok && Array.isArray(recentRes.data) ? recentRes.data : [];

var sev = summary.bySeverity || {};
var openCircuits = breakers.filter(function(b) { return b.state === "open"; });

// Compute error codes breakdown from recent errors
var codeMap = {};
for (var i = 0; i < errors.length; i++) {
  var e = errors[i];
  var code = e.code || "UNKNOWN";
  if (!codeMap[code]) codeMap[code] = { code: code, count: 0, lastSeen: 0, categories: {} };
  codeMap[code].count++;
  if (e.ts > codeMap[code].lastSeen) codeMap[code].lastSeen = e.ts;
  var cat = e.category || "unknown";
  codeMap[code].categories[cat] = (codeMap[code].categories[cat] || 0) + 1;
}
var errorCodes = Object.values(codeMap).sort(function(a, b) { return b.count - a.count; });

// Compute fingerprint clusters (repeated errors)
var fpMap = {};
for (var j = 0; j < errors.length; j++) {
  var err = errors[j];
  var fp = err.fingerprint || "none";
  if (fp === "none") continue;
  if (!fpMap[fp]) fpMap[fp] = { fingerprint: fp, count: 0, message: err.message, category: err.category, severity: err.severity, lastSeen: 0 };
  fpMap[fp].count++;
  if (err.ts > fpMap[fp].lastSeen) fpMap[fp].lastSeen = err.ts;
}
var clusters = Object.values(fpMap).filter(function(c) { return c.count >= 2; }).sort(function(a, b) { return b.count - a.count; }).slice(0, 10);

// Health score: 100 = perfect, deductions for issues
var score = 100;
score -= Math.min((sev.critical || 0) * 20, 40);
score -= Math.min((sev.error || 0) * 2, 30);
score -= Math.min((sev.warning || 0) * 0.5, 10);
score -= openCircuits.length * 15;
score = Math.max(Math.round(score), 0);

var healthLevel = score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : score >= 30 ? "degraded" : "critical";

// Recommendations
var recommendations = [];
if (openCircuits.length > 0) recommendations.push("Circuit breakers open for: " + openCircuits.map(function(b) { return b.name; }).join(", ") + ". Check external service health.");
if ((sev.critical || 0) > 0) recommendations.push("Critical errors detected — investigate immediately.");
if (clusters.length > 0) recommendations.push(clusters.length + " recurring error pattern(s) found. Top: \"" + (clusters[0].message || "").slice(0, 60) + "\" (" + clusters[0].count + "x).");
if (fixes.filter(function(f) { return !f.acknowledged; }).length > 0) recommendations.push(fixes.filter(function(f) { return !f.acknowledged; }).length + " unacknowledged fix(es) — review and confirm.");
if (score >= 90 && summary.total === 0) recommendations.push("System is clean — no errors in the last " + hours + " hours.");

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_health_check",
      hours: hours,
      score: score,
      healthLevel: healthLevel,
      summary: {
        total: summary.total,
        bySeverity: sev,
        categoryCount: (summary.byCategory || []).length
      },
      circuitBreakers: {
        total: breakers.length,
        open: openCircuits.length,
        states: breakers.map(function(b) { return { name: b.name, state: b.state }; })
      },
      errorCodes: errorCodes.slice(0, 10),
      clusters: clusters,
      recommendations: recommendations,
      fixes: {
        total: fixes.length,
        unacknowledged: fixes.filter(function(f) { return !f.acknowledged; }).length
      },
      checkedAt: Date.now()
    })
  }]
};

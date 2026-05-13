var hours = Math.min(Math.max(parseInt(params.hours) || 6, 1), 48);

var healthRes = await ctx.fetch("http://localhost:3001/api/health");
var circuitRes = await ctx.fetch("http://localhost:3001/api/circuit-breakers");
var errorsRes = await ctx.fetch("http://localhost:3001/api/error-log?count=500");
var summaryRes = await ctx.fetch("http://localhost:3001/api/error-summary?hours=" + hours);

var health = healthRes.ok ? healthRes.data : {};
var breakers = circuitRes.ok && Array.isArray(circuitRes.data) ? circuitRes.data : [];
var errors = errorsRes.ok && Array.isArray(errorsRes.data) ? errorsRes.data : [];
var summary = summaryRes.ok ? summaryRes.data : { total: 0, bySeverity: {} };

var now = Date.now();
var cutoff = now - hours * 3600000;
var recentErrors = errors.filter(function(e) { return e.ts >= cutoff; });
var sev = summary.bySeverity || {};

var alerts = [];

// Alert 1: Circuit breaker open
var openCircuits = breakers.filter(function(b) { return b.state === "open"; });
for (var i = 0; i < openCircuits.length; i++) {
  alerts.push({
    id: "cb-" + openCircuits[i].name,
    level: "critical",
    title: "Circuit breaker OPEN: " + openCircuits[i].name,
    detail: "Service unavailable. Failures: " + openCircuits[i].failures + ". Requests will use fallback until reset.",
    source: "circuit-breaker",
    ts: openCircuits[i].lastFailureTime || now
  });
}

// Alert 2: Half-open circuits (recovering)
var halfOpen = breakers.filter(function(b) { return b.state === "half-open"; });
for (var h = 0; h < halfOpen.length; h++) {
  alerts.push({
    id: "cb-halfopen-" + halfOpen[h].name,
    level: "warning",
    title: "Circuit breaker recovering: " + halfOpen[h].name,
    detail: "Sending probe requests to check if service recovered.",
    source: "circuit-breaker",
    ts: halfOpen[h].lastFailureTime || now
  });
}

// Alert 3: Critical errors in window
var criticals = recentErrors.filter(function(e) { return e.severity === "critical"; });
if (criticals.length > 0) {
  alerts.push({
    id: "critical-errors",
    level: "critical",
    title: criticals.length + " critical error(s) in last " + hours + "h",
    detail: "Latest: " + (criticals[0].message || "Unknown").slice(0, 100),
    source: criticals[0].category || "unknown",
    ts: criticals[0].ts
  });
}

// Alert 4: Error rate above threshold
var errorRate = health.errorRate || {};
if (errorRate.count > 0 && errorRate.count >= errorRate.threshold * 0.7) {
  var isOver = errorRate.count >= errorRate.threshold;
  alerts.push({
    id: "error-rate",
    level: isOver ? "critical" : "warning",
    title: isOver ? "Error rate exceeded threshold" : "Error rate approaching threshold",
    detail: errorRate.count + " errors in 5min window (threshold: " + errorRate.threshold + ")",
    source: "error-rate-monitor",
    ts: now
  });
}

// Alert 5: Error spike detection — compare last hour vs average
var lastHourErrors = recentErrors.filter(function(e) { return e.ts >= now - 3600000; }).length;
var avgPerHour = hours > 1 ? (recentErrors.length / hours) : 0;
if (avgPerHour > 0 && lastHourErrors >= avgPerHour * 3 && lastHourErrors >= 5) {
  alerts.push({
    id: "error-spike",
    level: "warning",
    title: "Error spike: " + lastHourErrors + " errors in last hour",
    detail: "3x above average of " + Math.round(avgPerHour * 10) / 10 + "/hr over " + hours + "h window",
    source: "trend-analysis",
    ts: now
  });
}

// Alert 6: New error codes appearing
var recentCodes = {};
var olderCodes = {};
var oneHourAgo = now - 3600000;
for (var j = 0; j < errors.length; j++) {
  var e = errors[j];
  var code = e.code || null;
  if (!code) continue;
  if (e.ts >= oneHourAgo) {
    recentCodes[code] = (recentCodes[code] || 0) + 1;
  } else {
    olderCodes[code] = true;
  }
}
var newCodes = Object.keys(recentCodes).filter(function(c) { return !olderCodes[c]; });
if (newCodes.length > 0) {
  alerts.push({
    id: "new-error-codes",
    level: "info",
    title: newCodes.length + " new error code(s) in last hour",
    detail: newCodes.slice(0, 5).join(", "),
    source: "error-code-analysis",
    ts: now
  });
}

// Alert 7: Recurring patterns accelerating
var fpMap = {};
for (var k = 0; k < recentErrors.length; k++) {
  var err = recentErrors[k];
  var fp = err.fingerprint;
  if (!fp) continue;
  if (!fpMap[fp]) fpMap[fp] = { count: 0, message: err.message, category: err.category, severity: err.severity };
  fpMap[fp].count++;
}
var fastRecurring = Object.values(fpMap).filter(function(c) { return c.count >= 5; }).sort(function(a, b) { return b.count - a.count; });
if (fastRecurring.length > 0) {
  alerts.push({
    id: "recurring-surge",
    level: "warning",
    title: fastRecurring.length + " high-frequency recurring error(s)",
    detail: "Top: \"" + (fastRecurring[0].message || "").slice(0, 60) + "\" (" + fastRecurring[0].count + "x in " + hours + "h)",
    source: fastRecurring[0].category || "unknown",
    ts: now
  });
}

// Sort by severity
var levelOrder = { critical: 0, warning: 1, info: 2 };
alerts.sort(function(a, b) { return (levelOrder[a.level] || 3) - (levelOrder[b.level] || 3); });

var overallStatus = alerts.some(function(a) { return a.level === "critical"; }) ? "critical" :
  alerts.some(function(a) { return a.level === "warning"; }) ? "warning" : "clear";

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_alert_status",
      hours: hours,
      status: overallStatus,
      alertCount: alerts.length,
      alerts: alerts,
      errorRate: errorRate,
      circuitSummary: {
        total: breakers.length,
        open: openCircuits.length,
        halfOpen: halfOpen.length,
        closed: breakers.filter(function(b) { return b.state === "closed"; }).length
      },
      windowSummary: {
        total: recentErrors.length,
        critical: sev.critical || 0,
        error: sev.error || 0,
        warning: sev.warning || 0,
        info: sev.info || 0
      },
      checkedAt: now
    })
  }]
};

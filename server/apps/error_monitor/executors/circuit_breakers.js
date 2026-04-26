var res = await ctx.fetch("http://localhost:3001/api/circuit-breakers");
var breakers = res.ok && Array.isArray(res.data) ? res.data : [];

var summaryRes = await ctx.fetch("http://localhost:3001/api/error-summary?hours=1");
var recentErrors = summaryRes.ok ? summaryRes.data : { total: 0, bySeverity: {} };

var states = breakers.map(function(b) {
  var health = b.state === "closed" ? "healthy" : b.state === "open" ? "failing" : "recovering";
  return {
    name: b.name,
    state: b.state,
    health: health,
    failures: b.failures,
    lastFailureTime: b.lastFailureTime,
    timeSinceFailure: b.lastFailureTime > 0 ? Date.now() - b.lastFailureTime : null
  };
});

var anyOpen = states.some(function(s) { return s.state === "open"; });
var anyHalfOpen = states.some(function(s) { return s.state === "half-open"; });
var overallHealth = anyOpen ? "degraded" : anyHalfOpen ? "recovering" : "healthy";

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_circuit_breakers",
      breakers: states,
      overallHealth: overallHealth,
      recentErrorRate: recentErrors.total || 0,
      checkedAt: Date.now()
    })
  }]
};

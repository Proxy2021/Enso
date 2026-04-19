var action = (params.action || "list").trim().toLowerCase();

if (action === "acknowledge" && params.fixId) {
  var ackRes = await ctx.fetch("http://localhost:3001/api/action-log?count=500&type=fix");
  var allFixes = ackRes.ok && Array.isArray(ackRes.data) ? ackRes.data : [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_error_monitor_fixes",
        action: "acknowledge",
        fixId: params.fixId,
        message: "Fix acknowledged",
        fixes: allFixes,
        unacknowledged: allFixes.filter(function(f) { return !f.acknowledged; }).length,
        total: allFixes.length
      })
    }]
  };
}

var res = await ctx.fetch("http://localhost:3001/api/action-log?count=200&type=fix");
var fixes = res.ok && Array.isArray(res.data) ? res.data : [];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_fixes",
      action: "list",
      fixes: fixes,
      unacknowledged: fixes.filter(function(f) { return !f.acknowledged; }).length,
      total: fixes.length
    })
  }]
};

var sortBy = params.sort_by || "cpu";
var limit = params.limit || 15;

var result = await ctx.callTool("enso_system_processes", { sort_by: sortBy, limit: limit });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_system_monitor_processes",
        error: result.error || "Failed to list processes",
        sortBy: sortBy,
        processes: []
      })
    }]
  };
}

var info = result.data;
if (typeof info === "string") {
  try { info = JSON.parse(info); } catch(e) { info = {}; }
}

info.tool = "enso_system_monitor_processes";

return {
  content: [{
    type: "text",
    text: JSON.stringify(info)
  }]
};

var result = await ctx.callTool("enso_system_info", {});
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_system_monitor_overview",
        error: result.error || "Failed to get system info"
      })
    }]
  };
}

var info = result.data;
if (typeof info === "string") {
  try { info = JSON.parse(info); } catch(e) { info = {}; }
}

info.tool = "enso_system_monitor_overview";

return {
  content: [{
    type: "text",
    text: JSON.stringify(info)
  }]
};

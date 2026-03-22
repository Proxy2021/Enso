var result = await ctx.callTool("enso_system_disk", {});
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_system_monitor_disk_usage",
        error: result.error || "Failed to get disk info",
        disks: []
      })
    }]
  };
}

var info = result.data;
if (typeof info === "string") {
  try { info = JSON.parse(info); } catch(e) { info = {}; }
}

info.tool = "enso_system_monitor_disk_usage";

return {
  content: [{
    type: "text",
    text: JSON.stringify(info)
  }]
};

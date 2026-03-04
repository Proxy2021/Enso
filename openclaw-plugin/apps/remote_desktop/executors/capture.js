var monitor = params.monitor || 0;
var result = await ctx.callTool("enso_screen_capture", { monitor: monitor });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_capture",
        error: result.error || "Failed to capture screen"
      })
    }]
  };
}
var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_remote_desktop_capture";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

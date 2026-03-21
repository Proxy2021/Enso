var text = (params.text || "").toString();
if (!text) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_type",
        error: "text is required"
      })
    }]
  };
}
var result = await ctx.callTool("enso_screen_type", { text: text });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_type",
        error: result.error || "Failed to type"
      })
    }]
  };
}
var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_remote_desktop_type";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

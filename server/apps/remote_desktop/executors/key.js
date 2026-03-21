var combo = (params.combo || "").toString().trim();
if (!combo) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_key",
        error: "combo is required (e.g. control+c, enter, escape)"
      })
    }]
  };
}
var result = await ctx.callTool("enso_screen_key", { combo: combo });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_key",
        error: result.error || "Failed to send key combo"
      })
    }]
  };
}
var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_remote_desktop_key";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

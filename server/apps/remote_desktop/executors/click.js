var x = params.x;
var y = params.y;
var button = params.button || "left";
if (typeof x !== "number" || typeof y !== "number") {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_click",
        error: "x and y coordinates are required"
      })
    }]
  };
}
var result = await ctx.callTool("enso_screen_click", { x: x, y: y, button: button });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_click",
        error: result.error || "Failed to click"
      })
    }]
  };
}
var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_remote_desktop_click";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

var x = params.x;
var y = params.y;
var direction = (params.direction || "").toString();
var amount = params.amount || 3;
if (typeof x !== "number" || typeof y !== "number") {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_scroll",
        error: "x and y coordinates are required"
      })
    }]
  };
}
if (!direction) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_scroll",
        error: "direction is required (up, down, left, right)"
      })
    }]
  };
}
var result = await ctx.callTool("enso_screen_scroll", { x: x, y: y, direction: direction, amount: amount });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_remote_desktop_scroll",
        error: result.error || "Failed to scroll"
      })
    }]
  };
}
var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_remote_desktop_scroll";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

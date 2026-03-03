var path = (params.path || "").trim();

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_inspect",
        error: "No file path provided"
      })
    }]
  };
}

var result = await ctx.callTool("enso_media_inspect_file", { path: path });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_inspect",
        error: result.error || "Failed to inspect file",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_gallery_inspect";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

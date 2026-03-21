var id = (params.id || "").trim();

if (!id) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_view",
        error: "Asset ID is required"
      })
    }]
  };
}

var result = await ctx.callTool("enso_asset_view", { id: id });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_view",
        error: result.error || "Failed to view asset",
        id: id
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_asset_gallery_view";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

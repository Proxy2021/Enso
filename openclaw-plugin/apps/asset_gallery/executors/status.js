var id = (params.id || "").trim();
var ids = params.ids || [];
var status = (params.status || "").trim();

if (!status) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_status",
        error: "Status value is required"
      })
    }]
  };
}

var toolParams = { status: status };
if (id) toolParams.id = id;
if (ids.length > 0) toolParams.ids = ids;

var result = await ctx.callTool("enso_asset_update_status", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_status",
        error: result.error || "Failed to update status",
        id: id
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_asset_gallery_status";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

var action = (params.action || "").trim() || "move";
var ids = params.ids || [];
var campaign = (params.campaign || "").trim();
var tags = params.tags || [];
var collectionName = (params.collectionName || "").trim();

var toolParams = { action: action };
if (ids.length > 0) toolParams.ids = ids;
if (campaign) toolParams.campaign = campaign;
if (tags.length > 0) toolParams.tags = tags;
if (collectionName) toolParams.collectionName = collectionName;

var result = await ctx.callTool("enso_asset_organize", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_organize",
        action: action,
        error: result.error || "Failed to organize assets",
        message: result.error || "Operation failed"
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_asset_gallery_organize";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

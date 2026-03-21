var title = (params.title || "").trim();
var campaign = (params.campaign || "").trim();
var format = (params.format || "").trim();
var width = params.width || 0;
var height = params.height || 0;
var tags = params.tags || [];
var category = (params.category || "").trim();
var usageRights = (params.usageRights || "").trim();
var notes = (params.notes || "").trim();

if (!title) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_create",
        error: "Asset title is required"
      })
    }]
  };
}

var toolParams = { title: title };
if (campaign) toolParams.campaign = campaign;
if (format) toolParams.format = format;
if (width) toolParams.width = width;
if (height) toolParams.height = height;
if (tags.length > 0) toolParams.tags = tags;
if (category) toolParams.category = category;
if (usageRights) toolParams.usageRights = usageRights;
if (notes) toolParams.notes = notes;

var result = await ctx.callTool("enso_asset_create", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_asset_gallery_create",
        error: result.error || "Failed to create asset",
        title: title
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_asset_gallery_create";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

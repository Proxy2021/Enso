var action = (params.action || "").trim() || "list";
var collectionName = (params.collectionName || "").trim();
var photoPath = (params.photoPath || "").trim();
var newName = (params.newName || "").trim();

var toolParams = { action: action };
if (collectionName) toolParams.collectionName = collectionName;
if (photoPath) toolParams.photoPath = photoPath;
if (newName) toolParams.newName = newName;

var result = await ctx.callTool("enso_media_manage_collection", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_collection",
        error: result.error || "Collection operation failed",
        action: action
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}
data.tool = "enso_media_gallery_collection";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

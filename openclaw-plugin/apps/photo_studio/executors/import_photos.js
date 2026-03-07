var inputPath = (params.path || "").trim();
var filter = params.filter || "image";

// Delegate to the native media browse tool for filesystem listing
var result = await ctx.callTool("enso_media_browse_folder", {
  path: inputPath || "",
  filter: filter,
  sortBy: params.sortBy || "name",
  sortDir: params.sortDir || "asc"
});

if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_import_photos",
        error: result.error || "Failed to browse directory"
      })
    }]
  };
}

var data = result.data;

// Re-tag the tool so our template renders it
data.tool = "enso_photo_studio_import_photos";

return {
  content: [{
    type: "text",
    text: JSON.stringify(data)
  }]
};

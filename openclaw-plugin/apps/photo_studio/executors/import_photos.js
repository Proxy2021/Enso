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

// Include demo showcase image URLs so they resolve correctly on remote/mobile clients
var isRoot = !data.path || data.path === "/";
if (isRoot || (data.items || []).length === 0) {
  data.demoImages = {
    kodak_portra_400: "/demo/kodak_portra_400.jpg",
    blade_runner: "/demo/blade_runner.jpg",
    wong_kar_wai: "/demo/wong_kar_wai.jpg",
    cinestill_800t: "/demo/cinestill_800t.jpg",
    moriyama: "/demo/moriyama.jpg",
    nordic_noir: "/demo/nordic_noir.jpg",
    wes_anderson: "/demo/wes_anderson.jpg",
    ghibli: "/demo/ghibli.jpg",
    faded_editorial: "/demo/faded_editorial.jpg"
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify(data)
  }]
};

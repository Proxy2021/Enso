// Upload photos executor — receives file paths from client upload,
// copies to a working directory, and returns browse-compatible data.

var files = params.files || [];
var names = params.names || [];
var mediaUrls = params.mediaUrls || [];

if (!files.length) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_upload_photos",
        error: "No files were uploaded"
      })
    }]
  };
}

// Build items array compatible with the import view
var items = [];
for (var i = 0; i < files.length; i++) {
  var filePath = files[i];
  var name = names[i] || filePath.split("/").pop() || "photo_" + i + ".jpg";
  var mediaUrl = mediaUrls[i] || "";
  var ext = "." + name.split(".").pop().toLowerCase();

  items.push({
    name: name,
    path: filePath,
    ext: ext,
    type: "image",
    size: 0,
    mediaUrl: mediaUrl
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_import_photos",
      currentPath: "Uploaded Photos",
      parentPath: "",
      isRoot: false,
      items: items,
      total: items.length,
      showing: items.length,
      filter: "image",
      viewMode: "grid"
    })
  }]
};

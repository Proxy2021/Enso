var path = (params.path || "").trim();

// ── Path normalization ──
if (path && path.charAt(0) !== '/' && path.charAt(0) !== '~' && !/^[A-Z]:/i.test(path)) {
  if (path.indexOf('/') > 0) {
    path = '/' + path;
  }
}

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_view",
        error: "No file path provided"
      })
    }]
  };
}

var result = await ctx.callTool("enso_media_view_photo", { path: path });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_view",
        error: result.error || "Failed to load photo",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Compute derived info
var size = data.size || 0;
var exif = data.exif || {};
var megapixels = 0;
if (exif.width && exif.height) {
  megapixels = Math.round((exif.width * exif.height) / 100000) / 10;
}
data.megapixels = megapixels;

// Compute aspect ratio and orientation
if (exif.width && exif.height) {
  var ratio = exif.width / exif.height;
  if (ratio > 1.05) data.orientation = "landscape";
  else if (ratio < 0.95) data.orientation = "portrait";
  else data.orientation = "square";
  data.aspectRatio = ratio.toFixed(2);
}

// Compute folder path for back navigation
data.folderPath = path.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || ".";

data.tool = "enso_media_gallery_view";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

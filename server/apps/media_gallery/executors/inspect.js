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

// ── Compute derived metadata ──
var exif = data.exif || {};

// Resolution and megapixels
if (exif.width && exif.height) {
  data.megapixels = Math.round((exif.width * exif.height) / 100000) / 10;
  data.resolution = exif.width + "x" + exif.height;

  var ratio = exif.width / exif.height;
  if (ratio > 1.05) data.orientation = "landscape";
  else if (ratio < 0.95) data.orientation = "portrait";
  else data.orientation = "square";

  // Common aspect ratio label
  var r = exif.width / exif.height;
  if (Math.abs(r - 1.5) < 0.05) data.aspectRatioLabel = "3:2";
  else if (Math.abs(r - 1.333) < 0.05) data.aspectRatioLabel = "4:3";
  else if (Math.abs(r - 1.778) < 0.05) data.aspectRatioLabel = "16:9";
  else if (Math.abs(r - 1.0) < 0.05) data.aspectRatioLabel = "1:1";
  else data.aspectRatioLabel = r.toFixed(2) + ":1";
}

// File size category
var size = data.size || 0;
if (size < 500000) data.sizeCategory = "small";
else if (size < 3000000) data.sizeCategory = "medium";
else if (size < 10000000) data.sizeCategory = "large";
else data.sizeCategory = "very large";

// Compute folder path for navigation
data.folderPath = path.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || ".";

data.tool = "enso_media_gallery_inspect";
return { content: [{ type: "text", text: JSON.stringify(data) }] };

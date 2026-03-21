// Browse the Style Gallery — rich bilingual descriptions, reference galleries, and technical details
var styleId = (params.styleId || "").trim();

var result = await ctx.callTool("enso_media_style_gallery", { styleId: styleId });

if (!result || !result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_style_gallery",
        error: result ? result.error || "Failed to load gallery" : "Gallery unavailable"
      })
    }]
  };
}

var data = result.data || result;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Wrap with our tool identifier
data.tool = "enso_photo_studio_style_gallery";

return {
  content: [{
    type: "text",
    text: JSON.stringify(data)
  }]
};

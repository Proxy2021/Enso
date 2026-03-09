// List all available photo processing styles
var result = await ctx.callTool("enso_media_list_styles", {});

if (!result || !result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_list_styles",
        error: "Failed to load styles"
      })
    }]
  };
}

var data = result.data || result;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_list_styles",
      total: data.total || 0,
      styles: data.styles || [],
      categories: data.categories || {}
    })
  }]
};

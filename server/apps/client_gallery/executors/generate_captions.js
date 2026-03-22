var galleryId = (params.galleryId || "").trim();
var style = (params.style || "").trim() || "elegant";
var regenerateAll = params.regenerateAll === true;

if (!galleryId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_generate_captions",
        error: "Gallery ID is required"
      })
    }]
  };
}

var raw = await ctx.store.get("gallery_" + galleryId);
if (!raw) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_generate_captions",
        error: "Gallery not found: " + galleryId
      })
    }]
  };
}

var gallery = {};
try { gallery = JSON.parse(raw); } catch(e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_generate_captions",
        error: "Failed to parse gallery data"
      })
    }]
  };
}

if (!Array.isArray(gallery.photos) || gallery.photos.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_generate_captions",
        galleryId: galleryId,
        galleryName: gallery.name,
        style: style,
        total: 0,
        generated: 0,
        skipped: 0,
        photos: [],
        message: "No photos in gallery"
      })
    }]
  };
}

var styleGuides = {
  elegant: "Write in a refined, high-end gallery tone. Use rich, sensory language. Example: 'Golden light bathes the scene in warmth...'",
  storytelling: "Write in a narrative, moment-focused tone. Capture the story. Example: 'As the sun dipped below the horizon...'",
  minimal: "Write in a short, poetic, evocative tone. Use fragments if fitting. Example: 'Stillness. Warmth. A stolen glance.'",
  descriptive: "Write in a clear, informative tone. Describe what's visible. Example: 'The couple shares their first dance beneath string lights...'"
};

var styleGuide = styleGuides[style] || styleGuides.elegant;
var generated = 0;
var skipped = 0;

for (var i = 0; i < gallery.photos.length; i++) {
  var photo = gallery.photos[i];

  // Skip photos that already have captions unless regenerating all
  if (!regenerateAll && photo.caption && (photo.captionGenerated || photo.captionEditedByUser)) {
    skipped++;
    continue;
  }

  // Skip user-edited captions unless explicitly regenerating
  if (!regenerateAll && photo.captionEditedByUser) {
    skipped++;
    continue;
  }

  var prompt = "Write a gallery caption for a photograph.\n\n" +
    "Gallery: " + (gallery.name || "Untitled Gallery") + "\n" +
    "Theme/Event: " + (gallery.description || "Professional photography") + "\n" +
    "Photo filename: " + (photo.filename || "photo") + "\n" +
    (photo.notes ? "Photographer notes: " + photo.notes + "\n" : "") +
    "\nStyle: " + styleGuide + "\n\n" +
    "Guidelines:\n" +
    "- Write exactly 1-2 sentences (20-40 words)\n" +
    "- Describe the mood, moment, and visual story\n" +
    "- Use warm, evocative language appropriate for a client gallery\n" +
    "- Never mention technical camera settings\n" +
    "- Never start with 'This photograph shows...' or 'In this image...'\n" +
    "- Be specific to the event/theme context\n\n" +
    "Return ONLY the caption text, no quotes or formatting.";

  var result = await ctx.ask(prompt);

  if (result.ok && result.text) {
    var captionText = result.text.trim();
    // Remove surrounding quotes if present
    if ((captionText.startsWith('"') && captionText.endsWith('"')) ||
        (captionText.startsWith("'") && captionText.endsWith("'"))) {
      captionText = captionText.substring(1, captionText.length - 1);
    }
    gallery.photos[i].caption = captionText;
    gallery.photos[i].captionGenerated = true;
    gallery.photos[i].captionEditedByUser = false;
    generated++;
  } else {
    skipped++;
  }
}

gallery.updatedAt = Date.now();
await ctx.store.set("gallery_" + galleryId, JSON.stringify(gallery));

var photoSummary = gallery.photos.map(function(p) {
  return {
    id: p.id,
    url: p.url,
    filename: p.filename,
    caption: p.caption,
    captionGenerated: p.captionGenerated,
    captionEditedByUser: p.captionEditedByUser
  };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_client_gallery_generate_captions",
      galleryId: galleryId,
      galleryName: gallery.name,
      style: style,
      total: gallery.photos.length,
      generated: generated,
      skipped: skipped,
      photos: photoSummary,
      message: generated + " caption" + (generated !== 1 ? "s" : "") + " generated" +
        (skipped > 0 ? ", " + skipped + " skipped" : "")
    })
  }]
};
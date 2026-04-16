var action = (params.action || "browse").trim();
var themeId = (params.themeId || "").trim();
var customTheme = (params.customTheme || "").trim();

// Load pipeline
var pipeline = ctx.store.get("pipeline");

// Theme definitions
var THEMES = [
  {
    id: "golden_hours",
    name: "Golden Hours",
    tagline: "Best sunrise & sunset shots across all trips",
    concept: "A celebration of the magical moments when the sun paints the world in gold and amber. This album follows the light from dawn to dusk across multiple locations, creating a visual meditation on the transient beauty of golden and blue hours.",
    pageCount: "20-25 spreads (40-50 pages)",
    layoutStyle: "Full-bleed hero images dominate. Minimal text. Large panoramic spreads for wide vistas. Pair warm sunrise shots with cool blue-hour images for contrast.",
    mood: "Warm, contemplative, awe-inspiring",
    colorPalette: "Golds, ambers, deep blues, silhouette blacks, warm oranges",
    selectionCriteria: [
      "Strong golden/blue hour light as the primary subject",
      "Silhouettes against colorful skies",
      "Reflections in water during golden hour",
      "Long shadows creating dramatic geometry",
      "Cloud formations lit from below",
      "Landscapes transformed by quality of light"
    ],
    cameraNote: "Use your Sony A7R V for landscapes (resolution advantage) and Leica Q3 for street/people during golden hour (faster handling)",
    icon: "Sunrise",
    selected: false
  },
  {
    id: "street_life",
    name: "Street Life",
    tagline: "Markets, people, urban energy",
    concept: "An immersive journey through the living pulse of cities — street vendors, commuters, children playing, elderly conversations. This album captures the authentic human moments that define a place more than any landmark ever could.",
    pageCount: "22-28 spreads (44-56 pages)",
    layoutStyle: "Mix of candid full-bleed shots and tight grids of 2-3 detail images. Include some text spreads with brief observations or overheard conversations. Black and white pages mixed with color.",
    mood: "Energetic, intimate, authentic, documentary",
    colorPalette: "Rich urban tones, neon accents, warm skin tones, moody shadows",
    selectionCriteria: [
      "Candid human moments — not posed",
      "Gestures, expressions, body language that tell stories",
      "Environmental context — the setting matters",
      "Juxtaposition of old and new, tradition and modernity",
      "Street food, markets, daily rituals",
      "Layers and depth in urban scenes"
    ],
    cameraNote: "Leica Q3's 28mm is perfect for environmental portraits and street work. Use zone focusing for speed.",
    icon: "Users",
    selected: false
  },
  {
    id: "landscapes_light",
    name: "Landscapes & Light",
    tagline: "Epic vistas and atmospheric moments",
    concept: "A gallery of the most breathtaking natural scenes you've witnessed — mountain ranges, coastlines, forests, deserts. Each image celebrates the intersection of dramatic landscape and extraordinary light.",
    pageCount: "20-25 spreads (40-50 pages)",
    layoutStyle: "Dominated by full-bleed panoramic spreads. Minimal text. Pair wide establishing shots with intimate detail images (textures, patterns, close-ups of natural elements). Let the landscapes breathe.",
    mood: "Majestic, serene, powerful, timeless",
    colorPalette: "Earth tones, ocean blues, storm grays, forest greens, snow whites",
    selectionCriteria: [
      "Dramatic light conditions (storm light, fog, first/last light)",
      "Strong compositional anchors (leading lines, foreground interest)",
      "Atmospheric conditions that add mood (mist, rain, clouds)",
      "Scale indicators that emphasize grandeur",
      "Unique or rarely-seen vantage points",
      "Weather events and transient natural phenomena"
    ],
    cameraNote: "Sony A7R V's 61MP captures extraordinary landscape detail. Use a tripod and low ISO for maximum quality. Consider focus stacking for front-to-back sharpness.",
    icon: "Mountain",
    selected: false
  },
  {
    id: "year_in_photos",
    name: "A Year in Photos",
    tagline: "Best 40 shots from the past 12 months",
    concept: "A personal visual diary spanning an entire year — four seasons, multiple locations, diverse subjects. This album tells the story of YOUR year through its most powerful images, creating a time capsule you'll treasure forever.",
    pageCount: "20-25 spreads (40-50 pages)",
    layoutStyle: "Chronological with seasonal chapter breaks. Mix of hero shots and smaller moment captures. Include date and location captions. Seasonal color progressions create a natural visual arc.",
    mood: "Personal, nostalgic, celebratory, reflective",
    colorPalette: "Seasonal: spring pastels, summer saturation, autumn warmth, winter cool",
    selectionCriteria: [
      "One standout image per month minimum",
      "Mix of planned and spontaneous moments",
      "Seasonal variety — each season should be represented",
      "Personal milestones and meaningful locations",
      "Range of subjects: travel, nature, people, details",
      "Images that will mean more as years pass"
    ],
    cameraNote: "Pull from both cameras — the variety of focal lengths (28mm and multiple Sony lenses) adds visual diversity to a year-spanning album.",
    icon: "Calendar",
    selected: false
  },
  {
    id: "one_trip_one_story",
    name: "One Trip, One Story",
    tagline: "Deep dive into a single memorable journey",
    concept: "The most immersive album concept — a complete photographic narrative of one unforgettable trip. From arrival to departure, this album takes the viewer on the same journey you experienced, with all its discovery, wonder, and emotion.",
    pageCount: "25-30 spreads (50-60 pages)",
    layoutStyle: "Narrative flow with clear beginning, middle, end. Opening: arrival, orientation, first impressions. Rising: deeper exploration, discoveries. Climax: the defining moment(s). Resolution: reflection, departure. Include location maps and brief narrative text.",
    mood: "Immersive, narrative-driven, adventurous, personal",
    colorPalette: "Defined by the destination — Mediterranean blues, Asian reds, Nordic grays, tropical greens",
    selectionCriteria: [
      "Complete narrative arc: arrival → exploration → discovery → reflection",
      "Mix of wide context shots and intimate details",
      "Local food, culture, architecture, nature, people",
      "The unexpected moments that defined the trip",
      "Transitional images that create flow between scenes",
      "A few 'hero' images that capture the essence of the place"
    ],
    cameraNote: "Both cameras shine here. Sony for epic landscapes and telephoto details, Leica for street and quick candid moments. The focal length variety tells a richer story.",
    icon: "Map",
    selected: false
  }
];

// Handle select action
if (action === "select" && themeId && pipeline) {
  pipeline.selectedTheme = themeId;
  ctx.store.set("pipeline", pipeline);
}

// Handle custom theme
if (action === "custom" && customTheme && pipeline) {
  var customObj = {
    id: "custom",
    name: "Custom Theme",
    tagline: customTheme,
    concept: customTheme,
    pageCount: "20-25 spreads",
    layoutStyle: "Flexible — adapt to your creative vision",
    mood: "Personal",
    colorPalette: "Based on your selection",
    selectionCriteria: ["Images that fit your custom concept"],
    cameraNote: "Use whatever gear best serves your vision",
    icon: "Palette",
    selected: true
  };
  pipeline.selectedTheme = "custom";
  pipeline.customTheme = customObj;
  ctx.store.set("pipeline", pipeline);
}

// Mark selected theme
var selectedTheme = pipeline ? pipeline.selectedTheme : null;
var themesOut = [];
for (var i = 0; i < THEMES.length; i++) {
  var t = THEMES[i];
  var copy = {};
  for (var k in t) { copy[k] = t[k]; }
  copy.selected = (copy.id === selectedTheme);
  themesOut.push(copy);
}

// Include custom theme if exists
if (pipeline && pipeline.customTheme) {
  themesOut.push(pipeline.customTheme);
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_pipeline_album_theme_picker",
      themes: themesOut,
      selectedTheme: selectedTheme,
      action: action
    })
  }]
};
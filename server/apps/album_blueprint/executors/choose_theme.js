var selectedTheme = (params.theme || "").trim().toLowerCase();

var themes = [
  {
    id: "city_at_dawn",
    title: "City at Dawn",
    subtitle: "Urban golden hour across multiple cities",
    icon: "sunrise",
    photoCount: { min: 35, max: 45 },
    spreads: { min: 18, max: 24 },
    chapters: [
      { name: "First Light", spreads: 3, description: "The world before anyone else — empty streets, long shadows, mist" },
      { name: "Awakening Streets", spreads: 4, description: "First signs of life — vendors, commuters, opening shutters" },
      { name: "Morning Rituals", spreads: 4, description: "Coffee culture, markets, routines that define a city" },
      { name: "The Golden Hour", spreads: 5, description: "Peak light — when architecture and atmosphere collide" },
      { name: "City Unveiled", spreads: 4, description: "The city fully awake — reflections on what dawn revealed" }
    ],
    emotionalArc: "contemplative → anticipation → warmth → wonder → reflection",
    arcValues: [20, 40, 55, 85, 40],
    printer: "Saal Digital",
    format: "28×28cm Professional Line Hardcover",
    paperRec: "Fuji Pearl lustre — enhances warm tones and golden light",
    estimatedCost: { min: 85, max: 120, currency: "EUR" },
    timeline: "25 days",
    difficulty: "medium",
    bestFor: "Urban photographers with dawn shots from 3+ cities",
    keyTechnique: "Consistent white balance across cities to unify the golden-hour palette",
    inspirationRef: "Fan Ho's 'Hong Kong Yesterday' — masterful use of morning light in urban spaces"
  },
  {
    id: "faces_of_journey",
    title: "Faces of the Journey",
    subtitle: "Portraits and street scenes that tell human stories",
    icon: "users",
    photoCount: { min: 30, max: 40 },
    spreads: { min: 16, max: 22 },
    chapters: [
      { name: "Strangers", spreads: 3, description: "First encounters — candid faces, unguarded moments" },
      { name: "Conversations", spreads: 4, description: "Connections made — markets, cafes, shared spaces" },
      { name: "Hands at Work", spreads: 3, description: "Detail shots — craft, labor, gesture" },
      { name: "Joy & Solitude", spreads: 4, description: "Emotional range — laughter, contemplation, everyday beauty" },
      { name: "Farewells", spreads: 3, description: "Departure moments — last glances, receding figures" }
    ],
    emotionalArc: "curiosity → connection → intimacy → depth → bittersweet",
    arcValues: [35, 55, 70, 85, 50],
    printer: "WhiteWall",
    format: "30×30cm Coffee Table Book",
    paperRec: "Matte fine art paper — reduces reflections on faces, adds gravitas",
    estimatedCost: { min: 110, max: 160, currency: "EUR" },
    timeline: "28 days",
    difficulty: "hard",
    bestFor: "Street photographers comfortable with candid and environmental portraits",
    keyTechnique: "Mix tight crops with environmental context — never more than 3 tight portraits in a row",
    inspirationRef: "Steve McCurry's 'Portraits' — every face tells a complete story in one frame"
  },
  {
    id: "quiet_landscape",
    title: "The Quiet Landscape",
    subtitle: "Contemplative landscapes worthy of the wall",
    icon: "mountain",
    photoCount: { min: 25, max: 35 },
    spreads: { min: 14, max: 20 },
    chapters: [
      { name: "Stillness", spreads: 3, description: "Minimal compositions — water, sky, horizon" },
      { name: "Textures of Earth", spreads: 4, description: "Close encounters — rock, sand, bark, ice" },
      { name: "Weather & Light", spreads: 4, description: "Atmosphere as subject — fog, rain, dramatic skies" },
      { name: "The Grand View", spreads: 4, description: "Expansive vistas — the moments that stop you breathing" },
      { name: "Return to Quiet", spreads: 3, description: "Closing meditations — twilight, reflections, solitude" }
    ],
    emotionalArc: "peace → discovery → drama → awe → serenity",
    arcValues: [25, 45, 75, 90, 30],
    printer: "Saal Digital",
    format: "30×21cm Landscape Hardcover",
    paperRec: "Hahnemühle fine art matte — archival quality, museum-grade reproduction",
    estimatedCost: { min: 95, max: 140, currency: "EUR" },
    timeline: "22 days",
    difficulty: "medium",
    bestFor: "Landscape and nature photographers — fewer photos but each must be exceptional",
    keyTechnique: "Generous white space between images lets each landscape breathe — less is more",
    inspirationRef: "Michael Kenna's minimalist landscapes — proof that restraint creates power"
  },
  {
    id: "one_trip_one_story",
    title: "One Trip, One Story",
    subtitle: "A single journey told as a complete narrative",
    icon: "map",
    photoCount: { min: 35, max: 50 },
    spreads: { min: 18, max: 26 },
    chapters: [
      { name: "Departure", spreads: 2, description: "Leaving home — airports, maps, anticipation" },
      { name: "First Impressions", spreads: 4, description: "Arrival — the sensory overwhelm of a new place" },
      { name: "Going Deeper", spreads: 5, description: "Getting beyond the surface — alleys, locals, hidden gems" },
      { name: "The Heart of It", spreads: 6, description: "The moments that define this trip — peak experiences" },
      { name: "Last Light", spreads: 3, description: "Final day — golden hour farewell, packing, one last look" },
      { name: "What I Carry Home", spreads: 2, description: "Epilogue — small objects, journal pages, the trip distilled" }
    ],
    emotionalArc: "anticipation → excitement → depth → peak → nostalgia → gratitude",
    arcValues: [30, 55, 65, 90, 50, 35],
    printer: "Printique",
    format: "10×10\" Lustre Hardcover",
    paperRec: "Lustre finish — versatile, handles both vibrant street scenes and moody interiors",
    estimatedCost: { min: 75, max: 110, currency: "USD" },
    timeline: "30 days",
    difficulty: "easy",
    bestFor: "First-time album creators — one trip provides a natural narrative structure",
    keyTechnique: "Include 3-5 'transitional' shots (doors, roads, bridges) to pace the journey between chapters",
    inspirationRef: "Alec Soth's 'Sleeping by the Mississippi' — a journey where place and people interweave"
  },
  {
    id: "year_in_light",
    title: "My Year in Light",
    subtitle: "Best-of annual collection organized by light quality",
    icon: "sun",
    photoCount: { min: 40, max: 50 },
    spreads: { min: 22, max: 28 },
    chapters: [
      { name: "Blue Hour", spreads: 4, description: "Pre-dawn and post-sunset — the quiet blue minutes" },
      { name: "Golden Hour", spreads: 5, description: "The magic hours — warm, directional, transformative" },
      { name: "Harsh Light, Hard Stories", spreads: 4, description: "Midday — embracing contrast, shadows, and graphic compositions" },
      { name: "Overcast & Intimate", spreads: 4, description: "Soft diffused light — portraits, details, moody scenes" },
      { name: "Night & Neon", spreads: 4, description: "After dark — city lights, long exposures, artificial color" },
      { name: "Chasing Light", spreads: 3, description: "Epilogue — the year's single best light moment, printed full bleed" }
    ],
    emotionalArc: "mystery → warmth → intensity → tenderness → energy → transcendence",
    arcValues: [40, 70, 60, 50, 65, 90],
    printer: "Saal Digital",
    format: "28×28cm Professional Line Hardcover",
    paperRec: "Fuji Pearl lustre — best color reproduction across varied lighting conditions",
    estimatedCost: { min: 100, max: 150, currency: "EUR" },
    timeline: "30 days",
    difficulty: "medium",
    bestFor: "Photographers with a full year of diverse shooting — showcases range and growth",
    keyTechnique: "Sequence within each chapter from subtle to dramatic — build to the best shot in each section",
    inspirationRef: "Gregory Crewdson's cinematic lighting mastery — every frame is a study in light"
  }
];

var result = {
  tool: "enso_album_blueprint_choose_theme",
  themes: themes,
  selectedTheme: null,
  recommendation: {
    themeId: "one_trip_one_story",
    reason: "Best choice for a first album — a single trip provides natural narrative structure, manageable scope, and the easiest path from 124K photos to a finished book. You can always do the others after your first success."
  }
};

if (selectedTheme) {
  var found = null;
  for (var i = 0; i < themes.length; i++) {
    if (themes[i].id === selectedTheme) {
      found = themes[i];
      break;
    }
  }
  if (found) {
    result.selectedTheme = found;
  }
}

try {
  var saved = await ctx.store.get("selected_theme");
  if (saved) {
    result.savedTheme = saved;
  }
  if (selectedTheme && result.selectedTheme) {
    await ctx.store.set("selected_theme", selectedTheme);
  }
} catch(e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};

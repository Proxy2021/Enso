// Travel — Quick Reference Card: photography technique reference for travel photographers
var p = params || {};

// Scene-to-technique quick reference (from Location Immersion Research Guide)
var sceneGuide = [
  {
    scene: "Golden Hour Landscape",
    settings: "f/8-11, ISO 100, tripod recommended",
    technique: "Use graduated ND filter for balanced sky/ground. Shoot into the light for warm backlit glow.",
    composition: "Rule of thirds, leading lines toward sun, foreground interest"
  },
  {
    scene: "Blue Hour Cityscape",
    settings: "f/8, ISO 200-400, 2-10s exposure, tripod required",
    technique: "Wait until ambient light balances with artificial lights. Bracket exposures for HDR.",
    composition: "Reflections in water, symmetry, vanishing points of streets"
  },
  {
    scene: "Street Photography",
    settings: "f/5.6-8, ISO 400-1600, 1/125s+, auto ISO",
    technique: "Zone focus at 3m for quick shots. Anticipate moments. Shoot through frames.",
    composition: "Layers, juxtaposition, decisive moment, environmental portrait"
  },
  {
    scene: "Temple / Monument",
    settings: "f/8-11, ISO 100-400, wide angle 16-35mm",
    technique: "Arrive at opening for empty interiors. Use columns/doorways as natural frames.",
    composition: "Symmetry, leading lines, human for scale, vertical compositions"
  },
  {
    scene: "Market / Food",
    settings: "f/2.8-4, ISO 800-3200, 35-85mm",
    technique: "Get close. Ask permission. Use available light. Show hands and process.",
    composition: "Fill the frame, overhead flat lay, detail shots, environmental context"
  },
  {
    scene: "Portrait (Natural Light)",
    settings: "f/1.8-2.8, ISO 100-400, 50-135mm",
    technique: "Open shade for soft light. Catchlights in eyes. Background separation with wide aperture.",
    composition: "Eyes on upper third, negative space, environmental context, 45° angle"
  },
  {
    scene: "Night Photography",
    settings: "f/2.8-4, ISO 1600-6400, 1/30s-30s",
    technique: "Use stabilization or tripod. Light trails with long exposure. High ISO for handheld.",
    composition: "Leading lines of lights, neon reflections, silhouettes against lit backgrounds"
  },
  {
    scene: "Sunrise / Sunset",
    settings: "f/11, ISO 100, bracket +/- 2 stops",
    technique: "Arrive 30 min early. Expose for sky, let foreground go dark for silhouettes.",
    composition: "Sun as secondary element, clouds are key, reflective surfaces, silhouette subjects"
  },
  {
    scene: "Rain / Overcast",
    settings: "f/4-5.6, ISO 400-800, polarizer optional",
    technique: "Embrace reflections on wet surfaces. Overcast = giant softbox for portraits.",
    composition: "Reflections, puddles, umbrellas, moody atmosphere, saturated colors"
  },
  {
    scene: "Architecture Details",
    settings: "f/5.6-8, ISO 200-800, 24-70mm or macro",
    technique: "Shift lens or correct perspective in post. Look for textures, patterns, repetition.",
    composition: "Filling the frame, abstract patterns, diagonal lines, contrast of old/new"
  }
];

// Common camera settings by lighting condition
var lightingSettings = [
  { condition: "Bright Sunshine", aperture: "f/8-16", shutter: "1/250-1/1000s", iso: "100", notes: "Use lens hood. Polarizer deepens skies." },
  { condition: "Golden Hour", aperture: "f/4-11", shutter: "1/60-1/500s", iso: "100-400", notes: "Warm tones natural. Underexpose 1/3 stop for richer color." },
  { condition: "Blue Hour", aperture: "f/4-8", shutter: "1-15s", iso: "200-800", notes: "Tripod essential. Remote trigger or 2s timer." },
  { condition: "Overcast", aperture: "f/4-8", shutter: "1/60-1/250s", iso: "400-800", notes: "Even light, great for portraits. Boost contrast in post." },
  { condition: "Indoor (Ambient)", aperture: "f/2-4", shutter: "1/30-1/125s", iso: "800-3200", notes: "Use stabilization. Window light for portraits." },
  { condition: "Night (Handheld)", aperture: "f/1.8-2.8", shutter: "1/30-1/60s", iso: "3200-6400", notes: "Brace against walls. Burst mode for sharpest frame." },
  { condition: "Night (Tripod)", aperture: "f/8-11", shutter: "5-30s", iso: "100-400", notes: "Mirror lock-up or electronic shutter. ND for light trails." }
];

// Composition reminders
var compositionTips = [
  { name: "Rule of Thirds", description: "Place key elements along the grid lines or at intersections for dynamic balance" },
  { name: "Leading Lines", description: "Use roads, rivers, fences, or architectural lines to guide the viewer's eye into the frame" },
  { name: "Foreground Interest", description: "Include a strong foreground element to create depth — especially in landscapes" },
  { name: "Frame Within a Frame", description: "Use doorways, arches, windows, or branches to frame your subject naturally" },
  { name: "Negative Space", description: "Leave empty space around your subject for breathing room and emphasis" },
  { name: "Layers", description: "Compose with foreground, midground, and background elements for dimension" },
  { name: "Symmetry & Patterns", description: "Use reflections, repeating elements, or centered composition for impact" },
  { name: "Scale Reference", description: "Include a person or known object to convey the grandeur of a scene" },
  { name: "Color Contrast", description: "Look for complementary colors — warm/cool, bright/dark — to create visual tension" },
  { name: "Simplify", description: "When in doubt, remove distractions. Move closer or change angle to clean the frame" }
];

// Photographer style reference cards (from Elite Photographer Study)
var photographers = [
  {
    name: "Henri Cartier-Bresson",
    era: "1908–2004",
    style: "Geometric precision in fleeting moments — the decisive moment",
    bestFor: "Street photography, candid human gesture within architectural geometry",
    technique: "Zone-focus at 3m with 50mm lens. Wander for hours absorbing rhythm, then trust your reflexes.",
    gear: "Leica rangefinder + 50mm",
    accent: "#94a3b8"
  },
  {
    name: "Steve McCurry",
    era: "b. 1950",
    style: "Saturated color portraiture with deep emotional connection",
    bestFor: "Travel portraits, markets, temples — the human face as cultural window",
    technique: "Wait until subjects forget the camera. Seek complementary color contrasts (red/green, blue/gold).",
    gear: "Nikon + 105mm for portraits",
    accent: "#ef4444"
  },
  {
    name: "Ansel Adams",
    era: "1902–1984",
    style: "Technically perfect B&W landscapes with extraordinary tonal range",
    bestFor: "Grand landscapes, dramatic weather, mountains, wilderness",
    technique: "Pre-visualize the final image before pressing the shutter. Use the Zone System for tonal control.",
    gear: "Large-format view camera + filters",
    accent: "#e2e8f0"
  },
  {
    name: "Fan Ho",
    era: "1931–2016",
    style: "Light and shadow as narrative — cinematic minimalism in urban settings",
    bestFor: "Urban light/shadow compositions, lone figures in pools of light, Hong Kong alleys",
    technique: "Shoot at dawn/dusk only. Let geometric shadows BE the composition. One figure, one shadow, one beam.",
    gear: "Rolleiflex TLR",
    accent: "#f59e0b"
  },
  {
    name: "Alex Webb",
    era: "b. 1952",
    style: "Complex layered color compositions with multiple subjects in one frame",
    bestFor: "Dense street scenes, markets, tropical/Caribbean environments",
    technique: "Look for 3+ layers: foreground, midground, background. Let color collisions create visual tension.",
    gear: "Leica + 35mm Kodachrome",
    accent: "#8b5cf6"
  },
  {
    name: "Michael Kenna",
    era: "b. 1953",
    style: "Patient minimalist B&W landscapes — silence made visible",
    bestFor: "Waterfront twilight, lone trees, industrial landscapes, long exposures",
    technique: "Spend hours at one spot. Use 1-10 minute exposures to smooth water and clouds into silk.",
    gear: "Hasselblad + tripod + ND filters",
    accent: "#64748b"
  },
  {
    name: "Chris Burkard",
    era: "b. 1986",
    style: "Epic adventure landscapes with tiny human figures showing scale",
    bestFor: "Extreme environments — arctic surf, glaciers, mountain peaks, remote coastlines",
    technique: "Place a small human figure in a vast landscape to create awe. Embrace harsh conditions for unique light.",
    gear: "Sony mirrorless + wide angle",
    accent: "#06b6d4"
  },
  {
    name: "Vivian Maier",
    era: "1926–2009",
    style: "Intimate street observation — quiet poetry of daily life",
    bestFor: "Quiet village mornings, daily routines, self-portraits, ordinary moments elevated",
    technique: "Use a waist-level viewfinder or shoot from the hip. Observe without being observed. Find beauty in the mundane.",
    gear: "Rolleiflex TLR",
    accent: "#a78bfa"
  },
  {
    name: "Sebastião Salgado",
    era: "b. 1944",
    style: "Epic humanitarian B&W documentary with painterly light",
    bestFor: "Human stories at grand scale — workers, migration, wilderness, social documentary",
    technique: "Commit years to a single project. Use B&W to universalize human experience beyond culture.",
    gear: "Leica + Canon EOS, B&W only",
    accent: "#78716c"
  },
  {
    name: "Daido Moriyama",
    era: "b. 1938",
    style: "Gritty, high-contrast, blurred urban expressionism — raw and confrontational",
    bestFor: "Rain-soaked urban nights, neon cities, gritty street scenes, visual chaos",
    technique: "Shoot from the hip. Embrace blur, grain, and harsh contrast. The imperfection IS the style.",
    gear: "Compact camera, any camera",
    accent: "#f43f5e"
  }
];

// Travel photography gear checklist
var gearChecklist = [
  { item: "Camera body + spare battery", essential: true },
  { item: "Wide angle lens (16-35mm)", essential: true },
  { item: "Standard zoom (24-70mm)", essential: true },
  { item: "Fast prime (35mm or 50mm f/1.8)", essential: true },
  { item: "Telephoto (70-200mm)", essential: false },
  { item: "Travel tripod", essential: true },
  { item: "Circular polarizer", essential: true },
  { item: "ND filter set", essential: false },
  { item: "Lens cleaning kit", essential: true },
  { item: "Memory cards (2x minimum)", essential: true },
  { item: "Rain cover for camera", essential: false },
  { item: "Phone with PhotoPills/SunCalc", essential: true }
];

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_quick_ref",
  sceneGuide: sceneGuide,
  lightingSettings: lightingSettings,
  compositionTips: compositionTips,
  gearChecklist: gearChecklist,
  photographers: photographers
}) }] };

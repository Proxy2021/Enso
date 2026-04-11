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
  gearChecklist: gearChecklist
}) }] };

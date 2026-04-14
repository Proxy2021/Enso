// Golden Hour Planner — Quick Reference: camera settings, composition, gear
var p = params || {};

// Golden hour specific camera settings
var goldenHourSettings = [
  {
    condition: "Golden Hour — Landscape",
    aperture: "f/8 - f/11",
    shutter: "1/60 - 1/250s",
    iso: "100",
    wb: "Daylight (5500K)",
    notes: "Use tripod for sharpness. Graduated ND filter to balance bright sky and dark ground. Shoot RAW for maximum warmth preservation."
  },
  {
    condition: "Golden Hour — Portrait",
    aperture: "f/2.8 - f/4",
    shutter: "1/125 - 1/500s",
    iso: "100 - 200",
    wb: "Daylight (5500K)",
    notes: "Position subject facing the sun for warm glow. Watch for catchlights in eyes. Open shade nearby for softer alternative."
  },
  {
    condition: "Golden Hour — Street",
    aperture: "f/5.6 - f/8",
    shutter: "1/125 - 1/250s",
    iso: "200 - 400",
    wb: "Daylight (5500K)",
    notes: "Zone focus at 3m for quick captures. Look for shafts of light between buildings. Silhouettes against bright backgrounds."
  },
  {
    condition: "Golden Hour — Silhouette",
    aperture: "f/8 - f/11",
    shutter: "1/250 - 1/1000s",
    iso: "100",
    wb: "Daylight (5500K)",
    notes: "Meter for the brightest part of sky. Subject becomes pure black shape. Strong outlines work best — people, trees, buildings."
  },
  {
    condition: "Blue Hour — Cityscape",
    aperture: "f/8",
    shutter: "2 - 15s",
    iso: "200 - 400",
    wb: "Daylight (5500K)",
    notes: "Tripod mandatory. Wait for balance between ambient and artificial light. The 10-minute sweet spot when warm windows meet cool sky."
  },
  {
    condition: "Blue Hour — Reflections",
    aperture: "f/5.6 - f/8",
    shutter: "1 - 8s",
    iso: "200 - 800",
    wb: "Auto or Tungsten",
    notes: "Long exposure smooths water into mirror. Find still water — puddles, harbors, fountains. Overexpose slightly for ethereal feel."
  },
  {
    condition: "Pre-Dawn — Scouting",
    aperture: "f/2.8 - f/4",
    shutter: "1/15 - 1/60s",
    iso: "800 - 3200",
    wb: "Auto",
    notes: "Arrive 30 min before blue hour. Use this time to find composition, set up tripod, test angles. High ISO handheld for test shots."
  }
];

// Composition reminders specific to golden hour
var compositionTips = [
  {
    name: "Rule of Thirds",
    description: "Place the horizon on the upper or lower third line. Position your subject where grid lines intersect.",
    goldenHourTip: "Place the sun at an intersection point, never dead center."
  },
  {
    name: "Leading Lines",
    description: "Use roads, rivers, fences, or shadows to guide the eye through the frame.",
    goldenHourTip: "Long shadows at golden hour create natural leading lines. Use them."
  },
  {
    name: "Frame Within a Frame",
    description: "Use doorways, arches, windows, or tree branches to create a natural border around your subject.",
    goldenHourTip: "Backlit archways and windows create stunning silhouette frames at golden hour."
  },
  {
    name: "Light as Subject",
    description: "Let the quality of light itself be the star of your image, not just illumination.",
    goldenHourTip: "Shafts of golden light through dust, fog, or gaps between buildings — the light IS the photograph."
  },
  {
    name: "Foreground Interest",
    description: "Include a strong foreground element to create depth — rocks, flowers, textures.",
    goldenHourTip: "Low-angle golden light rakes across textures in the foreground, adding dimensional drama."
  },
  {
    name: "Negative Space",
    description: "Leave empty space around your subject for breathing room. Sky at golden hour is never truly empty.",
    goldenHourTip: "Golden/pink sky becomes luminous negative space. Let it dominate — your subject can be small."
  },
  {
    name: "Layers",
    description: "Compose with foreground, midground, and background. Each layer tells part of the story.",
    goldenHourTip: "Golden hour creates tonal separation between layers — warm highlights, cool shadows, atmospheric haze."
  },
  {
    name: "Shoot Low",
    description: "Get down to ground level. The lower your camera, the more dramatic the perspective.",
    goldenHourTip: "Low angle + golden light = epic rim lighting on grass, flowers, and ground textures."
  }
];

// Key pro tips from elite photographers
var proTips = [
  "Arrive 30 minutes before golden hour starts. Use that time to scout, compose, and make test exposures.",
  "Shoot RAW with white balance set to Daylight (5500K). This preserves the natural warmth that Auto WB will try to correct.",
  "Underexpose by 1/3 stop for richer, more saturated golden tones. Easier to brighten shadows than recover blown highlights.",
  "The best golden hour shots happen in the last 10 minutes. Don't pack up early — the light intensifies right before sunset.",
  "Look behind you. While everyone photographs the sunset, the scene behind you is bathed in the most beautiful front-lit golden glow.",
  "Clouds are your friend. Overcast days have no golden hour, but partly cloudy days produce the most dramatic light and color.",
  "Use a lens hood always. Low-angle sun creates flare that degrades contrast. Unless you want artistic flare — then remove the hood.",
  "Scout locations at midday, shoot them at golden hour. Midday visits reveal the geometry; golden hour reveals the magic."
];

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_ghp_quick_ref",
  goldenHourSettings: goldenHourSettings,
  compositionTips: compositionTips,
  proTips: proTips
}) }] };

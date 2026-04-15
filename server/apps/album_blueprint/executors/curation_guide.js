var passNum = typeof params.pass === "number" ? params.pass : 0;
var startingCount = typeof params.startingCount === "number" ? params.startingCount : 500;

if (passNum < 0) passNum = 0;
if (passNum > 5) passNum = 5;
if (startingCount < 10) startingCount = 10;

var passes = [
  {
    number: 1,
    name: "Technical Kill",
    icon: "x-circle",
    cullRate: 0.70,
    timePerPhoto: "2-3 seconds",
    totalTime: "25-40 minutes",
    mindset: "Be ruthless. This is about technical quality, not emotion. If it's soft, it's gone.",
    checklist: [
      { id: "focus", label: "Is the subject tack-sharp at intended focus point?", category: "Sharpness", critical: true },
      { id: "motion", label: "Any unintentional motion blur (camera shake or subject)?", category: "Sharpness", critical: true },
      { id: "exposure_blown", label: "Are highlights irrecoverably blown (flashing white)?", category: "Exposure", critical: true },
      { id: "exposure_blocked", label: "Are shadows completely blocked with no detail?", category: "Exposure", critical: false },
      { id: "noise", label: "Is noise level acceptable for print size (check at 100%)?", category: "Noise", critical: false },
      { id: "white_balance", label: "Is white balance correctable or intentional?", category: "Color", critical: false },
      { id: "chromatic", label: "Visible chromatic aberration on high-contrast edges?", category: "Optical", critical: false },
      { id: "dust", label: "Sensor dust spots on sky/smooth areas?", category: "Cleanliness", critical: false },
      { id: "composition", label: "Is the framing so off that no crop can save it?", category: "Composition", critical: true },
      { id: "duplicates", label: "Is this the best of a burst/bracket sequence?", category: "Selection", critical: true }
    ],
    tips: [
      "Work in Lightroom/Capture One grid view at medium thumbnails",
      "Flag rejects (X key in Lightroom) — don't deliberate, go with gut",
      "If you hesitate more than 5 seconds, keep it for now — you'll cut later",
      "Don't look at metadata yet — judge by what you see",
      "Take a 10-minute break every 150 photos to maintain standards"
    ],
    proTip: "Create a Smart Collection showing only unflagged photos so your reject pile disappears as you work."
  },
  {
    number: 2,
    name: "Print Test",
    icon: "maximize",
    cullRate: 0.50,
    timePerPhoto: "8-10 seconds",
    totalTime: "20-30 minutes",
    mindset: "Now you're evaluating for print. A photo that looks great on screen may fail on paper.",
    checklist: [
      { id: "resolution", label: "Does it have enough pixels for spread size? (Min 3000px on long edge for full bleed)", category: "Resolution", critical: true },
      { id: "crop_100", label: "At 100% crop, is the main subject still sharp and detailed?", category: "Detail", critical: true },
      { id: "shadow_detail", label: "Will shadow areas have visible detail or just go black in print?", category: "Tonality", critical: true },
      { id: "highlight_detail", label: "Do highlights have texture, or will they blow out on paper?", category: "Tonality", critical: false },
      { id: "color_gamut", label: "Any highly saturated colors that may not reproduce well (neon signs, sunsets)?", category: "Color", critical: false },
      { id: "banding", label: "Smooth gradients (sky) — any risk of banding in print?", category: "Technical", critical: false },
      { id: "upscale", label: "If resolution is borderline, can AI upscaling save it?", category: "Resolution", critical: false },
      { id: "print_orientation", label: "Does the aspect ratio work well on a book spread?", category: "Format", critical: false }
    ],
    tips: [
      "View every candidate at 100% zoom, focusing on the subject area",
      "Soft-proof for your target printer's paper profile if available",
      "Test print 2-3 photos at your local lab to calibrate expectations",
      "Landscape orientation photos work best for spreads; portrait for single pages",
      "Photos with extreme dynamic range need extra editing attention for print"
    ],
    proTip: "Order a single test print from your chosen printer BEFORE doing this pass. Seeing your work on paper changes everything."
  },
  {
    number: 3,
    name: "Thematic Grouping",
    icon: "layers",
    cullRate: 0.45,
    timePerPhoto: "15-20 seconds",
    totalTime: "30-40 minutes",
    mindset: "Switch from individual assessment to storytelling. Group photos that want to be together.",
    checklist: [
      { id: "story_thread", label: "Does this photo belong to an identifiable story thread?", category: "Narrative", critical: true },
      { id: "redundancy", label: "Is it saying something different from other photos in its group?", category: "Variety", critical: true },
      { id: "emotional", label: "Does it contribute emotional range to its chapter?", category: "Emotion", critical: true },
      { id: "transition", label: "Could it serve as a visual bridge between two themes?", category: "Flow", critical: false },
      { id: "pair", label: "Does it pair naturally with another photo (contrast, complement)?", category: "Pairing", critical: false },
      { id: "standalone", label: "Is it strong enough to stand alone on a full-bleed spread?", category: "Impact", critical: false }
    ],
    groupingTemplate: [
      { tag: "establishing", description: "Wide shots that set the scene — where are we?", targetCount: "5-8" },
      { tag: "detail", description: "Close-ups that reveal texture and intimacy", targetCount: "5-8" },
      { tag: "human", description: "People, portraits, street moments", targetCount: "4-6" },
      { tag: "atmosphere", description: "Light, weather, mood — the feeling of being there", targetCount: "4-6" },
      { tag: "action", description: "Movement, energy, things happening", targetCount: "3-5" },
      { tag: "quiet", description: "Stillness, contemplation, breathing room", targetCount: "3-5" },
      { tag: "signature", description: "Your absolute best — hero shots for full bleed", targetCount: "3-5" }
    ],
    tips: [
      "Use physical or virtual sticky notes to name your story threads",
      "Aim for 5-7 groups — fewer feels thin, more feels fragmented",
      "Every group needs at least 4 photos to justify a chapter",
      "Look for visual rhythms: wide-tight-wide, bright-dark-bright",
      "If a photo doesn't fit any group after 30 seconds of thought, cut it"
    ],
    proTip: "Print 4x6 thumbnails and arrange them on a table. Physical sorting reveals connections your screen can't show."
  },
  {
    number: 4,
    name: "Narrative Arc",
    icon: "trending-up",
    cullRate: 0.40,
    timePerPhoto: "20-30 seconds",
    totalTime: "30-45 minutes",
    mindset: "You're an editor now, not a photographer. Think about the reader's emotional journey page by page.",
    checklist: [
      { id: "opening", label: "Is there a compelling opening image that hooks the viewer?", category: "Structure", critical: true },
      { id: "build", label: "Does the sequence build in intensity through the middle?", category: "Pacing", critical: true },
      { id: "climax", label: "Is there a clear emotional peak — the image the book builds toward?", category: "Structure", critical: true },
      { id: "resolution", label: "Does the book end with a satisfying emotional resolution?", category: "Structure", critical: true },
      { id: "pacing", label: "Are there rest moments between intense sequences?", category: "Pacing", critical: true },
      { id: "variety", label: "Does the spread-by-spread sequence vary in scale, tone, and pace?", category: "Variety", critical: false },
      { id: "transitions", label: "Do adjacent spreads connect visually (color, shape, direction)?", category: "Flow", critical: false }
    ],
    arcGuide: {
      opening: { position: "First 2-3 spreads", intensity: 20, description: "Hook with an intriguing image — not your best, but one that makes the viewer want to turn the page" },
      risingAction: { position: "Spreads 4-10", intensity: 50, description: "Build complexity — introduce new themes, locations, subjects. Alternate between energy and rest." },
      climax: { position: "Spreads 11-16", intensity: 85, description: "Your strongest 4-6 images. Full bleeds, dramatic spreads. The emotional peak." },
      fallingAction: { position: "Spreads 17-20", intensity: 45, description: "Begin resolving — quieter images, reflective moments, detail shots" },
      denouement: { position: "Final 2-3 spreads", intensity: 30, description: "Close with a single powerful image that echoes the opening but resolves it" }
    },
    tips: [
      "The opening spread should NOT be your best photo — save that for the climax",
      "Create 'breathing room' with white-space layouts every 4-5 spreads",
      "Alternate between horizontal and vertical rhythms",
      "If two adjacent spreads feel similar, cut one — variety drives page-turning",
      "Read your sequence backwards to check if the arc works in reverse (it shouldn't)"
    ],
    proTip: "Watch a great film and pay attention to pacing — the same principles of tension and release apply to a photo book."
  },
  {
    number: 5,
    name: "Album Cut",
    icon: "scissors",
    cullRate: 0.25,
    timePerPhoto: "30-60 seconds",
    totalTime: "30-45 minutes",
    mindset: "Kill your darlings. A great album is defined by what you leave out, not what you include.",
    checklist: [
      { id: "necessary", label: "If I remove this photo, does the story break?", category: "Essential", critical: true },
      { id: "unique_voice", label: "Is this photo saying something no other photo in the album says?", category: "Unique", critical: true },
      { id: "spread_worthy", label: "Is this photo strong enough to justify the paper it'll be printed on?", category: "Quality", critical: true },
      { id: "neighbor_test", label: "Does it work with the photos on adjacent spreads?", category: "Context", critical: true },
      { id: "gift_test", label: "Would you be proud showing this specific image to the recipient?", category: "Personal", critical: true }
    ],
    killDarlingsFramework: [
      { rule: "The 'Almost' Rule", description: "If you describe a photo as 'almost great' — cut it. Almost doesn't print well." },
      { rule: "The Duplicate Energy Rule", description: "Two photos with the same emotional energy? Keep the braver one." },
      { rule: "The Walk-Away Test", description: "Close your laptop. Come back in 2 hours. First cut that catches your eye? Keep it. First one you forgot about? Cut it." },
      { rule: "The Gift Test", description: "Would the recipient specifically comment on this photo? If not, it's filler." },
      { rule: "The Cover Test", description: "Could any of these be the cover? You should have at least 3 cover-worthy shots." }
    ],
    tips: [
      "Your target is 35-40 photos for a 20-25 spread book",
      "Set a hard cap and stick to it — constraints breed creativity",
      "Ask a trusted friend to pick their top 30 from your shortlist — compare",
      "Sleep on your final selection. Review with fresh eyes the next morning",
      "If you can't cut below target, you have a stronger collection than you thought"
    ],
    proTip: "The difference between a good album and a great one is the 10 photos you had the courage to remove."
  }
];

var countAfterPass = [startingCount];
for (var i = 0; i < passes.length; i++) {
  var prev = countAfterPass[countAfterPass.length - 1];
  countAfterPass.push(Math.round(prev * (1 - passes[i].cullRate)));
}

for (var j = 0; j < passes.length; j++) {
  passes[j].inputCount = countAfterPass[j];
  passes[j].outputCount = countAfterPass[j + 1];
}

var result = {
  tool: "enso_album_blueprint_curation_guide",
  startingCount: startingCount,
  passes: passes,
  currentPass: passNum || null,
  selectedPass: null,
  funnel: countAfterPass,
  summary: {
    totalPhotosRemoved: startingCount - countAfterPass[countAfterPass.length - 1],
    finalCount: countAfterPass[countAfterPass.length - 1],
    overallCullRate: Math.round((1 - countAfterPass[countAfterPass.length - 1] / startingCount) * 100) + "%",
    estimatedTotalTime: "2.5-3.5 hours across all passes"
  }
};

if (passNum >= 1 && passNum <= 5) {
  result.selectedPass = passes[passNum - 1];
}

try {
  var progress = await ctx.store.get("curation_progress");
  if (progress) {
    result.savedProgress = progress;
  }
} catch(e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};

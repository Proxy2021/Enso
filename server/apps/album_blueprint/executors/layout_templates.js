var selectedLayout = (params.layout || "").trim().toLowerCase();

var layouts = [
  {
    id: "full_bleed",
    name: "Full Bleed Hero",
    icon: "maximize",
    photoCount: 1,
    useFor: "Climax moments — your absolute strongest single images",
    narrativePosition: "climax",
    frequency: "3-5 per album (reserve for the best)",
    diagram: [
      "┌──────────────────────────────┐",
      "│                              │",
      "│                              │",
      "│      ████████████████        │",
      "│      ████████████████        │",
      "│      ████ HERO ██████        │",
      "│      ████████████████        │",
      "│      ████████████████        │",
      "│                              │",
      "│                              │",
      "└──────────────────────────────┘"
    ],
    tips: [
      "Image must be minimum 300 DPI at full spread size (e.g., 6000×4000px for 10×10\" book)",
      "Leave no margins — the image should bleed off all four edges",
      "Works best with images that have a clear focal point and no critical detail at edges",
      "Reserve for climax moments and the single strongest image in the album"
    ],
    pairsWith: ["white_space", "text_image"],
    avoidAfter: ["full_bleed"],
    exampleSubjects: ["Dramatic landscape at golden hour", "Iconic architectural shot", "Peak emotional moment of the trip"],
    printNote: "Account for 3mm bleed on all sides — critical content must be at least 10mm from edges"
  },
  {
    id: "diptych",
    name: "Diptych",
    icon: "columns",
    photoCount: 2,
    useFor: "Comparison, contrast, or parallel narratives — two images in dialogue",
    narrativePosition: "rising",
    frequency: "4-6 per album",
    diagram: [
      "┌──────────────────────────────┐",
      "│                              │",
      "│  ┌──────────┐ ┌──────────┐  │",
      "│  │          │ │          │  │",
      "│  │  IMAGE   │ │  IMAGE   │  │",
      "│  │    A     │ │    B     │  │",
      "│  │          │ │          │  │",
      "│  └──────────┘ └──────────┘  │",
      "│                              │",
      "└──────────────────────────────┘"
    ],
    tips: [
      "Best when both images share a visual element (color, shape, line) but differ in subject",
      "Equal sizing implies equal weight — vary sizes for intentional hierarchy",
      "Before/after, old/new, near/far, human/nature are natural diptych themes",
      "Both images must be able to stand alone — a diptych of two weak photos is still weak"
    ],
    pairsWith: ["triptych", "scale_contrast"],
    avoidAfter: ["diptych"],
    exampleSubjects: ["Sunrise left, sunset right", "Street empty vs. street crowded", "Architectural detail vs. full building"],
    printNote: "Maintain consistent gutter (8-12mm) between images"
  },
  {
    id: "triptych",
    name: "Triptych Sequence",
    icon: "layout",
    photoCount: 3,
    useFor: "Showing progression, passage of time, or a visual story in three acts",
    narrativePosition: "rising",
    frequency: "2-3 per album",
    diagram: [
      "┌──────────────────────────────┐",
      "│                              │",
      "│ ┌────────┐┌────────┐┌──────┐│",
      "│ │        ││        ││      ││",
      "│ │  IMG   ││  IMG   ││ IMG  ││",
      "│ │   1    ││   2    ││  3   ││",
      "│ │        ││        ││      ││",
      "│ └────────┘└────────┘└──────┘│",
      "│                              │",
      "└──────────────────────────────┘"
    ],
    tips: [
      "Read left-to-right, so sequence should flow: setup → action → result",
      "Works brilliantly for showing a process (cooking, crafting, weather changing)",
      "The center image is visually dominant — make it the strongest of the three",
      "Consistent exposure and color temperature unifies the trio"
    ],
    pairsWith: ["full_bleed", "white_space"],
    avoidAfter: ["grid"],
    exampleSubjects: ["Three stages of sunset", "Approaching → entering → inside a building", "Three faces showing different emotions"],
    printNote: "All three images should have similar aspect ratios for clean alignment"
  },
  {
    id: "scale_contrast",
    name: "Small Detail + Large Landscape",
    icon: "move",
    photoCount: 2,
    useFor: "Creating visual tension through scale contrast — intimate detail next to vast landscape",
    narrativePosition: "any",
    frequency: "3-5 per album",
    diagram: [
      "┌──────────────────────────────┐",
      "│                              │",
      "│  ┌──┐  ┌──────────────────┐ │",
      "│  │  │  │                  │ │",
      "│  │DT│  │    LANDSCAPE     │ │",
      "│  │  │  │                  │ │",
      "│  └──┘  │                  │ │",
      "│        └──────────────────┘ │",
      "│                              │",
      "└──────────────────────────────┘"
    ],
    tips: [
      "The small image should be a tight crop — texture, detail, object, hand",
      "The large image provides context or contrast for the small one",
      "Works great for transitioning between chapters (detail of new location + establishing shot)",
      "The size difference should be dramatic — at least 3:1 ratio"
    ],
    pairsWith: ["diptych", "full_bleed"],
    avoidAfter: ["scale_contrast"],
    exampleSubjects: ["Cobblestone texture + medieval street", "Spice close-up + market wide shot", "Weathered hand + mountain landscape"],
    printNote: "Small image should still be high resolution — it draws the eye and invites close inspection"
  },
  {
    id: "white_space",
    name: "White Space Contemplative",
    icon: "square",
    photoCount: 1,
    useFor: "Breathing room — letting a quiet image float in generous margins",
    narrativePosition: "falling",
    frequency: "3-4 per album (every 4-5 spreads)",
    diagram: [
      "┌──────────────────────────────┐",
      "│                              │",
      "│                              │",
      "│         ┌────────┐          │",
      "│         │  IMG   │          │",
      "│         │        │          │",
      "│         └────────┘          │",
      "│                              │",
      "│                              │",
      "└──────────────────────────────┘"
    ],
    tips: [
      "Image should be centered or placed using rule of thirds within the white space",
      "Best for moody, contemplative, or minimalist images",
      "Critical for pacing — prevents visual fatigue between intense spreads",
      "White space can be white, cream, or even a subtle color wash matching the image"
    ],
    pairsWith: ["full_bleed", "triptych"],
    avoidAfter: ["white_space"],
    exampleSubjects: ["Solitary figure in mist", "Single object still life", "Minimal landscape", "Quiet architectural detail"],
    printNote: "The 'white' should match your paper stock — true white for glossy, warm cream for matte"
  },
  {
    id: "grid",
    name: "Grid Contact Sheet",
    icon: "grid",
    photoCount: "6-9",
    useFor: "Showing variety, texture, or a collection of small moments that form a pattern",
    narrativePosition: "rising",
    frequency: "1-2 per album (use sparingly)",
    diagram: [
      "┌──────────────────────────────┐",
      "│                              │",
      "│  ┌────┐ ┌────┐ ┌────┐      │",
      "│  │ 01 │ │ 02 │ │ 03 │      │",
      "│  └────┘ └────┘ └────┘      │",
      "│  ┌────┐ ┌────┐ ┌────┐      │",
      "│  │ 04 │ │ 05 │ │ 06 │      │",
      "│  └────┘ └────┘ └────┘      │",
      "│                              │",
      "└──────────────────────────────┘"
    ],
    tips: [
      "All images should share a unifying theme (doors, food, textures, signs, faces)",
      "Consistent cropping and color treatment is essential — they become a tapestry",
      "3×3 grid is the most balanced; 2×3 works for landscape books",
      "Think of it as one composite image, not six individual photos"
    ],
    pairsWith: ["full_bleed", "white_space"],
    avoidAfter: ["triptych", "grid"],
    exampleSubjects: ["9 doorways from different cities", "6 market food details", "9 textures of a place", "6 portraits of locals"],
    printNote: "Each grid cell needs at least 1500px on its long edge for sharp reproduction"
  },
  {
    id: "text_image",
    name: "Text + Image",
    icon: "type",
    photoCount: 1,
    useFor: "Chapter openers, section dividers, or adding context with a caption or quote",
    narrativePosition: "opening",
    frequency: "4-6 per album (once per chapter + intro/outro)",
    diagram: [
      "┌──────────────────────────────┐",
      "│                              │",
      "│  Chapter Three              │",
      "│  ─────────────              │",
      "│  Going Deeper               │",
      "│                              │",
      "│        ┌──────────────┐     │",
      "│        │    IMAGE     │     │",
      "│        └──────────────┘     │",
      "│                              │",
      "└──────────────────────────────┘"
    ],
    tips: [
      "Keep text minimal — a chapter title, location name, date, or brief quote",
      "Font choice matters: serif for classic/travel, sans-serif for modern/clean",
      "Text color should complement the facing image, not fight it",
      "The image on a chapter opener should set the tone, not be the chapter's best photo"
    ],
    pairsWith: ["full_bleed", "diptych"],
    avoidAfter: ["text_image"],
    exampleSubjects: ["Chapter title + atmospheric establishing shot", "Location name + map detail", "Quote + portrait"],
    printNote: "Use vector text (not rasterized) for sharp reproduction at any size"
  },
  {
    id: "panoramic",
    name: "Panoramic Foldout",
    icon: "arrow-right",
    photoCount: 1,
    useFor: "Ultra-wide landscapes, cityscapes, or stitched panoramas — maximum impact",
    narrativePosition: "climax",
    frequency: "0-1 per album (special occasion only)",
    diagram: [
      "┌─────────────────────────────────────────────┐",
      "│                                             │",
      "│  ┌───────────────────────────────────────┐  │",
      "│  │                                       │  │",
      "│  │        P A N O R A M I C               │  │",
      "│  │                                       │  │",
      "│  └───────────────────────────────────────┘  │",
      "│                                             │",
      "└─────────────────────────────────────────────┘"
    ],
    tips: [
      "Must be truly spectacular to justify the extra cost and complexity",
      "Gatefold (fold-out page) adds $5-15 per copy but creates a wow moment",
      "Image needs extreme resolution — minimum 8000px wide for a double-spread panorama",
      "Place at the book's emotional climax for maximum impact"
    ],
    pairsWith: ["white_space", "text_image"],
    avoidAfter: ["panoramic", "full_bleed"],
    exampleSubjects: ["Mountain range at sunrise", "City skyline at blue hour", "Vast desert landscape", "Stitched 180° view from a viewpoint"],
    printNote: "Discuss gatefold options with your printer — not all offer this. Budget $5-15 extra per copy."
  }
];

var result = {
  tool: "enso_album_blueprint_layout_templates",
  layouts: layouts,
  selectedLayout: null,
  sequencingTips: {
    rule1: "Never repeat the same layout on consecutive spreads",
    rule2: "Place full bleeds at emotional peaks (spread 11-16 in a 22-spread book)",
    rule3: "Use white space every 4-5 spreads as visual breathing room",
    rule4: "Start and end each chapter with a text+image spread",
    rule5: "Grid layouts work best in the rising action section, not at climax"
  },
  recommendedSequence: [
    "text_image (title page)",
    "diptych (introduction pair)",
    "scale_contrast (set the scene)",
    "triptych (build story)",
    "white_space (pause)",
    "full_bleed (first peak)",
    "diptych (contrast)",
    "grid (texture/variety)",
    "scale_contrast (new chapter)",
    "full_bleed (climax hero)",
    "white_space (breathing room)",
    "diptych (resolution)",
    "text_image (closing)"
  ]
};

if (selectedLayout) {
  for (var i = 0; i < layouts.length; i++) {
    if (layouts[i].id === selectedLayout) {
      result.selectedLayout = layouts[i];
      break;
    }
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};

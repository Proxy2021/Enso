// Style Gallery — returns curated viral 短视频 format templates (no API call)
var category = (params.category || "all").trim();

var TEMPLATES = [
  {
    id: "hook-question",
    name: "你知道吗？Hook",
    nameEn: "Did You Know? Hook",
    category: "education",
    description: "Open with a shocking question that challenges common belief. Viewers must watch to find out the answer.",
    hookType: "question",
    structure: ["Hook Question + Reaction (3s)", "Unexpected Reveal (5s)", "Explanation + Evidence (8s)", "Key Takeaway (5s)", "Follow CTA (3s)"],
    totalDuration: 24,
    exampleConcept: "The real reason successful people wake up early",
    bestFor: ["douyin", "tiktok", "youtube_shorts"],
    viralPotential: 9.2,
    examplePrompt: "Extreme close-up of tired eyes suddenly snapping open wide in shock, face illuminated by cold blue phone light in dark bedroom, dramatic zoom out reveals cluttered messy desk, coffee cups and notes everywhere, neon city lights outside window at 3am, moody cinematic lighting"
  },
  {
    id: "before-after",
    name: "蜕变前后对比",
    nameEn: "Before / After Transform",
    category: "lifestyle",
    description: "Dramatic transformation from problem state to solution. The contrast creates instant emotional impact and relatability.",
    hookType: "shock",
    structure: ["Problem State Close-up (3s)", "Transition Effect (1s)", "Solution State Reveal (5s)", "Process Tease (4s)", "Get This Result CTA (3s)"],
    totalDuration: 16,
    exampleConcept: "Cluttered bedroom transformed into aesthetic cozy space",
    bestFor: ["douyin", "tiktok", "rednote"],
    viralPotential: 8.8,
    examplePrompt: "Side-by-side wipe transition: left shows cluttered chaotic bedroom with harsh daylight, right reveals same room transformed into minimalist aesthetic sanctuary with warm fairy lights, plants, organized shelves, cozy textures, camera slowly pulls back to show full transformation"
  },
  {
    id: "pov-story",
    name: "POV 沉浸式故事",
    nameEn: "POV Immersive Story",
    category: "entertainment",
    description: "First-person perspective storytelling that puts viewers inside the scene. Creates deep emotional identification.",
    hookType: "emotion",
    structure: ["POV Hook Setup (3s)", "Rising Action (8s)", "Unexpected Twist (5s)", "Emotional Resolution (4s)", "Duet / Share CTA (3s)"],
    totalDuration: 23,
    exampleConcept: "POV: Your boss promotes the wrong person in front of everyone",
    bestFor: ["tiktok", "douyin"],
    viralPotential: 9.0,
    examplePrompt: "First-person POV looking down at hands shaking slightly, camera tilts up slowly to reveal tense office meeting room, colleagues faces showing shock and sympathy, shallow depth of field, fluorescent office lighting with dramatic shadows, handheld camera tremor adds realism"
  },
  {
    id: "product-reveal",
    name: "产品揭秘仪式",
    nameEn: "Cinematic Product Reveal",
    category: "product",
    description: "Build anticipation then deliver a satisfying product reveal. Luxury aesthetic that creates desire and aspiration.",
    hookType: "mystery",
    structure: ["Mystery Teaser (2s)", "Unbox Ritual (4s)", "Feature Hero Shots (8s)", "Real-World Use Demo (5s)", "Shop Now CTA (3s)"],
    totalDuration: 22,
    exampleConcept: "Limited edition sneaker drop unboxing",
    bestFor: ["douyin", "tiktok", "rednote"],
    viralPotential: 8.5,
    examplePrompt: "Ultra-macro close-up of matte black luxury box with embossed minimalist logo, gloved hands slowly lifting lid in dramatic studio spotlight, product emerges from tissue paper in slow motion, 360-degree turntable rotation with commercial product lighting, smoke effect on dark background"
  },
  {
    id: "food-asmr",
    name: "食物 ASMR 满足感",
    nameEn: "Food ASMR Satisfaction",
    category: "food",
    description: "Hyper-sensory food content that triggers ASMR responses. Close-up textures, sounds, and satisfying visual moments.",
    hookType: "action",
    structure: ["Irresistible Money Shot (3s)", "Preparation Close-ups (8s)", "Hero Reveal (4s)", "Recipe Tease (3s)", "Save & Follow CTA (3s)"],
    totalDuration: 21,
    exampleConcept: "Perfect crispy smash burger with sauce drip",
    bestFor: ["douyin", "tiktok", "rednote", "youtube_shorts"],
    viralPotential: 9.1,
    examplePrompt: "Extreme macro shot of golden crispy burger patty being smashed onto hot cast iron, steam rising in slow motion, melted cheese cascading over edges, special sauce dripping in viscous golden streams, warm professional food photography lighting with dark dramatic background, mouth-watering 4K clarity"
  },
  {
    id: "travel-reveal",
    name: "秘境揭秘",
    nameEn: "Hidden Gem Travel Reveal",
    category: "travel",
    description: "Build up 'you won't believe this place exists' energy. Stunning location reveals that make viewers want to book immediately.",
    hookType: "shock",
    structure: ["Epic Aerial Reveal (5s)", "Journey Atmosphere (8s)", "Hidden Gem Close-up (5s)", "Local Secret Moment (4s)", "Save This CTA (3s)"],
    totalDuration: 25,
    exampleConcept: "Secret turquoise lagoon only locals know about in Southeast Asia",
    bestFor: ["youtube_shorts", "rednote", "tiktok"],
    viralPotential: 8.7,
    examplePrompt: "Cinematic drone shot rising slowly from dense tropical jungle canopy to reveal pristine turquoise lagoon below surrounded by towering limestone cliffs, morning mist hovering on water surface, zero tourists visible, golden hour light painting everything amber and teal, National Geographic cinematic grade"
  },
  {
    id: "tutorial-speedrun",
    name: "15秒速成教程",
    nameEn: "15-Second Speed Tutorial",
    category: "education",
    description: "Show the end result first as the hook, then deliver the fastest possible tutorial. Every second earns its place.",
    hookType: "action",
    structure: ["End Result Hook (2s)", "Step 1 - Fast (3s)", "Step 2 - Fast (3s)", "Step 3 - Fast (3s)", "Final Result + CTA (4s)"],
    totalDuration: 15,
    exampleConcept: "Design a stunning logo in Figma in 15 seconds",
    bestFor: ["tiktok", "youtube_shorts", "bilibili"],
    viralPotential: 8.4,
    examplePrompt: "Fast-cut screen recording of design software, hands flying across keyboard creating professional logo design in real-time timelapse, clean minimal workspace with dual monitors, bright even RGB lighting, progress indicator shows each step completing rapidly"
  },
  {
    id: "aesthetic-vlog",
    name: "治愈系美学日常",
    nameEn: "Aesthetic Healing Vlog",
    category: "lifestyle",
    description: "Curated aesthetic moments from daily life. Mood-driven, sensory-rich content that people save and return to for comfort.",
    hookType: "emotion",
    structure: ["Golden Hour Opener (4s)", "Morning Ritual (5s)", "Productive Moment (4s)", "Evening Wind-down (4s)", "Peaceful CTA (3s)"],
    totalDuration: 20,
    exampleConcept: "Perfect productive Sunday morning routine",
    bestFor: ["rednote", "douyin", "tiktok"],
    viralPotential: 8.3,
    examplePrompt: "Ultra-slow-motion pour of specialty coffee into clear glass mug on white marble surface, steam rising in graceful spirals, sunlight streaming through sheer linen curtains creating god rays, hands wrap around warm glass, muted warm Kodak film color grade, shallow depth of field"
  },
  {
    id: "emotional-story",
    name: "情感共鸣短片",
    nameEn: "Emotional Resonance Minifilm",
    category: "entertainment",
    description: "Short emotional narrative arc that creates genuine feeling. Most shareable format — people tag others who will cry.",
    hookType: "emotion",
    structure: ["Emotional Hook (3s)", "Build-up Context (8s)", "Emotional Peak (5s)", "Heartwarming Resolution (4s)", "Share This CTA (3s)"],
    totalDuration: 23,
    exampleConcept: "Soldier surprises family at school graduation",
    bestFor: ["tiktok", "douyin", "youtube_shorts"],
    viralPotential: 9.4,
    examplePrompt: "Back view of uniformed soldier walking toward school auditorium doors in afternoon golden light, slow tracking shot from behind, doors open and hundreds of students gasp, child breaks from crowd and sprints across gym floor, medium shot of emotional embrace, camera orbits slowly to capture tears on both faces"
  },
  {
    id: "trending-sound",
    name: "热门音效配合",
    nameEn: "Trending Audio Sync",
    category: "entertainment",
    description: "Perfectly choreograph visuals to viral audio beats. When the drop hits, the visual payoff must be flawless.",
    hookType: "trend",
    structure: ["Beat Build (2s)", "Rising Action Sync (8s)", "Drop Payoff Hit (3s)", "Punchline Reveal (4s)", "Duet Invite CTA (3s)"],
    totalDuration: 20,
    exampleConcept: "Plot twist: the intern runs the company",
    bestFor: ["tiktok", "douyin"],
    viralPotential: 9.3,
    examplePrompt: "Confident figure in casual clothes strutting slowly down corporate office corridor in dramatic slow motion, suited executives turning heads as they pass, Dutch angle low shot looking up, corridor fluorescent lights create strong contrast silhouette, cinematic action movie treatment, then spinning 180 to reveal they're just an intern"
  },
  {
    id: "mystery-reveal",
    name: "悬念揭秘",
    nameEn: "Mystery & Reveal",
    category: "entertainment",
    description: "Build suspense layer by layer then deliver a surprising revelation. The reveal must genuinely surprise.",
    hookType: "mystery",
    structure: ["Mystery Setup (3s)", "Clue Drops (6s)", "Red Herring (4s)", "Big Reveal (4s)", "Mind-Blown Share CTA (3s)"],
    totalDuration: 20,
    exampleConcept: "The secret hidden in plain sight in every Pixar movie",
    bestFor: ["tiktok", "youtube_shorts", "bilibili"],
    viralPotential: 9.0,
    examplePrompt: "Cinematic studio reveal: dark spotlight illuminates familiar logo on rotating pedestal, slow orbital camera movement, graphic elements animate and shift revealing hidden pattern, zoom into negative space where secret symbol emerges clearly, dramatic light flash, reaction cut to wide eyes close-up"
  },
  {
    id: "beauty-transform",
    name: "美妆变装秀",
    nameEn: "Beauty Transformation",
    category: "beauty",
    description: "Satisfying makeup transformation with each step feeling intentional and artful. The final reveal is the payoff.",
    hookType: "shock",
    structure: ["No-makeup Hook (2s)", "Skincare Base (4s)", "Makeup Build Timelapse (8s)", "Final Look Reveal (4s)", "Product Details CTA (3s)"],
    totalDuration: 21,
    exampleConcept: "5-minute office to dinner glam transformation",
    bestFor: ["rednote", "douyin", "tiktok"],
    viralPotential: 8.9,
    examplePrompt: "Close-up bare face with natural lighting shifting to studio beauty lighting, soft brushes sweep across skin in artistic macro shots, eye transformation in extreme close-up with glitter particles catching light, final look reveal with model making direct eye contact with camera, film-quality beauty commercial lighting"
  },
  {
    id: "relatable-humor",
    name: "共鸣搞笑剧情",
    nameEn: "Relatable Comedy Skit",
    category: "entertainment",
    description: "Universally relatable situation played for laughs. The more specific and true-to-life, the more viral it becomes.",
    hookType: "action",
    structure: ["Relatable Setup (3s)", "Escalating Chaos (8s)", "Peak Absurdity (4s)", "Punchline (3s)", "Tag Someone CTA (3s)"],
    totalDuration: 21,
    exampleConcept: "When your plan to wake up early backfires spectacularly",
    bestFor: ["tiktok", "douyin", "youtube_shorts"],
    viralPotential: 9.1,
    examplePrompt: "Character confidently setting multiple phone alarms in bed with smug expression, then next shot: phone hurled across room, three alarms going off simultaneously, character buried under 17 blankets, morning light blazing through windows, chaotic handheld camera, comedy timing with facial expressions"
  },
  {
    id: "unboxing-ritual",
    name: "高仪式感开箱",
    nameEn: "Ritual Unboxing",
    category: "product",
    description: "Elevate the unboxing into a ritual experience. Premium packaging ASMR triggers purchasing desire in viewers.",
    hookType: "mystery",
    structure: ["Package Arrival Teaser (2s)", "Ritual Opening (5s)", "Layer-by-Layer Reveal (6s)", "First Use Moment (5s)", "Where to Get CTA (4s)"],
    totalDuration: 22,
    exampleConcept: "Luxury skincare brand's new limited collection",
    bestFor: ["rednote", "douyin", "tiktok"],
    viralPotential: 8.6,
    examplePrompt: "Macro shot of premium matte packaging arriving on marble surface, hands with perfect manicure unwrapping silk ribbon in real-time, tissue paper crinkle sound, product emerges in perfect studio lighting, slow rotation to show packaging detail, cream texture applied to skin in slow motion close-up"
  }
];

var filtered = TEMPLATES;
if (category && category !== "all") {
  filtered = TEMPLATES.filter(function(t) { return t.category === category; });
  if (filtered.length === 0) filtered = TEMPLATES; // fallback to all if category empty
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_studio_style_gallery",
      category: category,
      totalTemplates: filtered.length,
      categories: ["all", "education", "lifestyle", "entertainment", "food", "travel", "beauty", "product"],
      templates: filtered
    })
  }]
};

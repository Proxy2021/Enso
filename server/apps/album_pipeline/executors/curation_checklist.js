var action = (params.action || "view").trim();
var passNumber = params.passNumber || null;
var remainingCount = params.remainingCount || null;
var notes = (params.notes || "").trim();

// Load pipeline and curation state
var pipeline = ctx.store.get("pipeline");
var curation = ctx.store.get("curation_state") || {
  totalPhotos: 124626,
  candidateCount: 200,
  targetPhotos: 45,
  passes: [
    {
      number: 1,
      name: "Technical Quality",
      criteria: "Sharp, well-exposed, correct white balance — eliminate obvious failures",
      startCount: 200,
      remainingCount: null,
      completed: false,
      notes: "",
      estimatedTime: "2-3 hours",
      tips: [
        "View at 100% zoom — if it's not tack sharp where it matters, cut it",
        "Slightly underexposed is recoverable; blown highlights are not",
        "White balance errors are fixable in post — don't cut for WB alone unless severe",
        "Motion blur in the wrong place is always a cut",
        "Focus on the eyes for portraits — soft eyes = immediate cut",
        "Noise is acceptable if the moment is powerful enough"
      ],
      mistakes: [
        "Cutting too aggressively on technical grounds — a grainy, emotional shot beats a technically perfect boring one",
        "Judging sharpness from thumbnails — always zoom to 100%",
        "Keeping technically perfect but emotionally dead images",
        "Spending too long on each image — set a 5-second timer per photo"
      ]
    },
    {
      number: 2,
      name: "Emotional Impact",
      criteria: "Does this image make you feel something? Keep only photos with genuine emotional resonance",
      startCount: null,
      remainingCount: null,
      completed: false,
      notes: "",
      estimatedTime: "1-2 hours",
      tips: [
        "View each image full-screen for exactly 3 seconds",
        "If you don't feel joy, wonder, nostalgia, tension, or peace — cut it",
        "The 'gut check' is the most honest test of a photograph",
        "Show images to someone else — watch their face, not their words",
        "Strong emotional response in 3 seconds = album-worthy",
        "Some images grow on you — set aside 'maybes' and revisit tomorrow"
      ],
      mistakes: [
        "Keeping images for sentimental reasons that don't translate visually",
        "Confusing 'I remember this moment' with 'this is a good photograph'",
        "Second-guessing your gut — trust the immediate reaction",
        "Rushing this pass — emotional assessment needs a relaxed state"
      ]
    },
    {
      number: 3,
      name: "Story Fit",
      criteria: "Does this image advance the narrative? Every photo must earn its page in the album",
      startCount: null,
      remainingCount: null,
      completed: false,
      notes: "",
      estimatedTime: "1-2 hours",
      tips: [
        "Consider your chosen album theme — does this image belong in THAT story?",
        "Each image should either establish, develop, or resolve something",
        "Transitional images (connecting scenes) are as important as hero shots",
        "If you can't explain in one sentence why it belongs, cut it",
        "Think about the image before and after — does it create flow?",
        "A great photo that doesn't serve the story goes in a different album"
      ],
      mistakes: [
        "Keeping a stunning photo that doesn't fit the theme (save it for another album)",
        "Not considering the sequence — isolated great shots don't make great albums",
        "Having too many similar story beats (3 sunset openings, etc.)",
        "Forgetting to include establishing shots that provide context"
      ]
    },
    {
      number: 4,
      name: "Visual Variety",
      criteria: "Avoid repetition in subject, color, composition, and orientation — ensure visual diversity",
      startCount: null,
      remainingCount: null,
      completed: false,
      notes: "",
      estimatedTime: "1 hour",
      tips: [
        "Lay out all remaining images as thumbnails and look for repetition",
        "Check balance: wide vs tight, horizontal vs vertical, warm vs cool",
        "Variety in composition: rule of thirds, centered, leading lines, frames within frames",
        "Mix subjects: people, places, details, nature, architecture",
        "Alternate color palettes across the sequence",
        "Include at least one black & white candidate if it fits the theme"
      ],
      mistakes: [
        "Five golden sunset shots when one would be more powerful",
        "All tight crops or all wide shots — you need both for rhythm",
        "Color monotony — an album of all warm tones is visually fatiguing",
        "Forgetting detail shots — they provide visual 'breathing room' between hero images"
      ]
    },
    {
      number: 5,
      name: "Flow & Rhythm",
      criteria: "Do adjacent images create visual rhythm? Test the complete sequence for pacing and transitions",
      startCount: null,
      remainingCount: null,
      completed: false,
      notes: "",
      estimatedTime: "1 hour",
      tips: [
        "Arrange your final set in sequence and view as a rapid slideshow (2 sec/image)",
        "Look for jarring transitions — color clashes, scale jumps, tonal whiplash",
        "The sequence should feel like breathing: tension → release → tension → release",
        "Pair images that share a visual element (color, shape, line) for smooth transitions",
        "Place your strongest images at natural 'chapter' openings and closings",
        "The first and last images are the most important — choose them last"
      ],
      mistakes: [
        "Two competing 'loud' images back-to-back — insert a quiet image between them",
        "All the best images front-loaded — distribute strength evenly",
        "No visual breathing room — every album needs quieter moments",
        "Ignoring left-right page pairing — facing pages are viewed simultaneously"
      ]
    }
  ]
};

// Handle update_pass
if (action === "update_pass" && passNumber >= 1 && passNumber <= 5) {
  var passIdx = passNumber - 1;
  var pass = curation.passes[passIdx];

  if (remainingCount !== null) {
    pass.remainingCount = remainingCount;
    pass.completed = true;

    // Update next pass's start count
    if (passIdx < 4) {
      curation.passes[passIdx + 1].startCount = remainingCount;
    }
  }

  if (notes) {
    pass.notes = notes;
  }

  ctx.store.set("curation_state", curation);

  // Update pipeline photo count if this is the last completed pass
  if (pipeline && pass.completed) {
    pipeline.photosSelected = pass.remainingCount;
    ctx.store.set("pipeline", pipeline);
  }
}

// Calculate overall progress
var completedPasses = 0;
var lastRemaining = curation.candidateCount;
for (var i = 0; i < curation.passes.length; i++) {
  if (curation.passes[i].completed) {
    completedPasses++;
    lastRemaining = curation.passes[i].remainingCount;
  }
}
var overallProgress = Math.round((completedPasses / 5) * 100);

// Calculate reduction stats
var totalCulled = curation.candidateCount - (lastRemaining || curation.candidateCount);
var cullPercentage = curation.candidateCount > 0 ? Math.round((totalCulled / curation.candidateCount) * 100) : 0;

// For tips view, return detailed tips for specific pass
var focusPass = null;
if (action === "tips" && passNumber >= 1 && passNumber <= 5) {
  focusPass = curation.passes[passNumber - 1];
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_pipeline_curation_checklist",
      curation: {
        totalPhotos: curation.totalPhotos,
        candidateCount: curation.candidateCount,
        targetPhotos: curation.targetPhotos,
        currentCount: lastRemaining,
        totalCulled: totalCulled,
        cullPercentage: cullPercentage,
        passes: curation.passes,
        completedPasses: completedPasses,
        overallProgress: overallProgress,
        focusPass: focusPass
      }
    })
  }]
};
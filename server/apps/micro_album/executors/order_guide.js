// Micro Album Order Guide — Step-by-step Printique ordering
// Pre-filled specifications, direct links, 5-minute process

var albumState = await ctx.store.get("albumState");

if (!albumState || !albumState.candidates) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_order_guide",
        error: "No album in progress. Launch and curate an album first!",
        suggestion: "Use the Launch tool to get started."
      })
    }]
  };
}

var kept = albumState.kept || [];
var candidates = albumState.candidates || [];

if (kept.length < 1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_order_guide",
        error: "No photos selected yet. Complete curation first!",
        status: "needs_curation"
      })
    }]
  };
}

// Gather kept photo paths for the export checklist
var keptPhotos = [];
for (var i = 0; i < kept.length; i++) {
  if (kept[i] < candidates.length) {
    keptPhotos.push(candidates[kept[i]]);
  }
}

var pageCount = 2 + (keptPhotos.length * 2);

// Build step-by-step ordering guide
var steps = [
  {
    step: 1,
    title: "Prepare Your Photos",
    description: "Gather your " + keptPhotos.length + " selected photos into one folder for easy upload.",
    details: [
      "Create a new folder called 'Album Photos' on your desktop",
      "Copy these " + keptPhotos.length + " photos into it (paths listed below)",
      "Verify each photo opens correctly"
    ],
    timeEstimate: "2 minutes",
    photoPaths: keptPhotos.map(function(p) { return p.path; })
  },
  {
    step: 2,
    title: "Go to Printique",
    description: "Visit Printique's photo book builder.",
    details: [
      "Go to printique.com",
      "Click 'Photo Books' in the top navigation",
      "Select 'Lay-Flat Photo Books' for the best full-bleed results"
    ],
    timeEstimate: "30 seconds",
    link: "https://www.printique.com/photo-books"
  },
  {
    step: 3,
    title: "Select Product Specifications",
    description: "Choose these exact settings — all pre-decided for you.",
    details: [
      "Size: 10×10 inches (Square)",
      "Cover: Hardcover with Lustre lamination",
      "Paper: Lustre (beautiful semi-gloss, fingerprint-resistant)",
      "Pages: " + pageCount + " pages (for " + keptPhotos.length + " full-spread photos)",
      "Binding: Lay-flat (crucial for full-bleed spreads across the gutter)"
    ],
    timeEstimate: "1 minute",
    specs: {
      size: "10x10 inches",
      cover: "Hardcover Lustre",
      paper: "Lustre",
      pages: pageCount,
      binding: "Lay-flat"
    }
  },
  {
    step: 4,
    title: "Upload & Arrange Photos",
    description: "Upload your photos and place one per spread.",
    details: [
      "Click 'Upload Photos' and select all " + keptPhotos.length + " photos from your Album Photos folder",
      "For each spread: drag a photo to fill the entire two-page area",
      "Use 'Fit to Fill' or 'Full Bleed' option for edge-to-edge coverage",
      "Order the spreads chronologically (they're listed below in order)",
      "Set the cover photo to your highest-rated shot"
    ],
    timeEstimate: "3 minutes",
    photoOrder: keptPhotos.map(function(p, idx) {
      return {
        spreadNumber: idx + 1,
        name: p.name,
        description: p.description
      };
    })
  },
  {
    step: 5,
    title: "Review & Order",
    description: "Final check before placing your order.",
    details: [
      "Use the Preview mode to flip through your book",
      "Check that all photos fill their spreads completely",
      "Verify the cover photo looks sharp",
      "Add to cart and checkout",
      "Estimated cost: $45–65 (shipping extra)"
    ],
    timeEstimate: "1 minute"
  }
];

// Pro tips
var tips = [
  "Lustre paper is the best all-rounder: rich colors, no glare, hides fingerprints",
  "Lay-flat binding is essential — it lets your photos cross the gutter without distortion",
  "10×10 is the sweet spot: large enough to appreciate details, compact enough to gift",
  "If a photo looks slightly soft in preview, it will likely look fine in print — screens are higher DPI than most books",
  "Order one copy first as a proof before gifting"
];

// Update state
albumState.status = "ordering";
await ctx.store.set("albumState", albumState);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_micro_album_order_guide",
      status: "guide_ready",
      steps: steps,
      specs: {
        product: "Lay-Flat Photo Book",
        size: "10x10 inches",
        pages: pageCount,
        cover: "Hardcover Lustre",
        paper: "Lustre",
        binding: "Lay-flat",
        costEstimate: "$45–65"
      },
      tips: tips,
      totalTime: "About 5 minutes",
      photoCount: keptPhotos.length
    })
  }]
};

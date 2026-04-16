var action = (params.action || "view").trim();
var dayParam = params.day || null;
var notes = (params.notes || "").trim();

// Load pipeline
var pipeline = ctx.store.get("pipeline");
if (!pipeline) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_pipeline_daily_task",
        task: null,
        message: "No pipeline started. Open the dashboard and start your 60-day journey first."
      })
    }]
  };
}

// Calculate current day
var today = new Date();
var start = new Date(pipeline.startDate);
var diffMs = today.getTime() - start.getTime();
var currentDay = Math.max(1, Math.min(60, Math.floor(diffMs / 86400000) + 1));
var targetDay = dayParam || currentDay;

// Task definitions for all 60 days
var TASK_MAP = {
  // Phase 1: Curation (Days 1-15)
  1: { title: "Browse & Flag 40 Candidates (Batch 1)", description: "Open your photo library and begin flagging candidates. Browse by date or album, looking for images with strong visual impact. Don't overthink — flag generously. Target: 40 images today.", tips: ["Start with your most recent trips — memories are freshest", "Use star ratings or color labels to flag", "Set a timer for 90 minutes to stay focused", "Flag anything that catches your eye — you'll refine later"], target: 40, phase: "curation" },
  2: { title: "Browse & Flag 40 Candidates (Batch 2)", description: "Continue browsing and flagging. Explore a different time period or album than yesterday. Keep the momentum going.", tips: ["Try browsing by location or camera if your library supports it", "Look for variety in subject matter", "Don't agonize over each photo — 5 seconds per decision max", "Take a break every 30 minutes to rest your eyes"], target: 40, phase: "curation" },
  3: { title: "Browse & Flag 40 Candidates (Batch 3)", description: "Third batch of flagging. You should start seeing patterns in what attracts you. Pay attention to the recurring themes.", tips: ["Notice which scenes keep drawing your attention — that's your style speaking", "Include some intimate/detail shots alongside wide shots", "Look at photos you've never shared — hidden gems live there", "Flag at least 5 photos that surprise you"], target: 40, phase: "curation" },
  4: { title: "Browse & Flag 40 Candidates (Batch 4)", description: "Fourth batch. Branch into albums or folders you haven't checked yet. Your best photos might be hiding in unexpected places.", tips: ["Check older archives — your earlier work may have raw authenticity", "Look for environmental portraits and candid moments", "Consider seasonal variety for visual interest", "Don't skip phone photos — sometimes they capture the best moments"], target: 40, phase: "curation" },
  5: { title: "Browse & Flag 40 Candidates (Batch 5)", description: "Final flagging batch. You should now have ~200 flagged candidates. Do a quick scan for any obvious gaps in your collection.", tips: ["Review what you've flagged so far for gaps in variety", "Add a few 'wildcard' picks that break the pattern", "You should have approximately 200 flagged photos now", "If under 180, spend extra time browsing today"], target: 40, phase: "curation" },
  6: { title: "First Cut — Emotional Resonance Test (Batch 1)", description: "Begin the first cut: review your 200 candidates and keep only those that evoke a genuine emotional response. View each image full-screen for 3 seconds. If you don't feel something, it's out. Target: cut 20 today.", tips: ["View images full-screen, not as thumbnails", "Trust your gut — 3 seconds is enough", "Ask: 'Would I stop scrolling for this?'", "Keep images that make you feel joy, wonder, nostalgia, or peace"], target: 20, phase: "curation" },
  7: { title: "First Cut — Emotional Resonance Test (Batch 2)", description: "Continue the emotional resonance test. Be more ruthless today. Every image must earn its place.", tips: ["Compare similar shots and keep only the strongest", "If two photos tell the same story, keep the more powerful one", "Consider how the image would look printed at 12x12", "Pay attention to color and tonal harmony"], target: 20, phase: "curation" },
  8: { title: "First Cut — Emotional Resonance Test (Batch 3)", description: "Third day of cutting. You should have roughly 150 images now. Keep going — the album only has room for 40-50.", tips: ["Revisit borderline images with fresh eyes", "Group similar images and force-rank them", "Think about the story each image tells", "Remove duplicates and near-duplicates ruthlessly"], target: 20, phase: "curation" },
  9: { title: "First Cut — Emotional Resonance Test (Batch 4)", description: "Fourth day of cutting. Push toward ~120 remaining. The quality bar should be rising with each pass.", tips: ["Sleep on difficult decisions — come back tomorrow", "If you can't immediately explain why a photo belongs, cut it", "Keep a 'maybe' pile of no more than 10", "Consider how prints will differ from screen viewing"], target: 20, phase: "curation" },
  10: { title: "First Cut — Emotional Resonance Test (Batch 5)", description: "Final emotional cut. Aim for approximately 100 remaining photos. Every survivor should make you feel something real.", tips: ["Do a final sweep through all remaining images", "Your 100 should include no 'filler' — only images with genuine impact", "Count what you have — if over 110, make harder choices", "If under 90, revisit your original 200 for missed gems"], target: 20, phase: "curation" },
  11: { title: "Final Cut — The Album Set (Day 1)", description: "Begin the hardest part: cutting from 100 to 40-50. Today, divide your 100 photos into 'definitely in' (A), 'probably' (B), and 'on the fence' (C) tiers.", tips: ["Create three folders or use a three-tier rating system", "Your A-tier should be 20-25 unquestionable picks", "B-tier: strong images that might make the cut (15-20)", "C-tier: everything else — these are your 'in case' reserves"], target: 0, phase: "curation" },
  12: { title: "Final Cut — The Album Set (Day 2)", description: "Refine your tiers. Move images between A, B, C based on how they work together as a collection, not just individually.", tips: ["Lay out your A-tier images as a grid — do they work as a set?", "Look for holes in the story and promote B-tier images to fill them", "Check for color palette coherence across the set", "Every image should serve the album's theme"], target: 0, phase: "curation" },
  13: { title: "Final Cut — The Album Set (Day 3)", description: "Finalize your 40-50 image album set. Merge A and top B-tier picks. This is your definitive collection.", tips: ["Print contact sheets if possible — paper reveals different qualities", "Show your top picks to a trusted friend for a fresh perspective", "Count your final set — aim for 40-50 images exactly", "Save your C-tier separately — you may swap later during layout"], target: 0, phase: "curation" },
  14: { title: "Export Album Candidates", description: "Export your final 40-50 selected images as high-resolution files. Use the Printique export settings (sRGB, 300dpi, max quality JPEG or TIFF).", tips: ["Export at full resolution — your Sony A7R V files are 61MP, plenty of detail", "Use sRGB color space for print consistency", "Apply minimal sharpening — Printique handles output sharpening", "Name files sequentially for easy ordering later"], target: 0, phase: "curation" },
  15: { title: "Curation Review & Milestone", description: "Review your complete album set. Celebrate this milestone! You've narrowed 124K photos to your best ~45. Take a moment to appreciate your curated collection.", tips: ["View all selected images in a slideshow — does the flow feel natural?", "Note any last-minute swaps you want to make", "Back up your selections to a separate folder", "Write down your gut feeling about the collection — save it for later"], target: 0, phase: "curation" },

  // Phase 2: Sequencing (Days 16-30)
  16: { title: "Define Album Chapters", description: "Organize your 40-50 photos into 3-5 chapters or story arcs. Each chapter should have a clear beginning, middle, and emotional peak.", tips: ["Common chapter structures: chronological, thematic, emotional journey", "Name each chapter with a working title", "Aim for 8-12 images per chapter", "Leave room for text/chapter break pages"], target: 0, phase: "sequencing" },
  17: { title: "Arrange Chapter 1", description: "Sequence the images in your first chapter. Consider visual rhythm: alternate between wide and tight shots, warm and cool tones.", tips: ["Start with a strong opening image — this sets the tone", "Alternate between establishing shots and detail/intimate shots", "Consider left-page vs right-page visual weight", "End the chapter with an image that bridges to the next"], target: 0, phase: "sequencing" },
  18: { title: "Arrange Chapter 2", description: "Sequence your second chapter. Consider how the transition from Chapter 1 feels — the closing and opening images should create a rhythm.", tips: ["The first image should contrast with or build upon Chapter 1's ending", "Vary the pacing — don't put all your strongest images in one chapter", "Leave visual 'breathing room' with a quieter image mid-chapter", "Check that colors don't clash across facing pages"], target: 0, phase: "sequencing" },
  19: { title: "Arrange Chapter 3", description: "Sequence your third chapter. This is often the emotional peak of the album if using a narrative arc.", tips: ["If this is your climax chapter, put your 3-5 strongest images here", "Build emotional intensity through the sequence", "Consider a dramatic full-bleed spread for the peak moment", "Think about what makes this chapter different from the others"], target: 0, phase: "sequencing" },
  20: { title: "Arrange Remaining Chapters", description: "Sequence any remaining chapters (4-5). End the album with a resolution — a sense of completion and reflection.", tips: ["The final chapter should feel like a gentle exhale", "Your very last image is as important as your first", "Consider ending with a contemplative or hopeful image", "The resolution chapter can be shorter — 5-8 images works well"], target: 0, phase: "sequencing" },
  21: { title: "Page Flow & Pacing Plan", description: "Map out the full page-by-page flow. Decide which images get full-bleed hero treatment (1-2 per chapter) vs. paired layouts vs. smaller grids.", tips: ["Plan 2-3 full-bleed spreads for your very best shots", "Mix layout types to keep visual interest high", "Include 1-2 text pages for chapter titles or brief narratives", "Count total pages: 25 spreads = 50 pages — that's your target"], target: 0, phase: "sequencing" },
  22: { title: "Refine Page Pairings", description: "Fine-tune which images appear on facing pages (left-right pairs). Facing pages should complement each other in color, tone, and subject.", tips: ["Facing pages are seen simultaneously — they must harmonize", "Avoid two competing 'loud' images facing each other", "Pair a strong hero image with a quieter supporting image", "Consider leading lines that flow across the spread"], target: 0, phase: "sequencing" },
  23: { title: "Identify Text & Caption Pages", description: "Decide which pages will include text — chapter titles, brief captions, location names, dates, or short narratives.", tips: ["Less text is more in a photo album — let images speak", "A brief one-line caption can add powerful context", "Use text pages as visual pauses between intense sections", "Consider a dedication page at the beginning or end"], target: 0, phase: "sequencing" },
  24: { title: "Write Opening Text", description: "Write the album's opening text — dedication, introduction, or a brief personal note that sets the context for the viewer.", tips: ["Keep it personal and honest — this is a gift", "2-3 sentences max for the introduction", "Mention the theme or time period covered", "A meaningful quote can work well as an epigraph"], target: 0, phase: "sequencing" },
  25: { title: "Write Chapter Titles & Captions", description: "Write any remaining text: chapter titles, image captions, location notes. Keep everything concise.", tips: ["Chapter titles should evoke feeling, not just describe", "Captions: one line max — a place, a date, or a feeling", "Consistent voice throughout — don't switch between formal and casual", "Read everything aloud to check the rhythm"], target: 0, phase: "sequencing" },
  26: { title: "Create Sequence Storyboard", description: "Create a simple thumbnail storyboard of your entire album sequence. This can be on paper or digital — just see the full flow at once.", tips: ["Print tiny thumbnails and tape them in order", "Or use a grid view in Lightroom/Bridge", "Stand back and look at the overall visual rhythm", "This bird's-eye view reveals problems you can't see page-by-page"], target: 0, phase: "sequencing" },
  27: { title: "Test the Opening Sequence", description: "Focus on the first 5 spreads (10 pages). The opening must hook the viewer. Does it draw someone in?", tips: ["Show the opening to someone who hasn't seen it — watch their reaction", "The cover image and first spread set ALL expectations", "Avoid starting with your absolute best shot — build anticipation", "The opening should establish mood, place, and promise"], target: 0, phase: "sequencing" },
  28: { title: "Test the Closing Sequence", description: "Focus on the last 5 spreads. The ending creates the lasting impression. Does it resolve the story satisfyingly?", tips: ["The last image should linger in the viewer's mind", "Avoid ending on a 'loud' image — end with quiet power", "Consider a callback to an earlier motif for closure", "The back cover image matters too — pick something timeless"], target: 0, phase: "sequencing" },
  29: { title: "Final Sequence Refinement", description: "Make any last swaps, reorders, or substitutions. You may want to swap 1-3 images from your reserve (C-tier) if gaps appeared.", tips: ["This is your last chance for major changes — be decisive", "If something has been bothering you, fix it now", "Trust the sequence if it feels right, even if you can't explain why", "Save a snapshot of this final order — you'll need it for layout"], target: 0, phase: "sequencing" },
  30: { title: "Sequencing Review & Milestone", description: "Your album is fully sequenced! Review the complete order one final time. Celebrate — the creative vision is set.", tips: ["Do a final slideshow with your sequence", "Note the total page count for Printique ordering", "Make a backup of your sequence document/list", "You're halfway there — the hard creative work is done!"], target: 0, phase: "sequencing" },

  // Phase 3: Layout & Design (Days 31-45)
  31: { title: "Set Up Printique Account", description: "Create your Printique account if you haven't already. Browse their layflat album templates and familiarize yourself with the editor.", tips: ["Visit printique.com and explore Layflat Photo Albums", "Select 12x12 size, Silk paper, Linen cover as your starting point", "Browse template options — note which layouts match your storyboard", "Check current pricing and any promotions"], target: 0, phase: "layout" },
  32: { title: "Upload Photos to Printique", description: "Upload your final album set (40-50 images) to Printique's editor. Organize them in your predetermined sequence.", tips: ["Upload full-resolution sRGB JPEGs or TIFFs", "Verify each upload maintained quality — check for compression artifacts", "Organize images in your sequence order", "Upload 5-10 extra reserve images in case you need swaps"], target: 0, phase: "layout" },
  33: { title: "Design Spreads 1-5 (Opening)", description: "Begin laying out your opening sequence. Use your storyboard as a guide. The opening should feel inviting and set the mood.", tips: ["Spread 1: Consider a single powerful hero image, full-bleed", "Add your dedication or intro text on page 2-3", "Match spread layouts to your storyboard plan", "Leave generous margins — don't crowd the edges of prints"], target: 0, phase: "layout" },
  34: { title: "Design Spreads 6-10", description: "Continue layout design. Build into Chapter 1's rhythm. Vary layouts to keep visual interest.", tips: ["Alternate between single hero shots and multi-image layouts", "Use white space intentionally — it's not wasted space", "Check image cropping carefully — print crops differently than screen", "Zoom to 100% to verify sharpness in the layout"], target: 0, phase: "layout" },
  35: { title: "Design Spreads 11-15", description: "Layout the middle section. This should include your emotional climax or the strongest chapter.", tips: ["Give your best 2-3 images full-bleed hero treatment", "The center spread is physically the spine — use a strong horizontal image", "Maintain consistent margins throughout", "Preview each spread in Printique's proof view"], target: 0, phase: "layout" },
  36: { title: "Design Spreads 16-20", description: "Continue into the resolution chapters. The energy should be winding down from the climax.", tips: ["Smaller, quieter layouts work well for resolution sections", "Include any remaining text or captions", "Check that facing pages still harmonize in the layout", "Verify no images are repeated or accidentally duplicated"], target: 0, phase: "layout" },
  37: { title: "Design Spreads 21-25 (Closing)", description: "Layout the final spreads and closing sequence. End with impact. Include the back cover design.", tips: ["The last spread is the final impression — make it count", "Consider a text-only closing page with a brief reflection", "Design the back cover (simple works best)", "Your very last image should be your most timeless selection"], target: 0, phase: "layout" },
  38: { title: "Full Layout Review Pass 1", description: "Review the entire album layout from start to finish. Check for visual consistency, pacing, and overall flow.", tips: ["View the entire album in thumbnail mode for bird's-eye perspective", "Check color consistency across spreads", "Verify text is readable and properly positioned", "Look for awkward image crops or bleeding issues"], target: 0, phase: "layout" },
  39: { title: "Typography & Text Refinement", description: "Review all text elements: dedication, chapter titles, captions. Check font choice, size, placement, and readability.", tips: ["Use no more than 2 fonts throughout the album", "Ensure text color has sufficient contrast against backgrounds", "Keep text away from the gutter (center binding area)", "Proofread everything — typos in print are permanent"], target: 0, phase: "layout" },
  40: { title: "Image Quality Verification", description: "Check every image at 100% zoom for sharpness, noise, and color accuracy in the layout context.", tips: ["Zoom to 100% on every image in the layout", "Check for noise in shadow areas (especially evening shots)", "Verify colors look consistent across the album", "Printique shows a resolution warning if images are too small for the layout"], target: 0, phase: "layout" },
  41: { title: "Get External Feedback", description: "Share your layout with 1-2 trusted friends or family. Ask specific questions about flow, pacing, and emotional impact.", tips: ["Share a PDF proof or screen recording walkthrough", "Ask: 'Which images stuck with you?' and 'Where did your attention wander?'", "Listen more than you defend — fresh eyes catch things you can't", "Take notes but don't make changes yet — sleep on feedback"], target: 0, phase: "layout" },
  42: { title: "Incorporate Feedback", description: "Review the feedback you received and make thoughtful adjustments. Not all feedback needs to be applied — use your judgment.", tips: ["Fix any issues multiple people flagged — they're real problems", "Ignore contradictory feedback unless one aligns with your gut", "Small adjustments compound — don't overhaul the design", "Make changes, then walk away for a few hours before reviewing again"], target: 0, phase: "layout" },
  43: { title: "Final Layout Polish", description: "Make any final micro-adjustments: alignment, spacing, cropping fine-tuning. This is about polish, not restructuring.", tips: ["Align margins consistently across all spreads", "Fine-tune image cropping for optimal composition at print size", "Check the cover design one more time", "Save/export a final proof PDF for your records"], target: 0, phase: "layout" },
  44: { title: "Pre-Order Proof Review", description: "Use Printique's preview/proof feature to see a final digital mockup. This is your last look before ordering.", tips: ["Use Printique's 3D preview if available", "Check every single page one more time", "Verify the cover text and spine are correct", "Confirm paper choice (Silk) and cover material (Linen)"], target: 0, phase: "layout" },
  45: { title: "Layout Complete & Milestone", description: "Your album design is finalized! Take a moment to appreciate the complete work. The creative phase is done.", tips: ["Save a screenshot of the final layout for reference", "Save all your source files and exports", "Write down the exact specifications you're ordering", "You've completed the hardest part — only ordering remains!"], target: 0, phase: "layout" },

  // Phase 4: Order & Print (Days 46-60)
  46: { title: "Review Printique Specs & Pricing", description: "Confirm your order specifications: 12x12 Layflat, Silk paper, Linen cover, 25 spreads. Review current pricing and any promotions.", tips: ["Check for coupon codes — Printique frequently runs 20-40% off", "Sign up for email notifications for flash sales", "Consider ordering 2 copies if giving as a gift (one for yourself)", "Verify shipping time to plan your delivery date"], target: 0, phase: "print" },
  47: { title: "Final Pre-Order Checklist", description: "Run through the complete pre-order checklist: resolution verified, colors correct, text proofread, layout approved, specs confirmed.", tips: ["Use the Print Checklist tool to track each item", "Double-check the recipient's address for shipping", "Confirm you're happy with the cover design", "Make sure all images are properly positioned within safe zones"], target: 0, phase: "print" },
  48: { title: "Place Your Order", description: "This is the day! Place your Printique layflat album order. Choose your size, paper, cover, and shipping options.", tips: ["Select expedited shipping if you have a deadline", "Save your order confirmation number", "Take a screenshot of the order summary", "Congratulations — you've committed to your first album!"], target: 0, phase: "print" },
  49: { title: "Order Confirmation & Tracking", description: "Check your order confirmation email. Set up tracking notifications. Note estimated delivery date.", tips: ["Printique typically ships within 5-10 business days", "Set up delivery notifications to be home for the package", "Production time varies — don't panic if it's not immediate", "Use this time to plan how you'll present the gift"], target: 0, phase: "print" },
  50: { title: "Plan Gift Presentation", description: "If this album is a gift, plan the presentation. Consider wrapping, timing, and the moment of giving.", tips: ["A photo album is best given in person — plan the moment", "Simple wrapping works — kraft paper, twine, a personal note", "Consider the setting — somewhere quiet where they can really look through it", "Write a brief handwritten note to go with the album"], target: 0, phase: "print" },
  51: { title: "Production Buffer Day 1", description: "The album is in production. Use today to reflect on the process and start planning your next album.", tips: ["Write down what you learned during this process", "Note what you'd do differently next time", "Browse your remaining photos for future album ideas", "The second album is always easier — you know the process now"], target: 0, phase: "print" },
  52: { title: "Production Buffer Day 2", description: "Continue waiting for production. Consider exploring master photographers' album work for future inspiration.", tips: ["Study published photo books by McCurry, Fan Ho, or Yamashita", "Notice how professionals sequence and pace their albums", "Visit a bookstore and look at high-end photo books", "Save ideas for your next album project"], target: 0, phase: "print" },
  53: { title: "Production Buffer Day 3", description: "Check production/shipping status. Start a wish list of locations or themes for your next album.", tips: ["Track your order status via Printique's dashboard", "Begin a 'Next Album Ideas' list", "Consider a travel-specific album for your next trip", "Research other premium printers for comparison (WhiteWall, Saal Digital)"], target: 0, phase: "print" },
  54: { title: "Shipping Watch Day 1", description: "Your album should be shipping soon. Track the package and plan to be available for delivery.", tips: ["Check tracking daily", "Printique ships via FedEx or UPS typically", "Have a clean, well-lit space ready for your first review", "Clean your hands before handling the album — oils transfer to covers"], target: 0, phase: "print" },
  55: { title: "Shipping Watch Day 2", description: "Continue tracking. If delivered, resist the urge to give it away immediately — review the quality first.", tips: ["Inspect the album carefully upon arrival", "Check for printing defects, color accuracy, binding quality", "Printique has a satisfaction guarantee — report any issues within 30 days", "Compare printed colors to your screen — some variation is normal"], target: 0, phase: "print" },
  56: { title: "Quality Inspection", description: "Carefully review your printed album. Check every page for print quality, color accuracy, sharpness, and binding.", tips: ["View under neutral daylight for accurate color assessment", "Check the lay-flat binding — pages should open completely flat", "Look for banding, posterization, or color shifts", "Verify text readability and position"], target: 0, phase: "print" },
  57: { title: "Final Touch-Ups (if needed)", description: "If you found any issues, contact Printique customer service. If perfect, prepare for gifting.", tips: ["Printique reprints defective albums at no charge", "Document any issues with photos for your claim", "If everything looks great, move to gift preparation", "Consider adding a bookmark ribbon or slip-in note card"], target: 0, phase: "print" },
  58: { title: "Gift Preparation", description: "Prepare the album for gifting. Wrap it, write your note, and plan the moment.", tips: ["Handle the album with clean hands", "A simple, elegant wrap respects the album inside", "Include a handwritten card explaining why you made it", "The best gifts are given with presence, not just wrapping"], target: 0, phase: "print" },
  59: { title: "Give the Gift", description: "Present your album to its recipient. Watch them flip through it. This is the payoff for 59 days of work.", tips: ["Be present and watch their reaction — it's the best part", "Don't explain every photo — let the images speak", "Take a photo of them with the album if appropriate", "Savor this moment — you created something beautiful from scratch"], target: 0, phase: "print" },
  60: { title: "Celebrate & Reflect", description: "You did it! Your first gift-quality photo album is complete and delivered. Take a moment to celebrate and plan what's next.", tips: ["Write down your reflections on the 60-day journey", "Rate the experience: what worked, what was hard, what surprised you", "Set a goal for your next album — you now know the process", "Consider entering a photo book contest or sharing on photography forums"], target: 0, phase: "print" }
};

// Handle complete action
if (action === "complete" && pipeline) {
  var doneDay = dayParam || currentDay;
  var completedList = pipeline.completedTasks || [];
  if (completedList.indexOf(doneDay) === -1) {
    completedList.push(doneDay);
    pipeline.completedTasks = completedList;
  }
  if (notes) {
    var dailyNotes = pipeline.dailyNotes || {};
    dailyNotes["day_" + doneDay] = notes;
    pipeline.dailyNotes = dailyNotes;
  }
  ctx.store.set("pipeline", pipeline);
}

// Handle skip action
if (action === "skip" && pipeline) {
  var skipDay = dayParam || currentDay;
  var skippedList = pipeline.skippedTasks || [];
  if (skippedList.indexOf(skipDay) === -1) {
    skippedList.push(skipDay);
    pipeline.skippedTasks = skippedList;
  }
  ctx.store.set("pipeline", pipeline);
}

// Get the task for target day
var taskDef = TASK_MAP[targetDay] || {
  title: "Day " + targetDay,
  description: "Continue working on your album.",
  tips: ["Stay consistent — daily progress beats sporadic effort"],
  target: 0,
  phase: "print"
};

// Determine phase name
var phaseNames = { curation: "Curation", sequencing: "Sequencing", layout: "Layout & Design", print: "Order & Print" };
var phaseName = phaseNames[taskDef.phase] || "Unknown";

// Check if completed
var isCompleted = (pipeline.completedTasks || []).indexOf(targetDay) !== -1;
var isSkipped = (pipeline.skippedTasks || []).indexOf(targetDay) !== -1;

// Day in phase
var phaseRanges = { curation: [1, 15], sequencing: [16, 30], layout: [31, 45], print: [46, 60] };
var range = phaseRanges[taskDef.phase] || [1, 15];
var dayInPhase = targetDay - range[0] + 1;
var totalPhaseDays = range[1] - range[0] + 1;

// Previous and next days
var prevDay = targetDay > 1 ? targetDay - 1 : null;
var nextDay = targetDay < 60 ? targetDay + 1 : null;
var prevNotes = (pipeline.dailyNotes || {})["day_" + targetDay] || null;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_pipeline_daily_task",
      task: {
        day: targetDay,
        phase: taskDef.phase,
        phaseName: phaseName,
        title: taskDef.title,
        description: taskDef.description,
        tips: taskDef.tips,
        targetCount: taskDef.target,
        isCompleted: isCompleted,
        isSkipped: isSkipped,
        dayInPhase: dayInPhase,
        totalPhaseDays: totalPhaseDays,
        notes: prevNotes
      },
      pipelineDay: currentDay,
      targetDay: targetDay,
      totalDays: 60,
      prevDay: prevDay,
      nextDay: nextDay
    })
  }]
};
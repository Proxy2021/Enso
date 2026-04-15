var theme = (params.theme || "").trim() || "one_trip_one_story";
var startDate = (params.startDate || "").trim();

var now = new Date();
if (!startDate) {
  startDate = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

var startTs = new Date(startDate).getTime();
if (isNaN(startTs)) {
  startTs = now.getTime();
  startDate = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

var addDays = function(base, days) {
  var d = new Date(base + days * 86400000);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

var phases = [
  {
    name: "Choose & Gather",
    icon: "search",
    days: "1-3",
    color: "blue",
    milestone: "Theme selected, 500 candidate photos exported",
    tasks: [
      { day: 1, task: "Choose your album theme (use the Choose Theme tool)", time: "30 min", energy: "high", tip: "Pick the theme that excites you most — motivation beats optimization for a first album" },
      { day: 2, task: "Browse your photo library and flag 500+ candidates for the chosen theme", time: "60-90 min", energy: "medium", tip: "Be generous now — cast a wide net. You'll have 4 passes to narrow down later" },
      { day: 3, task: "Export candidates to a dedicated album/folder. Set up your workspace.", time: "45 min", energy: "low", tip: "Create a folder structure: /Album_v1/01_Candidates/ /02_Shortlist/ /03_Final/" }
    ]
  },
  {
    name: "Technical Curation",
    icon: "x-circle",
    days: "4-7",
    color: "red",
    milestone: "500 → 150 photos (Passes 1 & 2 complete)",
    tasks: [
      { day: 4, task: "Pass 1 — Technical Kill: First 150 photos (reject soft/blown/unusable)", time: "40 min", energy: "high", tip: "Speed is key — 2-3 seconds per photo. Trust your gut. If you hesitate, keep it." },
      { day: 5, task: "Pass 1 — Technical Kill: Remaining 350 photos", time: "50 min", energy: "high", tip: "Take a 10-minute break every 100 photos to maintain your rejection standards" },
      { day: 6, task: "Pass 2 — Print Test: Review survivors at 100% crop (first half)", time: "35 min", energy: "medium", tip: "Check sharpness at print size. A photo that's great at screen size may be soft at 10×10 inches" },
      { day: 7, task: "Pass 2 — Print Test: Finish 100% crop review. Order a test print of your top 3.", time: "40 min", energy: "medium", tip: "Order 1-3 test prints from your chosen printer. This calibrates your expectations for paper vs screen." }
    ]
  },
  {
    name: "Story Building",
    icon: "layers",
    days: "8-12",
    color: "amber",
    milestone: "150 → 80 photos, organized into story threads",
    tasks: [
      { day: 8, task: "Pass 3 — Thematic Grouping: Identify 5-7 story threads from your shortlist", time: "45 min", energy: "high", tip: "Name your threads with evocative titles, not generic labels. 'Morning Markets' > 'Chapter 3'" },
      { day: 9, task: "Sort all 150 photos into your story threads. Cut any that don't belong.", time: "50 min", energy: "medium", tip: "If a photo doesn't fit any thread after 30 seconds of thought, it goes. No 'miscellaneous' chapter." },
      { day: 10, task: "Within each thread, rank photos by strength. Identify the hero shots.", time: "40 min", energy: "medium", tip: "Every thread needs at least 1 hero shot worthy of a full-bleed spread" },
      { day: 11, task: "Cut each thread to its best representatives. Target: 80 total across all threads.", time: "45 min", energy: "high", tip: "If two photos say the same thing, keep the braver one. Variety drives interest." },
      { day: 12, task: "Review day — step back, look at the 80 as a collection. Does it feel complete?", time: "30 min", energy: "low", tip: "Print 4×6 thumbnails and arrange on a table. Physical sorting reveals what screens hide." }
    ]
  },
  {
    name: "Narrative Design",
    icon: "trending-up",
    days: "13-17",
    color: "purple",
    milestone: "80 → 50 photos, arranged in emotional arc",
    tasks: [
      { day: 13, task: "Pass 4 — Narrative Arc: Decide your opening image (intriguing, not best)", time: "30 min", energy: "high", tip: "The first spread sets expectations. Choose something that makes the viewer curious, not overwhelmed." },
      { day: 14, task: "Arrange the rising action — build from quiet to intense through the middle", time: "50 min", energy: "high", tip: "Alternate between energy and rest. Two intense spreads in a row is exhausting." },
      { day: 15, task: "Place your climax — the 3-5 strongest images as full-bleed hero spreads", time: "40 min", energy: "high", tip: "These go at roughly the 60-75% point of the book. Like a great film, the peak comes late." },
      { day: 16, task: "Design the resolution — quiet images that bring the emotional intensity down gracefully", time: "35 min", energy: "medium", tip: "The closing image should echo the opening but resolve it. Return to where you started, changed." },
      { day: 17, task: "Pass 5 preview — identify the 10 weakest photos in your sequence. Sleep on it.", time: "30 min", energy: "low", tip: "Mark them but don't delete yet. Fresh eyes tomorrow will confirm or overrule." }
    ]
  },
  {
    name: "Final Cut & Layout",
    icon: "scissors",
    days: "18-25",
    color: "emerald",
    milestone: "Final 35-40 photos, laid out in printer software",
    tasks: [
      { day: 18, task: "Pass 5 — Album Cut: Remove the 10 marked photos. Cut to 35-40 final.", time: "45 min", energy: "high", tip: "Apply the 'Kill Your Darlings' framework. If removing a photo doesn't break the story, it was filler." },
      { day: 19, task: "Assign layout templates to each spread (use Layout Templates tool)", time: "40 min", energy: "medium", tip: "Don't repeat the same layout on consecutive spreads. Vary between full bleed, diptych, and white space." },
      { day: 20, task: "Open your printer's design software. Create project with your selected format.", time: "30 min", energy: "low", tip: "Download your printer's ICC profile and soft-proof before placing images" },
      { day: 21, task: "Place images for spreads 1-10 (opening through rising action)", time: "60 min", energy: "high", tip: "Pay attention to gutter placement — no faces or critical detail in the center fold" },
      { day: 22, task: "Place images for spreads 11-20 (climax through resolution)", time: "60 min", energy: "high", tip: "Full-bleed hero shots need 3mm bleed on all sides. Keep critical content 10mm from edges." },
      { day: 23, task: "Add chapter title pages, any captions or text elements", time: "40 min", energy: "medium", tip: "Minimal text. A location and date is usually enough. Let the photos speak." },
      { day: 24, task: "Place remaining spreads. Complete all layout work.", time: "45 min", energy: "medium", tip: "Use album_designer's sequence builder and spread manager to finalize" },
      { day: 25, task: "First complete review — scroll through every spread. Note issues.", time: "30 min", energy: "low", tip: "Review on the largest screen available. Check for consistent color, spacing, and flow." }
    ]
  },
  {
    name: "Review & Order",
    icon: "check-circle",
    days: "26-30",
    color: "rose",
    milestone: "Album ordered! First gift-quality book complete.",
    tasks: [
      { day: 26, task: "Fix issues from review. Adjust any spreads that feel off.", time: "40 min", energy: "medium", tip: "Common fixes: cropping adjustments, swapping two photos, adding breathing room" },
      { day: 27, task: "Share digital preview with a trusted friend. Get one outside perspective.", time: "20 min", energy: "low", tip: "Ask them: 'Which spread is your favorite? Which one did you skip past?' Both answers are gold." },
      { day: 28, task: "Incorporate feedback. Final proof. Export/upload to printer.", time: "45 min", energy: "high", tip: "Run through print_checklist tool. Every item green before you order." },
      { day: 29, task: "Double-check printer order: paper stock, binding, cover, quantity. Place order!", time: "20 min", energy: "low", tip: "Order 2 copies — one for you, one for the gift. The second copy is your reference for the next album." },
      { day: 30, task: "Celebrate! You completed your first album. Write notes for next one.", time: "15 min", energy: "low", tip: "Document what you learned: what was easy, what was hard, what you'd do differently. This is fuel for album #2." }
    ]
  }
];

var dayIndex = 0;
for (var p = 0; p < phases.length; p++) {
  for (var t = 0; t < phases[p].tasks.length; t++) {
    phases[p].tasks[t].date = addDays(startTs, dayIndex);
    phases[p].tasks[t].done = false;
    dayIndex++;
  }
}

var progressData = { completed: 0, total: 30, currentPhase: 1 };
try {
  var saved = await ctx.store.get("thirty_day_progress");
  if (saved && saved.tasks) {
    for (var sp = 0; sp < phases.length; sp++) {
      for (var st = 0; st < phases[sp].tasks.length; st++) {
        var taskKey = "d" + phases[sp].tasks[st].day;
        if (saved.tasks[taskKey]) {
          phases[sp].tasks[st].done = true;
          progressData.completed++;
        }
      }
    }
    for (var cp = 0; cp < phases.length; cp++) {
      var allDone = true;
      for (var ct = 0; ct < phases[cp].tasks.length; ct++) {
        if (!phases[cp].tasks[ct].done) { allDone = false; break; }
      }
      if (allDone) {
        progressData.currentPhase = cp + 2;
      } else {
        break;
      }
    }
  }
} catch(e) {}

var endDate = addDays(startTs, 29);

var result = {
  tool: "enso_album_blueprint_thirty_day_plan",
  theme: theme,
  startDate: startDate,
  endDate: endDate,
  phases: phases,
  progress: progressData,
  motivationalQuotes: [
    { phase: 1, quote: "Every great album starts with a single photo chosen with intention.", author: "Chloe Dubois" },
    { phase: 2, quote: "The eye that judges technique is not the same eye that sees art. Use the first now, the second later.", author: "Chloe Dubois" },
    { phase: 3, quote: "A photograph's meaning changes depending on its neighbors. Grouping is where albums are born.", author: "Chloe Dubois" },
    { phase: 4, quote: "Every book is a journey. The reader should feel like they've been somewhere by the last page.", author: "Alec Soth" },
    { phase: 5, quote: "A great photo book is made in the cutting room, not the camera.", author: "Martin Parr" },
    { phase: 6, quote: "Done is better than perfect. Your first album teaches you how to make your second one great.", author: "Chloe Dubois" }
  ]
};

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};

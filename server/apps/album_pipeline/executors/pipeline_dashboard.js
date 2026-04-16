var action = (params.action || "view").trim();
var albumTitle = (params.albumTitle || "").trim();
var recipient = (params.recipient || "").trim();
var startDate = (params.startDate || "").trim();

// Load or initialize pipeline state
var pipeline = ctx.store.get("pipeline") || null;

if (action === "start") {
  var now = new Date();
  var sd = startDate ? new Date(startDate) : now;
  pipeline = {
    albumTitle: albumTitle || "My First Photo Album",
    recipient: recipient || "",
    startDate: sd.toISOString().slice(0, 10),
    completedTasks: [],
    skippedTasks: [],
    selectedTheme: null,
    photosSelected: 0,
    pagesPlanned: 25,
    dailyNotes: {},
    createdAt: now.toISOString()
  };
  ctx.store.set("pipeline", pipeline);
}

if (action === "reset") {
  ctx.store.delete("pipeline");
  pipeline = null;
}

if (action === "set_start_date" && pipeline && startDate) {
  pipeline.startDate = startDate;
  ctx.store.set("pipeline", pipeline);
}

// If no pipeline exists, return empty state
if (!pipeline) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_album_pipeline_pipeline_dashboard",
        pipeline: null,
        message: "No album pipeline started yet. Use action 'start' to begin your 60-day journey."
      })
    }]
  };
}

// Calculate current day
var today = new Date();
var start = new Date(pipeline.startDate);
var diffMs = today.getTime() - start.getTime();
var currentDay = Math.max(1, Math.min(60, Math.floor(diffMs / 86400000) + 1));

// Determine current phase
var currentPhase = "curation";
if (currentDay > 45) currentPhase = "print";
else if (currentDay > 30) currentPhase = "layout";
else if (currentDay > 15) currentPhase = "sequencing";

// Build phase data
var phases = [
  {
    id: "curation",
    name: "Curation",
    emoji: "scissors",
    dayRange: [1, 15],
    tasks: 15,
    completed: 0,
    description: "Browse 124K photos, flag 200 candidates, narrow to 40-50",
    status: "locked"
  },
  {
    id: "sequencing",
    name: "Sequencing",
    emoji: "list",
    dayRange: [16, 30],
    tasks: 15,
    completed: 0,
    description: "Arrange into chapters, determine page flow, write captions",
    status: "locked"
  },
  {
    id: "layout",
    name: "Layout & Design",
    emoji: "layout",
    dayRange: [31, 45],
    tasks: 15,
    completed: 0,
    description: "Design layouts in Printique, review, finalize",
    status: "locked"
  },
  {
    id: "print",
    name: "Order & Print",
    emoji: "printer",
    dayRange: [46, 60],
    tasks: 15,
    completed: 0,
    description: "Place order, buffer for delivery and quality review",
    status: "locked"
  }
];

// Count completed tasks per phase
var completed = pipeline.completedTasks || [];
var skipped = pipeline.skippedTasks || [];
for (var i = 0; i < phases.length; i++) {
  var phase = phases[i];
  var phaseCompleted = 0;
  for (var d = phase.dayRange[0]; d <= phase.dayRange[1]; d++) {
    if (completed.indexOf(d) !== -1 || skipped.indexOf(d) !== -1) {
      phaseCompleted++;
    }
  }
  phase.completed = phaseCompleted;

  // Determine status
  if (currentDay >= phase.dayRange[0] && currentDay <= phase.dayRange[1]) {
    phase.status = "active";
  } else if (currentDay > phase.dayRange[1]) {
    phase.status = phaseCompleted === phase.tasks ? "completed" : "partial";
  } else {
    phase.status = "locked";
  }
}

// Calculate streak
var streak = 0;
for (var s = currentDay; s >= 1; s--) {
  if (completed.indexOf(s) !== -1) {
    streak++;
  } else {
    break;
  }
}

// Estimated cost based on pages
var spreads = pipeline.pagesPlanned || 25;
var baseCost = 179;
var includedSpreads = 10;
var extraCost = Math.max(0, spreads - includedSpreads) * 7;
var estimatedCost = baseCost + extraCost;

// Total completed
var totalCompleted = completed.length + skipped.length;

// Days remaining
var endDate = new Date(start.getTime() + 60 * 86400000);
var daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / 86400000));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_pipeline_pipeline_dashboard",
      pipeline: {
        albumTitle: pipeline.albumTitle,
        recipient: pipeline.recipient,
        startDate: pipeline.startDate,
        endDate: endDate.toISOString().slice(0, 10),
        currentDay: currentDay,
        totalDays: 60,
        daysRemaining: daysRemaining,
        currentPhase: currentPhase,
        photosSelected: pipeline.photosSelected || 0,
        targetPhotos: 45,
        pagesPlanned: pipeline.pagesPlanned || 25,
        estimatedCost: estimatedCost,
        selectedTheme: pipeline.selectedTheme,
        phases: phases,
        completedTasks: completed,
        skippedTasks: skipped,
        totalCompleted: totalCompleted,
        dailyStreak: streak,
        percentComplete: Math.round((totalCompleted / 60) * 100)
      }
    })
  }]
};
// Golden Hour Planner — One Lens Challenge: track single-lens shooting days
var p = params || {};
var action = (p.action || "load").trim();

// Load challenge data
var challengeKey = "ghp_lens_challenge";
var challenge = null;
try {
  challenge = await ctx.store.get(challengeKey);
} catch(e) {}

if (!challenge) {
  challenge = {
    active: false,
    focalLength: "",
    startDate: "",
    days: [],
    totalDaysCompleted: 0,
    totalShotCount: 0,
    history: []
  };
}

if (action === "start" && p.focalLength) {
  // End any active challenge first
  if (challenge.active && challenge.days.length > 0) {
    challenge.history.push({
      focalLength: challenge.focalLength,
      startDate: challenge.startDate,
      endDate: new Date().toISOString().split("T")[0],
      daysCompleted: challenge.days.length,
      totalShots: challenge.days.reduce(function(sum, d) { return sum + (d.shotCount || 0); }, 0)
    });
  }

  challenge.active = true;
  challenge.focalLength = p.focalLength;
  challenge.startDate = new Date().toISOString().split("T")[0];
  challenge.days = [];
}

if (action === "log_day" && challenge.active) {
  var logDate = p.date || new Date().toISOString().split("T")[0];

  // Check if already logged
  var exists = false;
  for (var i = 0; i < challenge.days.length; i++) {
    if (challenge.days[i].date === logDate) {
      // Update existing entry
      if (p.shotCount) challenge.days[i].shotCount = p.shotCount;
      if (p.bestShot) challenge.days[i].bestShot = p.bestShot;
      if (p.lesson) challenge.days[i].lesson = p.lesson;
      exists = true;
      break;
    }
  }

  if (!exists) {
    challenge.days.push({
      date: logDate,
      dayNumber: challenge.days.length + 1,
      shotCount: p.shotCount || 0,
      bestShot: p.bestShot || "",
      lesson: p.lesson || "",
      focalLength: challenge.focalLength
    });
    challenge.totalDaysCompleted++;
    challenge.totalShotCount += (p.shotCount || 0);
  }
}

if (action === "end_challenge" && challenge.active) {
  challenge.history.push({
    focalLength: challenge.focalLength,
    startDate: challenge.startDate,
    endDate: new Date().toISOString().split("T")[0],
    daysCompleted: challenge.days.length,
    totalShots: challenge.days.reduce(function(sum, d) { return sum + (d.shotCount || 0); }, 0),
    lessons: challenge.days.map(function(d) { return d.lesson; }).filter(function(l) { return l; })
  });
  challenge.active = false;
  challenge.focalLength = "";
  challenge.days = [];
}

// Save
try {
  await ctx.store.set(challengeKey, challenge);
} catch(e) {}

// Lens learning insights
var lensInsights = {
  "28mm": {
    name: "28mm — The Storyteller",
    personality: "Wide, immersive, environmental. Forces you to get close to your subjects.",
    bestFor: "Street scenes, architecture, environmental portraits, travel documentation",
    masterWho: "Trent Parke, Alex Webb, William Eggleston",
    challenge: "Avoid distortion at edges. Get closer than you think. Fill the frame with context."
  },
  "35mm": {
    name: "35mm — The Classic",
    personality: "Natural perspective, closest to how the eye sees. The ultimate all-rounder.",
    bestFor: "Street photography, reportage, candid moments, cityscapes",
    masterWho: "Henri Cartier-Bresson, Fan Ho, Garry Winogrand",
    challenge: "Find the sweet spot between too wide and too tight. Master zone focusing."
  },
  "50mm": {
    name: "50mm — The Nifty Fifty",
    personality: "Honest, undistorted, intimate. What you see is what you get.",
    bestFor: "Portraits, details, quiet observations, food, daily life",
    masterWho: "Vivian Maier, Ernst Haas, Saul Leiter",
    challenge: "Move your feet instead of zooming. Isolate subjects from backgrounds at f/1.8."
  },
  "85mm": {
    name: "85mm+ — The Compressor",
    personality: "Compressed perspective, flattering portraits, selective focus.",
    bestFor: "Portraits, details, compressed cityscapes, candid captures from distance",
    masterWho: "Steve McCurry, Peter Lindbergh, Annie Leibovitz",
    challenge: "Resist the urge to zoom in on everything. Use compression to stack visual layers."
  }
};

var currentLensInsight = challenge.active ? (lensInsights[challenge.focalLength] || lensInsights["50mm"]) : null;

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_ghp_lens_challenge",
  active: challenge.active,
  focalLength: challenge.focalLength,
  startDate: challenge.startDate,
  currentDays: challenge.days,
  daysCompleted: challenge.days.length,
  totalAllTime: challenge.totalDaysCompleted,
  totalShotsAllTime: challenge.totalShotCount,
  history: challenge.history,
  lensInsight: currentLensInsight,
  allLensInsights: lensInsights,
  focalLengthOptions: ["28mm", "35mm", "50mm", "85mm"]
}) }] };

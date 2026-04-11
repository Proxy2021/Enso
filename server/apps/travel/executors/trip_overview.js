// Travel — Trip Overview: dashboard summarizing all planning progress
var p = params || {};
var city = (p.city || "").trim();

// Load current trip context
var tripData = null;
try {
  tripData = await ctx.store.get("current_trip");
} catch(e) {}

if (!city && tripData) city = tripData.city || "";

if (!city) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_travel_trip_overview",
    hasTrip: false,
    message: "No trip planned yet. Use the Golden Hour Calculator to set up a trip first."
  }) }] };
}

// Load checklist stats
var checklistKey = "checklist_" + city.toLowerCase().replace(/\s+/g, "_");
var checklist = null;
try {
  checklist = await ctx.store.get(checklistKey);
} catch(e) {}

var checklistTotal = 0;
var checklistDone = 0;
var categoryProgress = [];
if (checklist && checklist.categories) {
  for (var ci = 0; ci < checklist.categories.length; ci++) {
    var cat = checklist.categories[ci];
    var catDone = 0;
    for (var ii = 0; ii < cat.items.length; ii++) {
      checklistTotal++;
      if (cat.items[ii].checked) { checklistDone++; catDone++; }
    }
    categoryProgress.push({ label: cat.label, done: catDone, total: cat.items.length, color: cat.color });
  }
}

// Load shot planner stats
var shotsKey = "shots_" + city.toLowerCase().replace(/\s+/g, "_");
var shots = null;
try {
  shots = await ctx.store.get(shotsKey);
} catch(e) {}

var shotStats = { total: 0, mustGet: 0, niceToHave: 0, completed: 0, byTimeOfDay: {} };
if (shots && shots.items) {
  shotStats.total = shots.items.length;
  for (var si = 0; si < shots.items.length; si++) {
    var s = shots.items[si];
    if (s.priority === "must_get") shotStats.mustGet++;
    else shotStats.niceToHave++;
    if (s.completed) shotStats.completed++;
    var tod = s.timeOfDay || "other";
    shotStats.byTimeOfDay[tod] = (shotStats.byTimeOfDay[tod] || 0) + 1;
  }
}

// Trip info
var tripInfo = null;
if (tripData) {
  var startD = tripData.days ? tripData.days[0] : null;
  var endD = tripData.days ? tripData.days[tripData.days.length - 1] : null;
  tripInfo = {
    city: tripData.city,
    country: tripData.country,
    latitude: tripData.lat,
    longitude: tripData.lng,
    startDate: tripData.startDate,
    endDate: tripData.endDate,
    totalDays: tripData.days ? tripData.days.length : 0,
    averageDaylight: tripData.days ? Math.round(tripData.days.reduce(function(sum, d) { return sum + d.daylightHours; }, 0) / tripData.days.length * 10) / 10 : 0,
    earliestSunrise: startD ? startD.sunrise : null,
    latestSunset: endD ? endD.sunset : null
  };
}

// Overall readiness score (0-100)
var researchScore = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
var shotScore = shotStats.total > 0 ? Math.min(100, Math.round((shotStats.total / 10) * 100)) : 0;
var tripScore = tripInfo ? 100 : 0;
var overallReadiness = Math.round((researchScore * 0.35 + shotScore * 0.35 + tripScore * 0.3));

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_trip_overview",
  hasTrip: true,
  city: city,
  tripInfo: tripInfo,
  research: {
    total: checklistTotal,
    done: checklistDone,
    percent: researchScore,
    categoryProgress: categoryProgress
  },
  shots: shotStats,
  readiness: overallReadiness
}) }] };

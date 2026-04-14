// Golden Hour Planner — Weekly Review: stats, streak tracking, photographer tips
var p = params || {};
var action = (p.action || "load").trim();
var city = (p.city || "").trim();

// Load current trip
var tripData = null;
try {
  tripData = await ctx.store.get("current_trip");
} catch(e) {}
if (!city && tripData) city = tripData.city || "";
if (!city) city = "My Trip";

// Load sessions data
var sessionsKey = "ghp_sessions";
var sessions = null;
try {
  sessions = await ctx.store.get(sessionsKey);
} catch(e) {}
if (!sessions) {
  sessions = { entries: [], streak: 0, longestStreak: 0, lastSessionDate: "" };
}

// Handle actions
if (action === "log_session") {
  var sessionDate = p.sessionDate || new Date().toISOString().split("T")[0];
  var sessionType = p.sessionType || "evening";

  // Check if already logged today
  var alreadyLogged = false;
  for (var i = 0; i < sessions.entries.length; i++) {
    if (sessions.entries[i].date === sessionDate) {
      alreadyLogged = true;
      break;
    }
  }

  if (!alreadyLogged) {
    sessions.entries.push({
      date: sessionDate,
      type: sessionType,
      city: city,
      loggedAt: new Date().toISOString()
    });

    // Update streak
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayStr = yesterday.toISOString().split("T")[0];

    if (sessions.lastSessionDate === yesterdayStr || sessions.lastSessionDate === sessionDate) {
      sessions.streak++;
    } else {
      sessions.streak = 1;
    }
    sessions.lastSessionDate = sessionDate;
    if (sessions.streak > sessions.longestStreak) {
      sessions.longestStreak = sessions.streak;
    }
  }
}

if (action === "reset_streak") {
  sessions.streak = 0;
  sessions.lastSessionDate = "";
}

// Save sessions
try {
  await ctx.store.set(sessionsKey, sessions);
} catch(e) {}

// Load shot stats
var shotsKey = "ghp_shots_" + city.toLowerCase().replace(/[^a-z0-9]/g, "_");
var shots = null;
try {
  shots = await ctx.store.get(shotsKey);
} catch(e) {}
if (!shots) shots = { items: [] };

var totalPlanned = shots.items.length;
var totalAttempted = shots.items.filter(function(s) { return s.attempted; }).length;
var totalGotIt = shots.items.filter(function(s) { return s.gotIt; }).length;
var totalScouted = shots.items.filter(function(s) { return s.scouted; }).length;

// Get this week's sessions
var now = new Date();
var weekAgo = new Date(now.getTime() - 7 * 86400000);
var weekAgoStr = weekAgo.toISOString().split("T")[0];
var thisWeekSessions = sessions.entries.filter(function(e) { return e.date >= weekAgoStr; });
var morningCount = thisWeekSessions.filter(function(e) { return e.type === "morning" || e.type === "both"; }).length;
var eveningCount = thisWeekSessions.filter(function(e) { return e.type === "evening" || e.type === "both"; }).length;

// Streak status
var todayStr = now.toISOString().split("T")[0];
var streakActive = sessions.lastSessionDate === todayStr;
var yesterdayDate = new Date(now.getTime() - 86400000);
var yesterdayStr2 = yesterdayDate.toISOString().split("T")[0];
if (!streakActive) streakActive = sessions.lastSessionDate === yesterdayStr2;

// Photographer tips
var photographerTips = [
  { photographer: "Fan Ho", tip: "Use architecture to channel golden light into geometric beams. Find narrow streets and alleys — buildings become natural light modifiers.", style: "Light & Shadow" },
  { photographer: "Trent Parke", tip: "Shoot INTO the light. Meter for the brightest area to create dramatic silhouettes against blazing golden backgrounds.", style: "Contre-jour" },
  { photographer: "Alex Webb", tip: "In tropical destinations, golden hour is short — sometimes 20 minutes. Work fast, layer your compositions with 3+ visual depths.", style: "Layered Color" },
  { photographer: "Joel Meyerowitz", tip: "Return to the same location every evening during your trip. Each day the light transforms the scene differently. Patience rewards.", style: "Dusk Patience" },
  { photographer: "Steve McCurry", tip: "Position portraits so golden hour light falls on faces at 30-45 degrees. Look for the catchlight in their eyes — warmth + sparkle.", style: "Golden Portraits" },
  { photographer: "Sebastiao Salgado", tip: "Backlight your subjects at dawn or dusk. The luminous halo around figures creates timeless, epic imagery. Convert to B&W for gravitas.", style: "Backlit Epic" },
  { photographer: "Daido Moriyama", tip: "Break the rules deliberately. Shoot at midday, embrace grain and blur. The imperfection becomes your signature — own it.", style: "Rule-Breaking" }
];

// Pick random tip
var tipIndex = Math.floor(Math.random() * photographerTips.length);
var dailyTip = photographerTips[tipIndex];

// Completion rate
var completionRate = totalPlanned > 0 ? Math.round((totalGotIt / totalPlanned) * 100) : 0;
var attemptRate = totalPlanned > 0 ? Math.round((totalAttempted / totalPlanned) * 100) : 0;
var scoutRate = totalPlanned > 0 ? Math.round((totalScouted / totalPlanned) * 100) : 0;

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_ghp_weekly_review",
  city: city,
  shots: {
    planned: totalPlanned,
    scouted: totalScouted,
    attempted: totalAttempted,
    gotIt: totalGotIt,
    completionRate: completionRate,
    attemptRate: attemptRate,
    scoutRate: scoutRate
  },
  streak: {
    current: sessions.streak,
    longest: sessions.longestStreak,
    active: streakActive,
    lastDate: sessions.lastSessionDate
  },
  thisWeek: {
    totalSessions: thisWeekSessions.length,
    morningSessions: morningCount,
    eveningSessions: eveningCount,
    target: 7,
    entries: thisWeekSessions
  },
  dailyTip: dailyTip,
  allTips: photographerTips,
  todayLogged: sessions.entries.some(function(e) { return e.date === todayStr; })
}) }] };

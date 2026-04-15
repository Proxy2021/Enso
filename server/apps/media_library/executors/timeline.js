var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var period = (params.period || "").trim() || "all";
var mediaType = (params.mediaType || "").trim() || "all";

// Media type → entity type mapping
var typeMap = {
  books: ["book"],
  movies: ["movie"],
  tv: ["tv-series"],
  documentaries: ["documentary"],
  games: ["game"],
  music: ["song", "artist", "playlist"],
  articles: ["article"],
  photos: ["album"]
};

// Load entity index
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_timeline",
        error: "Could not load entity index: " + e.message,
        timeline: [],
        overallStats: {}
      })
    }]
  };
}

// Filter to media entities
var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "article"];
var allowedTypes = null;
if (mediaType !== "all" && typeMap[mediaType]) {
  allowedTypes = typeMap[mediaType];
}

var allEntities = Object.values(index);

// Compute period cutoff date
var now = new Date();
var cutoffDate = null;
if (period === "week") {
  cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
} else if (period === "month") {
  cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
} else if (period === "quarter") {
  cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
} else if (period === "year") {
  cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
}
// "all" → cutoffDate stays null

// Build timeline events
var events = [];
for (var i = 0; i < allEntities.length; i++) {
  var e = allEntities[i];

  // Only media entity types
  if (mediaEntityTypes.indexOf(e.type) === -1) continue;
  // Media type filter
  if (allowedTypes && allowedTypes.indexOf(e.type) === -1) continue;

  // Must have at least some engagement data
  var hasEngagement = e.userRating || e.isFavorite || e.consumptionStatus || e.dateStarted || e.dateCompleted;
  if (!hasEngagement) continue;

  var entityInfo = {
    entityId: e.entityId,
    title: e.title,
    type: e.type,
    imageUrl: e.imageUrl || null,
    source: e.source || null
  };

  // Started event
  if (e.dateStarted) {
    var startDate = new Date(e.dateStarted);
    if (!isNaN(startDate.getTime()) && (!cutoffDate || startDate >= cutoffDate)) {
      events.push({
        eventType: "started",
        date: e.dateStarted,
        timestamp: startDate.getTime(),
        entity: entityInfo
      });
    }
  }

  // Completed event
  if (e.dateCompleted) {
    var compDate = new Date(e.dateCompleted);
    if (!isNaN(compDate.getTime()) && (!cutoffDate || compDate >= cutoffDate)) {
      events.push({
        eventType: "completed",
        date: e.dateCompleted,
        timestamp: compDate.getTime(),
        entity: entityInfo
      });
    }
  }

  // Rated event (use updatedAt as date)
  if (e.userRating && e.userRating > 0) {
    var rateDate = e.updatedAt ? new Date(e.updatedAt) : null;
    if (rateDate && !isNaN(rateDate.getTime()) && (!cutoffDate || rateDate >= cutoffDate)) {
      events.push({
        eventType: "rated",
        date: e.updatedAt,
        timestamp: rateDate.getTime(),
        entity: entityInfo,
        rating: e.userRating
      });
    }
  }

  // Favorited event (use updatedAt as date)
  if (e.isFavorite) {
    var favDate = e.updatedAt ? new Date(e.updatedAt) : null;
    if (favDate && !isNaN(favDate.getTime()) && (!cutoffDate || favDate >= cutoffDate)) {
      events.push({
        eventType: "favorited",
        date: e.updatedAt,
        timestamp: favDate.getTime(),
        entity: entityInfo
      });
    }
  }
}

// Sort events reverse-chronologically
events.sort(function(a, b) { return b.timestamp - a.timestamp; });

// Group events by month
var monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
var monthGroups = {};
var monthOrder = [];

for (var ei = 0; ei < events.length; ei++) {
  var ev = events[ei];
  var d = new Date(ev.timestamp);
  var monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  var monthLabel = monthNames[d.getMonth()] + " " + d.getFullYear();

  if (!monthGroups[monthKey]) {
    monthGroups[monthKey] = {
      month: monthLabel,
      monthKey: monthKey,
      year: d.getFullYear(),
      monthNum: d.getMonth() + 1,
      events: [],
      summary: { itemsStarted: 0, itemsCompleted: 0, itemsRated: 0, itemsFavorited: 0, avgRating: 0, ratingSum: 0 }
    };
    monthOrder.push(monthKey);
  }

  monthGroups[monthKey].events.push(ev);

  // Update summary
  var summary = monthGroups[monthKey].summary;
  if (ev.eventType === "started") summary.itemsStarted++;
  else if (ev.eventType === "completed") summary.itemsCompleted++;
  else if (ev.eventType === "rated") { summary.itemsRated++; summary.ratingSum += (ev.rating || 0); }
  else if (ev.eventType === "favorited") summary.itemsFavorited++;
}

// Finalize summaries and build timeline array
var timeline = [];
for (var mi = 0; mi < monthOrder.length; mi++) {
  var mg = monthGroups[monthOrder[mi]];
  if (mg.summary.itemsRated > 0) {
    mg.summary.avgRating = Math.round((mg.summary.ratingSum / mg.summary.itemsRated) * 10) / 10;
  }
  delete mg.summary.ratingSum;
  timeline.push(mg);
}

// Overall stats
var totalEvents = events.length;
var activeMonths = timeline.length;
var busiestMonth = "";
var busiestMonthCount = 0;

for (var bi = 0; bi < timeline.length; bi++) {
  var mEvCount = timeline[bi].events.length;
  if (mEvCount > busiestMonthCount) {
    busiestMonthCount = mEvCount;
    busiestMonth = timeline[bi].month;
  }
}

// Compute longest streak (consecutive months with activity)
var longestStreak = 0;
var currentStreak = 0;
if (monthOrder.length > 0) {
  // Sort monthOrder chronologically to compute streaks
  var sortedMonths = monthOrder.slice().sort();
  currentStreak = 1;
  longestStreak = 1;
  for (var si = 1; si < sortedMonths.length; si++) {
    var prevParts = sortedMonths[si - 1].split("-");
    var currParts = sortedMonths[si].split("-");
    var prevYear = parseInt(prevParts[0]);
    var prevMonth = parseInt(prevParts[1]);
    var currYear = parseInt(currParts[0]);
    var currMonth = parseInt(currParts[1]);

    // Check if consecutive month
    var expectedYear = prevYear;
    var expectedMonth = prevMonth + 1;
    if (expectedMonth > 12) { expectedMonth = 1; expectedYear++; }

    if (currYear === expectedYear && currMonth === expectedMonth) {
      currentStreak++;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }
}

// Type breakdown across all events
var eventTypeCounts = { started: 0, completed: 0, rated: 0, favorited: 0 };
var mediaTypeCounts = {};
for (var eti = 0; eti < events.length; eti++) {
  eventTypeCounts[events[eti].eventType] = (eventTypeCounts[events[eti].eventType] || 0) + 1;
  var mt = events[eti].entity.type;
  mediaTypeCounts[mt] = (mediaTypeCounts[mt] || 0) + 1;
}

var overallStats = {
  totalEvents: totalEvents,
  activeMonths: activeMonths,
  busiestMonth: busiestMonth,
  busiestMonthCount: busiestMonthCount,
  longestStreak: longestStreak,
  eventTypeCounts: eventTypeCounts,
  mediaTypeCounts: mediaTypeCounts
};

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_timeline",
      period: period,
      mediaType: mediaType,
      timeline: timeline,
      overallStats: overallStats,
      generatedAt: new Date().toISOString()
    })
  }]
};

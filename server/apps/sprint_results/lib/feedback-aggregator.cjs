/**
 * Feedback Aggregator for Sprint Results
 *
 * Reads activation-feedback.json, computes aggregate metrics,
 * and returns a structured summary for the Team Leader and progress dashboard.
 */

var fs = require("fs");
var path = require("path");
var os = require("os");

var FEEDBACK_FILE = path.join(os.homedir(), ".enso", "data", "activation-feedback.json");

/**
 * Load raw feedback entries from disk.
 * @returns {{ feedbackEntries: Array }} Parsed feedback data or empty structure
 */
function loadFeedbackSync() {
  try {
    var raw = fs.readFileSync(FEEDBACK_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return { feedbackEntries: [] };
  }
}

/**
 * Compute aggregate activation insights from all collected feedback.
 * Returns a structured summary object.
 *
 * @returns {{
 *   totalFeedback: number,
 *   averageRating: number,
 *   ratingsByType: Object,
 *   ratingsByFocus: Object,
 *   topSuggestions: string[],
 *   activationCompletionByFocus: Object,
 *   mostValued: { type: string, avgRating: number } | null,
 *   leastValued: { type: string, avgRating: number } | null,
 *   ratingDistribution: Object,
 *   recentTrend: { direction: string, recentAvg: number, olderAvg: number } | null,
 *   feedbackTimeline: Array
 * }}
 */
function getActivationInsights() {
  var data = loadFeedbackSync();
  var entries = data.feedbackEntries || [];

  if (entries.length === 0) {
    return {
      totalFeedback: 0,
      averageRating: 0,
      ratingsByType: {},
      ratingsByFocus: {},
      topSuggestions: [],
      activationCompletionByFocus: {},
      mostValued: null,
      leastValued: null,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      recentTrend: null,
      feedbackTimeline: []
    };
  }

  // ── Average rating ──
  var totalRating = 0;
  for (var i = 0; i < entries.length; i++) {
    totalRating += entries[i].rating || 0;
  }
  var averageRating = Math.round((totalRating / entries.length) * 10) / 10;

  // ── Rating distribution ──
  var distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (var d = 0; d < entries.length; d++) {
    var r = entries[d].rating;
    if (r >= 1 && r <= 5) distribution[r]++;
  }

  // ── Ratings by entity type ──
  var typeMap = {};
  for (var t = 0; t < entries.length; t++) {
    var type = entries[t].entityType || "unknown";
    if (!typeMap[type]) typeMap[type] = { sum: 0, count: 0 };
    typeMap[type].sum += entries[t].rating || 0;
    typeMap[type].count++;
  }
  var ratingsByType = {};
  var typeKeys = Object.keys(typeMap);
  var bestType = null;
  var worstType = null;
  for (var tk = 0; tk < typeKeys.length; tk++) {
    var key = typeKeys[tk];
    var avg = Math.round((typeMap[key].sum / typeMap[key].count) * 10) / 10;
    ratingsByType[key] = { averageRating: avg, count: typeMap[key].count };
    if (!bestType || avg > bestType.avgRating) bestType = { type: key, avgRating: avg };
    if (!worstType || avg < worstType.avgRating) worstType = { type: key, avgRating: avg };
  }

  // ── Ratings by focus area ──
  var focusMap = {};
  for (var f = 0; f < entries.length; f++) {
    var fid = entries[f].focusId || "unknown";
    if (!focusMap[fid]) focusMap[fid] = { sum: 0, count: 0 };
    focusMap[fid].sum += entries[f].rating || 0;
    focusMap[fid].count++;
  }
  var ratingsByFocus = {};
  var focusKeys = Object.keys(focusMap);
  for (var fk = 0; fk < focusKeys.length; fk++) {
    var fKey = focusKeys[fk];
    ratingsByFocus[fKey] = {
      averageRating: Math.round((focusMap[fKey].sum / focusMap[fKey].count) * 10) / 10,
      count: focusMap[fKey].count
    };
  }

  // ── Top suggestions (group by deduplicating similar short phrases) ──
  var suggestions = [];
  for (var s = 0; s < entries.length; s++) {
    if (entries[s].suggestion && entries[s].suggestion.trim().length > 0) {
      suggestions.push(entries[s].suggestion.trim());
    }
  }
  // Simple dedup: take unique suggestions, limit to 10
  var uniqueSuggestions = [];
  var seen = {};
  for (var us = 0; us < suggestions.length; us++) {
    var normalized = suggestions[us].toLowerCase().substring(0, 50);
    if (!seen[normalized]) {
      seen[normalized] = true;
      uniqueSuggestions.push(suggestions[us]);
    }
    if (uniqueSuggestions.length >= 10) break;
  }

  // ── Recent trend (compare last 5 vs earlier) ──
  var sorted = entries.slice().sort(function(a, b) {
    return (a.timestamp || "").localeCompare(b.timestamp || "");
  });
  var recentTrend = null;
  if (sorted.length >= 4) {
    var midpoint = Math.floor(sorted.length / 2);
    var olderSum = 0;
    var recentSum = 0;
    for (var oi = 0; oi < midpoint; oi++) olderSum += sorted[oi].rating || 0;
    for (var ri2 = midpoint; ri2 < sorted.length; ri2++) recentSum += sorted[ri2].rating || 0;
    var olderAvg = Math.round((olderSum / midpoint) * 10) / 10;
    var recentAvg = Math.round((recentSum / (sorted.length - midpoint)) * 10) / 10;
    var direction = recentAvg > olderAvg ? "improving" : recentAvg < olderAvg ? "declining" : "stable";
    recentTrend = { direction: direction, recentAvg: recentAvg, olderAvg: olderAvg };
  }

  // ── Feedback timeline (for charting) ──
  var timeline = [];
  for (var tl = 0; tl < sorted.length; tl++) {
    timeline.push({
      date: sorted[tl].timestamp ? sorted[tl].timestamp.split("T")[0] : "unknown",
      rating: sorted[tl].rating,
      type: sorted[tl].entityType || "unknown",
      title: sorted[tl].title || sorted[tl].entityId
    });
  }

  return {
    totalFeedback: entries.length,
    averageRating: averageRating,
    ratingsByType: ratingsByType,
    ratingsByFocus: ratingsByFocus,
    topSuggestions: uniqueSuggestions,
    activationCompletionByFocus: ratingsByFocus,
    mostValued: bestType,
    leastValued: worstType,
    ratingDistribution: distribution,
    recentTrend: recentTrend,
    feedbackTimeline: timeline
  };
}

module.exports = { getActivationInsights: getActivationInsights };

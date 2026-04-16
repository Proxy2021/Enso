// Sprint Results: Feedback Executor
// Collects structured feedback on sprint deliverables to close the activation loop.
// Without rating: shows feedback form UI. With rating: saves and confirms.

var entityId = (params.entityId || "").trim();
var focusId = (params.focusId || "").trim();
var rating = params.rating;
var actionTaken = (params.actionTaken || "").trim();
var suggestion = (params.suggestion || "").trim();

if (!entityId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_feedback",
    success: false,
    error: "Missing required parameter: entityId"
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var feedbackPath = homeDir + "/.enso/data/activation-feedback.json";

// ── Helper: read/write feedback file ──

async function loadFeedback() {
  try {
    var raw = await ctx.readFile(feedbackPath);
    var text = null;
    if (typeof raw === "string") text = raw;
    else if (raw && raw.success !== false && raw.data) text = typeof raw.data === "string" ? raw.data : String(raw.data);
    else if (raw && raw.content) text = String(raw.content);
    if (text && text.length > 2) return JSON.parse(text);
  } catch (e) {}
  return { feedbackEntries: [] };
}

async function saveFeedback(data) {
  await ctx.writeFile(feedbackPath, JSON.stringify(data, null, 2));
}

// ── Load deliverable metadata for display ──

var deliverable = null;
var focusTitle = "";
try {
  var focusRaw = await ctx.readFile(homeDir + "/.enso/data/focus-areas.json");
  var focusText = null;
  if (typeof focusRaw === "string") focusText = focusRaw;
  else if (focusRaw && focusRaw.success !== false && focusRaw.data) focusText = typeof focusRaw.data === "string" ? focusRaw.data : String(focusRaw.data);
  if (focusText) {
    var focusData = JSON.parse(focusText);
    if (focusData && focusData.areas) {
      for (var ai = 0; ai < focusData.areas.length; ai++) {
        var area = focusData.areas[ai];
        if (area.lastSprintSummary && area.lastSprintSummary.deliverables) {
          for (var di = 0; di < area.lastSprintSummary.deliverables.length; di++) {
            var del = area.lastSprintSummary.deliverables[di];
            if (del.entityId === entityId) {
              deliverable = del;
              focusTitle = area.title || "";
              if (!focusId) focusId = area.id;
              break;
            }
          }
        }
        if (deliverable) break;
      }
    }
  }
} catch (e) {}

// ── Mode 1: Show feedback form (no rating provided) ──

if (typeof rating !== "number") {
  var title = deliverable ? (deliverable.taskTitle || entityId) : entityId;
  var entityType = deliverable ? (deliverable.entityType || "synthesis") : "unknown";
  var painPoint = deliverable ? (deliverable.painPoint || "") : "";

  // Check if feedback already exists for this entity
  var feedbackData = await loadFeedback();
  var existing = null;
  for (var ei = 0; ei < feedbackData.feedbackEntries.length; ei++) {
    if (feedbackData.feedbackEntries[ei].entityId === entityId) {
      existing = feedbackData.feedbackEntries[ei];
      break;
    }
  }

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_feedback",
    success: true,
    mode: "form",
    entityId: entityId,
    focusId: focusId,
    title: title,
    entityType: entityType,
    painPoint: painPoint,
    focusTitle: focusTitle,
    previousFeedback: existing ? {
      rating: existing.rating,
      actionTaken: existing.actionTaken,
      suggestion: existing.suggestion,
      timestamp: existing.timestamp
    } : null,
    ratingScale: [
      { value: 1, label: "Not useful", emoji: "skip" },
      { value: 2, label: "Slightly helpful", emoji: "meh" },
      { value: 3, label: "Useful", emoji: "good" },
      { value: 4, label: "Very useful", emoji: "great" },
      { value: 5, label: "Essential", emoji: "star" }
    ],
    prompts: {
      actionTaken: "What did you do with this deliverable?",
      suggestion: "How could future deliverables like this be better?"
    },
    message: existing
      ? "You rated this " + existing.rating + "/5 on " + existing.timestamp.split("T")[0] + ". Update your feedback?"
      : "Quick feedback on \"" + title + "\" — helps Enso learn what works for you."
  }) }] };
}

// ── Mode 2: Save feedback (rating provided) ──

if (rating < 1 || rating > 5) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_feedback",
    success: false,
    error: "Rating must be between 1 and 5"
  }) }] };
}

var feedbackStore = await loadFeedback();
var title = deliverable ? (deliverable.taskTitle || entityId) : entityId;
var entityType = deliverable ? (deliverable.entityType || "synthesis") : "unknown";

// Upsert: replace existing feedback for this entityId, or append
var found = false;
for (var fi = 0; fi < feedbackStore.feedbackEntries.length; fi++) {
  if (feedbackStore.feedbackEntries[fi].entityId === entityId) {
    feedbackStore.feedbackEntries[fi].rating = rating;
    feedbackStore.feedbackEntries[fi].actionTaken = actionTaken || feedbackStore.feedbackEntries[fi].actionTaken;
    feedbackStore.feedbackEntries[fi].suggestion = suggestion || feedbackStore.feedbackEntries[fi].suggestion;
    feedbackStore.feedbackEntries[fi].timestamp = new Date().toISOString();
    feedbackStore.feedbackEntries[fi].updatedCount = (feedbackStore.feedbackEntries[fi].updatedCount || 0) + 1;
    found = true;
    break;
  }
}

if (!found) {
  feedbackStore.feedbackEntries.push({
    entityId: entityId,
    focusId: focusId,
    title: title,
    entityType: entityType,
    rating: rating,
    actionTaken: actionTaken,
    suggestion: suggestion,
    timestamp: new Date().toISOString(),
    updatedCount: 0
  });
}

await saveFeedback(feedbackStore);

// Generate encouraging confirmation
var confirmations = {
  1: "Thanks for the honest feedback. We'll learn from this and do better next time.",
  2: "Noted — we'll work on making these more actionable for you.",
  3: "Good to know this was useful. Your feedback helps shape better sprints.",
  4: "Great to hear! We'll aim to produce more deliverables like this.",
  5: "Amazing! This is exactly the kind of result we want every sprint to produce."
};

var totalFeedback = feedbackStore.feedbackEntries.length;
var avgRating = 0;
for (var ri = 0; ri < feedbackStore.feedbackEntries.length; ri++) {
  avgRating += feedbackStore.feedbackEntries[ri].rating;
}
avgRating = totalFeedback > 0 ? Math.round((avgRating / totalFeedback) * 10) / 10 : 0;

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_sprint_results_feedback",
  success: true,
  mode: "saved",
  entityId: entityId,
  focusId: focusId,
  title: title,
  entityType: entityType,
  rating: rating,
  actionTaken: actionTaken,
  suggestion: suggestion,
  confirmation: confirmations[rating] || "Feedback saved.",
  stats: {
    totalFeedbackGiven: totalFeedback,
    averageRating: avgRating
  },
  message: "Feedback saved — " + rating + "/5 for \"" + title + "\". " + confirmations[rating]
}) }] };

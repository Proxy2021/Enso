var fs = require("fs");
var path = require("path");
var os = require("os");

// ── 10-point half-star display helpers ──
// 1–10 maps to 0.5–5.0 stars (each point = 0.5★)
function starsFromRating(r) { return r >= 1 && r <= 10 ? r / 2 : null; }
function starsDisplay(r) {
  var s = starsFromRating(r);
  if (s === null) return null;
  var full = Math.floor(s), half = s % 1 >= 0.25 ? 1 : 0;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - half);
}
function ratingLabel(r) {
  if (r >= 10) return "Masterpiece"; if (r >= 9) return "Excellent";
  if (r >= 8) return "Very Good"; if (r >= 7) return "Good";
  if (r >= 6) return "Above Average"; if (r >= 5) return "Average";
  if (r >= 4) return "Below Average"; if (r >= 3) return "Poor";
  return r >= 2 ? "Very Poor" : "Terrible";
}

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var entityId = (params.entityId || "").trim();
var rating = params.rating;
var notes = (params.notes || "").trim();

if (!entityId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "entityId is required", success: false })
    }]
  };
}

// Validate rating: 0 clears, 1–10 (integers) are valid
// Also accept 0.5–5.0 star notation and convert to 1–10
if (rating === undefined || rating === null) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "rating is required", success: false })
    }]
  };
}

// Convert star notation (0.5–5.0) to 10-point scale
// If value is in range 0.5–5.0 and is a half-integer, treat as star input
if (rating > 0 && rating <= 5 && (rating * 2) === Math.round(rating * 2) && rating !== Math.floor(rating)) {
  rating = Math.round(rating * 2);
}

if (rating < 0 || rating > 10 || (rating > 0 && !Number.isInteger(rating))) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "rating must be 0 (clear) or 1–10. Half-star input also accepted: 4.5 stars = 9/10.", success: false })
    }]
  };
}

var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "Could not load entity index", success: false })
    }]
  };
}

if (!index[entityId]) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "Entity not found: " + entityId, success: false })
    }]
  };
}

var entity = index[entityId];
if (rating === 0) {
  delete entity.userRating;
  delete entity.userNotes;
} else {
  entity.userRating = rating;
  if (notes) entity.userNotes = notes;
}
entity.updatedAt = new Date().toISOString();

try {
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_rate", error: "Failed to save: " + e.message, success: false })
    }]
  };
}

var display = entity.userRating ? {
  points: entity.userRating,
  stars: starsFromRating(entity.userRating),
  display: starsDisplay(entity.userRating),
  label: ratingLabel(entity.userRating)
} : null;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_rate",
      entityId: entityId,
      title: entity.title,
      type: entity.type,
      userRating: entity.userRating || null,
      ratingDisplay: display,
      userNotes: entity.userNotes || null,
      success: true
    })
  }]
};

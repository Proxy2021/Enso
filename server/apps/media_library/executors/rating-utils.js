/**
 * rating-utils.js — 10-point half-star rating display utilities.
 *
 * The media library uses a 10-point scale (1–10) that maps to a
 * 5-star display with half-star granularity:
 *
 *   1 → ½★  (0.5 stars)      6 → ★★★  (3.0 stars)
 *   2 → ★   (1.0 star)       7 → ★★★½ (3.5 stars)
 *   3 → ★½  (1.5 stars)      8 → ★★★★ (4.0 stars)
 *   4 → ★★  (2.0 stars)      9 → ★★★★½(4.5 stars)
 *   5 → ★★½ (2.5 stars)     10 → ★★★★★(5.0 stars)
 *
 * This gives 10 distinct rating points while displaying as the
 * familiar 5-star half-star system users recognize.
 */

// Convert 1–10 integer rating to 0.5–5.0 star value
function starsFromRating(rating) {
  if (rating == null || rating < 1 || rating > 10) return null;
  return Math.round(rating) / 2;
}

// Build a half-star string: "★★★★½" or "★★☆☆☆"
function starsDisplay(rating) {
  var stars = starsFromRating(rating);
  if (stars === null) return null;
  var full = Math.floor(stars);
  var half = (stars % 1 >= 0.25) ? 1 : 0;
  var empty = 5 - full - half;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

// Full display object for a rating
function ratingDisplay(rating) {
  if (rating == null) return null;
  return {
    points: rating,         // 1–10
    stars: starsFromRating(rating),  // 0.5–5.0
    display: starsDisplay(rating),   // "★★★★½"
    label: ratingLabel(rating)       // "Excellent"
  };
}

// Human-readable label for the rating
function ratingLabel(rating) {
  if (rating == null) return null;
  if (rating >= 10) return "Masterpiece";
  if (rating >= 9)  return "Excellent";
  if (rating >= 8)  return "Very Good";
  if (rating >= 7)  return "Good";
  if (rating >= 6)  return "Above Average";
  if (rating >= 5)  return "Average";
  if (rating >= 4)  return "Below Average";
  if (rating >= 3)  return "Poor";
  if (rating >= 2)  return "Very Poor";
  return "Terrible";
}

module.exports = { starsFromRating, starsDisplay, ratingDisplay, ratingLabel };

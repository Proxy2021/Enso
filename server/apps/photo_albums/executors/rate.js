// Photo album taste profile interactions — save/rate/dismiss/favorite/view.
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var action = String(p.action || "view");
var entityId = String(p.entityId || "");
var rating = p.rating;

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
var cachePath = path.join(cacheDir, "photo-albums.json");

var cached = { albums: [], tasteProfile: { version: 1, interactionCount: 0, photographerAffinities: {}, styleWeights: {}, themeWeights: {}, savedAlbums: [], ratings: [], dismissedAlbums: [], streak: { current: 0, longest: 0 } } };
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}
if (!Array.isArray(cached.albums)) cached.albums = [];
if (!cached.tasteProfile) cached.tasteProfile = { version: 1, interactionCount: 0, photographerAffinities: {}, styleWeights: {}, themeWeights: {}, savedAlbums: [], ratings: [], dismissedAlbums: [], streak: { current: 0, longest: 0 } };
var tp = cached.tasteProfile;
if (!tp.photographerAffinities) tp.photographerAffinities = {};
if (!tp.styleWeights) tp.styleWeights = {};
if (!tp.themeWeights) tp.themeWeights = {};
if (!tp.savedAlbums) tp.savedAlbums = [];
if (!tp.ratings) tp.ratings = [];
if (!tp.dismissedAlbums) tp.dismissedAlbums = [];
if (!tp.streak) tp.streak = { current: 0, longest: 0 };

if (action === "view") {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_rate",
    action: "view",
    profile: tp,
  }) }] };
}

if (!entityId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_rate",
    error: "entityId is required for save/rate/dismiss/favorite.",
  }) }] };
}

var album = cached.albums.find(function(a) { return a.entityId === entityId; });

function bumpWeights(a, delta) {
  if (!a) return;
  if (a.photographer) tp.photographerAffinities[a.photographer] = (tp.photographerAffinities[a.photographer] || 0) + delta;
  if (a.style) tp.styleWeights[a.style] = (tp.styleWeights[a.style] || 0) + delta;
  (a.themes || []).forEach(function(t) { tp.themeWeights[t] = (tp.themeWeights[t] || 0) + delta * 0.5; });
}

if (action === "save") {
  if (album && tp.savedAlbums.indexOf(entityId) < 0) tp.savedAlbums.push(entityId);
  bumpWeights(album, 1);
} else if (action === "favorite") {
  if (album) album.isFavorite = !album.isFavorite;
  bumpWeights(album, 0.5);
} else if (action === "dismiss") {
  if (tp.dismissedAlbums.indexOf(entityId) < 0) tp.dismissedAlbums.push(entityId);
  bumpWeights(album, -0.5);
} else if (action === "rate") {
  var r = Number(rating);
  if (!(r >= 1 && r <= 5)) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_photo_albums_rate", error: "rating must be 1-5" }) }] };
  }
  if (album) album.userRating = r;
  tp.ratings = tp.ratings.filter(function(x) { return x.entityId !== entityId; });
  tp.ratings.push({ entityId: entityId, rating: r, at: new Date().toISOString() });
  bumpWeights(album, (r - 3) * 0.5);
}

tp.interactionCount = (tp.interactionCount || 0) + 1;
cached.updatedAt = new Date().toISOString();
try { fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2), "utf-8"); } catch (e) { ctx.log("Cache write failed: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_photo_albums_rate",
  action: action,
  entityId: entityId,
  success: true,
  profile: tp,
  album: album || null,
}) }] };

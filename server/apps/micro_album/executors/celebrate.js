// Micro Album Celebrate — Congratulations and milestone tracking
// Records the achievement and suggests sharing

var recipientName = (params.recipientName || "").trim();

var albumState = await ctx.store.get("albumState");

if (!albumState || !albumState.candidates) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_celebrate",
        error: "No album found. Complete an album first!",
        suggestion: "Use the Launch tool to start your first album."
      })
    }]
  };
}

var candidates = albumState.candidates || [];
var kept = albumState.kept || [];

// Gather kept photos for the milestone
var keptPhotos = [];
for (var i = 0; i < kept.length; i++) {
  if (kept[i] < candidates.length) {
    keptPhotos.push(candidates[kept[i]]);
  }
}

// Compute date range
var dates = [];
for (var di = 0; di < keptPhotos.length; di++) {
  if (keptPhotos[di].dateTaken) {
    var ts = new Date(keptPhotos[di].dateTaken).getTime();
    if (!isNaN(ts)) dates.push(ts);
  }
}
dates.sort(function(a, b) { return a - b; });

var dateRange = "";
if (dates.length >= 2) {
  try {
    var fmt = { year: "numeric", month: "short" };
    dateRange = new Date(dates[0]).toLocaleDateString("en-US", fmt) +
      " – " + new Date(dates[dates.length - 1]).toLocaleDateString("en-US", fmt);
  } catch(e) {}
} else if (dates.length === 1) {
  try {
    dateRange = new Date(dates[0]).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  } catch(e) {}
}

// Camera stats
var cameras = {};
for (var ci = 0; ci < keptPhotos.length; ci++) {
  var cam = (keptPhotos[ci].camera || "").trim();
  if (cam) cameras[cam] = (cameras[cam] || 0) + 1;
}
var topCamera = "";
var topCamCount = 0;
var camKeys = Object.keys(cameras);
for (var cki = 0; cki < camKeys.length; cki++) {
  if (cameras[camKeys[cki]] > topCamCount) {
    topCamera = camKeys[cki];
    topCamCount = cameras[camKeys[cki]];
  }
}

// Build milestone record
var milestone = {
  title: "First Album Complete!",
  photosSelected: keptPhotos.length,
  totalLibrary: albumState.totalScanned || 0,
  dateRange: dateRange,
  estimatedDelivery: "7–10 business days",
  completedAt: new Date().toISOString(),
  topCamera: topCamera,
  albumSpec: albumState.albumSpec || {},
  coverPhoto: null,
  folder: albumState.folder || ""
};

// Find cover photo (highest rated)
var highestRating = 0;
for (var hi = 0; hi < keptPhotos.length; hi++) {
  if ((keptPhotos[hi].rating || 0) > highestRating) {
    highestRating = keptPhotos[hi].rating;
    milestone.coverPhoto = {
      name: keptPhotos[hi].name,
      mediaUrl: keptPhotos[hi].mediaUrl,
      description: keptPhotos[hi].description
    };
  }
}
if (!milestone.coverPhoto && keptPhotos.length > 0) {
  milestone.coverPhoto = {
    name: keptPhotos[0].name,
    mediaUrl: keptPhotos[0].mediaUrl,
    description: keptPhotos[0].description
  };
}

// Gift suggestion
var giftSuggestion = "";
if (recipientName) {
  giftSuggestion = "This album would make a wonderful gift for " + recipientName + "! When it arrives, wrap it in tissue paper and add a personal note about why you chose these moments.";
} else {
  giftSuggestion = "Consider gifting this album to someone special — a travel companion, a close friend, or a family member. A printed photo book is one of the most meaningful gifts you can give.";
}

// Inspirational stats
var selectionRatio = milestone.totalLibrary > 0
  ? (keptPhotos.length / milestone.totalLibrary * 100).toFixed(3)
  : "0";

var funFacts = [
  "You curated " + keptPhotos.length + " photos from " + milestone.totalLibrary + " — that's the top " + selectionRatio + "% of your entire collection!",
  "Ansel Adams said: 'Twelve significant photographs in any one year is a good crop.' You just proved it.",
  "Every photo in this album earned its place through your personal judgment — that's what makes it art."
];

// Record the milestone in store for posterity
var completedAlbums = await ctx.store.get("completedAlbums") || [];
completedAlbums.push({
  completedAt: milestone.completedAt,
  photoCount: keptPhotos.length,
  folder: milestone.folder,
  dateRange: dateRange,
  recipient: recipientName || null
});
await ctx.store.set("completedAlbums", completedAlbums);

// Update album state
albumState.status = "celebrated";
albumState.celebratedAt = Date.now();
albumState.recipient = recipientName;
await ctx.store.set("albumState", albumState);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_micro_album_celebrate",
      status: "celebrated",
      milestone: milestone,
      giftSuggestion: giftSuggestion,
      funFacts: funFacts,
      keptPhotos: keptPhotos,
      recipient: recipientName || null,
      totalAlbumsCompleted: completedAlbums.length,
      nextSteps: [
        "Track your delivery at printique.com/orders",
        "While you wait, browse your photos for album #2!",
        recipientName
          ? "Plan a special moment to give " + recipientName + " their album"
          : "Think about who you'd like to gift your next album to"
      ]
    })
  }]
};

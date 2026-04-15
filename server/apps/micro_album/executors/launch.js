// Micro Album Launch — The magic button
// Scans a photo folder, auto-selects 20 best candidates, all decisions pre-made

var folder = (params.folder || "").trim();
var candidateCount = params.count || 20;

// ── Path normalization ──
if (folder && folder.charAt(0) !== '/' && folder.charAt(0) !== '~' && !/^[A-Z]:/i.test(folder)) {
  if (folder.indexOf('/') > 0) {
    folder = '/' + folder;
  }
}

// Default to common photo directories
if (!folder) {
  // Try to find a default photo path
  var homeDir = "";
  try {
    var homeResult = await ctx.callTool("enso_media_browse_folder", { path: "~" });
    if (homeResult.success) {
      var homeData = homeResult.data;
      if (typeof homeData === "string") {
        try { homeData = JSON.parse(homeData); } catch(e) { homeData = {}; }
      }
      homeDir = homeData.path || "";
    }
  } catch(e) {}

  // Try common photo locations
  var tryPaths = [];
  if (homeDir) {
    tryPaths.push(homeDir + "/Pictures");
    tryPaths.push(homeDir + "/Photos");
    tryPaths.push(homeDir + "/OneDrive/Pictures");
  }
  tryPaths.push("D:/Photos");
  tryPaths.push("C:/Users/Administrator/Pictures");

  for (var pi = 0; pi < tryPaths.length; pi++) {
    var testResult = await ctx.callTool("enso_media_browse_folder", { path: tryPaths[pi] });
    if (testResult.success) {
      var testData = testResult.data;
      if (typeof testData === "string") {
        try { testData = JSON.parse(testData); } catch(e) { testData = {}; }
      }
      var testItems = testData.items || [];
      var hasPhotos = false;
      for (var ti = 0; ti < testItems.length; ti++) {
        if (testItems[ti].type === "image") { hasPhotos = true; break; }
      }
      if (hasPhotos || testItems.length > 0) {
        folder = tryPaths[pi];
        break;
      }
    }
  }

  if (!folder) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_micro_album_launch",
          error: "No photo folder found. Please specify a folder path containing your photos.",
          suggestion: "Try: D:/Photos or C:/Users/YourName/Pictures"
        })
      }]
    };
  }
}

// Browse the folder for photos
var browseResult = await ctx.callTool("enso_media_browse_folder", {
  path: folder,
  sortBy: "date",
  sortDir: "desc"
});

if (!browseResult.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_launch",
        error: browseResult.error || "Failed to scan photo folder",
        path: folder
      })
    }]
  };
}

var browseData = browseResult.data;
if (typeof browseData === "string") {
  try { browseData = JSON.parse(browseData); } catch(e) { browseData = {}; }
}

var allItems = browseData.items || [];
var photos = [];

// Filter to images only
for (var i = 0; i < allItems.length; i++) {
  if (allItems[i].type === "image") {
    photos.push(allItems[i]);
  }
}

if (photos.length === 0) {
  // Check if there are subfolders to suggest
  var subfolders = [];
  for (var si = 0; si < allItems.length; si++) {
    if (allItems[si].type === "folder" || allItems[si].type === "directory") {
      subfolders.push(allItems[si]);
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_launch",
        error: "No photos found in this folder.",
        path: folder,
        subfolders: subfolders.slice(0, 10).map(function(sf) {
          return { name: sf.name, path: sf.path };
        }),
        suggestion: subfolders.length > 0
          ? "This folder has " + subfolders.length + " subfolders. Try one of them!"
          : "Try a different folder path."
      })
    }]
  };
}

// ── Scoring & Selection ──
// Score each photo for album candidacy
var scored = [];
for (var j = 0; j < photos.length; j++) {
  var photo = photos[j];
  var score = 0;
  var exif = photo.exif || {};

  // Rating weight (0-25 points)
  var rating = photo.rating || 0;
  score += rating * 5;

  // Favorite bonus (10 points)
  if (photo.isFavorite) score += 10;

  // Resolution quality (0-15 points) — higher res = more print-ready
  var maxDim = Math.max(exif.width || 0, exif.height || 0);
  if (maxDim >= 3840) score += 15;
  else if (maxDim >= 2560) score += 12;
  else if (maxDim >= 1920) score += 8;
  else if (maxDim >= 1280) score += 4;

  // Has EXIF date (5 points) — indicates proper photo, not screenshot
  var dateTaken = exif.dateTaken || photo.modifiedAt || "";
  if (dateTaken) score += 5;

  // Has camera info (3 points) — real camera, not phone screenshot
  if (exif.cameraMake || exif.cameraModel) score += 3;

  // Has AI description (2 points) — previously analyzed, likely quality
  if (photo.aiDescription) score += 2;

  scored.push({
    photo: photo,
    score: score,
    dateTaken: dateTaken,
    dateTs: dateTaken ? new Date(dateTaken).getTime() : 0
  });
}

// Sort by score descending
scored.sort(function(a, b) { return b.score - a.score; });

// Take top candidates, but ensure date diversity
var selected = [];
var usedMonths = {};
var topPool = scored.slice(0, Math.min(scored.length, candidateCount * 3));

// First pass: pick highest-scored with date diversity
for (var k = 0; k < topPool.length && selected.length < candidateCount; k++) {
  var candidate = topPool[k];
  var monthKey = "";
  if (candidate.dateTs > 0) {
    var d = new Date(candidate.dateTs);
    monthKey = d.getFullYear() + "-" + (d.getMonth() + 1);
  }

  // Allow max 4 photos from same month for diversity
  if (monthKey && usedMonths[monthKey] && usedMonths[monthKey] >= 4) {
    continue;
  }

  selected.push(candidate);
  if (monthKey) {
    usedMonths[monthKey] = (usedMonths[monthKey] || 0) + 1;
  }
}

// If we still need more, fill from remaining
if (selected.length < candidateCount) {
  for (var m = 0; m < topPool.length && selected.length < candidateCount; m++) {
    var alreadySelected = false;
    for (var n = 0; n < selected.length; n++) {
      if (selected[n].photo.path === topPool[m].photo.path) {
        alreadySelected = true;
        break;
      }
    }
    if (!alreadySelected) {
      selected.push(topPool[m]);
    }
  }
}

// Generate AI descriptions for photos that don't have them
var candidates = [];
for (var ci = 0; ci < selected.length; ci++) {
  var sel = selected[ci];
  var p = sel.photo;
  var desc = p.aiDescription || "";

  // If no AI description, try to generate one from metadata
  if (!desc) {
    var descParts = [];
    var ex = p.exif || {};
    if (ex.cameraMake || ex.cameraModel) {
      descParts.push("Shot with " + ((ex.cameraMake || "") + " " + (ex.cameraModel || "")).trim());
    }
    if (ex.focalLength) descParts.push(ex.focalLength + "mm");
    if (ex.fNumber) descParts.push("f/" + ex.fNumber);
    if (sel.dateTaken) {
      try {
        var dt = new Date(sel.dateTaken);
        if (!isNaN(dt.getTime())) {
          descParts.push(dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
        }
      } catch(e) {}
    }
    desc = descParts.length > 0 ? descParts.join(" · ") : "Photo from your collection";
  }

  candidates.push({
    index: ci,
    path: p.path,
    name: p.name,
    mediaUrl: p.mediaUrl,
    thumbnailUrl: p.thumbnailUrl || p.mediaUrl,
    rating: p.rating || 0,
    isFavorite: p.isFavorite || false,
    dateTaken: sel.dateTaken || "",
    camera: ((p.exif || {}).cameraMake || "") + " " + ((p.exif || {}).cameraModel || ""),
    description: desc,
    score: sel.score,
    width: (p.exif || {}).width || 0,
    height: (p.exif || {}).height || 0
  });
}

// Pre-decided album specifications
var albumSpec = {
  size: "10x10 inches",
  pages: 24,
  printer: "Printique",
  paper: "Lustre",
  theme: "My Best Shots",
  targetPhotos: 12,
  layout: "Full-bleed spreads"
};

// Store candidates and album state for curation
var albumState = {
  candidates: candidates,
  albumSpec: albumSpec,
  kept: [],
  skipped: [],
  currentIndex: 0,
  status: "candidates_ready",
  folder: folder,
  totalScanned: photos.length,
  createdAt: Date.now()
};

await ctx.store.set("albumState", albumState);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_micro_album_launch",
      status: "candidates_ready",
      albumSpec: albumSpec,
      candidates: candidates,
      totalScanned: photos.length,
      totalInFolder: allItems.length,
      folder: folder,
      selectionCriteria: "Rated 4-5 stars first, then favorites, date diversity (max 4 per month), resolution quality, EXIF completeness"
    })
  }]
};

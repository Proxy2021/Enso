// Micro Album Curate — Simple keep/skip interface
// Shows one photo at a time, target: 12 kept photos

var action = (params.action || "start").trim().toLowerCase();
var photoIndex = (typeof params.photoIndex === "number") ? params.photoIndex : -1;

// Load album state
var albumState = await ctx.store.get("albumState");

if (!albumState || !albumState.candidates || albumState.candidates.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_curate",
        status: "no_candidates",
        error: "No album in progress. Launch a new album first!",
        suggestion: "Use the Launch tool to scan your photos and start a new album."
      })
    }]
  };
}

var candidates = albumState.candidates;
var kept = albumState.kept || [];
var skipped = albumState.skipped || [];
var currentIndex = albumState.currentIndex || 0;
var target = albumState.albumSpec.targetPhotos || 12;
var reconsidering = albumState.reconsidering || false;

// Handle actions
if (action === "keep" && photoIndex >= 0) {
  // Mark photo as kept
  var alreadyKept = false;
  for (var ki = 0; ki < kept.length; ki++) {
    if (kept[ki] === photoIndex) { alreadyKept = true; break; }
  }
  if (!alreadyKept) {
    kept.push(photoIndex);
    // Remove from skipped if it was there (reconsideration)
    var newSkipped = [];
    for (var rsi = 0; rsi < skipped.length; rsi++) {
      if (skipped[rsi] !== photoIndex) newSkipped.push(skipped[rsi]);
    }
    skipped = newSkipped;
  }

  // Check if we've hit target
  if (kept.length >= target) {
    albumState.kept = kept;
    albumState.skipped = skipped;
    albumState.status = "curation_complete";
    albumState.completedAt = Date.now();
    await ctx.store.set("albumState", albumState);

    // Build the kept photos list for display
    var keptPhotos = [];
    for (var kpi = 0; kpi < kept.length; kpi++) {
      if (kept[kpi] < candidates.length) {
        keptPhotos.push(candidates[kept[kpi]]);
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_micro_album_curate",
          status: "album_ready",
          message: "Your album is ready! You've selected " + kept.length + " beautiful photos.",
          keptPhotos: keptPhotos,
          progress: {
            reviewed: kept.length + skipped.length,
            kept: kept.length,
            skipped: skipped.length,
            remaining: 0,
            target: target
          }
        })
      }]
    };
  }

  // Move to next unreviewed photo
  currentIndex = photoIndex + 1;
} else if (action === "skip" && photoIndex >= 0) {
  // Mark photo as skipped
  var alreadySkipped = false;
  for (var si = 0; si < skipped.length; si++) {
    if (skipped[si] === photoIndex) { alreadySkipped = true; break; }
  }
  if (!alreadySkipped) {
    skipped.push(photoIndex);
  }
  currentIndex = photoIndex + 1;
} else if (action === "reconsider") {
  // Show skipped photos again for reconsideration
  reconsidering = true;
  albumState.reconsidering = true;
  currentIndex = 0;
}

// Find next photo to show
var nextPhoto = null;
var nextIndex = -1;

if (reconsidering) {
  // During reconsideration, show skipped photos
  for (var ri = 0; ri < skipped.length; ri++) {
    var skipIdx = skipped[ri];
    // Check if it's already been kept during reconsideration
    var wasKeptNow = false;
    for (var rki = 0; rki < kept.length; rki++) {
      if (kept[rki] === skipIdx) { wasKeptNow = true; break; }
    }
    if (!wasKeptNow) {
      nextPhoto = candidates[skipIdx];
      nextIndex = skipIdx;
      break;
    }
  }

  // If no more skipped photos to reconsider
  if (!nextPhoto) {
    reconsidering = false;
    albumState.reconsidering = false;
  }
} else {
  // Normal flow — find next unreviewed candidate
  for (var fi = currentIndex; fi < candidates.length; fi++) {
    var isKept = false;
    var isSkipped = false;
    for (var fki = 0; fki < kept.length; fki++) {
      if (kept[fki] === fi) { isKept = true; break; }
    }
    for (var fsi = 0; fsi < skipped.length; fsi++) {
      if (skipped[fsi] === fi) { isSkipped = true; break; }
    }
    if (!isKept && !isSkipped) {
      nextPhoto = candidates[fi];
      nextIndex = fi;
      currentIndex = fi;
      break;
    }
  }
}

// Save state
albumState.kept = kept;
albumState.skipped = skipped;
albumState.currentIndex = currentIndex;
albumState.reconsidering = reconsidering;
await ctx.store.set("albumState", albumState);

// All candidates reviewed but haven't hit target
if (!nextPhoto && kept.length < target) {
  if (skipped.length > 0 && !reconsidering) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_micro_album_curate",
          status: "needs_reconsideration",
          message: "You've reviewed all " + candidates.length + " photos but only kept " + kept.length + " of " + target + " needed. Let's reconsider some skipped ones!",
          progress: {
            reviewed: kept.length + skipped.length,
            kept: kept.length,
            skipped: skipped.length,
            remaining: target - kept.length,
            target: target
          },
          keptPhotos: kept.map(function(ki) { return candidates[ki]; })
        })
      }]
    };
  } else {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_micro_album_curate",
          status: "insufficient",
          message: "Only " + kept.length + " photos kept. You need " + target + ". Consider launching with a different folder for more candidates.",
          progress: {
            reviewed: kept.length + skipped.length,
            kept: kept.length,
            skipped: skipped.length,
            remaining: target - kept.length,
            target: target
          },
          keptPhotos: kept.map(function(ki) { return candidates[ki]; })
        })
      }]
    };
  }
}

// Already complete
if (kept.length >= target) {
  var completedKeptPhotos = [];
  for (var cki = 0; cki < kept.length; cki++) {
    if (kept[cki] < candidates.length) {
      completedKeptPhotos.push(candidates[kept[cki]]);
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_curate",
        status: "album_ready",
        message: "Your album is ready! " + kept.length + " photos selected.",
        keptPhotos: completedKeptPhotos,
        progress: {
          reviewed: kept.length + skipped.length,
          kept: kept.length,
          skipped: skipped.length,
          remaining: 0,
          target: target
        }
      })
    }]
  };
}

// Return the current photo for review
var reviewed = kept.length + skipped.length;
var remaining = candidates.length - reviewed;

// Encouraging messages based on progress
var encouragement = "";
if (kept.length === 0) {
  encouragement = "Let's find your best shots! Keep or skip each photo.";
} else if (kept.length < 4) {
  encouragement = "Great start! " + kept.length + " keeper" + (kept.length > 1 ? "s" : "") + " so far.";
} else if (kept.length < 8) {
  encouragement = "You're building something beautiful! " + (target - kept.length) + " more to go.";
} else if (kept.length < target) {
  encouragement = "Almost there! Just " + (target - kept.length) + " more picks needed!";
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_micro_album_curate",
      status: reconsidering ? "reconsidering" : "reviewing",
      currentPhoto: nextPhoto,
      photoIndex: nextIndex,
      encouragement: encouragement,
      progress: {
        reviewed: reviewed,
        kept: kept.length,
        skipped: skipped.length,
        remaining: remaining,
        target: target
      }
    })
  }]
};

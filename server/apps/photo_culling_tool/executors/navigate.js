// navigate.js — Move between groups and images in the culling session.
// Directions: next_group, prev_group, next_image, prev_image, jump_group

var fs = require("fs");

var direction = (params.direction || "").trim();
var targetIndex = typeof params.targetIndex === "number" ? params.targetIndex : null;

var VALID_DIRECTIONS = ["next_group", "prev_group", "next_image", "prev_image", "jump_group"];
if (!direction || VALID_DIRECTIONS.indexOf(direction) === -1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_navigate",
        error: "direction is required. Valid: " + VALID_DIRECTIONS.join(", ")
      })
    }]
  };
}

// Load session
var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_navigate",
        error: "No active session. Run scan first."
      })
    }]
  };
}

var session;
try {
  session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_navigate",
        error: "Failed to load session: " + e.message
      })
    }]
  };
}

var gi = session.currentGroupIndex || 0;
var ii = session.currentImageIndex || 0;
var totalGroups = session.groups.length;

if (direction === "next_group") {
  gi = Math.min(gi + 1, totalGroups - 1);
  ii = 0;
} else if (direction === "prev_group") {
  gi = Math.max(gi - 1, 0);
  ii = 0;
} else if (direction === "jump_group") {
  if (targetIndex != null) {
    gi = Math.max(0, Math.min(targetIndex, totalGroups - 1));
    ii = 0;
  }
} else if (direction === "next_image") {
  var maxImg = session.groups[gi].images.length - 1;
  if (ii < maxImg) {
    ii++;
  } else if (gi < totalGroups - 1) {
    // Wrap to next group's first image
    gi++;
    ii = 0;
  }
} else if (direction === "prev_image") {
  if (ii > 0) {
    ii--;
  } else if (gi > 0) {
    // Wrap to prev group's last image
    gi--;
    ii = session.groups[gi].images.length - 1;
  }
}

session.currentGroupIndex = gi;
session.currentImageIndex = ii;

// Save updated cursor
try {
  var tempPath = sessionPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8");
  fs.renameSync(tempPath, sessionPath);
} catch (e) { /* non-fatal */ }

var currentGroup = session.groups[gi];
var currentImage = currentGroup.images[Math.min(ii, currentGroup.images.length - 1)];

// Compute stats and group overview for full culling view
var approved = 0, rejected = 0, flagged = 0, pending = 0;
for (var sg = 0; sg < session.groups.length; sg++) {
  for (var sgi = 0; sgi < session.groups[sg].images.length; sgi++) {
    var st = session.groups[sg].images[sgi].status;
    if (st === "approved") approved++;
    else if (st === "rejected") rejected++;
    else if (st === "flagged") flagged++;
    else pending++;
  }
}

var groupOverview = session.groups.map(function(grp, idx) {
  var gApproved = 0, gRejected = 0, gFlagged = 0, gPending = 0, gBlurCount = 0;
  var sharpestFile = null;
  for (var j = 0; j < grp.images.length; j++) {
    var stt = grp.images[j].status;
    if (stt === "approved") gApproved++;
    else if (stt === "rejected") gRejected++;
    else if (stt === "flagged") gFlagged++;
    else gPending++;
    if (grp.images[j].blurFlag) gBlurCount++;
    if (grp.images[j].isSharpest) sharpestFile = grp.images[j].filename;
  }
  var decided = gApproved + gRejected + gFlagged;
  var completion = gPending === 0 ? "done" : (decided > 0 ? "partial" : "pending");
  return { groupId: grp.groupId, imageCount: grp.imageCount, groupType: grp.groupType, completion: completion, isActive: idx === gi, approved: gApproved, rejected: gRejected, flagged: gFlagged, pending: gPending, blurCount: gBlurCount, sharpestFile: sharpestFile };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_culling_tool_navigate",
      direction: direction,
      currentGroupIndex: gi,
      currentImageIndex: ii,
      totalGroups: totalGroups,
      totalImages: session.totalImages,
      folderPath: session.folderPath,
      stats: { approved: approved, rejected: rejected, flagged: flagged, pending: pending },
      currentGroup: currentGroup,
      currentImage: currentImage,
      groupOverview: groupOverview
    })
  }]
};

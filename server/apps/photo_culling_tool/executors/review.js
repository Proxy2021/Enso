// review.js — View current group with burst strip, sharpness scores, face flags.
// Returns the current group data for the culling UI.

var fs = require("fs");
var path = require("path");

var sessionId = (params.sessionId || "").trim();
var groupIndex = typeof params.groupIndex === "number" ? params.groupIndex : null;
var imageIndex = typeof params.imageIndex === "number" ? params.imageIndex : null;

// Load session from disk
var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_review",
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
        tool: "enso_photo_culling_tool_review",
        error: "Failed to load session: " + e.message
      })
    }]
  };
}

// Update cursor if specified
if (groupIndex != null) session.currentGroupIndex = Math.max(0, Math.min(groupIndex, session.groups.length - 1));
if (imageIndex != null) session.currentImageIndex = imageIndex;

var gi = session.currentGroupIndex || 0;
var ii = session.currentImageIndex || 0;

if (gi >= session.groups.length) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_review",
        error: "No groups in session.",
        totalGroups: session.groups.length
      })
    }]
  };
}

var currentGroup = session.groups[gi];
ii = Math.max(0, Math.min(ii, currentGroup.images.length - 1));
var currentImage = currentGroup.images[ii];

// Compute stats
var approved = 0, rejected = 0, flagged = 0, pending = 0;
for (var g = 0; g < session.groups.length; g++) {
  for (var im = 0; im < session.groups[g].images.length; im++) {
    var s = session.groups[g].images[im].status;
    if (s === "approved") approved++;
    else if (s === "rejected") rejected++;
    else if (s === "flagged") flagged++;
    else pending++;
  }
}

// Build group overview for sidebar with rich stats
var groupOverview = session.groups.map(function(grp, idx) {
  var gApproved = 0, gRejected = 0, gFlagged = 0, gPending = 0, gBlurCount = 0;
  var sharpestFile = null;
  for (var j = 0; j < grp.images.length; j++) {
    var st = grp.images[j].status;
    if (st === "approved") gApproved++;
    else if (st === "rejected") gRejected++;
    else if (st === "flagged") gFlagged++;
    else gPending++;
    if (grp.images[j].blurFlag) gBlurCount++;
    if (grp.images[j].isSharpest) sharpestFile = grp.images[j].filename;
  }
  var decided = gApproved + gRejected + gFlagged;
  var completion = gPending === 0 ? "done" : (decided > 0 ? "partial" : "pending");
  return {
    groupId: grp.groupId,
    imageCount: grp.imageCount,
    groupType: grp.groupType,
    completion: completion,
    isActive: idx === gi,
    approved: gApproved,
    rejected: gRejected,
    flagged: gFlagged,
    pending: gPending,
    blurCount: gBlurCount,
    sharpestFile: sharpestFile
  };
});

// Save cursor to disk
try {
  session.currentGroupIndex = gi;
  session.currentImageIndex = ii;
  var tempPath = sessionPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8");
  fs.renameSync(tempPath, sessionPath);
} catch (e) { /* non-fatal */ }

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_culling_tool_review",
      sessionId: session.sessionId,
      folderPath: session.folderPath,
      currentGroupIndex: gi,
      currentImageIndex: ii,
      totalGroups: session.groups.length,
      totalImages: session.totalImages,
      stats: { approved: approved, rejected: rejected, flagged: flagged, pending: pending },
      currentGroup: currentGroup,
      currentImage: currentImage,
      groupOverview: groupOverview
    })
  }]
};

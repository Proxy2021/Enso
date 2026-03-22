// decide.js — Set approve/reject/flag/skip status on images, with undo support.
// Actions: approve, reject, flag, skip, undo, approve_group, reject_group

var fs = require("fs");

var action = (params.action || "").trim();
var imagePath = (params.imagePath || "").trim();
var groupId = (params.groupId || "").trim();

var VALID_ACTIONS = ["approve", "reject", "flag", "skip", "undo", "approve_group", "reject_group"];
if (!action || VALID_ACTIONS.indexOf(action) === -1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_decide",
        error: "action is required. Valid actions: " + VALID_ACTIONS.join(", ")
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
        tool: "enso_photo_culling_tool_decide",
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
        tool: "enso_photo_culling_tool_decide",
        error: "Failed to load session: " + e.message
      })
    }]
  };
}

var gi = session.currentGroupIndex || 0;
var ii = session.currentImageIndex || 0;
var undoEntry = null;
var message = "";

if (action === "undo") {
  // Pop the last action from the undo stack
  if (!session.undoStack || session.undoStack.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_photo_culling_tool_decide",
          error: "Nothing to undo"
        })
      }]
    };
  }

  var lastAction = session.undoStack.pop();
  // Revert statuses
  for (var ui = 0; ui < lastAction.imagePaths.length; ui++) {
    var undoPath = lastAction.imagePaths[ui];
    var prevStatus = lastAction.previousStatuses[ui];
    for (var ug = 0; ug < session.groups.length; ug++) {
      for (var uj = 0; uj < session.groups[ug].images.length; uj++) {
        if (session.groups[ug].images[uj].path === undoPath) {
          session.groups[ug].images[uj].status = prevStatus;
          session.groups[ug].images[uj].decidedAt = null;
        }
      }
    }
  }
  message = "Undid " + lastAction.action + " on " + lastAction.imagePaths.length + " image(s)";

} else if (action === "approve_group" || action === "reject_group") {
  // Group-level actions
  var targetGi = gi;
  if (groupId) {
    for (var fg = 0; fg < session.groups.length; fg++) {
      if (session.groups[fg].groupId === groupId) { targetGi = fg; break; }
    }
  }

  var grp = session.groups[targetGi];
  if (!grp) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_photo_culling_tool_decide",
          error: "Group not found"
        })
      }]
    };
  }

  undoEntry = {
    action: action,
    timestamp: Date.now(),
    imagePaths: [],
    previousStatuses: [],
    newStatuses: []
  };

  for (var gai = 0; gai < grp.images.length; gai++) {
    undoEntry.imagePaths.push(grp.images[gai].path);
    undoEntry.previousStatuses.push(grp.images[gai].status);

    if (action === "approve_group") {
      // Sharpest = approved, rest = rejected
      var newStatus = grp.images[gai].isSharpest ? "approved" : "rejected";
      grp.images[gai].status = newStatus;
      undoEntry.newStatuses.push(newStatus);
    } else {
      grp.images[gai].status = "rejected";
      undoEntry.newStatuses.push("rejected");
    }
    grp.images[gai].decidedAt = Date.now();
  }

  message = action === "approve_group"
    ? "Approved sharpest, rejected " + (grp.images.length - 1) + " others in " + grp.groupId
    : "Rejected all " + grp.images.length + " images in " + grp.groupId;

} else {
  // Single image action: approve, reject, skip
  var currentGroup = session.groups[gi];
  if (!currentGroup || ii >= currentGroup.images.length) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_photo_culling_tool_decide",
          error: "Invalid group/image index"
        })
      }]
    };
  }

  var targetImg = currentGroup.images[ii];

  // Find by imagePath if specified
  if (imagePath) {
    for (var si = 0; si < currentGroup.images.length; si++) {
      if (currentGroup.images[si].path === imagePath) {
        targetImg = currentGroup.images[si];
        ii = si;
        break;
      }
    }
  }

  undoEntry = {
    action: action,
    timestamp: Date.now(),
    imagePaths: [targetImg.path],
    previousStatuses: [targetImg.status],
    newStatuses: [action === "skip" ? "pending" : action === "approve" ? "approved" : action === "flag" ? "flagged" : "rejected"]
  };

  if (action === "skip") {
    targetImg.status = "pending";
  } else if (action === "flag") {
    targetImg.status = "flagged";
  } else {
    targetImg.status = action === "approve" ? "approved" : "rejected";
  }
  targetImg.decidedAt = Date.now();
  var pastTense = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : action === "flag" ? "Flagged" : "Skipped";
  message = pastTense + " " + targetImg.filename;
}

// Push undo entry
if (undoEntry) {
  if (!session.undoStack) session.undoStack = [];
  session.undoStack.push(undoEntry);
  // Limit undo stack to 100 entries
  if (session.undoStack.length > 100) session.undoStack.shift();
}

// Auto-advance cursor to next pending
if (action !== "undo") {
  var advanced = false;
  var cg = session.groups[gi];

  // Try next pending in current group
  for (var ni = ii + 1; ni < cg.images.length; ni++) {
    if (cg.images[ni].status === "pending") {
      session.currentImageIndex = ni;
      advanced = true;
      break;
    }
  }

  // If all in group done, advance to next group with pending
  if (!advanced) {
    for (var ng = gi + 1; ng < session.groups.length; ng++) {
      for (var ngi = 0; ngi < session.groups[ng].images.length; ngi++) {
        if (session.groups[ng].images[ngi].status === "pending") {
          session.currentGroupIndex = ng;
          session.currentImageIndex = ngi;
          advanced = true;
          break;
        }
      }
      if (advanced) break;
    }
  }

  // If still not advanced, wrap around
  if (!advanced) {
    session.currentGroupIndex = gi;
    session.currentImageIndex = ii;
  }
}

// Recompute stats
var approved = 0, rejected = 0, flagged = 0, pending = 0, blurFlagged = 0, eyesClosedFlagged = 0;
for (var sg = 0; sg < session.groups.length; sg++) {
  for (var sgi = 0; sgi < session.groups[sg].images.length; sgi++) {
    var st = session.groups[sg].images[sgi].status;
    if (st === "approved") approved++;
    else if (st === "rejected") rejected++;
    else if (st === "flagged") flagged++;
    else pending++;
    if (session.groups[sg].images[sgi].blurFlag) blurFlagged++;
    if (session.groups[sg].images[sgi].eyesClosedFlag) eyesClosedFlagged++;
  }
}
session.stats = { approved: approved, rejected: rejected, flagged: flagged, pending: pending, blurFlagged: blurFlagged, eyesClosedFlagged: eyesClosedFlagged };

// Save session
try {
  var tempPath = sessionPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8");
  fs.renameSync(tempPath, sessionPath);
} catch (e) { /* non-fatal */ }

var allDone = pending === 0;

// Build group overview for sidebar (lightweight but info-rich)
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
  return { groupId: grp.groupId, imageCount: grp.imageCount, groupType: grp.groupType, completion: completion, isActive: idx === session.currentGroupIndex, approved: gApproved, rejected: gRejected, flagged: gFlagged, pending: gPending, blurCount: gBlurCount, sharpestFile: sharpestFile };
});

var curGroup = session.groups[session.currentGroupIndex];
var curImage = curGroup ? curGroup.images[Math.min(session.currentImageIndex, curGroup.images.length - 1)] : null;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_culling_tool_decide",
      action: action,
      updated: true,
      message: message,
      stats: session.stats,
      currentGroupIndex: session.currentGroupIndex,
      currentImageIndex: session.currentImageIndex,
      totalGroups: session.groups.length,
      totalImages: session.totalImages,
      folderPath: session.folderPath,
      currentGroup: curGroup,
      currentImage: curImage,
      groupOverview: groupOverview,
      allDecided: allDone,
      completionPercent: session.totalImages > 0 ? Math.round(((approved + rejected + flagged) / session.totalImages) * 100) : 0
    })
  }]
};

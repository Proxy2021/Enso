// review_session.js — Combined review, navigation, and decision executor.
// Handles: load review state, navigate (next/prev image/group), decide (keep/reject/unmark/undo).

var fs = require("fs");

var action = (params.action || "").trim();
var direction = (params.direction || "").trim();
var groupIndex = typeof params.groupIndex === "number" ? params.groupIndex : null;
var imageIndex = typeof params.imageIndex === "number" ? params.imageIndex : null;
var TOOL = "enso_photo_culling_tool_review_session";

// Load session
var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "No active session. Run scan_folder first." }) }] };
}

var session;
try { session = JSON.parse(fs.readFileSync(sessionPath, "utf-8")); } catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Failed to load session: " + e.message }) }] };
}

var gi = session.currentGroupIndex || 0;
var ii = session.currentImageIndex || 0;
var message = "";
var actionTaken = null;

// Handle jump to specific position
if (groupIndex != null && !action && !direction) {
  gi = Math.max(0, Math.min(groupIndex, session.groups.length - 1));
  ii = imageIndex != null ? imageIndex : 0;
}

// Handle navigation
if (direction) {
  var VALID_DIRS = ["next_image", "prev_image", "next_group", "prev_group", "jump_group"];
  if (VALID_DIRS.indexOf(direction) === -1) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Invalid direction. Valid: " + VALID_DIRS.join(", ") }) }] };
  }

  if (direction === "next_group") { gi = Math.min(gi + 1, session.groups.length - 1); ii = 0; }
  else if (direction === "prev_group") { gi = Math.max(gi - 1, 0); ii = 0; }
  else if (direction === "jump_group" && groupIndex != null) { gi = Math.max(0, Math.min(groupIndex, session.groups.length - 1)); ii = 0; }
  else if (direction === "next_image") {
    var maxImg = session.groups[gi].images.length - 1;
    if (ii < maxImg) { ii++; } else if (gi < session.groups.length - 1) { gi++; ii = 0; }
  } else if (direction === "prev_image") {
    if (ii > 0) { ii--; } else if (gi > 0) { gi--; ii = session.groups[gi].images.length - 1; }
  }
  message = "Group " + (gi + 1) + " of " + session.groups.length + ", image " + (ii + 1);
}

// Handle decisions
if (action) {
  var VALID_ACTIONS = ["keep", "reject", "unmark", "undo", "keep_group", "reject_group"];
  if (VALID_ACTIONS.indexOf(action) === -1) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Invalid action. Valid: " + VALID_ACTIONS.join(", ") }) }] };
  }
  actionTaken = action;

  if (action === "undo") {
    if (!session.undoStack || session.undoStack.length === 0) {
      message = "Nothing to undo";
    } else {
      var lastAction = session.undoStack.pop();
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
      // Return cursor to undone image
      if (lastAction.groupIndex != null) gi = lastAction.groupIndex;
      if (lastAction.imageIndex != null) ii = lastAction.imageIndex;
      message = "Undid " + lastAction.action + " on " + lastAction.imagePaths.length + " image(s)";
    }

  } else if (action === "keep_group" || action === "reject_group") {
    var grp = session.groups[gi];
    if (grp) {
      var undoEntry = { action: action, timestamp: Date.now(), imagePaths: [], previousStatuses: [], groupIndex: gi, imageIndex: ii };
      for (var gai = 0; gai < grp.images.length; gai++) {
        undoEntry.imagePaths.push(grp.images[gai].path);
        undoEntry.previousStatuses.push(grp.images[gai].status);
        if (action === "keep_group") {
          grp.images[gai].status = grp.images[gai].isSharpest ? "approved" : "rejected";
        } else {
          grp.images[gai].status = "rejected";
        }
        grp.images[gai].decidedAt = Date.now();
      }
      if (!session.undoStack) session.undoStack = [];
      session.undoStack.push(undoEntry);
      if (session.undoStack.length > 100) session.undoStack.shift();
      message = action === "keep_group" ? "Kept sharpest, rejected " + (grp.images.length - 1) + " others" : "Rejected all " + grp.images.length + " in group";
    }

  } else {
    // Single image: keep, reject, unmark
    var currentGrp = session.groups[gi];
    if (currentGrp && ii < currentGrp.images.length) {
      var targetImg = currentGrp.images[ii];
      var undoEntry = { action: action, timestamp: Date.now(), imagePaths: [targetImg.path], previousStatuses: [targetImg.status], groupIndex: gi, imageIndex: ii };

      if (action === "keep") { targetImg.status = "approved"; }
      else if (action === "reject") { targetImg.status = "rejected"; }
      else if (action === "unmark") { targetImg.status = "pending"; }
      targetImg.decidedAt = action === "unmark" ? null : Date.now();

      if (!session.undoStack) session.undoStack = [];
      session.undoStack.push(undoEntry);
      if (session.undoStack.length > 100) session.undoStack.shift();

      var pastTense = action === "keep" ? "Kept" : action === "reject" ? "Rejected" : "Unmarked";
      message = pastTense + " " + targetImg.filename;

      // Auto-advance to next pending (only for keep/reject, not unmark)
      if (action !== "unmark") {
        var advanced = false;
        for (var ni = ii + 1; ni < currentGrp.images.length; ni++) {
          if (currentGrp.images[ni].status === "pending") { ii = ni; advanced = true; break; }
        }
        if (!advanced) {
          for (var ng = gi + 1; ng < session.groups.length; ng++) {
            for (var ngi = 0; ngi < session.groups[ng].images.length; ngi++) {
              if (session.groups[ng].images[ngi].status === "pending") { gi = ng; ii = ngi; advanced = true; break; }
            }
            if (advanced) break;
          }
        }
      }
    }
  }
}

// Clamp indices
gi = Math.max(0, Math.min(gi, session.groups.length - 1));
var currentGroup = session.groups[gi];
ii = Math.max(0, Math.min(ii, currentGroup ? currentGroup.images.length - 1 : 0));
var currentImage = currentGroup ? currentGroup.images[ii] : null;

session.currentGroupIndex = gi;
session.currentImageIndex = ii;

// Recompute stats
var approved = 0, rejected = 0, pending = 0, blurFlagged = 0, eyesClosedFlagged = 0;
for (var sg = 0; sg < session.groups.length; sg++) {
  for (var sgi = 0; sgi < session.groups[sg].images.length; sgi++) {
    var st = session.groups[sg].images[sgi].status;
    if (st === "approved") approved++;
    else if (st === "rejected") rejected++;
    else pending++;
    if (session.groups[sg].images[sgi].blurFlag) blurFlagged++;
    if (session.groups[sg].images[sgi].eyesClosedFlag) eyesClosedFlagged++;
  }
}
session.stats = { approved: approved, rejected: rejected, pending: pending, blurFlagged: blurFlagged, eyesClosedFlagged: eyesClosedFlagged };

// Build group overview
var groupOverview = session.groups.map(function(grp, idx) {
  var gA = 0, gR = 0, gP = 0, gBlur = 0;
  for (var j = 0; j < grp.images.length; j++) {
    var s = grp.images[j].status;
    if (s === "approved") gA++; else if (s === "rejected") gR++; else gP++;
    if (grp.images[j].blurFlag) gBlur++;
  }
  var completion = gP === 0 ? "done" : ((gA + gR) > 0 ? "partial" : "pending");
  return { groupId: grp.groupId, imageCount: grp.imageCount, groupType: grp.groupType, completion: completion, isActive: idx === gi, approved: gA, rejected: gR, pending: gP, blurCount: gBlur, coverImage: grp.images[0] ? grp.images[0].mediaUrl : null };
});

// Save session
try { var tempPath = sessionPath + ".tmp"; fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8"); fs.renameSync(tempPath, sessionPath); } catch (e) { /* non-fatal */ }

if (!message) message = "Reviewing group " + (gi + 1) + " of " + session.groups.length;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: TOOL, sessionId: session.sessionId, folderPath: session.folderPath,
      action: actionTaken,
      currentGroupIndex: gi, currentImageIndex: ii,
      totalGroups: session.groups.length, totalImages: session.totalImages,
      stats: session.stats, currentGroup: currentGroup, currentImage: currentImage,
      groupOverview: groupOverview,
      allDecided: pending === 0,
      completionPercent: session.totalImages > 0 ? Math.round(((approved + rejected) / session.totalImages) * 100) : 0,
      message: message
    })
  }]
};

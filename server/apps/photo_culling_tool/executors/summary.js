// summary.js — Show session summary: totals, approved/rejected/pending, completion percentage.
// Returns lightweight stats without full image data.

var fs = require("fs");

// Load session
var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_summary",
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
        tool: "enso_photo_culling_tool_summary",
        error: "Failed to load session: " + e.message
      })
    }]
  };
}

// Compute stats
var approved = 0, rejected = 0, flagged = 0, pending = 0, blurFlagged = 0, eyesClosed = 0;
var groupStats = [];

for (var g = 0; g < session.groups.length; g++) {
  var grp = session.groups[g];
  var gApproved = 0, gRejected = 0, gFlagged = 0, gPending = 0, gBlurCount = 0;
  var sharpestFile = null;

  for (var i = 0; i < grp.images.length; i++) {
    var img = grp.images[i];
    if (img.status === "approved") { approved++; gApproved++; }
    else if (img.status === "rejected") { rejected++; gRejected++; }
    else if (img.status === "flagged") { flagged++; gFlagged++; }
    else { pending++; gPending++; }
    if (img.blurFlag) { blurFlagged++; gBlurCount++; }
    if (img.eyesClosedFlag) eyesClosed++;
    if (img.isSharpest) sharpestFile = img.filename;
  }

  var decided = gApproved + gRejected + gFlagged;
  var completion = gPending === 0 ? "done" : (decided > 0 ? "partial" : "pending");
  groupStats.push({
    groupId: grp.groupId,
    groupType: grp.groupType,
    imageCount: grp.imageCount,
    approved: gApproved,
    rejected: gRejected,
    flagged: gFlagged,
    pending: gPending,
    completion: completion,
    blurCount: gBlurCount,
    sharpestFile: sharpestFile
  });
}

var totalDecided = approved + rejected + flagged;
var completionPercent = session.totalImages > 0 ? Math.round((totalDecided / session.totalImages) * 100) : 0;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_culling_tool_summary",
      sessionId: session.sessionId,
      folderPath: session.folderPath,
      createdAt: session.createdAt,
      settings: session.settings,
      stats: {
        totalImages: session.totalImages,
        totalGroups: session.totalGroups,
        approved: approved,
        rejected: rejected,
        flagged: flagged,
        pending: pending,
        blurFlagged: blurFlagged,
        eyesClosedFlagged: eyesClosed,
        completionPercent: completionPercent
      },
      groupOverview: groupStats,
      message: completionPercent === 100
        ? "All " + session.totalImages + " images decided. Ready to export!"
        : completionPercent + "% complete — " + pending + " images pending review"
    })
  }]
};

// settings.js — View and update culling thresholds.
// Updates settings and re-evaluates flags from raw scores (no re-scan needed).

var fs = require("fs");

// Load session
var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_settings",
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
        tool: "enso_photo_culling_tool_settings",
        error: "Failed to load session: " + e.message
      })
    }]
  };
}

// Read-only mode: just return current settings if no new settings provided
var hasUpdates = false;
if (typeof params.burstThresholdMs === "number") { session.settings.burstThresholdMs = params.burstThresholdMs; hasUpdates = true; }
if (typeof params.blurThreshold === "number") { session.settings.blurThreshold = params.blurThreshold; hasUpdates = true; }
if (typeof params.earThreshold === "number") { session.settings.earThreshold = params.earThreshold; hasUpdates = true; }

// Re-evaluate flags if thresholds changed
if (hasUpdates) {
  var blurThreshold = session.settings.blurThreshold;

  for (var g = 0; g < session.groups.length; g++) {
    var grp = session.groups[g];
    // Sort by sharpness to re-rank
    grp.images.sort(function(a, b) { return (b.sharpnessScore || 0) - (a.sharpnessScore || 0); });

    var maxScore = grp.images[0].sharpnessScore || 0;
    var minScore = grp.images[grp.images.length - 1].sharpnessScore || 0;
    var scoreRange = maxScore - minScore;

    for (var i = 0; i < grp.images.length; i++) {
      var img = grp.images[i];
      img.isSharpest = i === 0;
      img.blurFlag = (img.sharpnessScore || 0) < blurThreshold;
      img.sharpnessNormalized = scoreRange > 0
        ? Math.round(((img.sharpnessScore - minScore) / scoreRange) * 100)
        : (img.sharpnessScore >= blurThreshold ? 100 : 0);

      // Re-generate auto-suggestions
      if (grp.images.length === 1) {
        if (img.blurFlag) { img.autoSuggestion = "reject"; img.autoReason = "Blurry (score: " + Math.round(img.sharpnessScore) + ")"; }
        else if (img.eyesClosedFlag) { img.autoSuggestion = "reject"; img.autoReason = "Eyes closed"; }
        else { img.autoSuggestion = "approve"; img.autoReason = "Single image, no issues"; }
      } else if (img.isSharpest) {
        if (img.eyesClosedFlag) { img.autoSuggestion = null; img.autoReason = "Sharpest but eyes closed"; }
        else { img.autoSuggestion = "approve"; img.autoReason = "Sharpest in burst of " + grp.images.length; }
      } else if (img.blurFlag) {
        img.autoSuggestion = "reject"; img.autoReason = "Blurry (score: " + Math.round(img.sharpnessScore) + ")";
      } else if (img.eyesClosedFlag) {
        img.autoSuggestion = "reject"; img.autoReason = "Eyes closed";
      } else {
        img.autoSuggestion = "reject"; img.autoReason = "Superseded by sharper image";
      }
    }
  }

  // Recompute stats
  var blurFlagged = 0, eyesClosed = 0;
  for (var sg = 0; sg < session.groups.length; sg++) {
    for (var si = 0; si < session.groups[sg].images.length; si++) {
      if (session.groups[sg].images[si].blurFlag) blurFlagged++;
      if (session.groups[sg].images[si].eyesClosedFlag) eyesClosed++;
    }
  }
  session.stats.blurFlagged = blurFlagged;
  session.stats.eyesClosedFlagged = eyesClosed;

  // Save session
  try {
    var tempPath = sessionPath + ".tmp";
    fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8");
    fs.renameSync(tempPath, sessionPath);
  } catch (e) { /* non-fatal */ }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_culling_tool_settings",
      sessionId: session.sessionId,
      settings: session.settings,
      updated: hasUpdates,
      stats: session.stats,
      message: hasUpdates ? "Settings updated — flags re-evaluated" : "Current settings"
    })
  }]
};

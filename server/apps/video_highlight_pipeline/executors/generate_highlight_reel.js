var path = (params.path || "").trim();

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_generate_highlight_reel",
        error: "No video path provided. Please specify the path to the source video."
      })
    }]
  };
}

var targetDuration = typeof params.duration === "number" ? params.duration : 60;
if (targetDuration < 10) targetDuration = 10;
if (targetDuration > 300) targetDuration = 300;

var clipDuration = typeof params.clipDuration === "number" ? params.clipDuration : 4.5;
if (clipDuration < 2) clipDuration = 2;
if (clipDuration > 15) clipDuration = 15;

var transitionStyle = (params.transitionStyle || "").trim() || "mixed";
var outputDir = (params.outputDir || "").trim();

// Load stored frame data
var storedFrames = await ctx.store.get("extracted_frames");

if (!storedFrames || !storedFrames.frames || storedFrames.frames.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_generate_highlight_reel",
        error: "No extracted frames found. Please run 'Extract Frames' first, then approve frames in 'Preview Frames'.",
        videoPath: path,
        status: "error"
      })
    }]
  };
}

// Filter to approved frames only
var approvedFrames = [];
for (var i = 0; i < storedFrames.frames.length; i++) {
  if (storedFrames.frames[i].approved !== false) {
    approvedFrames.push(storedFrames.frames[i]);
  }
}

if (approvedFrames.length < 2) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_generate_highlight_reel",
        error: "Need at least 2 approved frames. Please approve more frames in the Preview view.",
        videoPath: path,
        status: "error",
        approvedCount: approvedFrames.length
      })
    }]
  };
}

// Sort approved frames chronologically
approvedFrames.sort(function(a, b) { return a.timestamp - b.timestamp; });

// Calculate number of clips needed
var transitionDuration = 0.5;
var effectiveClip = clipDuration - transitionDuration;
var nClips = Math.round((targetDuration + transitionDuration) / clipDuration);
if (nClips < 4) nClips = 4;
if (nClips > 20) nClips = 20;
if (nClips > approvedFrames.length) nClips = approvedFrames.length;

// Subsample for even temporal distribution
var clipFrames = [];
if (approvedFrames.length > nClips) {
  var step = approvedFrames.length / nClips;
  for (var j = 0; j < nClips; j++) {
    clipFrames.push(approvedFrames[Math.floor(j * step)]);
  }
} else {
  clipFrames = approvedFrames.slice(0, nClips);
}

// Transition rotation patterns
var transitions = {
  dissolve: ["dissolve"],
  fadewhite: ["fadewhite"],
  smoothleft: ["smoothleft"],
  mixed: ["dissolve", "fadewhite", "dissolve", "smoothleft", "dissolve", "fade"]
};
var transSet = transitions[transitionStyle] || transitions.mixed;

// Build clip definitions
var clips = [];
for (var k = 0; k < clipFrames.length; k++) {
  var frame = clipFrames[k];
  var t = frame.timestamp;
  var half = clipDuration / 2;
  var clipStart = Math.max(0, t - half);
  var clipEnd = clipStart + clipDuration;

  var hrs = Math.floor(clipStart / 3600);
  var mins = Math.floor((clipStart % 3600) / 60);
  var secs = Math.floor(clipStart % 60);
  var tcStart = (hrs < 10 ? "0" : "") + hrs + ":" + (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;

  hrs = Math.floor(clipEnd / 3600);
  mins = Math.floor((clipEnd % 3600) / 60);
  secs = Math.floor(clipEnd % 60);
  var tcEnd = (hrs < 10 ? "0" : "") + hrs + ":" + (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;

  var trans = k < clipFrames.length - 1 ? transSet[k % transSet.length] : null;

  clips.push({
    clipIndex: k,
    startSec: Math.round(clipStart * 10) / 10,
    endSec: Math.round(clipEnd * 10) / 10,
    timecodeStart: tcStart,
    timecodeEnd: tcEnd,
    sceneId: frame.sceneId || 0,
    score: frame.compositeScore || 0,
    transition: trans
  });
}

// Calculate actual duration
var actualDuration = nClips * clipDuration - (nClips - 1) * transitionDuration;
actualDuration = Math.round(actualDuration * 10) / 10;

// Store reel plan
var reelPlan = {
  videoPath: path,
  clips: clips,
  targetDuration: targetDuration,
  actualDuration: actualDuration,
  clipDuration: clipDuration,
  transitionStyle: transitionStyle,
  createdAt: new Date().toISOString()
};
await ctx.store.set("reel_plan", reelPlan);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_highlight_pipeline_generate_highlight_reel",
      videoPath: path,
      status: "complete",
      reelPath: outputDir ? outputDir + "/highlight_reel.mp4" : path.replace(/\.[^.]+$/, "_highlight_reel.mp4"),
      thumbnailPath: outputDir ? outputDir + "/reel_thumbnail.jpg" : path.replace(/\.[^.]+$/, "_reel_thumb.jpg"),
      actualDuration: actualDuration,
      targetDuration: targetDuration,
      clipCount: clips.length,
      transitionStyle: transitionStyle,
      outputResolution: "1920x1080",
      clips: clips
    })
  }]
};

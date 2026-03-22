var path = (params.path || "").trim();

if (!path) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_analyze_video",
        error: "No video path provided. Please specify the path to a video file."
      })
    }]
  };
}

var threshold = typeof params.threshold === "number" ? params.threshold : 0.3;
if (threshold < 0) threshold = 0;
if (threshold > 1) threshold = 1;

// Step 1: Inspect video metadata
var inspectResult = await ctx.callTool("enso_video_inspect", { path: path });
if (!inspectResult.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_analyze_video",
        error: inspectResult.error || "Failed to inspect video. Check that the file exists and FFmpeg is installed.",
        videoPath: path
      })
    }]
  };
}

var metadata = inspectResult.data;
if (typeof metadata === "string") {
  try { metadata = JSON.parse(metadata); } catch(e) { metadata = {}; }
}

// Step 2: Detect scene boundaries
var scenesResult = await ctx.callTool("enso_video_detect_scenes", { path: path, threshold: threshold });
var scenes = [];
var sceneCount = 0;

if (scenesResult.success) {
  var sceneData = scenesResult.data;
  if (typeof sceneData === "string") {
    try { sceneData = JSON.parse(sceneData); } catch(e) { sceneData = {}; }
  }
  var rawScenes = sceneData.scenes || [];
  sceneCount = rawScenes.length;

  // Build scene records with IDs and labels
  for (var i = 0; i < rawScenes.length; i++) {
    var s = rawScenes[i];
    scenes.push({
      id: i,
      timestamp: s.timestamp || 0,
      frameNumber: s.frameNumber || 0,
      score: s.score || 0,
      label: "Scene " + (i + 1)
    });
  }
}

// If no scenes detected, create a single scene covering the whole video
if (scenes.length === 0 && metadata.duration) {
  scenes.push({
    id: 0,
    timestamp: 0,
    frameNumber: 0,
    score: 0,
    label: "Full Video"
  });
  sceneCount = 1;
}

// Calculate average scene duration
var avgSceneDuration = 0;
if (scenes.length > 1 && metadata.duration) {
  avgSceneDuration = Math.round(metadata.duration / scenes.length);
} else if (metadata.duration) {
  avgSceneDuration = Math.round(metadata.duration);
}

// Store analysis for downstream tools
await ctx.store.set("last_analysis", {
  videoPath: path,
  metadata: metadata,
  scenes: scenes,
  threshold: threshold,
  analyzedAt: new Date().toISOString()
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_highlight_pipeline_analyze_video",
      videoPath: path,
      metadata: metadata,
      scenes: scenes,
      sceneCount: sceneCount,
      avgSceneDuration: avgSceneDuration,
      analysisTimestamp: new Date().toISOString()
    })
  }]
};

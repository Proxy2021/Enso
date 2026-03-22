var path = (params.path || "").trim();
var outputDir = (params.outputDir || "").trim();
var sortBy = (params.sortBy || "").trim() || "rank";

// Load stored frame data
var storedData = await ctx.store.get("extracted_frames");

if (!storedData || !storedData.frames || storedData.frames.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_preview_frames",
        error: "No extracted frames found. Please run 'Extract Frames' first.",
        videoPath: path || "",
        totalFrames: 0,
        frames: []
      })
    }]
  };
}

var frames = storedData.frames;
var videoPath = path || storedData.videoPath || "";

// Sort frames based on preference
if (sortBy === "score") {
  frames.sort(function(a, b) { return b.compositeScore - a.compositeScore; });
} else if (sortBy === "timestamp") {
  frames.sort(function(a, b) { return a.timestamp - b.timestamp; });
} else {
  frames.sort(function(a, b) { return a.rank - b.rank; });
}

// Calculate summary stats
var approvedCount = 0;
var rejectedCount = 0;
var totalScore = 0;
var topScore = 0;

for (var i = 0; i < frames.length; i++) {
  if (frames[i].approved) {
    approvedCount++;
  } else {
    rejectedCount++;
  }
  totalScore += frames[i].compositeScore || 0;
  if ((frames[i].compositeScore || 0) > topScore) {
    topScore = frames[i].compositeScore;
  }
}

var avgScore = frames.length > 0 ? Math.round((totalScore / frames.length) * 100) / 100 : 0;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_highlight_pipeline_preview_frames",
      videoPath: videoPath,
      totalFrames: frames.length,
      approvedCount: approvedCount,
      rejectedCount: rejectedCount,
      avgScore: avgScore,
      topScore: Math.round(topScore * 100) / 100,
      sortBy: sortBy,
      frames: frames
    })
  }]
};

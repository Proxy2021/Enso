var action = (params.action || "").trim() || "get";

var DEFAULTS = {
  frameCount: 20,
  reelDuration: 60,
  clipDuration: 4.5,
  transitionDuration: 0.5,
  transitionStyle: "mixed",
  scoringStrategy: "balanced",
  sceneThreshold: 0.3,
  outputResolution: "1920x1080",
  outputFps: 30,
  jpegQuality: 95
};

if (action === "reset") {
  await ctx.store.set("pipeline_config", DEFAULTS);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_configure_pipeline",
        action: "reset",
        config: DEFAULTS,
        message: "Pipeline configuration reset to defaults"
      })
    }]
  };
}

// Load existing config or use defaults
var config = await ctx.store.get("pipeline_config");
if (!config) config = {};

// Merge defaults with stored config
var current = {};
var keys = Object.keys(DEFAULTS);
for (var i = 0; i < keys.length; i++) {
  var k = keys[i];
  current[k] = config[k] !== undefined ? config[k] : DEFAULTS[k];
}

if (action === "set") {
  // Apply parameter updates
  if (typeof params.frameCount === "number") {
    current.frameCount = Math.max(1, Math.min(100, params.frameCount));
  }
  if (typeof params.reelDuration === "number") {
    current.reelDuration = Math.max(10, Math.min(300, params.reelDuration));
  }
  if (typeof params.clipDuration === "number") {
    current.clipDuration = Math.max(2, Math.min(15, params.clipDuration));
  }
  if (typeof params.transitionDuration === "number") {
    current.transitionDuration = Math.max(0.1, Math.min(2, params.transitionDuration));
  }
  if (params.transitionStyle) {
    var validStyles = ["dissolve", "fadewhite", "smoothleft", "mixed"];
    var style = (params.transitionStyle + "").trim();
    if (validStyles.indexOf(style) >= 0) {
      current.transitionStyle = style;
    }
  }
  if (params.scoringStrategy) {
    var validStrategies = ["sharpness", "face-priority", "balanced"];
    var strat = (params.scoringStrategy + "").trim();
    if (validStrategies.indexOf(strat) >= 0) {
      current.scoringStrategy = strat;
    }
  }
  if (typeof params.sceneThreshold === "number") {
    current.sceneThreshold = Math.max(0, Math.min(1, Math.round(params.sceneThreshold * 100) / 100));
  }

  await ctx.store.set("pipeline_config", current);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_highlight_pipeline_configure_pipeline",
        action: "set",
        config: current,
        message: "Pipeline configuration updated"
      })
    }]
  };
}

// Default: get
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_highlight_pipeline_configure_pipeline",
      action: "get",
      config: current,
      message: "Current pipeline configuration"
    })
  }]
};

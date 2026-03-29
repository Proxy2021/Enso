var prompt = (params.prompt || "").trim();
var duration = typeof params.duration === "number" ? params.duration : 5;
var resolution = (params.resolution || "").trim() || "720p";
var ratio = (params.ratio || "").trim() || "16:9";
var generateAudio = typeof params.generate_audio === "boolean" ? params.generate_audio : true;
var seed = typeof params.seed === "number" ? params.seed : undefined;

if (!prompt) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_studio_generate",
        error: "A text prompt is required. Use craft_prompt to generate an optimized prompt from your idea."
      })
    }]
  };
}

// Clamp duration to valid range
if (duration < 4) duration = 4;
if (duration > 12) duration = 12;

// Build tool parameters
var toolParams = {
  prompt: prompt,
  duration: duration,
  resolution: resolution,
  ratio: ratio,
  generate_audio: generateAudio
};
if (seed !== undefined) toolParams.seed = seed;

var result = await ctx.callTool("enso_seedance_generate", toolParams);

if (!result || !result.success) {
  var errMsg = "Video generation failed";
  if (result && result.error) errMsg = result.error;
  if (result && result.data) {
    try {
      var d = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
      if (d.error) errMsg = d.error;
    } catch(e) {}
  }
  // Log failure to history
  try {
    var histKey = "history";
    var histStored = await ctx.store.get(histKey);
    var histList = [];
    if (histStored) {
      try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
    }
    histList.unshift({
      type: "t2v",
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      ratio: ratio,
      status: "failed",
      error: errMsg,
      date: new Date().toISOString(),
      url: "",
      taskId: ""
    });
    if (histList.length > 100) histList = histList.slice(0, 100);
    await ctx.store.set(histKey, JSON.stringify(histList));
  } catch(e) {}

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_studio_generate",
        error: errMsg
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Log success to history
try {
  var histKey = "history";
  var histStored = await ctx.store.get(histKey);
  var histList = [];
  if (histStored) {
    try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
  }
  histList.unshift({
    type: "t2v",
    prompt: prompt,
    duration: duration,
    resolution: resolution,
    ratio: ratio,
    status: "success",
    date: new Date().toISOString(),
    url: data.url || "",
    taskId: data.taskId || "",
    videoPath: data.videoPath || ""
  });
  if (histList.length > 100) histList = histList.slice(0, 100);
  await ctx.store.set(histKey, JSON.stringify(histList));
} catch(e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_studio_generate",
      url: data.url || "",
      videoPath: data.videoPath || "",
      sourceUrl: data.sourceUrl || "",
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      ratio: ratio,
      generateAudio: generateAudio,
      taskId: data.taskId || ""
    })
  }]
};

var imagePath = (params.image_path || "").trim();
var prompt = (params.prompt || "").trim();
var duration = typeof params.duration === "number" ? params.duration : 5;
var resolution = (params.resolution || "").trim() || "720p";
var ratio = (params.ratio || "").trim() || "adaptive";

if (!imagePath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_studio_animate",
        error: "An image path is required. Provide the path to the image you want to animate."
      })
    }]
  };
}

// Clamp duration
if (duration < 4) duration = 4;
if (duration > 12) duration = 12;

var toolParams = {
  image_path: imagePath,
  duration: duration,
  resolution: resolution,
  ratio: ratio
};
if (prompt) toolParams.prompt = prompt;

var result = await ctx.callTool("enso_seedance_image_to_video", toolParams);

if (!result || !result.success) {
  var errMsg = "Image-to-video generation failed";
  if (result && result.error) errMsg = result.error;
  if (result && result.data) {
    try {
      var d = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
      if (d.error) errMsg = d.error;
    } catch(e) {}
  }

  // Log failure
  try {
    var histKey = "history";
    var histStored = await ctx.store.get(histKey);
    var histList = [];
    if (histStored) {
      try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
    }
    histList.unshift({
      type: "i2v",
      prompt: prompt || "(image animation)",
      sourceImage: imagePath,
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
        tool: "enso_video_studio_animate",
        error: errMsg
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Log success
try {
  var histKey = "history";
  var histStored = await ctx.store.get(histKey);
  var histList = [];
  if (histStored) {
    try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
  }
  histList.unshift({
    type: "i2v",
    prompt: prompt || "(image animation)",
    sourceImage: imagePath,
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
      tool: "enso_video_studio_animate",
      url: data.url || "",
      videoPath: data.videoPath || "",
      sourceUrl: data.sourceUrl || "",
      sourceImage: imagePath,
      prompt: prompt,
      duration: duration,
      resolution: resolution,
      ratio: ratio,
      taskId: data.taskId || ""
    })
  }]
};

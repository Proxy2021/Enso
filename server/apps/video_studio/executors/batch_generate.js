// Batch generate all scenes in a short video project sequentially
var scenes = params.scenes || [];
var ratio = (params.ratio || "9:16").trim();
var resolution = (params.resolution || "1080p").trim();
var generateAudio = typeof params.generate_audio === "boolean" ? params.generate_audio : true;
var projectId = (params.project_id || "").trim();

if (!Array.isArray(scenes) || scenes.length === 0) {
  return {
    content: [{ type: "text", text: JSON.stringify({ tool: "enso_video_studio_batch_generate", error: "scenes array is required. Call short_video or script_to_scenes first to create a scene plan." }) }]
  };
}

var results = [];
var successCount = 0;
var failedCount = 0;

for (var i = 0; i < scenes.length; i++) {
  var scene = scenes[i];
  // Use scene-specific ratio/resolution if provided, fall back to project defaults
  var sceneRatio = scene.suggestedRatio || scene.ratio || ratio;
  var sceneResolution = scene.resolution || resolution;
  var sceneDuration = scene.suggestedDuration || scene.duration || 5;
  if (sceneDuration < 3) sceneDuration = 3;
  if (sceneDuration > 15) sceneDuration = 15;

  var sceneResult = {
    number: scene.number || (i + 1),
    title: scene.title || ("Scene " + (i + 1)),
    prompt: scene.prompt || "",
    caption: scene.caption || "",
    audioNote: scene.audioNote || "",
    purpose: scene.purpose || "content",
    status: "failed",
    url: "",
    taskId: ""
  };

  if (!scene.prompt) {
    sceneResult.error = "No prompt for this scene";
    results.push(sceneResult);
    failedCount++;
    continue;
  }

  try {
    var genResult = await ctx.callTool("enso_seedance_generate", {
      prompt: scene.prompt,
      duration: sceneDuration,
      resolution: sceneResolution,
      ratio: sceneRatio,
      generate_audio: generateAudio
    });

    if (genResult && genResult.success) {
      var data = genResult.data;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch(e) { data = {}; } }
      sceneResult.status = "success";
      sceneResult.url = data.url || "";
      sceneResult.taskId = data.taskId || "";
      sceneResult.videoPath = data.videoPath || "";
      sceneResult.duration = sceneDuration;
      sceneResult.ratio = sceneRatio;
      successCount++;

      // Log to history
      try {
        var histKey = "history";
        var histStored = await ctx.store.get(histKey);
        var histList = [];
        if (histStored) { try { histList = JSON.parse(histStored); } catch(e) {} }
        histList.unshift({
          type: "t2v",
          prompt: scene.prompt,
          duration: sceneDuration,
          resolution: sceneResolution,
          ratio: sceneRatio,
          status: "success",
          date: new Date().toISOString(),
          url: data.url || "",
          taskId: data.taskId || ""
        });
        if (histList.length > 100) histList = histList.slice(0, 100);
        await ctx.store.set(histKey, JSON.stringify(histList));
      } catch(e) {}
    } else {
      var errMsg = "Generation failed";
      if (genResult && genResult.error) errMsg = genResult.error;
      if (genResult && genResult.data) {
        try {
          var errData = typeof genResult.data === "string" ? JSON.parse(genResult.data) : genResult.data;
          if (errData.error) errMsg = errData.error;
        } catch(e) {}
      }
      sceneResult.error = errMsg;
      failedCount++;
    }
  } catch(e) {
    sceneResult.error = String(e.message || e);
    failedCount++;
  }

  results.push(sceneResult);
}

// Update stored project if projectId provided
if (projectId) {
  try {
    var projStored = await ctx.store.get(projectId);
    if (projStored) {
      var proj = JSON.parse(projStored);
      for (var j = 0; j < results.length; j++) {
        var r = results[j];
        for (var k = 0; k < proj.scenes.length; k++) {
          if (proj.scenes[k].number === r.number) {
            proj.scenes[k].generated = r.status === "success";
            proj.scenes[k].url = r.url || "";
          }
        }
      }
      await ctx.store.set(projectId, JSON.stringify(proj));
    }
  } catch(e) {}
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_studio_batch_generate",
      totalScenes: scenes.length,
      successCount: successCount,
      failedCount: failedCount,
      ratio: ratio,
      resolution: resolution,
      results: results
    })
  }]
};

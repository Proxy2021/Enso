// Photo Story — animate a list of static images into a cohesive short video narrative
// Each image is animated via I2V (Image-to-Video) with AI-generated motion direction
var imagePaths = params.image_paths || [];
var concept = (params.concept || "").trim();
var platform = (params.platform || "douyin").trim();
var style = (params.style || "cinematic").trim();
var durationPerPhoto = typeof params.duration_per_photo === "number" ? params.duration_per_photo : 5;
var generateAudio = typeof params.generate_audio === "boolean" ? params.generate_audio : true;
var imageDescriptions = params.image_descriptions || []; // optional human-provided descriptions

if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
  return {
    content: [{ type: "text", text: JSON.stringify({
      tool: "enso_video_studio_photo_story",
      error: "image_paths array is required. Provide absolute paths to your images (JPG, PNG, WEBP). Example: [\"/Users/you/Photos/img1.jpg\", \"/Users/you/Photos/img2.jpg\"]"
    }) }]
  };
}

if (!concept) {
  return {
    content: [{ type: "text", text: JSON.stringify({
      tool: "enso_video_studio_photo_story",
      error: "A concept or theme is required to create the narrative. Describe what story your photos tell."
    }) }]
  };
}

// Clamp duration
if (durationPerPhoto < 4) durationPerPhoto = 4;
if (durationPerPhoto > 15) durationPerPhoto = 15;

var PLATFORM_RATIOS = {
  douyin: "9:16", tiktok: "9:16", rednote: "3:4",
  bilibili: "16:9", youtube_shorts: "9:16", wechat: "9:16"
};
var PLATFORM_NAMES = {
  douyin: "抖音 Douyin", tiktok: "TikTok", rednote: "小红书 RedNote",
  bilibili: "Bilibili", youtube_shorts: "YouTube Shorts", wechat: "微信视频号"
};

var ratio = PLATFORM_RATIOS[platform] || "9:16";
var platformName = PLATFORM_NAMES[platform] || platform;
var n = imagePaths.length;
var totalDuration = n * durationPerPhoto;

// Build image context for LLM (use descriptions if provided, otherwise position-based)
var imageContext = "";
for (var ci = 0; ci < n; ci++) {
  var pathParts = imagePaths[ci].split(/[\/\\]/);
  var fileName = pathParts[pathParts.length - 1];
  imageContext += "Photo " + (ci + 1) + ": " + fileName;
  if (imageDescriptions && imageDescriptions[ci]) {
    imageContext += " — " + String(imageDescriptions[ci]);
  }
  imageContext += "\n";
}

// Default motion library for variety
var MOTIONS = [
  "Slow Ken Burns zoom-in from wide to medium, gentle rightward drift, cinematic warm color grade",
  "Smooth pan left to right revealing full frame, slight parallax depth, golden hour tones",
  "Gentle slow zoom-out from tight detail to wide composition, atmospheric haze, soft focus edges",
  "Push-in with slight upward tilt, bokeh foreground elements, dramatic shadow contrast",
  "Ken Burns drift diagonally bottom-left to top-right, dreamy soft blur vignette",
  "Slow pull-back zoom-out, subjects emerge into context, cinematic letterbox crop hint",
  "Gentle pan right to left, subjects linger at center, nostalgic film grain overlay",
  "Slow zoom-in on center subject, depth of field narrows, everything else softly blurs",
  "Tilt up from ground level revealing full scene, morning light rays, peaceful motion",
  "Subtle floating motion with micro-tremor, handheld feel, emotional intimate framing"
];

// Generate narrative and per-photo motion directions via LLM
var systemPrompt = "You are a professional short-form video director specializing in photo slideshow stories.\n\n"
  + "Create a cinematic narrative for a photo story video.\n\n"
  + "Platform: " + platformName + " (ratio: " + ratio + ")\n"
  + "Theme/Concept: " + concept + "\n"
  + "Visual Style: " + style + "\n"
  + "Total Photos: " + n + "\n"
  + "Duration per clip: " + durationPerPhoto + "s\n"
  + "Total duration: " + totalDuration + "s\n\n"
  + "Photos:\n" + imageContext + "\n"
  + "For each photo, create:\n"
  + "1. A cinematic animation prompt (how to move the camera over this still image — max 200 chars)\n"
  + "   Use techniques: slow zoom-in, slow zoom-out, pan left, pan right, Ken Burns, push-in, tilt-up, drift\n"
  + "2. An on-screen caption (punchy, max 10 words, platform-native language OK)\n"
  + "3. A brief audio/music note for this moment\n"
  + "4. Purpose: opener|buildup|peak|resolution|cta\n\n"
  + "Narrative flow:\n"
  + "- Photo 1: attention-grabbing opener\n"
  + "- Middle photos: build the story\n"
  + "- Last photo: satisfying conclusion with CTA\n\n"
  + 'Return ONLY valid JSON:\n'
  + '{"projectTitle":"catchy title","narrative":"1-2 sentence story overview","frames":[{"number":1,"motionPrompt":"Slow Ken Burns zoom-in...","caption":"...","audioNote":"...","purpose":"opener"}],'
  + '"musicGenre":"...","musicMood":"energetic|calm|emotional|dramatic","hashtags":["#tag1","#tag2"]}';

var narrativeResult = await ctx.ask(systemPrompt);

// Parse LLM response
var projectTitle = "Photo Story";
var narrativeOverview = "";
var frames = [];
var musicGenre = "Ambient";
var musicMood = "emotional";
var hashtags = [];

if (narrativeResult && narrativeResult.ok && narrativeResult.text) {
  var responseText = narrativeResult.text.trim();
  var jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      var parsed = JSON.parse(jsonMatch[0]);
      if (parsed.projectTitle) projectTitle = parsed.projectTitle;
      if (parsed.narrative) narrativeOverview = parsed.narrative;
      if (parsed.musicGenre) musicGenre = parsed.musicGenre;
      if (parsed.musicMood) musicMood = parsed.musicMood;
      if (Array.isArray(parsed.hashtags)) hashtags = parsed.hashtags;
      if (Array.isArray(parsed.frames)) {
        frames = parsed.frames.slice(0, n).map(function(f, idx) {
          return {
            number: f.number || (idx + 1),
            motionPrompt: String(f.motionPrompt || MOTIONS[idx % MOTIONS.length]),
            caption: String(f.caption || ""),
            audioNote: String(f.audioNote || ""),
            purpose: String(f.purpose || "content")
          };
        });
      }
    } catch(e) {}
  }
}

// Fill in any missing frames with defaults
while (frames.length < n) {
  var fi = frames.length;
  frames.push({
    number: fi + 1,
    motionPrompt: MOTIONS[fi % MOTIONS.length],
    caption: "",
    audioNote: fi === 0 ? "Open with calm ambient music" : (fi === n - 1 ? "Music fades to gentle close" : "Music continues"),
    purpose: fi === 0 ? "opener" : (fi === n - 1 ? "cta" : "buildup")
  });
}

// Now animate each image with I2V
var results = [];
var successCount = 0;
var failedCount = 0;

for (var i = 0; i < imagePaths.length; i++) {
  var imgPath = imagePaths[i];
  var frame = frames[i];

  var imgFileParts = imgPath.split(/[\/\\]/);
  var imgFileName = imgFileParts[imgFileParts.length - 1];

  var frameResult = {
    number: frame.number,
    imagePath: imgPath,
    imageFileName: imgFileName,
    motionPrompt: frame.motionPrompt,
    caption: frame.caption,
    audioNote: frame.audioNote,
    purpose: frame.purpose,
    status: "failed",
    url: "",
    taskId: ""
  };

  try {
    var animResult = await ctx.callTool("enso_seedance_image_to_video", {
      image_path: imgPath,
      prompt: frame.motionPrompt,
      duration: durationPerPhoto,
      resolution: "1080p",
      ratio: ratio
    });

    if (animResult && animResult.success) {
      var animData = animResult.data;
      if (typeof animData === "string") {
        try { animData = JSON.parse(animData); } catch(e) { animData = {}; }
      }
      frameResult.status = "success";
      frameResult.url = animData.url || "";
      frameResult.taskId = animData.taskId || "";
      frameResult.videoPath = animData.videoPath || "";
      successCount++;

      // Log to history
      try {
        var histKey = "history";
        var histStored = await ctx.store.get(histKey);
        var histList = [];
        if (histStored) { try { histList = JSON.parse(histStored); } catch(e) {} }
        histList.unshift({
          type: "i2v", prompt: frame.motionPrompt,
          duration: durationPerPhoto, resolution: "1080p", ratio: ratio,
          status: "success", date: new Date().toISOString(),
          url: animData.url || "", taskId: animData.taskId || ""
        });
        if (histList.length > 100) histList = histList.slice(0, 100);
        await ctx.store.set(histKey, JSON.stringify(histList));
      } catch(e) {}
    } else {
      var errMsg = "Animation failed";
      if (animResult && animResult.error) errMsg = animResult.error;
      if (animResult && animResult.data) {
        try {
          var errData = typeof animResult.data === "string" ? JSON.parse(animResult.data) : animResult.data;
          if (errData.error) errMsg = errData.error;
        } catch(e) {}
      }
      frameResult.error = errMsg;
      failedCount++;
    }
  } catch(e) {
    frameResult.error = String(e.message || e);
    failedCount++;
  }

  results.push(frameResult);
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_studio_photo_story",
      projectTitle: projectTitle,
      concept: concept,
      platform: platform,
      platformName: platformName,
      ratio: ratio,
      resolution: "1080p",
      narrativeOverview: narrativeOverview,
      totalPhotos: n,
      successCount: successCount,
      failedCount: failedCount,
      durationPerPhoto: durationPerPhoto,
      totalDuration: totalDuration,
      musicGenre: musicGenre,
      musicMood: musicMood,
      hashtags: hashtags,
      frames: results
    })
  }]
};

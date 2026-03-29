var script = (params.script || "").trim();
var sceneCount = typeof params.scene_count === "number" ? params.scene_count : 0;
var style = (params.style || "").trim() || "cinematic";
var durationPerScene = typeof params.duration_per_scene === "number" ? params.duration_per_scene : 5;
var platform = (params.platform || "").trim(); // "douyin" | "tiktok" | "rednote" | "bilibili" | "youtube_shorts" | ""
var isShortVideo = params.short_video === true || platform === "douyin" || platform === "tiktok" || platform === "youtube_shorts";

if (!script) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_studio_script_to_scenes",
        error: "A script, story, or narrative is required. Provide your screenplay, story outline, or multi-scene concept in any language."
      })
    }]
  };
}

// Clamp duration per scene
if (durationPerScene < 3) durationPerScene = 3;
if (durationPerScene > 15) durationPerScene = 15;

// For 短视频 platforms, prefer shorter durations
if (isShortVideo && durationPerScene > 6) durationPerScene = 5;

// Clamp scene count
if (sceneCount < 0) sceneCount = 0;
if (sceneCount > 12) sceneCount = 12;

// Platform ratio defaults
var defaultRatio = "16:9";
if (platform === "douyin" || platform === "tiktok" || platform === "wechat" || platform === "youtube_shorts") defaultRatio = "9:16";
if (platform === "rednote") defaultRatio = "3:4";

// Check cache
var cacheHash = function(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h = ((h << 5) - h) + c;
    h = h & h;
  }
  return "scenes_" + Math.abs(h).toString(36);
};

var cacheKey = cacheHash(script + "|" + style + "|" + sceneCount + "|" + durationPerScene + "|" + platform);
try {
  var cached = await ctx.store.get(cacheKey);
  if (cached) {
    var cachedData = JSON.parse(cached);
    if (cachedData.scenes && cachedData._cachedAt && (Date.now() - cachedData._cachedAt) < 3600000) {
      cachedData.tool = "enso_video_studio_script_to_scenes";
      cachedData.cached = true;
      delete cachedData._cachedAt;
      return { content: [{ type: "text", text: JSON.stringify(cachedData) }] };
    }
  }
} catch(e) {}

var sceneCountInstruction = sceneCount > 0
  ? "Create exactly " + sceneCount + " scenes."
  : isShortVideo
    ? "Determine optimal scenes (3-8) for a short-form video. Each scene should be punchy and purposeful."
    : "Determine the optimal number of scenes (2-10) based on the script's structure and pacing.";

var platformInstruction = platform
  ? "\nPlatform: " + platform + " (optimize for this platform's audience and format, ratio: " + defaultRatio + ")"
  : "";

var shortVideoExtra = isShortVideo
  ? "\nSHORT VIDEO RULES:\n- Scene 1 MUST be an attention-grabbing hook (first 2-3s)\n- Every scene needs a punchy caption\n- Suggest music/audio cues for each scene\n- Keep scenes short and visually dynamic\n- Label scene purposes: hook, context, action, solution, proof, cta\n"
  : "";

var systemPrompt = "You are a professional film director and short-form video content strategist.\n\n"
  + "Decompose the following script/story into individual video scenes optimized for AI video generation.\n\n"
  + "For each scene provide:\n"
  + "1. Scene title (2-5 words)\n"
  + "2. Detailed English video prompt (max 280 chars) with: camera movement, lighting, composition, subjects, color grade\n"
  + "3. Duration in seconds\n"
  + "4. Aspect ratio suggestion\n"
  + "5. Mood (one word)\n"
  + "6. On-screen caption text (max 12 words, punchy and engaging)\n"
  + "7. Audio/music note (brief sound direction for this scene)\n"
  + "8. Scene purpose: hook|context|action|conflict|solution|proof|emotion|cta|content\n"
  + "9. Transition to next scene: cut|fade|zoom|wipe|match-cut\n\n"
  + "Visual style: " + style + "\n"
  + platformInstruction + "\n"
  + shortVideoExtra
  + sceneCountInstruction + "\n\n"
  + "PROMPT RULES:\n"
  + "- Each prompt must be self-contained and visually specific\n"
  + "- Include explicit camera directions (dolly, pan, crane, POV, tracking, push-in, pull-out)\n"
  + "- Include lighting details (golden hour, chiaroscuro, neon, studio, ambient)\n"
  + "- Maintain visual continuity and narrative flow\n"
  + "- All prompts in English regardless of input language\n\n"
  + 'Respond in ONLY valid JSON: {"scenes":[{"sceneNumber":1,"title":"Title","prompt":"detailed prompt","suggestedDuration":5,"suggestedRatio":"16:9","mood":"mysterious","caption":"On-screen text here","audioNote":"Upbeat electronic music builds tension","purpose":"hook","transition":"cut"}]}';

var askResult = await ctx.ask(systemPrompt + "\n\nScript:\n" + script);

var resultData = {
  tool: "enso_video_studio_script_to_scenes",
  originalScript: script,
  style: style,
  platform: platform,
  defaultRatio: defaultRatio,
  isShortVideo: isShortVideo,
  totalScenes: 0,
  totalDuration: 0,
  scenes: []
};

if (askResult && askResult.ok && askResult.text) {
  var responseText = askResult.text.trim();
  var jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      var parsed = JSON.parse(jsonMatch[0]);
      if (parsed.scenes && Array.isArray(parsed.scenes)) {
        resultData.scenes = parsed.scenes.map(function(s, idx) {
          var dur = typeof s.suggestedDuration === "number" ? s.suggestedDuration : durationPerScene;
          if (dur < 3) dur = 3;
          if (dur > 15) dur = 15;
          return {
            sceneNumber: s.sceneNumber || (idx + 1),
            title: String(s.title || "Scene " + (idx + 1)),
            prompt: String(s.prompt || ""),
            suggestedDuration: dur,
            suggestedRatio: String(s.suggestedRatio || defaultRatio),
            mood: String(s.mood || ""),
            caption: String(s.caption || ""),
            audioNote: String(s.audioNote || ""),
            purpose: String(s.purpose || "content"),
            transition: String(s.transition || "cut")
          };
        });
      }
    } catch(e) {
      resultData.scenes = [{
        sceneNumber: 1, title: "Full Scene",
        prompt: responseText.slice(0, 280),
        suggestedDuration: durationPerScene,
        suggestedRatio: defaultRatio,
        mood: "", caption: "", audioNote: "", purpose: "content", transition: "cut"
      }];
    }
  } else {
    resultData.scenes = [{
      sceneNumber: 1, title: "Full Scene",
      prompt: responseText.slice(0, 280),
      suggestedDuration: durationPerScene,
      suggestedRatio: defaultRatio,
      mood: "", caption: "", audioNote: "", purpose: "content", transition: "cut"
    }];
  }
} else {
  resultData.scenes = [{
    sceneNumber: 1, title: "Full Scene",
    prompt: style + " scene: " + script.slice(0, 250),
    suggestedDuration: durationPerScene,
    suggestedRatio: defaultRatio,
    mood: "", caption: "", audioNote: "", purpose: "content", transition: "cut"
  }];
}

resultData.totalScenes = resultData.scenes.length;
var totalDur = 0;
for (var i = 0; i < resultData.scenes.length; i++) {
  totalDur += resultData.scenes[i].suggestedDuration || durationPerScene;
}
resultData.totalDuration = totalDur;

// Cache result
try {
  var toCache = JSON.parse(JSON.stringify(resultData));
  toCache._cachedAt = Date.now();
  await ctx.store.set(cacheKey, JSON.stringify(toCache));
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify(resultData) }] };

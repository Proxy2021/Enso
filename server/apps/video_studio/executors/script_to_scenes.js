var script = (params.script || "").trim();
var sceneCount = typeof params.scene_count === "number" ? params.scene_count : 0;
var style = (params.style || "").trim() || "cinematic";
var durationPerScene = typeof params.duration_per_scene === "number" ? params.duration_per_scene : 5;

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
if (durationPerScene < 4) durationPerScene = 4;
if (durationPerScene > 12) durationPerScene = 12;

// Clamp scene count
if (sceneCount < 0) sceneCount = 0;
if (sceneCount > 12) sceneCount = 12;

// Check cache for repeated scripts
var cacheHash = function(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h = ((h << 5) - h) + c;
    h = h & h;
  }
  return "scenes_" + Math.abs(h).toString(36);
};

var cacheKey = cacheHash(script + "|" + style + "|" + sceneCount + "|" + durationPerScene);
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
  : "Determine the optimal number of scenes (2-8) based on the script's structure and pacing.";

var systemPrompt = "You are a film director and screenwriter. Decompose the following script/story into discrete video scenes, each optimized for a 4-12 second AI-generated video clip.\n\n"
  + "For each scene, provide:\n"
  + "1. A short scene title (2-5 words)\n"
  + "2. A detailed English video prompt (under 280 characters) with specific camera movement, lighting, composition, and atmosphere\n"
  + "3. Suggested duration in seconds (" + durationPerScene + "s default, adjust based on scene complexity)\n"
  + "4. Suggested aspect ratio (16:9, 21:9, 9:16, 1:1)\n"
  + "5. Mood (one word: mysterious, tense, epic, serene, dramatic, energetic, melancholic, playful, dark, hopeful)\n\n"
  + "Visual style: " + style + "\n"
  + sceneCountInstruction + "\n\n"
  + "RULES:\n"
  + "- Each prompt must be self-contained and visually specific\n"
  + "- Include camera directions (dolly, pan, crane, POV, tracking, push-in, pull-out, etc.)\n"
  + "- Include lighting details (golden hour, chiaroscuro, neon, ambient, etc.)\n"
  + "- Maintain visual continuity and narrative flow across scenes\n"
  + "- All prompts must be in English regardless of input language\n"
  + "- Keep prompts concise but visually rich\n\n"
  + "Respond in this exact JSON format:\n"
  + '{"scenes":[{"sceneNumber":1,"title":"Scene Title","prompt":"detailed video prompt","suggestedDuration":5,"suggestedRatio":"16:9","mood":"mysterious"}]}';

var askResult = await ctx.ask(systemPrompt + "\n\nScript:\n" + script);

var resultData = {
  tool: "enso_video_studio_script_to_scenes",
  originalScript: script,
  style: style,
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
          if (dur < 4) dur = 4;
          if (dur > 12) dur = 12;
          return {
            sceneNumber: s.sceneNumber || (idx + 1),
            title: String(s.title || "Scene " + (idx + 1)),
            prompt: String(s.prompt || ""),
            suggestedDuration: dur,
            suggestedRatio: String(s.suggestedRatio || "16:9"),
            mood: String(s.mood || "")
          };
        });
      }
    } catch(e) {
      // JSON parsing failed - try to extract scene info from text
      resultData.scenes = [{
        sceneNumber: 1,
        title: "Full Scene",
        prompt: responseText.slice(0, 280),
        suggestedDuration: durationPerScene,
        suggestedRatio: "16:9",
        mood: ""
      }];
    }
  } else {
    resultData.scenes = [{
      sceneNumber: 1,
      title: "Full Scene",
      prompt: responseText.slice(0, 280),
      suggestedDuration: durationPerScene,
      suggestedRatio: "16:9",
      mood: ""
    }];
  }
} else {
  // Fallback: create a single scene from the script
  resultData.scenes = [{
    sceneNumber: 1,
    title: "Full Scene",
    prompt: style + " scene: " + script.slice(0, 250),
    suggestedDuration: durationPerScene,
    suggestedRatio: "16:9",
    mood: ""
  }];
}

// Compute totals
resultData.totalScenes = resultData.scenes.length;
var totalDur = 0;
for (var i = 0; i < resultData.scenes.length; i++) {
  totalDur += resultData.scenes[i].suggestedDuration || durationPerScene;
}
resultData.totalDuration = totalDur;

// Cache the result
try {
  var toCache = JSON.parse(JSON.stringify(resultData));
  toCache._cachedAt = Date.now();
  await ctx.store.set(cacheKey, JSON.stringify(toCache));
} catch(e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify(resultData)
  }]
};

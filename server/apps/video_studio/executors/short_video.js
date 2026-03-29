// 短视频 Production Planner — creates a complete scene-by-scene project plan
var concept = (params.concept || params.description || "").trim();
var platform = (params.platform || "douyin").trim();
var category = (params.category || "lifestyle").trim();
var targetDuration = typeof params.target_duration === "number" ? params.target_duration : 30;
var hookStyle = (params.hook_style || "auto").trim();

if (!concept) {
  return {
    content: [{ type: "text", text: JSON.stringify({ tool: "enso_video_studio_short_video", error: "A concept or idea is required. Describe what your short video is about." }) }]
  };
}

// Platform presets
var PLATFORMS = {
  douyin:         { name: "抖音 Douyin",     ratio: "9:16", resolution: "1080p", sceneDuration: 4, maxTotal: 60 },
  tiktok:         { name: "TikTok",           ratio: "9:16", resolution: "1080p", sceneDuration: 4, maxTotal: 60 },
  rednote:        { name: "小红书 RedNote",   ratio: "3:4",  resolution: "1080p", sceneDuration: 5, maxTotal: 60 },
  bilibili:       { name: "Bilibili",         ratio: "16:9", resolution: "1080p", sceneDuration: 6, maxTotal: 180 },
  youtube_shorts: { name: "YouTube Shorts",  ratio: "9:16", resolution: "1080p", sceneDuration: 5, maxTotal: 60 },
  wechat:         { name: "微信视频号 WeChat", ratio: "9:16", resolution: "1080p", sceneDuration: 4, maxTotal: 60 }
};

if (targetDuration < 6) targetDuration = 6;
if (targetDuration > 120) targetDuration = 120;

var preset = PLATFORMS[platform] || PLATFORMS["douyin"];
var sceneCount = Math.max(3, Math.min(10, Math.round(targetDuration / preset.sceneDuration)));

var systemPrompt = "You are a professional 短视频 (short-form video) content strategist and film director.\n\n"
  + "Create a complete production-ready viral video project plan.\n\n"
  + "Input Details:\n"
  + "- Concept: " + concept + "\n"
  + "- Platform: " + preset.name + " (aspect ratio: " + preset.ratio + ")\n"
  + "- Content Category: " + category + "\n"
  + "- Target Duration: " + targetDuration + "s total\n"
  + "- Scene Count: " + sceneCount + " scenes\n"
  + "- Hook Style: " + (hookStyle === "auto" ? "choose the most attention-grabbing style for this concept" : hookStyle) + "\n\n"
  + "CRITICAL 短视频 PRINCIPLES:\n"
  + "1. Scene 1 MUST hook viewers within 2-3 seconds — no slow builds, immediate impact\n"
  + "2. Every scene prompt must be visually dynamic with explicit camera movement\n"
  + "3. Captions must be short, punchy, authentic to the platform's voice\n"
  + "4. Music direction must match the emotional energy curve of the content\n"
  + "5. CTA must feel natural and platform-native (e.g., 关注 for Douyin, Follow for TikTok)\n"
  + "6. Seedance prompts must be in English with: camera motion + lighting + subjects + color grade\n\n"
  + "Return ONLY valid JSON with NO markdown wrapper:\n"
  + "{\n"
  + '  "projectTitle": "catchy title for this video project",\n'
  + '  "concept": "refined 1-2 sentence concept in English",\n'
  + '  "hookStyle": "question|shock|action|emotion|mystery|trend",\n'
  + '  "hookScore": 8.5,\n'
  + '  "viralScore": 7.8,\n'
  + '  "totalDuration": ' + targetDuration + ',\n'
  + '  "scenes": [\n'
  + '    {\n'
  + '      "number": 1,\n'
  + '      "title": "Hook Scene",\n'
  + '      "duration": 3,\n'
  + '      "purpose": "hook",\n'
  + '      "prompt": "Highly detailed Seedance T2V prompt in English (camera motion, lighting, subjects, style, color grade — max 300 chars)",\n'
  + '      "caption": "Short punchy on-screen text max 12 words",\n'
  + '      "captionTiming": "0-3s",\n'
  + '      "audioNote": "music/sound direction for this specific scene",\n'
  + '      "transition": "cut"\n'
  + '    }\n'
  + '  ],\n'
  + '  "musicGenre": "Electronic / Hip-hop / etc.",\n'
  + '  "musicMood": "energetic|calm|dramatic|playful|emotional",\n'
  + '  "musicBPM": 128,\n'
  + '  "ctaText": "platform-native call to action text",\n'
  + '  "platformTips": ["tip1", "tip2", "tip3"],\n'
  + '  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"]\n'
  + "}\n\n"
  + "Scene purposes should be: hook (scene 1), context, conflict, solution, proof, cta (last scene), or content\n"
  + "Transitions: cut, fade, zoom, wipe, match-cut\n"
  + "Include exactly " + sceneCount + " scenes.";

var askResult = await ctx.ask(systemPrompt + "\n\nCreate the project plan for: " + concept);

var resultData = {
  tool: "enso_video_studio_short_video",
  concept: concept,
  platform: platform,
  platformName: preset.name,
  ratio: preset.ratio,
  resolution: preset.resolution,
  projectTitle: "Short Video Project",
  hookStyle: hookStyle,
  hookScore: null,
  viralScore: null,
  totalDuration: targetDuration,
  scenes: [],
  musicGenre: "",
  musicMood: "",
  musicBPM: 120,
  ctaText: "",
  platformTips: [],
  hashtags: []
};

if (askResult && askResult.ok && askResult.text) {
  var responseText = askResult.text.trim();
  var jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      var parsed = JSON.parse(jsonMatch[0]);
      if (parsed.projectTitle) resultData.projectTitle = parsed.projectTitle;
      if (parsed.concept) resultData.concept = parsed.concept;
      if (parsed.hookStyle) resultData.hookStyle = parsed.hookStyle;
      if (parsed.hookScore) resultData.hookScore = parsed.hookScore;
      if (parsed.viralScore) resultData.viralScore = parsed.viralScore;
      if (parsed.musicGenre) resultData.musicGenre = parsed.musicGenre;
      if (parsed.musicMood) resultData.musicMood = parsed.musicMood;
      if (parsed.musicBPM) resultData.musicBPM = parsed.musicBPM;
      if (parsed.ctaText) resultData.ctaText = parsed.ctaText;
      if (Array.isArray(parsed.platformTips)) resultData.platformTips = parsed.platformTips;
      if (Array.isArray(parsed.hashtags)) resultData.hashtags = parsed.hashtags;
      if (Array.isArray(parsed.scenes)) {
        resultData.scenes = parsed.scenes.map(function(s, idx) {
          var dur = typeof s.duration === "number" ? s.duration : preset.sceneDuration;
          if (dur < 3) dur = 3;
          if (dur > 12) dur = 12;
          return {
            number: s.number || (idx + 1),
            title: String(s.title || "Scene " + (idx + 1)),
            duration: dur,
            purpose: String(s.purpose || "content"),
            prompt: String(s.prompt || ""),
            caption: String(s.caption || ""),
            captionTiming: String(s.captionTiming || ""),
            audioNote: String(s.audioNote || ""),
            transition: String(s.transition || "cut"),
            generated: false,
            url: ""
          };
        });
      }
    } catch(e) {}
  }
}

// Fallback if no scenes were parsed
if (resultData.scenes.length === 0) {
  resultData.scenes = [
    { number: 1, title: "Hook Scene", duration: 3, purpose: "hook", prompt: concept, caption: "Watch this!", captionTiming: "0-3s", audioNote: "Attention-grabbing sound effect", transition: "cut", generated: false, url: "" },
    { number: 2, title: "Main Content", duration: preset.sceneDuration, purpose: "content", prompt: concept, caption: "", captionTiming: "", audioNote: "Upbeat background music", transition: "cut", generated: false, url: "" },
    { number: 3, title: "Call to Action", duration: 4, purpose: "cta", prompt: concept + ", final scene", caption: "Follow for more!", captionTiming: "final 3s", audioNote: "Music builds to end", transition: "fade", generated: false, url: "" }
  ];
}

// Persist project to store
try {
  var projKey = "svproject_" + Date.now();
  resultData.projectId = projKey;
  await ctx.store.set(projKey, JSON.stringify(resultData));
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify(resultData) }] };

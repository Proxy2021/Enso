var description = (params.description || "").trim();
var style = (params.style || "").trim() || "cinematic";
var mood = (params.mood || "").trim() || "";

if (!description) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_video_studio_craft_prompt",
        error: "A description or idea is required. Describe your scene, story, or concept in any language."
      })
    }]
  };
}

// Cache: hash description+style+mood, check store for recent result
var cacheHash = function(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h = ((h << 5) - h) + c;
    h = h & h;
  }
  return "craft_" + Math.abs(h).toString(36);
};

var cacheKey = cacheHash(description + "|" + style + "|" + mood);
try {
  var cached = await ctx.store.get(cacheKey);
  if (cached) {
    var cachedData = JSON.parse(cached);
    if (cachedData.craftedPrompt && cachedData._cachedAt && (Date.now() - cachedData._cachedAt) < 3600000) {
      cachedData.tool = "enso_video_studio_craft_prompt";
      cachedData.cached = true;
      delete cachedData._cachedAt;
      return { content: [{ type: "text", text: JSON.stringify(cachedData) }] };
    }
  }
} catch(e) {}

// Use ctx.ask to craft an optimized Seedance prompt
var systemPrompt = "You are an expert AI video prompt engineer for Seedance text-to-video generation. "
  + "Given a user's rough description (which may be in any language), create an optimized English prompt "
  + "that will produce the best video result. Your prompt should include:\n"
  + "1. Clear scene description with subjects and actions\n"
  + "2. Camera movement directions (dolly, pan, push-in, tracking, crane, etc.)\n"
  + "3. Lighting description (chiaroscuro, golden hour, neon, etc.)\n"
  + "4. Visual style and color grading notes\n"
  + "5. Atmospheric details (particles, fog, rain, etc.)\n\n"
  + "Style requested: " + style + "\n"
  + (mood ? "Mood requested: " + mood + "\n" : "")
  + "\nRespond in this exact JSON format:\n"
  + '{"craftedPrompt":"the main optimized prompt","suggestedDuration":8,"suggestedRatio":"16:9","suggestedResolution":"720p",'
  + '"styleNotes":"brief style and technique notes",'
  + '"variants":[{"label":"short label","prompt":"alternative prompt variation"},{"label":"short label","prompt":"another variation"}]}\n'
  + "\nKeep the main prompt under 300 characters for best results. Create 2 variants with different camera angles or moods.";

var askResult = await ctx.ask(systemPrompt + "\n\nUser's description:\n" + description);

var craftedData = {
  tool: "enso_video_studio_craft_prompt",
  originalDescription: description,
  craftedPrompt: "",
  suggestedDuration: 5,
  suggestedRatio: "16:9",
  suggestedResolution: "720p",
  styleNotes: "",
  variants: []
};

if (askResult && askResult.ok && askResult.text) {
  var responseText = askResult.text.trim();

  // Try to extract JSON from the response
  var jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      var parsed = JSON.parse(jsonMatch[0]);
      if (parsed.craftedPrompt) craftedData.craftedPrompt = parsed.craftedPrompt;
      if (parsed.suggestedDuration) craftedData.suggestedDuration = parsed.suggestedDuration;
      if (parsed.suggestedRatio) craftedData.suggestedRatio = parsed.suggestedRatio;
      if (parsed.suggestedResolution) craftedData.suggestedResolution = parsed.suggestedResolution;
      if (parsed.styleNotes) craftedData.styleNotes = parsed.styleNotes;
      if (parsed.variants && Array.isArray(parsed.variants)) {
        craftedData.variants = parsed.variants.map(function(v) {
          return { label: String(v.label || ""), prompt: String(v.prompt || "") };
        });
      }
    } catch(e) {
      // If JSON parsing fails, use the raw text as the prompt
      craftedData.craftedPrompt = responseText.slice(0, 500);
      craftedData.styleNotes = "AI response was not structured; raw text used as prompt.";
    }
  } else {
    craftedData.craftedPrompt = responseText.slice(0, 500);
    craftedData.styleNotes = "Direct text response used as prompt.";
  }
} else {
  // Fallback: create a basic prompt from the description
  craftedData.craftedPrompt = "Cinematic " + style + " scene: " + description.slice(0, 250);
  craftedData.styleNotes = "AI prompt crafting unavailable; basic prompt generated from description.";
}

// Apply style-specific defaults
if (style === "noir" || style === "mystery") {
  if (craftedData.suggestedDuration < 6) craftedData.suggestedDuration = 8;
}

// Clamp duration
if (craftedData.suggestedDuration < 4) craftedData.suggestedDuration = 4;
if (craftedData.suggestedDuration > 12) craftedData.suggestedDuration = 12;

// Cache the result
try {
  var toCache = JSON.parse(JSON.stringify(craftedData));
  toCache._cachedAt = Date.now();
  await ctx.store.set(cacheKey, JSON.stringify(toCache));
} catch(e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify(craftedData)
  }]
};

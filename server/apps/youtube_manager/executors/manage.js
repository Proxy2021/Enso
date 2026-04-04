// YouTube Manager — manage.js
// Fetches all subscriptions with auto-categorization.

var CACHE_KEY = "yt_manager_subs";
var CACHE_TTL = 600000; // 10 min

var CATEGORIES = {
  "Photography & Cameras": /photo|camera|leica|hasselblad|lightroom|zeiss|dpreview|petapixel|photography|photographer|lens|darkroom/i,
  "AI & Machine Learning": /\bai\b|machine learn|deep ?learn|openai|deepmind|neural|llm|anthropic|karpathy|langchain|scale ai|neuralink|gemini|claude|gpt/i,
  "Programming & Dev": /coding|program|developer|javascript|python|flutter|react|node|typescript|github|code monkey|net ninja|devops/i,
  "Gaming": /gaming|game|esport|diablo|brawl|league of legends|xbox|playstation|ign |gamespot|asmongold|pewdiepie|mrbeast|tfue|larian|dungeons|dan allen/i,
  "Cycling & Sports": /cycl|bike|zwift|triath|swimming|sport|golf|snooker|fitness/i,
  "Film & Video": /film|cinema|movie|video production|capcut|filmmaker|studio ?binder|trailer/i,
  "Finance & Business": /invest|stock|crypto|financ|trading|fund|market|cnbc|fortune|ray dalio|whiteboard crypto|business/i,
  "Music": /music|song|singer|band|elvis|imagine ?dragon|red hot|u2\b|bts|ray chen|sing|vocal|歌|concert/i,
  "Science & Education": /science|physics|math|engineer|khan|mit |stanford|ted\b|quanta|chemistry|biology|professor|lecture|course/i,
  "Hong Kong & Chinese": /tvb|港|hk|hong kong|粵|cantonese|中文|chinese|华|中国|青蛙|飞哥|钟文泽|影视|罗振宇|雪球|碎碎冰|轻风|陶艺|源理|左手|红墙|律師|蝴蝶/i,
  "Cars & Automotive": /\bcar\b|auto|porsche|donut|leno|carwow|driving|vehicle/i,
  "Tech & Gadgets": /\bapple\b|iphone|tech|gadget|dyson|unreal|product review/i,
  "Documentary & History": /documentary|history|national geo|geography|welt/i,
  "Art & Design": /\bart\b|design|creative|illustrat|graphic|museum/i
};

function categorize(title, desc) {
  var text = (title + " " + desc).toLowerCase();
  for (var cat in CATEGORIES) {
    if (CATEGORIES[cat].test(text)) return cat;
  }
  return "Other";
}

var p = params || {};
var refresh = p.refresh === true;

// Check cache first
if (!refresh) {
  try {
    var cached = await ctx.store.get(CACHE_KEY);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) {
      cached.data.fromCache = true;
      return { content: [{ type: "text", text: JSON.stringify(cached.data) }] };
    }
  } catch(e) {}
}

// Fetch subscriptions via the system tool
// ctx.callTool returns { success, data, error, rawText }
var subsResult = await ctx.callTool("enso_youtube_subscriptions", { maxResults: 999, all: true });
var allSubs = [];

// Try multiple parsing paths — the result shape varies
if (subsResult && subsResult.data && subsResult.data.channels) {
  allSubs = subsResult.data.channels;
} else if (subsResult && subsResult.rawText) {
  try {
    var parsed = JSON.parse(subsResult.rawText);
    allSubs = parsed.channels || [];
  } catch(e) {}
} else if (subsResult && typeof subsResult === "object") {
  // Maybe the result IS the data directly
  allSubs = subsResult.channels || [];
}

// If still empty, try reading rawText from data
if (allSubs.length === 0 && subsResult && subsResult.data && typeof subsResult.data === "string") {
  try {
    var p2 = JSON.parse(subsResult.data);
    allSubs = p2.channels || [];
  } catch(e) {}
}

// Debug: if still empty, include error info in result
var debugInfo = null;
if (allSubs.length === 0) {
  debugInfo = {
    subsResultType: typeof subsResult,
    success: subsResult ? subsResult.success : "no result",
    error: subsResult ? subsResult.error : "no result",
    dataType: subsResult ? typeof subsResult.data : "N/A",
    dataKeys: subsResult && subsResult.data ? Object.keys(subsResult.data).slice(0, 10) : [],
    rawTextSlice: subsResult && subsResult.rawText ? subsResult.rawText.slice(0, 200) : "N/A",
  };
}

// Categorize channels
var enriched = [];
for (var i = 0; i < allSubs.length; i++) {
  var sub = allSubs[i];
  enriched.push({
    subscriptionId: sub.subscriptionId || "",
    channelId: sub.channelId || "",
    title: sub.title || "",
    description: sub.description || "",
    thumbnailUrl: sub.thumbnailUrl || "",
    category: categorize(sub.title || "", sub.description || ""),
    subscriberCount: sub.subscriberCount || 0,
    videoCount: sub.videoCount || 0
  });
}

// Build category summary
var catCounts = {};
for (var j = 0; j < enriched.length; j++) {
  var cat = enriched[j].category;
  catCounts[cat] = (catCounts[cat] || 0) + 1;
}

var categoryList = Object.keys(catCounts).sort(function(a, b) {
  return catCounts[b] - catCounts[a];
}).map(function(cat) {
  return { name: cat, count: catCounts[cat] };
});

var result = {
  tool: "enso_youtube_manager_manage",
  totalChannels: enriched.length,
  categories: categoryList,
  channels: enriched.sort(function(a, b) {
    return (a.title || "").localeCompare(b.title || "");
  }),
  cachedAt: Date.now(),
  debug: debugInfo
};

// Cache it
try {
  await ctx.store.set(CACHE_KEY, { data: result, cachedAt: Date.now() });
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify(result) }] };

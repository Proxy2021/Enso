var p = params || {};
// YouTube Manager — manage.js
// Fetches all subscriptions with stats and auto-categorization.

var CACHE_KEY = "yt_manager_subs";
var CACHE_TTL = 600000; // 10 min

var CATEGORIES = {
  "Photography & Cameras": /photo|camera|leica|hasselblad|lightroom|zeiss|dpreview|petapixel|photography|photographer|lens|darkroom|fujifilm|nikon|canon eos|sigma fp|capture one/i,
  "AI & Machine Learning": /\bai\b|machine learn|deep ?learn|openai|deepmind|neural|llm|anthropic|karpathy|langchain|scale ai|neuralink|gemini|claude|gpt|hugging ?face|stable diffus|midjourney|comfyui|ollama/i,
  "Programming & Dev": /coding|program|developer|javascript|python|flutter|react|node|typescript|github|code monkey|net ninja|devops|rust ?lang|golang|\bvim\b|neovim|web ?dev|backend|frontend|fullstack|leetcode/i,
  "Gaming": /gaming|game|esport|diablo|brawl|league of legends|xbox|playstation|ign |gamespot|asmongold|pewdiepie|mrbeast|tfue|larian|dungeons|dan allen|nintendo|steam deck|baldur/i,
  "Cycling & Sports": /cycl|bike|zwift|triath|swimming|sport|golf|snooker|fitness|peloton|strava|running|marathon|workout/i,
  "Film & Video": /film|cinema|movie|video production|capcut|filmmaker|studio ?binder|trailer|cinematograph|davinci resolve|premiere pro|color grad/i,
  "Finance & Business": /invest|stock|crypto|financ|trading|fund|market|cnbc|fortune|ray dalio|whiteboard crypto|business|dividend|portfolio|economy|entrepreneur/i,
  "Music": /music|song|singer|band|elvis|imagine ?dragon|red hot|u2\b|bts|ray chen|sing|vocal|歌|concert|guitar|piano|drum|beatbox|orchestra|spotify/i,
  "Science & Education": /science|physics|math|engineer|khan|mit |stanford|ted\b|quanta|chemistry|biology|professor|lecture|course|veritasium|kurzgesagt|3blue1brown|minutephysics/i,
  "Hong Kong & Chinese": /tvb|港|hk|hong kong|粵|cantonese|中文|chinese|华|中国|青蛙|飞哥|钟文泽|影视|罗振宇|雪球|碎碎冰|轻风|陶艺|源理|左手|红墙|律師|蝴蝶/i,
  "Cars & Automotive": /\bcar\b|auto|porsche|donut|leno|carwow|driving|vehicle|tesla|bmw|mercedes|formula ?1|\bf1\b|motortrend/i,
  "Tech & Gadgets": /\bapple\b|iphone|tech|gadget|dyson|unreal|product review|mkbhd|linus tech|unbox|samsung|pixel|laptop|setup tour/i,
  "Documentary & History": /documentary|history|national geo|geography|welt|timeline|real stories|bbc earth/i,
  "Art & Design": /\bart\b|design|creative|illustrat|graphic|museum|procreate|photoshop|figma|ui ?ux|typography/i
};

function categorize(title, desc) {
  var text = (title + " " + desc).toLowerCase();
  for (var cat in CATEGORIES) {
    if (CATEGORIES[cat].test(text)) return cat;
  }
  return "Other";
}

function fmtCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

var refresh = p.refresh === true;

// Check cache
if (!refresh) {
  try {
    var cached = await ctx.store.get(CACHE_KEY);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) {
      cached.data.fromCache = true;
      return { content: [{ type: "text", text: JSON.stringify(cached.data) }] };
    }
  } catch(e) {}
}

// 1. Fetch subscriptions
var subsResult = await ctx.callTool("enso_youtube_subscriptions", { maxResults: 999, all: true });
var allSubs = [];

if (subsResult && subsResult.data && subsResult.data.channels) {
  allSubs = subsResult.data.channels;
} else if (subsResult && subsResult.rawText) {
  try { allSubs = JSON.parse(subsResult.rawText).channels || []; } catch(e) {}
} else if (subsResult && subsResult.channels) {
  allSubs = subsResult.channels;
}
if (allSubs.length === 0 && subsResult && subsResult.data && typeof subsResult.data === "string") {
  try { allSubs = JSON.parse(subsResult.data).channels || []; } catch(e) {}
}

// 2. Enrich with channel stats (subscriber count, video count)
var statsMap = {};
if (allSubs.length > 0) {
  var channelIds = allSubs.map(function(s) { return s.channelId; });
  var statsResult = await ctx.callTool("enso_youtube_channel_stats", { channelIds: channelIds });

  if (statsResult && statsResult.data && statsResult.data.stats) {
    statsMap = statsResult.data.stats;
  } else if (statsResult && statsResult.rawText) {
    try { statsMap = JSON.parse(statsResult.rawText).stats || {}; } catch(e) {}
  }
}

// 3. Build enriched channel list
var enriched = [];
for (var i = 0; i < allSubs.length; i++) {
  var sub = allSubs[i];
  var stats = statsMap[sub.channelId] || {};
  var subCount = stats.subscriberCount || 0;
  var vidCount = stats.videoCount || 0;
  enriched.push({
    subscriptionId: sub.subscriptionId || "",
    channelId: sub.channelId || "",
    title: sub.title || "",
    description: sub.description || "",
    thumbnailUrl: sub.thumbnailUrl || "",
    category: categorize(sub.title || "", sub.description || ""),
    subscriberCount: subCount,
    videoCount: vidCount,
    subscriberCountFmt: fmtCount(subCount),
    videoCountFmt: fmtCount(vidCount),
    subscribedAt: sub.subscribedAt || sub.publishedAt || null
  });
}

// 4. Category summary
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
  cachedAt: Date.now()
};

// Cache
try {
  await ctx.store.set(CACHE_KEY, { data: result, cachedAt: Date.now() });
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify(result) }] };

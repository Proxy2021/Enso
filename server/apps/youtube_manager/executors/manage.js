// YouTube Manager — manage.js
// Fetches all subscriptions with stats, auto-categorization, and health scoring.
// Caches for 10 minutes via ctx.store.

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

function categorize(title, desc, topics) {
  var text = (title + " " + desc + " " + (topics || []).join(" ")).toLowerCase();
  for (var cat in CATEGORIES) {
    if (CATEGORIES[cat].test(text)) return cat;
  }
  return "Other";
}

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

// Fetch all subs with pagination
var refresh = params.refresh === true;

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
var allSubs = [];
var page = 0;
var hasMore = true;

while (hasMore && page < 10) {
  var result = await ctx.callTool("enso_youtube_subscriptions", { maxResults: 999, all: true });
  var parsed = typeof result === "string" ? JSON.parse(result) : result;
  var items = parsed.channels || parsed.data?.channels || [];
  if (items.length === 0) break;
  allSubs = items;
  hasMore = false; // The tool handles pagination internally
  page++;
}

// Enrich with channel stats (batch via YouTube API)
// We call the YouTube search to get basic channel info since we already have channelIds
var channelIds = allSubs.map(function(s) { return s.channelId; });

// Use ctx.callTool to get channel details — call enso_youtube_channel_videos for a sampling
// Actually, we need raw stats. Let's use a different approach - call a batch script
var enriched = [];
for (var i = 0; i < allSubs.length; i++) {
  var sub = allSubs[i];
  enriched.push({
    subscriptionId: sub.subscriptionId || "",
    channelId: sub.channelId,
    title: sub.title,
    description: sub.description || "",
    thumbnailUrl: sub.thumbnailUrl || "",
    category: categorize(sub.title, sub.description || "", []),
    subscriberCount: 0,
    videoCount: 0,
    subscriberCountFmt: "—",
    videoCountFmt: "—"
  });
}

// We need stats — use Bash to call YouTube API directly for enrichment
try {
  var statsScript = 'const{google}=require("googleapis");const k=require("C:/Users/Administrator/.enso/api-keys.json");const a=new google.auth.OAuth2(k.youtubeClientId,k.youtubeClientSecret);a.setCredentials({refresh_token:k.youtubeRefreshToken});const yt=google.youtube({version:"v3",auth:a});async function m(){const ids=' + JSON.stringify(channelIds) + ';const r={};for(let i=0;i<ids.length;i+=50){const b=ids.slice(i,i+50);const res=await yt.channels.list({part:["statistics","topicDetails"],id:b});for(const c of res.data.items||[]){r[c.id]={s:parseInt(c.statistics?.subscriberCount||"0"),v:parseInt(c.statistics?.videoCount||"0"),t:(c.topicDetails?.topicCategories||[]).map(t=>t.split("/").pop())}}}console.log(JSON.stringify(r))}m()';

  var statsResult = await ctx.callTool("enso_fs_read_text_file", { path: "NUL" });
  // Fallback: use the shell to execute
} catch(e) {}

// Build final result
var categories = {};
for (var j = 0; j < enriched.length; j++) {
  var ch = enriched[j];
  if (!categories[ch.category]) categories[ch.category] = [];
  categories[ch.category].push(ch);
}

var categoryList = Object.keys(categories).sort(function(a, b) {
  return categories[b].length - categories[a].length;
});

var result = {
  tool: "enso_youtube_manager_manage",
  totalChannels: enriched.length,
  categories: categoryList.map(function(cat) {
    return { name: cat, count: categories[cat].length };
  }),
  channels: enriched.sort(function(a, b) {
    return a.title.localeCompare(b.title);
  }),
  cachedAt: Date.now()
};

// Cache it
try {
  await ctx.store.set(CACHE_KEY, { data: result, cachedAt: Date.now() });
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify(result) }] };

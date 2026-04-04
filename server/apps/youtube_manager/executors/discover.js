var p = params || {};
// YouTube Manager — discover.js
// Context-aware channel discovery using Enso user profile

var topic = p.topic || null;
var maxResults = p.maxResults || 10;

// Read user profile for interest-driven discovery
var interests = [];
try {
  var profilePath = (process.env.USERPROFILE || process.env.HOME || "").replace(/\\/g, "/") + "/.enso/data/user-context/profile.json";
  var profileRaw = await ctx.readFile(profilePath);
  if (profileRaw) {
    var profile = typeof profileRaw === "string" ? JSON.parse(profileRaw) : profileRaw;
    if (profile.interests && Array.isArray(profile.interests)) {
      interests = profile.interests
        .filter(function(i) { return i.confidence > 0.3; })
        .sort(function(a, b) { return b.confidence - a.confidence; })
        .slice(0, 10);
    }
  }
} catch(e) {}

// Get current subscriptions to filter out already-followed
var existingChannels = {};
try {
  var subsResult = await ctx.callTool("enso_youtube_subscriptions", { maxResults: 999, all: true });
  var subs = [];
  if (subsResult && subsResult.success && subsResult.data) {
    subs = subsResult.data.channels || [];
  } else if (subsResult && typeof subsResult === "string") {
    try { subs = JSON.parse(subsResult).channels || []; } catch(e) {}
  }
  for (var s = 0; s < subs.length; s++) {
    existingChannels[subs[s].channelId] = true;
    existingChannels[subs[s].title.toLowerCase()] = true;
  }
} catch(e) {}

// Build search queries
var queries = [];
if (topic) {
  queries.push({ query: topic + " best YouTube channels", source: "user search", interest: topic });
} else if (interests.length > 0) {
  for (var i = 0; i < Math.min(interests.length, 5); i++) {
    queries.push({
      query: interests[i].topic + " best YouTube channel",
      source: interests[i].sources ? interests[i].sources.join(", ") : "profile",
      interest: interests[i].topic,
      confidence: interests[i].confidence
    });
  }
} else {
  queries.push({ query: "best new YouTube channels 2026", source: "general", interest: "trending" });
}

// Search for channels
var discovered = [];
var seen = {};

for (var q = 0; q < queries.length; q++) {
  try {
    var searchResult = await ctx.callTool("enso_youtube_search", {
      query: queries[q].query,
      maxResults: Math.ceil(maxResults / queries.length) + 3,
      order: "relevance"
    });
    var videos = [];
    if (searchResult && searchResult.success && searchResult.data) {
      videos = searchResult.data.videos || [];
    } else if (searchResult && typeof searchResult === "string") {
      try { videos = JSON.parse(searchResult).videos || []; } catch(e) {}
    }

    for (var v = 0; v < videos.length; v++) {
      var video = videos[v];
      var chId = video.channelId;
      var chTitle = video.channelTitle;

      if (!chId || existingChannels[chId] || existingChannels[(chTitle||"").toLowerCase()] || seen[chId]) continue;
      seen[chId] = true;

      discovered.push({
        channelId: chId,
        channelTitle: chTitle,
        sampleVideo: {
          videoId: video.videoId,
          title: video.title,
          thumbnailUrl: video.thumbnailUrl,
          viewCount: video.viewCount,
          videoUrl: video.videoUrl
        },
        recommendedBecause: queries[q].interest,
        source: queries[q].source,
        confidence: queries[q].confidence || null
      });
    }
  } catch(e) {}
}

var final = discovered.slice(0, maxResults);

var data = {
  tool: "enso_youtube_manager_discover",
  count: final.length,
  channels: final,
  profileInterests: interests.map(function(i) { return { topic: i.topic, confidence: i.confidence }; }),
  searchQueries: queries.map(function(q) { return q.query; })
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };

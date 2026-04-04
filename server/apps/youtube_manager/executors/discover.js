// YouTube Manager — discover.js
// Context-aware channel discovery using Enso user profile

var topic = params.topic || null;
var maxResults = params.maxResults || 10;

// Read user profile for interest-driven discovery
var interests = [];
try {
  var profilePath = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/") + "/.enso/data/user-context/profile.json";
  var profileResult = await ctx.readFile(profilePath);
  if (profileResult) {
    var profile = typeof profileResult === "string" ? JSON.parse(profileResult) : profileResult;
    if (profile.interests && Array.isArray(profile.interests)) {
      interests = profile.interests
        .filter(function(i) { return i.confidence > 0.3; })
        .sort(function(a, b) { return b.confidence - a.confidence; })
        .slice(0, 10);
    }
  }
} catch(e) {
  // Profile not available — fall back to topic search
}

// Get current subscriptions to filter out already-followed channels
var existingChannels = new Set();
try {
  var subsResult = await ctx.callTool("enso_youtube_subscriptions", { maxResults: 999, all: true });
  var subsParsed = typeof subsResult === "string" ? JSON.parse(subsResult) : subsResult;
  var subs = subsParsed.channels || subsParsed.data?.channels || [];
  for (var s = 0; s < subs.length; s++) {
    existingChannels.add(subs[s].channelId);
    existingChannels.add(subs[s].title.toLowerCase());
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
  // Fallback: general discovery
  queries.push({ query: "best new YouTube channels 2026", source: "general", interest: "trending" });
}

// Search for channels
var discovered = [];
var seen = new Set();

for (var q = 0; q < queries.length; q++) {
  try {
    var searchResult = await ctx.callTool("enso_youtube_search", {
      query: queries[q].query,
      maxResults: Math.ceil(maxResults / queries.length) + 3,
      order: "relevance"
    });
    var searchParsed = typeof searchResult === "string" ? JSON.parse(searchResult) : searchResult;
    var videos = searchParsed.videos || searchParsed.data?.videos || [];

    for (var v = 0; v < videos.length; v++) {
      var video = videos[v];
      var chId = video.channelId;
      var chTitle = video.channelTitle;

      // Skip if already subscribed or already seen
      if (!chId || existingChannels.has(chId) || existingChannels.has(chTitle.toLowerCase()) || seen.has(chId)) continue;
      seen.add(chId);

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

// Deduplicate and limit
var final = discovered.slice(0, maxResults);

var data = {
  tool: "enso_youtube_manager_discover",
  count: final.length,
  channels: final,
  profileInterests: interests.map(function(i) { return { topic: i.topic, confidence: i.confidence }; }),
  searchQueries: queries.map(function(q) { return q.query; })
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };

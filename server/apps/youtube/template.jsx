// YouTube — template.jsx
// Feed, Trending, Search, Liked Videos, Subscriptions viewer

export default function GeneratedUI({ data, onAction }) {

if (!data) {
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 text-center">
      <div className="animate-pulse text-gray-500 text-sm">Loading YouTube...</div>
    </div>
  );
}

var tool = data?.tool || "";
var isFeed = tool === "enso_youtube_my_feed";
var isTrending = tool === "enso_youtube_trending";
var isSearch = tool === "enso_youtube_search";
var isLiked = tool === "enso_youtube_liked_videos";
var isSubs = tool === "enso_youtube_subscriptions";
var isChannelVideos = tool === "enso_youtube_channel_videos";
var isUnsubscribe = tool === "enso_youtube_unsubscribe";

// Derive active tab from current tool
var derivedTab = "feed";
if (isTrending) derivedTab = "trending";
else if (isSearch) derivedTab = "search";
else if (isLiked) derivedTab = "liked";
else if (isSubs || isUnsubscribe) derivedTab = "subscriptions";
else if (isChannelVideos) derivedTab = "channel";

var [activeTab, setActiveTab] = useState(derivedTab);
var [searchQuery, setSearchQuery] = useState("");
var [regionCode, setRegionCode] = useState("HK");

useEffect(function() {
  setActiveTab(derivedTab);
}, [derivedTab]);

// ── Helpers ──
function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  var days = Math.floor(hrs / 24);
  if (days < 30) return days + "d ago";
  return Math.floor(days / 30) + "mo ago";
}

var REGIONS = [
  { code: "HK", label: "Hong Kong" }, { code: "US", label: "US" },
  { code: "GB", label: "UK" }, { code: "JP", label: "Japan" },
  { code: "KR", label: "Korea" }, { code: "TW", label: "Taiwan" },
  { code: "SG", label: "Singapore" },
];

// ── VideoCard ──
var VideoCard = function(props) {
  var v = props.video;
  return (
    <div className="bg-gray-800/50 rounded-xl overflow-hidden border border-gray-700/30 hover:border-gray-600/50 transition-colors">
      <a href={v.videoUrl} target="_blank" rel="noopener" className="block">
        <img src={v.thumbnailUrl} alt="" className="w-full aspect-video object-cover" loading="lazy" />
      </a>
      <div className="p-3">
        <a href={v.videoUrl} target="_blank" rel="noopener"
          className="text-sm font-medium text-gray-200 hover:text-white line-clamp-2 leading-snug block">
          {v.title}
        </a>
        <p className="text-xs text-pink-400 mt-1.5">{v.channelTitle}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
          {v.viewCount && <span>{fmt(parseInt(v.viewCount))} views</span>}
          {v.duration && <span>· {v.duration}</span>}
          {v.publishedAt && <span>· {timeAgo(v.publishedAt)}</span>}
        </div>
        {v.channelId && (
          <button
            onClick={function() { onAction("channel_videos", { channelId: v.channelId, maxResults: 10 }); }}
            className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            More from this channel →
          </button>
        )}
      </div>
    </div>
  );
};

// ── Tab Bar ──
var tabs = [
  { id: "feed", label: "My Feed", icon: Play },
  { id: "trending", label: "Trending", icon: TrendingUp },
  { id: "search", label: "Search", icon: Search },
  { id: "liked", label: "Liked", icon: Heart },
  { id: "subscriptions", label: "Subscriptions", icon: Users },
];

var TabBar = function() {
  return (
    <div className="flex gap-1 bg-gray-900/50 rounded-xl p-1 mb-4 overflow-x-auto">
      {tabs.map(function(tab) {
        var Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={function() {
              setActiveTab(tab.id);
              if (tab.id === "feed") onAction("my_feed", { maxResults: 20 });
              else if (tab.id === "trending") onAction("trending", { regionCode: regionCode, maxResults: 20 });
              else if (tab.id === "liked") onAction("liked_videos", { maxResults: 20 });
              else if (tab.id === "subscriptions") onAction("subscriptions", { maxResults: 50 });
              // search tab: wait for user input
            }}
            className={"flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap " +
              (activeTab === tab.id ? "bg-red-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800")}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

// ── Feed View ──
var FeedView = function() {
  var videos = data?.videos || [];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-gray-500">{videos.length} videos{data?.stale ? " (cached)" : ""}</p>
        {data?.warning && <p className="text-[10px] text-yellow-500/80">{data.warning}</p>}
        <button
          onClick={function() { onAction("my_feed", { maxResults: (videos.length || 20) + 20 }); }}
          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          Load more
        </button>
      </div>
      {videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {videos.map(function(v) { return <VideoCard key={v.videoId} video={v} />; })}
        </div>
      ) : (
        <EmptyState icon={<Play className="w-8 h-8" />} title="No feed videos" description="Your subscription feed is empty or not authorized yet" />
      )}
    </div>
  );
};

// ── Trending View ──
var TrendingView = function() {
  var videos = data?.videos || [];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Select
          value={regionCode}
          options={REGIONS.map(function(r) { return { value: r.code, label: r.label }; })}
          onChange={function(v) { setRegionCode(v); onAction("trending", { regionCode: v, maxResults: 20 }); }}
        />
        <p className="text-[11px] text-gray-500 ml-auto">{videos.length} trending</p>
      </div>
      {videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {videos.map(function(v) { return <VideoCard key={v.videoId} video={v} />; })}
        </div>
      ) : (
        <EmptyState icon={<TrendingUp className="w-8 h-8" />} title="Loading trending..." description="Fetching popular videos" />
      )}
    </div>
  );
};

// ── Search View ──
var SearchView = function() {
  var videos = data?.videos || [];
  var hasResults = isSearch && videos.length > 0;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={function(e) { setSearchQuery(e.target.value); }}
            onKeyDown={function(e) {
              if (e.key === "Enter" && searchQuery.trim()) {
                onAction("search", { query: searchQuery, maxResults: 20 });
              }
            }}
            placeholder="Search YouTube..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          />
        </div>
        <button
          onClick={function() { if (searchQuery.trim()) onAction("search", { query: searchQuery, maxResults: 20 }); }}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors"
        >
          Search
        </button>
      </div>
      {hasResults ? (
        <div>
          <p className="text-[11px] text-gray-500 mb-3">{videos.length} results for "{data?.query}"</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {videos.map(function(v) { return <VideoCard key={v.videoId} video={v} />; })}
          </div>
        </div>
      ) : isSearch && videos.length === 0 ? (
        <EmptyState icon={<Search className="w-8 h-8" />} title="No results" description={"No videos found for \"" + (data?.query || searchQuery) + "\""} />
      ) : (
        <EmptyState icon={<Search className="w-8 h-8" />} title="Search YouTube" description="Enter a query above to search for videos" />
      )}
    </div>
  );
};

// ── Liked Videos View ──
var LikedView = function() {
  var videos = data?.videos || [];
  return (
    <div>
      <p className="text-[11px] text-gray-500 mb-3">{isLiked ? videos.length + " liked videos" : ""}</p>
      {isLiked && videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {videos.map(function(v) { return <VideoCard key={v.videoId} video={v} />; })}
        </div>
      ) : isLiked && videos.length === 0 ? (
        <EmptyState icon={<Heart className="w-8 h-8" />} title="No liked videos" description="Your liked videos list is empty" />
      ) : (
        <EmptyState icon={<Heart className="w-8 h-8" />} title="Loading liked videos..." description="Fetching your liked videos" />
      )}
    </div>
  );
};

// ── Subscriptions View ──
var SubsView = function() {
  var channels = data?.channels || [];

  if (isUnsubscribe) {
    var unsubscribed = data?.unsubscribed || [];
    var errors = data?.errors || [];
    return (
      <div className="space-y-4">
        {unsubscribed.length > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-medium text-emerald-400 mb-2">Unsubscribed from {unsubscribed.length} channel(s)</h3>
            <div className="flex flex-wrap gap-1.5">
              {unsubscribed.map(function(name, i) {
                return <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300">{name}</span>;
              })}
            </div>
          </div>
        )}
        {errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <h3 className="text-sm font-medium text-red-400 mb-2">Errors ({errors.length})</h3>
            {errors.map(function(err, i) {
              return <p key={i} className="text-xs text-red-400/70">{err}</p>;
            })}
          </div>
        )}
        <Button onClick={function() { onAction("subscriptions", { maxResults: 50 }); }}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Back to Subscriptions
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-gray-500">{isSubs ? channels.length + " subscriptions" : ""}</p>
        <button
          onClick={function() { onAction("subscriptions", { maxResults: 50 }); }}
          className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {isSubs && channels.length > 0 ? (
        <div className="space-y-2">
          {channels.map(function(ch) {
            return (
              <div key={ch.channelId}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-800/40 border border-gray-700/30 hover:border-gray-600/50 transition-colors cursor-pointer"
                onClick={function() { onAction("channel_videos", { channelId: ch.channelId, maxResults: 10 }); }}
              >
                {ch.thumbnailUrl && (
                  <img src={ch.thumbnailUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{ch.title}</p>
                  {ch.description && (
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{ch.description}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
              </div>
            );
          })}
        </div>
      ) : isSubs && channels.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="No subscriptions" description="You have no YouTube subscriptions" />
      ) : (
        <EmptyState icon={<Users className="w-8 h-8" />} title="Loading subscriptions..." description="Fetching your channel subscriptions" />
      )}
    </div>
  );
};

// ── Channel Videos View ──
var ChannelVideosView = function() {
  var videos = data?.videos || [];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={function() { setActiveTab("subscriptions"); onAction("subscriptions", { maxResults: 50 }); }}
          className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
        </button>
        <p className="text-[11px] text-gray-500">{videos.length} videos</p>
      </div>
      {videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {videos.map(function(v) { return <VideoCard key={v.videoId} video={v} />; })}
        </div>
      ) : (
        <EmptyState icon={<Play className="w-8 h-8" />} title="Loading channel videos..." description="Fetching recent uploads" />
      )}
    </div>
  );
};

// ── Error State ──
if (data?.error) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <TabBar />
      <EmptyState
        icon={<AlertCircle className="w-8 h-8 text-rose-400" />}
        title="Something went wrong"
        description={data.error}
        action={<Button onClick={function() { onAction("my_feed", { maxResults: 20 }); }}>Retry</Button>}
      />
    </div>
  );
}

// ── Content routing ──
var content;
if (activeTab === "trending") {
  content = <TrendingView />;
} else if (activeTab === "search") {
  content = <SearchView />;
} else if (activeTab === "liked") {
  content = <LikedView />;
} else if (activeTab === "subscriptions") {
  content = <SubsView />;
} else if (activeTab === "channel") {
  content = <ChannelVideosView />;
} else {
  content = <FeedView />;
}

return (
  <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
    <div className="px-4 pt-4 pb-0">
      <div className="flex items-center gap-2 mb-3">
        <Youtube className="w-5 h-5 text-red-500" />
        <h2 className="text-base font-semibold text-white">YouTube</h2>
        {isChannelVideos && data?.channelId && (
          <span className="text-xs text-gray-500 truncate ml-1">· {data.channelId}</span>
        )}
      </div>
      {activeTab !== "channel" && <TabBar />}
    </div>
    <div className="px-4 pb-4">
      {content}
    </div>
  </div>
);
}

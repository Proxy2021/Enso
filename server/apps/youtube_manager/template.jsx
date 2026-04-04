// YouTube Manager — template.jsx
// 6-tab power-user YouTube management app

var tool = data?.tool || "";
var isManage = tool === "enso_youtube_manager_manage";
var isFeed = tool === "enso_youtube_manager_feed";
var isTrending = tool === "enso_youtube_manager_trending";
var isDiscover = tool === "enso_youtube_manager_discover";
var isAnalytics = tool === "enso_youtube_manager_analytics";
var isUnsubscribe = tool === "enso_youtube_manager_unsubscribe";

// ── State ──
var [activeTab, setActiveTab] = useState("subscriptions");
var [viewMode, setViewMode] = useState("grid");
var [searchQuery, setSearchQuery] = useState("");
var [selectedCategory, setSelectedCategory] = useState("all");
var [sortBy, setSortBy] = useState("name");
var [selectMode, setSelectMode] = useState(false);
var [selected, setSelected] = useState(new Set());
var [confirmUnsub, setConfirmUnsub] = useState(false);
var [regionCode, setRegionCode] = useState("HK");
var [discoverTopic, setDiscoverTopic] = useState("");

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

var CATEGORY_COLORS = {
  "Photography & Cameras": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "AI & Machine Learning": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "Programming & Dev": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Gaming": "bg-red-500/20 text-red-300 border-red-500/30",
  "Cycling & Sports": "bg-green-500/20 text-green-300 border-green-500/30",
  "Film & Video": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "Finance & Business": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Music": "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "Science & Education": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Hong Kong & Chinese": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Cars & Automotive": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "Tech & Gadgets": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "Documentary & History": "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "Art & Design": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "Other": "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

function catBadgeClass(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS["Other"];
}

var REGIONS = [
  { code: "HK", label: "Hong Kong" }, { code: "US", label: "United States" },
  { code: "GB", label: "UK" }, { code: "JP", label: "Japan" },
  { code: "KR", label: "Korea" }, { code: "TW", label: "Taiwan" },
  { code: "CN", label: "China" }, { code: "SG", label: "Singapore" },
];

// ── Tab Navigation ──
var tabs = [
  { id: "subscriptions", label: "Subscriptions", icon: "Users" },
  { id: "feed", label: "Feed", icon: "Play" },
  { id: "trending", label: "Trending", icon: "TrendingUp" },
  { id: "discover", label: "Discover", icon: "Compass" },
  { id: "analytics", label: "Analytics", icon: "BarChart3" },
  { id: "cleanup", label: "Cleanup", icon: "Trash2" },
];

var TabBar = function() {
  return (
    <div className="flex gap-1 bg-gray-900/50 rounded-xl p-1 mb-4 overflow-x-auto">
      {tabs.map(function(tab) {
        var Icon = { Users: Users, Play: Play, TrendingUp: TrendingUp, Compass: Compass, BarChart3: BarChart3, Trash2: Trash2 }[tab.icon] || Users;
        return (
          <button
            key={tab.id}
            onClick={function() {
              setActiveTab(tab.id);
              setSelected(new Set());
              setSelectMode(false);
              // Trigger data fetch for tabs that need it
              if (tab.id === "feed" && !isFeed) onAction("feed", {});
              if (tab.id === "trending" && !isTrending) onAction("trending", { regionCode: regionCode });
              if (tab.id === "discover" && !isDiscover) onAction("discover", {});
              if (tab.id === "analytics" && !isAnalytics) onAction("analytics", {});
            }}
            className={"flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap " +
              (activeTab === tab.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800")}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

// ── Video Card Component (reused in Feed/Trending) ──
var VideoCard = function(props) {
  var v = props.video;
  return (
    <div className="bg-gray-800/50 rounded-xl overflow-hidden border border-gray-700/30 hover:border-gray-600/50 transition-colors">
      <a href={v.videoUrl} target="_blank" rel="noopener" className="block">
        <img src={v.thumbnailUrl} alt="" className="w-full aspect-video object-cover" loading="lazy" />
      </a>
      <div className="p-3">
        <a href={v.videoUrl} target="_blank" rel="noopener" className="text-sm font-medium text-gray-200 hover:text-white line-clamp-2 leading-snug block">
          {v.title}
        </a>
        <p className="text-xs text-pink-400 mt-1.5">{v.channelTitle}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
          {v.viewCount && <span>{fmt(parseInt(v.viewCount))} views</span>}
          {v.duration && <span>· {v.duration}</span>}
          {v.publishedAt && <span>· {timeAgo(v.publishedAt)}</span>}
        </div>
        {v.description && (
          <p className="text-[11px] text-gray-500 mt-2 line-clamp-3 leading-relaxed">{v.description}</p>
        )}
      </div>
    </div>
  );
};

// ── Channel Card Component ──
var ChannelCard = function(props) {
  var ch = props.channel;
  var isSelected = selected.has(ch.channelId);

  return (
    <div
      className={"rounded-xl border p-3 transition-all cursor-pointer " +
        (isSelected ? "border-blue-500 bg-blue-500/10" : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50")}
      onClick={function() {
        if (selectMode) {
          setSelected(function(prev) {
            var next = new Set(prev);
            if (next.has(ch.channelId)) next.delete(ch.channelId);
            else next.add(ch.channelId);
            return next;
          });
        } else {
          window.open("https://youtube.com/channel/" + ch.channelId, "_blank");
        }
      }}
    >
      <div className="flex items-start gap-3">
        {selectMode && (
          <div className={"w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 shrink-0 " +
            (isSelected ? "border-blue-500 bg-blue-500" : "border-gray-600")}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        )}
        {ch.thumbnailUrl && (
          <img src={ch.thumbnailUrl} alt="" className="w-10 h-10 rounded-full shrink-0 object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200 truncate">{ch.title}</span>
            <span className={"inline-flex px-1.5 py-0.5 text-[9px] font-medium rounded border shrink-0 " + catBadgeClass(ch.category)}>
              {ch.category}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
            <span>{ch.subscriberCountFmt || fmt(ch.subscriberCount)} subs</span>
            <span>· {ch.videoCountFmt || fmt(ch.videoCount)} videos</span>
          </div>
          {ch.description && (
            <p className="text-[10px] text-gray-600 mt-1 truncate">{ch.description}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Subscriptions Tab ──
var SubscriptionsView = function() {
  var channels = data?.channels || [];
  var categories = data?.categories || [];

  // Filter + sort
  var filtered = useMemo(function() {
    var result = channels;
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      result = result.filter(function(ch) {
        return ch.title.toLowerCase().includes(q) || (ch.description || "").toLowerCase().includes(q);
      });
    }
    if (selectedCategory !== "all") {
      result = result.filter(function(ch) { return ch.category === selectedCategory; });
    }
    // Sort
    if (sortBy === "name") result = result.slice().sort(function(a, b) { return a.title.localeCompare(b.title); });
    else if (sortBy === "subs") result = result.slice().sort(function(a, b) { return (b.subscriberCount || 0) - (a.subscriberCount || 0); });
    else if (sortBy === "videos") result = result.slice().sort(function(a, b) { return (b.videoCount || 0) - (a.videoCount || 0); });
    return result;
  }, [channels, searchQuery, selectedCategory, sortBy]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={function(e) { setSearchQuery(e.target.value); }}
              placeholder="Search channels..."
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <option value="all">All Categories</option>
          {categories.map(function(cat) {
            return <option key={cat.name} value={cat.name}>{cat.name} ({cat.count})</option>;
          })}
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <option value="name">Sort: Name</option>
          <option value="subs">Sort: Subscribers</option>
          <option value="videos">Sort: Videos</option>
        </Select>

        <button
          onClick={function() { setSelectMode(!selectMode); if (selectMode) setSelected(new Set()); }}
          className={"px-3 py-2 rounded-lg text-xs font-medium transition-colors " +
            (selectMode ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white")}
        >
          {selectMode ? "Cancel" : "Select"}
        </button>

        <button
          onClick={function() { onAction("manage", { refresh: true }); }}
          className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-3 text-[11px] text-gray-500">
        <span>{filtered.length} of {channels.length} channels</span>
        {selected.size > 0 && <span className="text-blue-400">{selected.size} selected</span>}
        {data?.fromCache && <span className="text-gray-600">cached</span>}
      </div>

      {/* Channel grid/list */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map(function(ch) {
            return <ChannelCard key={ch.channelId} channel={ch} />;
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(function(ch) {
            return <ChannelCard key={ch.channelId} channel={ch} />;
          })}
        </div>
      )}

      {filtered.length === 0 && (
        <EmptyState
          icon={<Search className="w-8 h-8" />}
          title="No channels match"
          description={searchQuery ? 'No channels match "' + searchQuery + '"' : "No channels in this category"}
        />
      )}

      {/* Floating action bar */}
      {selectMode && selected.size > 0 && (
        <div className="sticky bottom-2 z-50 mx-auto max-w-md bg-gray-800/95 backdrop-blur border border-gray-700 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xl">
          <span className="text-sm text-white font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={function() { setSelected(new Set()); }}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:text-white transition-colors"
            >
              Clear
            </button>
            {confirmUnsub ? (
              <button
                onClick={function() {
                  onAction("unsubscribe", { channelIds: Array.from(selected) });
                  setSelected(new Set());
                  setSelectMode(false);
                  setConfirmUnsub(false);
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium animate-pulse"
              >
                Confirm Unsubscribe {selected.size}
              </button>
            ) : (
              <button
                onClick={function() { setConfirmUnsub(true); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Unsubscribe ({selected.size})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Feed Tab ──
var FeedView = function() {
  var videos = data?.videos || [];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{videos.length} videos from your subscriptions</p>
        <button
          onClick={function() { onAction("feed", { maxResults: 30 }); }}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
        >
          Load More
        </button>
      </div>
      {videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {videos.map(function(v) { return <VideoCard key={v.videoId} video={v} />; })}
        </div>
      ) : (
        <EmptyState icon={<Play className="w-8 h-8" />} title="Loading feed..." description="Fetching latest videos from your subscriptions" />
      )}
    </div>
  );
};

// ── Trending Tab ──
var TrendingView = function() {
  var videos = data?.videos || [];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Select value={regionCode} onValueChange={function(v) { setRegionCode(v); onAction("trending", { regionCode: v }); }}>
          {REGIONS.map(function(r) { return <option key={r.code} value={r.code}>{r.label}</option>; })}
        </Select>
        <p className="text-xs text-gray-500 ml-auto">{videos.length} trending</p>
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

// ── Discover Tab ──
var DiscoverView = function() {
  var channels = data?.channels || [];
  var interests = data?.profileInterests || [];

  return (
    <div>
      {/* Topic search */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={discoverTopic}
            onChange={function(e) { setDiscoverTopic(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter" && discoverTopic.trim()) onAction("discover", { topic: discoverTopic }); }}
            placeholder="Search for channels by topic..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <button
          onClick={function() { if (discoverTopic.trim()) onAction("discover", { topic: discoverTopic }); }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Profile interests */}
      {interests.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] text-gray-600 mb-1.5">Based on your Enso profile interests:</p>
          <div className="flex flex-wrap gap-1.5">
            {interests.map(function(int) {
              return (
                <button
                  key={int.topic}
                  onClick={function() { setDiscoverTopic(int.topic); onAction("discover", { topic: int.topic }); }}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25 transition-colors"
                >
                  {int.topic} ({Math.round(int.confidence * 100)}%)
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Discovered channels */}
      {channels.length > 0 ? (
        <div className="space-y-3">
          {channels.map(function(ch) {
            return (
              <div key={ch.channelId} className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <a href={"https://youtube.com/channel/" + ch.channelId} target="_blank" rel="noopener"
                      className="text-sm font-semibold text-gray-200 hover:text-white">
                      {ch.channelTitle}
                    </a>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25">
                        Recommended: {ch.recommendedBecause}
                      </span>
                      <span className="text-[10px] text-gray-600">via {ch.source}</span>
                    </div>
                    {/* Sample video */}
                    {ch.sampleVideo && (
                      <div className="mt-3 flex gap-3">
                        <a href={ch.sampleVideo.videoUrl} target="_blank" rel="noopener">
                          <img src={ch.sampleVideo.thumbnailUrl} alt="" className="w-40 rounded-lg object-cover aspect-video" />
                        </a>
                        <div className="flex-1 min-w-0">
                          <a href={ch.sampleVideo.videoUrl} target="_blank" rel="noopener"
                            className="text-xs text-gray-300 hover:text-white line-clamp-2">{ch.sampleVideo.title}</a>
                          {ch.sampleVideo.viewCount && (
                            <p className="text-[10px] text-gray-600 mt-1">{fmt(parseInt(ch.sampleVideo.viewCount))} views</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={function() { window.open("https://youtube.com/channel/" + ch.channelId + "?sub_confirmation=1", "_blank"); }}
                  >
                    Subscribe
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Compass className="w-8 h-8" />}
          title="Discover new channels"
          description="Search by topic or click an interest above to find channels"
        />
      )}
    </div>
  );
};

// ── Analytics Tab ──
var AnalyticsView = function() {
  var categoryChart = data?.categoryChart || [];
  var subRangeChart = data?.subRangeChart || [];
  var topBySize = data?.topBySize || [];
  var smallest = data?.smallest || [];

  var COLORS = ["#f472b6", "#818cf8", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa", "#fb923c", "#2dd4bf", "#e879f9", "#94a3b8", "#4ade80", "#f97316", "#06b6d4"];

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total Channels" value={data?.totalChannels || 0} />
        <Stat label="Categories" value={data?.categoryCount || 0} />
        <Stat label="Total Videos" value={fmt(data?.totalVideos || 0)} />
      </div>

      {/* Category distribution */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Channels by Category</h3>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={categoryChart} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={115} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {categoryChart.map(function(entry, idx) {
                  return <Cell key={idx} fill={COLORS[idx % COLORS.length]} />;
                })}
              </Bar>
              <RechartsTooltip contentStyle={{ background: "#1e1e3a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subscriber range distribution */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Channel Size Distribution</h3>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={subRangeChart} margin={{ left: 10, right: 10, top: 5, bottom: 20 }}>
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
              <Bar dataKey="value" fill="#818cf8" radius={[4, 4, 0, 0]} />
              <RechartsTooltip contentStyle={{ background: "#1e1e3a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top & smallest channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Largest Channels</h3>
          <div className="space-y-1">
            {topBySize.map(function(ch, idx) {
              return (
                <div key={idx} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-800/40 text-xs">
                  <span className="text-gray-300 truncate mr-2">{ch.name}</span>
                  <span className="text-gray-500 shrink-0">{fmt(ch.value)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Smallest Channels</h3>
          <div className="space-y-1">
            {smallest.map(function(ch, idx) {
              return (
                <div key={idx} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-800/40 text-xs">
                  <span className="text-gray-300 truncate mr-2">{ch.name}</span>
                  <span className="text-gray-500 shrink-0">{fmt(ch.value)} subs</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Cleanup Tab (reuses Subscriptions data) ──
var CleanupView = function() {
  var channels = data?.channels || [];

  // Group by category for bulk cleanup
  var byCat = useMemo(function() {
    var groups = {};
    for (var i = 0; i < channels.length; i++) {
      var cat = channels[i].category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(channels[i]);
    }
    return Object.keys(groups).sort(function(a, b) { return groups[b].length - groups[a].length; }).map(function(cat) {
      return { name: cat, channels: groups[cat], count: groups[cat].length };
    });
  }, [channels]);

  return (
    <div>
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4 mb-4">
        <h3 className="text-sm font-medium text-gray-200 mb-1">Subscription Cleanup</h3>
        <p className="text-xs text-gray-500">Select categories or individual channels to unsubscribe. Use Select mode on the Subscriptions tab for granular control.</p>
      </div>

      <div className="space-y-3">
        {byCat.map(function(group) {
          var allIds = group.channels.map(function(ch) { return ch.channelId; });
          var allSelected = allIds.every(function(id) { return selected.has(id); });

          return (
            <div key={group.name} className="rounded-xl border border-gray-700/30 bg-gray-800/30 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={"inline-flex px-2 py-0.5 text-[10px] font-medium rounded border " + catBadgeClass(group.name)}>
                    {group.name}
                  </span>
                  <span className="text-xs text-gray-400">{group.count} channels</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={function() {
                      setSelected(function(prev) {
                        var next = new Set(prev);
                        if (allSelected) {
                          allIds.forEach(function(id) { next.delete(id); });
                        } else {
                          allIds.forEach(function(id) { next.add(id); });
                        }
                        return next;
                      });
                    }}
                    className={"px-2.5 py-1 text-[10px] font-medium rounded-lg transition-colors " +
                      (allSelected ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-gray-700 text-gray-400 hover:text-white")}
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                </div>
              </div>
              <div className="px-4 pb-3">
                <div className="flex flex-wrap gap-1.5">
                  {group.channels.map(function(ch) {
                    var isSel = selected.has(ch.channelId);
                    return (
                      <button
                        key={ch.channelId}
                        onClick={function() {
                          setSelected(function(prev) {
                            var next = new Set(prev);
                            if (next.has(ch.channelId)) next.delete(ch.channelId);
                            else next.add(ch.channelId);
                            return next;
                          });
                        }}
                        className={"px-2 py-1 rounded-lg text-[10px] font-medium transition-colors border " +
                          (isSel ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white")}
                      >
                        {ch.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating unsubscribe bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-2 z-50 mx-auto max-w-md bg-gray-800/95 backdrop-blur border border-gray-700 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xl mt-4">
          <span className="text-sm text-white font-medium">{selected.size} channels selected</span>
          {confirmUnsub ? (
            <button
              onClick={function() {
                onAction("unsubscribe", { channelIds: Array.from(selected) });
                setSelected(new Set());
                setConfirmUnsub(false);
              }}
              className="px-4 py-2 text-xs rounded-lg bg-red-600 text-white font-medium animate-pulse"
            >
              Yes, Unsubscribe {selected.size}
            </button>
          ) : (
            <button
              onClick={function() { setConfirmUnsub(true); }}
              className="px-4 py-2 text-xs rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              Unsubscribe All Selected
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Unsubscribe Result View ──
var UnsubscribeResultView = function() {
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
      <Button onClick={function() { onAction("manage", { refresh: true }); }}>
        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh Subscriptions
      </Button>
    </div>
  );
};

// ── Main Render ──
if (data?.error) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <EmptyState
        icon={<AlertCircle className="w-8 h-8 text-rose-400" />}
        title="Something went wrong"
        description={data.error}
        action={<Button onClick={function() { onAction("manage", {}); }}>Retry</Button>}
      />
    </div>
  );
}

// Determine which view to show based on active tab + data tool
var content;
if (isUnsubscribe) {
  content = <UnsubscribeResultView />;
} else if (activeTab === "feed" && isFeed) {
  content = <FeedView />;
} else if (activeTab === "trending" && isTrending) {
  content = <TrendingView />;
} else if (activeTab === "discover" && isDiscover) {
  content = <DiscoverView />;
} else if (activeTab === "analytics" && isAnalytics) {
  content = <AnalyticsView />;
} else if (activeTab === "cleanup" && isManage) {
  content = <CleanupView />;
} else {
  // Default: Subscriptions tab (or if data doesn't match tab, show subscriptions)
  content = <SubscriptionsView />;
}

return (
  <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
    <div className="px-4 pt-4 pb-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Youtube className="w-5 h-5 text-red-500" />
        <h2 className="text-base font-semibold text-white">YouTube Manager</h2>
        <span className="text-xs text-gray-500 ml-auto">{data?.totalChannels || "—"} subscriptions</span>
      </div>

      <TabBar />
    </div>

    <div className="px-4 pb-4">
      {content}
    </div>
  </div>
);

export default function GeneratedUI({ data, onAction }) {
  const [topicInput, setTopicInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const tool = data?.tool || "";
  const isBriefing = tool === "enso_ai_pulse_briefing";
  const isRepos = tool === "enso_ai_pulse_trending_repos";
  const isSearchTopic = tool === "enso_ai_pulse_search_topic";
  const isReadingList = tool === "enso_ai_pulse_reading_list";

  const categoryColors = {
    model_release: "purple", research: "blue", tool: "emerald",
    industry: "amber", safety: "rose", open_source: "cyan",
    paper: "blue", article: "amber", repo: "emerald", tutorial: "cyan"
  };

  const navBar = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      <Button variant={isBriefing ? "primary" : "outline"} onClick={() => onAction("briefing", {})}>
        {LucideReact.Newspaper && <LucideReact.Newspaper size={14} />} Briefing
      </Button>
      <Button variant={isRepos ? "primary" : "outline"} onClick={() => onAction("trending_repos", {})}>
        {LucideReact.Github && <LucideReact.Github size={14} />} Repos
      </Button>
      <Button variant={isReadingList ? "primary" : "outline"} onClick={() => onAction("reading_list", { action: "view" })}>
        {LucideReact.Bookmark && <LucideReact.Bookmark size={14} />} Saved
      </Button>
    </div>
  );

  // ── Reading List ──
  if (isReadingList) {
    const items = data?.items || [];
    const isActionResult = data?.action === "save" || data?.action === "remove";

    if (isActionResult) {
      return (
        <div className="space-y-3">
          {navBar}
          <UICard accent={data?.success ? "emerald" : "red"}>
            <Badge variant={data?.success ? "success" : "danger"}>
              {data?.action === "save" ? (data?.success ? "Saved to reading list" : (data?.error || "Failed")) : (data?.success ? "Removed" : (data?.error || "Failed"))}
            </Badge>
          </UICard>
          <Button variant="primary" onClick={() => onAction("reading_list", { action: "view" })}>View Reading List</Button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {navBar}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e7eb" }}>
            {LucideReact.Bookmark && <LucideReact.Bookmark size={16} style={{ display: "inline", marginRight: 6 }} />}
            Reading List ({data?.unreadCount || 0} unread)
          </div>
        </div>
        {items.length > 0 ? items.map((item, i) => (
          <UICard key={item.id || i} accent={item.read ? "gray" : "blue"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, opacity: item.read ? 0.6 : 1 }}>
                <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>{item.title}</div>
                {item.summary && <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{item.summary}</div>}
                <div style={{ color: "#6b7280", fontSize: 11, marginTop: 4 }}>Saved {item.savedAt}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <Button variant="ghost" onClick={() => onAction("reading_list", { action: "toggle_read", itemId: item.id })}>
                  {item.read ? "Unread" : "Read"}
                </Button>
                <Button variant="ghost" onClick={() => onAction("reading_list", { action: "remove", itemId: item.id })}>
                  {LucideReact.Trash2 && <LucideReact.Trash2 size={14} />}
                </Button>
              </div>
            </div>
          </UICard>
        )) : (
          <EmptyState title="Reading list empty" description="Save interesting items from briefings and searches" icon={LucideReact.Bookmark} />
        )}
      </div>
    );
  }

  // ── Search Results ──
  if (isSearchTopic) {
    const results = data?.results || [];
    return (
      <div className="space-y-3">
        {navBar}
        <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e7eb" }}>
          Search: "{data?.query || ""}" ({results.length} results)
        </div>
        {results.map((r, i) => (
          <UICard key={i} accent={categoryColors[r.type] || "blue"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>{r.title}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <Badge variant="outline">{r.source || ""}</Badge>
                  <Badge variant="info">{r.type || ""}</Badge>
                </div>
                <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{r.summary}</div>
              </div>
              <Button variant="ghost" onClick={() => onAction("reading_list", { action: "save", title: r.title, url: r.url || "", summary: r.summary || "" })}>
                {LucideReact.BookmarkPlus && <LucideReact.BookmarkPlus size={16} />}
              </Button>
            </div>
          </UICard>
        ))}
        {results.length === 0 && <EmptyState title="No results" description="Try a different search term" icon={LucideReact.Search} />}
      </div>
    );
  }

  // ── Trending Repos ──
  if (isRepos) {
    const repos = data?.repos || [];
    const categories = ["all", "llm", "vision", "agents", "tools"];
    const langColors = { Python: "#3572A5", JavaScript: "#f1e05a", TypeScript: "#3178c6", Go: "#00ADD8", Rust: "#dea584", "C++": "#f34b7d" };
    return (
      <div className="space-y-3">
        {navBar}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categories.map(c => (
            <Button key={c} variant={catFilter === c ? "primary" : "outline"} onClick={() => { setCatFilter(c); onAction("trending_repos", { category: c }); }}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </Button>
          ))}
        </div>
        {repos.map((repo, i) => (
          <UICard key={i} accent="emerald">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>
                  {LucideReact.GitBranch && <LucideReact.GitBranch size={14} style={{ display: "inline", marginRight: 6 }} />}
                  {repo.name}
                </div>
                <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{repo.description}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                  <span style={{ color: "#f59e0b", fontSize: 13 }}>
                    {LucideReact.Star && <LucideReact.Star size={12} style={{ display: "inline", marginRight: 2 }} />}
                    {repo.stars}
                  </span>
                  {repo.language && (
                    <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: langColors[repo.language] || "#6b7280", display: "inline-block" }}></span>
                      {repo.language}
                    </span>
                  )}
                  {repo.trending && <Badge variant="success">{repo.trending}</Badge>}
                </div>
              </div>
              <Button variant="ghost" onClick={() => onAction("reading_list", { action: "save", title: repo.name, url: repo.url || "", summary: repo.description || "" })}>
                {LucideReact.BookmarkPlus && <LucideReact.BookmarkPlus size={16} />}
              </Button>
            </div>
          </UICard>
        ))}
        {repos.length === 0 && <EmptyState title="Loading repos..." description="Fetching trending repositories" icon={LucideReact.Github} />}
      </div>
    );
  }

  // ── Briefing (Default) ──
  const highlights = data?.highlights || [];
  const trendingTopics = data?.trendingTopics || [];

  return (
    <div className="space-y-3">
      {navBar}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb" }}>
          {LucideReact.Zap && <LucideReact.Zap size={18} style={{ display: "inline", marginRight: 6 }} />}
          AI Pulse — {data?.date || "Today"}
        </div>
        {data?.savedCount > 0 && <Badge variant="info">{data.savedCount} saved</Badge>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Input placeholder="Search AI topics..." value={searchInput} onChange={e => setSearchInput(e.target.value)} icon={LucideReact.Search} />
        <Button variant="primary" onClick={() => { if (searchInput.trim()) onAction("search_topic", { query: searchInput }); }}>Search</Button>
      </div>

      {trendingTopics.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {trendingTopics.map((t, i) => (
            <Button key={i} variant="outline" onClick={() => onAction("briefing", { topic: t })}>
              {t}
            </Button>
          ))}
        </div>
      )}

      {data?.topic && data.topic !== "general" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge variant="info">Topic: {data.topic}</Badge>
          <Button variant="ghost" onClick={() => onAction("briefing", {})}>Clear filter</Button>
        </div>
      )}

      {highlights.map((h, i) => (
        <UICard key={i} accent={categoryColors[h.category] || "blue"}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>{h.title}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <Badge variant="outline">{h.source || ""}</Badge>
                <Badge variant={h.category === "model_release" ? "info" : "default"}>
                  {(h.category || "").replace("_", " ")}
                </Badge>
              </div>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{h.summary}</div>
            </div>
            <Button variant="ghost" onClick={() => onAction("reading_list", { action: "save", title: h.title, url: h.url || "", summary: h.summary || "" })}>
              {LucideReact.BookmarkPlus && <LucideReact.BookmarkPlus size={16} />}
            </Button>
          </div>
        </UICard>
      ))}
    </div>
  );
}

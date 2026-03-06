export default function GeneratedUI({ data, onAction }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [moodInput, setMoodInput] = useState("");
  const [ratingItem, setRatingItem] = useState(null);
  const [ratingVal, setRatingVal] = useState(0);
  const [notesItem, setNotesItem] = useState(null);
  const [notesVal, setNotesVal] = useState("");

  const tool = data?.tool || "";
  const isBrowse = tool === "enso_watchlist_browse";
  const isSearch = tool === "enso_watchlist_search";
  const isAdd = tool === "enso_watchlist_add";
  const isUpdate = tool === "enso_watchlist_update";
  const isRecommend = tool === "enso_watchlist_recommend";
  const isRemove = tool === "enso_watchlist_remove";

  const Stars = ({ count, max = 5, interactive, onChange }) => {
    const stars = [];
    for (let i = 1; i <= max; i++) {
      stars.push(
        <span
          key={i}
          onClick={interactive ? () => onChange(i) : undefined}
          style={{
            cursor: interactive ? "pointer" : "default",
            color: i <= count ? "#f59e0b" : "#374151",
            fontSize: 16,
            marginRight: 1
          }}
        >★</span>
      );
    }
    return <span>{stars}</span>;
  };

  const statusBadge = (s) => {
    const variants = { "to-watch": "info", "watching": "warning", "completed": "success" };
    return <Badge variant={variants[s] || "default"}>{s}</Badge>;
  };

  const typeBadge = (t) => (
    <Badge variant={t === "tv" ? "outline" : "default"}>{t === "tv" ? "TV" : "Movie"}</Badge>
  );

  // ── Add / Update / Remove Results ──
  if (isAdd || isUpdate || isRemove) {
    return (
      <div className="space-y-3">
        <UICard accent={data?.success ? "emerald" : "red"}>
          <Badge variant={data?.success ? "success" : "danger"}>
            {isAdd && (data?.success ? "Added: " + (data?.item?.title || "") : (data?.error || "Failed"))}
            {isUpdate && (data?.success ? "Updated: " + (data?.item?.title || "") : (data?.error || "Failed"))}
            {isRemove && (data?.success ? "Removed from watchlist" : (data?.error || "Failed"))}
          </Badge>
        </UICard>
        <Button variant="primary" onClick={() => onAction("browse", {})}>Back to Watchlist</Button>
      </div>
    );
  }

  // ── Search Results ──
  if (isSearch) {
    const results = data?.results || [];
    return (
      <div className="space-y-3">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e7eb" }}>
            Search: "{data?.query || ""}" ({results.length} results)
          </div>
          <Button variant="ghost" onClick={() => onAction("browse", {})}>
            {LucideReact.ArrowLeft && <LucideReact.ArrowLeft size={14} />} Watchlist
          </Button>
        </div>
        {results.map((r, i) => (
          <UICard key={i} accent="blue">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 15 }}>
                  {r.title} {r.year ? "(" + r.year + ")" : ""}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {typeBadge(r.type)}
                  <Badge variant="outline">{r.genre || "Unknown"}</Badge>
                  {r.rating && <Badge variant="info">{r.rating}</Badge>}
                </div>
                {r.director && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>Dir: {r.director}</div>}
                {r.synopsis && <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{r.synopsis}</div>}
              </div>
              <Button variant="primary" onClick={() => onAction("add", { title: r.title, year: r.year, type: r.type, genre: r.genre, status: "to-watch" })}>
                + Add
              </Button>
            </div>
          </UICard>
        ))}
        {results.length === 0 && <EmptyState title="No results" description="Try a different search term" icon={LucideReact.Search} />}
      </div>
    );
  }

  // ── Recommendations ──
  if (isRecommend) {
    const recs = data?.recommendations || [];
    return (
      <div className="space-y-3">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e7eb" }}>
            {LucideReact.Sparkles && <LucideReact.Sparkles size={16} style={{ display: "inline", marginRight: 6 }} />}
            Recommendations {data?.mood ? "— " + data.mood : ""}
          </div>
          <Button variant="ghost" onClick={() => onAction("browse", {})}>
            {LucideReact.ArrowLeft && <LucideReact.ArrowLeft size={14} />} Watchlist
          </Button>
        </div>
        {recs.map((r, i) => (
          <UICard key={i} accent="purple">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 15 }}>
                  {r.title} {r.year ? "(" + r.year + ")" : ""}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {typeBadge(r.type)}
                  <Badge variant="outline">{r.genre || ""}</Badge>
                  {r.rating && <Badge variant="info">{r.rating}</Badge>}
                </div>
                <div style={{ color: "#a78bfa", fontSize: 13, marginTop: 6 }}>{r.reason}</div>
              </div>
              <Button variant="primary" onClick={() => onAction("add", { title: r.title, year: r.year, type: r.type, genre: r.genre, status: "to-watch" })}>
                + Add
              </Button>
            </div>
          </UICard>
        ))}
        {recs.length === 0 && <EmptyState title="No recommendations yet" description="Watch and rate some titles first!" icon={LucideReact.Sparkles} />}
      </div>
    );
  }

  // ── Browse (Default) ──
  const items = data?.items || [];
  const stats = data?.stats || {};
  const filtered = statusFilter === "all" ? items : items.filter(it => it.status === statusFilter);

  return (
    <div className="space-y-3">
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Stat label="Total" value={stats.total || 0} accent="blue" />
        <Stat label="To Watch" value={stats.toWatch || 0} accent="cyan" />
        <Stat label="Watching" value={stats.watching || 0} accent="amber" />
        <Stat label="Completed" value={stats.completed || 0} accent="emerald" />
        {stats.avgRating > 0 && <Stat label="Avg Rating" value={stats.avgRating + "/5"} accent="purple" />}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <Input
            placeholder="Search movies & TV..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            icon={LucideReact.Search}
          />
        </div>
        <Button variant="primary" onClick={() => { if (searchQuery.trim()) onAction("search", { query: searchQuery }); }}>Search</Button>
        <Button variant="outline" onClick={() => onAction("recommend", {})}>
          {LucideReact.Sparkles && <LucideReact.Sparkles size={14} />} Recommend
        </Button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["all", "to-watch", "watching", "completed"].map(s => (
          <Button key={s} variant={statusFilter === s ? "primary" : "outline"} onClick={() => setStatusFilter(s)}>
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {filtered.length > 0 ? filtered.map((item, i) => (
        <UICard key={item.id || i} accent={item.status === "completed" ? "emerald" : item.status === "watching" ? "amber" : "blue"}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 15 }}>
                {item.title} {item.year ? "(" + item.year + ")" : ""}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                {typeBadge(item.type)}
                {statusBadge(item.status)}
                <Badge variant="outline">{item.genre || "Unknown"}</Badge>
              </div>
              {item.rating > 0 && <div style={{ marginTop: 4 }}><Stars count={item.rating} /></div>}
              {item.notes && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{item.notes}</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Select
                options={[
                  { value: "to-watch", label: "To Watch" },
                  { value: "watching", label: "Watching" },
                  { value: "completed", label: "Completed" }
                ]}
                value={item.status}
                onChange={v => onAction("update", { itemId: item.id, status: v })}
              />
              <Button variant="ghost" onClick={() => {
                if (ratingItem === item.id) { setRatingItem(null); }
                else { setRatingItem(item.id); setRatingVal(item.rating || 0); }
              }}>
                {ratingItem === item.id ? "Cancel" : "Rate"}
              </Button>
              <Button variant="ghost" onClick={() => onAction("remove", { itemId: item.id })}>
                {LucideReact.Trash2 && <LucideReact.Trash2 size={14} />}
              </Button>
            </div>
          </div>
          {ratingItem === item.id && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <Stars count={ratingVal} interactive onChange={v => setRatingVal(v)} />
              <Button variant="primary" onClick={() => { onAction("update", { itemId: item.id, rating: ratingVal }); setRatingItem(null); }}>Save</Button>
            </div>
          )}
        </UICard>
      )) : (
        <EmptyState
          title={statusFilter !== "all" ? "No " + statusFilter + " items" : "Your watchlist is empty"}
          description="Search for movies and TV shows to get started!"
          icon={LucideReact.Film}
        />
      )}
    </div>
  );
}

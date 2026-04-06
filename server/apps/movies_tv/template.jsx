function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_movies_tv_browse";
  var isSearch = tool === "enso_movies_tv_search";
  var isScan = tool === "enso_movies_tv_scan";
  var isEnrich = tool === "enso_movies_tv_enrich";
  var isUpdate = tool === "enso_movies_tv_update";

  // ── Scan / Enrich / Update result ──
  if (isScan || isEnrich || isUpdate) {
    var icon = isScan ? Film : isEnrich ? Star : RefreshCw;
    var IconComp = icon;
    var heading = isScan ? "Video Collection Scanned" : isEnrich ? "TMDB Enrichment" : "Collection Updated";
    return (
      <UICard>
        <div style={{ padding: "20px", textAlign: "center" }}>
          <IconComp size={28} style={{ margin: "0 auto 8px", color: "#a78bfa" }} />
          <div style={{ fontWeight: 600, marginBottom: "6px" }}>{heading}</div>
          {data.error || data.message ? (
            <div style={{ fontSize: "13px", color: data.error ? "#ef4444" : "#94a3b8" }}>
              {data.error || data.message}
            </div>
          ) : null}
          {isScan && data.data && (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {"Found " + (data.data.totalItems || data.data.count || "?") + " video files"}
            </div>
          )}
          {isEnrich && !data.message && (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {data.enriched + " enriched, " + data.errors + " errors" + (data.unenrichedRemaining > 0 ? ", " + data.unenrichedRemaining + " remaining" : "")}
            </div>
          )}
          {isUpdate && data.newItems && data.newItems.length > 0 && (
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
              {data.newItems.map(function(n) { return n.title; }).join(", ")}
            </div>
          )}
          <div style={{ marginTop: "14px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Collection</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Search results ──
  if (isSearch) {
    var results = data.results || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>
            <Clapperboard size={14} style={{ marginRight: "4px" }} /> Library
          </Button>
          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
            {data.totalMatches} result{data.totalMatches !== 1 ? "s" : ""} for "{data.query}"
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
          {results.map(function(item, i) {
            return <MediaCard key={i} item={item} onAction={onAction} />;
          })}
        </div>
        {results.length === 0 && <EmptyState title="No results" description={"Nothing matching \"" + data.query + "\""} />}
      </div>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState("");
    var [sortBy, setSortBy] = React.useState("title");
    var [activeCategory, setActiveCategory] = React.useState("all");
    var items = data.items || [];
    var categories = data.categories || {};

    var CATEGORY_LABELS = {
      all: "All",
      movies: "Movies",
      tv: "TV Series",
      documentaries: "Docs",
      movie_series: "Series",
      concerts: "Concerts",
      comedy: "Comedy"
    };

    var CATEGORY_ICONS = {
      all: Clapperboard,
      movies: Film,
      tv: Tv,
      documentaries: Film,
      movie_series: Film,
      concerts: Film,
      comedy: Film
    };

    // Stats
    var totalEnriched = items.filter(function(m) { return m.enrichedAt; }).length;
    var avgRating = 0;
    var ratedItems = items.filter(function(m) { return m.rating; });
    if (ratedItems.length > 0) {
      avgRating = ratedItems.reduce(function(s, m) { return s + m.rating; }, 0) / ratedItems.length;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clapperboard size={22} style={{ color: "#a78bfa" }} />
            <span style={{ fontWeight: 600, fontSize: "16px" }}>Movies & TV</span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {data.filteredCount === data.totalItems
                ? data.totalItems + " titles"
                : data.filteredCount + " of " + data.totalItems}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>
              <RefreshCw size={12} style={{ marginRight: "4px" }} /> Scan
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("enrich", {}); }}>
              <Star size={12} style={{ marginRight: "4px" }} /> Enrich
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("update", {}); }}>
              <RefreshCw size={12} style={{ marginRight: "4px" }} /> Update
            </Button>
          </div>
        </div>

        {/* Stats row */}
        {data.totalItems > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Stat label="Total" value={data.totalItems} />
            <Stat label="Enriched" value={totalEnriched} />
            {avgRating > 0 && <Stat label="Avg Rating" value={avgRating.toFixed(1)} />}
            {data.genres && <Stat label="Genres" value={data.genres.length} />}
          </div>
        )}

        {/* Search + Sort */}
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Input
              placeholder="Search by title, genre, cast..."
              value={searchInput}
              onChange={function(e) { setSearchInput(e.target.value); }}
              onKeyDown={function(e) {
                if (e.key === "Enter" && searchInput.trim()) {
                  onAction("search", { query: searchInput.trim() });
                }
              }}
            />
          </div>
          <Select value={sortBy} onValueChange={function(v) { setSortBy(v); onAction("browse", { category: activeCategory, sortBy: v }); }}>
            <option value="title">Title</option>
            <option value="year">Year</option>
            <option value="rating">Rating</option>
          </Select>
        </div>

        {/* Category tabs */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {Object.keys(CATEGORY_LABELS).map(function(cat) {
            var count = cat === "all" ? data.totalItems : (categories[cat] || 0);
            if (cat !== "all" && !count) return null;
            var isActive = activeCategory === cat;
            var CatIcon = CATEGORY_ICONS[cat] || Film;
            return (
              <Badge
                key={cat}
                variant={isActive ? "default" : "secondary"}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px" }}
                onClick={function() {
                  setActiveCategory(cat);
                  onAction("browse", { category: cat, sortBy: sortBy });
                }}
              >
                <CatIcon size={12} />
                {CATEGORY_LABELS[cat]}
                {count > 0 && <span style={{ opacity: 0.7 }}> ({count})</span>}
              </Badge>
            );
          })}
        </div>

        {/* Genre pills */}
        {data.genres && data.genres.length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {data.genres.slice(0, 20).map(function(genre) {
              return (
                <Badge
                  key={genre}
                  variant="secondary"
                  style={{ cursor: "pointer", fontSize: "10px", padding: "2px 6px" }}
                  onClick={function() { onAction("search", { query: genre }); }}
                >{genre}</Badge>
              );
            })}
          </div>
        )}

        {/* Poster grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
          {items.map(function(item, i) {
            return <MediaCard key={i} item={item} onAction={onAction} />;
          })}
        </div>

        {items.length === 0 && (
          <EmptyState
            title="No titles found"
            description={
              activeCategory !== "all"
                ? "No titles in this category."
                : data.totalItems === 0
                  ? "Your collection is empty. Click Scan to import your video files."
                  : "No titles matching your filter."
            }
          />
        )}

        {/* Footer */}
        {data.filteredCount > 200 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 200 of {data.filteredCount} titles. Use search to narrow down.
          </div>
        )}

        {data.scannedAt && (
          <div style={{ textAlign: "center", fontSize: "11px", color: "#475569" }}>
            Last scanned: {new Date(data.scannedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="Movies & TV" description="Use Browse, Search, or Scan to explore your video collection." />;
}

function MediaCard({ item, onAction }) {
  var [expanded, setExpanded] = React.useState(false);

  // Rating color
  var ratingColor = "#64748b";
  if (item.rating >= 8) ratingColor = "#22c55e";
  else if (item.rating >= 6.5) ratingColor = "#eab308";
  else if (item.rating >= 5) ratingColor = "#f97316";
  else if (item.rating > 0) ratingColor = "#ef4444";

  var categoryIcon = item.category === "tv" ? Tv : Film;
  var CatIcon = categoryIcon;

  return (
    <UICard style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: "0" }}>
        {/* Poster */}
        {item.posterPath ? (
          <img
            src={item.posterPath}
            alt={item.title}
            style={{ width: "90px", minHeight: "135px", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: "90px", minHeight: "135px", flexShrink: 0,
            background: "#1e1e2e", display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <CatIcon size={28} style={{ color: "#4a4a5a" }} />
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, padding: "10px", minWidth: 0 }}>
          {/* Title */}
          <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3 }}>{item.title}</div>

          {/* Year + Runtime + Category */}
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {item.year && <span>{item.year}</span>}
            {item.runtime && (
              <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                <Clock size={10} /> {item.runtime}m
              </span>
            )}
            {item.numberOfSeasons && <span>{item.numberOfSeasons}S</span>}
            <Badge variant="secondary" style={{ fontSize: "9px", padding: "0px 4px", textTransform: "capitalize" }}>
              {item.category === "tv" ? "TV" : item.category || "movie"}
            </Badge>
          </div>

          {/* Rating */}
          {item.rating > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
              <Star size={12} style={{ color: ratingColor, fill: ratingColor }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: ratingColor }}>
                {item.rating.toFixed(1)}
              </span>
              {item.voteCount > 0 && (
                <span style={{ fontSize: "10px", color: "#64748b" }}>
                  ({item.voteCount > 1000 ? (item.voteCount / 1000).toFixed(1) + "k" : item.voteCount})
                </span>
              )}
            </div>
          )}

          {/* Genres */}
          {item.genres && item.genres.length > 0 && (
            <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "4px" }}>
              {item.genres.slice(0, 3).map(function(g) {
                return <Badge key={g} variant="secondary" style={{ fontSize: "9px", padding: "1px 5px" }}>{g}</Badge>;
              })}
            </div>
          )}

          {/* Directors */}
          {item.directors && item.directors.length > 0 && (
            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}>
              Dir: {item.directors.join(", ")}
            </div>
          )}

          {/* Cast */}
          {item.cast && item.cast.length > 0 && (
            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
              {item.cast.slice(0, 4).join(", ")}
            </div>
          )}

          {/* Tagline */}
          {item.tagline && (
            <div style={{ fontSize: "10px", color: "#a78bfa", fontStyle: "italic", marginTop: "3px" }}>
              {item.tagline}
            </div>
          )}

          {/* Overview (expandable) */}
          {item.overview && (
            <div
              onClick={function() { setExpanded(!expanded); }}
              style={{
                fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4, cursor: "pointer",
                ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" })
              }}
            >{item.overview}</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "5px", padding: "6px 10px 8px", flexWrap: "wrap", borderTop: "1px solid #27272a" }}>
        {item.hasWikiPage && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() {
              var prefix = item.category === "tv" ? "tv-" : "movie-";
              var slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
              onAction("send_message", { message: "/wiki read entities/" + prefix + slug });
            }}
          >Wiki</Button>
        )}
        <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
          onClick={function() { onAction("send_message", { message: "/research \"" + item.title + "\" " + (item.year || "") + " movie review" }); }}
        ><Search size={10} style={{ marginRight: "3px" }} /> Research</Button>
        {item.imdbId && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { window.open("https://www.imdb.com/title/" + item.imdbId, "_blank"); }}
          ><ExternalLink size={10} style={{ marginRight: "3px" }} /> IMDB</Button>
        )}
        {!item.hasWikiPage && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { onAction("send_message", { message: "Add \"" + item.title + "\" to my Knowledge Cortex" }); }}
          >+ Cortex</Button>
        )}
      </div>
    </UICard>
  );
}

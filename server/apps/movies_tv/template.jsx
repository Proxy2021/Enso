function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_movies_tv_browse";
  var isSearch = tool === "enso_movies_tv_search";
  var isScan = tool === "enso_movies_tv_scan";
  var isEnrich = tool === "enso_movies_tv_enrich";
  var isUpdate = tool === "enso_movies_tv_update";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  // Hooks MUST be at top level — never inside conditionals
  var [searchInput, setSearchInput] = React.useState("");
  var [sortBy, setSortBy] = React.useState("title");
  var [activeCategory, setActiveCategory] = React.useState("all");
  var [showTranscript, setShowTranscript] = React.useState(false);

  // ── Breadcrumb navigation bar ──
  var navStack = d.navStack || [];
  var breadcrumb = navStack.length > 0 ? (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", fontSize: "12px" }}>
      <Button variant="outline" size="sm" style={{ fontSize: "11px", padding: "2px 8px" }}
        onClick={function() { onAction("nav_back", {}); }}
      >← Back</Button>
      {navStack.map(function(entry, i) {
        return (
          <span key={i} style={{ color: "#64748b" }}>
            {entry.title}
            <span style={{ margin: "0 4px", color: "#475569" }}>/</span>
          </span>
        );
      })}
      {d.entity && <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{d.entity.title}</span>}
    </div>
  ) : null;

  // ── Entity Detail View ──
  if (isEntityDetail && d.entity) {
    var entity = d.entity;
    var fields = d.detailFields || [];
    var cortexContent = d.cortexContent;
    var related = d.relatedEntities || [];
    var processed = d.processedBook;
    var research = processed ? processed.research : null;
    var podcastStatus = d.podcastStatus;
    var podcastAudioUrl = d.podcastAudioUrl;
    var podcastScript = d.podcastScript;
    var podcastDuration = d.podcastDuration;
    var podcastDetail = d.podcastStatusDetail;
    var podcastPercent = d.podcastPercent || 0;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}

        {/* Entity header */}
        <UICard style={{ padding: "16px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            {entity.imageUrl && (
              <img src={entity.imageUrl} alt={entity.title}
                style={{ width: "90px", height: "135px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{entity.title}</div>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                <Badge variant="default">{entity.type}</Badge>
                <Badge variant="secondary">{entity.source}</Badge>
                {entity.cortexPath && <Badge variant="secondary">In Cortex</Badge>}
                {processed && <Badge variant="default" style={{ background: "#7c3aed" }}>Podcast Ready</Badge>}
              </div>
              {entity.summary && (
                <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
                  {entity.summary.length > 300 ? entity.summary.slice(0, 300) + "..." : entity.summary}
                </div>
              )}
            </div>
          </div>
        </UICard>

        {/* Podcast Player */}
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Film size={16} style={{ color: "#c4b5fd" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Film Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}>
              <source src={podcastAudioUrl} type="audio/wav" />
            </audio>
            {podcastScript && (
              <div style={{ marginTop: "8px" }}>
                <button onClick={function() { setShowTranscript(!showTranscript); }}
                  style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "11px", cursor: "pointer", padding: 0 }}>
                  {showTranscript ? "Hide transcript" : "Show transcript"}
                </button>
                {showTranscript && (
                  <div style={{ marginTop: "6px", maxHeight: "300px", overflow: "auto", fontSize: "11px", lineHeight: 1.6 }}>
                    {podcastScript.split("\n").map(function(line, i) {
                      var hostA = line.match(/^Host A:\s*(.*)/);
                      var hostB = line.match(/^Host B:\s*(.*)/);
                      if (hostA) return <div key={i}><span style={{ color: "#22d3ee", fontWeight: 600 }}>Host A:</span> {hostA[1]}</div>;
                      if (hostB) return <div key={i}><span style={{ color: "#fbbf24", fontWeight: 600 }}>Host B:</span> {hostB[1]}</div>;
                      return line.trim() ? <div key={i} style={{ color: "#64748b" }}>{line}</div> : null;
                    })}
                  </div>
                )}
              </div>
            )}
          </UICard>
        )}

        {/* Podcast Generation Progress */}
        {podcastStatus && podcastStatus !== "ready" && podcastStatus !== "error" && !podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "14px", height: "14px", border: "2px solid #7c3aed", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "12px", color: "#c4b5fd" }}>{podcastDetail || "Generating podcast..."}</span>
            </div>
            {podcastPercent > 0 && (
              <div style={{ marginTop: "8px", height: "4px", background: "#1e1b4b", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#7c3aed", width: podcastPercent + "%", transition: "width 0.5s" }} />
              </div>
            )}
          </UICard>
        )}

        {/* Podcast Error */}
        {podcastStatus === "error" && (
          <UICard style={{ padding: "12px", borderColor: "#ef444444" }}>
            <div style={{ fontSize: "12px", color: "#ef4444" }}>Podcast generation failed: {d.podcastError || "Unknown error"}</div>
            <Button variant="outline" size="sm" style={{ marginTop: "6px", fontSize: "10px" }}
              onClick={function() { onAction("deep_content", { entityId: entity.entityId || d.focusEntity }); }}
            >Retry</Button>
          </UICard>
        )}

        {/* Deep Research Content */}
        {research && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {research.coreThesis && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#94a3b8" }}>Core Thesis</div>
                <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.6 }}>{research.coreThesis}</div>
              </UICard>
            )}
            {research.keyInsights && research.keyInsights.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Key Insights</div>
                {research.keyInsights.map(function(ins, i) {
                  return (
                    <div key={i} style={{ marginBottom: "8px", paddingLeft: "12px", borderLeft: "2px solid #475569" }}>
                      <div style={{ fontSize: "12px", color: "#e2e8f0", lineHeight: 1.5 }}>{ins.insight}</div>
                      {ins.example && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", fontStyle: "italic" }}>{ins.example}</div>}
                    </div>
                  );
                })}
              </UICard>
            )}
            {research.chapterSummaries && research.chapterSummaries.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Section Summaries</div>
                {research.chapterSummaries.map(function(ch, i) {
                  return (
                    <div key={i} style={{ marginBottom: "8px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#93c5fd" }}>{ch.chapter}</div>
                      <div style={{ fontSize: "11px", color: "#cbd5e1", lineHeight: 1.5, marginTop: "2px" }}>{ch.summary}</div>
                    </div>
                  );
                })}
              </UICard>
            )}
            {research.criticalPerspectives && research.criticalPerspectives.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Critical Perspectives</div>
                {research.criticalPerspectives.map(function(cp, i) {
                  return <div key={i} style={{ fontSize: "12px", color: "#fbbf24", marginBottom: "4px", lineHeight: 1.5 }}>{cp}</div>;
                })}
              </UICard>
            )}
          </div>
        )}

        {/* Detail fields */}
        {fields.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 12px", fontSize: "12px" }}>
              {fields.map(function(f) {
                var val = Array.isArray(f.value) ? f.value.join(", ") : String(f.value);
                return [
                  <div key={f.key + "-label"} style={{ color: "#64748b", fontWeight: 500 }}>{f.label}</div>,
                  <div key={f.key + "-value"} style={{ color: "#e2e8f0" }}>{val}</div>
                ];
              })}
            </div>
          </UICard>
        )}

        {/* Cortex wiki content */}
        {cortexContent && !research && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Knowledge (Cortex)</div>
            <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: "300px", overflow: "auto" }}>
              {cortexContent.replace(/^#.*\n/gm, "").trim().slice(0, 2000)}
            </div>
          </UICard>
        )}

        {/* Related entities */}
        {related.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Related</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {related.map(function(r) {
                return (
                  <Button key={r.entityId} variant="outline" size="sm" style={{ fontSize: "10px" }}
                    onClick={function() { onAction("view_entity", { entityId: r.entityId }); }}
                  >{r.title} ({r.source})</Button>
                );
              })}
            </div>
          </UICard>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {!podcastAudioUrl && !podcastStatus && (
            <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
              onClick={function() { onAction("deep_content", { entityId: entity.entityId || d.focusEntity }); }}
            >Deep Podcast</Button>
          )}
          <Button variant="outline" size="sm"
            onClick={function() { onAction("send_message", { message: "/research \"" + entity.title + "\" " + (entity.year || "") + " movie review" }); }}
          ><Search size={12} style={{ marginRight: "4px" }} />Research</Button>
          {entity.externalUrl && (
            <Button variant="outline" size="sm"
              onClick={function() { window.open(entity.externalUrl, "_blank"); }}
            ><ExternalLink size={12} style={{ marginRight: "4px" }} />Open External</Button>
          )}
          {entity.cortexPath && (
            <Button variant="outline" size="sm"
              onClick={function() { onAction("send_message", { message: "/wiki read " + entity.cortexPath }); }}
            >View in Cortex</Button>
          )}
          {podcastAudioUrl && (
            <Button variant="outline" size="sm"
              onClick={function() {
                var email = prompt("Send film report + podcast to:");
                if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
              }}
            >Email Summary + Podcast</Button>
          )}
        </div>
      </div>
    );
  }

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
          {d.error || d.message ? (
            <div style={{ fontSize: "13px", color: d.error ? "#ef4444" : "#94a3b8" }}>
              {d.error || d.message}
            </div>
          ) : null}
          {isScan && d.data && (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {"Found " + (d.data.totalItems || d.data.count || "?") + " video files"}
            </div>
          )}
          {isEnrich && !d.message && (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {d.enriched + " enriched, " + d.errors + " errors" + (d.unenrichedRemaining > 0 ? ", " + d.unenrichedRemaining + " remaining" : "")}
            </div>
          )}
          {isUpdate && d.newItems && d.newItems.length > 0 && (
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
              {d.newItems.map(function(n) { return n.title; }).join(", ")}
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
    var results = d.results || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>
            <Clapperboard size={14} style={{ marginRight: "4px" }} /> Library
          </Button>
          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
            {d.totalMatches} result{d.totalMatches !== 1 ? "s" : ""} for "{d.query}"
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
          {results.map(function(item, i) {
            return <MediaCard key={i} item={item} onAction={onAction} />;
          })}
        </div>
        {results.length === 0 && <EmptyState title="No results" description={"Nothing matching \"" + d.query + "\""} />}
      </div>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var items = d.items || [];
    var categories = d.categories || {};

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
              {d.filteredCount === d.totalItems
                ? d.totalItems + " titles"
                : d.filteredCount + " of " + d.totalItems}
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
        {d.totalItems > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Stat label="Total" value={d.totalItems} />
            <Stat label="Enriched" value={totalEnriched} />
            {avgRating > 0 && <Stat label="Avg Rating" value={avgRating.toFixed(1)} />}
            {d.genres && <Stat label="Genres" value={d.genres.length} />}
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
            var count = cat === "all" ? d.totalItems : (categories[cat] || 0);
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
        {d.genres && d.genres.length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {d.genres.slice(0, 20).map(function(genre) {
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
                : d.totalItems === 0
                  ? "Your collection is empty. Click Scan to import your video files."
                  : "No titles matching your filter."
            }
          />
        )}

        {/* Footer */}
        {d.filteredCount > 200 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 200 of {d.filteredCount} titles. Use search to narrow down.
          </div>
        )}

        {d.scannedAt && (
          <div style={{ textAlign: "center", fontSize: "11px", color: "#475569" }}>
            Last scanned: {new Date(d.scannedAt).toLocaleDateString()}
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
            style={{ width: "90px", minHeight: "135px", objectFit: "cover", flexShrink: 0,
              cursor: item.entityId ? "pointer" : "default" }}
            onClick={function() { if (item.entityId) onAction("view_entity", { entityId: item.entityId }); }}
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
          <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3,
            cursor: item.entityId ? "pointer" : "default", color: item.entityId ? "#c4b5fd" : "inherit" }}
            onClick={function() { if (item.entityId) onAction("view_entity", { entityId: item.entityId }); }}
          >{item.isProcessed && <span style={{ marginRight: "4px" }} title="Deep podcast available">🎙️</span>}{item.title}</div>

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
        {item.entityId && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { onAction("view_entity", { entityId: item.entityId }); }}
          >View</Button>
        )}
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

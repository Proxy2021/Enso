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
  var [addInput, setAddInput] = React.useState("");
  var [addedStatus, setAddedStatus] = React.useState({});
  var [playingVideo, setPlayingVideo] = React.useState(null);
  var isAddResults = tool === "enso_movies_tv_add";

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

  // ── Entity Detail View (Movie-specific rich layout) ──
  if (isEntityDetail && d.entity) {
    var entity = d.entity;
    var fields = d.detailFields || [];
    var meta = d.metadata || {};
    var cortexContent = d.cortexContent;
    var related = d.relatedEntities || [];
    var relatedReasons = d.relatedReasons || {};
    var recommendedVideos = d.recommendedVideos || [];
    var processed = d.processedBook;
    var research = processed ? processed.research : null;
    var podcastStatus = d.podcastStatus;
    var podcastAudioUrl = d.podcastAudioUrl;
    var podcastScript = d.podcastScript;
    var podcastDuration = d.podcastDuration;
    var podcastDetail = d.podcastStatusDetail;
    var podcastPercent = d.podcastPercent || 0;

    // Extract movie-specific data from metadata
    var movieCast = meta.cast || [];
    var movieDirectors = meta.directors || [];
    var movieGenres = meta.genres || [];
    var movieRating = meta.rating || 0;
    var movieVoteCount = meta.voteCount || 0;
    var movieRuntime = meta.runtime || 0;
    var movieYear = meta.year || "";
    var movieOverview = meta.overview || entity.summary || "";
    var movieTagline = meta.tagline || "";
    var movieImdbId = meta.imdbId || "";
    var movieSeasons = meta.numberOfSeasons || 0;
    var movieStatus = meta.status || "";
    var movieLang = meta.originalLanguage || "";
    var movieReleaseDate = meta.releaseDate || "";
    var movieBackdrop = meta.backdropPath || "";
    var moviePoster = entity.imageUrl || meta.posterPath || "";
    var movieCategory = meta.category || entity.type || "movie";
    var isTV = movieCategory === "tv" || entity.type === "tv-series";

    // Rating color
    var ratingColor = "#64748b";
    if (movieRating >= 8) ratingColor = "#22c55e";
    else if (movieRating >= 7) ratingColor = "#84cc16";
    else if (movieRating >= 6) ratingColor = "#eab308";
    else if (movieRating >= 5) ratingColor = "#f97316";
    else if (movieRating > 0) ratingColor = "#ef4444";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}

        {/* ── Hero Section with backdrop ── */}
        <UICard style={{ padding: 0, overflow: "hidden", position: "relative" }}>
          {/* Backdrop image */}
          {movieBackdrop && (
            <div style={{ position: "relative", width: "100%", height: "200px", overflow: "hidden" }}>
              <img src={movieBackdrop} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.4)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0f172a 0%, transparent 60%)" }} />
            </div>
          )}

          {/* Main info overlay */}
          <div style={{ padding: "16px", marginTop: movieBackdrop ? "-80px" : 0, position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", gap: "16px" }}>
              {/* Poster */}
              {moviePoster ? (
                <img src={moviePoster} alt={entity.title}
                  style={{ width: "120px", height: "180px", objectFit: "cover", borderRadius: "8px", flexShrink: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", border: "2px solid #27272a" }} />
              ) : (
                <div style={{ width: "120px", height: "180px", flexShrink: 0, borderRadius: "8px", background: "#1e1e2e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Film size={36} style={{ color: "#4a4a5a" }} />
                </div>
              )}

              {/* Title + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "22px", fontWeight: 700, lineHeight: 1.2, color: "#f1f5f9" }}>{entity.title}</div>

                {movieTagline && (
                  <div style={{ fontSize: "13px", color: "#a78bfa", fontStyle: "italic", marginTop: "4px" }}>{movieTagline}</div>
                )}

                {/* Quick stats row */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap", fontSize: "13px", color: "#94a3b8" }}>
                  {movieYear && <span style={{ fontWeight: 600, color: "#cbd5e1" }}>{movieYear}</span>}
                  {movieRuntime > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <Clock size={12} /> {Math.floor(movieRuntime / 60) > 0 ? Math.floor(movieRuntime / 60) + "h " : ""}{movieRuntime % 60}m
                    </span>
                  )}
                  {isTV && movieSeasons > 0 && <span>{movieSeasons} season{movieSeasons > 1 ? "s" : ""}</span>}
                  {movieLang && <span style={{ textTransform: "uppercase" }}>{movieLang}</span>}
                  {movieStatus && <Badge variant="secondary" style={{ fontSize: "10px" }}>{movieStatus}</Badge>}
                </div>

                {/* Rating */}
                {movieRating > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Star size={18} style={{ color: ratingColor, fill: ratingColor }} />
                      <span style={{ fontSize: "20px", fontWeight: 700, color: ratingColor }}>{movieRating.toFixed(1)}</span>
                    </div>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>/ 10</span>
                    {movieVoteCount > 0 && (
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        ({movieVoteCount > 1000 ? (movieVoteCount / 1000).toFixed(1) + "k" : movieVoteCount} votes)
                      </span>
                    )}
                    {/* Simple star bar */}
                    <div style={{ display: "flex", gap: "2px", marginLeft: "4px" }}>
                      {[1,2,3,4,5].map(function(n) {
                        var filled = movieRating >= n * 2;
                        var half = !filled && movieRating >= n * 2 - 1;
                        return <Star key={n} size={12} style={{ color: filled || half ? ratingColor : "#334155", fill: filled ? ratingColor : "none" }} />;
                      })}
                    </div>
                  </div>
                )}

                {/* Genre pills */}
                {movieGenres.length > 0 && (
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "10px" }}>
                    {movieGenres.map(function(g) {
                      return <Badge key={g} variant="secondary" style={{ fontSize: "11px", padding: "2px 8px" }}>{g}</Badge>;
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </UICard>

        {/* ── Action Buttons ── */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {d.contentAccess && d.contentAccess.mediaUrl && (
            <Button size="sm" style={{ background: "#2563eb", color: "white" }}
              onClick={function() { onAction("open_url", { url: d.contentAccess.mediaUrl }); }}
            >▶️ Play</Button>
          )}
          {d.contentAccess && d.contentAccess.filePath && (
            <Button size="sm" style={{ background: "#0f766e", color: "white" }}
              onClick={function() { onAction("open_external_app", { path: d.contentAccess.filePath }); }}
            >🖥️ Open in App</Button>
          )}
          {movieImdbId && (
            <Button size="sm" style={{ background: "#f5c518", color: "#000" }}
              onClick={function() { window.open("https://www.imdb.com/title/" + movieImdbId, "_blank"); }}
            >IMDb</Button>
          )}
          {!movieImdbId && d.contentAccess && d.contentAccess.externalUrl && (
            <Button size="sm" style={{ background: "#059669", color: "white" }}
              onClick={function() { window.open(d.contentAccess.externalUrl, "_blank"); }}
            >{d.contentAccess.externalLabel || "Find Online"}</Button>
          )}
          {!podcastAudioUrl && !podcastStatus && (
            <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
              onClick={function() { onAction("deep_content", { entityId: entity.entityId || d.focusEntity }); }}
            >🎙️ Generate Podcast</Button>
          )}
          {podcastAudioUrl && (
            <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
              onClick={function() {
                var email = prompt("Send report + podcast to:", "kkwong@xiaomi.com");
                if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
              }}
            >📧 Email Podcast</Button>
          )}
          <Button size="sm" style={{ background: "#16a34a", color: "white" }}
            onClick={function() {
              var msg = (entity.type === "tv" ? "\u{1F4FA} " : "\u{1F3AC} ") + entity.title;
              if (entity.year) msg += " (" + entity.year + ")";
              if (entity.rating) msg += "\n\u2B50 " + entity.rating;
              if (entity.categories) msg += "\n\u{1F4D6} " + entity.categories;
              if (entity.summary) msg += "\n\n" + entity.summary;
              onAction("share_wechat", { content: msg });
            }}
          >微信</Button>
        </div>

        {/* ── Overview ── */}
        {movieOverview && (
          <UICard style={{ padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#94a3b8" }}>Overview</div>
            <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.7 }}>{movieOverview}</div>
          </UICard>
        )}

        {/* ── Directors ── */}
        {movieDirectors.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>
              {isTV ? "Created By" : "Directed By"}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {movieDirectors.map(function(dir) {
                return (
                  <div key={dir} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#1e293b", borderRadius: "8px", padding: "8px 14px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#334155", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "14px", color: "#94a3b8" }}>{dir.charAt(0)}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>{dir}</div>
                      <div style={{ fontSize: "10px", color: "#64748b" }}>Director</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* ── Cast ── */}
        {movieCast.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Cast</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
              {movieCast.map(function(actor, i) {
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#1e293b", borderRadius: "8px", padding: "8px 10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#334155", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: "14px", color: "#a78bfa" }}>{actor.charAt(0)}</span>
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actor}</div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* ── Details Grid ── */}
        {(movieReleaseDate || movieLang || movieStatus) && (
          <UICard style={{ padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
              {movieReleaseDate && (
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Release Date</div>
                  <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{movieReleaseDate}</div>
                </div>
              )}
              {movieRuntime > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Runtime</div>
                  <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{movieRuntime} minutes</div>
                </div>
              )}
              {movieLang && (
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Language</div>
                  <div style={{ fontSize: "13px", color: "#cbd5e1", textTransform: "uppercase" }}>{movieLang}</div>
                </div>
              )}
              {movieStatus && (
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Status</div>
                  <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{movieStatus}</div>
                </div>
              )}
              {isTV && movieSeasons > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Seasons</div>
                  <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{movieSeasons}</div>
                </div>
              )}
            </div>
          </UICard>
        )}

        {/* Podcast Player */}
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Film size={16} style={{ color: "#c4b5fd" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Film Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}>
              <source src={podcastAudioUrl} type={podcastAudioUrl.indexOf(".mp3") >= 0 ? "audio/mpeg" : "audio/wav"} />
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
          </div>
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

        {/* Related entities — cross-source with reasons */}
        {related.length > 0 && (function() {
          var sourceIcons = { kindle: "📚", weread: "📚", steam: "🎮", movies_tv: "🎬", youtube: "📺", photos: "📷", qq_music: "🎵", twitter: "🐦", files: "💻", cortex: "🧠", research: "🔬", manual: "📝" };
          var sourceLabels = { kindle: "kindle", weread: "weread", steam: "steam", movies_tv: "movie", youtube: "youtube", photos: "photo", qq_music: "music", twitter: "twitter", files: "project" };
          return (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>🔗 Related</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
                {related.map(function(r) {
                  var icon = sourceIcons[r.source] || "📄";
                  var reason = relatedReasons[r.entityId] || r.reason;
                  var label = sourceLabels[r.source] || r.source;
                  var card = (
                    <div key={r.entityId}
                      style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 8px", background: "#1e293b", borderRadius: "8px", cursor: "pointer", border: "1px solid #334155" }}
                      onClick={function() { onAction("view_entity", { entityId: r.entityId }); }}
                      title={reason || r.title}>
                      {r.imageUrl ? (
                        <img src={r.imageUrl} alt="" style={{ width: "36px", height: "52px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: "36px", height: "52px", borderRadius: "4px", flexShrink: 0, background: "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{icon}</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                        <div style={{ fontSize: "9px", color: "#64748b", marginTop: "2px" }}>{icon} {label}</div>
                      </div>
                    </div>
                  );
                  return reason
                    ? React.createElement(EnsoUI.Tooltip, { key: r.entityId, content: reason }, card)
                    : card;
                })}
              </div>
            </UICard>
          );
        })()}

        {/* Recommended YouTube Videos */}
        {recommendedVideos.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>📺 Recommended Videos</div>
            {playingVideo && (
              <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", marginBottom: "8px", borderRadius: "8px", overflow: "hidden", background: "#000" }}>
                <iframe
                  src={"https://www.youtube.com/embed/" + playingVideo + "?autoplay=1"}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", overflowX: "auto" }}>
              {recommendedVideos.map(function(v) {
                var isPlaying = playingVideo === v.videoId;
                return (
                  <div key={v.videoId} style={{ minWidth: "200px", maxWidth: "220px", cursor: "pointer", borderRadius: "8px", overflow: "hidden", border: isPlaying ? "2px solid #8b5cf6" : "1px solid #334155", background: "#1e293b" }}
                    onClick={function() { setPlayingVideo(isPlaying ? null : v.videoId); }}>
                    <img src={v.thumbnailUrl} style={{ width: "100%", height: "120px", objectFit: "cover" }} />
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{v.title}</div>
                      <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>{v.channelTitle}</div>
                      <div style={{ fontSize: "10px", color: "#475569", marginTop: "1px" }}>{v.viewCount ? Number(v.viewCount).toLocaleString() + " views" : ""}{v.duration ? " · " + v.duration : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

      </div>
    );
  }

  // ── Add Movie/TV results ──
  if (isAddResults) {
    var addResults = Array.isArray(d.results) ? d.results : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔍</span>
            <span style={{ fontWeight: 600 }}>Add Movie / TV</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{addResults.length} results for "{d.query}"</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>
        {addResults.map(function(r, i) {
          return (
            <UICard key={i} style={{ padding: "12px" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                {r.posterUrl && <img src={r.posterUrl} alt={r.title} style={{ width: "60px", height: "90px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{r.title}{r.year ? " (" + r.year + ")" : ""}</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{r.type === "tv-series" ? "TV Series" : "Movie"}{r.rating ? " · ⭐ " + r.rating.toFixed(1) : ""}{r.voteCount ? " (" + r.voteCount + ")" : ""}</div>
                  {r.overview && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>{r.overview.slice(0, 200)}{r.overview.length > 200 ? "..." : ""}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0, justifyContent: "center" }}>
                  {addedStatus[i] === "added" ? (
                    <Button variant="outline" size="sm" style={{ fontSize: "11px", color: "#22c55e", borderColor: "#22c55e44", pointerEvents: "none" }}>✓ Added</Button>
                  ) : addedStatus[i] === "adding" ? (
                    <Button variant="outline" size="sm" style={{ fontSize: "11px", color: "#94a3b8", pointerEvents: "none" }}>Adding...</Button>
                  ) : addedStatus[i] === "error" ? (
                    <Button variant="default" size="sm" style={{ fontSize: "11px", background: "#7f1d1d" }} onClick={function() {
                      var idx = i;
                      setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[idx] = undefined; return n; });
                    }}>✗ Retry</Button>
                  ) : (
                    <Button variant="default" size="sm" style={{ fontSize: "11px" }} onClick={function() {
                      var idx = i;
                      setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[idx] = "adding"; return n; });
                      try {
                        onAction("add_to_cortex", { title: r.title, type: r.type || "movie", year: r.year, description: r.overview, imageUrl: r.posterUrl, metadata: { rating: r.rating, voteCount: r.voteCount, creator: r.director || "" } });
                        setTimeout(function() {
                          setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[idx] = "added"; return n; });
                        }, 800);
                      } catch(e) {
                        setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[idx] = "error"; return n; });
                      }
                    }}>📥 Add</Button>
                  )}
                </div>
              </div>
            </UICard>
          );
        })}
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
        {/* Research Discoveries */}
        {/* Processed Podcasts Banner */}
        {(d.processedItems || []).length > 0 && (
          <UICard style={{ padding: "10px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{ fontSize: "14px" }}>🎙️</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#c4b5fd" }}>Deep Podcasts</span>
              <Badge variant="secondary" style={{ fontSize: "10px" }}>{(d.processedItems || []).length}</Badge>
            </div>
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
              {(d.processedItems || []).map(function(pi) {
                return (
                  <div key={pi.entityId} style={{ position: "relative", flexShrink: 0, cursor: "pointer", borderRadius: "6px", overflow: "hidden", width: "52px", height: "76px", background: "#1e1b4b" }}
                    onClick={function() { onAction("view_entity", { entityId: pi.entityId }); }}
                    title={pi.title + " — " + pi.durationMinutes + " min"}>
                    {pi.coverUrl ? (
                      <img src={pi.coverUrl} alt={pi.title} style={{ width: "52px", height: "76px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "52px", height: "76px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: "#94a3b8", textAlign: "center", padding: "4px", lineHeight: 1.2 }}>{pi.title.slice(0, 20)}</div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", padding: "2px 3px", textAlign: "center" }}>
                      <span style={{ fontSize: "8px", color: "#c4b5fd", fontWeight: 600 }}>{pi.durationMinutes}m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {(d.recommendations || []).length > 0 && (
          <UICard style={{ padding: "12px", borderColor: "#059669" + "44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <LucideReact.Search size={14} style={{ color: "#6ee7b7" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#6ee7b7" }}>Discovered via Research</span>
              <Badge variant="secondary">{(d.recommendations || []).length}</Badge>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(d.recommendations || []).map(function(rec) {
                var typeLabel = rec.type === "tv-series" ? "TV Series" : rec.type === "documentary" ? "Documentary" : "Movie";
                return (
                  <div key={rec.entityId} style={{ display: "flex", gap: "10px", background: "#064e3b33", padding: "10px", borderRadius: "8px", cursor: "pointer", border: "1px solid #05966933" }}
                    onClick={function() { onAction("view_entity", { entityId: rec.entityId }); }}>
                    {rec.imageUrl && <img src={rec.imageUrl} alt={rec.title} style={{ width: "48px", height: "68px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>{rec.title}{rec.year ? " (" + rec.year + ")" : ""}</span>
                        <Badge variant="info" style={{ fontSize: "9px" }}>{typeLabel}</Badge>
                      </div>
                      {rec.creator && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{rec.creator}</div>}
                      {rec.rating > 0 && <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "2px" }}>{"⭐ " + rec.rating.toFixed(1)}</div>}
                      {rec.description && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{rec.description.slice(0, 200)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

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
            <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>Scan</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("enrich", {}); }}>Enrich</Button>
            <Button variant="default" size="sm" onClick={function() { if (addInput.trim()) onAction("add", { query: addInput.trim() }); }}>➕ Add Movie</Button>
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

        {/* Add Movie search bar */}
        <div style={{ display: "flex", gap: "8px", background: "#1e1b4b", padding: "8px 10px", borderRadius: "8px", border: "1px solid #312e81" }}>
          <Input placeholder="Add a movie or TV show — search by title..." value={addInput}
            onChange={function(v) { setAddInput(v); }}
            onKeyDown={function(e) { if (e.key === "Enter" && addInput.trim()) onAction("add", { query: addInput.trim() }); }}
            style={{ flex: 1, fontSize: "12px" }} />
          <Button variant="default" size="sm" style={{ fontSize: "11px" }}
            onClick={function() { if (addInput.trim()) onAction("add", { query: addInput.trim() }); }}>🔍 Search & Add</Button>
        </div>

        {/* Search + Sort */}
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Input
              placeholder="Filter by title, genre, cast..."
              value={searchInput}
              onChange={function(v) { setSearchInput(v); }}
              onKeyDown={function(e) {
                if (e.key === "Enter" && searchInput.trim()) {
                  onAction("search", { query: searchInput.trim() });
                }
              }}
            />
          </div>
          <Select value={sortBy} onChange={function(v) { setSortBy(v); onAction("browse", { category: activeCategory, sortBy: v }); }}
            options={[
              { value: "title", label: "Title" },
              { value: "year", label: "Year" },
              { value: "rating", label: "Rating" }
            ]}
          />
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

  var handleCardClick = function() {
    if (item.entityId) onAction("view_entity", { entityId: item.entityId });
  };

  return (
    <div style={{ borderRadius: "8px", border: "1px solid rgba(100,116,139,0.3)", background: "#1f2937", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: "0", cursor: item.entityId ? "pointer" : "default" }}
        onClick={handleCardClick}>
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
          <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3, color: item.entityId ? "#c4b5fd" : "inherit" }}
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

          {/* Overview */}
          {item.overview && (
            <div
              style={{
                fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
              }}
            >{item.overview}</div>
          )}
        </div>
      </div>

      {/* Actions — stopPropagation so buttons don't trigger card click */}
      <div style={{ display: "flex", gap: "5px", padding: "6px 10px 8px", flexWrap: "wrap", borderTop: "1px solid #27272a" }}
        onClick={function(e) { e.stopPropagation(); }}>
        {item.isProcessed ? (
          <Button variant="outline" size="sm" style={{ fontSize: "10px", borderColor: "#7c3aed44", color: "#c4b5fd" }}
            onClick={function() { if (item.entityId) onAction("view_entity", { entityId: item.entityId }); }}
          >🎙️ Podcast</Button>
        ) : item.entityId ? (
          <Button variant="outline" size="sm" style={{ fontSize: "10px", borderColor: "#7c3aed44", color: "#c4b5fd" }}
            onClick={function() { onAction("deep_content", { entityId: item.entityId, title: item.title, type: item.category === "tv" ? "tv-series" : "movie" }); }}
          >🎙️ Deep Process</Button>
        ) : null}
        {item.imdbId && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { window.open("https://www.imdb.com/title/" + item.imdbId, "_blank"); }}
          ><ExternalLink size={10} style={{ marginRight: "3px" }} /> IMDB</Button>
        )}
        <Button variant="outline" size="sm" style={{ fontSize: "10px", borderColor: "#16a34a44", color: "#4ade80" }}
          onClick={function() {
            var msg = (item.category === "tv" ? "\u{1F4FA} " : "\u{1F3AC} ") + item.title;
            if (item.year) msg += " (" + item.year + ")";
            if (item.rating) msg += "\n\u2B50 " + item.rating;
            if (item.tagline) msg += "\n" + item.tagline;
            if (item.overview) msg += "\n\n" + item.overview;
            if (item.imdbId) msg += "\n\nhttps://www.imdb.com/title/" + item.imdbId;
            onAction("share_wechat", { content: msg });
          }}
        >微信</Button>
      </div>
    </div>
  );
}

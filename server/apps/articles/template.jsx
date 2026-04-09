function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_articles_browse";
  var isAdd = tool === "enso_articles_add";
  var isTrending = tool === "enso_articles_trending";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  var [searchInput, setSearchInput] = React.useState("");
  var [addInput, setAddInput] = React.useState("");
  var [showTranscript, setShowTranscript] = React.useState(false);
  var [playingVideo, setPlayingVideo] = React.useState(null);

  // ── Breadcrumb navigation ──
  var navStack = d.navStack || [];
  var breadcrumb = navStack.length > 0 ? (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", fontSize: "12px" }}>
      <Button variant="outline" size="sm" style={{ fontSize: "11px", padding: "2px 8px" }}
        onClick={function() { onAction("nav_back", {}); }}>← Back</Button>
    </div>
  ) : null;

  // ── Entity Detail View ──
  if (isEntityDetail && d.entity) {
    var entity = d.entity;
    var fields = d.detailFields || [];
    var cortexContent = d.cortexContent;
    var related = d.relatedEntities || [];
    var relatedReasons = d.relatedReasons || {};
    var recommendedVideos = d.recommendedVideos || [];
    var processed = d.processedBook;
    var research = processed ? processed.research : null;
    var podcastAudioUrl = d.podcastAudioUrl;
    var podcastDuration = d.podcastDuration;
    var podcastStatus = d.podcastStatus;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}
        <UICard style={{ padding: "16px" }}>
          <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{entity.title}</div>
          {(function() {
            var authorField = fields.find(function(f) { return f.key === "author" || f.key === "source"; });
            if (authorField) return <div style={{ fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>{String(authorField.value)}</div>;
            return null;
          })()}
          <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
            <Badge variant="default">{entity.type}</Badge>
            <Badge variant="secondary">{entity.source}</Badge>
            {processed && <Badge variant="default" style={{ background: "#7c3aed" }}>🎙️ {podcastDuration ? podcastDuration + " min" : "Podcast"}</Badge>}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            {d.contentAccess && d.contentAccess.externalUrl && (
              <Button size="sm" style={{ background: "#2563eb", color: "white" }}
                onClick={function() { window.open(d.contentAccess.externalUrl, "_blank"); }}
              >{d.contentAccess.icon || "📰"} {d.contentAccess.label || "Read Article"}</Button>
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
          </div>
          {entity.summary && <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>{entity.summary}</div>}
          {fields.length > 0 && (
            <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1e293b", display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "12px" }}>
              {fields.filter(function(f) { return f.key !== "author" && f.key !== "source" && f.key !== "description"; }).map(function(f) {
                return <div key={f.key} style={{ display: "flex", gap: "4px" }}><span style={{ color: "#64748b" }}>{f.label}:</span><span style={{ color: "#cbd5e1" }}>{Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}</span></div>;
              })}
            </div>
          )}
        </UICard>
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px" }}>🎙️</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}><source src={podcastAudioUrl} type="audio/wav" /></audio>
            {processed && processed.script && (
              <div style={{ marginTop: "8px" }}>
                <button onClick={function() { setShowTranscript(!showTranscript); }}
                  style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "11px", cursor: "pointer", padding: 0 }}>
                  {showTranscript ? "Hide transcript ▲" : "Show transcript ▼"}
                </button>
                {showTranscript && (
                  <div style={{ marginTop: "6px", maxHeight: "300px", overflow: "auto", fontSize: "11px", lineHeight: 1.6 }}>
                    {processed.script.split("\n").map(function(line, i) {
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
        {podcastStatus && podcastStatus !== "ready" && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "16px", height: "16px", border: "2px solid #7c3aed", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>{d.podcastStatusDetail || "Generating podcast..."}</span>
            </div>
          </UICard>
        )}
        {research && research.coreThesis && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 6px" }}>💡 Core Thesis</h3>
            <p style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>{research.coreThesis}</p>
          </UICard>
        )}
        {research && research.keyInsights && research.keyInsights.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 8px" }}>🔑 Key Insights</h3>
            {research.keyInsights.slice(0, 8).map(function(ins, i) {
              return <div key={i} style={{ borderLeft: "3px solid #7c3aed", padding: "6px 12px", margin: "6px 0", background: "#1e1b4b", borderRadius: "0 6px 6px 0" }}>
                <p style={{ fontSize: "13px", color: "#e2e8f0", margin: 0, lineHeight: 1.5 }}>{ins.insight}</p>
                {ins.example && <p style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", margin: "4px 0 0" }}>{ins.example}</p>}
              </div>;
            })}
          </UICard>
        )}
        {research && research.chapterSummaries && research.chapterSummaries.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 8px" }}>📑 Section Summaries</h3>
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
        {research && research.criticalPerspectives && research.criticalPerspectives.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 8px" }}>⚖️ Critical Perspectives</h3>
            {research.criticalPerspectives.map(function(cp, i) {
              return <div key={i} style={{ fontSize: "12px", color: "#fbbf24", marginBottom: "4px", lineHeight: 1.5 }}>• {cp}</div>;
            })}
          </UICard>
        )}
        {cortexContent && !research && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 6px" }}>📄 Knowledge (Cortex)</h3>
            <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cortexContent.slice(0, 1000)}</div>
          </UICard>
        )}
        {related.length > 0 && (function() {
          var sourceIcons = { kindle: "📚", weread: "📚", steam: "🎮", movies_tv: "🎬", youtube: "📺", photos: "📷", qq_music: "🎵", twitter: "🐦", files: "💻", cortex: "🧠", research: "🔬", manual: "📝" };
          var sourceLabels = { kindle: "kindle", weread: "weread", steam: "steam", movies_tv: "movie", youtube: "youtube", photos: "photo", qq_music: "music", twitter: "twitter", files: "project" };
          return (
            <UICard style={{ padding: "14px" }}>
              <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 8px" }}>🔗 Related</h3>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {related.map(function(r) {
                  var icon = sourceIcons[r.source] || "📄";
                  var reason = relatedReasons[r.entityId] || r.reason;
                  var label = sourceLabels[r.source] || r.source;
                  var btn = React.createElement(Button, {
                    key: r.entityId, variant: "outline", size: "sm",
                    style: { fontSize: "10px" },
                    onClick: function() { onAction("view_entity", { entityId: r.entityId }); }
                  }, icon + " " + r.title + " (" + label + ")");
                  return reason
                    ? React.createElement(EnsoUI.Tooltip, { key: r.entityId, content: reason }, btn)
                    : btn;
                })}
              </div>
            </UICard>
          );
        })()}

        {/* Recommended YouTube Videos */}
        {recommendedVideos.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 8px" }}>📺 Recommended Videos</h3>
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

  // ── Article Card component ──
  function ArticleCard({ article, showAdd }) {
    return (
      <UICard style={{ padding: "10px" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ width: "4px", borderRadius: "2px", background: "#6366f1", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "#e2e8f0", lineHeight: 1.3 }}>{article.title}</div>
            {article.source && <div style={{ fontSize: "11px", color: "#818cf8", marginTop: "2px" }}>{article.source}</div>}
            {article.description && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>{article.description.slice(0, 200)}{article.description.length > 200 ? "..." : ""}</div>}
            {article.tags && article.tags.length > 0 && (
              <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "4px" }}>
                {article.tags.filter(function(t) { return t !== "article" && t !== "research" && t !== "enriched"; }).slice(0, 4).map(function(t) {
                  return <Badge key={t} variant="secondary" style={{ fontSize: "9px" }}>{t}</Badge>;
                })}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0, justifyContent: "center" }}>
            {article.entityId && (
              <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("view_entity", { entityId: article.entityId }); }}>View</Button>
            )}
            {article.url && (
              <Button variant="ghost" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("open_url", { url: article.url }); }}>🔗 Open</Button>
            )}
            {showAdd && (
              <Button variant="default" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("add_to_cortex", { title: article.title, type: "article", creator: article.source, url: article.url, description: article.description }); }}>📥 Save</Button>
            )}
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse View ──
  if (isBrowse) {
    var articles = Array.isArray(d.articles) ? d.articles : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>📰</span>
            <span style={{ fontWeight: 600 }}>News & Articles</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{d.totalArticles} saved</span>
          </div>
          <Button variant="default" size="sm" onClick={function() { onAction("trending", {}); }}>🔥 Trending</Button>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px", flex: 1, background: "#1e1b4b", padding: "8px 10px", borderRadius: "8px", border: "1px solid #312e81" }}>
            <Input placeholder="Save article — paste URL or search by title..." value={addInput}
              onChange={function(e) { setAddInput(e.target.value); }}
              onKeyDown={function(e) { if (e.key === "Enter" && addInput.trim()) onAction("add", { query: addInput.trim() }); }}
              style={{ flex: 1, fontSize: "12px" }} />
            <Button variant="default" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { if (addInput.trim()) onAction("add", { query: addInput.trim() }); }}>🔍 Search & Save</Button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Input placeholder="Filter saved articles..." value={searchInput}
            onChange={function(e) { setSearchInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
            style={{ flex: 1 }} />
        </div>

        {articles.length === 0 && (
          <UICard style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📰</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>No saved articles yet</div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>Search for articles above or check trending topics to get started.</div>
          </UICard>
        )}

        {articles.map(function(a, i) { return <ArticleCard key={i} article={a} />; })}
      </div>
    );
  }

  // ── Add/Search Results ──
  if (isAdd) {
    var results = Array.isArray(d.results) ? d.results : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔍</span>
            <span style={{ fontWeight: 600 }}>Save Article</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{results.length} results for "{d.query}"</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>
        {results.map(function(a, i) { return <ArticleCard key={i} article={a} showAdd />; })}
      </div>
    );
  }

  // ── Trending News ──
  if (isTrending) {
    var trending = Array.isArray(d.articles) ? d.articles : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔥</span>
            <span style={{ fontWeight: 600 }}>Trending News</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {d.topic ? "Topic: " + d.topic : "Based on your Cortex interests"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>
        {d.cortexThemes && d.cortexThemes.length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {d.cortexThemes.map(function(t) {
              return <Badge key={t} variant="secondary" style={{ cursor: "pointer", fontSize: "10px" }}
                onClick={function() { onAction("trending", { topic: t }); }}>{t}</Badge>;
            })}
          </div>
        )}
        {trending.map(function(a, i) { return <ArticleCard key={i} article={a} showAdd />; })}
      </div>
    );
  }

  return <div style={{ textAlign: "center", color: "#64748b" }}>📰 News & Articles — browse, save, and explore.</div>;
}

export default function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_articles_browse";
  var isAdd = tool === "enso_articles_add";
  var isTrending = tool === "enso_articles_trending";
  var isEnrich = tool === "enso_articles_enrich";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  var [searchInput, setSearchInput] = useState("");
  var [addInput, setAddInput] = useState("");
  var [addedStatus, setAddedStatus] = useState({});
  var [showTranscript, setShowTranscript] = useState(false);
  var [playingVideo, setPlayingVideo] = useState(null);
  var [activeTopic, setActiveTopic] = useState(null);

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
          <div style={{ display: "flex", gap: "14px" }}>
            {entity.imageUrl && (
              <div style={{ flexShrink: 0 }}>
                <img src={entity.imageUrl} alt="" style={{ width: "120px", height: "80px", objectFit: "cover", borderRadius: "8px", background: "#1e293b" }}
                  onError={function(e) { e.target.style.display = "none"; }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{entity.title}</div>
              {(function() {
                var authorField = fields.find(function(f) { return f.key === "author"; });
                var siteField = fields.find(function(f) { return f.key === "siteName"; });
                var parts = [];
                if (authorField) parts.push(String(authorField.value));
                if (siteField) parts.push(String(siteField.value));
                if (parts.length > 0) return <div style={{ fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>{parts.join(" · ")}</div>;
                return null;
              })()}
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap", alignItems: "center" }}>
                <Badge variant="default">article</Badge>
                <Badge variant="secondary">{entity.source}</Badge>
                {processed && <Badge variant="default" style={{ background: "#7c3aed" }}>🎙️ {podcastDuration ? podcastDuration + " min" : "Podcast"}</Badge>}
                {(function() {
                  var rtField = fields.find(function(f) { return f.key === "readTime"; });
                  if (rtField) return <Badge variant="secondary">📖 {String(rtField.value)}</Badge>;
                  return null;
                })()}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            {d.contentAccess && d.contentAccess.externalUrl && (
              <Button size="sm" style={{ background: "#2563eb", color: "white" }}
                onClick={function() { onAction("open_url", { url: d.contentAccess.externalUrl }); }}
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
                  var email = prompt("Send report + podcast to:", "");
                  if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
                }}
              >📧 Email Podcast</Button>
            )}
          </div>
          {entity.summary && <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "10px", lineHeight: 1.5 }}>{entity.summary}</div>}
          {fields.length > 0 && (
            <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1e293b", display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "12px" }}>
              {fields.filter(function(f) { return f.key !== "author" && f.key !== "siteName" && f.key !== "description" && f.key !== "summary" && f.key !== "readTime"; }).map(function(f) {
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
              <div style={{ marginLeft: "auto" }}>
                <button onClick={function() {
                  if (confirm("Regenerate this podcast? The current one will be replaced.")) {
                    onAction("regenerate_podcast", { entityId: entity.entityId || d.focusEntity });
                  }
                }}
                  style={{ background: "none", border: "1px solid #475569", borderRadius: "4px", color: "#94a3b8", fontSize: "11px", cursor: "pointer", padding: "2px 8px" }}
                >🔄 Regenerate</button>
              </div>
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}><source src={podcastAudioUrl} type={podcastAudioUrl.indexOf(".mp3") >= 0 ? "audio/mpeg" : "audio/wav"} /></audio>
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
            <h3 style={{ color: "#fbbf24", fontSize: "14px", margin: "0 0 8px" }}>⚖️ Critical Perspectives</h3>
            {research.criticalPerspectives.map(function(cp, i) {
              return <p key={i} style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.5, margin: "4px 0", paddingLeft: "10px", borderLeft: "2px solid #fbbf24" }}>{cp}</p>;
            })}
          </UICard>
        )}
        {related.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 10px" }}>🔗 Related in Your Library</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {related.slice(0, 8).map(function(r, i) {
                var reason = relatedReasons[r.entityId] || "";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderRadius: "6px", background: "#1e1b4b", cursor: "pointer" }}
                    onClick={function() { onAction("view_entity", { entityId: r.entityId }); }}>
                    {r.imageUrl && <img src={r.imageUrl} style={{ width: "28px", height: "28px", objectFit: "cover", borderRadius: "4px" }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 500, color: "#e2e8f0" }}>{r.title}</div>
                      {reason && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{reason}</div>}
                    </div>
                    <Badge variant="secondary" style={{ fontSize: "9px" }}>{r.type}</Badge>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}
        {recommendedVideos.length > 0 && (
          <UICard style={{ padding: "14px" }}>
            <h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 10px" }}>🎥 Recommended Videos</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recommendedVideos.slice(0, 5).map(function(v, i) {
                return (
                  <div key={i} style={{ display: "flex", gap: "8px", cursor: "pointer" }}
                    onClick={function() { setPlayingVideo(playingVideo === v.videoId ? null : v.videoId); }}>
                    <img src={v.thumbnail || "https://i.ytimg.com/vi/" + v.videoId + "/mqdefault.jpg"} alt="" style={{ width: "100px", height: "56px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 500, lineHeight: 1.3, color: "#e2e8f0" }}>{v.title}</div>
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

  // ── Article Card component (grid style with image) ──
  function ArticleCard({ article, showAdd, compact }) {
    var hasImage = !!article.imageUrl;
    return (
      <UICard style={{ padding: 0, overflow: "hidden" }}>
        {hasImage && (
          <div style={{ width: "100%", height: "140px", overflow: "hidden", background: "#0f172a" }}
            onClick={function() { if (article.entityId) onAction("view_entity", { entityId: article.entityId }); }}>
            <img src={article.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", cursor: article.entityId ? "pointer" : "default" }}
              onError={function(e) { e.target.parentElement.style.display = "none"; }} />
          </div>
        )}
        <div style={{ padding: "10px 12px 12px" }}>
          <div style={{ fontWeight: 600, fontSize: "13px", color: "#e2e8f0", lineHeight: 1.3, cursor: article.entityId ? "pointer" : "default" }}
            onClick={function() { if (article.entityId) onAction("view_entity", { entityId: article.entityId }); }}>
            {article.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
            {article.author && <span style={{ fontSize: "11px", color: "#94a3b8" }}>{article.author}</span>}
            {article.author && article.domain && <span style={{ fontSize: "11px", color: "#475569" }}>·</span>}
            {article.domain && <span style={{ fontSize: "11px", color: "#6366f1" }}>{article.domain}</span>}
            {article.publishedDate && <span style={{ fontSize: "10px", color: "#475569" }}>{article.publishedDate.slice(0, 10)}</span>}
            {article.readTime && <span style={{ fontSize: "10px", color: "#475569" }}>📖 {article.readTime}</span>}
          </div>
          {article.description && !compact && (
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {article.description.slice(0, 200)}
            </div>
          )}
          {article.tags && article.tags.length > 0 && (
            <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "6px" }}>
              {article.tags.slice(0, 4).map(function(t) {
                return <Badge key={t} variant="secondary" style={{ fontSize: "9px" }}>{t}</Badge>;
              })}
              {article.hasPodcast && <Badge variant="default" style={{ fontSize: "9px", background: "#7c3aed" }}>🎙️</Badge>}
            </div>
          )}
          <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
            {article.entityId && (
              <Button variant="outline" size="sm" style={{ fontSize: "10px", flex: 1 }}
                onClick={function() { onAction("view_entity", { entityId: article.entityId }); }}>View</Button>
            )}
            {article.url && (
              <Button variant="ghost" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("open_url", { url: article.url }); }}>📰 Read</Button>
            )}
            {showAdd && (addedStatus[article.title] === "added" ? (
              <Button variant="outline" size="sm" style={{ fontSize: "10px", color: "#22c55e", borderColor: "#22c55e44", pointerEvents: "none", flex: 1 }}>✓ Saved</Button>
            ) : addedStatus[article.title] === "adding" ? (
              <Button variant="outline" size="sm" style={{ fontSize: "10px", color: "#94a3b8", pointerEvents: "none", flex: 1 }}>Saving...</Button>
            ) : (
              <Button variant="default" size="sm" style={{ fontSize: "10px", flex: 1 }}
                onClick={function() {
                  var key = article.title;
                  setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "adding"; return n; });
                  try {
                    onAction("add_to_cortex", {
                      title: article.title, type: "article", creator: article.author || article.source,
                      url: article.url, description: article.description,
                      imageUrl: article.imageUrl,
                      metadata: { siteName: article.source || article.domain, publishedDate: article.publishedDate, author: article.author }
                    });
                    setTimeout(function() { setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "added"; return n; }); }, 800);
                  } catch(e) {
                    setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = undefined; return n; });
                  }
                }}>📥 Save</Button>
            ))}
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse View (image grid) ──
  if (isBrowse) {
    var articles = Array.isArray(d.articles) ? d.articles : [];
    var topics = Array.isArray(d.topics) ? d.topics : [];
    var totalArticles = d.totalArticles || articles.length;
    var currentPage = d.page || 1;
    var totalPages = d.totalPages || 1;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>📰</span>
            <span style={{ fontWeight: 600 }}>Articles</span>
            <Badge variant="secondary">{totalArticles}</Badge>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("enrich", { limit: 20 }); }}>✨ Enrich</Button>
            <Button variant="default" size="sm" onClick={function() { onAction("trending", {}); }}>🔥 Trending</Button>
          </div>
        </div>

        {/* Add article bar */}
        <div style={{ display: "flex", gap: "8px", background: "#1e1b4b", padding: "8px 10px", borderRadius: "8px", border: "1px solid #312e81" }}>
          <Input placeholder="Save article — paste URL or search by title..." value={addInput}
            onChange={function(v) { setAddInput(v); }}
            onKeyDown={function(e) { if (e.key === "Enter" && addInput.trim()) onAction("add", { query: addInput.trim() }); }}
            style={{ flex: 1, fontSize: "12px" }} />
          <Button variant="default" size="sm" style={{ fontSize: "11px" }}
            onClick={function() { if (addInput.trim()) onAction("add", { query: addInput.trim() }); }}>🔍 Search</Button>
        </div>

        {/* Topic filters */}
        {topics.length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <Badge variant={activeTopic === null ? "default" : "secondary"} style={{ cursor: "pointer", fontSize: "10px" }}
              onClick={function() { setActiveTopic(null); onAction("browse", {}); }}>All</Badge>
            {topics.slice(0, 12).map(function(t) {
              return <Badge key={t} variant={activeTopic === t ? "default" : "secondary"} style={{ cursor: "pointer", fontSize: "10px" }}
                onClick={function() { setActiveTopic(t); onAction("browse", { topic: t }); }}>{t}</Badge>;
            })}
          </div>
        )}

        {/* Search filter */}
        <Input placeholder="Filter articles..." value={searchInput}
          onChange={function(v) { setSearchInput(v); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
          style={{ fontSize: "12px" }} />

        {/* Article grid */}
        {articles.length === 0 ? (
          <EmptyState icon={<LucideReact.FileText size={28} />} title="No saved articles yet"
            description="Paste a URL or search above to save your first article."
            action={<Button onClick={function() { onAction("trending", {}); }}>Browse Trending</Button>} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
            {articles.map(function(a, i) { return <ArticleCard key={i} article={a} />; })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: "8px", alignItems: "center" }}>
            <Button variant="outline" size="sm" disabled={currentPage <= 1}
              onClick={function() { onAction("browse", { page: currentPage - 1, topic: activeTopic }); }}>← Prev</Button>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Page {currentPage} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
              onClick={function() { onAction("browse", { page: currentPage + 1, topic: activeTopic }); }}>Next →</Button>
          </div>
        )}
      </div>
    );
  }

  // ── Add/Search Results (with images) ──
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
          {results.map(function(a, i) { return <ArticleCard key={i} article={a} showAdd />; })}
        </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
          {trending.map(function(a, i) { return <ArticleCard key={i} article={a} showAdd />; })}
        </div>
      </div>
    );
  }

  // ── Enrich Results ──
  if (isEnrich) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>✨</span>
            <span style={{ fontWeight: 600 }}>Article Enrichment</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>
        <UICard style={{ padding: "16px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            <Stat label="Need Enrichment" value={d.totalNeedingEnrichment || 0} accent="amber" />
            <Stat label="Enriched" value={d.enriched || 0} accent="emerald" />
            <Stat label="Errors" value={d.errors || 0} accent="rose" />
          </div>
          {d.enriched > 0 && (
            <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "12px" }}>
              Successfully fetched OpenGraph metadata (images, authors, dates) for {d.enriched} articles.
              {d.totalNeedingEnrichment > d.enriched + (d.errors || 0) ? " Run again to process more." : ""}
            </p>
          )}
        </UICard>
      </div>
    );
  }

  return <div style={{ textAlign: "center", color: "#64748b" }}>📰 News & Articles — browse, save, and explore.</div>;
}

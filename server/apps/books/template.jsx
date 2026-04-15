function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_books_browse" || tool === "enso_kindle_browse";
  var isSearch = tool === "enso_books_search" || tool === "enso_kindle_search";
  var isScan = tool === "enso_books_scan_kindle" || tool === "enso_books_scan_weread" || tool === "enso_kindle_scan" || tool === "enso_context_scan_weread";
  var isEnrich = tool === "enso_books_enrich" || tool === "enso_kindle_enrich";
  var isAddResults = tool === "enso_books_add";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;
  var isDiscover = tool === "enso_books_discover";
  var isTaste = tool === "enso_books_taste";
  var isSuperSearch = tool === "enso_books_super_search";
  var isStats = tool === "enso_books_reading_stats";

  // Hooks MUST be at top level — never inside conditionals
  var [searchInput, setSearchInput] = React.useState(d.query || "");
  var [sortBy, setSortBy] = React.useState(d.sortBy || "publicationDate");
  var [showTranscript, setShowTranscript] = React.useState(false);
  var [activeTab, setActiveTab] = React.useState(isDiscover ? "daily" : (d.tab || "all"));
  var [playingVideo, setPlayingVideo] = React.useState(null);
  var [addBookInput, setAddBookInput] = React.useState("");
  var [addedStatus, setAddedStatus] = React.useState({});
  var [tasteActionStatus, setTasteActionStatus] = React.useState({});
  var [selectedRating, setSelectedRating] = React.useState(0);
  var [ratingBookId, setRatingBookId] = React.useState(null);
  var [activeMoodFilter, setActiveMoodFilter] = React.useState(null);
  var [superSearchInput, setSuperSearchInput] = React.useState("");

  // ── Breadcrumb navigation bar (shown when navStack has entries) ──
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

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}

        {/* Entity header with inline metadata */}
        <UICard style={{ padding: "16px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            {entity.imageUrl && (
              <img src={entity.imageUrl} alt={entity.title}
                style={{ width: "80px", height: "120px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{entity.title}</div>
              {(function() {
                var authorField = fields.find(function(f) { return f.key === "author" || f.key === "director" || f.key === "developer" || f.key === "creator"; });
                if (authorField) {
                  var val = Array.isArray(authorField.value) ? authorField.value.join(", ") : String(authorField.value);
                  return <div style={{ fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>{val}</div>;
                }
                return null;
              })()}
              <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                <Badge variant="default">{entity.type}</Badge>
                <Badge variant="secondary">{entity.source}</Badge>
                {processed && <Badge variant="default" style={{ background: "#7c3aed" }}>🎙️ {podcastDuration ? podcastDuration + " min" : "Podcast Ready"}</Badge>}
              </div>
              {/* Action buttons */}
              <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                {d.contentAccess && d.contentAccess.externalUrl && (
                  <Button size="sm" style={{ background: "#059669", color: "white" }}
                    onClick={function() { window.open(d.contentAccess.externalUrl, "_blank"); }}
                  >{d.contentAccess.icon || "📖"} {d.contentAccess.label || "Read"}</Button>
                )}
                {!podcastAudioUrl && !podcastStatus && (
                  <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
                    onClick={function() { onAction("deep_content", { entityId: entity.entityId || d.focusEntity }); }}
                  >🎙️ Generate Podcast</Button>
                )}
                {podcastAudioUrl && (
                  <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
                    onClick={function() {
                      var email = prompt("Send summary + podcast to:", "");
                      if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
                    }}
                  >📧 Email Podcast</Button>
                )}
                <Button size="sm" style={{ background: "#16a34a", color: "white" }}
                  onClick={function() {
                    if (processed && entity.entityId && research) {
                      var slug = entity.entityId.replace(/[^\p{L}\p{N}-]/gu, "_").slice(0, 120);
                      var shortHash = slug.split("").reduce(function(a, c) { return ((a << 5) - a + c.charCodeAt(0)) | 0; }, 0).toString(36).replace("-", "");
                      var podcastUrl = "https://pc1.enso.net/p/" + shortHash;

                      var desc = "\u{1F399}\uFE0F AI Podcast \u00B7 " + (podcastDuration || "?") + " min";
                      if (entity.author) desc += "\n" + entity.author;
                      if (research.coreThesis) desc += "\n" + research.coreThesis.slice(0, 80);

                      var summary = "\u{1F4DA} " + entity.title;
                      if (entity.author) summary += " \u2014 " + entity.author;
                      if (research.coreThesis) summary += "\n\n\u{1F4A1} " + research.coreThesis;
                      if (research.keyInsights && research.keyInsights.length > 0) {
                        summary += "\n\n\u{1F511} Key Insights:";
                        research.keyInsights.slice(0, 5).forEach(function(ins) {
                          var text = typeof ins === "string" ? ins : (ins.insight || ins.title || String(ins));
                          summary += "\n\u2022 " + text.slice(0, 100);
                        });
                      }

                      onAction("share_wechat", {
                        content: summary,
                        title: "\u{1F399}\uFE0F " + entity.title + " \u2014 AI Podcast",
                        description: desc,
                        linkUrl: podcastUrl,
                        coverUrl: entity.imageUrl || undefined
                      });
                    } else {
                      var msg = "\u{1F4DA} " + entity.title;
                      if (entity.author) msg += " by " + entity.author;
                      if (entity.rating) msg += "\n\u2B50 " + entity.rating;
                      if (entity.categories) msg += "\n" + entity.categories;
                      if (entity.summary) msg += "\n\n" + entity.summary;
                      onAction("share_wechat", { content: msg });
                    }
                  }}
                >微信</Button>
              </div>
              {entity.summary && (
                <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
                  {entity.summary.length > 300 ? entity.summary.slice(0, 300) + "..." : entity.summary}
                </div>
              )}
            </div>
          </div>

          {/* Metadata fields inline below header */}
          {(function() {
            var skip = { author: 1, director: 1, developer: 1, creator: 1, description: 1, subtitle: 1 };
            var visible = fields.filter(function(f) {
              if (skip[f.key]) return false;
              var v = f.value;
              if (v === undefined || v === null || v === "" || v === 0 || v === "0") return false;
              if (Array.isArray(v) && v.length === 0) return false;
              return true;
            });
            if (visible.length === 0) return null;
            return (
              <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "12px" }}>
                  {visible.map(function(f) {
                    var val = Array.isArray(f.value) ? f.value.join(", ") : String(f.value);
                    return (
                      <div key={f.key} style={{ display: "flex", gap: "4px" }}>
                        <span style={{ color: "#64748b" }}>{f.label}:</span>
                        <span style={{ color: "#cbd5e1" }}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </UICard>

        {/* Podcast Player (when ready) */}
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px" }}>🎙️</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Book Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
              <div style={{ marginLeft: "auto" }}>
                <button onClick={function() {
                  if (confirm("Regenerate this podcast? The current one will be replaced.")) {
                    onAction("regenerate_podcast", { entityId: entity.entityId || d.focusEntity });
                  }
                }}
                  style={{ background: "none", border: "1px solid #475569", borderRadius: "4px", color: "#94a3b8", fontSize: "11px", cursor: "pointer", padding: "2px 8px", transition: "color 0.2s" }}
                  title="Delete cached podcast and regenerate with latest pipeline"
                >🔄 Regenerate</button>
              </div>
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}>
              <source src={podcastAudioUrl} type={podcastAudioUrl.indexOf(".mp3") >= 0 ? "audio/mpeg" : "audio/wav"} />
            </audio>
            {podcastScript && (
              <div style={{ marginTop: "8px" }}>
                <button onClick={function() { setShowTranscript(!showTranscript); }}
                  style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "11px", cursor: "pointer", padding: 0 }}>
                  {showTranscript ? "Hide transcript ▲" : "Show transcript ▼"}
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
            >🔄 Retry</Button>
          </UICard>
        )}

        {/* Deep Research Content (from processedBook) */}
        {research && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Core Thesis */}
            {research.coreThesis && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#94a3b8" }}>💡 Core Thesis</div>
                <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.6 }}>{research.coreThesis}</div>
              </UICard>
            )}

            {/* Key Insights */}
            {research.keyInsights && research.keyInsights.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>🔑 Key Insights</div>
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

            {/* Chapter Summaries */}
            {research.chapterSummaries && research.chapterSummaries.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>📑 Chapter Summaries</div>
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

            {/* Critical Perspectives */}
            {research.criticalPerspectives && research.criticalPerspectives.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>⚖️ Critical Perspectives</div>
                {research.criticalPerspectives.map(function(cp, i) {
                  return <div key={i} style={{ fontSize: "12px", color: "#fbbf24", marginBottom: "4px", lineHeight: 1.5 }}>• {cp}</div>;
                })}
              </UICard>
            )}
          </div>
        )}

        {/* Detail fields already shown in header card above */}

        {/* Cortex wiki content removed — redundant with structured metadata above */}

        {/* Related entities — cross-source with reasons */}
        {related.length > 0 && (function() {
          var sourceIcons = { kindle: "📚", weread: "📚", steam: "🎮", movies_tv: "🎬", youtube: "📺", photos: "📷", qq_music: "🎵", twitter: "🐦", files: "💻", cortex: "🧠", research: "🔬", manual: "📝" };
          var sourceLabels = { kindle: "kindle", weread: "weread", steam: "steam", movies_tv: "movie", youtube: "youtube", photos: "photo", qq_music: "music", twitter: "twitter", files: "project" };
          return (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>🔗 Related</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {related.map(function(r) {
                  var icon = sourceIcons[r.source] || "📄";
                  var reason = relatedReasons[r.entityId] || r.reason;
                  var label = sourceLabels[r.source] || r.source;
                  var card = (
                    <div key={r.entityId}
                      style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 8px", background: "#1e293b", borderRadius: "8px", cursor: "pointer", border: "1px solid #334155", transition: "border-color 0.2s", overflow: "hidden" }}
                      onClick={function() { onAction("view_entity", { entityId: r.entityId }); }}
                      title={reason || r.title}>
                      {r.imageUrl ? (
                        <img src={r.imageUrl} alt="" style={{ width: "36px", height: "52px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: "36px", height: "52px", borderRadius: "4px", flexShrink: 0, background: "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{icon}</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: "1.3" }}>{r.title}</div>
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

  // ── Scan / Enrich result ──
  if (isScan || isEnrich) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>{isScan ? "📚" : "✨"}</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>{isScan ? "Kindle Library Scanned" : "Metadata Enrichment"}</div>
          {d.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{d.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {isScan && d.data && ("Found " + (d.data.totalBooks || "?") + " books")}
              {isEnrich && (d.enriched + " books enriched, " + d.errors + " errors")}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Library</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Add Book search results ──
  if (isAddResults) {
    var addResults = Array.isArray(d.results) ? d.results : [];
    var sourceCounts = d.sourceCounts || {};
    var SOURCE_STYLES = {
      google: { label: "Google", bg: "#1d4ed8", color: "#fff" },
      weread: { label: "微信读书", bg: "#059669", color: "#fff" },
      douban: { label: "Douban", bg: "#d97706", color: "#fff" },
      kindle: { label: "Kindle", bg: "#ea580c", color: "#fff" },
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔍</span>
            <span style={{ fontWeight: 600 }}>Add Book</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {addResults.length > 0 ? addResults.length + " results for \"" + d.query + "\"" : "No results found"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>
        {sourceCounts && (sourceCounts.google > 0 || sourceCounts.weread > 0 || sourceCounts.douban > 0 || sourceCounts.kindle > 0) && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {Object.keys(SOURCE_STYLES).map(function(key) {
              var s = SOURCE_STYLES[key];
              var count = sourceCounts[key] || 0;
              return (
                <span key={key} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: count > 0 ? s.bg : "#374151", color: count > 0 ? s.color : "#6b7280" }}>
                  {s.label}: {count}
                </span>
              );
            })}
          </div>
        )}
        {d.error && <UICard style={{ borderColor: "#ef444444" }}><div style={{ color: "#ef4444", fontSize: "13px" }}>{d.error}</div></UICard>}
        {addResults.length === 0 && !d.error && (
          <UICard style={{ padding: "16px", textAlign: "center" }}>
            <div style={{ color: "#94a3b8", fontSize: "13px" }}>No results found across Google Books, 微信读书, Douban, and Amazon Kindle.</div>
            <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>Try a different search term or check the spelling.</div>
          </UICard>
        )}
        {addResults.map(function(r, i) {
          var srcStyle = SOURCE_STYLES[r.source] || { label: r.source || "?", bg: "#374151", color: "#9ca3af" };
          var ratingDisplay = "";
          if (r.rating > 0) {
            if (r.source === "weread") ratingDisplay = r.rating + "%";
            else if (r.source === "douban") ratingDisplay = r.rating + "/10";
            else ratingDisplay = String(r.rating);
          }
          return (
            <UICard key={i} style={{ padding: "12px" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                {r.coverUrl ? (
                  <img src={r.coverUrl} alt={r.title} style={{ width: "60px", height: "90px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: "60px", height: "90px", background: "#1e293b", borderRadius: "4px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", color: "#475569" }}>📚</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>
                      {r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#e2e8f0", textDecoration: "none" }}>{r.title}{r.subtitle ? ": " + r.subtitle : ""}</a> : (r.title + (r.subtitle ? ": " + r.subtitle : ""))}
                    </span>
                    <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: srcStyle.bg, color: srcStyle.color, fontWeight: 600, letterSpacing: "0.3px", flexShrink: 0 }}>{srcStyle.label}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{r.author}{r.publishedDate ? " · " + r.publishedDate : ""}{r.publisher ? " · " + r.publisher : ""}{r.price ? " · " + r.price : ""}</div>
                  {ratingDisplay && (
                    <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "3px" }}>
                      {"⭐ " + ratingDisplay}{r.ratingsCount ? " (" + r.ratingsCount + " ratings)" : ""}{r.pageCount ? " · " + r.pageCount + " pages" : ""}
                    </div>
                  )}
                  {r.categories && r.categories.length > 0 && (
                    <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "3px" }}>
                      {r.categories.slice(0, 3).map(function(c) { return <Badge key={c} variant="secondary" style={{ fontSize: "9px", padding: "1px 5px" }}>{c}</Badge>; })}
                    </div>
                  )}
                  {r.description && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>{r.description.slice(0, 200)}{r.description.length > 200 ? "..." : ""}</div>}
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
                        onAction("add_to_cortex", { title: r.title, type: "book", creator: r.author, year: r.publishedDate, description: r.description, imageUrl: r.coverUrl, metadata: { rating: r.rating, ratingsCount: r.ratingsCount, source: r.source, sourceUrl: r.sourceUrl, pageCount: r.pageCount, categories: r.categories, publisher: r.publisher, subtitle: r.subtitle } });
                        setTimeout(function() {
                          setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[idx] = "added"; return n; });
                        }, 800);
                      } catch(e) {
                        setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[idx] = "error"; return n; });
                      }
                    }}>📥 Add to Library</Button>
                  )}
                  {r.sourceUrl && (
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: "#60a5fa", textAlign: "center", textDecoration: "none" }}>
                      Open on {srcStyle.label} ↗
                    </a>
                  )}
                </div>
              </div>
            </UICard>
          );
        })}
      </div>
    );
  }

  // ── Search results ──
  if (isSearch) {
    var results = d.results || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
            {d.totalResults} result{d.totalResults !== 1 ? "s" : ""} for "{d.query}"
          </span>
        </div>
        {results.map(function(book, i) {
          return <BookCard key={i} book={book} onAction={onAction} />;
        })}
        {results.length === 0 && <EmptyState title="No results" description={"No books matching \"" + d.query + "\""} />}
      </div>
    );
  }

  // ── Daily Discovery View ──
  if (isDiscover || isTaste) {
    var disc = isDiscover ? d : {};
    var tasteData = isTaste ? d : {};
    var thm = disc.theme || {};
    var botd = disc.bookOfTheDay;
    var picks = disc.themePicks || [];
    var bestseller = disc.bestsellerSpotlight;
    var serendipity = disc.serendipityPick;
    var tp = disc.tasteProfile || tasteData.profile || {};
    var streak = tp.streak || { current: 0, longest: 0 };

    // Helper: render taste action buttons for a book
    function DiscoveryBookActions({ book, section }) {
      var bookSlug = (book.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      var key = section + "-" + bookSlug;
      var status = tasteActionStatus[key];
      var bookPayload = { title: book.title, author: book.author, categories: book.categories || [], coverUrl: book.coverUrl || "", moodTags: book.moodTags || [], pageCount: book.pageCount || 0 };

      if (status === "saved") return <Badge variant="success" style={{ fontSize: "10px" }}>Saved</Badge>;
      if (status === "dismissed") return <Badge variant="secondary" style={{ fontSize: "10px", opacity: 0.6 }}>Dismissed</Badge>;
      if (status === "rated") return <Badge variant="info" style={{ fontSize: "10px" }}>Rated</Badge>;

      return (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <Button variant="outline" size="sm" style={{ fontSize: "10px", padding: "2px 8px" }}
            onClick={function() {
              setTasteActionStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "saved"; return n; });
              onAction("taste", { action: "save", bookId: bookSlug, bookData: bookPayload });
            }}>Save</Button>
          <Button variant="outline" size="sm" style={{ fontSize: "10px", padding: "2px 8px" }}
            onClick={function() {
              setRatingBookId(ratingBookId === key ? null : key);
              setSelectedRating(0);
            }}>Rate</Button>
          <Button variant="ghost" size="sm" style={{ fontSize: "10px", padding: "2px 8px", color: "#64748b" }}
            onClick={function() {
              setTasteActionStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "dismissed"; return n; });
              onAction("taste", { action: "dismiss", bookId: bookSlug, bookData: bookPayload });
            }}>Not for me</Button>
          <Button variant="outline" size="sm" style={{ fontSize: "10px", padding: "2px 8px", color: "#22c55e", borderColor: "#22c55e44" }}
            onClick={function() { onAction("add", { query: book.title + (book.author ? " " + book.author : "") }); }}>Add to Library</Button>
          {ratingBookId === key && (
            <div style={{ display: "flex", gap: "2px", alignItems: "center", marginLeft: "4px" }}>
              {[1, 2, 3, 4, 5].map(function(star) {
                return (
                  <span key={star} style={{ cursor: "pointer", fontSize: "16px", color: star <= selectedRating ? "#f59e0b" : "#475569" }}
                    onClick={function() {
                      setSelectedRating(star);
                      setTasteActionStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "rated"; return n; });
                      setRatingBookId(null);
                      onAction("taste", { action: "rate", bookId: bookSlug, rating: star, bookData: bookPayload });
                    }}
                    onMouseEnter={function() { setSelectedRating(star); }}
                  >{star <= selectedRating ? "\u2605" : "\u2606"}</span>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Taste Profile view (when action=view)
    if (isTaste && tasteData.action === "view") {
      var prof = tasteData.profile || {};
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {breadcrumb}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>{"\u{1F3AF}"}</span>
              <span style={{ fontWeight: 700, fontSize: "16px" }}>Your Taste Profile</span>
              <Badge variant="secondary">{prof.interactionCount || 0} interactions</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={function() { onAction("discover", {}); }}>{"\u2728"} Daily Picks</Button>
          </div>

          {/* Streak + Stats */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Stat label="Streak" value={(prof.streak || {}).current || 0} accent="#f59e0b" />
            <Stat label="Saved" value={prof.savedCount || 0} accent="#22c55e" />
            <Stat label="Rated" value={prof.ratedCount || 0} accent="#3b82f6" />
            <Stat label="Dismissed" value={prof.dismissedCount || 0} accent="#64748b" />
          </div>

          {/* Top Genres */}
          {(prof.topGenres || []).length > 0 && (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Genre Preferences</div>
              {(prof.topGenres || []).map(function(g) {
                return (
                  <div key={g.genre} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", color: "#cbd5e1", width: "120px" }}>{g.genre.replace(/_/g, " ")}</span>
                    <Progress value={Math.round(g.weight * 100)} max={100} style={{ flex: 1 }} />
                    <span style={{ fontSize: "11px", color: "#64748b", width: "36px", textAlign: "right" }}>{Math.round(g.weight * 100)}%</span>
                  </div>
                );
              })}
            </UICard>
          )}

          {/* Mood Preferences */}
          {(prof.topMoods || []).length > 0 && (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Mood Preferences</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {(prof.topMoods || []).map(function(m) {
                  var pct = Math.round((m.weight || 0.5) * 100);
                  return (
                    <div key={m.mood} style={{ background: "#1e1b4b", padding: "4px 10px", borderRadius: "12px", fontSize: "11px" }}>
                      <span style={{ color: "#c4b5fd" }}>{m.mood}</span>
                      <span style={{ color: "#64748b", marginLeft: "4px" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
              {prof.lengthPreference && prof.lengthPreference !== "balanced" && (
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                  Length preference: {prof.lengthPreference === "long" ? "\u{1F4DA} Prefers longer reads" : "\u26A1 Prefers shorter reads"}
                </div>
              )}
            </UICard>
          )}

          {/* Top Authors */}
          {(prof.topAuthors || []).length > 0 && (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Favorite Authors</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(prof.topAuthors || []).map(function(a) {
                  return <Badge key={a.author} variant="default">{a.author} ({Math.round(a.affinity * 100)}%)</Badge>;
                })}
              </div>
            </UICard>
          )}

          {/* Recent Saved */}
          {(prof.savedBooks || []).length > 0 && (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Recently Saved</div>
              {(prof.savedBooks || []).slice(-5).reverse().map(function(b) {
                return (
                  <div key={b.slug} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    {b.coverUrl && <img src={b.coverUrl} alt={b.title} style={{ width: "30px", height: "44px", objectFit: "cover", borderRadius: "3px" }} />}
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 500 }}>{b.title}</div>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{b.author} {"\u00B7"} {b.savedAt ? b.savedAt.slice(0, 10) : ""}</div>
                    </div>
                  </div>
                );
              })}
            </UICard>
          )}
        </div>
      );
    }

    // Taste action confirmation (save/rate/dismiss response)
    if (isTaste && tasteData.action !== "view") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {breadcrumb}
          <UICard style={{ padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", marginBottom: "4px" }}>{tasteData.action === "save" ? "\u{1F4BE}" : tasteData.action === "rate" ? "\u2B50" : "\u{1F44E}"}</div>
            <div style={{ fontSize: "14px", fontWeight: 500 }}>{tasteData.message || "Done!"}</div>
            <div style={{ marginTop: "12px", display: "flex", gap: "8px", justifyContent: "center" }}>
              <Button variant="default" size="sm" onClick={function() { onAction("discover", {}); }}>{"\u2728"} Back to Daily</Button>
              <Button variant="outline" size="sm" onClick={function() { onAction("taste", { action: "view" }); }}>{"\u{1F3AF}"} View Profile</Button>
            </div>
          </UICard>
        </div>
      );
    }

    // Main Daily Discovery layout
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "22px", marginRight: "6px" }}>{thm.icon || "\u2728"}</span>
            <span style={{ fontWeight: 700, fontSize: "16px" }}>{thm.name || "Daily Discovery"}</span>
            <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "8px" }}>{thm.dayLabel || ""}</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "4px" }}>{disc.date || ""}</span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { onAction("taste", { action: "view" }); }}>{"\u{1F3AF}"} Profile</Button>
            <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { onAction("discover", { refresh: true }); }}>{"\u{1F504}"} Refresh</Button>
            <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { onAction("browse", {}); }}>{"\u2190"} Library</Button>
          </div>
        </div>

        {/* Source counts */}
        {disc.sourceCounts && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: "#1e40af", color: "#93c5fd" }}>Open Library: {disc.sourceCounts.openlibrary || 0}</span>
            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: "#065f46", color: "#6ee7b7" }}>Google Books: {disc.sourceCounts.google || 0}</span>
            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: "#78350f", color: "#fcd34d" }}>NYT: {disc.sourceCounts.nyt || 0}</span>
            {disc.sourceCounts.hardcover > 0 && (
              <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: "#7c2d12", color: "#fdba74" }}>Hardcover: {disc.sourceCounts.hardcover}</span>
            )}
            {disc.fromCache && <Badge variant="secondary" style={{ fontSize: "9px" }}>Cached</Badge>}
          </div>
        )}

        {/* Mood Filter Chips */}
        {(function() {
          var allMoods = {};
          [disc.bookOfTheDay, disc.serendipityPick, disc.bestsellerSpotlight]
            .concat(disc.themePicks || [])
            .filter(Boolean)
            .forEach(function(b) { (b.moodTags || []).forEach(function(m) { allMoods[m] = (allMoods[m] || 0) + 1; }); });
          var moodList = Object.keys(allMoods);
          if (moodList.length === 0) return null;
          return (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Mood:</span>
              {moodList.map(function(mood) {
                var isActive = activeMoodFilter === mood;
                return (
                  <button key={mood}
                    onClick={function() { setActiveMoodFilter(isActive ? null : mood); }}
                    style={{
                      fontSize: "10px", padding: "2px 8px", borderRadius: "12px",
                      border: "1px solid " + (isActive ? "#a78bfa" : "#475569"),
                      background: isActive ? "#7c3aed33" : "transparent",
                      color: isActive ? "#c4b5fd" : "#94a3b8", cursor: "pointer"
                    }}>
                    {mood}
                  </button>
                );
              })}
              {activeMoodFilter && (
                <button onClick={function() { setActiveMoodFilter(null); }}
                  style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "12px", border: "none", background: "transparent", color: "#64748b", cursor: "pointer" }}>
                  Clear
                </button>
              )}
            </div>
          );
        })()}

        {/* Book of the Day */}
        {botd && (!activeMoodFilter || (botd.moodTags || []).indexOf(activeMoodFilter) >= 0) && (
          <UICard style={{ padding: "14px", borderColor: "#f59e0b44", borderWidth: "1px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <span style={{ fontSize: "14px" }}>{"\u{1F4D5}"}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fbbf24" }}>Book of the Day</span>
            </div>
            <div style={{ display: "flex", gap: "14px" }}>
              {botd.coverUrl && (
                <img src={botd.coverUrl} alt={botd.title} style={{ width: "80px", height: "120px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1.3 }}>{botd.title}</div>
                {botd.author && <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>{botd.author}</div>}
                <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                  {botd.rating > 0 && <span style={{ fontSize: "11px", color: "#f59e0b" }}>{"\u2B50"} {botd.rating}</span>}
                  {botd.pageCount > 0 && <span style={{ fontSize: "11px", color: "#64748b" }}>{botd.pageCount} pages</span>}
                  {(botd.categories || []).slice(0, 2).map(function(c) { return <Badge key={c} variant="secondary" style={{ fontSize: "9px" }}>{c}</Badge>; })}
                  <Badge variant="outline" style={{ fontSize: "9px" }}>{botd.source}</Badge>
                </div>
                {botd.description && (
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px", lineHeight: 1.5, fontStyle: "italic" }}>
                    {"\u201C"}{botd.description.slice(0, 200)}{botd.description.length > 200 ? "..." : ""}{"\u201D"}
                  </div>
                )}
                {(botd.moodTags || []).length > 0 && (
                  <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                    {(botd.moodTags || []).map(function(mood) {
                      return <Badge key={mood} variant="outline" style={{ fontSize: "9px", borderColor: "#7c3aed", color: "#c4b5fd" }}>{mood}</Badge>;
                    })}
                  </div>
                )}
                {botd.whyThisBook && (
                  <div style={{ fontSize: "12px", color: "#a78bfa", marginTop: "6px" }}>
                    {"\u{1F4A1}"} <strong>Why today:</strong> {botd.whyThisBook}
                  </div>
                )}
                {botd.cortexConnection && (
                  <div style={{ fontSize: "11px", color: "#22d3ee", marginTop: "2px" }}>
                    {"\u{1F517}"} {botd.cortexConnection}
                  </div>
                )}
                {botd.whoItsFor && (
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    {"\u{1F464}"} {botd.whoItsFor}
                  </div>
                )}
                {botd.communityReading > 0 && (
                  <div style={{ fontSize: "10px", color: "#fdba74", marginTop: "3px" }}>
                    {"\u{1F4D6}"} {botd.communityReading} reading now
                  </div>
                )}
                <div style={{ marginTop: "8px" }}>
                  <DiscoveryBookActions book={botd} section="botd" />
                </div>
              </div>
            </div>
          </UICard>
        )}

        {/* Theme Picks */}
        {(function() {
          var filteredPicks = activeMoodFilter ? picks.filter(function(p) { return (p.moodTags || []).indexOf(activeMoodFilter) >= 0; }) : picks;
          if (filteredPicks.length === 0) return null;
          return (
            <UICard style={{ padding: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <span style={{ fontSize: "14px" }}>{"\u{1F4DA}"}</span>
                <span style={{ fontSize: "13px", fontWeight: 700 }}>Theme Picks</span>
                <Badge variant="secondary" style={{ fontSize: "10px" }}>{filteredPicks.length}</Badge>
              </div>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
                {filteredPicks.map(function(pick, idx) {
                  return (
                    <div key={idx} style={{ minWidth: "160px", maxWidth: "180px", flexShrink: 0 }}>
                      {pick.coverUrl && (
                        <img src={pick.coverUrl} alt={pick.title} style={{ width: "100%", height: "120px", objectFit: "cover", borderRadius: "6px" }} />
                      )}
                      <div style={{ fontWeight: 600, fontSize: "12px", marginTop: "6px", lineHeight: 1.3 }}>{pick.title}</div>
                      {pick.author && <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>{pick.author}</div>}
                      {(pick.moodTags || []).length > 0 && (
                        <div style={{ display: "flex", gap: "3px", marginTop: "3px", flexWrap: "wrap" }}>
                          {(pick.moodTags || []).map(function(mood) {
                            return <span key={mood} style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "8px", background: "#7c3aed22", color: "#c4b5fd", border: "1px solid #7c3aed44" }}>{mood}</span>;
                          })}
                        </div>
                      )}
                      {pick.oneLinePitch && (
                        <div style={{ fontSize: "10px", color: "#a78bfa", marginTop: "3px", lineHeight: 1.3, fontStyle: "italic" }}>
                          {"\u201C"}{pick.oneLinePitch}{"\u201D"}
                        </div>
                      )}
                      {pick.communityReading > 0 && (
                        <div style={{ fontSize: "9px", color: "#fdba74", marginTop: "2px" }}>{"\u{1F4D6}"} {pick.communityReading} reading</div>
                      )}
                      <div style={{ marginTop: "6px" }}>
                        <DiscoveryBookActions book={pick} section={"pick-" + idx} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </UICard>
          );
        })()}

        {/* Bestseller Spotlight */}
        {bestseller && (!activeMoodFilter || (bestseller.moodTags || []).indexOf(activeMoodFilter) >= 0) && (
          <UICard style={{ padding: "12px", borderColor: "#eab30844" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <span style={{ fontSize: "14px" }}>{"\u{1F3C6}"}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fbbf24" }}>Bestseller Spotlight</span>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              {bestseller.coverUrl && (
                <img src={bestseller.coverUrl} alt={bestseller.title} style={{ width: "60px", height: "90px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{bestseller.title}</div>
                {bestseller.author && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{bestseller.author}</div>}
                {bestseller.rankingContext && (
                  <div style={{ fontSize: "11px", color: "#fbbf24", marginTop: "4px" }}>{"\u{1F4C8}"} {bestseller.rankingContext}</div>
                )}
                <div style={{ marginTop: "6px" }}>
                  <DiscoveryBookActions book={bestseller} section="bestseller" />
                </div>
              </div>
            </div>
          </UICard>
        )}

        {/* Community Trending */}
        {(disc.communityTrending || []).length > 0 && !activeMoodFilter && (
          <UICard style={{ padding: "12px", borderColor: "#f97316aa" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <span style={{ fontSize: "14px" }}>{"\u{1F525}"}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fdba74" }}>Community Trending</span>
              <Badge variant="secondary" style={{ fontSize: "10px" }}>Hardcover</Badge>
            </div>
            <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
              {(disc.communityTrending || []).map(function(book, idx) {
                return (
                  <div key={idx} style={{ minWidth: "140px", maxWidth: "160px", flexShrink: 0 }}>
                    {book.coverUrl && (
                      <img src={book.coverUrl} alt={book.title} style={{ width: "100%", height: "100px", objectFit: "cover", borderRadius: "6px" }} />
                    )}
                    <div style={{ fontWeight: 600, fontSize: "11px", marginTop: "4px", lineHeight: 1.3 }}>{book.title}</div>
                    {book.author && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{book.author}</div>}
                    <div style={{ display: "flex", gap: "4px", marginTop: "3px", alignItems: "center", flexWrap: "wrap" }}>
                      {book.rating > 0 && <span style={{ fontSize: "10px", color: "#f59e0b" }}>{"\u2B50"} {book.rating.toFixed(1)}</span>}
                      <span style={{ fontSize: "9px", color: "#fdba74" }}>{"\u{1F4D6}"} {book.communityReading} reading</span>
                    </div>
                    <div style={{ marginTop: "4px" }}>
                      <DiscoveryBookActions book={book} section={"trending-" + idx} />
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* Serendipity Pick */}
        {serendipity && (!activeMoodFilter || (serendipity.moodTags || []).indexOf(activeMoodFilter) >= 0) && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <span style={{ fontSize: "14px" }}>{"\u{1F3B2}"}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#c4b5fd" }}>Serendipity Pick</span>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              {serendipity.coverUrl && (
                <img src={serendipity.coverUrl} alt={serendipity.title} style={{ width: "60px", height: "90px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{serendipity.title}</div>
                {serendipity.author && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{serendipity.author}</div>}
                {serendipity.whyUnexpected && (
                  <div style={{ fontSize: "12px", color: "#c4b5fd", marginTop: "4px", fontStyle: "italic" }}>
                    {"\u201C"}{serendipity.whyUnexpected}{"\u201D"}
                  </div>
                )}
                <div style={{ marginTop: "6px" }}>
                  <DiscoveryBookActions book={serendipity} section="serendipity" />
                </div>
              </div>
            </div>
          </UICard>
        )}

        {/* Streak + Stats Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "8px", fontSize: "12px", color: "#64748b", borderTop: "1px solid #374151" }}>
          {streak.current > 0 && <span>{"\u{1F525}"} {streak.current}-day streak</span>}
          {tp.interactionCount > 0 && <span>{"\u{1F4BE}"} {tp.interactionCount} interactions</span>}
          {(tp.topGenres || []).length > 0 && <span>Top: {(tp.topGenres || []).slice(0, 3).map(function(g) { return g.replace(/_/g, " "); }).join(", ")}</span>}
          {(tp.topMoods || []).length > 0 && <span>Mood: {(tp.topMoods || []).slice(0, 2).map(function(m) { return m.mood; }).join(", ")}</span>}
        </div>

        {/* Empty state if no data yet */}
        {!botd && picks.length === 0 && !bestseller && !serendipity && (
          <EmptyState
            title="No discoveries yet"
            description={"Click Refresh to generate today's picks, or wait for the Team Leader morning routine."}
          />
        )}
      </div>
    );
  }

  // ── Super Search Results ──
  if (isSuperSearch) {
    var ssResults = Array.isArray(d.results) ? d.results : [];
    var ssPrefs = d.preferences || {};
    var SOURCE_COLORS = {
      google: { bg: "#1d4ed8", color: "#fff", label: "Google Books" },
      openlibrary: { bg: "#065f46", color: "#6ee7b7", label: "Open Library" },
      web: { bg: "#374151", color: "#d1d5db", label: "Web" },
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: "16px" }}>Super Search</span>
            {d.query && <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "8px" }}>focused on "{d.query}"</span>}
            {!d.query && <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>personalized for your library</span>}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { onAction("super_search", { refresh: true, query: d.query || undefined }); }}>🔄 Refresh</Button>
            <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { onAction("browse", {}); }}>← Library</Button>
          </div>
        </div>

        {/* Search insight banner */}
        {d.searchInsight && (
          <div style={{ background: "linear-gradient(135deg, #1e1b4b, #0f172a)", border: "1px solid #7c3aed44", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#c4b5fd" }}>
            💡 {d.searchInsight}
          </div>
        )}

        {/* Preference signals used */}
        {(ssPrefs.topGenres || []).length > 0 || (ssPrefs.topAuthors || []).length > 0 ? (
          <UICard style={{ padding: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "6px" }}>Based on your reading profile</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(ssPrefs.topGenres || []).map(function(g) {
                return <Badge key={g} variant="default" style={{ fontSize: "9px", background: "#1e40af" }}>{g.replace(/_/g, " ")}</Badge>;
              })}
              {(ssPrefs.topAuthors || []).map(function(a) {
                return <Badge key={a} variant="secondary" style={{ fontSize: "9px" }}>{a}</Badge>;
              })}
              {ssPrefs.librarySize > 0 && (
                <span style={{ fontSize: "10px", color: "#475569", alignSelf: "center" }}>· {ssPrefs.librarySize} books in library</span>
              )}
              {d.fromCache && <Badge variant="outline" style={{ fontSize: "9px" }}>Cached</Badge>}
            </div>
          </UICard>
        ) : null}

        {/* Error state */}
        {d.error && (
          <UICard style={{ borderColor: "#ef444444", padding: "12px" }}>
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{d.error}</div>
          </UICard>
        )}

        {/* Empty state */}
        {ssResults.length === 0 && !d.error && (
          <UICard style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>📚</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>No recommendations found</div>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>
              Try scanning your Kindle library first, or provide a focus query.
            </div>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>← Back to Library</Button>
          </UICard>
        )}

        {/* Results count */}
        {ssResults.length > 0 && (
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            {ssResults.length} recommendation{ssResults.length !== 1 ? "s" : ""} · Not in your library
          </div>
        )}

        {/* Results grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {ssResults.map(function(book, idx) {
            var srcStyle = SOURCE_COLORS[book.source] || SOURCE_COLORS.web;
            var bookKey = "ss-" + idx;
            var addStatus = addedStatus[bookKey];

            return (
              <UICard key={idx} style={{ padding: "12px" }}>
                <div style={{ display: "flex", gap: "12px" }}>
                  {/* Cover */}
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title}
                      style={{ width: "60px", height: "90px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: "60px", height: "90px", borderRadius: "6px", flexShrink: 0, background: "#1e293b",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>📖</div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", lineHeight: 1.3 }}>{book.title}</div>
                    {book.author && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{book.author}</div>}

                    <div style={{ display: "flex", gap: "5px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                      {book.rating > 0 && (
                        <span style={{ fontSize: "11px", color: "#f59e0b" }}>⭐ {book.rating}</span>
                      )}
                      {book.pageCount > 0 && (
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{book.pageCount}pp</span>
                      )}
                      <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "4px", background: srcStyle.bg, color: srcStyle.color }}>{srcStyle.label}</span>
                      {(book.tags || []).map(function(tag) {
                        return <Badge key={tag} variant="outline" style={{ fontSize: "9px", borderColor: "#7c3aed44", color: "#a78bfa" }}>{tag}</Badge>;
                      })}
                    </div>

                    {/* Why recommended */}
                    {book.whyRecommended && (
                      <div style={{ fontSize: "11px", color: "#a78bfa", marginTop: "6px", lineHeight: 1.5, background: "#1e1b4b", padding: "5px 8px", borderRadius: "6px", borderLeft: "2px solid #7c3aed" }}>
                        💡 {book.whyRecommended}
                      </div>
                    )}

                    {/* Description */}
                    {book.description && !book.whyRecommended && (
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>
                        {book.description.slice(0, 160)}{book.description.length > 160 ? "..." : ""}
                      </div>
                    )}

                    {/* Match score bar */}
                    {book.matchScore > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                        <span style={{ fontSize: "9px", color: "#475569" }}>Match</span>
                        <div style={{ flex: 1, maxWidth: "80px", height: "3px", background: "#334155", borderRadius: "2px" }}>
                          <div style={{ width: Math.round(book.matchScore * 100) + "%", height: "100%", background: "linear-gradient(90deg, #7c3aed, #3b82f6)", borderRadius: "2px" }} />
                        </div>
                        <span style={{ fontSize: "9px", color: "#64748b" }}>{Math.round(book.matchScore * 100)}%</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                      {addStatus === "adding" && (
                        <Badge variant="secondary" style={{ fontSize: "10px" }}>Adding...</Badge>
                      )}
                      {addStatus === "added" && (
                        <Badge variant="success" style={{ fontSize: "10px", background: "#065f46", color: "#6ee7b7" }}>✓ Added to Cortex</Badge>
                      )}
                      {addStatus === "error" && (
                        <Badge variant="destructive" style={{ fontSize: "10px" }}>Error</Badge>
                      )}
                      {!addStatus && (
                        <Button size="sm" style={{ fontSize: "10px", padding: "2px 10px", background: "#059669", color: "#fff" }}
                          onClick={function() {
                            setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[bookKey] = "adding"; return n; });
                            try {
                              // Add to both Cortex (wiki page) and Library (collection) in one click
                              onAction("add_to_cortex", {
                                title: book.title,
                                type: "book",
                                creator: book.author || "",
                                year: book.publishedDate ? book.publishedDate.slice(0, 4) : "",
                                description: book.description || book.whyRecommended || "",
                                imageUrl: book.coverUrl || "",
                                sourceUrl: book.sourceUrl || "",
                                categories: book.categories || [],
                                rating: book.rating || 0,
                                source: "research",
                              });
                              onAction("add", { query: book.title + (book.author ? " " + book.author : "") });
                              setTimeout(function() {
                                setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[bookKey] = "added"; return n; });
                              }, 800);
                            } catch(e) {
                              setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[bookKey] = "error"; return n; });
                            }
                          }}>{"\u2795"} Add</Button>
                      )}
                      {book.sourceUrl && (
                        <a href={book.sourceUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: "10px", color: "#60a5fa", alignSelf: "center", textDecoration: "none" }}>
                          View ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </UICard>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Reading Stats Dashboard ──
  if (isStats) {
    var STAT_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#f97316", "#6366f1", "#14b8a6", "#a78bfa", "#34d399", "#fb7185", "#60a5fa", "#fbbf24", "#4ade80", "#e879f9"];
    var statCats = d.categoryCounts || [];
    var statYears = d.yearDistribution || [];
    var statAuthors = d.authorDistribution || [];
    var statProgress = d.progressBuckets || [];
    var statPages = d.pageCountBuckets || [];
    var statRatings = d.ratingDistribution || [];
    var statSources = d.sourceDistribution || [];
    var statTaste = d.tasteProfile;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: "16px" }}>📊 Reading Stats</div>
          <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
            onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {[
            { label: "Total Books", value: String(d.totalBooks || 0) },
            { label: "Avg Rating", value: d.avgRating ? "⭐ " + d.avgRating : "—" },
            { label: "In Progress", value: (d.booksInProgress || 0) + " books" },
            { label: "Total Pages", value: d.totalPages ? (d.totalPages >= 1000 ? Math.round(d.totalPages / 1000) + "k" : String(d.totalPages)) : "—" },
          ].map(function(kpi) {
            return (
              <UICard key={kpi.label} style={{ padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#c4b5fd" }}>{kpi.value}</div>
                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>{kpi.label}</div>
              </UICard>
            );
          })}
        </div>

        {/* Source split + Reading progress side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "10px", color: "#e2e8f0" }}>Source Split</div>
            {statSources.map(function(s) {
              var pct = d.totalBooks > 0 ? Math.round((s.count / d.totalBooks) * 100) : 0;
              var barColor = s.source === "Kindle" ? "#8b5cf6" : "#06b6d4";
              return (
                <div key={s.source} style={{ marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                    <span>{s.source}</span>
                    <span style={{ color: "#94a3b8" }}>{s.count} ({pct}%)</span>
                  </div>
                  <div style={{ height: "6px", background: "#334155", borderRadius: "3px" }}>
                    <div style={{ width: pct + "%", height: "100%", background: barColor, borderRadius: "3px" }} />
                  </div>
                </div>
              );
            })}
          </UICard>

          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "10px", color: "#e2e8f0" }}>Reading Progress</div>
            {statProgress.map(function(b, i) {
              var pct = d.totalBooks > 0 ? Math.round((b.count / d.totalBooks) * 100) : 0;
              var barColors = ["#334155", "#f59e0b", "#10b981"];
              return (
                <div key={b.label} style={{ marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                    <span>{b.label}</span>
                    <span style={{ color: "#94a3b8" }}>{b.count} ({pct}%)</span>
                  </div>
                  <div style={{ height: "6px", background: "#1e293b", borderRadius: "3px" }}>
                    <div style={{ width: pct + "%", height: "100%", background: barColors[i] || "#8b5cf6", borderRadius: "3px" }} />
                  </div>
                </div>
              );
            })}
          </UICard>
        </div>

        {/* Top categories */}
        {statCats.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#e2e8f0" }}>Top Categories</div>
            <div style={{ width: "100%", height: Math.max(260, statCats.length * 24 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statCats} layout="vertical" margin={{ left: 10, right: 50, top: 5, bottom: 5 }}>
                  <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={140} />
                  <Tooltip contentStyle={{ background: "#1e1e3a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} formatter={function(val) { return [val + " books", "Count"]; }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#64748b", fontSize: 10 }}>
                    {statCats.map(function(entry, idx) {
                      return <Cell key={idx} fill={STAT_COLORS[idx % STAT_COLORS.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </UICard>
        )}

        {/* Publication year timeline */}
        {statYears.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#e2e8f0" }}>Books by Publication Year</div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statYears} margin={{ left: 0, right: 10, top: 5, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 9 }} angle={-45} textAnchor="end" interval={Math.max(0, Math.floor(statYears.length / 15))} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1e1e3a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} formatter={function(val) { return [val + " books", "Count"]; }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </UICard>
        )}

        {/* Most-read authors */}
        {statAuthors.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#e2e8f0" }}>Most-Read Authors</div>
            <div style={{ width: "100%", height: Math.max(200, statAuthors.length * 28 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statAuthors} layout="vertical" margin={{ left: 10, right: 50, top: 5, bottom: 5 }}>
                  <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis type="category" dataKey="author" tick={{ fill: "#94a3b8", fontSize: 10 }} width={160} />
                  <Tooltip contentStyle={{ background: "#1e1e3a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} formatter={function(val) { return [val + " books", "Count"]; }} />
                  <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#64748b", fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </UICard>
        )}

        {/* Book length + Rating distribution */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {statPages.some(function(b) { return b.count > 0; }) && (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#e2e8f0" }}>Book Length</div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statPages} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#1e1e3a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {d.avgPageCount > 0 && (
                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "6px", textAlign: "center" }}>Avg: {d.avgPageCount} pages / book</div>
              )}
            </UICard>
          )}

          {statRatings.some(function(b) { return b.count > 0; }) && (
            <UICard style={{ padding: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#e2e8f0" }}>Rating Distribution</div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statRatings} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#1e1e3a", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} />
                    <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {d.avgRating && (
                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "6px", textAlign: "center" }}>Avg rating: ⭐ {d.avgRating}</div>
              )}
            </UICard>
          )}
        </div>

        {/* Taste profile genre affinity */}
        {statTaste && statTaste.topGenres && statTaste.topGenres.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "10px", color: "#e2e8f0" }}>
              Genre Affinity
              <Badge variant="secondary" style={{ marginLeft: "8px", fontSize: "10px" }}>{statTaste.interactionCount} interactions</Badge>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {statTaste.topGenres.map(function(g, i) {
                return (
                  <div key={g.genre} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ fontSize: "11px", width: "140px", flexShrink: 0, color: "#94a3b8", textTransform: "capitalize" }}>{g.genre}</div>
                    <div style={{ flex: 1, height: "6px", background: "#1e293b", borderRadius: "3px" }}>
                      <div style={{ width: Math.round(g.weight * 100) + "%", height: "100%", background: STAT_COLORS[i % STAT_COLORS.length], borderRadius: "3px" }} />
                    </div>
                    <div style={{ fontSize: "10px", color: "#64748b", width: "32px", textAlign: "right" }}>{Math.round(g.weight * 100)}%</div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}
      </div>
    );
  }

  // ── Browse (primary collection view) ──
  if (isBrowse) {
    var books = d.books || [];
    var categories = d.categories || [];
    var recs = (d.recommendations || []);
    var discoveredBooks = recs.map(function(rec) {
      return {
        title: rec.title, author: rec.creator, coverUrl: rec.imageUrl,
        entityId: rec.entityId, description: rec.description,
        rating: rec.rating, reviewCount: rec.ratingsCount,
        pageCount: rec.pageCount, publisher: rec.publisher,
        categories: rec.categories || [], source: rec.source || "research",
        readerUrl: rec.sourceUrl, hasWikiPage: !!rec.cortexPath,
        wikiPath: rec.cortexPath, isDiscovered: true,
      };
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}
        {/* Processed Books Banner — cover thumbnails */}
        {(d.processedBooks || []).length > 0 && (
          <UICard style={{ padding: "10px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{ fontSize: "14px" }}>🎙️</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#c4b5fd" }}>Deep Podcasts</span>
              <Badge variant="secondary" style={{ fontSize: "10px" }}>{(d.processedBooks || []).length}</Badge>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(d.processedBooks || []).map(function(pb) {
                return (
                  <div key={pb.entityId} style={{ position: "relative", cursor: "pointer", borderRadius: "6px", overflow: "hidden", width: "52px", height: "76px", background: "#1e1b4b" }}
                    onClick={function() { onAction("view_entity", { entityId: pb.entityId }); }}
                    title={pb.title + " — " + pb.durationMinutes + " min"}>
                    {pb.coverUrl ? (
                      <img src={pb.coverUrl} alt={pb.title} style={{ width: "52px", height: "76px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "52px", height: "76px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: "#94a3b8", textAlign: "center", padding: "4px", lineHeight: 1.2 }}>{pb.title.slice(0, 20)}</div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", padding: "2px 3px", textAlign: "center" }}>
                      <span style={{ fontSize: "8px", color: "#c4b5fd", fontWeight: 600 }}>{pb.durationMinutes}m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* Source Tabs */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #374151", paddingBottom: "8px" }}>
          {[
            { id: "all", label: "All", count: (d.totalBooks || 0) + discoveredBooks.length },
            { id: "kindle", label: "Kindle", count: d.kindleCount || 0 },
            { id: "weread", label: "微信读书", count: d.wereadCount || 0 },
            { id: "discovered", label: "Discovered", count: discoveredBooks.length },
            { id: "daily", label: "\u2728 Daily", count: null },
            { id: "stats", label: "\uD83D\uDCCA Stats", count: null },
          ].map(function(t) {
            var isActive = activeTab === t.id;
            return (
              <Button key={t.id} variant={isActive ? "default" : "ghost"} size="sm"
                style={{ fontSize: "12px", opacity: t.count === 0 && t.id !== "all" && t.id !== "daily" && t.id !== "stats" ? 0.5 : 1 }}
                onClick={function() {
                  setActiveTab(t.id);
                  if (t.id === "daily") { onAction("discover", {}); }
                  else if (t.id === "stats") { onAction("reading_stats", {}); }
                  else if (t.id !== "discovered") { onAction("browse", { tab: t.id, sortBy: sortBy, page: 1 }); }
                }}>
                {t.label} {t.count !== null ? <Badge variant="secondary" style={{ marginLeft: "4px", fontSize: "10px" }}>{t.count}</Badge> : null}
              </Button>
            );
          })}
        </div>

        {/* Add Book search bar + Super Search */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#1e1b4b", padding: "8px 10px", borderRadius: "8px", border: "1px solid #312e81" }}>
          <Input
            placeholder="Add a new book — search by title, author, or ISBN..."
            value={addBookInput}
            onChange={function(v) { setAddBookInput(v); }}
            onKeyDown={function(e) { if (e.key === "Enter" && addBookInput.trim()) onAction("add", { query: addBookInput.trim() }); }}
            style={{ flex: 1, fontSize: "12px" }}
          />
          <Button variant="default" size="sm" style={{ fontSize: "11px" }} onClick={function() { if (addBookInput.trim()) onAction("add", { query: addBookInput.trim() }); }}>🔍 Search & Add</Button>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", borderLeft: "1px solid #312e81", paddingLeft: "8px" }}>
            <Button
              variant="outline"
              size="sm"
              style={{ fontSize: "11px", background: "linear-gradient(135deg, #4c1d95, #1e3a8a)", color: "#c4b5fd", borderColor: "#7c3aed44", flex: "none" }}
              onClick={function() { onAction("super_search", superSearchInput.trim() ? { query: superSearchInput.trim() } : {}); }}
              title="AI-powered recommendations based on your reading history and preferences"
            >⚡ Super Search</Button>
            <Input
              placeholder="Focus super search on a topic..."
              value={superSearchInput}
              onChange={function(v) { setSuperSearchInput(v); }}
              onKeyDown={function(e) { if (e.key === "Enter") onAction("super_search", superSearchInput.trim() ? { query: superSearchInput.trim() } : {}); }}
              style={{ width: "200px", fontSize: "12px" }}
            />
            {superSearchInput.trim() && (
              <Button variant="ghost" size="sm" style={{ fontSize: "11px", color: "#94a3b8" }}
                onClick={function() { setSuperSearchInput(""); }}>✕</Button>
            )}
          </div>
        </div>

        {/* Search bar + Sort (hidden for Discovered tab) */}
        {activeTab !== "discovered" && (
        <div style={{ display: "flex", gap: "8px" }}>
          <Input
            placeholder="Filter library by title, author, or topic..."
            value={searchInput}
            onChange={function(v) { setSearchInput(v); }}
            onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput, sortBy: sortBy, page: 1, tab: activeTab }); }}
            style={{ flex: 1 }}
          />
          <Select
            value={sortBy}
            onChange={function(v) { setSortBy(v); onAction("browse", { query: searchInput, sortBy: v, page: 1, category: d.category, tab: activeTab }); }}
            options={[
              { value: "publicationDate", label: "Newest" },
              { value: "rating", label: "Rating" },
              { value: "reviewCount", label: "Most Reviewed" },
              { value: "title", label: "Title A-Z" },
              { value: "author", label: "Author" },
              { value: "pageCount", label: "Pages" }
            ]}
          />
        </div>
        )}

        {/* Category pills removed — low value, takes up space */}

        {/* Book grid */}
        {activeTab === "discovered" ? (
          <div>
            {discoveredBooks.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "10px" }}>
                {discoveredBooks.map(function(book, i) {
                  return <BookCard key={"disc-" + i} book={book} onAction={onAction} />;
                })}
              </div>
            ) : (
              <EmptyState
                title="No discovered books yet"
                description="Books found via research or added through Search & Add will appear here."
              />
            )}
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "10px" }}>
              {books.map(function(book, i) {
                return <BookCard key={i} book={book} onAction={onAction} />;
              })}
            </div>
            {books.length === 0 && (
              <EmptyState
                title="No books found"
                description={d.category ? "No books in category \"" + d.category + "\"" : d.query ? "No books matching \"" + d.query + "\"" : "Your library is empty. Run a scan to import books."}
              />
            )}
          </div>
        )}

        {/* Pagination Controls (hidden for Discovered tab) */}
        {activeTab !== "discovered" && (d.totalPages || 1) > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "8px 0" }}>
            <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { if (d.page > 1) onAction("browse", { query: d.query, sortBy: sortBy, category: d.category, page: d.page - 1, tab: activeTab }); }}
            >{d.page > 1 ? "← Previous" : ""}</Button>

            <div style={{ display: "flex", gap: "4px" }}>
              {Array.from({ length: Math.min(d.totalPages || 1, 7) }, function(_, i) {
                var pg;
                var tp = d.totalPages || 1;
                var cp = d.page || 1;
                // Show pages around current page
                if (tp <= 7) { pg = i + 1; }
                else if (cp <= 4) { pg = i + 1; }
                else if (cp >= tp - 3) { pg = tp - 6 + i; }
                else { pg = cp - 3 + i; }
                return (
                  <Button key={pg} variant={pg === cp ? "default" : "outline"} size="sm"
                    style={{ fontSize: "11px", minWidth: "32px", padding: "4px 8px" }}
                    onClick={function() { onAction("browse", { query: d.query, sortBy: sortBy, category: d.category, page: pg, tab: activeTab }); }}
                  >{pg}</Button>
                );
              })}
            </div>

            <Button variant="outline" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { if (d.page < d.totalPages) onAction("browse", { query: d.query, sortBy: sortBy, category: d.category, page: d.page + 1, tab: activeTab }); }}
            >{d.page < d.totalPages ? "Next →" : ""}</Button>

            <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "8px" }}>
              Page {d.page || 1} of {d.totalPages || 1} · {d.filteredCount} books
            </span>
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="Kindle Library" description="Use the Browse, Search, or Scan tools to explore your Kindle collection." />;
}

function BookCard({ book, onAction }) {
  var [expanded, setExpanded] = React.useState(false);

  return (
    <UICard style={{ padding: "10px" }}>
      <div style={{ display: "flex", gap: "10px" }}>
        {/* Cover image */}
        {book.coverUrl && (
          <img
            src={book.coverUrl}
            alt={book.title}
            style={{ width: "55px", height: "82px", objectFit: "cover", borderRadius: "4px", flexShrink: 0,
              cursor: book.entityId ? "pointer" : "default" }}
            onClick={function() { if (book.entityId) onAction("view_entity", { entityId: book.entityId }); }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + Author */}
          <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3,
            cursor: book.entityId ? "pointer" : "default", color: book.entityId ? "#93c5fd" : "inherit" }}
            onClick={function() { if (book.entityId) onAction("view_entity", { entityId: book.entityId }); }}
          >{book.isProcessed && <span style={{ marginRight: "4px" }} title="Deep podcast available">🎙️</span>}{book.title}
          {book.source === "weread" && !book.isDiscovered && <Badge variant="info" style={{ fontSize: "8px", marginLeft: "6px", verticalAlign: "middle" }}>微信读书</Badge>}
          {book.isDiscovered && <Badge variant="default" style={{ fontSize: "8px", marginLeft: "6px", verticalAlign: "middle", background: "#059669" }}>Discovered</Badge>}
          </div>
          {book.author && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{book.author}{book.readingProgress > 0 ? " · " + book.readingProgress + "% read" : ""}{book.noteCount > 0 ? " · " + book.noteCount + " notes" : ""}</div>}

          {/* Rating + meta */}
          {book.rating && (
            <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "3px" }}>
              {"⭐ " + book.rating}
              {book.reviewCount ? " (" + book.reviewCount.toLocaleString() + ")" : ""}
              {book.pageCount ? " · " + book.pageCount + "pp" : ""}
              {book.publisher ? " · " + book.publisher : ""}
            </div>
          )}

          {/* Categories */}
          {book.categories && book.categories.length > 0 && (
            <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "3px" }}>
              {book.categories.slice(0, 3).map(function(c) {
                return <Badge key={c} variant="secondary" style={{ fontSize: "9px", padding: "1px 5px" }}>{c}</Badge>;
              })}
            </div>
          )}

          {/* Description (expandable) */}
          {book.description && (
            <div
              onClick={function() { setExpanded(!expanded); }}
              style={{
                fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4, cursor: "pointer",
                ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
              }}
            >{book.description}</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "5px", marginTop: "8px", flexWrap: "wrap" }}>
        {book.entityId && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { onAction("view_entity", { entityId: book.entityId }); }}
          >📋 View</Button>
        )}
        {book.hasWikiPage && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { onAction("send_message", { message: "/wiki read " + book.wikiPath }); }}
          >📄 Wiki</Button>
        )}
        <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
          onClick={function() { onAction("send_message", { message: "/research \"" + book.title + "\" by " + book.author }); }}
        >🔍 Research</Button>
        {book.readerUrl && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { window.open(book.readerUrl, "_blank"); }}
          >📖 Read</Button>
        )}
        <Button variant="outline" size="sm" style={{ fontSize: "10px", borderColor: "#16a34a44", color: "#4ade80" }}
          onClick={function() {
            var msg = "\u{1F4DA} " + book.title;
            if (book.author) msg += " by " + book.author;
            if (book.rating) msg += "\n\u2B50 " + book.rating + (book.reviewCount ? " (" + book.reviewCount + " reviews)" : "");
            if (book.description) msg += "\n\n" + book.description;
            onAction("share_wechat", { content: msg });
          }}
        >微信</Button>
      </div>
    </UICard>
  );
}

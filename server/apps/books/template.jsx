function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_books_browse" || tool === "enso_kindle_browse";
  var isSearch = tool === "enso_books_search" || tool === "enso_kindle_search";
  var isScan = tool === "enso_books_scan_kindle" || tool === "enso_books_scan_weread" || tool === "enso_kindle_scan" || tool === "enso_context_scan_weread";
  var isEnrich = tool === "enso_books_enrich" || tool === "enso_kindle_enrich";
  var isAddResults = tool === "enso_books_add";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  // Hooks MUST be at top level — never inside conditionals
  var [searchInput, setSearchInput] = React.useState(d.query || "");
  var [sortBy, setSortBy] = React.useState(d.sortBy || "publicationDate");
  var [showTranscript, setShowTranscript] = React.useState(false);
  var [activeTab, setActiveTab] = React.useState(d.tab || "all");
  var [playingVideo, setPlayingVideo] = React.useState(null);
  var [addBookInput, setAddBookInput] = React.useState("");

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
                      var email = prompt("Send summary + podcast to:", "kkwong@xiaomi.com");
                      if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
                    }}
                  >📧 Email Podcast</Button>
                )}
                <Button size="sm" style={{ background: "#16a34a", color: "white" }}
                  onClick={function() {
                    var msg = "\u{1F4DA} " + entity.title;
                    if (entity.author) msg += " by " + entity.author;
                    if (entity.rating) msg += "\n\u2B50 " + entity.rating;
                    if (entity.categories) msg += "\n" + entity.categories;

                    // Rich content → publish as WeChat article
                    if (research) {
                      var html = '<div style="padding:16px;font-family:-apple-system,sans-serif;color:#1a1a1a;line-height:1.8">';
                      html += '<h1 style="font-size:22px;margin-bottom:4px">' + entity.title + '</h1>';
                      if (entity.author) html += '<p style="color:#666;font-size:14px;margin:4px 0 16px">' + entity.author + '</p>';
                      if (entity.rating) html += '<p style="font-size:14px;color:#d97706">⭐ ' + entity.rating + (entity.reviewCount ? ' (' + entity.reviewCount + ' reviews)' : '') + '</p>';
                      if (entity.categories) html += '<p style="font-size:13px;color:#888;margin-bottom:20px">📖 ' + entity.categories + '</p>';
                      if (research.coreThesis) {
                        html += '<h2 style="font-size:18px;color:#1e40af;margin:20px 0 8px">💡 Core Thesis</h2>';
                        html += '<p style="font-size:15px;line-height:1.8;background:#f0f7ff;padding:12px 16px;border-radius:8px;border-left:4px solid #3b82f6">' + research.coreThesis + '</p>';
                      }
                      if (research.keyInsights && research.keyInsights.length > 0) {
                        html += '<h2 style="font-size:18px;color:#7c3aed;margin:24px 0 8px">🔑 Key Insights</h2>';
                        research.keyInsights.forEach(function(ins) {
                          html += '<div style="margin:12px 0;padding:10px 14px;background:#f5f3ff;border-radius:8px;border-left:4px solid #7c3aed">';
                          html += '<p style="font-size:15px;font-weight:600;margin:0 0 4px">' + ins.insight + '</p>';
                          if (ins.example) html += '<p style="font-size:13px;color:#666;margin:4px 0 0;font-style:italic">' + ins.example + '</p>';
                          html += '</div>';
                        });
                      }
                      if (research.chapterSummaries && research.chapterSummaries.length > 0) {
                        html += '<h2 style="font-size:18px;color:#059669;margin:24px 0 8px">📑 Chapter Summaries</h2>';
                        research.chapterSummaries.forEach(function(ch) {
                          html += '<div style="margin:8px 0;padding:8px 14px;border-left:3px solid #10b981">';
                          html += '<p style="font-size:14px;font-weight:600;margin:0">' + ch.title + '</p>';
                          html += '<p style="font-size:13px;color:#555;margin:4px 0 0">' + ch.summary + '</p>';
                          html += '</div>';
                        });
                      }
                      if (research.criticalPerspectives && research.criticalPerspectives.length > 0) {
                        html += '<h2 style="font-size:18px;color:#dc2626;margin:24px 0 8px">🎯 Critical Perspectives</h2>';
                        research.criticalPerspectives.forEach(function(cp) {
                          html += '<p style="font-size:14px;margin:6px 0">• ' + cp + '</p>';
                        });
                      }
                      if (podcastDuration || podcastScript || podcastAudioUrl) {
                        html += '<h2 style="font-size:18px;color:#7c3aed;margin:24px 0 8px">🎙️ AI Book Podcast' + (podcastDuration ? ' (' + podcastDuration + ' min)' : '') + '</h2>';
                        if (podcastAudioUrl) {
                          var fullAudioUrl = podcastAudioUrl.startsWith("http") ? podcastAudioUrl : "https://pc1.enso.net" + podcastAudioUrl;
                          var emailAudioType = fullAudioUrl.indexOf(".mp3") >= 0 ? "audio/mpeg" : "audio/wav";
                          html += '<audio controls style="width:100%;margin:8px 0 16px" preload="none"><source src="' + fullAudioUrl + '" type="' + emailAudioType + '"/>Your browser does not support audio.</audio>';
                          html += '<p style="font-size:12px;color:#888;margin:0 0 16px">If the player doesn\'t load, <a href="' + fullAudioUrl + '" style="color:#7c3aed">tap here to listen</a></p>';
                        }
                        if (podcastScript) {
                          var lines = podcastScript.split("\n");
                          lines.forEach(function(line) {
                            var trimmed = line.trim();
                            if (!trimmed) return;
                            if (trimmed.match(/^(Host|Guest|Speaker|主持人|嘉宾)/i)) {
                              var colonIdx = trimmed.indexOf(":");
                              if (colonIdx > 0) {
                                var speaker = trimmed.slice(0, colonIdx);
                                var text = trimmed.slice(colonIdx + 1).trim();
                                html += '<p style="font-size:14px;margin:8px 0"><strong style="color:#7c3aed">' + speaker + ':</strong> ' + text + '</p>';
                              } else {
                                html += '<p style="font-size:14px;margin:8px 0">' + trimmed + '</p>';
                              }
                            } else {
                              html += '<p style="font-size:14px;margin:8px 0;color:#333">' + trimmed + '</p>';
                            }
                          });
                        }
                      }
                      html += '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px"/>';
                      html += '<p style="font-size:12px;color:#999;text-align:center">Shared from Enso AI</p>';
                      html += '</div>';

                      onAction("share_wechat", {
                        content: msg,
                        articleHtml: html,
                        title: entity.title + (entity.author ? " — " + entity.author : ""),
                        author: entity.author || "Enso AI",
                        coverUrl: entity.imageUrl || "",
                      });
                    } else {
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
          {fields.length > 0 && (
            <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "12px" }}>
                {fields.filter(function(f) {
                  return f.key !== "author" && f.key !== "director" && f.key !== "developer" && f.key !== "creator" && f.key !== "description";
                }).map(function(f) {
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
          )}
        </UICard>

        {/* Podcast Player (when ready) */}
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px" }}>🎙️</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Book Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
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

        {/* Cortex wiki content */}
        {cortexContent && !research && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>📖 Knowledge (Cortex)</div>
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
                      style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 8px", background: "#1e293b", borderRadius: "8px", cursor: "pointer", border: "1px solid #334155", transition: "border-color 0.2s" }}
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
        {d.error && <UICard style={{ borderColor: "#ef444444" }}><div style={{ color: "#ef4444", fontSize: "13px" }}>{d.error}</div></UICard>}
        {addResults.map(function(r, i) {
          return (
            <UICard key={i} style={{ padding: "12px" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                {r.coverUrl && (
                  <img src={r.coverUrl} alt={r.title} style={{ width: "60px", height: "90px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{r.title}{r.subtitle ? ": " + r.subtitle : ""}</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{r.author}{r.publishedDate ? " · " + r.publishedDate : ""}{r.publisher ? " · " + r.publisher : ""}</div>
                  {r.rating > 0 && (
                    <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "3px" }}>
                      {"⭐ " + r.rating}{r.ratingsCount ? " (" + r.ratingsCount + " ratings)" : ""}{r.pageCount ? " · " + r.pageCount + " pages" : ""}
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
                  <Button variant="default" size="sm" style={{ fontSize: "11px" }} onClick={function() {
                    onAction("add_to_cortex", { title: r.title, type: "book", creator: r.author, year: r.publishedDate, description: r.description, imageUrl: r.coverUrl });
                  }}>📥 Add to Library</Button>
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

  // ── Browse (primary collection view) ──
  if (isBrowse) {
    var books = d.books || [];
    var categories = d.categories || [];

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

        {/* Research Discoveries */}
        {(d.recommendations || []).length > 0 && (
          <UICard style={{ padding: "12px", borderColor: "#059669" + "44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px" }}>🔍</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#6ee7b7" }}>Discovered via Research</span>
              <Badge variant="secondary">{(d.recommendations || []).length}</Badge>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {(d.recommendations || []).map(function(rec) {
                return (
                  <div key={rec.entityId} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#064e3b", padding: "6px 10px", borderRadius: "8px", cursor: "pointer" }}
                    onClick={function() { onAction("view_entity", { entityId: rec.entityId }); }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0" }}>{rec.title}</span>
                    <Badge variant="info" style={{ fontSize: "9px" }}>recommended</Badge>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>📚</span>
            <span style={{ fontWeight: 600 }}>Books</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {(d.kindleCount || 0) > 0 && (d.wereadCount || 0) > 0
                ? (d.kindleCount + " Kindle + " + d.wereadCount + " WeRead")
                : (d.filteredCount === d.totalBooks ? d.totalBooks + " books" : d.filteredCount + " of " + d.totalBooks + " books")}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan_kindle", {}); }}>📱 Kindle</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan_weread", {}); }}>📖 WeRead</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("enrich", {}); }}>✨ Enrich</Button>
            <Button variant="default" size="sm" onClick={function() { if (addBookInput.trim()) onAction("add", { query: addBookInput.trim() }); }}>➕ Add Book</Button>
          </div>
        </div>

        {/* Source Tabs */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #374151", paddingBottom: "8px" }}>
          {[
            { id: "all", label: "All", count: d.totalBooks || 0 },
            { id: "kindle", label: "Kindle", count: d.kindleCount || 0 },
            { id: "weread", label: "WeRead", count: d.wereadCount || 0 },
          ].map(function(t) {
            var isActive = activeTab === t.id;
            return (
              <Button key={t.id} variant={isActive ? "default" : "ghost"} size="sm"
                style={{ fontSize: "12px", opacity: t.count === 0 && t.id !== "all" ? 0.5 : 1 }}
                onClick={function() { setActiveTab(t.id); onAction("browse", { tab: t.id, sortBy: sortBy, page: 1 }); }}>
                {t.label} <Badge variant="secondary" style={{ marginLeft: "4px", fontSize: "10px" }}>{t.count}</Badge>
              </Button>
            );
          })}
        </div>

        {/* Add Book search bar */}
        <div style={{ display: "flex", gap: "8px", background: "#1e1b4b", padding: "8px 10px", borderRadius: "8px", border: "1px solid #312e81" }}>
          <Input
            placeholder="Add a new book — search by title, author, or ISBN..."
            value={addBookInput}
            onChange={function(v) { setAddBookInput(v); }}
            onKeyDown={function(e) { if (e.key === "Enter" && addBookInput.trim()) onAction("add", { query: addBookInput.trim() }); }}
            style={{ flex: 1, fontSize: "12px" }}
          />
          <Button variant="default" size="sm" style={{ fontSize: "11px" }} onClick={function() { if (addBookInput.trim()) onAction("add", { query: addBookInput.trim() }); }}>🔍 Search & Add</Button>
        </div>

        {/* Search bar + Sort */}
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

        {/* Category pills */}
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Badge
              variant={!d.category ? "default" : "secondary"}
              style={{ cursor: "pointer" }}
              onClick={function() { onAction("browse", { sortBy: sortBy, page: 1, tab: activeTab }); }}
            >All</Badge>
            {categories.slice(0, 15).map(function(cat) {
              return (
                <Badge
                  key={cat.name}
                  variant={d.category === cat.name ? "default" : "secondary"}
                  style={{ cursor: "pointer" }}
                  onClick={function() { onAction("browse", { category: cat.name, sortBy: sortBy, page: 1, tab: activeTab }); }}
                >{cat.name} ({cat.count})</Badge>
              );
            })}
          </div>
        )}

        {/* Book grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "10px" }}>
          {books.map(function(book, i) {
            return <BookCard key={i} book={book} onAction={onAction} />;
          })}
        </div>

        {books.length === 0 && (
          <EmptyState
            title="No books found"
            description={d.category ? "No books in category \"" + d.category + "\"" : d.query ? "No books matching \"" + d.query + "\"" : "Your Kindle library is empty. Run a scan to import books."}
          />
        )}

        {/* Pagination Controls */}
        {(d.totalPages || 1) > 1 && (
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
          {book.source === "weread" && <Badge variant="info" style={{ fontSize: "8px", marginLeft: "6px", verticalAlign: "middle" }}>WeRead</Badge>}
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

function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_travel_browse";
  var isAdd = tool === "enso_travel_add";
  var isDiscover = tool === "enso_travel_discover";
  var isEnrich = tool === "enso_travel_enrich";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  var [searchInput, setSearchInput] = React.useState("");
  var [addInput, setAddInput] = React.useState("");
  var [showTranscript, setShowTranscript] = React.useState(false);
  var [playingVideo, setPlayingVideo] = React.useState(null);

  // ── Breadcrumb ──
  var navStack = d.navStack || [];
  var breadcrumb = navStack.length > 0 ? (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", fontSize: "12px" }}>
      <Button variant="outline" size="sm" style={{ fontSize: "11px", padding: "2px 8px" }}
        onClick={function() { onAction("nav_back", {}); }}>← Back</Button>
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
    var meta = d.metadata || {};
    var cortexContent = d.cortexContent;
    var related = d.relatedEntities || [];
    var relatedReasons = d.relatedReasons || {};
    var recommendedVideos = d.recommendedVideos || [];
    var processed = d.processedBook;
    var research = processed ? processed.research : null;
    var podcastAudioUrl = d.podcastAudioUrl;
    var podcastScript = d.podcastScript;
    var podcastDuration = d.podcastDuration;
    var podcastStatus = d.podcastStatus;
    var podcastDetail = d.podcastStatusDetail;
    var podcastPercent = d.podcastPercent || 0;

    var placeCountry = meta.country || "";
    var placeRegion = meta.region || "";
    var placeBestTime = meta.bestTimeToVisit || "";
    var placeCurrency = meta.currency || "";
    var placeLanguage = meta.language || "";
    var placeClimate = meta.climate || "";
    var placeHighlights = Array.isArray(meta.highlights) ? meta.highlights : [];
    var placeNeighborhoods = Array.isArray(meta.neighborhoods) ? meta.neighborhoods : [];
    var placeFoodScene = Array.isArray(meta.foodScene) ? meta.foodScene : [];
    var placeGettingAround = meta.gettingAround || "";
    var placeSafetyTips = meta.safetyTips || "";
    var placePracticalTips = Array.isArray(meta.practicalTips) ? meta.practicalTips : [];
    var placeGuideUrl = meta.guideUrl || "";
    var isEnriched = !!meta.enrichedAt;
    var placeOverview = meta.description || entity.summary || "";

    var categoryColors = {
      culture: "#8b5cf6", nature: "#22c55e", food: "#f59e0b", nightlife: "#ec4899",
      history: "#6366f1", adventure: "#ef4444", architecture: "#06b6d4", shopping: "#f97316"
    };

    // Build tabs based on available data
    var tabDefs = [{ value: "overview", label: "Overview" }];
    if (placeHighlights.length > 0) tabDefs.push({ value: "highlights", label: "Highlights (" + placeHighlights.length + ")" });
    if (placeNeighborhoods.length > 0) tabDefs.push({ value: "neighborhoods", label: "Neighborhoods" });
    if (placeFoodScene.length > 0 || placePracticalTips.length > 0) tabDefs.push({ value: "food_culture", label: "Food & Tips" });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}

        {/* ── Hero Section ── */}
        <UICard style={{ padding: 0, overflow: "hidden", position: "relative" }}>
          {entity.imageUrl ? (
            <div style={{ position: "relative", width: "100%", height: "180px", overflow: "hidden" }}>
              <img src={entity.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.5)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0f172a 0%, transparent 50%)" }} />
            </div>
          ) : (
            <div style={{ width: "100%", height: "140px", background: "linear-gradient(135deg, #064e3b 0%, #1e3a5f 50%, #312e81 100%)" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0f172a 0%, transparent 60%)" }} />
            </div>
          )}

          <div style={{ padding: "16px", marginTop: entity.imageUrl ? "-70px" : "-60px", position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: "24px", fontWeight: 700, lineHeight: 1.2, color: "#f1f5f9" }}>{entity.title}</div>

            {(placeCountry || placeRegion) && (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap", alignItems: "center" }}>
                {placeCountry && <Badge variant="default" style={{ background: "#059669", fontSize: "11px" }}>{placeCountry}</Badge>}
                {placeRegion && <Badge variant="secondary" style={{ fontSize: "11px" }}>{placeRegion}</Badge>}
                {isEnriched && <Badge variant="default" style={{ background: "#7c3aed", fontSize: "10px" }}>Enriched</Badge>}
              </div>
            )}

            {/* Quick stats row */}
            {isEnriched && (
              <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap", fontSize: "12px", color: "#94a3b8" }}>
                {placeBestTime && (
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <LucideReact.Calendar size={12} style={{ color: "#22c55e" }} />
                    <span style={{ color: "#cbd5e1" }}>{placeBestTime.length > 40 ? placeBestTime.slice(0, 40) + "..." : placeBestTime}</span>
                  </span>
                )}
                {placeCurrency && (
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <LucideReact.DollarSign size={12} style={{ color: "#f59e0b" }} />
                    <span style={{ color: "#cbd5e1" }}>{placeCurrency}</span>
                  </span>
                )}
                {placeLanguage && (
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <LucideReact.Globe size={12} style={{ color: "#6366f1" }} />
                    <span style={{ color: "#cbd5e1" }}>{placeLanguage}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </UICard>

        {/* ── Action Buttons ── */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {d.contentAccess && d.contentAccess.externalUrl && (
            <Button size="sm" style={{ background: "#059669", color: "white" }}
              onClick={function() { window.open(d.contentAccess.externalUrl, "_blank"); }}
            >{d.contentAccess.icon || "🗺️"} {d.contentAccess.label || "View on Map"}</Button>
          )}
          {placeGuideUrl && (
            <Button size="sm" style={{ background: "#0f766e", color: "white" }}
              onClick={function() { window.open(placeGuideUrl, "_blank"); }}
            >📖 Travel Guide</Button>
          )}
          {!podcastAudioUrl && !podcastStatus && (
            <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
              onClick={function() { onAction("deep_content", { entityId: entity.entityId || d.focusEntity }); }}
            >🎙️ Generate Podcast</Button>
          )}
          {podcastAudioUrl && (
            <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
              onClick={function() {
                var email = prompt("Send travel guide + podcast to:", "");
                if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
              }}
            >📧 Email Podcast</Button>
          )}
          <Button size="sm" style={{ background: "#1d4ed8", color: "white" }}
            onClick={function() { onAction("deep_dive", { entityId: entity.entityId || d.focusEntity, topic: entity.title + " comprehensive travel guide" }); }}
          >🔬 Deep Research</Button>
          <Button size="sm" style={{ background: "#16a34a", color: "white" }}
            onClick={function() {
              var msg = "🌍 " + entity.title;
              if (placeCountry) msg += " (" + placeCountry + ")";
              if (placeOverview) msg += "\n\n" + placeOverview;
              if (placeHighlights.length > 0) msg += "\n\n✨ Must-see: " + placeHighlights.slice(0, 3).map(function(h) { return h.name; }).join(", ");
              onAction("share_wechat", { content: msg });
            }}
          >微信</Button>
        </div>

        {/* ── Tabbed Content (enriched places) ── */}
        {isEnriched && tabDefs.length > 1 ? (
          <Tabs tabs={tabDefs} defaultValue="overview" variant="underline">
            {function(activeTab) {
              if (activeTab === "overview") {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "8px" }}>
                    {placeOverview && (
                      <UICard style={{ padding: "14px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#94a3b8" }}>Overview</div>
                        <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.7 }}>{placeOverview}</div>
                      </UICard>
                    )}
                    {placeClimate && (
                      <UICard style={{ padding: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                          <LucideReact.CloudSun size={14} style={{ color: "#38bdf8" }} />
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>Climate</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.6 }}>{placeClimate}</div>
                      </UICard>
                    )}
                    {placeGettingAround && (
                      <UICard style={{ padding: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                          <LucideReact.Navigation size={14} style={{ color: "#a78bfa" }} />
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>Getting Around</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.6 }}>{placeGettingAround}</div>
                      </UICard>
                    )}
                    {placeSafetyTips && (
                      <UICard style={{ padding: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                          <LucideReact.ShieldCheck size={14} style={{ color: "#22c55e" }} />
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>Safety</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.6 }}>{placeSafetyTips}</div>
                      </UICard>
                    )}
                    {/* Detail fields from entity-model (filter out fields already shown in hero) */}
                    {(function() {
                      var heroKeys = { country: 1, region: 1, description: 1, bestTimeToVisit: 1, currency: 1, language: 1, climate: 1 };
                      var filtered = fields.filter(function(f) { return !heroKeys[f.key]; });
                      return filtered.length > 0 ? (
                        <UICard style={{ padding: "14px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Details</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                            {filtered.map(function(f) {
                              return (
                                <div key={f.key}>
                                  <div style={{ fontSize: "11px", color: "#64748b" }}>{f.label}</div>
                                  <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}</div>
                                </div>
                              );
                            })}
                          </div>
                        </UICard>
                      ) : null;
                    })()}
                  </div>
                );
              }

              if (activeTab === "highlights") {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
                      {placeHighlights.map(function(h, i) {
                        var color = categoryColors[h.category] || "#64748b";
                        return (
                          <UICard key={i} style={{ padding: "14px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                              <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "16px" }}>
                                {h.category === "culture" ? "🏛️" : h.category === "nature" ? "🌿" : h.category === "food" ? "🍜" : h.category === "nightlife" ? "🌙" : h.category === "history" ? "📜" : h.category === "adventure" ? "🧗" : h.category === "architecture" ? "🏗️" : h.category === "shopping" ? "🛍️" : "✨"}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "13px", color: "#e2e8f0" }}>{h.name}</div>
                                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "3px", lineHeight: 1.5 }}>{h.description}</div>
                                <Badge variant="secondary" style={{ fontSize: "9px", marginTop: "6px", color: color, borderColor: color + "44" }}>{h.category}</Badge>
                              </div>
                            </div>
                          </UICard>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              if (activeTab === "neighborhoods") {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "8px" }}>
                    {placeNeighborhoods.map(function(n, i) {
                      var vibeColors = { trendy: "#ec4899", historic: "#6366f1", artsy: "#f59e0b", bustling: "#ef4444", peaceful: "#22c55e", lively: "#f97316", charming: "#a78bfa", modern: "#06b6d4" };
                      var vibeColor = vibeColors[n.vibe] || "#64748b";
                      return (
                        <UICard key={i} style={{ padding: "14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <LucideReact.MapPin size={14} style={{ color: vibeColor }} />
                            <span style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{n.name}</span>
                            <Badge variant="secondary" style={{ fontSize: "9px", color: vibeColor, borderColor: vibeColor + "44" }}>{n.vibe}</Badge>
                          </div>
                          <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.6 }}>{n.description}</div>
                        </UICard>
                      );
                    })}
                  </div>
                );
              }

              if (activeTab === "food_culture") {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "8px" }}>
                    {placeFoodScene.length > 0 && (
                      <UICard style={{ padding: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                          <span style={{ fontSize: "16px" }}>🍽️</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>Local Food</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "8px" }}>
                          {placeFoodScene.map(function(f, i) {
                            return (
                              <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 12px", background: "#1e293b", borderRadius: "8px", border: "1px solid #334155" }}>
                                <span style={{ fontSize: "18px", flexShrink: 0 }}>🍜</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: "12px", color: "#f59e0b" }}>{f.dish}</div>
                                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", lineHeight: 1.4 }}>{f.description}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </UICard>
                    )}
                    {placePracticalTips.length > 0 && (
                      <UICard style={{ padding: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                          <LucideReact.Lightbulb size={14} style={{ color: "#f59e0b" }} />
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>Practical Tips</span>
                        </div>
                        {placePracticalTips.map(function(tip, i) {
                          return (
                            <div key={i} style={{ display: "flex", gap: "8px", padding: "6px 0", borderBottom: i < placePracticalTips.length - 1 ? "1px solid #1e293b" : "none" }}>
                              <span style={{ color: "#059669", fontWeight: 700, fontSize: "12px", flexShrink: 0 }}>{i + 1}.</span>
                              <span style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.5 }}>{tip}</span>
                            </div>
                          );
                        })}
                      </UICard>
                    )}
                  </div>
                );
              }

              return null;
            }}
          </Tabs>
        ) : (
          /* Un-enriched fallback: show overview + cortex content */
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {placeOverview && (
              <UICard style={{ padding: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#94a3b8" }}>Overview</div>
                <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.7 }}>{placeOverview}</div>
              </UICard>
            )}
            {!isEnriched && (
              <UICard style={{ padding: "14px", textAlign: "center", borderColor: "#065f4644" }}>
                <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}>This destination hasn't been enriched yet. Enrich it to unlock highlights, neighborhoods, food, and practical tips.</div>
                <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                  <Button size="sm" style={{ background: "#059669", color: "white" }}
                    onClick={function() { onAction("enrich", {}); }}>✨ Enrich All Places</Button>
                </div>
              </UICard>
            )}
          </div>
        )}

        {/* ── Podcast Player ── */}
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px" }}>🎙️</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Travel Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}><source src={podcastAudioUrl} type={podcastAudioUrl.indexOf(".mp3") >= 0 ? "audio/mpeg" : "audio/wav"} /></audio>
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

        {/* Podcast Progress */}
        {podcastStatus && podcastStatus !== "ready" && podcastStatus !== "error" && !podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "14px", height: "14px", border: "2px solid #7c3aed", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "12px", color: "#c4b5fd" }}>{podcastDetail || "Generating travel podcast..."}</span>
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
              <UICard style={{ padding: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#94a3b8" }}>Core Thesis</div>
                <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.6 }}>{research.coreThesis}</div>
              </UICard>
            )}
            {research.keyInsights && research.keyInsights.length > 0 && (
              <UICard style={{ padding: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Key Insights</div>
                {research.keyInsights.map(function(ins, i) {
                  return (
                    <div key={i} style={{ marginBottom: "8px", paddingLeft: "12px", borderLeft: "2px solid #059669" }}>
                      <div style={{ fontSize: "12px", color: "#e2e8f0", lineHeight: 1.5 }}>{ins.insight}</div>
                      {ins.example && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", fontStyle: "italic" }}>{ins.example}</div>}
                    </div>
                  );
                })}
              </UICard>
            )}
            {research.chapterSummaries && research.chapterSummaries.length > 0 && (
              <UICard style={{ padding: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Areas to Explore</div>
                {research.chapterSummaries.slice(0, 10).map(function(ch, i) {
                  return (
                    <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                      <div style={{ fontWeight: 600, fontSize: "13px", color: "#6ee7b7" }}>{ch.chapter}</div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>{ch.summary}</div>
                    </div>
                  );
                })}
              </UICard>
            )}
          </div>
        )}

        {/* Cortex wiki content fallback */}
        {cortexContent && !research && !isEnriched && (
          <UICard style={{ padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Knowledge (Cortex)</div>
            <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: "300px", overflow: "auto" }}>
              {cortexContent.replace(/^#.*\n/gm, "").trim().slice(0, 2000)}
            </div>
          </UICard>
        )}

        {/* Related entities */}
        {related.length > 0 && (function() {
          var sourceIcons = { kindle: "📚", weread: "📚", steam: "🎮", movies_tv: "🎬", youtube: "📺", photos: "📷", qq_music: "🎵", twitter: "🐦", files: "💻", cortex: "🧠", research: "🔬", manual: "📝" };
          var sourceLabels = { kindle: "kindle", weread: "weread", steam: "steam", movies_tv: "movie", youtube: "youtube", photos: "photo", qq_music: "music", twitter: "twitter", files: "project" };
          return (
            <UICard style={{ padding: "14px" }}>
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
          <UICard style={{ padding: "14px" }}>
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

  // ── Place Card Component (used in browse/add/discover) ──
  function PlaceCard({ place, showAdd, locationName }) {
    var addTitle = locationName || place.title;
    return (
      <UICard style={{ padding: "12px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          {place.imageUrl && (
            <img src={place.imageUrl} alt={place.title}
              style={{ width: "80px", height: "60px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
          )}
          {!place.imageUrl && (
            <div style={{ width: "80px", height: "60px", background: "linear-gradient(135deg, #064e3b, #1e3a5f)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "24px" }}>🌍</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{place.title}</span>
              {place.enrichedAt && <Badge variant="default" style={{ background: "#059669", fontSize: "8px", padding: "1px 4px" }}>✓</Badge>}
            </div>
            {(place.country || place.source) && (
              <div style={{ fontSize: "11px", color: "#6ee7b7", marginTop: "2px" }}>{place.country || place.source}{place.region ? " · " + place.region : ""}</div>
            )}
            {place.description && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>{place.description.slice(0, 200)}{place.description.length > 200 ? "..." : ""}</div>}
            {place.tags && place.tags.length > 0 && (
              <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "4px" }}>
                {place.tags.filter(function(t) { return t !== "place" && t !== "research" && t !== "enriched" && t !== "travel" && t !== "destination"; }).slice(0, 4).map(function(t) {
                  return <Badge key={t} variant="secondary" style={{ fontSize: "9px" }}>{t}</Badge>;
                })}
              </div>
            )}
            {place.highlightCount > 0 && (
              <div style={{ fontSize: "10px", color: "#475569", marginTop: "3px" }}>{place.highlightCount} highlights</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0, justifyContent: "center" }}>
            {place.entityId && (
              <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("view_entity", { entityId: place.entityId }); }}>🗺️ Explore</Button>
            )}
            {place.url && !place.entityId && (
              <Button variant="ghost" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("open_url", { url: place.url }); }}>🔗 Source</Button>
            )}
            {showAdd && (
              <Button variant="default" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("add_to_cortex", { title: addTitle, type: "place", url: place.url, description: place.description }); }}>📥 Add</Button>
            )}
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse ──
  if (isBrowse) {
    var places = Array.isArray(d.places) ? d.places : [];
    var enrichedCount = places.filter(function(p) { return !!p.enrichedAt; }).length;
    var unenrichedCount = places.length - enrichedCount;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🌍</span>
            <span style={{ fontWeight: 600 }}>Places & Travel</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{d.totalPlaces} destinations{enrichedCount > 0 ? " · " + enrichedCount + " enriched" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {unenrichedCount > 0 && <Button variant="outline" size="sm" onClick={function() { onAction("enrich", {}); }}>✨ Enrich ({unenrichedCount})</Button>}
            <Button variant="default" size="sm" onClick={function() { onAction("discover", {}); }}>🔍 Discover</Button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", background: "#0f3a2e", padding: "8px 10px", borderRadius: "8px", border: "1px solid #065f46" }}>
          <Input placeholder="Add a destination — search by city, country, or region..." value={addInput}
            onChange={function(v) { setAddInput(v); }}
            onKeyDown={function(e) { if (e.key === "Enter" && addInput.trim()) onAction("add", { query: addInput.trim() }); }}
            style={{ flex: 1, fontSize: "12px" }} />
          <Button variant="default" size="sm" style={{ fontSize: "11px" }}
            onClick={function() { if (addInput.trim()) onAction("add", { query: addInput.trim() }); }}>🔍 Search</Button>
        </div>

        {places.length > 3 && (
          <div style={{ display: "flex", gap: "8px" }}>
            <Input placeholder="Filter saved destinations..." value={searchInput}
              onChange={function(v) { setSearchInput(v); }}
              onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
              style={{ flex: 1 }} />
          </div>
        )}

        {/* Country tags */}
        {(function() {
          var countries = {};
          places.forEach(function(p) { if (p.country) countries[p.country] = (countries[p.country] || 0) + 1; });
          var countryList = Object.keys(countries);
          if (countryList.length > 1) {
            return (
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {countryList.map(function(c) {
                  return <Badge key={c} variant="secondary" style={{ cursor: "pointer", fontSize: "10px" }}
                    onClick={function() { setSearchInput(c); onAction("browse", { query: c }); }}>{c} ({countries[c]})</Badge>;
                })}
              </div>
            );
          }
          return null;
        })()}

        {places.length === 0 && (
          <UICard style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🌍</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>No saved destinations yet</div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>Search for a destination above or click "Discover" for AI-powered suggestions.</div>
          </UICard>
        )}

        {places.map(function(p, i) { return <PlaceCard key={i} place={p} />; })}
      </div>
    );
  }

  // ── Add ──
  if (isAdd) {
    var results = Array.isArray(d.results) ? d.results : [];
    var locationName = d.locationName || d.query || "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔍</span>
            <span style={{ fontWeight: 600 }}>Add Destination</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{results.length} results for "{d.query}"</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Places</Button>
        </div>

        {results.length > 0 && locationName && (
          <UICard style={{ padding: "12px", borderColor: "#065f4644" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0" }}>{locationName}</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Quick add — saves with enriched travel data</div>
              </div>
              <Button variant="default" size="sm" style={{ background: "#059669", color: "white" }}
                onClick={function() { onAction("add_to_cortex", { title: locationName, type: "place", url: results[0].url, description: results[0].description }); }}>📥 Add "{locationName}"</Button>
            </div>
          </UICard>
        )}

        {results.map(function(p, i) { return <PlaceCard key={i} place={p} showAdd locationName={locationName} />; })}
      </div>
    );
  }

  // ── Discover ──
  if (isDiscover) {
    var destinations = Array.isArray(d.destinations) ? d.destinations : [];
    var styles = ["adventure", "culture", "relaxation", "photography", "food", "history"];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>✨</span>
            <span style={{ fontWeight: 600 }}>Discover Destinations</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {d.style || "All styles"} · {d.region || "worldwide"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Places</Button>
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {styles.map(function(s) {
            return <Badge key={s} variant={s === d.style ? "default" : "secondary"}
              style={{ cursor: "pointer", fontSize: "10px" }}
              onClick={function() { onAction("discover", { style: s }); }}>{s}</Badge>;
          })}
        </div>

        {d.cortexThemes && d.cortexThemes.length > 0 && (
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Personalized for your interests: {d.cortexThemes.join(", ")}
          </div>
        )}

        {destinations.map(function(p, i) { return <PlaceCard key={i} place={p} showAdd />; })}
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
            <span style={{ fontWeight: 600 }}>Enrichment Complete</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Places</Button>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Stat label="Enriched" value={d.enriched || 0} accent="emerald" />
          <Stat label="Errors" value={d.errors || 0} accent={d.errors > 0 ? "rose" : "gray"} />
          <Stat label="Total Places" value={d.total || 0} accent="blue" />
        </div>
        {d.message && <div style={{ fontSize: "13px", color: "#94a3b8" }}>{d.message}</div>}
        {d.unenrichedRemaining > 0 && (
          <div style={{ fontSize: "12px", color: "#64748b" }}>{d.unenrichedRemaining} places still need enrichment.</div>
        )}
      </div>
    );
  }

  return <div style={{ textAlign: "center", color: "#64748b" }}>🌍 Places & Travel — discover, save, and explore destinations.</div>;
}

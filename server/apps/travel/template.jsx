function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_travel_browse";
  var isAdd = tool === "enso_travel_add";
  var isDiscover = tool === "enso_travel_discover";
  var isEnrich = tool === "enso_travel_enrich";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;
  var isGoldenHour = tool === "enso_travel_golden_hour";
  var isChecklist = tool === "enso_travel_research_checklist";
  var isShotPlanner = tool === "enso_travel_shot_planner";
  var isQuickRef = tool === "enso_travel_quick_ref";
  var isTripOverview = tool === "enso_travel_trip_overview";

  var [searchInput, setSearchInput] = React.useState("");
  var [addInput, setAddInput] = React.useState("");
  var [addedStatus, setAddedStatus] = React.useState({});
  var [showTranscript, setShowTranscript] = React.useState(false);
  var [playingVideo, setPlayingVideo] = React.useState(null);
  var [selectedDay, setSelectedDay] = React.useState(0);
  var [showAddShot, setShowAddShot] = React.useState(false);
  var [shotLocation, setShotLocation] = React.useState("");
  var [shotTime, setShotTime] = React.useState("golden_hour_pm");
  var [shotSubject, setShotSubject] = React.useState("");
  var [shotTechnique, setShotTechnique] = React.useState("");
  var [shotReference, setShotReference] = React.useState("");
  var [shotDay, setShotDay] = React.useState("1");
  var [shotPriority, setShotPriority] = React.useState("must_get");
  var [shotSceneType, setShotSceneType] = React.useState("");
  var [expandedCategory, setExpandedCategory] = React.useState(null);
  var [editingNotes, setEditingNotes] = React.useState(null);
  var [notesText, setNotesText] = React.useState("");

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
            {showAdd && (addedStatus[addTitle] === "added" ? (
              <Button variant="outline" size="sm" style={{ fontSize: "10px", color: "#22c55e", borderColor: "#22c55e44", pointerEvents: "none" }}>✓ Added</Button>
            ) : addedStatus[addTitle] === "adding" ? (
              <Button variant="outline" size="sm" style={{ fontSize: "10px", color: "#94a3b8", pointerEvents: "none" }}>Adding...</Button>
            ) : (
              <Button variant="default" size="sm" style={{ fontSize: "10px" }}
                onClick={function() {
                  var key = addTitle;
                  setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "adding"; return n; });
                  try {
                    onAction("add_to_cortex", { title: addTitle, type: "place", url: place.url, description: place.description });
                    setTimeout(function() { setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "added"; return n; }); }, 800);
                  } catch(e) {
                    setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = undefined; return n; });
                  }
                }}>📥 Add</Button>
            ))}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <Button variant="default" size="sm" onClick={function() { onAction("discover", {}); }}>🔍 Discover</Button>
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
              {addedStatus["__loc__" + locationName] === "added" ? (
                <Button variant="outline" size="sm" style={{ color: "#22c55e", borderColor: "#22c55e44", pointerEvents: "none" }}>✓ Added "{locationName}"</Button>
              ) : addedStatus["__loc__" + locationName] === "adding" ? (
                <Button variant="outline" size="sm" style={{ color: "#94a3b8", pointerEvents: "none" }}>Adding...</Button>
              ) : (
                <Button variant="default" size="sm" style={{ background: "#059669", color: "white" }}
                  onClick={function() {
                    var key = "__loc__" + locationName;
                    setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "adding"; return n; });
                    try {
                      onAction("add_to_cortex", { title: locationName, type: "place", url: results[0].url, description: results[0].description });
                      setTimeout(function() { setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = "added"; return n; }); }, 800);
                    } catch(e) {
                      setAddedStatus(function(prev) { var n = Object.assign({}, prev); n[key] = undefined; return n; });
                    }
                  }}>📥 Add "{locationName}"</Button>
              )}
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

  // ── Golden Hour Calculator ──
  if (isGoldenHour) {
    var ghDays = Array.isArray(d.days) ? d.days : [];
    var schedule = Array.isArray(d.schedule) ? d.schedule : [];
    var ghError = d.error;

    if (ghError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <UICard style={{ padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#ef4444" }}>{ghError}</div>
          </UICard>
        </div>
      );
    }

    var timeColors = {
      "blue_hour": "#3b82f6", "sunrise": "#f97316", "golden": "#f59e0b",
      "midday": "#fbbf24", "sunset": "#ef4444"
    };

    var currentDayData = schedule[selectedDay] || schedule[0];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <LucideReact.Sun size={20} style={{ color: "#f59e0b" }} />
              <span style={{ fontWeight: 700, fontSize: "18px", color: "#f1f5f9" }}>Golden Hour Planner</span>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
              {d.city} · {d.country} · {d.latitude > 0 ? d.latitude + "°N" : Math.abs(d.latitude) + "°S"} · {d.timezone}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("trip_overview", { city: d.city }); }}>Dashboard</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>Places</Button>
          </div>
        </div>

        {/* Trip Stats */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Stat label="Trip Days" value={d.tripDays} accent="amber" />
          <Stat label="Daylight Avg" value={(currentDayData ? currentDayData.daylightHours : 0) + "h"} accent="orange" />
          <Stat label="Sunrise" value={ghDays[selectedDay] ? ghDays[selectedDay].sunrise : "--"} accent="rose" />
          <Stat label="Sunset" value={ghDays[selectedDay] ? ghDays[selectedDay].sunset : "--"} accent="purple" />
        </div>

        {/* Day Selector */}
        {schedule.length > 1 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {schedule.map(function(s, i) {
              var isActive = i === selectedDay;
              return (
                <div key={i}
                  onClick={function() { setSelectedDay(i); }}
                  style={{
                    padding: "4px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: 600,
                    background: isActive ? "#f59e0b22" : "#1e293b",
                    border: isActive ? "1px solid #f59e0b" : "1px solid #334155",
                    color: isActive ? "#f59e0b" : "#94a3b8"
                  }}>
                  {s.dayOfWeek} {s.date.split("-")[2]}
                </div>
              );
            })}
          </div>
        )}

        {/* Daily Schedule */}
        {currentDayData && (
          <UICard style={{ padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px", color: "#e2e8f0" }}>
              {currentDayData.dayOfWeek}, {currentDayData.date} · {currentDayData.daylightHours}h daylight
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {currentDayData.windows.map(function(w, wi) {
                var color = timeColors[w.icon] || "#94a3b8";
                var iconMap = {
                  "blue_hour": React.createElement(LucideReact.Moon, { size: 14, style: { color: color } }),
                  "sunrise": React.createElement(LucideReact.Sunrise, { size: 14, style: { color: color } }),
                  "golden": React.createElement(LucideReact.Sun, { size: 14, style: { color: color } }),
                  "midday": React.createElement(LucideReact.Sun, { size: 14, style: { color: "#fbbf24" } }),
                  "sunset": React.createElement(LucideReact.Sunset, { size: 14, style: { color: color } })
                };
                return (
                  <div key={wi} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 12px", background: color + "11", borderRadius: "8px",
                    borderLeft: "3px solid " + color
                  }}>
                    {iconMap[w.icon] || React.createElement(LucideReact.Clock, { size: 14, style: { color: color } })}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, fontSize: "12px", color: "#e2e8f0", minWidth: "120px" }}>{w.label}</span>
                        <span style={{ fontSize: "12px", color: color, fontFamily: "monospace" }}>{w.time}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{w.tip}</div>
                    </div>
                    <Button variant="ghost" size="sm" style={{ fontSize: "10px", padding: "2px 6px" }}
                      onClick={function() { onAction("shot_planner", { city: d.city, action: "load" }); }}>+ Shot</Button>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <Button size="sm" style={{ background: "#22c55e", color: "white" }}
            onClick={function() { onAction("research_checklist", { city: d.city }); }}>Research Checklist</Button>
          <Button size="sm" style={{ background: "#8b5cf6", color: "white" }}
            onClick={function() { onAction("shot_planner", { city: d.city }); }}>Shot Planner</Button>
          <Button size="sm" style={{ background: "#64748b", color: "white" }}
            onClick={function() { onAction("quick_ref", {}); }}>Photo Reference</Button>
        </div>
      </div>
    );
  }

  // ── Research Checklist ──
  if (isChecklist) {
    var cats = Array.isArray(d.categories) ? d.categories : [];
    var catStats = Array.isArray(d.categoryStats) ? d.categoryStats : [];

    var catIcons = {
      "history": React.createElement(LucideReact.Scroll, { size: 14 }),
      "culture": React.createElement(LucideReact.Palette, { size: 14 }),
      "iconic": React.createElement(LucideReact.Camera, { size: 14 }),
      "hidden": React.createElement(LucideReact.Gem, { size: 14 }),
      "visual": React.createElement(LucideReact.Eye, { size: 14 })
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <LucideReact.ClipboardCheck size={20} style={{ color: "#22c55e" }} />
              <span style={{ fontWeight: 700, fontSize: "18px", color: "#f1f5f9" }}>Research Checklist</span>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
              {d.city || "No city set"} · {d.checkedItems}/{d.totalItems} complete ({d.overallPercent}%)
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("trip_overview", { city: d.city }); }}>Dashboard</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("golden_hour", { city: d.city }); }}>Golden Hour</Button>
          </div>
        </div>

        {/* Overall Progress */}
        <Progress value={d.checkedItems} max={d.totalItems} variant="emerald" showLabel />

        {/* Category Progress */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {catStats.map(function(cs) {
            return (
              <div key={cs.id} onClick={function() { setExpandedCategory(expandedCategory === cs.id ? null : cs.id); }}
                style={{
                  padding: "6px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "11px",
                  background: expandedCategory === cs.id ? cs.color + "22" : "#1e293b",
                  border: "1px solid " + (expandedCategory === cs.id ? cs.color : "#334155"),
                  color: expandedCategory === cs.id ? cs.color : "#94a3b8"
                }}>
                {cs.label} ({cs.checked}/{cs.total})
              </div>
            );
          })}
        </div>

        {/* Category Items */}
        {cats.map(function(cat) {
          if (expandedCategory !== null && expandedCategory !== cat.id) return null;
          return (
            <UICard key={cat.id} style={{ padding: "14px", borderLeft: "3px solid " + cat.color }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <div style={{ color: cat.color }}>{catIcons[cat.id] || null}</div>
                <span style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{cat.label}</span>
                <Badge variant="secondary" style={{ fontSize: "9px" }}>
                  {cat.items.filter(function(it) { return it.checked; }).length}/{cat.items.length}
                </Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {cat.items.map(function(item) {
                  var isEditing = editingNotes === item.id;
                  return (
                    <div key={item.id} style={{
                      padding: "8px 10px", borderRadius: "6px",
                      background: item.checked ? "#22c55e11" : "#0f172a",
                      border: "1px solid " + (item.checked ? "#22c55e33" : "#1e293b")
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <div onClick={function() { onAction("research_checklist", { city: d.city, action: "toggle", itemId: item.id }); }}
                          style={{
                            width: "18px", height: "18px", borderRadius: "4px", cursor: "pointer", flexShrink: 0, marginTop: "1px",
                            border: "2px solid " + (item.checked ? "#22c55e" : "#475569"),
                            background: item.checked ? "#22c55e" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}>
                          {item.checked && React.createElement(LucideReact.Check, { size: 12, style: { color: "white" } })}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: "12px", color: item.checked ? "#22c55e" : "#e2e8f0",
                            textDecoration: item.checked ? "line-through" : "none", lineHeight: 1.4
                          }}>{item.text}</div>
                          {item.tip && (
                            <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px", fontStyle: "italic" }}>{item.tip}</div>
                          )}
                          {item.notes && !isEditing && (
                            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", padding: "4px 8px", background: "#1e293b", borderRadius: "4px" }}>
                              {item.notes}
                            </div>
                          )}
                        </div>
                        <div onClick={function() {
                          if (isEditing) {
                            onAction("research_checklist", { city: d.city, action: "update_notes", itemId: item.id, notes: notesText });
                            setEditingNotes(null);
                          } else {
                            setEditingNotes(item.id);
                            setNotesText(item.notes || "");
                          }
                        }}
                          style={{ cursor: "pointer", padding: "2px", color: "#64748b" }}>
                          {React.createElement(isEditing ? LucideReact.Check : LucideReact.StickyNote, { size: 14 })}
                        </div>
                      </div>
                      {isEditing && (
                        <div style={{ marginTop: "6px", paddingLeft: "26px" }}>
                          <Input placeholder="Add research notes..."
                            value={notesText}
                            onChange={function(v) { setNotesText(v); }}
                            onKeyDown={function(e) {
                              if (e.key === "Enter") {
                                onAction("research_checklist", { city: d.city, action: "update_notes", itemId: item.id, notes: notesText });
                                setEditingNotes(null);
                              }
                            }}
                            style={{ fontSize: "11px" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </UICard>
          );
        })}

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: "6px" }}>
          <Button size="sm" style={{ background: "#8b5cf6", color: "white" }}
            onClick={function() { onAction("shot_planner", { city: d.city }); }}>Shot Planner</Button>
          <Button variant="outline" size="sm"
            onClick={function() { onAction("research_checklist", { city: d.city, action: "reset" }); }}>Reset Checklist</Button>
        </div>
      </div>
    );
  }

  // ── Shot Planner ──
  if (isShotPlanner) {
    var allDays = Array.isArray(d.days) ? d.days : [];
    var tLabels = d.timeLabels || {};
    var sceneTypeOptions = Array.isArray(d.sceneTypes) ? d.sceneTypes : [];
    var sceneTypeLabelMap = {};
    sceneTypeOptions.forEach(function(st) { sceneTypeLabelMap[st.value] = st.label; });
    var timeOptions = [
      { value: "blue_hour_am", label: "Blue Hour AM" },
      { value: "sunrise", label: "Sunrise" },
      { value: "golden_hour_am", label: "Golden Hour AM" },
      { value: "midday", label: "Midday" },
      { value: "golden_hour_pm", label: "Golden Hour PM" },
      { value: "sunset", label: "Sunset" },
      { value: "blue_hour_pm", label: "Blue Hour PM" },
      { value: "night", label: "Night" }
    ];
    var timeColorMap = {
      "blue_hour_am": "#3b82f6", "sunrise": "#f97316", "golden_hour_am": "#f59e0b",
      "midday": "#fbbf24", "golden_hour_pm": "#f59e0b", "sunset": "#ef4444",
      "blue_hour_pm": "#3b82f6", "night": "#6366f1"
    };
    var sceneColorMap = {
      "ancient_temple": "#f59e0b", "market_street": "#ef4444", "coastal_sunset": "#f97316",
      "urban_night": "#8b5cf6", "mountain_vista": "#22c55e", "village_morning": "#fbbf24",
      "grand_interior": "#a78bfa", "desert_landscape": "#d97706", "festival": "#ec4899",
      "waterfront_twilight": "#3b82f6", "street_candid": "#94a3b8", "portrait": "#06b6d4",
      "food_culture": "#f43f5e", "architecture": "#64748b", "other": "#475569"
    };
    var priorityColors = { "must_get": "#ef4444", "nice_to_have": "#64748b" };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <LucideReact.Camera size={20} style={{ color: "#8b5cf6" }} />
              <span style={{ fontWeight: 700, fontSize: "18px", color: "#f1f5f9" }}>Shot Planner</span>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
              {d.city || "No city"} · {d.totalShots} shots planned
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="default" size="sm" style={{ background: "#8b5cf6", color: "white" }}
              onClick={function() { setShowAddShot(!showAddShot); }}>{showAddShot ? "Cancel" : "+ Add Shot"}</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("golden_hour", { city: d.city }); }}>Golden Hour</Button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Stat label="Total Shots" value={d.totalShots} accent="purple" />
          <Stat label="Must-Get" value={d.mustGet} accent="rose" />
          <Stat label="Nice-to-Have" value={d.niceToHave} accent="gray" />
          <Stat label="Completed" value={d.completed} accent="emerald" />
        </div>

        {/* Add Shot Form */}
        {showAddShot && (
          <UICard style={{ padding: "14px", borderColor: "#8b5cf644" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px", color: "#c4b5fd" }}>New Shot</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Input placeholder="Location name *" value={shotLocation} onChange={function(v) { setShotLocation(v); }} style={{ fontSize: "12px" }} />
              <div style={{ display: "flex", gap: "6px" }}>
                <Select options={timeOptions} value={shotTime}
                  onChange={function(v) { setShotTime(v); }}
                  placeholder="Time of day" />
                <Select options={[{ value: "must_get", label: "Must-Get" }, { value: "nice_to_have", label: "Nice-to-Have" }]}
                  value={shotPriority} onChange={function(v) { setShotPriority(v); }}
                  placeholder="Priority" />
              </div>
              <Select options={sceneTypeOptions.length > 0 ? sceneTypeOptions : [
                  { value: "ancient_temple", label: "Ancient Temple" },
                  { value: "market_street", label: "Bustling Market" },
                  { value: "coastal_sunset", label: "Coastal Sunset" },
                  { value: "urban_night", label: "Urban Night" },
                  { value: "mountain_vista", label: "Mountain Vista" },
                  { value: "village_morning", label: "Village Morning" },
                  { value: "grand_interior", label: "Grand Interior" },
                  { value: "desert_landscape", label: "Desert / Arid" },
                  { value: "festival", label: "Festival / Celebration" },
                  { value: "waterfront_twilight", label: "Waterfront Twilight" },
                  { value: "street_candid", label: "Street / Candid" },
                  { value: "portrait", label: "Portrait" },
                  { value: "food_culture", label: "Food & Culture" },
                  { value: "architecture", label: "Architecture" },
                  { value: "other", label: "Other" }
                ]}
                value={shotSceneType}
                onChange={function(v) { setShotSceneType(v); }}
                placeholder="Scene archetype (SCAF)" />
              <div style={{ display: "flex", gap: "6px" }}>
                <Input placeholder="Day # (1, 2, ...)" value={shotDay} onChange={function(v) { setShotDay(v); }} style={{ flex: 1, fontSize: "12px" }} />
                <Input placeholder="Subject type" value={shotSubject} onChange={function(v) { setShotSubject(v); }} style={{ flex: 1, fontSize: "12px" }} />
              </div>
              <Input placeholder="Technique notes" value={shotTechnique} onChange={function(v) { setShotTechnique(v); }} style={{ fontSize: "12px" }} />
              <Input placeholder="Reference photographer / image" value={shotReference} onChange={function(v) { setShotReference(v); }} style={{ fontSize: "12px" }} />
              <Button variant="default" size="sm" style={{ background: "#8b5cf6", color: "white" }}
                onClick={function() {
                  if (!shotLocation.trim()) return;
                  onAction("shot_planner", {
                    city: d.city, action: "add",
                    location: shotLocation, timeOfDay: shotTime, sceneType: shotSceneType,
                    day: parseInt(shotDay) || 1,
                    subject: shotSubject, technique: shotTechnique, reference: shotReference, priority: shotPriority
                  });
                  setShotLocation(""); setShotSubject(""); setShotTechnique(""); setShotReference(""); setShotSceneType("");
                  setShowAddShot(false);
                }}>Add Shot</Button>
            </div>
          </UICard>
        )}

        {/* Shots by Day */}
        {allDays.map(function(dayGroup) {
          if (dayGroup.shots.length === 0) return null;
          return (
            <UICard key={dayGroup.day} style={{ padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Badge variant="default" style={{ background: "#334155" }}>Day {dayGroup.day}</Badge>
                {dayGroup.date && <span style={{ fontSize: "11px", color: "#64748b" }}>{dayGroup.date}</span>}
                <span style={{ fontSize: "11px", color: "#475569" }}>{dayGroup.shots.length} shots</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {dayGroup.shots.map(function(shot) {
                  var tColor = timeColorMap[shot.timeOfDay] || "#94a3b8";
                  var pColor = priorityColors[shot.priority] || "#64748b";
                  var sColor = sceneColorMap[shot.sceneType] || null;
                  return (
                    <div key={shot.id} style={{
                      display: "flex", alignItems: "flex-start", gap: "8px",
                      padding: "8px 10px", borderRadius: "6px",
                      background: shot.completed ? "#22c55e11" : "#0f172a",
                      borderLeft: "3px solid " + tColor, opacity: shot.completed ? 0.6 : 1
                    }}>
                      <div onClick={function() { onAction("shot_planner", { city: d.city, action: "toggle", shotId: String(shot.id) }); }}
                        style={{
                          width: "16px", height: "16px", borderRadius: "50%", cursor: "pointer", flexShrink: 0, marginTop: "2px",
                          border: "2px solid " + (shot.completed ? "#22c55e" : "#475569"),
                          background: shot.completed ? "#22c55e" : "transparent"
                        }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: "12px", color: shot.completed ? "#22c55e" : "#e2e8f0",
                            textDecoration: shot.completed ? "line-through" : "none" }}>{shot.location}</span>
                          <Badge variant="secondary" style={{ fontSize: "8px", color: tColor, borderColor: tColor + "44" }}>
                            {tLabels[shot.timeOfDay] || shot.timeOfDay}
                          </Badge>
                          {shot.sceneType && sColor && (
                            <Badge variant="secondary" style={{ fontSize: "8px", color: sColor, borderColor: sColor + "44" }}>
                              {sceneTypeLabelMap[shot.sceneType] || shot.sceneType}
                            </Badge>
                          )}
                          <Badge variant={shot.priority === "must_get" ? "danger" : "outline"} style={{ fontSize: "8px" }}>
                            {shot.priority === "must_get" ? "MUST" : "NICE"}
                          </Badge>
                        </div>
                        {(shot.subject || shot.technique) && (
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                            {shot.subject && <span>{shot.subject}</span>}
                            {shot.subject && shot.technique && <span> · </span>}
                            {shot.technique && <span>{shot.technique}</span>}
                          </div>
                        )}
                        {shot.reference && <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>Ref: {shot.reference}</div>}
                      </div>
                      <div onClick={function() { onAction("shot_planner", { city: d.city, action: "delete", shotId: String(shot.id) }); }}
                        style={{ cursor: "pointer", padding: "2px", color: "#475569" }}>
                        {React.createElement(LucideReact.X, { size: 14 })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </UICard>
          );
        })}

        {d.totalShots === 0 && (
          <UICard style={{ padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>📷</div>
            <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: "4px" }}>No shots planned yet</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Click "+ Add Shot" to start planning your photography schedule.</div>
          </UICard>
        )}

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: "6px" }}>
          <Button size="sm" style={{ background: "#22c55e", color: "white" }}
            onClick={function() { onAction("research_checklist", { city: d.city }); }}>Research Checklist</Button>
          <Button size="sm" style={{ background: "#64748b", color: "white" }}
            onClick={function() { onAction("quick_ref", {}); }}>Photo Reference</Button>
        </div>
      </div>
    );
  }

  // ── Quick Reference Card ──
  if (isQuickRef) {
    var scenes = Array.isArray(d.sceneGuide) ? d.sceneGuide : [];
    var lighting = Array.isArray(d.lightingSettings) ? d.lightingSettings : [];
    var compTips = Array.isArray(d.compositionTips) ? d.compositionTips : [];
    var gear = Array.isArray(d.gearChecklist) ? d.gearChecklist : [];
    var masters = Array.isArray(d.photographers) ? d.photographers : [];

    var refTabs = [
      { value: "masters", label: "Masters" },
      { value: "scenes", label: "Scenes" },
      { value: "lighting", label: "Settings" },
      { value: "composition", label: "Composition" },
      { value: "gear", label: "Gear" }
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <LucideReact.BookOpen size={20} style={{ color: "#06b6d4" }} />
            <span style={{ fontWeight: 700, fontSize: "18px", color: "#f1f5f9" }}>Photo Quick Reference</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>Places</Button>
        </div>

        <Tabs tabs={refTabs} defaultValue="masters" variant="underline">
          {function(activeTab) {
            if (activeTab === "masters") {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", padding: "0 4px", lineHeight: 1.5 }}>
                    Study these photographers as a curriculum. Each solved a fundamental problem of travel photography through radically different methods.
                  </div>
                  {masters.map(function(ph, pi) {
                    var accentColor = ph.accent || "#94a3b8";
                    return (
                      <UICard key={pi} style={{
                        padding: "14px",
                        borderLeft: "3px solid " + accentColor,
                        background: "linear-gradient(135deg, #0f172a 0%, " + accentColor + "08 100%)"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                          <div style={{
                            width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                            background: accentColor + "22", border: "1px solid " + accentColor + "44",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "14px", fontWeight: 700, color: accentColor
                          }}>{ph.name.charAt(0)}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: "13px", color: "#f1f5f9" }}>{ph.name}</div>
                            <div style={{ fontSize: "10px", color: "#64748b" }}>{ph.era} · {ph.gear}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: accentColor, fontWeight: 600, marginBottom: "6px", fontStyle: "italic", lineHeight: 1.4 }}>
                          {ph.style}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ fontSize: "11px" }}>
                            <span style={{ color: "#475569" }}>Best for: </span>
                            <span style={{ color: "#cbd5e1" }}>{ph.bestFor}</span>
                          </div>
                          <div style={{ fontSize: "11px", padding: "6px 8px", background: "#1e293b88", borderRadius: "6px", marginTop: "2px" }}>
                            <span style={{ color: "#f59e0b", fontWeight: 600 }}>Key technique: </span>
                            <span style={{ color: "#e2e8f0", lineHeight: 1.5 }}>{ph.technique}</span>
                          </div>
                        </div>
                      </UICard>
                    );
                  })}
                </div>
              );
            }

            if (activeTab === "scenes") {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "8px" }}>
                  {scenes.map(function(scene, si) {
                    return (
                      <UICard key={si} style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", color: "#f59e0b", marginBottom: "6px" }}>{scene.scene}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ fontSize: "11px" }}>
                            <span style={{ color: "#64748b" }}>Settings: </span>
                            <span style={{ color: "#e2e8f0", fontFamily: "monospace" }}>{scene.settings}</span>
                          </div>
                          <div style={{ fontSize: "11px" }}>
                            <span style={{ color: "#64748b" }}>Technique: </span>
                            <span style={{ color: "#cbd5e1" }}>{scene.technique}</span>
                          </div>
                          <div style={{ fontSize: "11px" }}>
                            <span style={{ color: "#64748b" }}>Composition: </span>
                            <span style={{ color: "#94a3b8" }}>{scene.composition}</span>
                          </div>
                        </div>
                      </UICard>
                    );
                  })}
                </div>
              );
            }

            if (activeTab === "lighting") {
              return (
                <div style={{ paddingTop: "8px" }}>
                  <DataTable
                    columns={[
                      { key: "condition", label: "Condition", sortable: true },
                      { key: "aperture", label: "Aperture" },
                      { key: "shutter", label: "Shutter" },
                      { key: "iso", label: "ISO" },
                      { key: "notes", label: "Tips" }
                    ]}
                    data={lighting}
                    striped
                  />
                </div>
              );
            }

            if (activeTab === "composition") {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "8px" }}>
                  {compTips.map(function(tip, ti) {
                    return (
                      <div key={ti} style={{
                        display: "flex", gap: "10px", padding: "8px 12px",
                        background: "#0f172a", borderRadius: "8px", border: "1px solid #1e293b"
                      }}>
                        <div style={{
                          width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                          background: "#06b6d422", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 700, color: "#06b6d4"
                        }}>{ti + 1}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "12px", color: "#e2e8f0" }}>{tip.name}</div>
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", lineHeight: 1.4 }}>{tip.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (activeTab === "gear") {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingTop: "8px" }}>
                  {gear.map(function(g, gi) {
                    return (
                      <div key={gi} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "6px 10px", borderRadius: "6px",
                        background: g.essential ? "#22c55e08" : "#0f172a",
                        border: "1px solid " + (g.essential ? "#22c55e22" : "#1e293b")
                      }}>
                        <div style={{
                          width: "6px", height: "6px", borderRadius: "50%",
                          background: g.essential ? "#22c55e" : "#475569"
                        }} />
                        <span style={{ fontSize: "12px", color: "#e2e8f0" }}>{g.item}</span>
                        {g.essential && <Badge variant="success" style={{ fontSize: "8px" }}>Essential</Badge>}
                      </div>
                    );
                  })}
                </div>
              );
            }

            return null;
          }}
        </Tabs>
      </div>
    );
  }

  // ── Trip Overview Dashboard ──
  if (isTripOverview) {
    if (!d.hasTrip) {
      return (
        <UICard style={{ padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📸</div>
          <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: "4px" }}>No Trip Planned Yet</div>
          <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "12px" }}>{d.message || "Set up a trip with the Golden Hour Calculator to get started."}</div>
          <Button variant="default" size="sm" style={{ background: "#f59e0b", color: "#0f172a" }}
            onClick={function() { onAction("golden_hour", { city: "" }); }}>Plan a Trip</Button>
        </UICard>
      );
    }

    var trip = d.tripInfo || {};
    var research = d.research || {};
    var shotData = d.shots || {};
    var catProg = Array.isArray(research.categoryProgress) ? research.categoryProgress : [];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <LucideReact.Compass size={20} style={{ color: "#f59e0b" }} />
              <span style={{ fontWeight: 700, fontSize: "18px", color: "#f1f5f9" }}>Trip Dashboard</span>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
              {d.city} · Readiness: {d.readiness}%
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>Places</Button>
        </div>

        {/* Readiness Gauge */}
        <UICard style={{ padding: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "60px", height: "60px", borderRadius: "50%",
              background: "conic-gradient(" +
                (d.readiness >= 80 ? "#22c55e" : d.readiness >= 50 ? "#f59e0b" : "#ef4444") +
                " " + (d.readiness * 3.6) + "deg, #1e293b " + (d.readiness * 3.6) + "deg)",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <div style={{ width: "46px", height: "46px", borderRadius: "50%", background: "#0f172a",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px", fontWeight: 700, color: "#f1f5f9" }}>
                {d.readiness}%
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>Trip Readiness</div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                {d.readiness >= 80 ? "Well prepared! Time to pack." :
                 d.readiness >= 50 ? "Good progress — keep researching." :
                 "Just getting started — lots to plan!"}
              </div>
            </div>
          </div>
        </UICard>

        {/* Trip Info */}
        {trip.city && (
          <UICard style={{ padding: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Trip Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
              <div><div style={{ fontSize: "10px", color: "#475569" }}>Destination</div><div style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: 600 }}>{trip.city}, {trip.country}</div></div>
              <div><div style={{ fontSize: "10px", color: "#475569" }}>Dates</div><div style={{ fontSize: "12px", color: "#cbd5e1" }}>{trip.startDate} to {trip.endDate}</div></div>
              <div><div style={{ fontSize: "10px", color: "#475569" }}>Duration</div><div style={{ fontSize: "12px", color: "#cbd5e1" }}>{trip.totalDays} days</div></div>
              <div><div style={{ fontSize: "10px", color: "#475569" }}>Avg Daylight</div><div style={{ fontSize: "12px", color: "#f59e0b" }}>{trip.averageDaylight}h</div></div>
            </div>
          </UICard>
        )}

        {/* Research Progress */}
        <UICard style={{ padding: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <LucideReact.ClipboardCheck size={14} style={{ color: "#22c55e" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>Research</span>
            </div>
            <Button variant="ghost" size="sm" style={{ fontSize: "10px" }}
              onClick={function() { onAction("research_checklist", { city: d.city }); }}>Open Checklist</Button>
          </div>
          <Progress value={research.done || 0} max={research.total || 1} variant="emerald" showLabel />
          {catProg.length > 0 && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "8px" }}>
              {catProg.map(function(cp) {
                return (
                  <Badge key={cp.label} variant="secondary" style={{ fontSize: "9px", borderColor: cp.color + "44", color: cp.color }}>
                    {cp.label}: {cp.done}/{cp.total}
                  </Badge>
                );
              })}
            </div>
          )}
        </UICard>

        {/* Shot Planning */}
        <UICard style={{ padding: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <LucideReact.Camera size={14} style={{ color: "#8b5cf6" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>Shots Planned</span>
            </div>
            <Button variant="ghost" size="sm" style={{ fontSize: "10px" }}
              onClick={function() { onAction("shot_planner", { city: d.city }); }}>Open Planner</Button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Stat label="Total" value={shotData.total || 0} accent="purple" />
            <Stat label="Must-Get" value={shotData.mustGet || 0} accent="rose" />
            <Stat label="Done" value={shotData.completed || 0} accent="emerald" />
          </div>
        </UICard>

        {/* Quick Navigation */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <Button size="sm" style={{ background: "#f59e0b", color: "#0f172a" }}
            onClick={function() { onAction("golden_hour", { city: d.city }); }}>Golden Hour</Button>
          <Button size="sm" style={{ background: "#22c55e", color: "white" }}
            onClick={function() { onAction("research_checklist", { city: d.city }); }}>Research</Button>
          <Button size="sm" style={{ background: "#8b5cf6", color: "white" }}
            onClick={function() { onAction("shot_planner", { city: d.city }); }}>Shots</Button>
          <Button size="sm" style={{ background: "#06b6d4", color: "white" }}
            onClick={function() { onAction("quick_ref", {}); }}>Reference</Button>
        </div>
      </div>
    );
  }

  return <div style={{ textAlign: "center", color: "#64748b" }}>🌍 Places & Travel — discover, save, and explore destinations.</div>;
}

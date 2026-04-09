function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_travel_browse";
  var isAdd = tool === "enso_travel_add";
  var isDiscover = tool === "enso_travel_discover";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  var [searchInput, setSearchInput] = React.useState("");
  var [addInput, setAddInput] = React.useState("");
  var [showTranscript, setShowTranscript] = React.useState(false);

  // ── Breadcrumb ──
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
    var processed = d.processedBook;
    var research = processed ? processed.research : null;
    var podcastAudioUrl = d.podcastAudioUrl;
    var podcastDuration = d.podcastDuration;
    var podcastStatus = d.podcastStatus;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {breadcrumb}
        <UICard style={{ padding: "16px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            {entity.imageUrl && <img src={entity.imageUrl} alt={entity.title} style={{ width: "100px", height: "75px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{entity.title}</div>
              <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                <Badge variant="default">🌍 {entity.type}</Badge>
                {processed && <Badge variant="default" style={{ background: "#7c3aed" }}>🎙️ {podcastDuration ? podcastDuration + " min" : "Podcast"}</Badge>}
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                {d.contentAccess && d.contentAccess.externalUrl && (
                  <Button size="sm" style={{ background: "#059669", color: "white" }}
                    onClick={function() { window.open(d.contentAccess.externalUrl, "_blank"); }}
                  >{d.contentAccess.icon || "🗺️"} {d.contentAccess.label || "View on Map"}</Button>
                )}
                {!podcastAudioUrl && !podcastStatus && (
                  <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
                    onClick={function() { onAction("deep_content", { entityId: entity.entityId || d.focusEntity }); }}
                  >🎙️ Generate Travel Podcast</Button>
                )}
                {podcastAudioUrl && (
                  <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
                    onClick={function() {
                      var email = prompt("Send travel guide + podcast to:", "kkwong@xiaomi.com");
                      if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
                    }}
                  >📧 Email Podcast</Button>
                )}
              </div>
              {entity.summary && <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>{entity.summary}</div>}
            </div>
          </div>
          {fields.length > 0 && (
            <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1e293b", display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "12px" }}>
              {fields.filter(function(f) { return f.key !== "description"; }).map(function(f) {
                return <div key={f.key} style={{ display: "flex", gap: "4px" }}><span style={{ color: "#64748b" }}>{f.label}:</span><span style={{ color: "#cbd5e1" }}>{Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}</span></div>;
              })}
            </div>
          )}
        </UICard>
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px" }}>🎙️</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Travel Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}><source src={podcastAudioUrl} type="audio/wav" /></audio>
          </UICard>
        )}
        {podcastStatus && podcastStatus !== "ready" && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "16px", height: "16px", border: "2px solid #7c3aed", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>{d.podcastStatusDetail || "Generating travel podcast..."}</span>
            </div>
          </UICard>
        )}
        {research && research.coreThesis && (
          <UICard style={{ padding: "14px" }}><h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 6px" }}>💡 Overview</h3><p style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>{research.coreThesis}</p></UICard>
        )}
        {research && research.keyInsights && research.keyInsights.length > 0 && (
          <UICard style={{ padding: "14px" }}><h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 8px" }}>🔑 Highlights</h3>
            {research.keyInsights.slice(0, 8).map(function(ins, i) {
              return <div key={i} style={{ borderLeft: "3px solid #059669", padding: "6px 12px", margin: "6px 0", background: "#064e3b", borderRadius: "0 6px 6px 0" }}>
                <p style={{ fontSize: "13px", color: "#e2e8f0", margin: 0, lineHeight: 1.5 }}>{ins.insight}</p>
                {ins.example && <p style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", margin: "4px 0 0" }}>{ins.example}</p>}
              </div>;
            })}
          </UICard>
        )}
        {research && research.chapterSummaries && research.chapterSummaries.length > 0 && (
          <UICard style={{ padding: "14px" }}><h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 8px" }}>📍 Areas to Explore</h3>
            {research.chapterSummaries.slice(0, 10).map(function(ch, i) {
              return <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "#6ee7b7" }}>{ch.chapter}</div>
                <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>{ch.summary}</div>
              </div>;
            })}
          </UICard>
        )}
        {cortexContent && !research && (
          <UICard style={{ padding: "14px" }}><h3 style={{ color: "#a78bfa", fontSize: "14px", margin: "0 0 6px" }}>📄 Knowledge</h3><div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cortexContent.slice(0, 1000)}</div></UICard>
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
      </div>
    );
  }

  function PlaceCard({ place, showAdd }) {
    return (
      <UICard style={{ padding: "12px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          {place.imageUrl && (
            <img src={place.imageUrl} alt={place.title}
              style={{ width: "80px", height: "60px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
          )}
          {!place.imageUrl && (
            <div style={{ width: "80px", height: "60px", background: "#1e3a5f", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "24px" }}>🌍</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{place.title}</div>
            {place.source && <div style={{ fontSize: "11px", color: "#6ee7b7", marginTop: "2px" }}>{place.source}</div>}
            {place.description && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>{place.description.slice(0, 200)}{place.description.length > 200 ? "..." : ""}</div>}
            {place.tags && place.tags.length > 0 && (
              <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "4px" }}>
                {place.tags.filter(function(t) { return t !== "place" && t !== "research" && t !== "enriched" && t !== "travel" && t !== "destination"; }).slice(0, 4).map(function(t) {
                  return <Badge key={t} variant="secondary" style={{ fontSize: "9px" }}>{t}</Badge>;
                })}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0, justifyContent: "center" }}>
            {place.entityId && (
              <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("view_entity", { entityId: place.entityId }); }}>🗺️ Explore</Button>
            )}
            {place.url && (
              <Button variant="ghost" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("open_url", { url: place.url }); }}>🔗 Guide</Button>
            )}
            {showAdd && (
              <Button variant="default" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("add_to_cortex", { title: place.title, type: "place", url: place.url, description: place.description }); }}>📥 Add</Button>
            )}
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse ──
  if (isBrowse) {
    var places = Array.isArray(d.places) ? d.places : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🌍</span>
            <span style={{ fontWeight: 600 }}>Places & Travel</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{d.totalPlaces} destinations</span>
          </div>
          <Button variant="default" size="sm" onClick={function() { onAction("discover", {}); }}>✨ Discover</Button>
        </div>

        <div style={{ display: "flex", gap: "8px", background: "#0f3a2e", padding: "8px 10px", borderRadius: "8px", border: "1px solid #065f46" }}>
          <Input placeholder="Add a destination — search by city, country, or region..." value={addInput}
            onChange={function(e) { setAddInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter" && addInput.trim()) onAction("add", { query: addInput.trim() }); }}
            style={{ flex: 1, fontSize: "12px" }} />
          <Button variant="default" size="sm" style={{ fontSize: "11px" }}
            onClick={function() { if (addInput.trim()) onAction("add", { query: addInput.trim() }); }}>🔍 Search</Button>
        </div>

        {places.length > 0 && (
          <div style={{ display: "flex", gap: "8px" }}>
            <Input placeholder="Filter saved destinations..." value={searchInput}
              onChange={function(e) { setSearchInput(e.target.value); }}
              onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
              style={{ flex: 1 }} />
          </div>
        )}

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
        {results.map(function(p, i) { return <PlaceCard key={i} place={p} showAdd />; })}
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

  return <div style={{ textAlign: "center", color: "#64748b" }}>🌍 Places & Travel — discover, save, and explore destinations.</div>;
}

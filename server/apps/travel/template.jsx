function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_travel_browse";
  var isAdd = tool === "enso_travel_add";
  var isDiscover = tool === "enso_travel_discover";

  var [searchInput, setSearchInput] = React.useState("");
  var [addInput, setAddInput] = React.useState("");

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

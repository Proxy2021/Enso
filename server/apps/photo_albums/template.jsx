function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_photo_albums_browse";
  var isSearch = tool === "enso_photo_albums_search";
  var isDiscover = tool === "enso_photo_albums_discover";
  var isSeedResult = tool === "enso_photo_albums_seed_external";
  var isCurateResult = tool === "enso_photo_albums_curate_personal";
  var isRateResult = tool === "enso_photo_albums_rate";
  var isUpdateResult = tool === "enso_photo_albums_update";
  var isExpandResult = tool === "enso_photo_albums_expand";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  // Hooks at top level
  var [tab, setTab] = React.useState(d.tab || "all");
  var [searchInput, setSearchInput] = React.useState(d.query || "");
  var [sortBy, setSortBy] = React.useState(d.sortBy || "addedAt");
  var [seedPhotographer, setSeedPhotographer] = React.useState("");
  var [seedAlbumTitle, setSeedAlbumTitle] = React.useState("");
  var [seedStyle, setSeedStyle] = React.useState("");
  var [personalTitle, setPersonalTitle] = React.useState("");
  var [personalTheme, setPersonalTheme] = React.useState("");
  var [showSeedForm, setShowSeedForm] = React.useState(false);
  var [showCurateForm, setShowCurateForm] = React.useState(false);
  var [viewMode, setViewMode] = React.useState("grid");
  var [focusedPlateIdx, setFocusedPlateIdx] = React.useState(null);

  var THEMES = ["street", "documentary", "portrait", "fashion", "landscape", "fine-art", "photojournalism", "painting", "sculpture", "drawing", "printmaking", "digital"];
  var MEDIUM_ICON = {
    photography: "📸", painting: "🎨", sculpture: "🗿", drawing: "✏️",
    printmaking: "🖼️", "mixed-media": "🧩", digital: "💻", installation: "🏛️",
    collage: "📰", illustration: "🖌️",
  };

  function coverStyle(url) {
    if (!url) return { background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" };
    return { backgroundImage: "url(" + url + ")", backgroundSize: "cover", backgroundPosition: "center" };
  }

  function AlbumCard({ album, onClick }) {
    var kind = album.kind || "external";
    var badgeColor = kind === "external" ? "#8b5cf6" : "#10b981";
    var mediumIcon = MEDIUM_ICON[album.medium] || "📸";
    var badgeLabel = kind === "external" ? (mediumIcon + " Artist") : "Personal";
    return (
      <div
        onClick={onClick}
        style={{
          cursor: "pointer",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "10px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transition: "transform 120ms, border-color 120ms",
        }}
        onMouseEnter={function(e) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "#334155"; }}
        onMouseLeave={function(e) { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "#1e293b"; }}
      >
        <div style={Object.assign({ height: "180px", position: "relative" }, coverStyle(album.coverUrl))}>
          <span style={{ position: "absolute", top: 8, left: 8, background: badgeColor, color: "#fff", fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", letterSpacing: "0.02em" }}>{badgeLabel}</span>
          {album.isFavorite && <span style={{ position: "absolute", top: 8, right: 8, color: "#fbbf24", fontSize: "18px" }}>★</span>}
          {album.plateCount ? (
            <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.65)", color: "#e2e8f0", fontSize: "11px", padding: "2px 8px", borderRadius: "10px" }}>{album.plateCount} plates</span>
          ) : null}
        </div>
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{album.title}</div>
          {album.photographer && <div style={{ color: "#94a3b8", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>by {album.photographer}</div>}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2, color: "#64748b", fontSize: "11px" }}>
            {album.yearPublished && <span>{album.yearPublished}</span>}
            {album.yearPublished && album.style && <span>·</span>}
            {album.style && <span style={{ textTransform: "capitalize" }}>{album.style}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ── ENTITY DETAIL VIEW ──
  if (isEntityDetail && d.entity) {
    var ent = d.entity;
    var meta = d.metadata || {};
    var plates = meta.plates || [];
    var themes = meta.themes || [];
    var description = meta.description || ent.summary || "";
    var photographer = meta.photographer || null;
    var cortexContent = d.cortexContent;
    var related = d.relatedEntities || [];
    var navStack = d.navStack || [];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {navStack.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("nav_back", {}); }}>← Back</Button>
            {navStack.map(function(e, i) { return <span key={i} style={{ color: "#64748b" }}>{e.title} / </span>; })}
            <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{ent.title}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {ent.imageUrl && (
            <div style={Object.assign({ width: 260, height: 360, borderRadius: 10, flexShrink: 0 }, coverStyle(ent.imageUrl))} />
          )}
          <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Badge>{(meta.kind === "personal") ? "Personal Album" : "Artist Album"}</Badge>
              {meta.medium && (
                <Badge variant="outline">{(MEDIUM_ICON[meta.medium] || "") + " " + meta.medium}</Badge>
              )}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>{ent.title}</div>
            {photographer && <div style={{ color: "#cbd5e1", fontSize: 16 }}>by <strong>{photographer}</strong>{meta.yearPublished ? " (" + meta.yearPublished + ")" : ""}</div>}
            {meta.publisher && <div style={{ color: "#94a3b8", fontSize: 13 }}>Published by {meta.publisher}</div>}
            {meta.style && <div style={{ color: "#94a3b8", fontSize: 13, textTransform: "capitalize" }}>Style: {meta.style}</div>}
            {description && <div style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{description}</div>}
            {themes.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {themes.map(function(t, i) { return <Badge key={i} variant="outline">{t}</Badge>; })}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Button size="sm" onClick={function() { onAction("rate", { action: "favorite", entityId: ent.entityId }); }}>★ Favorite</Button>
              <Button size="sm" variant="outline" onClick={function() { onAction("rate", { action: "save", entityId: ent.entityId }); }}>Save</Button>
              {ent.source === "research" && (
                <Button size="sm" variant="outline" onClick={function() { onAction("seed_external", { refreshEntityId: ent.entityId }); }} title="Re-run research with the latest image sources and sync the album in place.">↻ Refresh</Button>
              )}
              {ent.source === "research" && (
                <Button size="sm" onClick={function() { onAction("expand", { entityId: ent.entityId, cap: 100 }); }} title="Exhaustively pull more works from Wikimedia Commons + MET + Smithsonian + Europeana + Art Institute of Chicago. Up to 100 total works.">🔎 Expand</Button>
              )}
              {meta.sourceUrl && (
                <Button size="sm" variant="outline" onClick={function() { onAction("open_external", { url: meta.sourceUrl }); }}>Open Source</Button>
              )}
            </div>
          </div>
        </div>

        {plates.length > 0 && (
          <UICard>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>Plates ({plates.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {plates.map(function(pl, i) {
                  var hasImg = !!pl.imageUrl;
                  var placeholderBg = "linear-gradient(135deg, #1e1b2e 0%, #0f0f18 100%)";
                  return (
                    <div key={i}
                      onClick={function() { setFocusedPlateIdx(i); }}
                      style={{ cursor: "pointer", background: "#0f172a", borderRadius: 8, overflow: "hidden", border: "1px solid #1e293b", display: "flex", flexDirection: "column", transition: "transform 120ms, border-color 120ms" }}
                      onMouseEnter={function(e) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "#334155"; }}
                      onMouseLeave={function(e) { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "#1e293b"; }}
                    >
                      <div style={Object.assign({ height: 120, position: "relative" }, hasImg ? coverStyle(pl.imageUrl) : { background: placeholderBg, display: "flex", alignItems: "center", justifyContent: "center" })}>
                        {!hasImg && <div style={{ fontSize: 22, opacity: 0.3 }}>📷</div>}
                        <span style={{ position: "absolute", top: 6, right: 6, fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(0,0,0,0.55)", color: "#cbd5e1" }}>#{i + 1}</span>
                      </div>
                      <div style={{ padding: "8px 10px" }}>
                        <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{pl.title || "(untitled)"}{pl.year ? " · " + pl.year : ""}</div>
                        {pl.caption && <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{pl.caption}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </UICard>
        )}

        {focusedPlateIdx !== null && plates[focusedPlateIdx] && (
          <div
            onClick={function() { setFocusedPlateIdx(null); }}
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}
          >
            <div onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 1200, width: "100%", maxHeight: "90vh", background: "#0a0f1e", borderRadius: 12, overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 0, border: "1px solid #1e293b" }}>
              {(function() {
                var p = plates[focusedPlateIdx];
                var hasImg = !!p.imageUrl;
                return [
                  <div key="img" style={{ background: "#000", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 360, maxHeight: "90vh" }}>
                    {hasImg ? (
                      <img src={p.imageUrl} alt={p.title} style={{ maxWidth: "100%", maxHeight: "90vh", objectFit: "contain" }} />
                    ) : (
                      <div style={{ color: "#475569", fontSize: 48 }}>📷</div>
                    )}
                  </div>,
                  <div key="meta" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: 11 }}>
                      <span>Plate {focusedPlateIdx + 1} of {plates.length}</span>
                      <Button size="sm" variant="outline" onClick={function() { setFocusedPlateIdx(null); }}>✕ Close</Button>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>{p.title || "(untitled)"}</div>
                    {p.year && <div style={{ color: "#94a3b8", fontSize: 13 }}>{p.year}</div>}
                    {(meta.photographer) && <div style={{ color: "#cbd5e1", fontSize: 13 }}>by <strong>{meta.photographer}</strong></div>}
                    {ent.title && <div style={{ color: "#64748b", fontSize: 12 }}>from <em>{ent.title}</em></div>}
                    {p.caption && <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.6, marginTop: 6 }}>{p.caption}</div>}
                    {p.imageSource && (
                      <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>Image source: <span style={{ textTransform: "capitalize" }}>{p.imageSource}</span></div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {focusedPlateIdx > 0 && (
                        <Button size="sm" variant="outline" onClick={function() { setFocusedPlateIdx(focusedPlateIdx - 1); }}>← Prev</Button>
                      )}
                      {focusedPlateIdx < plates.length - 1 && (
                        <Button size="sm" variant="outline" onClick={function() { setFocusedPlateIdx(focusedPlateIdx + 1); }}>Next →</Button>
                      )}
                      {p.imageSourceUrl && (
                        <Button size="sm" variant="outline" onClick={function() { onAction("open_external", { url: p.imageSourceUrl }); }}>Open source</Button>
                      )}
                    </div>
                  </div>,
                ];
              })()}
            </div>
          </div>
        )}

        {meta.photographerBio && (
          <UICard>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>About the Artist</div>
              <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>{meta.photographerBio}</div>
            </div>
          </UICard>
        )}

        {related.length > 0 && (
          <UICard>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>Related</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                {related.slice(0, 12).map(function(r, i) {
                  var typeIcon = ({
                    book: "📖", "photo-album": "📸", album: "📸", movie: "🎬", "tv-series": "📺",
                    documentary: "🎥", game: "🎮", channel: "📺", video: "▶️", song: "🎵",
                    artist: "🎙️", playlist: "🎼", project: "💻", article: "📰", place: "📍",
                    person: "👤", idea: "💡", synthesis: "🧩", app: "✨",
                  })[r.type] || "🔗";
                  return (
                    <div key={i}
                      onClick={function() { onAction("view_entity", { entityId: r.entityId }); }}
                      style={{ cursor: "pointer", background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", overflow: "hidden", display: "flex", flexDirection: "column", transition: "transform 120ms, border-color 120ms" }}
                      onMouseEnter={function(e) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "#334155"; }}
                      onMouseLeave={function(e) { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "#1e293b"; }}
                    >
                      <div style={Object.assign({ height: 88, position: "relative" }, r.imageUrl ? coverStyle(r.imageUrl) : { background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", display: "flex", alignItems: "center", justifyContent: "center" })}>
                        {!r.imageUrl && <div style={{ fontSize: 24, opacity: 0.45 }}>{typeIcon}</div>}
                      </div>
                      <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                        <div style={{ color: "#64748b", fontSize: 10, textTransform: "capitalize" }}>{typeIcon} {r.type}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </UICard>
        )}
      </div>
    );
  }

  // ── DISCOVER VIEW ──
  if (isDiscover) {
    var theme = d.theme || {};
    var botd = d.albumOfTheDay;
    var picks = d.themePicks || [];
    var masters = d.masterPhotographers || [];
    var emerging = d.emergingVoices || [];

    function DiscoveryCard(entry, variant) {
      var isAlbum = !!entry.title && !!entry.photographer;
      return (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={Object.assign({ height: variant === "large" ? 260 : 160 }, coverStyle(entry.coverCandidate))} />
          <div style={{ padding: 12 }}>
            {isAlbum ? (
              <React.Fragment>
                <div style={{ color: "#e2e8f0", fontSize: variant === "large" ? 18 : 14, fontWeight: 600 }}>{entry.title}</div>
                <div style={{ color: "#94a3b8", fontSize: variant === "large" ? 14 : 12, marginTop: 2 }}>by {entry.photographer}{entry.year ? " · " + entry.year : ""}</div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{entry.name}</div>
                {entry.era && <div style={{ color: "#64748b", fontSize: 11 }}>{entry.era}</div>}
                {entry.knownFor && <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{entry.knownFor}</div>}
                {entry.iconicWork && <div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 4 }}>Iconic: {entry.iconicWork}</div>}
                {entry.whyFresh && <div style={{ color: "#a5f3fc", fontSize: 12, marginTop: 4 }}>{entry.whyFresh}</div>}
              </React.Fragment>
            )}
            {(entry.whyThisAlbum || entry.oneLinePitch) && (
              <div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{entry.whyThisAlbum || entry.oneLinePitch}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {isAlbum ? (
                <Button size="sm" onClick={function() { onAction("seed_external", { photographer: entry.photographer, albumTitle: entry.title, style: entry.style || theme.key }); }}>
                  + Add to Library
                </Button>
              ) : (
                <Button size="sm" onClick={function() { onAction("seed_external", { photographer: entry.name, style: theme.key }); }}>
                  + Research Album
                </Button>
              )}
              {entry.sourceUrl && (
                <Button size="sm" variant="outline" onClick={function() { onAction("open_external", { url: entry.sourceUrl }); }}>Source</Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{theme.dayLabel || ""} · {d.date}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>{theme.icon} {theme.name} Discovery</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="sm" variant="outline" onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
            <Button size="sm" variant="outline" onClick={function() { onAction("discover", { refresh: true }); }}>Refresh</Button>
          </div>
        </div>

        {d.error && (
          <UICard><div style={{ padding: 12, color: "#fca5a5" }}>{d.error}</div></UICard>
        )}

        {botd && (
          <UICard>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 8 }}>★ ALBUM OF THE DAY</div>
              {DiscoveryCard(botd, "large")}
            </div>
          </UICard>
        )}

        {picks.length > 0 && (
          <div>
            <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, margin: "4px 0 10px 0" }}>More in {theme.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {picks.map(function(p, i) { return <React.Fragment key={i}>{DiscoveryCard(p)}</React.Fragment>; })}
            </div>
          </div>
        )}

        {masters.length > 0 && (
          <div>
            <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, margin: "4px 0 10px 0" }}>Master Photographers</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {masters.map(function(m, i) { return <React.Fragment key={i}>{DiscoveryCard(m)}</React.Fragment>; })}
            </div>
          </div>
        )}

        {emerging.length > 0 && (
          <div>
            <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, margin: "4px 0 10px 0" }}>Emerging Voices</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {emerging.map(function(e, i) { return <React.Fragment key={i}>{DiscoveryCard(e)}</React.Fragment>; })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SEED RESULT ──
  if (isSeedResult) {
    if (!d.success) {
      return (
        <UICard>
          <div style={{ padding: 14 }}>
            <div style={{ color: "#fca5a5", fontSize: 14, fontWeight: 600 }}>Could not seed album</div>
            <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 6 }}>{d.error}</div>
            <Button size="sm" style={{ marginTop: 10 }} onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
          </div>
        </UICard>
      );
    }
    var a = d.album || {};
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <UICard>
          <div style={{ padding: 14 }}>
            <div style={{ color: "#34d399", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>✓ Added to your library</div>
            <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>{a.title}</div>
            <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 2 }}>by {a.photographer}{a.yearPublished ? " (" + a.yearPublished + ")" : ""}</div>
            {a.description && <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{a.description}</div>}
            <div style={{ color: "#64748b", fontSize: 11, marginTop: 8 }}>
              Sources: {d.sources && d.sources.wikipedia ? "Wikipedia ✓ " : ""}{d.sources && d.sources.openLibrary ? ("Open Library (" + d.sources.openLibrary + ") ") : ""}{d.sources && d.sources.webSearch ? ("Web (" + d.sources.webSearch + ")") : ""}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button size="sm" onClick={function() { onAction("view_entity", { entityId: d.entityId }); }}>View Album</Button>
              <Button size="sm" variant="outline" onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
            </div>
          </div>
        </UICard>
      </div>
    );
  }

  // ── CURATE RESULT ──
  if (isCurateResult) {
    return (
      <UICard>
        <div style={{ padding: 14 }}>
          <div style={{ color: "#34d399", fontSize: 13, fontWeight: 600 }}>✓ Personal album created</div>
          <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, marginTop: 4 }}>{d.album && d.album.title}</div>
          <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 2 }}>{d.album && d.album.plateCount} photos</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button size="sm" onClick={function() { onAction("view_entity", { entityId: d.entityId }); }}>View Album</Button>
            <Button size="sm" variant="outline" onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── EXPAND RESULT ──
  if (isExpandResult) {
    if (!d.success) {
      return (
        <UICard>
          <div style={{ padding: 14 }}>
            <div style={{ color: "#fca5a5", fontSize: 14, fontWeight: 600 }}>Could not expand album</div>
            <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 6 }}>{d.error}</div>
            <Button size="sm" style={{ marginTop: 10 }} onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
          </div>
        </UICard>
      );
    }
    var srcs = d.bySource || {};
    return (
      <UICard>
        <div style={{ padding: 14 }}>
          <div style={{ color: "#34d399", fontSize: 13, fontWeight: 600 }}>✓ Album expanded</div>
          <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 700, marginTop: 4 }}>{d.albumTitle}</div>
          <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>
            Added <strong style={{ color: "#e2e8f0" }}>{d.addedCount}</strong> new works — now <strong style={{ color: "#e2e8f0" }}>{d.totalPlates}</strong>/{d.capTotal} total
          </div>
          <div style={{ color: "#64748b", fontSize: 11, marginTop: 8 }}>
            Raw pool: {d.rawPoolSize} items · deduped to {d.dedupedPoolSize}
          </div>
          {Object.keys(srcs).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {Object.keys(srcs).map(function(k) {
                return <Badge key={k} variant="outline">{k} · {srcs[k]}</Badge>;
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button size="sm" onClick={function() { onAction("view_entity", { entityId: d.entityId }); }}>View Album</Button>
            <Button size="sm" variant="outline" onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── UPDATE RESULT ──
  if (isUpdateResult) {
    return (
      <UICard>
        <div style={{ padding: 14 }}>
          <div style={{ color: "#34d399", fontSize: 13, fontWeight: 600 }}>✓ Cortex rebuilt</div>
          <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 6 }}>{d.message}</div>
          <Button size="sm" style={{ marginTop: 10 }} onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
        </div>
      </UICard>
    );
  }

  // ── SEARCH RESULTS ──
  if (isSearch) {
    var results = d.results || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600 }}>Results for "{d.query}" ({d.totalResults || 0})</div>
          <Button size="sm" variant="outline" onClick={function() { onAction("browse", {}); }}>Back to Library</Button>
        </div>
        {results.length === 0 ? (
          <UICard>
            <div style={{ padding: 14, color: "#94a3b8" }}>No matches. Try seeding a photographer to expand your library.</div>
          </UICard>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {results.map(function(r, i) {
              return <AlbumCard key={i} album={r} onClick={function() { onAction("view_entity", { entityId: r.entityId }); }} />;
            })}
          </div>
        )}
      </div>
    );
  }

  // ── BROWSE (default) ──
  var albums = d.albums || [];
  var photographers = d.photographers || [];
  var stylesList = d.styles || [];
  var themesList = d.themes || [];

  function tabBtn(label, val, count) {
    var active = tab === val;
    return (
      <button
        key={val}
        onClick={function() { setTab(val); onAction("browse", { tab: val, sortBy: sortBy, query: d.query || undefined }); }}
        style={{
          padding: "6px 14px",
          fontSize: 13,
          background: active ? "#8b5cf6" : "transparent",
          color: active ? "#fff" : "#94a3b8",
          border: active ? "1px solid #8b5cf6" : "1px solid #1e293b",
          borderRadius: 20,
          cursor: "pointer",
          fontWeight: 500,
        }}
      >{label}{typeof count === "number" ? " · " + count : ""}</button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>🎨 Artist Albums</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {d.totalAlbums || 0} albums · {d.externalCount || 0} artists · {d.personalCount || 0} personal
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button size="sm" onClick={function() { onAction("discover", {}); }}>🔍 Discover</Button>
          <Button size="sm" variant="outline" onClick={function() { setShowSeedForm(!showSeedForm); setShowCurateForm(false); }}>+ Add Artist</Button>
          <Button size="sm" variant="outline" onClick={function() { setShowCurateForm(!showCurateForm); setShowSeedForm(false); }}>+ Personal Album</Button>
        </div>
      </div>

      {showSeedForm && (
        <UICard>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Research an artist's body of work</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Works for photographers, painters, sculptors, printmakers, etc. Enso pulls from Wikipedia, Open Library, Wikimedia Commons, the MET, Smithsonian, and Europeana, then synthesizes a complete album with bio, signature works, style, and cover.</div>
            <Input placeholder="Artist name (e.g., Vincent van Gogh, Henri Cartier-Bresson, 森山大道)" value={seedPhotographer} onChange={setSeedPhotographer} />
            <Input placeholder="Album or series title (optional — we'll pick the most iconic)" value={seedAlbumTitle} onChange={setSeedAlbumTitle} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {THEMES.map(function(t) {
                var active = seedStyle === t;
                return <button key={t} onClick={function() { setSeedStyle(active ? "" : t); }}
                  style={{ padding: "4px 10px", fontSize: 11, background: active ? "#8b5cf6" : "#0f172a", color: active ? "#fff" : "#94a3b8", border: "1px solid " + (active ? "#8b5cf6" : "#1e293b"), borderRadius: 12, cursor: "pointer", textTransform: "capitalize" }}>{t}</button>;
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="sm" onClick={function() {
                if (!seedPhotographer && !seedAlbumTitle) return;
                onAction("seed_external", { photographer: seedPhotographer, albumTitle: seedAlbumTitle, style: seedStyle });
                setShowSeedForm(false);
              }}>Research & Add</Button>
              <Button size="sm" variant="outline" onClick={function() { setShowSeedForm(false); }}>Cancel</Button>
            </div>
          </div>
        </UICard>
      )}

      {showCurateForm && (
        <UICard>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Create a personal themed album</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>From your own photo library. You can add photos later, or start with just the title and theme.</div>
            <Input placeholder="Album title (e.g., Hong Kong Street 2025)" value={personalTitle} onChange={setPersonalTitle} />
            <Input placeholder="Theme (street, portrait, travel, ...)" value={personalTheme} onChange={setPersonalTheme} />
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="sm" onClick={function() {
                if (!personalTitle) return;
                onAction("curate_personal", { title: personalTitle, theme: personalTheme });
                setShowCurateForm(false);
              }}>Create Album</Button>
              <Button size="sm" variant="outline" onClick={function() { setShowCurateForm(false); }}>Cancel</Button>
            </div>
          </div>
        </UICard>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {tabBtn("All", "all", d.totalAlbums)}
        {tabBtn("Artists", "external", d.externalCount)}
        {tabBtn("Personal", "personal", d.personalCount)}
        <div style={{ flex: 1 }} />
        <Input
          placeholder="Search album, photographer, theme..."
          value={searchInput}
          onChange={setSearchInput}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("search", { query: searchInput }); }}
          className="flex-1 min-w-[200px] max-w-[260px]"
        />
      </div>

      {albums.length === 0 ? (
        <UICard>
          <div style={{ padding: 20, textAlign: "center" }}>
            <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600 }}>Your album library is empty</div>
            <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>Start by discovering today's themed artists, or add an artist you already love — photographer, painter, sculptor, any medium.</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
              <Button size="sm" onClick={function() { onAction("discover", {}); }}>🔍 Daily Discovery</Button>
              <Button size="sm" variant="outline" onClick={function() { setShowSeedForm(true); }}>+ Add Artist</Button>
            </div>
          </div>
        </UICard>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {albums.map(function(a, i) {
            return <AlbumCard key={a.entityId || i} album={a} onClick={function() { onAction("view_entity", { entityId: a.entityId }); }} />;
          })}
        </div>
      )}

      {d.totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 4 }}>
          {d.page > 1 && <Button size="sm" variant="outline" onClick={function() { onAction("browse", { tab: tab, page: d.page - 1, sortBy: sortBy }); }}>Prev</Button>}
          <span style={{ color: "#94a3b8", fontSize: 12, alignSelf: "center" }}>Page {d.page} of {d.totalPages}</span>
          {d.page < d.totalPages && <Button size="sm" variant="outline" onClick={function() { onAction("browse", { tab: tab, page: d.page + 1, sortBy: sortBy }); }}>Next</Button>}
        </div>
      )}
    </div>
  );
}

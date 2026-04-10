function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_qq_music_browse";
  var isScan = tool === "enso_qq_music_scan";
  var isUpdate = tool === "enso_qq_music_update";

  // ── Scan / Update result ──
  if (isScan || isUpdate) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ marginBottom: "8px" }}>
            <Music size={28} style={{ color: "#34d399", margin: "0 auto" }} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            {isScan ? "Music Library Scanned" : "Music Library Updated"}
          </div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {isScan && data.data && ("Scan complete")}
              {isUpdate && data.message}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Library</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState("");
    var [activeTab, setActiveTab] = React.useState(data.view || "playlists");

    var tabItems = [
      { value: "playlists", label: "Playlists" },
      { value: "favorites", label: "Favorites" },
      { value: "local", label: "Local" },
      { value: "artists", label: "Artists" }
    ];

    function switchTab(tab) {
      setActiveTab(tab);
      onAction("browse", { view: tab, query: searchInput || undefined });
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Music size={20} style={{ color: "#34d399" }} />
            <span style={{ fontWeight: 600 }}>QQ Music Library</span>
            {data.totalTracks > 0 && (
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                {data.totalTracks} tracks
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>
              <Search size={12} style={{ marginRight: "4px" }} />Scan
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("update", {}); }}>
              <ListMusic size={12} style={{ marginRight: "4px" }} />Update
            </Button>
          </div>
        </div>

        {/* Scanned at */}
        {data.scannedAt && (
          <div style={{ fontSize: "12px", color: "#71717a" }}>
            Last scanned: {new Date(data.scannedAt).toLocaleDateString()}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: "2px", background: "#27272a", borderRadius: "8px", padding: "2px" }}>
          {tabItems.map(function(tab) {
            var isActive = activeTab === tab.value;
            return (
              <button key={tab.value} onClick={function() { switchTab(tab.value); }}
                style={{
                  flex: 1, padding: "6px 12px", fontSize: "12px", fontWeight: isActive ? 600 : 400,
                  background: isActive ? "#3f3f46" : "transparent", color: isActive ? "#f4f4f5" : "#a1a1aa",
                  border: "none", borderRadius: "6px", cursor: "pointer", transition: "all 0.15s"
                }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <Input
          placeholder={"Search " + activeTab + "..."}
          value={searchInput}
          onChange={function(e) { setSearchInput(e.target.value); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { view: activeTab, query: searchInput }); }}
        />

        {/* Playlists view */}
        {activeTab === "playlists" && (
          <div>
            {(data.playlists || []).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "8px" }}>
                {(data.playlists || []).map(function(pl, i) {
                  return (
                    <UICard key={i} style={{ padding: "10px" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "8px",
                          background: "linear-gradient(135deg, #059669 0%, #34d399 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                        }}>
                          <ListMusic size={18} style={{ color: "#fff" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{pl.name}</div>
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                            {pl.trackCount ? pl.trackCount + " tracks" : ""}
                            {pl.creator ? " by " + pl.creator : ""}
                          </div>
                        </div>
                        <Play size={16} style={{ color: "#34d399", flexShrink: 0 }} />
                      </div>
                    </UICard>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No playlists" description="No playlists found. Run a scan to discover your music." />
            )}
          </div>
        )}

        {/* Favorites view */}
        {activeTab === "favorites" && (
          <div>
            {(data.favorites || []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {(data.favorites || []).map(function(track, i) {
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px",
                      background: i % 2 === 0 ? "#18181b" : "#1c1c1f", borderRadius: "6px"
                    }}>
                      <Heart size={12} style={{ color: "#f43f5e", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {track.title}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "#71717a", flexShrink: 0 }}>{track.artist}</div>
                      {track.album && (
                        <div style={{ fontSize: "10px", color: "#52525b", flexShrink: 0, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {track.album}
                        </div>
                      )}
                      <Button variant="outline" size="sm" style={{ fontSize: "9px", padding: "2px 6px", borderColor: "#16a34a44", color: "#4ade80", flexShrink: 0 }}
                        onClick={function() {
                          var msg = "\u{1F3B5} " + track.title;
                          if (track.artist) msg += " - " + track.artist;
                          if (track.album) msg += "\n\u{1F4BF} " + track.album;
                          onAction("share_wechat", { content: msg });
                        }}
                      >微信</Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No favorites" description="No favorite tracks found." />
            )}
          </div>
        )}

        {/* Local files view */}
        {activeTab === "local" && (
          <div>
            {(data.localFiles || []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {(data.localFiles || []).map(function(file, i) {
                  var ext = file.format || (file.path ? file.path.split(".").pop().toUpperCase() : "");
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px",
                      background: i % 2 === 0 ? "#18181b" : "#1c1c1f", borderRadius: "6px"
                    }}>
                      <HardDrive size={12} style={{ color: "#60a5fa", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.title}
                        </div>
                      </div>
                      {file.artist && (
                        <div style={{ fontSize: "11px", color: "#71717a", flexShrink: 0 }}>{file.artist}</div>
                      )}
                      {ext && (
                        <Badge variant="secondary" style={{ fontSize: "9px" }}>{ext}</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No local files" description="No local audio files found." />
            )}
          </div>
        )}

        {/* Artists view */}
        {activeTab === "artists" && (
          <div>
            {(data.artists || []).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "8px" }}>
                {(data.artists || []).map(function(artist, i) {
                  return (
                    <UICard key={i} style={{ padding: "10px" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "50%",
                          background: "linear-gradient(135deg, #6366f1 0%, #a78bfa 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          fontSize: "14px", fontWeight: 700, color: "#fff"
                        }}>
                          {artist.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{artist.name}</div>
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                            {artist.trackCount} track{artist.trackCount !== 1 ? "s" : ""}
                          </div>
                          {artist.tracks && artist.tracks.length > 0 && (
                            <div style={{ fontSize: "10px", color: "#71717a", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {artist.tracks.join(", ")}
                            </div>
                          )}
                          <div style={{ marginTop: "4px" }}>
                            <Button variant="outline" size="sm" style={{ fontSize: "9px", padding: "2px 6px", borderColor: "#16a34a44", color: "#4ade80" }}
                              onClick={function() {
                                var msg = "\u{1F3B6} " + artist.name + "\n" + artist.trackCount + " tracks";
                                if (artist.tracks && artist.tracks.length > 0) msg += "\n\u{1F3B5} " + artist.tracks.slice(0, 5).join(", ");
                                onAction("share_wechat", { content: msg });
                              }}
                            >微信</Button>
                          </div>
                        </div>
                      </div>
                    </UICard>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No artists" description="No artist data available." />
            )}
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="QQ Music Library" description="Use Browse or Scan to explore your music collection." />;
}

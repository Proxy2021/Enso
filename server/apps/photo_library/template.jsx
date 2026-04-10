function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_photo_library_browse";
  var isScan = tool === "enso_photo_library_scan";
  var isUpdate = tool === "enso_photo_library_update";

  // ── Scan / Update result ──
  if (isScan || isUpdate) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ marginBottom: "8px" }}>
            <Camera size={28} style={{ color: "#a78bfa", margin: "0 auto" }} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            {isScan ? "Photo Library Scanned" : "Photo Library Updated"}
          </div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {isScan && data.data && ("Scan complete")}
              {isUpdate && data.message}
            </div>
          )}
          {isUpdate && data.newAlbums && data.newAlbums.length > 0 && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "#a3e635" }}>
              {data.newAlbums.map(function(a, i) {
                return <div key={i}>{a.name} ({a.photoCount} photos)</div>;
              })}
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
    var [searchInput, setSearchInput] = React.useState(data.query || "");
    var [groupBy, setGroupBy] = React.useState(data.groupBy || "directory");
    var albums = data.albums || [];
    var grouped = data.grouped || {};
    var groupKeys = Object.keys(grouped).sort();

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Camera size={20} style={{ color: "#a78bfa" }} />
            <span style={{ fontWeight: 600 }}>Photo Library</span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {data.totalPhotos.toLocaleString()} photos in {data.totalAlbums} albums
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>
              <Search size={12} style={{ marginRight: "4px" }} />Scan
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("update", {}); }}>
              <Image size={12} style={{ marginRight: "4px" }} />Update
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        {data.yearRange && (
          <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#94a3b8" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Calendar size={12} /> {data.yearRange.from || "?"} - {data.yearRange.to || "?"}
            </span>
            {data.cameras && data.cameras.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Camera size={12} /> {data.cameras.length} camera{data.cameras.length !== 1 ? "s" : ""}
              </span>
            )}
            {data.scannedAt && (
              <span>Scanned: {new Date(data.scannedAt).toLocaleDateString()}</span>
            )}
          </div>
        )}

        {/* Search + Group selector */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Input
            placeholder="Search albums..."
            value={searchInput}
            onChange={function(e) { setSearchInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput, groupBy: groupBy }); }}
            style={{ flex: 1 }}
          />
          <Select value={groupBy} onChange={function(v) { setGroupBy(v); onAction("browse", { query: searchInput, groupBy: v }); }}
            options={[
              { value: "directory", label: "By Folder" },
              { value: "year", label: "By Year" },
              { value: "camera", label: "By Camera" }
            ]}
          />
        </div>

        {/* Grouped album grid */}
        {groupKeys.length > 0 ? groupKeys.map(function(key) {
          var groupAlbums = grouped[key] || [];
          return (
            <div key={key} style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#d4d4d8", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                <FolderOpen size={14} style={{ color: "#a78bfa" }} />
                {key}
                <Badge variant="secondary" style={{ fontSize: "10px" }}>{groupAlbums.length}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
                {groupAlbums.map(function(album, i) {
                  return (
                    <UICard key={i} style={{ padding: "10px" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "8px",
                          background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                        }}>
                          <Image size={18} style={{ color: "#fff" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3 }}>{album.name}</div>
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                            <Badge variant="secondary" style={{ fontSize: "10px", marginRight: "4px" }}>
                              {album.photoCount} photos
                            </Badge>
                            {album.dateRange && album.dateRange.from && (
                              <span>{album.dateRange.from.substring(0, 10)}</span>
                            )}
                          </div>
                          {album.cameras && album.cameras.length > 0 && (
                            <div style={{ fontSize: "10px", color: "#71717a", marginTop: "2px" }}>
                              <Camera size={10} style={{ marginRight: "3px", verticalAlign: "middle" }} />
                              {album.cameras.join(", ")}
                            </div>
                          )}
                          {album.description && (
                            <div style={{
                              fontSize: "11px", color: "#64748b", marginTop: "3px",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
                            }}>{album.description}</div>
                          )}
                          <div style={{ marginTop: "6px" }}>
                            <Button variant="outline" size="sm" style={{ fontSize: "10px", borderColor: "#16a34a44", color: "#4ade80" }}
                              onClick={function() {
                                var msg = "\u{1F4F7} " + album.name + "\n" + album.photoCount + " photos";
                                if (album.dateRange && album.dateRange.from) msg += "\n\u{1F4C5} " + album.dateRange.from.substring(0, 10);
                                if (album.cameras && album.cameras.length > 0) msg += "\n\u{1F4F8} " + album.cameras.join(", ");
                                if (album.description) msg += "\n\n" + album.description.slice(0, 150);
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
            </div>
          );
        }) : (
          <EmptyState
            title="No albums found"
            description={data.message || "Your photo library is empty. Run a scan to discover photos."}
          />
        )}

        {/* Footer */}
        {data.filteredCount > 200 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 200 of {data.filteredCount} albums. Use search to narrow down.
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="Photo Library" description="Use Browse or Scan to explore your photo collection." />;
}

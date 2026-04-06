function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_steam_browse";
  var isScan = tool === "enso_steam_scan";
  var isEnrich = tool === "enso_steam_enrich";
  var isUpdate = tool === "enso_steam_update";

  // ── Scan result ──
  if (isScan) {
    var scanData = data.data || {};
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <Gamepad2 size={28} style={{ margin: "0 auto 8px", color: "#60a5fa" }} />
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Steam Library Scanned</div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {"Found " + (scanData.totalGames || scanData.count || "?") + " installed games"}
            </div>
          )}
          <div style={{ marginTop: "12px", display: "flex", gap: "6px", justifyContent: "center" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Library</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("enrich", {}); }}>Enrich Metadata</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Enrich result ──
  if (isEnrich) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <Star size={28} style={{ margin: "0 auto 8px", color: "#fbbf24" }} />
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Metadata Enrichment</div>
          {data.message ? (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>{data.message}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {data.enriched + " games enriched" + (data.errors ? ", " + data.errors + " errors" : "")}
              {data.unenrichedRemaining > 0 ? " — " + data.unenrichedRemaining + " remaining" : ""}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Library</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Update result ──
  if (isUpdate) {
    var hasNew = data.newGames && data.newGames.length > 0;
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <RefreshCw size={28} style={{ margin: "0 auto 8px", color: "#34d399" }} />
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Library Updated</div>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>{data.message}</div>
          {hasNew && (
            <div style={{ marginTop: "8px", display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
              {data.newGames.map(function(name) {
                return <Badge key={name} variant="default">{name}</Badge>;
              })}
            </div>
          )}
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>
            {data.beforeCount + " -> " + data.afterCount + " games"}
          </div>
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
    var [sortBy, setSortBy] = React.useState(data.sortBy || "name");
    var [activeGenre, setActiveGenre] = React.useState(data.genre || "");
    var games = data.games || [];
    var genres = data.genres || [];

    var metacriticColor = function(score) {
      if (!score) return "#64748b";
      if (score >= 75) return "#22c55e";
      if (score >= 50) return "#eab308";
      return "#ef4444";
    };

    var formatLastPlayed = function(ts) {
      if (!ts) return null;
      var d = new Date(ts * 1000);
      var now = new Date();
      var diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 30) return diffDays + "d ago";
      if (diffDays < 365) return Math.floor(diffDays / 30) + "mo ago";
      return Math.floor(diffDays / 365) + "y ago";
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Gamepad2 size={22} style={{ color: "#60a5fa" }} />
            <span style={{ fontWeight: 600, fontSize: "16px" }}>Steam Library</span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {data.filteredCount === data.totalGames
                ? data.totalGames + " games"
                : data.filteredCount + " of " + data.totalGames + " games"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>
              <RefreshCw size={13} style={{ marginRight: "4px" }} />Scan
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("enrich", {}); }}>
              <Star size={13} style={{ marginRight: "4px" }} />Enrich
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("update", {}); }}>
              <RefreshCw size={13} style={{ marginRight: "4px" }} />Update
            </Button>
          </div>
        </div>

        {/* Search + Sort */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Input
            placeholder="Search games..."
            value={searchInput}
            onChange={function(e) { setSearchInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput, sortBy: sortBy, genre: activeGenre }); }}
            style={{ flex: 1 }}
          />
          <Select value={sortBy} onValueChange={function(v) { setSortBy(v); onAction("browse", { query: searchInput, sortBy: v, genre: activeGenre }); }}>
            <option value="name">Name</option>
            <option value="lastPlayed">Last Played</option>
            <option value="size">Size</option>
            <option value="metacritic">Metacritic</option>
          </Select>
        </div>

        {/* Genre pills */}
        {genres.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Badge
              variant={!activeGenre ? "default" : "secondary"}
              style={{ cursor: "pointer" }}
              onClick={function() { setActiveGenre(""); onAction("browse", { sortBy: sortBy, query: searchInput }); }}
            >All</Badge>
            {genres.slice(0, 20).map(function(genre) {
              return (
                <Badge
                  key={genre}
                  variant={activeGenre === genre ? "default" : "secondary"}
                  style={{ cursor: "pointer" }}
                  onClick={function() { setActiveGenre(genre); onAction("browse", { genre: genre, sortBy: sortBy, query: searchInput }); }}
                >{genre}</Badge>
              );
            })}
          </div>
        )}

        {/* Game grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "10px" }}>
          {games.map(function(game, i) {
            return (
              <GameCard
                key={game.appId || i}
                game={game}
                onAction={onAction}
                metacriticColor={metacriticColor}
                formatLastPlayed={formatLastPlayed}
              />
            );
          })}
        </div>

        {games.length === 0 && (
          <EmptyState
            title="No games found"
            description={
              activeGenre ? "No games in genre \"" + activeGenre + "\""
                : data.query ? "No games matching \"" + data.query + "\""
                : data.message || "Your Steam library is empty. Run a scan to import games."
            }
          />
        )}

        {/* Scanned at footer */}
        {data.scannedAt && (
          <div style={{ textAlign: "center", fontSize: "11px", color: "#475569" }}>
            Last scanned: {new Date(data.scannedAt).toLocaleDateString()}
          </div>
        )}

        {data.filteredCount > 100 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 100 of {data.filteredCount} games. Use search or genres to narrow down.
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="Steam Library" description="Use Browse, Scan, or Enrich to explore your Steam collection." />;
}

function GameCard({ game, onAction, metacriticColor, formatLastPlayed }) {
  var [expanded, setExpanded] = React.useState(false);

  var headerImg = game.headerImage || ("https://cdn.akamai.steamstatic.com/steam/apps/" + game.appId + "/header.jpg");

  return (
    <UICard style={{ padding: 0, overflow: "hidden" }}>
      {/* Header image */}
      <div style={{ position: "relative" }}>
        <img
          src={headerImg}
          alt={game.name}
          style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }}
          onError={function(e) { e.target.style.display = "none"; }}
        />
        {/* Metacritic badge overlay */}
        {game.metacritic && (
          <div style={{
            position: "absolute", top: "6px", right: "6px",
            background: metacriticColor(game.metacritic), color: "#fff",
            fontWeight: 700, fontSize: "13px", padding: "2px 7px",
            borderRadius: "4px", lineHeight: 1.3
          }}>{game.metacritic}</div>
        )}
      </div>

      <div style={{ padding: "10px" }}>
        {/* Title */}
        <div style={{ fontWeight: 600, fontSize: "14px", lineHeight: 1.3 }}>{game.name}</div>

        {/* Developers + meta row */}
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {game.developers && game.developers.length > 0 && (
            <span>{game.developers.slice(0, 2).join(", ")}</span>
          )}
          {game.releaseDate && <span>{game.releaseDate}</span>}
        </div>

        {/* Size + Last played row */}
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "flex", gap: "10px", alignItems: "center" }}>
          {game.sizeGB && (
            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <HardDrive size={11} />{game.sizeGB}
            </span>
          )}
          {game.lastPlayed && (
            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <Clock size={11} />{formatLastPlayed(game.lastPlayed)}
            </span>
          )}
        </div>

        {/* Genre badges */}
        {game.genres && game.genres.length > 0 && (
          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "6px" }}>
            {game.genres.slice(0, 4).map(function(genre) {
              return <Badge key={genre} variant="secondary" style={{ fontSize: "9px", padding: "1px 5px" }}>{genre}</Badge>;
            })}
          </div>
        )}

        {/* Description (expandable) */}
        {game.description && (
          <div
            onClick={function() { setExpanded(!expanded); }}
            style={{
              fontSize: "11px", color: "#64748b", marginTop: "6px", lineHeight: 1.4, cursor: "pointer",
              ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" })
            }}
          >{game.description}</div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "5px", marginTop: "8px", flexWrap: "wrap" }}>
          {game.hasWikiPage && (
            <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
              onClick={function() { onAction("send_message", { message: "/wiki read " + game.wikiSlug }); }}
            >Wiki</Button>
          )}
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { onAction("send_message", { message: "/research \"" + game.name + "\" game review and guide" }); }}
          ><Search size={10} style={{ marginRight: "3px" }} />Research</Button>
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { window.open("https://store.steampowered.com/app/" + game.appId, "_blank"); }}
          ><ExternalLink size={10} style={{ marginRight: "3px" }} />Store</Button>
          {!game.hasWikiPage && (
            <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
              onClick={function() { onAction("send_message", { message: "Add \"" + game.name + "\" to my Knowledge Cortex" }); }}
            >+ Cortex</Button>
          )}
        </div>
      </div>
    </UICard>
  );
}

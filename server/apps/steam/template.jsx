function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_steam_browse";
  var isScan = tool === "enso_steam_scan";
  var isEnrich = tool === "enso_steam_enrich";
  var isUpdate = tool === "enso_steam_update";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  // Hooks MUST be at top level — never inside conditionals
  var [searchInput, setSearchInput] = React.useState(d.query || "");
  var [sortBy, setSortBy] = React.useState(d.sortBy || "name");
  var [activeGenre, setActiveGenre] = React.useState(d.genre || "");
  var [showTranscript, setShowTranscript] = React.useState(false);

  // ── Breadcrumb navigation bar ──
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

        {/* Entity header */}
        <UICard style={{ padding: "16px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            {entity.imageUrl && (
              <img src={entity.imageUrl} alt={entity.title}
                style={{ width: "120px", height: "56px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{entity.title}</div>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                <Badge variant="default">{entity.type}</Badge>
                <Badge variant="secondary">{entity.source}</Badge>
                {entity.cortexPath && <Badge variant="secondary">In Cortex</Badge>}
                {processed && <Badge variant="default" style={{ background: "#7c3aed" }}>Podcast Ready</Badge>}
              </div>
              {entity.summary && (
                <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
                  {entity.summary.length > 300 ? entity.summary.slice(0, 300) + "..." : entity.summary}
                </div>
              )}
            </div>
          </div>
        </UICard>

        {/* Podcast Player */}
        {podcastAudioUrl && (
          <UICard style={{ padding: "12px", borderColor: "#7c3aed44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Gamepad2 size={16} style={{ color: "#c4b5fd" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#c4b5fd" }}>AI Game Podcast</span>
              {podcastDuration && <Badge variant="secondary">{podcastDuration} min</Badge>}
            </div>
            <audio controls preload="metadata" style={{ width: "100%", height: "36px" }}>
              <source src={podcastAudioUrl} type="audio/wav" />
            </audio>
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
            >Retry</Button>
          </UICard>
        )}

        {/* Deep Research Content */}
        {research && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {research.coreThesis && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#94a3b8" }}>Core Thesis</div>
                <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.6 }}>{research.coreThesis}</div>
              </UICard>
            )}
            {research.keyInsights && research.keyInsights.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Key Insights</div>
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
            {research.chapterSummaries && research.chapterSummaries.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Section Summaries</div>
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
            {research.criticalPerspectives && research.criticalPerspectives.length > 0 && (
              <UICard style={{ padding: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Critical Perspectives</div>
                {research.criticalPerspectives.map(function(cp, i) {
                  return <div key={i} style={{ fontSize: "12px", color: "#fbbf24", marginBottom: "4px", lineHeight: 1.5 }}>{cp}</div>;
                })}
              </UICard>
            )}
          </div>
        )}

        {/* Detail fields */}
        {fields.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 12px", fontSize: "12px" }}>
              {fields.map(function(f) {
                var val = Array.isArray(f.value) ? f.value.join(", ") : String(f.value);
                return [
                  <div key={f.key + "-label"} style={{ color: "#64748b", fontWeight: 500 }}>{f.label}</div>,
                  <div key={f.key + "-value"} style={{ color: "#e2e8f0" }}>{val}</div>
                ];
              })}
            </div>
          </UICard>
        )}

        {/* Cortex wiki content */}
        {cortexContent && !research && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Knowledge (Cortex)</div>
            <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: "300px", overflow: "auto" }}>
              {cortexContent.replace(/^#.*\n/gm, "").trim().slice(0, 2000)}
            </div>
          </UICard>
        )}

        {/* Related entities */}
        {related.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>Related</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {related.map(function(r) {
                return (
                  <Button key={r.entityId} variant="outline" size="sm" style={{ fontSize: "10px" }}
                    onClick={function() { onAction("view_entity", { entityId: r.entityId }); }}
                  >{r.title} ({r.source})</Button>
                );
              })}
            </div>
          </UICard>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {!podcastAudioUrl && !podcastStatus && (
            <Button size="sm" style={{ background: "#7c3aed", color: "white" }}
              onClick={function() { onAction("deep_content", { entityId: entity.entityId || d.focusEntity }); }}
            >Deep Podcast</Button>
          )}
          <Button variant="outline" size="sm"
            onClick={function() { onAction("send_message", { message: "/research \"" + entity.title + "\" game review and guide" }); }}
          ><Search size={12} style={{ marginRight: "4px" }} />Research</Button>
          {entity.externalUrl && (
            <Button variant="outline" size="sm"
              onClick={function() { window.open(entity.externalUrl, "_blank"); }}
            ><ExternalLink size={12} style={{ marginRight: "4px" }} />Open External</Button>
          )}
          {entity.cortexPath && (
            <Button variant="outline" size="sm"
              onClick={function() { onAction("send_message", { message: "/wiki read " + entity.cortexPath }); }}
            >View in Cortex</Button>
          )}
          {podcastAudioUrl && (
            <Button variant="outline" size="sm"
              onClick={function() {
                var email = prompt("Send game report + podcast to:");
                if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
              }}
            >Email Summary + Podcast</Button>
          )}
        </div>
      </div>
    );
  }

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
    var games = d.games || [];
    var genres = d.genres || [];

    var metacriticColor = function(score) {
      if (!score) return "#64748b";
      if (score >= 75) return "#22c55e";
      if (score >= 50) return "#eab308";
      return "#ef4444";
    };

    var formatLastPlayed = function(ts) {
      if (!ts) return null;
      var dt = new Date(ts * 1000);
      var now = new Date();
      var diffDays = Math.floor((now - dt) / (1000 * 60 * 60 * 24));
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
              {d.filteredCount === d.totalGames
                ? d.totalGames + " games"
                : d.filteredCount + " of " + d.totalGames + " games"}
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
          <Select value={sortBy} onChange={function(v) { setSortBy(v); onAction("browse", { query: searchInput, sortBy: v, genre: activeGenre }); }}
            options={[
              { value: "name", label: "Name" },
              { value: "lastPlayed", label: "Last Played" },
              { value: "size", label: "Size" },
              { value: "metacritic", label: "Metacritic" }
            ]}
          />
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
                : d.query ? "No games matching \"" + d.query + "\""
                : d.message || "Your Steam library is empty. Run a scan to import games."
            }
          />
        )}

        {/* Scanned at footer */}
        {d.scannedAt && (
          <div style={{ textAlign: "center", fontSize: "11px", color: "#475569" }}>
            Last scanned: {new Date(d.scannedAt).toLocaleDateString()}
          </div>
        )}

        {d.filteredCount > 100 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 100 of {d.filteredCount} games. Use search or genres to narrow down.
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
          style={{ width: "100%", height: "120px", objectFit: "cover", display: "block",
            cursor: game.entityId ? "pointer" : "default" }}
          onClick={function() { if (game.entityId) onAction("view_entity", { entityId: game.entityId }); }}
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
        <div style={{ fontWeight: 600, fontSize: "14px", lineHeight: 1.3,
          cursor: game.entityId ? "pointer" : "default", color: game.entityId ? "#93c5fd" : "inherit" }}
          onClick={function() { if (game.entityId) onAction("view_entity", { entityId: game.entityId }); }}
        >{game.isProcessed && <span style={{ marginRight: "4px" }} title="Deep podcast available">🎙️</span>}{game.name}</div>

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
          {game.entityId && (
            <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
              onClick={function() { onAction("view_entity", { entityId: game.entityId }); }}
            >View</Button>
          )}
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

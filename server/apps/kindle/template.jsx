function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_kindle_browse";
  var isSearch = tool === "enso_kindle_search";
  var isScan = tool === "enso_kindle_scan";
  var isEnrich = tool === "enso_kindle_enrich";
  var isEntityDetail = tool === "entity_detail" || !!d.focusEntity;

  // Hooks MUST be at top level — never inside conditionals
  var [searchInput, setSearchInput] = React.useState(d.query || "");
  var [sortBy, setSortBy] = React.useState(d.sortBy || "title");
  var [showTranscript, setShowTranscript] = React.useState(false);

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
                style={{ width: "80px", height: "120px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{entity.title}</div>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                <Badge variant="default">{entity.type}</Badge>
                <Badge variant="secondary">{entity.source}</Badge>
                {entity.cortexPath && <Badge variant="secondary">📄 In Cortex</Badge>}
                {processed && <Badge variant="default" style={{ background: "#7c3aed" }}>🎙️ Podcast Ready</Badge>}
              </div>
              {entity.summary && (
                <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
                  {entity.summary.length > 300 ? entity.summary.slice(0, 300) + "..." : entity.summary}
                </div>
              )}
            </div>
          </div>
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
              <source src={podcastAudioUrl} type="audio/wav" />
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
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>📖 Knowledge (Cortex)</div>
            <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: "300px", overflow: "auto" }}>
              {cortexContent.replace(/^#.*\n/gm, "").trim().slice(0, 2000)}
            </div>
          </UICard>
        )}

        {/* Related entities */}
        {related.length > 0 && (
          <UICard style={{ padding: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#94a3b8" }}>🔗 Related</div>
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
            >🎙️ Deep Podcast</Button>
          )}
          <Button variant="outline" size="sm"
            onClick={function() { onAction("send_message", { message: "/research \"" + entity.title + "\"" }); }}
          >🔍 Research</Button>
          {entity.externalUrl && (
            <Button variant="outline" size="sm"
              onClick={function() { window.open(entity.externalUrl, "_blank"); }}
            >🔗 Open External</Button>
          )}
          {entity.cortexPath && (
            <Button variant="outline" size="sm"
              onClick={function() { onAction("send_message", { message: "/wiki read " + entity.cortexPath }); }}
            >📄 View in Cortex</Button>
          )}
          {podcastAudioUrl && (
            <Button variant="outline" size="sm"
              onClick={function() {
                var email = prompt("Send book report + podcast to:");
                if (email) onAction("entity_share_email", { entityId: entity.entityId || d.focusEntity, recipient: email });
              }}
            >📧 Email Summary + Podcast</Button>
          )}
        </div>
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
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>📚</span>
            <span style={{ fontWeight: 600 }}>Kindle Library</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {d.filteredCount === d.totalBooks ? d.totalBooks + " books" : d.filteredCount + " of " + d.totalBooks + " books"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>🔄 Scan</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("enrich", {}); }}>✨ Enrich</Button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Input
            placeholder="Search by title, author, or topic..."
            value={searchInput}
            onChange={function(e) { setSearchInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput, sortBy: sortBy }); }}
            style={{ flex: 1 }}
          />
          <Select
            value={sortBy}
            onChange={function(v) { setSortBy(v); onAction("browse", { query: searchInput, sortBy: v }); }}
            options={[
              { value: "title", label: "Title" },
              { value: "rating", label: "Rating" },
              { value: "pageCount", label: "Pages" },
              { value: "author", label: "Author" }
            ]}
          />
        </div>

        {/* Category pills */}
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Badge
              variant={!d.category ? "default" : "secondary"}
              style={{ cursor: "pointer" }}
              onClick={function() { onAction("browse", { sortBy: sortBy }); }}
            >All</Badge>
            {categories.slice(0, 15).map(function(cat) {
              return (
                <Badge
                  key={cat.name}
                  variant={d.category === cat.name ? "default" : "secondary"}
                  style={{ cursor: "pointer" }}
                  onClick={function() { onAction("browse", { category: cat.name, sortBy: sortBy }); }}
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

        {/* Footer */}
        {d.filteredCount > 200 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 200 of {d.filteredCount} books. Use search or categories to narrow down.
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
          >{book.isProcessed && <span style={{ marginRight: "4px" }} title="Deep podcast available">🎙️</span>}{book.title}</div>
          {book.author && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{book.author}</div>}

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
      </div>
    </UICard>
  );
}

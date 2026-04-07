function GeneratedUI({ data, onAction }) {
  var tool = (data || {}).tool || "";
  var isBrowse = tool === "enso_kindle_browse";
  var isSearch = tool === "enso_kindle_search";
  var isScan = tool === "enso_kindle_scan";
  var isEnrich = tool === "enso_kindle_enrich";

  // Hooks MUST be at top level — never inside conditionals
  var [searchInput, setSearchInput] = React.useState((data || {}).query || "");
  var [sortBy, setSortBy] = React.useState((data || {}).sortBy || "title");

  // ── Scan / Enrich result ──
  if (isScan || isEnrich) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>{isScan ? "📚" : "✨"}</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>{isScan ? "Kindle Library Scanned" : "Metadata Enrichment"}</div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {isScan && data.data && ("Found " + (data.data.totalBooks || "?") + " books")}
              {isEnrich && (data.enriched + " books enriched, " + data.errors + " errors")}
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
    var results = data.results || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
            {data.totalResults} result{data.totalResults !== 1 ? "s" : ""} for "{data.query}"
          </span>
        </div>
        {results.map(function(book, i) {
          return <BookCard key={i} book={book} onAction={onAction} />;
        })}
        {results.length === 0 && <EmptyState title="No results" description={"No books matching \"" + data.query + "\""} />}
      </div>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var books = data.books || [];
    var categories = data.categories || [];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>📚</span>
            <span style={{ fontWeight: 600 }}>Kindle Library</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {data.filteredCount === data.totalBooks ? data.totalBooks + " books" : data.filteredCount + " of " + data.totalBooks + " books"}
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
              variant={!data.category ? "default" : "secondary"}
              style={{ cursor: "pointer" }}
              onClick={function() { onAction("browse", { sortBy: sortBy }); }}
            >All</Badge>
            {categories.slice(0, 15).map(function(cat) {
              return (
                <Badge
                  key={cat.name}
                  variant={data.category === cat.name ? "default" : "secondary"}
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
            description={data.category ? "No books in category \"" + data.category + "\"" : data.query ? "No books matching \"" + data.query + "\"" : "Your Kindle library is empty. Run a scan to import books."}
          />
        )}

        {/* Footer */}
        {data.filteredCount > 200 && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
            Showing 200 of {data.filteredCount} books. Use search or categories to narrow down.
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
            style={{ width: "55px", height: "82px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + Author */}
          <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3 }}>{book.title}</div>
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
        {!book.hasWikiPage && (
          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
            onClick={function() { onAction("send_message", { message: "Add \"" + book.title + "\" to my Knowledge Cortex" }); }}
          >➕ Cortex</Button>
        )}
      </div>
    </UICard>
  );
}

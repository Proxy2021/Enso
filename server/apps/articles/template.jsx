function GeneratedUI({ data, onAction }) {
  var d = data || {};
  var tool = d.tool || "";
  var isBrowse = tool === "enso_articles_browse";
  var isAdd = tool === "enso_articles_add";
  var isTrending = tool === "enso_articles_trending";

  var [searchInput, setSearchInput] = React.useState("");
  var [addInput, setAddInput] = React.useState("");

  // ── Article Card component ──
  function ArticleCard({ article, showAdd }) {
    return (
      <UICard style={{ padding: "10px" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ width: "4px", borderRadius: "2px", background: "#6366f1", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "#e2e8f0", lineHeight: 1.3 }}>{article.title}</div>
            {article.source && <div style={{ fontSize: "11px", color: "#818cf8", marginTop: "2px" }}>{article.source}</div>}
            {article.description && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>{article.description.slice(0, 200)}{article.description.length > 200 ? "..." : ""}</div>}
            {article.tags && article.tags.length > 0 && (
              <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "4px" }}>
                {article.tags.filter(function(t) { return t !== "article" && t !== "research" && t !== "enriched"; }).slice(0, 4).map(function(t) {
                  return <Badge key={t} variant="secondary" style={{ fontSize: "9px" }}>{t}</Badge>;
                })}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0, justifyContent: "center" }}>
            {article.entityId && (
              <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("view_entity", { entityId: article.entityId }); }}>View</Button>
            )}
            {article.url && (
              <Button variant="ghost" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("open_url", { url: article.url }); }}>🔗 Open</Button>
            )}
            {showAdd && (
              <Button variant="default" size="sm" style={{ fontSize: "10px" }}
                onClick={function() { onAction("add_to_cortex", { title: article.title, type: "article", creator: article.source, url: article.url, description: article.description }); }}>📥 Save</Button>
            )}
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse View ──
  if (isBrowse) {
    var articles = Array.isArray(d.articles) ? d.articles : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>📰</span>
            <span style={{ fontWeight: 600 }}>News & Articles</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{d.totalArticles} saved</span>
          </div>
          <Button variant="default" size="sm" onClick={function() { onAction("trending", {}); }}>🔥 Trending</Button>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px", flex: 1, background: "#1e1b4b", padding: "8px 10px", borderRadius: "8px", border: "1px solid #312e81" }}>
            <Input placeholder="Save article — paste URL or search by title..." value={addInput}
              onChange={function(e) { setAddInput(e.target.value); }}
              onKeyDown={function(e) { if (e.key === "Enter" && addInput.trim()) onAction("add", { query: addInput.trim() }); }}
              style={{ flex: 1, fontSize: "12px" }} />
            <Button variant="default" size="sm" style={{ fontSize: "11px" }}
              onClick={function() { if (addInput.trim()) onAction("add", { query: addInput.trim() }); }}>🔍 Search & Save</Button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Input placeholder="Filter saved articles..." value={searchInput}
            onChange={function(e) { setSearchInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
            style={{ flex: 1 }} />
        </div>

        {articles.length === 0 && (
          <UICard style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📰</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>No saved articles yet</div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>Search for articles above or check trending topics to get started.</div>
          </UICard>
        )}

        {articles.map(function(a, i) { return <ArticleCard key={i} article={a} />; })}
      </div>
    );
  }

  // ── Add/Search Results ──
  if (isAdd) {
    var results = Array.isArray(d.results) ? d.results : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔍</span>
            <span style={{ fontWeight: 600 }}>Save Article</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>{results.length} results for "{d.query}"</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>
        {results.map(function(a, i) { return <ArticleCard key={i} article={a} showAdd />; })}
      </div>
    );
  }

  // ── Trending News ──
  if (isTrending) {
    var trending = Array.isArray(d.articles) ? d.articles : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔥</span>
            <span style={{ fontWeight: 600 }}>Trending News</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {d.topic ? "Topic: " + d.topic : "Based on your Cortex interests"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("browse", {}); }}>← Library</Button>
        </div>
        {d.cortexThemes && d.cortexThemes.length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {d.cortexThemes.map(function(t) {
              return <Badge key={t} variant="secondary" style={{ cursor: "pointer", fontSize: "10px" }}
                onClick={function() { onAction("trending", { topic: t }); }}>{t}</Badge>;
            })}
          </div>
        )}
        {trending.map(function(a, i) { return <ArticleCard key={i} article={a} showAdd />; })}
      </div>
    );
  }

  return <div style={{ textAlign: "center", color: "#64748b" }}>📰 News & Articles — browse, save, and explore.</div>;
}

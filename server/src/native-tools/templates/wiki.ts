import type { ToolTemplate } from "../registry.js";

export function isWikiSignature(signatureId: string): boolean {
  return signatureId === "wiki_browser";
}

export function getWikiTemplateCode(_signature: ToolTemplate): string {
  return WIKI_TEMPLATE;
}

const WIKI_TEMPLATE = `export default function GeneratedUI({ data, onAction }) {
  // ── ALL hooks at top level (React rules) ──
  var [activeTab, setActiveTab] = useState("browse");
  var [searchInput, setSearchInput] = useState("");
  var [ingestInput, setIngestInput] = useState("");
  var [ingestTopicInput, setIngestTopicInput] = useState("");
  var [selectedPage, setSelectedPage] = useState(null);
  var [categoryFilter, setCategoryFilter] = useState("all");

  // ── Data extraction ──
  var tool = String(data?.tool ?? "");
  var isSearch = tool === "enso_wiki_search";
  var isRead = tool === "enso_wiki_read";
  var isList = tool === "enso_wiki_list";
  var isIngest = tool === "enso_wiki_ingest";
  var isLint = tool === "enso_wiki_lint";

  var searchResults = Array.isArray(data?.results) ? data.results : [];
  var pages = Array.isArray(data?.pages) ? data.pages : [];
  var totalPages = Number(data?.totalPages ?? 0);
  var categories = data?.categories ?? {};
  var pageContent = String(data?.content ?? "");
  var pagePath = String(data?.path ?? "");
  var backlinks = Array.isArray(data?.backlinks) ? data.backlinks : [];
  var pagesCreated = Array.isArray(data?.pagesCreated) ? data.pagesCreated : [];
  var pagesUpdated = Array.isArray(data?.pagesUpdated) ? data.pagesUpdated : [];
  var ingestSummary = String(data?.summary ?? "");

  // Lint data
  var orphanPages = Array.isArray(data?.orphanPages) ? data.orphanPages : [];
  var missingPages = Array.isArray(data?.missingPages) ? data.missingPages : [];
  var brokenLinks = Array.isArray(data?.brokenLinks) ? data.brokenLinks : [];
  var stalePages = Array.isArray(data?.stalePages) ? data.stalePages : [];
  var isHealthy = Boolean(data?.healthy);
  var stats = data?.stats ?? {};

  var isEmpty = !isSearch && !isRead && !isList && !isIngest && !isLint;
  var hasData = isSearch ? searchResults.length > 0 : isList ? pages.length > 0 : isRead ? !!pageContent : isIngest ? (pagesCreated.length > 0 || pagesUpdated.length > 0) : isLint;

  // ── Handlers ──
  var handleSearch = function() {
    var q = searchInput.trim();
    if (q) onAction("search", { query: q });
  };

  var handleIngest = function() {
    var text = ingestInput.trim();
    var topic = ingestTopicInput.trim();
    if (text || topic) {
      onAction("ingest", { text: text || undefined, topic: topic || undefined });
      setIngestInput("");
      setIngestTopicInput("");
    }
  };

  var handleReadPage = function(path) {
    setSelectedPage(path);
    onAction("read", { path: path });
  };

  var handleListCategory = function(cat) {
    setCategoryFilter(cat);
    onAction("list", cat !== "all" ? { category: cat } : {});
  };

  // ── Render markdown-like content with basic formatting ──
  var renderContent = function(text) {
    if (!text) return null;
    var lines = text.split("\\n");
    return lines.map(function(line, i) {
      if (line.startsWith("# ")) return React.createElement("h1", { key: i, className: "text-xl font-bold text-gray-100 mb-3" }, line.slice(2));
      if (line.startsWith("## ")) return React.createElement("h2", { key: i, className: "text-lg font-semibold text-gray-200 mt-4 mb-2" }, line.slice(3));
      if (line.startsWith("### ")) return React.createElement("h3", { key: i, className: "text-base font-medium text-gray-300 mt-3 mb-1" }, line.slice(4));
      if (line.startsWith("- ")) return React.createElement("li", { key: i, className: "text-gray-300 ml-4 list-disc" }, line.slice(2));
      if (line.trim() === "") return React.createElement("div", { key: i, className: "h-2" });
      // Highlight [[wiki links]]
      var parts = line.split(/(\\[\\[[^\\]]+\\]\\])/g);
      if (parts.length > 1) {
        return React.createElement("p", { key: i, className: "text-gray-300 leading-relaxed" },
          parts.map(function(part, pi) {
            var linkMatch = part.match(/^\\[\\[([^\\]]+)\\]\\]$/);
            if (linkMatch) {
              var linkName = linkMatch[1];
              var linkPath = "entities/" + linkName.toLowerCase().replace(/\\s+/g, "-") + ".md";
              return React.createElement("button", {
                key: pi,
                className: "text-blue-400 hover:text-blue-300 underline mx-0.5",
                onClick: function() { handleReadPage(linkPath); }
              }, linkName);
            }
            return part;
          })
        );
      }
      return React.createElement("p", { key: i, className: "text-gray-300 leading-relaxed" }, line);
    });
  };

  // ── Category badges ──
  var categoryColors = { entities: "blue", concepts: "purple", sources: "green", synthesis: "amber" };
  var categoryIcons = { entities: "Users", concepts: "Lightbulb", sources: "FileText", synthesis: "GitMerge" };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LucideReact.BookOpen className="w-5 h-5 text-blue-400" />
          <span className="text-lg font-semibold text-gray-100">Knowledge Wiki</span>
          {totalPages > 0 && (
            <Badge variant="outline">{totalPages} pages</Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant={activeTab === "browse" ? "default" : "ghost"} onClick={function() { setActiveTab("browse"); onAction("list", {}); }}>
            <LucideReact.Library className="w-3.5 h-3.5" /> Browse
          </Button>
          <Button variant={activeTab === "add" ? "default" : "ghost"} onClick={function() { setActiveTab("add"); }}>
            <LucideReact.Plus className="w-3.5 h-3.5" /> Add
          </Button>
          <Button variant={activeTab === "health" ? "default" : "ghost"} onClick={function() { setActiveTab("health"); onAction("lint", {}); }}>
            <LucideReact.HeartPulse className="w-3.5 h-3.5" /> Health
          </Button>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="flex gap-2">
        <Input
          placeholder="Search wiki pages..."
          value={searchInput}
          onChange={setSearchInput}
          onKeyDown={function(e) { if (e.key === "Enter") handleSearch(); }}
          className="flex-1"
        />
        <Button variant="primary" onClick={handleSearch}>
          <LucideReact.Search className="w-3.5 h-3.5" /> Search
        </Button>
      </div>

      {/* ── Category filters ── */}
      {(activeTab === "browse" || isSearch || isList) && (
        <div className="flex gap-1.5 flex-wrap">
          <Button variant={categoryFilter === "all" ? "default" : "ghost"} onClick={function() { handleListCategory("all"); }}>
            All
          </Button>
          {["entities", "concepts", "sources", "synthesis"].map(function(cat) {
            var count = categories[cat] ?? 0;
            return (
              <Button key={cat} variant={categoryFilter === cat ? "default" : "ghost"} onClick={function() { handleListCategory(cat); }}>
                <span className="capitalize">{cat}</span>
                {count > 0 && <Badge variant="outline" className="ml-1 text-xs">{count}</Badge>}
              </Button>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {(isEmpty || (!hasData && !isRead)) && !isLint && activeTab !== "add" && (
        <EmptyState
          icon={React.createElement(LucideReact.BookOpen, { className: "w-12 h-12" })}
          title="Your wiki is empty"
          description="Start building your knowledge base by adding topics, articles, or research results. The AI will organize everything into interlinked pages."
        />
      )}

      {/* ── Search results ── */}
      {isSearch && searchResults.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-400">{searchResults.length} results found</div>
          {searchResults.map(function(r, i) {
            var cat = (r.path ?? "").split("/")[0];
            var color = categoryColors[cat] ?? "gray";
            return (
              <div key={i} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 cursor-pointer transition-colors" onClick={function() { handleReadPage(r.path); }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-100">{r.title}</span>
                  <Badge variant="outline">{cat}</Badge>
                  {(r.tags ?? []).slice(0, 3).map(function(tag, ti) {
                    return React.createElement(Badge, { key: ti, variant: "outline", className: "text-xs" }, tag);
                  })}
                </div>
                <div className="text-sm text-gray-400">{r.summary}</div>
                <div className="text-xs text-gray-500 mt-1">{r.path} · Updated {r.updated ? new Date(r.updated).toLocaleDateString() : "—"}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Page list ── */}
      {isList && pages.length > 0 && !isRead && (
        <div className="space-y-2">
          {pages.map(function(p, i) {
            var cat = (p.path ?? "").split("/")[0];
            return (
              <div key={i} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 cursor-pointer transition-colors" onClick={function() { handleReadPage(p.path); }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-100">{p.title}</span>
                    <Badge variant="outline">{cat}</Badge>
                  </div>
                  <span className="text-xs text-gray-500">{Math.round((p.sizeBytes ?? 0) / 1024)}KB · {p.modified ? new Date(p.modified).toLocaleDateString() : ""}</span>
                </div>
                {p.summary && <div className="text-sm text-gray-400 mt-1">{p.summary}</div>}
                {(p.tags ?? []).length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {p.tags.slice(0, 5).map(function(tag, ti) {
                      return React.createElement(Badge, { key: ti, variant: "outline", className: "text-xs" }, tag);
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Article viewer ── */}
      {isRead && pageContent && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={function() { onAction("list", {}); }}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
            <span className="text-xs text-gray-500">{pagePath}</span>
          </div>
          <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
            {renderContent(pageContent)}
          </div>
          {backlinks.length > 0 && (
            <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
              <div className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-1">
                <LucideReact.Link className="w-3.5 h-3.5" /> Backlinks ({backlinks.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {backlinks.map(function(bl, i) {
                  var name = bl.replace(/.*\\//, "").replace(/\\.md$/, "").replace(/-/g, " ");
                  return (
                    <Button key={i} variant="ghost" className="text-xs" onClick={function() { handleReadPage(bl); }}>
                      {name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ingest form ── */}
      {activeTab === "add" && (
        <div className="space-y-3 p-4 bg-gray-800/30 rounded-lg border border-gray-700/30">
          <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <LucideReact.PlusCircle className="w-4 h-4 text-blue-400" />
            Add knowledge to your wiki
          </div>
          <Input
            placeholder="Topic or title (e.g., 'Machine Learning', 'React Hooks')"
            value={ingestTopicInput}
            onChange={setIngestTopicInput}
          />
          <div>
            <textarea
              placeholder="Paste text content, notes, article text, or key facts to ingest..."
              value={ingestInput}
              onChange={function(e) { setIngestInput(e.target.value); }}
              className="w-full h-32 bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-y focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">The AI will extract entities, concepts, and create interlinked wiki pages.</span>
            <Button variant="primary" onClick={handleIngest}>
              <LucideReact.Sparkles className="w-3.5 h-3.5" /> Ingest
            </Button>
          </div>

          {/* ── Import from Data Sources ── */}
          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
                  <LucideReact.Database className="w-4 h-4 text-purple-400" />
                  Import from Data Sources
                </div>
                <div className="text-xs text-gray-500 mt-1">Import browser history, bookmarks, projects, email contacts, and installed tools into your wiki. Uses data from Settings &gt; Data Sources.</div>
              </div>
              <Button variant="outline" onClick={function() { onAction("import_sources", {}); }}>
                <LucideReact.Download className="w-3.5 h-3.5" /> Import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ingest result ── */}
      {isIngest && (pagesCreated.length > 0 || pagesUpdated.length > 0) && (
        <div className="p-4 bg-green-900/20 rounded-lg border border-green-700/30">
          <div className="flex items-center gap-2 mb-2">
            <LucideReact.CheckCircle className="w-4 h-4 text-green-400" />
            <span className="font-medium text-green-300">Ingested successfully</span>
          </div>
          {ingestSummary && <div className="text-sm text-gray-300 mb-2">{ingestSummary}</div>}
          {pagesCreated.length > 0 && (
            <div className="mb-1">
              <span className="text-xs text-gray-400">Created: </span>
              {pagesCreated.map(function(p, i) {
                return (
                  <Button key={i} variant="ghost" className="text-xs text-blue-400" onClick={function() { handleReadPage(p); }}>
                    {p}
                  </Button>
                );
              })}
            </div>
          )}
          {pagesUpdated.length > 0 && (
            <div>
              <span className="text-xs text-gray-400">Updated: </span>
              {pagesUpdated.map(function(p, i) {
                return (
                  <Button key={i} variant="ghost" className="text-xs text-amber-400" onClick={function() { handleReadPage(p); }}>
                    {p}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Health report ── */}
      {isLint && (
        <div className="space-y-3">
          <div className={"p-3 rounded-lg border " + (isHealthy ? "bg-green-900/20 border-green-700/30" : "bg-amber-900/20 border-amber-700/30")}>
            <div className="flex items-center gap-2 mb-1">
              {isHealthy
                ? React.createElement(LucideReact.CheckCircle, { className: "w-4 h-4 text-green-400" })
                : React.createElement(LucideReact.AlertTriangle, { className: "w-4 h-4 text-amber-400" })}
              <span className={"font-medium " + (isHealthy ? "text-green-300" : "text-amber-300")}>
                {isHealthy ? "Wiki is healthy" : "Issues found"}
              </span>
            </div>
            <div className="text-sm text-gray-400">
              {stats.totalPages ?? 0} pages indexed, {stats.totalIndexed ?? 0} in index
            </div>
          </div>

          {orphanPages.length > 0 && (
            <div className="p-3 bg-gray-800/30 rounded-lg border border-amber-700/30">
              <div className="text-sm font-medium text-amber-300 mb-2">Orphan pages ({orphanPages.length})</div>
              <div className="space-y-1">
                {orphanPages.map(function(p, i) {
                  return (
                    <div key={i} className="text-sm text-gray-300 flex items-center gap-2">
                      <LucideReact.FileQuestion className="w-3.5 h-3.5 text-amber-400" />
                      <button className="hover:text-blue-400" onClick={function() { handleReadPage(p); }}>{p}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {missingPages.length > 0 && (
            <div className="p-3 bg-gray-800/30 rounded-lg border border-red-700/30">
              <div className="text-sm font-medium text-red-300 mb-2">Missing pages ({missingPages.length})</div>
              <div className="space-y-1">
                {missingPages.map(function(p, i) {
                  return (
                    <div key={i} className="text-sm text-red-300 flex items-center gap-2">
                      <LucideReact.FileX className="w-3.5 h-3.5 text-red-400" />
                      {p}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {brokenLinks.length > 0 && (
            <div className="p-3 bg-gray-800/30 rounded-lg border border-red-700/30">
              <div className="text-sm font-medium text-red-300 mb-2">Broken links ({brokenLinks.length})</div>
              <div className="space-y-1">
                {brokenLinks.map(function(bl, i) {
                  return (
                    <div key={i} className="text-sm text-gray-300 flex items-center gap-2">
                      <LucideReact.Unlink className="w-3.5 h-3.5 text-red-400" />
                      <span>{bl.page}</span>
                      <span className="text-gray-500">→</span>
                      <span className="text-red-300">[[{bl.link}]]</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stalePages.length > 0 && (
            <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
              <div className="text-sm font-medium text-gray-400 mb-2">Stale pages ({stalePages.length})</div>
              <div className="space-y-1">
                {stalePages.map(function(p, i) {
                  return (
                    <div key={i} className="text-sm text-gray-300 flex items-center gap-2">
                      <LucideReact.Clock className="w-3.5 h-3.5 text-gray-500" />
                      <button className="hover:text-blue-400" onClick={function() { handleReadPage(p); }}>{p}</button>
                      <span className="text-xs text-gray-500">30+ days old</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Read error ── */}
      {isRead && data?.error && (
        <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/30 text-sm text-red-300">
          {data.error}
        </div>
      )}
    </div>
  );
}`;

export default function GeneratedUI({ data, onAction }) {
  // ── Hooks at top level ──
  var [activeView, setActiveView] = useState("dashboard");
  var [searchQuery, setSearchQuery] = useState("");
  var [searchCategory, setSearchCategory] = useState("");
  var [ingestTopic, setIngestTopic] = useState("");
  var [ingestText, setIngestText] = useState("");
  var [discoverTopic, setDiscoverTopic] = useState("");

  // ── Data extraction ──
  var tool = String(data?.tool || "");
  var isExplore = tool === "enso_cortex_explore";
  var isRead = tool === "enso_cortex_read";
  var isSearch = tool === "enso_cortex_search";
  var isGraph = tool === "enso_cortex_graph";
  var isDiscover = tool === "enso_cortex_discover";
  var isIngest = tool === "enso_cortex_ingest";
  var isDigest = tool === "enso_cortex_digest";
  var isDailyDiscovery = tool === "enso_cortex_daily_discovery";

  // activeView is the source of truth when user clicks a tab
  var currentView = activeView;

  // ── Common data ──
  var stats = data?.stats || { total: 0, entities: 0, concepts: 0, sources: 0, synthesis: 0 };
  var recent = Array.isArray(data?.recent) ? data.recent : [];
  var topEntities = Array.isArray(data?.topEntities) ? data.topEntities : [];
  var gaps = Array.isArray(data?.gaps) ? data.gaps : [];
  var logEntries = Array.isArray(data?.log) ? data.log : [];

  // Category colors
  var catColors = { entities: "blue", concepts: "purple", sources: "green", synthesis: "amber" };
  var catIcons = { entities: "Users", concepts: "Lightbulb", sources: "FileText", synthesis: "GitMerge" };

  // ── Render markdown-like content ──
  var renderContent = function(text) {
    if (!text) return null;
    var lines = text.split("\n");
    return lines.map(function(line, i) {
      if (line.startsWith("# ")) return React.createElement("h1", { key: i, className: "text-xl font-bold text-gray-100 mb-3" }, line.slice(2));
      if (line.startsWith("## ")) return React.createElement("h2", { key: i, className: "text-lg font-semibold text-gray-200 mt-4 mb-2" }, line.slice(3));
      if (line.startsWith("### ")) return React.createElement("h3", { key: i, className: "text-base font-medium text-gray-300 mt-3 mb-1" }, line.slice(4));
      if (line.startsWith("- **")) {
        var m = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
        if (m) return React.createElement("li", { key: i, className: "text-gray-300 ml-4 list-disc" }, React.createElement("strong", null, m[1]), m[2] ? ": " + m[2] : "");
      }
      if (line.startsWith("- ")) return React.createElement("li", { key: i, className: "text-gray-300 ml-4 list-disc" }, line.slice(2));
      if (line.trim() === "") return React.createElement("div", { key: i, className: "h-2" });
      // Highlight [[wiki links]]
      var parts = line.split(/(\[\[[^\]]+\]\])/g);
      if (parts.length > 1) {
        return React.createElement("p", { key: i, className: "text-gray-300 leading-relaxed" },
          parts.map(function(part, pi) {
            var lm = part.match(/^\[\[([^\]]+)\]\]$/);
            if (lm) {
              var linkSlug = lm[1].toLowerCase().replace(/\s+/g, "-").replace(/^(entities|concepts|sources|synthesis)\//, "");
              return React.createElement("button", {
                key: pi, className: "text-blue-400 hover:text-blue-300 underline mx-0.5",
                onClick: function() { onAction("read", { path: "entities/" + linkSlug + ".md" }); }
              }, lm[1]);
            }
            return part;
          })
        );
      }
      return React.createElement("p", { key: i, className: "text-gray-300 leading-relaxed" }, line);
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <LucideReact.Brain className="w-5 h-5 text-purple-400" />
          <span className="text-lg font-bold text-gray-100">Knowledge Cortex</span>
          {stats.total > 0 && <Badge variant="outline">{stats.total} pages</Badge>}
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex gap-1 flex-wrap">
        {[
          { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard", action: "explore" },
          { id: "graph", label: "Graph", icon: "Network", action: "graph" },
          { id: "search", label: "Search", icon: "Search", action: null },
          { id: "discover", label: "Discover", icon: "Compass", action: null },
          { id: "digest", label: "Digest", icon: "Sparkles", action: "digest" },
        ].map(function(tab) {
          var Icon = LucideReact[tab.icon];
          var isActive = currentView === tab.id || (tab.id === "dashboard" && isExplore) || (tab.id === "reader" && isRead);
          return (
            <Button key={tab.id} variant={isActive ? "default" : "ghost"} onClick={function() {
              setActiveView(tab.id);
              if (tab.action) onAction(tab.action, tab.id === "search" || tab.id === "discover" ? { query: "" } : {});
            }}>
              {Icon && React.createElement(Icon, { className: "w-3.5 h-3.5" })} {tab.label}
            </Button>
          );
        })}
      </div>

      {/* ═══════════ DASHBOARD VIEW ═══════════ */}
      {(currentView === "dashboard") && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Total Pages" value={stats.total} accent="purple" />
            <Stat label="Entities" value={stats.entities} accent="blue" />
            <Stat label="Concepts" value={stats.concepts} accent="violet" />
            <Stat label="Sources" value={stats.sources} accent="green" />
            <Stat label="Synthesis" value={stats.synthesis} accent="amber" />
          </div>

          {/* Top Entities */}
          {topEntities.length > 0 && (
            <UICard accent="blue" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.Star, { className: "w-4 h-4" }), "Top Entities")}>
              <div className="space-y-1.5">
                {topEntities.slice(0, 10).map(function(e, i) {
                  return (
                    <div key={i} className="flex items-center justify-between cursor-pointer hover:bg-gray-700/30 rounded px-2 py-1 transition-colors"
                      onClick={function() { onAction("read", { path: e.path }); }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">{e.title}</span>
                        <Badge variant="outline">{e.category}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <LucideReact.Link className="w-3 h-3" /> {e.backlinks}
                      </div>
                    </div>
                  );
                })}
              </div>
            </UICard>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Recent Updates */}
            {recent.length > 0 && (
              <UICard accent="green" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.Clock, { className: "w-4 h-4" }), "Recent Updates")}>
                <div className="space-y-1">
                  {recent.slice(0, 8).map(function(r, i) {
                    return (
                      <div key={i} className="flex items-center justify-between cursor-pointer hover:bg-gray-700/30 rounded px-2 py-1"
                        onClick={function() { onAction("read", { path: r.path }); }}>
                        <span className="text-sm text-gray-300 truncate">{r.title}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">{r.updated ? new Date(r.updated).toLocaleDateString() : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </UICard>
            )}

            {/* Knowledge Gaps */}
            {gaps.length > 0 && (
              <UICard accent="amber" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.AlertTriangle, { className: "w-4 h-4" }), "Knowledge Gaps")}>
                <div className="space-y-1">
                  {gaps.slice(0, 8).map(function(g, i) {
                    return (
                      <div key={i} className="flex items-center justify-between px-2 py-1">
                        <button className="text-sm text-amber-300 hover:text-amber-200" onClick={function() { setDiscoverTopic(g.name.replace(/-/g, " ")); setActiveView("discover"); }}>
                          {g.name.replace(/-/g, " ")}
                        </button>
                        <span className="text-xs text-gray-500">{g.references} refs</span>
                      </div>
                    );
                  })}
                </div>
              </UICard>
            )}
          </div>

          {/* Activity Log */}
          {logEntries.length > 0 && (
            <UICard accent="gray" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.ScrollText, { className: "w-4 h-4" }), "Activity Log")}>
              <div className="space-y-1">
                {logEntries.map(function(l, i) {
                  return (
                    <div key={i} className="text-xs text-gray-400">
                      <span className="text-gray-500">{l.timestamp ? new Date(l.timestamp).toLocaleString() : ""}</span> {l.message}
                    </div>
                  );
                })}
              </div>
            </UICard>
          )}

          {/* Empty state */}
          {stats.total === 0 && (
            <EmptyState
              icon={React.createElement(LucideReact.Brain, { className: "w-12 h-12" })}
              title="Your Cortex is empty"
              description="Start building your knowledge base. Import data sources, research topics, or add knowledge manually."
            />
          )}
        </div>
      )}

      {/* ═══════════ READER VIEW ═══════════ */}
      {isRead && (
        <div className="space-y-3">
          {data?.error ? (
            <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/30 text-sm text-red-300">{data.error}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" onClick={function() { onAction("explore", {}); }}>
                  <LucideReact.ArrowLeft className="w-3.5 h-3.5" /> Back
                </Button>
                <Badge variant="outline">{data?.category}</Badge>
                <span className="text-xs text-gray-500">{data?.path}</span>
                {(data?.tags || []).map(function(tag, ti) {
                  return React.createElement(Badge, { key: ti, variant: "outline", className: "text-xs" }, tag);
                })}
              </div>

              {/* Article content */}
              <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
                {renderContent(data?.content || "")}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Backlinks */}
                {(data?.backlinks || []).length > 0 && (
                  <UICard accent="blue" header={React.createElement("span", null, "Backlinks (", (data?.backlinks || []).length, ")")}>
                    <div className="flex flex-wrap gap-1.5">
                      {(data?.backlinks || []).map(function(bl, i) {
                        return (
                          <Button key={i} variant="ghost" className="text-xs" onClick={function() { onAction("read", { path: bl.path }); }}>
                            {bl.title}
                          </Button>
                        );
                      })}
                    </div>
                  </UICard>
                )}

                {/* Outgoing Links */}
                {(data?.outgoingLinks || []).length > 0 && (
                  <UICard accent="violet" header={React.createElement("span", null, "Links To (", (data?.outgoingLinks || []).length, ")")}>
                    <div className="flex flex-wrap gap-1.5">
                      {(data?.outgoingLinks || []).map(function(ol, i) {
                        return (
                          <Button key={i} variant={ol.exists ? "ghost" : "outline"} className={"text-xs " + (!ol.exists ? "text-amber-400" : "")}
                            onClick={function() { ol.exists ? onAction("read", { path: ol.path }) : (setDiscoverTopic(ol.name), setActiveView("discover")); }}>
                            {ol.name} {!ol.exists && "⚠"}
                          </Button>
                        );
                      })}
                    </div>
                  </UICard>
                )}
              </div>

              {/* Related pages */}
              {(data?.related || []).length > 0 && (
                <UICard accent="green" header="Related Pages">
                  <div className="flex flex-wrap gap-1.5">
                    {(data?.related || []).map(function(r, i) {
                      return (
                        <Button key={i} variant="ghost" className="text-xs" onClick={function() { onAction("read", { path: r.path }); }}>
                          {r.title} <span className="text-gray-500 ml-1">({(r.sharedTags || []).join(", ")})</span>
                        </Button>
                      );
                    })}
                  </div>
                </UICard>
              )}

              {/* Discover More */}
              <Button variant="primary" onClick={function() { onAction("discover", { topic: data?.title || "", path: data?.path }); }}>
                <LucideReact.Compass className="w-3.5 h-3.5" /> Discover More About {data?.title}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ═══════════ GRAPH VIEW ═══════════ */}
      {isGraph && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LucideReact.Network className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-300">{data?.totalNodes || 0} nodes, {data?.totalEdges || 0} connections</span>
          </div>

          {/* Treemap visualization */}
          {(data?.nodes || []).length > 0 && (
            <div className="bg-gray-800/30 rounded-lg border border-gray-700/30 p-2" style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={(data?.nodes || []).slice(0, 60).map(function(n) {
                    return { name: n.title, size: Math.max(n.connections + 1, 1), category: n.category, path: n.path, fill: n.category === "entities" ? "#3b82f6" : n.category === "concepts" ? "#8b5cf6" : n.category === "sources" ? "#22c55e" : "#f59e0b" };
                  })}
                  dataKey="size"
                  nameKey="name"
                  stroke="#374151"
                  fill="#6366f1"
                  content={function(props) {
                    var x = props.x || 0, y = props.y || 0, width = props.width || 0, height = props.height || 0;
                    var name = props.name || "";
                    var fill = props.fill || "#6366f1";
                    if (width < 30 || height < 20) return null;
                    return React.createElement("g", null,
                      React.createElement("rect", { x: x, y: y, width: width, height: height, fill: fill, fillOpacity: 0.8, stroke: "#1f2937", strokeWidth: 1, rx: 4, style: { cursor: "pointer" },
                        onClick: function() { var node = (data?.nodes || []).find(function(n) { return n.title === name; }); if (node) onAction("read", { path: node.path }); }
                      }),
                      width > 50 ? React.createElement("text", { x: x + width/2, y: y + height/2, textAnchor: "middle", dominantBaseline: "middle", fill: "#fff", fontSize: Math.min(12, width/name.length * 1.5), style: { pointerEvents: "none" } }, name.length > width/7 ? name.slice(0, Math.floor(width/7)) + "…" : name) : null
                    );
                  }}
                />
              </ResponsiveContainer>
            </div>
          )}

          {/* Category legend */}
          <div className="flex gap-3 text-xs text-gray-400">
            <span><span className="inline-block w-3 h-3 rounded bg-blue-500 mr-1"></span>Entities ({data?.categories?.entities || 0})</span>
            <span><span className="inline-block w-3 h-3 rounded bg-purple-500 mr-1"></span>Concepts ({data?.categories?.concepts || 0})</span>
            <span><span className="inline-block w-3 h-3 rounded bg-green-500 mr-1"></span>Sources ({data?.categories?.sources || 0})</span>
            <span><span className="inline-block w-3 h-3 rounded bg-amber-500 mr-1"></span>Synthesis ({data?.categories?.synthesis || 0})</span>
          </div>
        </div>
      )}

      {/* ═══════════ SEARCH VIEW ═══════════ */}
      {(currentView === "search") && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Search Cortex..." value={searchQuery} onChange={setSearchQuery}
              onKeyDown={function(e) { if (e.key === "Enter") onAction("search", { query: searchQuery, category: searchCategory || undefined }); }}
              className="flex-1" />
            <Button variant="primary" onClick={function() { onAction("search", { query: searchQuery, category: searchCategory || undefined }); }}>
              <LucideReact.Search className="w-3.5 h-3.5" /> Search
            </Button>
          </div>

          {/* Category pills */}
          <div className="flex gap-1 flex-wrap">
            {["", "entities", "concepts", "sources", "synthesis"].map(function(cat) {
              return (
                <Button key={cat || "all"} variant={searchCategory === cat ? "default" : "ghost"} className="text-xs"
                  onClick={function() { setSearchCategory(cat); if (searchQuery) onAction("search", { query: searchQuery, category: cat || undefined }); }}>
                  {cat || "All"}
                </Button>
              );
            })}
          </div>

          {/* Tag cloud */}
          {Array.isArray(data?.tagCloud) && data.tagCloud.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.tagCloud.slice(0, 20).map(function(t, i) {
                return (
                  <button key={i} className="px-2 py-0.5 text-xs rounded-full bg-gray-700/50 text-gray-400 hover:text-blue-300 hover:bg-blue-500/10"
                    onClick={function() { setSearchQuery(t.tag); onAction("search", { query: t.tag }); }}>
                    {t.tag} <span className="text-gray-600">({t.count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Results */}
          {isSearch && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400">{data?.totalResults || 0} results</div>
              {(data?.results || []).map(function(r, i) {
                return (
                  <div key={i} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 cursor-pointer transition-colors"
                    onClick={function() { onAction("read", { path: r.path }); }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-100">{r.title}</span>
                      <Badge variant="outline">{r.category}</Badge>
                    </div>
                    <div className="text-sm text-gray-400">{r.summary}</div>
                    {(r.tags || []).length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {r.tags.slice(0, 5).map(function(tag, ti) {
                          return React.createElement(Badge, { key: ti, variant: "outline", className: "text-xs" }, tag);
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ DISCOVER VIEW ═══════════ */}
      {(currentView === "discover") && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Enter a topic to discover..." value={discoverTopic} onChange={setDiscoverTopic}
              onKeyDown={function(e) { if (e.key === "Enter" && discoverTopic.trim()) onAction("discover", { topic: discoverTopic.trim() }); }}
              className="flex-1" />
            <Button variant="primary" onClick={function() { if (discoverTopic.trim()) onAction("discover", { topic: discoverTopic.trim() }); }}>
              <LucideReact.Compass className="w-3.5 h-3.5" /> Discover
            </Button>
          </div>

          {isDiscover && data?.topic && (
            <>
              <div className="text-sm text-gray-400">Exploring: <strong className="text-gray-200">{data.topic}</strong>
                {data.hasExistingPage && <Badge variant="outline" className="ml-2">In Cortex</Badge>}
              </div>

              {/* Web Results */}
              {(data?.webResults || []).length > 0 && (
                <UICard accent="blue" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.Globe, { className: "w-4 h-4" }), "Web Results")}>
                  <div className="space-y-2">
                    {data.webResults.map(function(r, i) {
                      return (
                        <div key={i} className="p-2 bg-gray-900/30 rounded border border-gray-700/30">
                          <a href={r.url} target="_blank" rel="noopener" className="text-sm font-medium text-blue-400 hover:text-blue-300">{r.title}</a>
                          <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <Button variant="outline" onClick={function() {
                      var text = data.webResults.map(function(r) { return r.title + ": " + r.description + " (" + r.url + ")"; }).join("\n");
                      onAction("ingest", { text: text, topic: data.topic + " — web discoveries" });
                    }}>
                      <LucideReact.Download className="w-3.5 h-3.5" /> Ingest All Results into Cortex
                    </Button>
                  </div>
                </UICard>
              )}

              {/* AI Suggestions */}
              {(data?.suggestions || []).length > 0 && (
                <UICard accent="purple" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.Sparkles, { className: "w-4 h-4" }), "Suggested Branches")}>
                  <div className="space-y-2">
                    {data.suggestions.map(function(s, i) {
                      return (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-900/30 rounded border border-gray-700/30">
                          <div>
                            <span className="text-sm font-medium text-gray-200">{s.topic}</span>
                            <Badge variant="outline" className="ml-2 text-xs">{s.category}</Badge>
                            <div className="text-xs text-gray-500 mt-0.5">{s.reason}</div>
                          </div>
                          <Button variant="ghost" className="text-xs flex-shrink-0" onClick={function() { setDiscoverTopic(s.topic); onAction("discover", { topic: s.topic }); }}>
                            <LucideReact.ArrowRight className="w-3 h-3" /> Explore
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </UICard>
              )}
            </>
          )}

          {/* Quick ingest form */}
          <UICard accent="gray" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.PlusCircle, { className: "w-4 h-4" }), "Add Knowledge")}>
            <div className="space-y-2">
              <Input placeholder="Topic" value={ingestTopic} onChange={setIngestTopic} />
              <textarea placeholder="Paste text content..." value={ingestText} onChange={function(e) { setIngestText(e.target.value); }}
                className="w-full h-24 bg-gray-900/50 border border-gray-700 rounded-lg p-2 text-sm text-gray-200 placeholder-gray-500 resize-y focus:outline-none focus:border-blue-500/50" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={function() { onAction("import_sources", {}); }}>
                  <LucideReact.Database className="w-3.5 h-3.5" /> Import Data Sources
                </Button>
                <Button variant="primary" onClick={function() {
                  if (ingestTopic.trim() || ingestText.trim()) {
                    onAction("ingest", { topic: ingestTopic.trim() || undefined, text: ingestText.trim() || undefined });
                    setIngestTopic(""); setIngestText("");
                  }
                }}>
                  <LucideReact.Sparkles className="w-3.5 h-3.5" /> Ingest
                </Button>
              </div>
            </div>
          </UICard>
        </div>
      )}

      {/* ═══════════ DIGEST VIEW ═══════════ */}
      {isDigest && (
        <div className="space-y-3">
          {data?.summary && (
            <UICard accent="purple" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.Brain, { className: "w-4 h-4" }), "Knowledge Overview")}>
              <p className="text-sm text-gray-300 leading-relaxed">{data.summary}</p>
            </UICard>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(data?.strengths || []).length > 0 && (
              <UICard accent="green" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.CheckCircle, { className: "w-4 h-4" }), "Strengths")}>
                <div className="space-y-1">
                  {data.strengths.map(function(s, i) {
                    return React.createElement("div", { key: i, className: "text-sm text-gray-300 flex items-center gap-2" },
                      React.createElement(LucideReact.Check, { className: "w-3 h-3 text-green-400 flex-shrink-0" }), s);
                  })}
                </div>
              </UICard>
            )}

            {(data?.gaps || []).length > 0 && (
              <UICard accent="amber" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.AlertTriangle, { className: "w-4 h-4" }), "Knowledge Gaps")}>
                <div className="space-y-1">
                  {data.gaps.map(function(g, i) {
                    return (
                      <button key={i} className="text-sm text-amber-300 hover:text-amber-200 flex items-center gap-2 text-left w-full"
                        onClick={function() { setDiscoverTopic(g); setActiveView("discover"); }}>
                        <LucideReact.HelpCircle className="w-3 h-3 flex-shrink-0" /> {g}
                      </button>
                    );
                  })}
                </div>
              </UICard>
            )}
          </div>

          {(data?.suggestions || []).length > 0 && (
            <UICard accent="blue" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.Lightbulb, { className: "w-4 h-4" }), "Suggested Explorations")}>
              <div className="space-y-2">
                {data.suggestions.map(function(s, i) {
                  return (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-900/30 rounded">
                      <div>
                        <span className="text-sm font-medium text-gray-200">{s.topic}</span>
                        <Badge variant="outline" className="ml-2 text-xs">{s.type}</Badge>
                        <div className="text-xs text-gray-500">{s.reason}</div>
                      </div>
                      <Button variant="ghost" className="text-xs" onClick={function() { setDiscoverTopic(s.topic); setActiveView("discover"); onAction("discover", { topic: s.topic }); }}>
                        <LucideReact.ArrowRight className="w-3 h-3" /> Go
                      </Button>
                    </div>
                  );
                })}
              </div>
            </UICard>
          )}
        </div>
      )}

      {/* ═══════════ INGEST RESULT ═══════════ */}
      {isIngest && (
        <div className={"p-4 rounded-lg border " + (data?.error ? "bg-red-900/20 border-red-700/30" : "bg-green-900/20 border-green-700/30")}>
          {data?.error ? (
            <div className="text-sm text-red-300">{data.error}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <LucideReact.CheckCircle className="w-4 h-4 text-green-400" />
                <span className="font-medium text-green-300">Ingested into Cortex</span>
              </div>
              {data?.summary && <div className="text-sm text-gray-300 mb-2">{data.summary}</div>}
              {(data?.pagesCreated || []).length > 0 && (
                <div className="text-xs text-gray-400">Created: {data.pagesCreated.map(function(p, i) {
                  return React.createElement("button", { key: i, className: "text-blue-400 hover:text-blue-300 mx-1", onClick: function() { onAction("read", { path: p }); } }, p);
                })}</div>
              )}
              {(data?.pagesUpdated || []).length > 0 && (
                <div className="text-xs text-gray-400 mt-1">Updated: {data.pagesUpdated.map(function(p, i) {
                  return React.createElement("button", { key: i, className: "text-amber-400 hover:text-amber-300 mx-1", onClick: function() { onAction("read", { path: p }); } }, p);
                })}</div>
              )}
              <Button variant="ghost" className="mt-2 text-xs" onClick={function() { onAction("explore", {}); }}>
                <LucideReact.ArrowLeft className="w-3 h-3" /> Back to Dashboard
              </Button>
            </>
          )}
        </div>
      )}

      {/* ═══════════ DAILY DISCOVERY RESULT ═══════════ */}
      {isDailyDiscovery && (
        <UICard accent="purple" header={React.createElement("div", { className: "flex items-center gap-2" }, React.createElement(LucideReact.Brain, { className: "w-4 h-4" }), "Daily Discovery Results")}>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Topics Searched" value={data?.topicsSearched || 0} accent="blue" />
              <Stat label="New Findings" value={data?.newFindings || 0} accent="green" />
              <Stat label="Email Sent" value={data?.emailSent ? "Yes" : "No"} accent={data?.emailSent ? "green" : "gray"} />
            </div>
            {(data?.findings || []).length > 0 && (
              <div className="space-y-1 mt-2">
                {data.findings.map(function(f, i) {
                  return (
                    <div key={i} className="text-sm text-gray-300 p-2 bg-gray-900/30 rounded">
                      <strong className="text-blue-400">{f.topic}</strong>: {f.title}
                      <div className="text-xs text-gray-500">{f.reason}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </UICard>
      )}
    </div>
  );
}

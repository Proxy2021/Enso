import type { ToolTemplate } from "../registry.js";

export function isResearcherSignature(signatureId: string): boolean {
  return signatureId === "research_board";
}

export function getResearcherTemplateCode(_signature: ToolTemplate): string {
  return RESEARCHER_TEMPLATE;
}

const RESEARCHER_TEMPLATE = `export default function GeneratedUI({ data, onAction }) {
  // ── ALL hooks at top level (React rules) ──
  var [topicInput, setTopicInput] = useState("");
  var [followUpInput, setFollowUpInput] = useState("");
  var [compareInput, setCompareInput] = useState("");
  var [sourceFilter, setSourceFilter] = useState("");
  var [deepDiveInput, setDeepDiveInput] = useState("");
  var [imgErrors, setImgErrors] = useState({});
  var [expandedSource, setExpandedSource] = useState(null);
  var [playingVideos, setPlayingVideos] = useState({});

  var [narrativeExpanded, setNarrativeExpanded] = useState(false);
  var [findingFilter, setFindingFilter] = useState("all");
  var [sourceSort, setSourceSort] = useState("relevance");
  var [sourcePopup, setSourcePopup] = useState(null);
  var [searchText, setSearchText] = useState("");
  var [expandedSectionPreview, setExpandedSectionPreview] = useState(null);

  // ── View detection ──
  var topic = String(data?.topic ?? "");
  var phase = String(data?.phase ?? "complete");
  var isWelcome = !topic || data?.category === "welcome";
  var isSearch = data?.tool === "enso_researcher_search" && !isWelcome;
  var isDeepDive = data?.tool === "enso_researcher_deep_dive";
  var isCompare = data?.tool === "enso_researcher_compare";
  var isFollowUp = data?.tool === "enso_researcher_follow_up";


  // ── Shared data extraction ──
  var sources = Array.isArray(data?.sources) ? data.sources : [];
  var keyFindings = Array.isArray(data?.keyFindings) ? data.keyFindings : [];
  var sections = Array.isArray(data?.sections) ? data.sections : [];
  var summary = String(data?.summary ?? "");
  var narrative = String(data?.narrative ?? "");
  var narrativeParagraphs = narrative ? narrative.split(/\\n\\n+/).filter((p) => p.trim()) : [];
  var metadata = data?.metadata || {};
  var images = Array.isArray(data?.images) ? data.images : [];
  var videos = Array.isArray(data?.videos) ? data.videos : [];
  var books = Array.isArray(data?.books) ? data.books : [];
  var movies = Array.isArray(data?.movies) ? data.movies : [];
  var recommendedVideos = Array.isArray(data?.recommendedVideos) ? data.recommendedVideos : [];
  var contradictions = Array.isArray(data?.contradictions) ? data.contradictions : [];
  var searchQueries = Array.isArray(data?.searchQueries) ? data.searchQueries : (Array.isArray(metadata?.searchQueries) ? metadata.searchQueries : []);
  var gapQueries = Array.isArray(metadata?.gapQueries) ? metadata.gapQueries : [];
  var galleryImages = images.filter((img) => !imgErrors[img.url]);
  var handleImgError = (url) => setImgErrors((prev) => ({ ...prev, [url]: true }));
  var heroImage = images.find((img) => img.sectionIdx === 0) || images[0];

  // ── Research history ──
  var recentTopics = Array.isArray(data?.recentTopics) ? data.recentTopics : [];
  var timeAgo = (ts) => {
    if (!ts) return "";
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return Math.floor(days / 30) + "mo ago";
  };

  // ── YouTube embed helper ──
  var getYouTubeId = (url) => {
    if (!url) return null;
    var m = url.match(/(?:youtube\\.com[/]watch\\?v=|youtu\\.be[/]|youtube\\.com[/]embed[/])([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };
  var togglePlay = (url) => setPlayingVideos((prev) => {
    if (prev[url]) return {}; // Pausing — clear all
    return { [url]: true };   // Playing — only this one (stops all others)
  });

  // ── Finding type styling ──
  var findingVariant = { fact: "success", trend: "info", insight: "default", warning: "warning" };
  var findingAccent = { fact: "emerald", trend: "blue", insight: "purple", warning: "amber" };
  var confidenceVariant = { high: "success", medium: "warning", low: "outline" };

  // ── Source trust classification ──
  var getSourceTrust = (domain) => {
    if (!domain) return null;
    var d = String(domain).toLowerCase();
    if (d.endsWith(".edu") || d.endsWith(".ac.uk") || d.endsWith(".ac.jp")) return { label: "Academic", color: "text-purple-400", bg: "bg-purple-500/10" };
    if (d.endsWith(".gov") || d.endsWith(".int") || d.endsWith(".mil")) return { label: "Gov", color: "text-emerald-400", bg: "bg-emerald-500/10" };
    if (d.endsWith(".org") || ["wikipedia.org", "britannica.com", "nature.com", "science.org", "arxiv.org"].some((t) => d.includes(t))) return { label: "Reference", color: "text-blue-400", bg: "bg-blue-500/10" };
    if (["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "nytimes.com", "washingtonpost.com", "theguardian.com", "economist.com"].some((t) => d.includes(t))) return { label: "News", color: "text-cyan-400", bg: "bg-cyan-500/10" };
    return null;
  };

  // ── Phase checks ──
  var isLoading = ["generating_queries", "searching", "sources", "synthesizing", "gap_checking", "deep_research"].includes(phase);
  var hasSynthesis = ["synthesized", "gap_checking", "complete"].includes(phase);
  var isComplete = phase === "complete";
  var isAppBuilt = phase === "app_built";

  // ── Reading time estimate (avg 200 words/min for technical content) ──
  var wordCount = useMemo(() => {
    var text = [narrative, summary, ...keyFindings.map((f) => f.text), ...sections.flatMap((s) => [s.summary || "", ...(s.bullets || [])])].join(" ");
    return text.split(/\\s+/).filter((w) => w.length > 0).length;
  }, [narrative, summary, keyFindings, sections]);
  var readingMinutes = Math.max(1, Math.round(wordCount / 200));

  // ── Finding type counts & confidence distribution ──
  var findingCounts = useMemo(function() {
    var counts = { fact: 0, trend: 0, insight: 0, warning: 0 };
    keyFindings.forEach(function(f) { if (counts[f.type] !== undefined) counts[f.type]++; });
    return counts;
  }, [keyFindings]);

  var confidenceDist = useMemo(function() {
    var dist = { high: 0, medium: 0, low: 0 };
    keyFindings.forEach(function(f) { if (dist[f.confidence] !== undefined) dist[f.confidence]++; });
    return dist;
  }, [keyFindings]);

  var confidenceScore = useMemo(function() {
    if (keyFindings.length === 0) return 0;
    var score = keyFindings.reduce(function(sum, f) {
      return sum + (f.confidence === "high" ? 3 : f.confidence === "medium" ? 2 : 1);
    }, 0);
    return Math.round((score / (keyFindings.length * 3)) * 100);
  }, [keyFindings]);

  // ── Source type breakdown ──
  var sourceTypeCounts = useMemo(function() {
    var counts = {};
    sources.forEach(function(s) {
      var trust = getSourceTrust(s.domain);
      var label = trust ? trust.label : "Web";
      counts[label] = (counts[label] || 0) + 1;
    });
    return counts;
  }, [sources]);

  // ── Filtered findings ──
  var filteredFindings = useMemo(function() {
    if (findingFilter === "all") return keyFindings;
    return keyFindings.filter(function(f) { return f.type === findingFilter; });
  }, [keyFindings, findingFilter]);

  // ── Filtered sources ──
  var filteredSources = sourceFilter
    ? sources.filter(function(s) {
        return String(s.title).toLowerCase().includes(sourceFilter.toLowerCase()) ||
          String(s.domain).toLowerCase().includes(sourceFilter.toLowerCase());
      })
    : sources;

  // ── Sorted sources ──
  var sortedFilteredSources = useMemo(function() {
    var s = filteredSources.slice();
    if (sourceSort === "relevance") return s.sort(function(a, b) { return (b.relevance || 0) - (a.relevance || 0); });
    if (sourceSort === "alpha") return s.sort(function(a, b) { return String(a.title).localeCompare(String(b.title)); });
    if (sourceSort === "domain") return s.sort(function(a, b) {
      var aT = getSourceTrust(a.domain);
      var bT = getSourceTrust(b.domain);
      return (bT ? 1 : 0) - (aT ? 1 : 0) || String(a.domain).localeCompare(String(b.domain));
    });
    return s;
  }, [filteredSources, sourceSort]);

  // ── Finding-section relationship mapping (via sourceRef overlap) ──
  var findingSectionMap = useMemo(function() {
    var map = {};
    keyFindings.forEach(function(f, fi) {
      var fRefs = f.sourceRefs || [];
      var related = [];
      sections.forEach(function(s, si) {
        var sRefs = s.sourceRefs || [];
        if (fRefs.some(function(r) { return sRefs.indexOf(r) >= 0; })) related.push(si);
      });
      map[fi] = related;
    });
    return map;
  }, [keyFindings, sections]);

  // ── Source → findings reverse lookup ──
  var sourceFindingMap = useMemo(function() {
    var map = {};
    keyFindings.forEach(function(f, fi) {
      (f.sourceRefs || []).forEach(function(si) {
        if (!map[si]) map[si] = [];
        map[si].push(fi);
      });
    });
    return map;
  }, [keyFindings]);

  // ── Section finding counts (how many findings relate to each section) ──
  var sectionFindingCounts = useMemo(function() {
    var counts = {};
    sections.forEach(function(s, si) {
      var sRefs = s.sourceRefs || [];
      var count = 0;
      keyFindings.forEach(function(f) {
        if ((f.sourceRefs || []).some(function(r) { return sRefs.indexOf(r) >= 0; })) count++;
      });
      counts[si] = count;
    });
    return counts;
  }, [sections, keyFindings]);

  // ── Full-text search across all research content ──
  var searchMatches = useMemo(function() {
    if (!searchText || searchText.length < 2) return null;
    var q = searchText.toLowerCase();
    var mFindings = [];
    keyFindings.forEach(function(f, i) {
      if (String(f.text).toLowerCase().includes(q)) mFindings.push(i);
    });
    var mSections = [];
    sections.forEach(function(s, i) {
      if (String(s.title).toLowerCase().includes(q) || String(s.summary).toLowerCase().includes(q) || (s.bullets || []).some(function(b) { return String(b).toLowerCase().includes(q); })) mSections.push(i);
    });
    var mSources = [];
    sources.forEach(function(s, i) {
      if (String(s.title).toLowerCase().includes(q) || String(s.domain).toLowerCase().includes(q) || String(s.snippet || "").toLowerCase().includes(q)) mSources.push(i);
    });
    return { findings: mFindings, sections: mSections, sources: mSources, total: mFindings.length + mSections.length + mSources.length };
  }, [searchText, keyFindings, sections, sources]);

  // ── Text highlight helper ──
  var highlightMatch = function(text, query) {
    if (!query || query.length < 2) return String(text);
    var str = String(text);
    var idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return str;
    return (
      <Fragment>
        {str.slice(0, idx)}
        <span className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{str.slice(idx, idx + query.length)}</span>
        {str.slice(idx + query.length)}
      </Fragment>
    );
  };

  // ── Narrative collapse (show first 3 paragraphs for long content) ──
  var NARRATIVE_COLLAPSE_THRESHOLD = 4;

  // ── Helper: source reference badges ──
  var SourceRefs = ({ refs }) => {
    if (!refs || refs.length === 0) return null;
    return (
      <span className="inline-flex gap-0.5 ml-1">
        {refs.slice(0, 3).map((idx) => (
          <span key={idx} className="text-[9px] px-1 py-0.5 rounded bg-gray-700/50 text-gray-400 font-mono cursor-pointer hover:bg-blue-500/30 hover:text-blue-300 transition-colors" onClick={(e) => { e.stopPropagation(); setSourcePopup(sources[idx] || null); }}>
            {idx + 1}
          </span>
        ))}
      </span>
    );
  };

  // ── Helper: skeleton pulse block ──
  var Skeleton = ({ className }) => (
    <div className={"animate-pulse bg-gray-700/40 rounded " + (className || "")} />
  );

  // ── Helper: phase status text ──
  var phaseLabels = {
    generating_queries: "Generating search queries...",
    searching: "Searching the web...",
    sources: "Gathering sources...",
    synthesizing: "Analyzing & synthesizing...",
    gap_checking: "Checking for gaps...",
    deep_research: "Building custom research experience (Claude Code)...",
    synthesized: "Finalizing...",
    complete: "Research complete",
  };

  // ── Video card component ──
  var VideoCard = ({ v, compact }) => {
    var ytId = getYouTubeId(v.url);
    var isPlaying = playingVideos[v.url];
    return (
      <div className="rounded-lg overflow-hidden bg-gray-800/50">
        {isPlaying && ytId ? (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <iframe
              src={"https://www.youtube.com/embed/" + ytId + "?autoplay=1&rel=0"}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="relative cursor-pointer" onClick={() => ytId ? togglePlay(v.url) : onAction("open_url", { url: v.url })}>
            {v.thumbnail && (
              <img
                src={v.thumbnail}
                alt={v.title}
                className={"w-full object-cover " + (compact ? "h-32" : "h-auto max-h-56")}
                referrerPolicy="no-referrer"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className={"rounded-full bg-red-600/90 flex items-center justify-center shadow-lg hover:bg-red-500 transition-colors " + (compact ? "w-10 h-10" : "w-14 h-14")}>
                <LucideReact.Play className={(compact ? "w-5 h-5" : "w-7 h-7") + " text-white ml-0.5"} />
              </div>
            </div>
            {v.duration && (
              <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] text-white font-mono">
                {v.duration}
              </div>
            )}
          </div>
        )}
        <div className="px-3 py-2">
          <div className={"font-semibold text-gray-100 " + (compact ? "text-[11px] line-clamp-1" : "text-xs line-clamp-2")}>{v.title}</div>
          <div className="flex gap-1.5 mt-1 flex-wrap items-center">
            {v.publisher && <Badge variant="info">{v.publisher}</Badge>}
            {v.creator && <span className="text-[10px] text-gray-400">{v.creator}</span>}
            {v.age && <span className="text-[10px] text-gray-500">{v.age}</span>}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // VIEW 0: App Built (deep research delivered as custom app)
  // ═══════════════════════════════════════════
  if (isAppBuilt) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "#888" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>&#10024;</div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0" }}>Deep research experience ready</div>
        <div style={{ fontSize: "12px", marginTop: "4px" }}>Toggle to the App view above to see your custom interactive experience</div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // VIEW 1: Welcome
  // ═══════════════════════════════════════════
  if (isWelcome) {
    var handleSearch = () => {
      var t = topicInput.trim();
      if (t) onAction("search", { topic: t });
    };
    var allSuggestionGroups = [
      ["AI in healthcare", "CRISPR gene editing breakthroughs", "mRNA vaccine applications beyond COVID"],
      ["Remote work productivity studies", "Electric vehicles vs hydrogen fuel", "Quantum computing applications"],
      ["Mediterranean diet benefits", "Weight loss drugs GLP-1 long-term effects", "How the immune system works"],
      ["SpaceX Starship progress", "Nuclear fusion timeline", "Neuromorphic computing trends"],
      ["History of the Roman Empire", "How black holes form", "Sourdough fermentation science"],
      ["Renewable energy storage breakthroughs", "Cybersecurity AI-powered threats", "Microplastics in food chain"],
    ];
    // Rotate suggestions based on day to keep content fresh
    var dayIdx = Math.floor(Date.now() / 86400000) % allSuggestionGroups.length;
    var allSuggestions = [...allSuggestionGroups[dayIdx], ...allSuggestionGroups[(dayIdx + 1) % allSuggestionGroups.length]];
    var recentTopicNames = new Set(recentTopics.map((r) => (r.meta?.topic || "").toLowerCase()));
    var suggestions = allSuggestions.filter((s) => !recentTopicNames.has(s.toLowerCase()));
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <LucideReact.Search className="w-5 h-5 text-blue-400" />
            <div className="text-lg font-semibold text-gray-100">Research Assistant</div>
          </div>
          <div className="text-xs text-gray-400">Deep multi-angle web research with AI synthesis, multimedia & gap analysis</div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search any research topic..."
              value={topicInput}
              onChange={(val) => setTopicInput(val)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />}
            />
          </div>
          <Button variant="primary" onClick={handleSearch}>Research</Button>
        </div>

        {recentTopics.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <LucideReact.BookOpen className="w-3 h-3" /> Research Library ({recentTopics.length})
              </div>
              <button
                className="text-[11px] text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
                onClick={() => onAction("clear_all_history", {})}
              >
                <LucideReact.Trash2 className="w-3 h-3" /> Clear All
              </button>
            </div>
            <div className="space-y-1.5">
              {recentTopics.map((entry) => {
                var entryTopic = entry.meta?.topic || entry.id || "";
                var meta = entry.meta || {};
                var depthLabel = meta.depth || "";
                var srcCount = meta.sourceCount || 0;
                var findCount = meta.findingCount || 0;
                var preview = meta.summaryPreview || "";
                var age = timeAgo(entry.meta?.timestamp);
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg bg-gray-800/40 hover:bg-gray-700/50 cursor-pointer transition-colors group px-3 py-2"
                    onClick={() => onAction("search", { topic: entryTopic })}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-200 flex-1 min-w-0 truncate">{entryTopic}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {age && <span className="text-[10px] text-gray-600">{age}</span>}
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-600/50"
                          onClick={(e) => { e.stopPropagation(); onAction("delete_history", { topic: entryTopic }); }}
                        >
                          <LucideReact.X className="w-3 h-3 text-gray-500" />
                        </button>
                      </div>
                    </div>
                    {(srcCount > 0 || findCount > 0 || depthLabel) && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {depthLabel && <span className={"text-[9px] px-1.5 py-0.5 rounded " + (depthLabel === "deep" ? "bg-violet-500/15 text-violet-400" : "bg-gray-700/50 text-gray-500")}>{depthLabel}</span>}
                        {srcCount > 0 && <span className="text-[9px] text-gray-500">{srcCount} sources</span>}
                        {findCount > 0 && <span className="text-[9px] text-gray-500">{findCount} findings</span>}
                        {meta.hasBooks && <LucideReact.BookOpen className="w-2.5 h-2.5 text-indigo-400/50" />}
                        {meta.hasVideos && <LucideReact.Play className="w-2.5 h-2.5 text-red-400/50" />}
                        {meta.hasContradictions && <LucideReact.AlertTriangle className="w-2.5 h-2.5 text-amber-400/50" />}
                      </div>
                    )}
                    {preview && <div className="text-[11px] text-gray-500 mt-1 line-clamp-1">{preview}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">Suggested topics</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <Button key={s} variant="outline" onClick={() => onAction("search", { topic: s, depth: "standard" })}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }


  // ═══════════════════════════════════════════
  // VIEW 3: Deep Dive
  // ═══════════════════════════════════════════
  if (isDeepDive) {
    var subtopic = String(data?.subtopic ?? "");
    var content = String(data?.content ?? "");
    var bullets = Array.isArray(data?.bullets) ? data.bullets : [];
    var relatedSubtopics = Array.isArray(data?.relatedSubtopics) ? data.relatedSubtopics : [];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => onAction("search", { topic })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <Badge variant="default">{topic}</Badge>
        </div>
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 rounded-lg overflow-hidden">
            {images.filter((img) => !imgErrors[img.url]).slice(0, 3).map((img, i) => (
              <div key={i} className="h-24 overflow-hidden bg-gray-800">
                <img src={img.url} alt={img.title} className="w-full h-full object-cover" onError={() => handleImgError(img.url)} referrerPolicy="no-referrer" />
              </div>
            ))}
          </div>
        )}
        <Stat label="Deep Dive" value={subtopic} accent="purple" />
        <UICard accent="purple">
          <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{content}</div>
        </UICard>
        {bullets.length > 0 && (
          <UICard header="Key Points">
            <div className="space-y-1.5">
              {bullets.map((b, i) => (
                <div key={i} className="flex gap-2 text-sm text-gray-300">
                  <LucideReact.ChevronRight className="w-3.5 h-3.5 mt-0.5 text-purple-400 shrink-0" />
                  <span>{String(b)}</span>
                </div>
              ))}
            </div>
          </UICard>
        )}
        {relatedSubtopics.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">Explore further</div>
            <div className="flex flex-wrap gap-1.5">
              {relatedSubtopics.map((st) => (
                <Button key={st} variant="outline" onClick={() => onAction("deep_dive", { topic, subtopic: st })}>
                  {String(st)}
                </Button>
              ))}
            </div>
          </div>
        )}
        {sources.length > 0 && (
          <Accordion items={[{
            value: "sources",
            title: "Sources (" + sources.length + ")",
            content: (
              <div className="space-y-1">
                {sources.slice(0, 10).map((s, i) => {
                  var trust = getSourceTrust(s.domain);
                  return (
                    <div key={i} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-800/30 rounded px-1 transition-colors" onClick={() => s.url && onAction("open_url", { url: s.url })}>
                      <span className="text-[10px] text-gray-500 font-mono w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-blue-400 truncate">{String(s.title)}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">{String(s.domain)}</span>
                          {trust && <span className={"text-[9px] px-1 py-0.5 rounded " + trust.bg + " " + trust.color}>{trust.label}</span>}
                        </div>
                      </div>
                      <LucideReact.ExternalLink className="w-3 h-3 text-gray-600 shrink-0" />
                    </div>
                  );
                })}
              </div>
            ),
          }]} />
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Ask a follow-up question..."
            value={followUpInput}
            onChange={(val) => setFollowUpInput(val)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && followUpInput.trim()) {
                onAction("follow_up", { topic, question: followUpInput.trim() });
                setFollowUpInput("");
              }
            }}
            icon={<LucideReact.MessageCircle className="w-3.5 h-3.5" />}
          />
          <Button variant="primary" onClick={() => {
            if (followUpInput.trim()) {
              onAction("follow_up", { topic, question: followUpInput.trim() });
              setFollowUpInput("");
            }
          }}>Ask</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // VIEW 4: Comparison
  // ═══════════════════════════════════════════
  if (isCompare) {
    var topicA = String(data?.topicA ?? "");
    var topicB = String(data?.topicB ?? "");
    var similarities = Array.isArray(data?.similarities) ? data.similarities : [];
    var differences = Array.isArray(data?.differences) ? data.differences : [];
    var tradeoffs = Array.isArray(data?.tradeoffs) ? data.tradeoffs : [];
    var verdict = String(data?.verdict ?? "");
    var parentTopic = topicA || topic;

    var ComparisonList = ({ items, accent }) => (
      <div className="space-y-2">
        {items.map((item, i) => (
          <UICard key={i} accent={accent}>
            <div className="text-xs font-semibold text-gray-200">{String(item.aspect)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{String(item.detail)}</div>
          </UICard>
        ))}
        {items.length === 0 && <EmptyState icon={<LucideReact.Minus className="w-5 h-5" />} title="No data" description="No comparison data available" />}
      </div>
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => onAction("search", { topic: parentTopic })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        </div>
        <Stat label="Comparison" value={topicA + "  vs  " + topicB} accent="amber" />
        <Tabs
          tabs={[
            { value: "similarities", label: "Similarities (" + similarities.length + ")" },
            { value: "differences", label: "Differences (" + differences.length + ")" },
            { value: "tradeoffs", label: "Trade-offs (" + tradeoffs.length + ")" },
          ]}
          defaultValue="differences"
          variant="pills"
        >
          {(tab) => {
            if (tab === "similarities") return <ComparisonList items={similarities} accent="emerald" />;
            if (tab === "differences") return <ComparisonList items={differences} accent="rose" />;
            return <ComparisonList items={tradeoffs} accent="amber" />;
          }}
        </Tabs>
        {verdict && (
          <UICard accent="blue" header="Verdict">
            <div className="text-sm text-gray-200">{verdict}</div>
          </UICard>
        )}
        {sources.length > 0 && (
          <Accordion items={[{
            value: "sources",
            title: "Sources (" + sources.length + ")",
            content: (
              <div className="space-y-1">
                {sources.slice(0, 10).map((s, i) => {
                  var trust = getSourceTrust(s.domain);
                  return (
                    <div key={i} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-800/30 rounded px-1 transition-colors" onClick={() => s.url && onAction("open_url", { url: s.url })}>
                      <span className="text-[10px] text-gray-500 font-mono w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-blue-400 truncate">{String(s.title)}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">{String(s.domain)}</span>
                          {trust && <span className={"text-[9px] px-1 py-0.5 rounded " + trust.bg + " " + trust.color}>{trust.label}</span>}
                        </div>
                      </div>
                      <LucideReact.ExternalLink className="w-3 h-3 text-gray-600 shrink-0" />
                    </div>
                  );
                })}
              </div>
            ),
          }]} />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // VIEW 5: Follow-up
  // ═══════════════════════════════════════════
  if (isFollowUp) {
    var question = String(data?.question ?? "");
    var answer = String(data?.answer ?? "");
    var suggestedFollowUps = Array.isArray(data?.suggestedFollowUps) ? data.suggestedFollowUps : [];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => onAction("search", { topic })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <Badge variant="default">{topic}</Badge>
        </div>
        <UICard accent="cyan" header="Question">
          <div className="text-sm text-gray-200 font-medium">{question}</div>
        </UICard>
        <UICard accent="emerald" header="Answer">
          <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{answer}</div>
        </UICard>
        {suggestedFollowUps.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">Ask next</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestedFollowUps.map((q) => (
                <Button key={q} variant="outline" onClick={() => onAction("follow_up", { topic, question: q })}>
                  {String(q)}
                </Button>
              ))}
            </div>
          </div>
        )}
        {sources.length > 0 && (
          <Accordion items={[{
            value: "sources",
            title: "Sources (" + sources.length + ")",
            content: (
              <div className="space-y-1">
                {sources.slice(0, 10).map((s, i) => {
                  var trust = getSourceTrust(s.domain);
                  return (
                    <div key={i} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-800/30 rounded px-1 transition-colors" onClick={() => s.url && onAction("open_url", { url: s.url })}>
                      <span className="text-[10px] text-gray-500 font-mono w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-blue-400 truncate">{String(s.title)}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">{String(s.domain)}</span>
                          {trust && <span className={"text-[9px] px-1 py-0.5 rounded " + trust.bg + " " + trust.color}>{trust.label}</span>}
                        </div>
                      </div>
                      <LucideReact.ExternalLink className="w-3 h-3 text-gray-600 shrink-0" />
                    </div>
                  );
                })}
              </div>
            ),
          }]} />
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Ask another question..."
            value={followUpInput}
            onChange={(val) => setFollowUpInput(val)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && followUpInput.trim()) {
                onAction("follow_up", { topic, question: followUpInput.trim() });
                setFollowUpInput("");
              }
            }}
            icon={<LucideReact.MessageCircle className="w-3.5 h-3.5" />}
          />
          <Button variant="primary" onClick={() => {
            if (followUpInput.trim()) {
              onAction("follow_up", { topic, question: followUpInput.trim() });
              setFollowUpInput("");
            }
          }}>Ask</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // VIEW 2: Research Overview — progressive rendering
  // ═══════════════════════════════════════════

  // Count media for tab labels
  var recVideos = recommendedVideos.map((rv) => videos[rv.index]).filter(Boolean);
  var otherVideos = videos.filter((_, i) => !recommendedVideos.some((rv) => rv.index === i));
  var hasMedia = videos.length > 0 || books.length > 0 || movies.length > 0;
  var mediaCount = videos.length + books.length + movies.length;

  // Build tab list dynamically
  var tabList = [
    { value: "overview", label: "Overview" },
    ...(sections.length > 0 || !hasSynthesis ? [{ value: "sections", label: "Sections" + (sections.length > 0 ? " (" + sections.length + ")" : "") }] : []),
    ...(hasMedia || !hasSynthesis ? [{ value: "media", label: "Media" + (mediaCount > 0 ? " (" + mediaCount + ")" : "") }] : []),
    { value: "sources", label: "Sources" + (sources.length > 0 ? " (" + sources.length + ")" : "") },
  ];

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <LucideReact.BookOpen className="w-5 h-5 text-blue-400 shrink-0" />
          <div className="text-base font-semibold text-gray-100 truncate">{topic}</div>
        </div>
        <div className="flex gap-1 sm:gap-1.5 shrink-0 flex-wrap justify-end">
          {isComplete && data?.depth !== "deep" && !data?.metadata?.isDeepResearch && !data?.hasDeepResearch && (
            <Button variant="ghost" onClick={() => onAction("search", { topic, depth: "deep" })}>
              <LucideReact.Sparkles className="w-3.5 h-3.5 text-violet-400" /> <span className="hidden sm:inline">Deep</span>
            </Button>
          )}
          {isComplete && narrative && (
            <Button variant="ghost" onClick={() => {
              var reportText = "# " + topic + "\\n\\n" + summary + "\\n\\n" + (keyFindings.length > 0 ? "## Key Findings\\n" + keyFindings.map(function(f, i) { return (i + 1) + ". [" + f.type + "] " + f.text; }).join("\\n") + "\\n\\n" : "") + "## Analysis\\n\\n" + narrative + "\\n\\n" + (sections.length > 0 ? sections.map(function(s) { return "### " + s.title + "\\n" + (s.summary || "") + "\\n" + (s.bullets || []).map(function(b) { return "- " + b; }).join("\\n"); }).join("\\n\\n") + "\\n\\n" : "") + "## Sources\\n" + sources.map(function(s, i) { return "[" + (i + 1) + "] " + s.title + " — " + s.url; }).join("\\n");
              onAction("__copy_text", { text: reportText, label: "Full Report (Markdown)" });
            }}>
              <LucideReact.FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copy</span>
            </Button>
          )}
          {isComplete && (
            <Button variant="ghost" onClick={() => onAction("send_report", { topic })}>
              <LucideReact.Mail className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Email</span>
            </Button>
          )}
          {isComplete && (
            <Button variant="ghost" onClick={() => onAction("search", { topic: "" })}>
              <LucideReact.Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Phase indicator with progress ── */}
      {isLoading && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <div className="flex-1">
            <div className="text-sm text-blue-300">{phaseLabels[phase] || "Working..."}</div>
            <div className="text-[10px] text-blue-400/50 mt-0.5">
              {sources.length > 0 && <span>{sources.length} sources found</span>}
              {searchQueries.length > 0 && sources.length > 0 && <span> · </span>}
              {searchQueries.length > 0 && <span>{searchQueries.length} queries</span>}
            </div>
          </div>
          {/* Phase progress dots */}
          <div className="flex gap-1 shrink-0">
            {["generating_queries", "searching", "synthesizing"].map((p, i) => {
              var phaseOrder = ["generating_queries", "searching", "sources", "synthesizing", "gap_checking"];
              var currentIdx = phaseOrder.indexOf(phase);
              var thisIdx = [0, 1, 3].indexOf(i) >= 0 ? i : i;
              var dotPhases = [0, 1, 3]; // indices in phaseOrder
              var isDone = currentIdx > dotPhases[i];
              var isCurrent = currentIdx === dotPhases[i] || (i === 1 && currentIdx === 2);
              return (
                <div key={i} className={"w-1.5 h-1.5 rounded-full " + (isDone ? "bg-blue-400" : isCurrent ? "bg-blue-400 animate-pulse" : "bg-gray-600")} />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Complete status badges ── */}
      {isComplete && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {data?.depth && <Badge variant={data.depth === "deep" ? "info" : "outline"}>{String(data.depth)}</Badge>}
            <Badge variant="success">{sources.length} sources</Badge>
            {keyFindings.length > 0 && <Badge variant="info">{keyFindings.length} findings</Badge>}
            {sections.length > 0 && <Badge variant="default">{sections.length} sections</Badge>}
            {contradictions.length > 0 && <Badge variant="warning">{contradictions.length} contradictions</Badge>}
            {gapQueries.length > 0 && <Badge variant="default">gap-checked</Badge>}
            {wordCount > 50 && <span className="flex items-center gap-1 text-[10px] text-gray-500"><LucideReact.Clock className="w-3 h-3" />{readingMinutes} min read</span>}
            {data?.fromHistory && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <LucideReact.BookOpen className="w-3 h-3" /> from library
                <button className="text-blue-400 hover:text-blue-300 ml-1" onClick={() => onAction("search", { topic, depth: data?.depth || "standard", force: true })}>refresh</button>
              </span>
            )}
          </div>
          {(Object.keys(sourceTypeCounts).length > 1 || keyFindings.length >= 3) && (
            <div className="flex items-center gap-3 flex-wrap">
              {Object.keys(sourceTypeCounts).length > 1 && (
                <div className="flex items-center gap-1">
                  {Object.entries(sourceTypeCounts).map(function(entry) {
                    var typeColors = { Academic: "text-purple-400 bg-purple-500/10", Gov: "text-emerald-400 bg-emerald-500/10", Reference: "text-blue-400 bg-blue-500/10", News: "text-cyan-400 bg-cyan-500/10", Web: "text-gray-400 bg-gray-500/10" };
                    return (
                      <span key={entry[0]} className={"text-[9px] px-1.5 py-0.5 rounded " + (typeColors[entry[0]] || "text-gray-400 bg-gray-500/10")}>
                        {entry[0]} {entry[1]}
                      </span>
                    );
                  })}
                </div>
              )}
              {keyFindings.length >= 3 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-gray-500">Confidence:</span>
                  <div className="flex items-center gap-0.5">
                    <div className="w-16 h-1.5 rounded-full bg-gray-700 overflow-hidden flex">
                      {confidenceDist.high > 0 && <div className="h-full bg-emerald-400" style={{ width: (confidenceDist.high / keyFindings.length * 100) + "%" }} />}
                      {confidenceDist.medium > 0 && <div className="h-full bg-amber-400" style={{ width: (confidenceDist.medium / keyFindings.length * 100) + "%" }} />}
                      {confidenceDist.low > 0 && <div className="h-full bg-gray-500" style={{ width: (confidenceDist.low / keyFindings.length * 100) + "%" }} />}
                    </div>
                    <span className="text-[9px] text-gray-500">{confidenceScore}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Search queries pills (visible during searching, sources, synthesizing, gap_checking) ── */}
      {searchQueries.length > 0 && !hasSynthesis && !isComplete && (
        <div className="flex flex-wrap gap-1.5">
          {searchQueries.map((q, i) => (
            <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700/50">
              {q}
            </span>
          ))}
        </div>
      )}

      {/* ── Sources list (stays visible through searching → sources → synthesizing → gap_checking, no flash) ── */}
      {!hasSynthesis && !isComplete && (
        <div className="space-y-1.5">
          {sources.length > 0 ? sources.slice(0, 8).map((s, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800/30">
              <span className="text-[10px] text-gray-500 font-mono w-4">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-blue-400 truncate">{String(s.title)}</div>
                <div className="text-[10px] text-gray-500">{String(s.domain)}</div>
              </div>
            </div>
          )) : (
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          SYNTHESIZED / COMPLETE CONTENT
         ══════════════════════════════════════ */}
      {hasSynthesis && (
        <>
          {/* ── Summary preview (brief context before findings) ── */}
          {summary && (
            <div className="text-sm text-gray-300 leading-relaxed bg-gray-800/30 rounded-lg px-3 py-2.5 border-l-2 border-blue-500/40">
              {summary}
            </div>
          )}

          {/* ── Full-text search ── */}
          {isComplete && (keyFindings.length > 3 || sections.length > 2 || sources.length > 5) && (
            <div className="space-y-2">
              <div className="relative">
                <Input
                  placeholder="Search findings, sections, sources..."
                  value={searchText}
                  onChange={function(val) { setSearchText(val); }}
                  icon={<LucideReact.Search className="w-3.5 h-3.5" />}
                />
                {searchText.length > 0 && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-700/50"
                    onClick={function() { setSearchText(""); }}
                  >
                    <LucideReact.X className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
              {searchMatches && searchMatches.total > 0 && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-300">{searchMatches.total} matches found</span>
                    <button className="text-[10px] text-gray-500 hover:text-gray-300" onClick={function() { setSearchText(""); }}>Clear</button>
                  </div>
                  {searchMatches.findings.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Findings ({searchMatches.findings.length})</div>
                      {searchMatches.findings.map(function(fi) {
                        var f = keyFindings[fi];
                        return (
                          <div key={fi} className="flex items-start gap-2 px-2 py-1.5 rounded bg-gray-800/30">
                            <Badge variant={findingVariant[f.type] || "default"}>{String(f.type)}</Badge>
                            <div className="text-xs text-gray-300 flex-1">{highlightMatch(f.text, searchText)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {searchMatches.sections.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Sections ({searchMatches.sections.length})</div>
                      {searchMatches.sections.map(function(si) {
                        var s = sections[si];
                        return (
                          <div key={si} className="px-2 py-1.5 rounded bg-gray-800/30 cursor-pointer hover:bg-gray-700/40" onClick={function() { onAction("deep_dive", { topic: topic, subtopic: s.title }); }}>
                            <div className="text-xs text-blue-400 font-medium">{highlightMatch(s.title, searchText)}</div>
                            {s.summary && <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{highlightMatch(s.summary, searchText)}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {searchMatches.sources.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Sources ({searchMatches.sources.length})</div>
                      {searchMatches.sources.slice(0, 5).map(function(si) {
                        var s = sources[si];
                        return (
                          <div key={si} className="px-2 py-1.5 rounded bg-gray-800/30 cursor-pointer hover:bg-gray-700/40" onClick={function() { s.url && onAction("open_url", { url: s.url }); }}>
                            <div className="text-xs text-blue-400">{highlightMatch(s.title, searchText)}</div>
                            <div className="text-[10px] text-gray-500">{String(s.domain)}</div>
                          </div>
                        );
                      })}
                      {searchMatches.sources.length > 5 && (
                        <div className="text-[10px] text-gray-500 px-2">+{searchMatches.sources.length - 5} more sources</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {searchMatches && searchMatches.total === 0 && (
                <div className="text-xs text-gray-500 text-center py-2">No matches found</div>
              )}
            </div>
          )}

          {/* ── Key Findings (prominent, findings-first) ── */}
          {keyFindings.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <LucideReact.Lightbulb className="w-3 h-3" /> Key Findings
                  <button
                    className="ml-1 p-1 rounded hover:bg-gray-700/50 transition-opacity opacity-30 hover:opacity-100"
                    onClick={function() {
                      var text = keyFindings.map(function(f, i) { return (i + 1) + ". [" + f.type + "/" + f.confidence + "] " + f.text; }).join("\\n");
                      onAction("__copy_text", { text: text, label: "All Findings" });
                    }}
                    title="Copy all findings"
                  >
                    <LucideReact.Copy className="w-3 h-3" />
                  </button>
                </div>
                {keyFindings.length > 3 && (
                  <div className="flex items-center gap-1">
                    {[
                      { key: "all", label: "All", count: keyFindings.length },
                      { key: "fact", label: "Facts", count: findingCounts.fact },
                      { key: "trend", label: "Trends", count: findingCounts.trend },
                      { key: "insight", label: "Insights", count: findingCounts.insight },
                      { key: "warning", label: "Warnings", count: findingCounts.warning },
                    ].filter(function(f) { return f.key === "all" || f.count > 0; }).map(function(f) {
                      var isActive = findingFilter === f.key;
                      var activeColors = { all: "bg-gray-600 text-gray-100", fact: "bg-emerald-500/20 text-emerald-300", trend: "bg-blue-500/20 text-blue-300", insight: "bg-purple-500/20 text-purple-300", warning: "bg-amber-500/20 text-amber-300" };
                      return (
                        <button
                          key={f.key}
                          onClick={function() { setFindingFilter(findingFilter === f.key ? "all" : f.key); }}
                          className={"text-[10px] px-2 py-0.5 rounded-full transition-colors " + (isActive ? (activeColors[f.key] || "bg-gray-600 text-gray-100") : "bg-gray-800/50 text-gray-500 hover:text-gray-300")}
                        >
                          {f.label}{f.count > 0 && f.key !== "all" ? " " + f.count : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: filteredFindings.length === 1 ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {filteredFindings.map(function(f) {
                  var originalIdx = keyFindings.indexOf(f);
                  return (
                  <UICard key={originalIdx} accent={findingAccent[f.type] || "blue"}>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-800/50 w-5 h-5 rounded-full flex items-center justify-center shrink-0">{originalIdx + 1}</span>
                        <Badge variant={findingVariant[f.type] || "default"}>{String(f.type)}</Badge>
                        <Badge variant={confidenceVariant[f.confidence] || "outline"}>{String(f.confidence)}</Badge>
                        <button
                          className="ml-auto p-0.5 rounded hover:bg-gray-700/50 transition-opacity"
                          style={{ opacity: 0.3 }}
                          onMouseEnter={function(e) { e.currentTarget.style.opacity = "1"; }}
                          onMouseLeave={function(e) { e.currentTarget.style.opacity = "0.3"; }}
                          onClick={function(e) { e.stopPropagation(); onAction("__copy_text", { text: String(f.text), label: "Finding" }); }}
                        >
                          <LucideReact.Copy className="w-3 h-3 text-gray-500" />
                        </button>
                      </div>
                      <div className="text-sm text-gray-200 leading-relaxed">
                        {String(f.text)}
                        <SourceRefs refs={f.sourceRefs} />
                      </div>
                      {findingSectionMap[originalIdx] && findingSectionMap[originalIdx].length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          <LucideReact.Layers className="w-2.5 h-2.5 text-gray-600 shrink-0" />
                          {findingSectionMap[originalIdx].map(function(si) {
                            var sTitle = String(sections[si].title);
                            return (
                              <button key={si} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/30 text-gray-500 hover:text-blue-300 hover:bg-blue-500/10 transition-colors" onClick={function(e) { e.stopPropagation(); onAction("deep_dive", { topic: topic, subtopic: sections[si].title }); }}>
                                {sTitle.length > 30 ? sTitle.slice(0, 28) + "..." : sTitle}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </UICard>
                  );
                })}
              </div>
              {filteredFindings.length === 0 && findingFilter !== "all" && (
                <div className="text-xs text-gray-500 text-center py-2">
                  No {findingFilter} findings. <button className="text-blue-400 hover:text-blue-300" onClick={function() { setFindingFilter("all"); }}>Show all</button>
                </div>
              )}
            </div>
          )}

          {/* ── Contradictions ── */}
          {contradictions.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <LucideReact.AlertTriangle className="w-3 h-3 text-amber-400" /> Contradictions Found
              </div>
              {contradictions.map((c, i) => (
                <UICard key={i} accent="amber">
                  <div className="space-y-1.5">
                    <div className="text-sm font-medium text-amber-200">{String(c.claim)}</div>
                    <div className="space-y-1">
                      {(c.perspectives || []).map((p, pi) => (
                        <div key={pi} className="flex gap-2 text-xs text-gray-300">
                          <LucideReact.MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-gray-500" />
                          <span>{String(p)}</span>
                        </div>
                      ))}
                    </div>
                    <SourceRefs refs={c.sourceRefs} />
                  </div>
                </UICard>
              ))}
            </div>
          )}

          <Separator />

          {/* ── Tabbed content ── */}
          <Tabs tabs={tabList} defaultValue="overview" variant="underline">
            {(tab) => {
              // ── OVERVIEW TAB ──
              if (tab === "overview") {
                var inlineImages = galleryImages.slice(0, 3);
                var imgInsertIdx = Math.max(1, Math.floor(narrativeParagraphs.length / 3));
                return (
                  <div className="space-y-4 pt-2">
                    {/* Hero image */}
                    {heroImage && !imgErrors[heroImage.url] && (
                      <div className="w-full h-40 overflow-hidden rounded-lg cursor-pointer" onClick={() => onAction("open_url", { url: heroImage.pageUrl || heroImage.url })}>
                        <img src={heroImage.url} alt={heroImage.title} className="w-full h-full object-cover" onError={() => handleImgError(heroImage.url)} referrerPolicy="no-referrer" />
                      </div>
                    )}

                    {/* Narrative with collapse for long content */}
                    {narrativeParagraphs.length > 0 ? (() => {
                      var isLong = narrativeParagraphs.length > NARRATIVE_COLLAPSE_THRESHOLD;
                      var visibleParagraphs = isLong && !narrativeExpanded ? narrativeParagraphs.slice(0, NARRATIVE_COLLAPSE_THRESHOLD) : narrativeParagraphs;
                      return (
                        <div className="space-y-3">
                          {visibleParagraphs.map((p, pi) => (
                            <Fragment key={pi}>
                              <div className="text-sm text-gray-200 leading-relaxed">{p}</div>
                              {pi === imgInsertIdx - 1 && inlineImages.length > 1 && (
                                <div className={"grid gap-2 rounded-lg overflow-hidden " + (inlineImages.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                                  {inlineImages.slice(1).map((img, ii) => (
                                    <div key={ii} className="relative group overflow-hidden rounded-lg bg-gray-800 cursor-pointer" onClick={() => onAction("open_url", { url: img.pageUrl || img.url })}>
                                      <img src={img.url} alt={img.title} className="w-full h-24 object-cover" onError={() => handleImgError(img.url)} referrerPolicy="no-referrer" />
                                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                        <div className="text-[10px] text-gray-200 truncate">{img.title}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </Fragment>
                          ))}
                          {isLong && !narrativeExpanded && (
                            <button
                              onClick={() => setNarrativeExpanded(true)}
                              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              <LucideReact.ChevronDown className="w-3.5 h-3.5" />
                              Read more ({narrativeParagraphs.length - NARRATIVE_COLLAPSE_THRESHOLD} more paragraphs)
                            </button>
                          )}
                          {isLong && narrativeExpanded && (
                            <button
                              onClick={() => setNarrativeExpanded(false)}
                              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                            >
                              <LucideReact.ChevronUp className="w-3.5 h-3.5" />
                              Show less
                            </button>
                          )}
                        </div>
                      );
                    })() : summary ? (
                      <div className="text-sm text-gray-200 leading-relaxed">{summary}</div>
                    ) : null}

                    {/* Section preview cards */}
                    {sections.length > 0 && isComplete && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <LucideReact.Layers className="w-3 h-3" /> Research Sections ({sections.length})
                        </div>
                        <div className="space-y-1.5">
                          {sections.map(function(s, i) {
                            var isSecExpanded = expandedSectionPreview === i;
                            var bulletCount = (s.bullets || []).length;
                            var relatedFindings = sectionFindingCounts[i] || 0;
                            var refCount = (s.sourceRefs || []).length;
                            return (
                              <div key={i} className="rounded-lg bg-gray-800/30 border border-gray-700/30 overflow-hidden">
                                <div
                                  className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700/20 transition-colors"
                                  onClick={function() { setExpandedSectionPreview(isSecExpanded ? null : i); }}
                                >
                                  <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-[10px] text-blue-400 font-mono font-bold">{i + 1}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-gray-200">{String(s.title)}</div>
                                    {s.summary && !isSecExpanded && (
                                      <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{String(s.summary)}</div>
                                    )}
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {bulletCount > 0 && <span className="text-[9px] text-gray-500">{bulletCount} points</span>}
                                      {relatedFindings > 0 && <span className="text-[9px] text-amber-400/70">{relatedFindings} findings</span>}
                                      {refCount > 0 && <span className="text-[9px] text-gray-600">{refCount} sources</span>}
                                    </div>
                                  </div>
                                  <LucideReact.ChevronDown className={"w-3.5 h-3.5 text-gray-500 transition-transform shrink-0 mt-1 " + (isSecExpanded ? "rotate-180" : "")} />
                                </div>
                                {isSecExpanded && (
                                  <div className="px-3 pb-2.5 border-t border-gray-700/20 pt-2 space-y-2">
                                    {s.summary && <div className="text-xs text-gray-400 italic">{String(s.summary)}</div>}
                                    {bulletCount > 0 && (
                                      <div className="space-y-1">
                                        {(s.bullets || []).slice(0, 4).map(function(b, bi) {
                                          return (
                                            <div key={bi} className="flex gap-1.5 text-[11px] text-gray-300">
                                              <LucideReact.ChevronRight className="w-3 h-3 mt-0.5 text-blue-400 shrink-0" />
                                              <span>{String(b)}</span>
                                            </div>
                                          );
                                        })}
                                        {bulletCount > 4 && <div className="text-[10px] text-gray-600 pl-4">+{bulletCount - 4} more points</div>}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <SourceRefs refs={s.sourceRefs} />
                                      <Button variant="outline" onClick={function() { onAction("deep_dive", { topic: topic, subtopic: s.title }); }}>
                                        <LucideReact.ArrowRight className="w-3 h-3" /> Deep Dive
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <Input
                            placeholder="Explore a custom subtopic..."
                            value={deepDiveInput}
                            onChange={function(val) { setDeepDiveInput(val); }}
                            onKeyDown={function(e) {
                              if (e.key === "Enter" && deepDiveInput.trim()) {
                                onAction("deep_dive", { topic: topic, subtopic: deepDiveInput.trim() });
                                setDeepDiveInput("");
                              }
                            }}
                            icon={<LucideReact.Compass className="w-3.5 h-3.5" />}
                          />
                          <Button variant="outline" onClick={function() {
                            if (deepDiveInput.trim()) {
                              onAction("deep_dive", { topic: topic, subtopic: deepDiveInput.trim() });
                              setDeepDiveInput("");
                            }
                          }}>Dive</Button>
                        </div>
                      </div>
                    )}

                    {/* Recommended videos inline */}
                    {recVideos.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <LucideReact.Star className="w-3 h-3 text-amber-400" /> Recommended Videos
                        </div>
                        {recVideos.slice(0, 2).map((v, i) => (
                          <div key={i}>
                            <VideoCard v={v} />
                            {recommendedVideos[i]?.reason && (
                              <div className="text-[11px] text-gray-400 mt-1 px-1 italic">{recommendedVideos[i].reason}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ask a follow-up question..."
                          value={followUpInput}
                          onChange={(val) => setFollowUpInput(val)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && followUpInput.trim()) {
                              onAction("follow_up", { topic, question: followUpInput.trim() });
                              setFollowUpInput("");
                            }
                          }}
                          icon={<LucideReact.MessageCircle className="w-3.5 h-3.5" />}
                        />
                        <Button variant="primary" onClick={() => {
                          if (followUpInput.trim()) {
                            onAction("follow_up", { topic, question: followUpInput.trim() });
                            setFollowUpInput("");
                          }
                        }}>Ask</Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder={"Compare " + topic + " with..."}
                          value={compareInput}
                          onChange={(val) => setCompareInput(val)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && compareInput.trim()) {
                              onAction("compare", { topicA: topic, topicB: compareInput.trim() });
                              setCompareInput("");
                            }
                          }}
                          icon={<LucideReact.GitCompare className="w-3.5 h-3.5" />}
                        />
                        <Button variant="outline" onClick={() => {
                          if (compareInput.trim()) {
                            onAction("compare", { topicA: topic, topicB: compareInput.trim() });
                            setCompareInput("");
                          }
                        }}>Compare</Button>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── SECTIONS TAB ──
              if (tab === "sections") {
                if (sections.length === 0) {
                  return <EmptyState icon={<LucideReact.Layers className="w-6 h-6" />} title="No sections" description="Sections will appear once synthesis completes" />;
                }
                var getSectionImage = (sIdx) => {
                  var img = images.find((i) => i.sectionIdx === sIdx);
                  return img && !imgErrors[img.url] ? img : null;
                };
                return (
                  <div className="space-y-2 pt-2">
                    <Accordion
                      items={sections.map((s, i) => ({
                        value: "sec-" + i,
                        title: String(s.title),
                        content: (
                          <div className="space-y-2">
                            {(() => {
                              var secImg = getSectionImage(i);
                              return secImg ? (
                                <div className="w-full h-28 overflow-hidden rounded-lg">
                                  <img src={secImg.url} alt={secImg.title} className="w-full h-full object-cover" onError={() => handleImgError(secImg.url)} referrerPolicy="no-referrer" />
                                </div>
                              ) : null;
                            })()}
                            {s.summary && <div className="text-xs text-gray-400 italic">{String(s.summary)}</div>}
                            {Array.isArray(s.bullets) && s.bullets.length > 0 && (
                              <div className="space-y-1">
                                {s.bullets.map((b, bi) => (
                                  <div key={bi} className="flex gap-2 text-sm text-gray-300">
                                    <LucideReact.ChevronRight className="w-3.5 h-3.5 mt-0.5 text-blue-400 shrink-0" />
                                    <span>{String(b)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <SourceRefs refs={s.sourceRefs} />
                              <Button variant="outline" onClick={() => onAction("deep_dive", { topic, subtopic: s.title })}>
                                <LucideReact.ArrowRight className="w-3 h-3" /> Deep Dive
                              </Button>
                            </div>
                          </div>
                        ),
                      }))}
                      type="multiple"
                    />
                  </div>
                );
              }

              // ── MEDIA TAB ──
              if (tab === "media") {
                if (!hasMedia && isComplete) {
                  return <EmptyState icon={<LucideReact.Film className="w-6 h-6" />} title="No media found" description="No videos, books, or related media discovered" />;
                }
                return (
                  <div className="space-y-4 pt-2">
                    {/* Recommended videos */}
                    {recVideos.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <LucideReact.Star className="w-3 h-3 text-amber-400" /> Recommended ({recVideos.length})
                        </div>
                        {recVideos.map((v, i) => (
                          <div key={i}>
                            <VideoCard v={v} />
                            {recommendedVideos[i]?.reason && (
                              <div className="text-[11px] text-gray-400 mt-1 px-1 italic">{recommendedVideos[i].reason}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* All videos */}
                    {otherVideos.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <LucideReact.Play className="w-3 h-3" /> Videos ({otherVideos.length})
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {otherVideos.map((v, i) => (
                            <VideoCard key={i} v={v} compact />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Books */}
                    {books.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <LucideReact.BookOpen className="w-3 h-3 text-indigo-400" /> Books ({books.length})
                        </div>
                        {books.map((b, i) => {
                          var bookUrl = b.url || "https://www.google.com/search?q=" + encodeURIComponent(b.title + (b.author ? " " + b.author : "") + " book");
                          return (
                          <UICard key={i} accent="indigo">
                            <div className="flex gap-3 cursor-pointer" onClick={() => onAction("open_url", { url: bookUrl })}>
                              <div className="w-8 h-12 bg-indigo-900/30 rounded flex items-center justify-center shrink-0">
                                <LucideReact.BookOpen className="w-4 h-4 text-indigo-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-100">{b.title}</div>
                                <div className="text-[11px] text-gray-400">{b.author}{b.year ? " (" + b.year + ")" : ""}</div>
                                {b.description && <div className="text-xs text-gray-400 mt-1">{b.description}</div>}
                              </div>
                              <div className="flex items-center shrink-0">
                                <LucideReact.ExternalLink className="w-3 h-3 text-gray-500" />
                              </div>
                            </div>
                          </UICard>
                          );
                        })}
                      </div>
                    )}

                    {/* Movies / TV / Documentaries / Podcasts */}
                    {movies.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <LucideReact.Film className="w-3 h-3 text-rose-400" /> Movies & Shows ({movies.length})
                        </div>
                        {movies.map((m, i) => {
                          var typeAccent = { movie: "rose", tv: "cyan", documentary: "teal", podcast: "orange" };
                          var typeIcon = { movie: "Film", tv: "Monitor", documentary: "Clapperboard", podcast: "Mic" };
                          var IconComp = LucideReact[typeIcon[m.type]] || LucideReact.Film;
                          var searchSuffix = { movie: "movie", tv: "tv show", documentary: "documentary", podcast: "podcast" };
                          var movieUrl = m.url || "https://www.google.com/search?q=" + encodeURIComponent(m.title + (m.year ? " " + m.year : "") + " " + (searchSuffix[m.type] || "movie"));
                          return (
                            <UICard key={i} accent={typeAccent[m.type] || "rose"}>
                              <div className="flex gap-3 cursor-pointer" onClick={() => onAction("open_url", { url: movieUrl })}>
                                <div className="w-8 h-12 bg-gray-800/50 rounded flex items-center justify-center shrink-0">
                                  <IconComp className="w-4 h-4 text-gray-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-medium text-gray-100">{m.title}</div>
                                    {m.year && <span className="text-[10px] text-gray-500">({m.year})</span>}
                                  </div>
                                  <Badge variant={m.type === "documentary" ? "info" : m.type === "podcast" ? "warning" : "default"}>{m.type}</Badge>
                                  {m.description && <div className="text-xs text-gray-400 mt-1">{m.description}</div>}
                                </div>
                                <div className="flex items-center shrink-0">
                                  <LucideReact.ExternalLink className="w-3 h-3 text-gray-500" />
                                </div>
                              </div>
                            </UICard>
                          );
                        })}
                      </div>
                    )}

                    {/* Image gallery */}
                    {galleryImages.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <LucideReact.Image className="w-3 h-3" /> Images ({galleryImages.length})
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {galleryImages.slice(0, 9).map((img, i) => (
                            <div key={i} className="relative group overflow-hidden rounded-lg bg-gray-800 cursor-pointer" onClick={() => onAction("open_url", { url: img.pageUrl || img.url })}>
                              <img src={img.url} alt={img.title} className="w-full h-24 object-cover" onError={() => handleImgError(img.url)} referrerPolicy="no-referrer" />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                <div className="text-[10px] text-gray-200 truncate">{img.title}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // ── SOURCES TAB ──
              if (tab === "sources") {
                if (sources.length === 0) {
                  return <EmptyState icon={<LucideReact.Globe className="w-6 h-6" />} title="No sources" description="Sources will appear as search completes" />;
                }
                return (
                  <div className="space-y-2 pt-2">
                    <Input
                      placeholder="Filter sources..."
                      value={sourceFilter}
                      onChange={(val) => setSourceFilter(val)}
                      icon={<LucideReact.Filter className="w-3.5 h-3.5" />}
                    />
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex gap-1">
                        {[
                          { key: "relevance", label: "Best" },
                          { key: "alpha", label: "A-Z" },
                          { key: "domain", label: "Type" },
                        ].map(function(opt) {
                          return (
                            <button
                              key={opt.key}
                              onClick={function() { setSourceSort(opt.key); }}
                              className={"text-[10px] px-2 py-0.5 rounded transition-colors " + (sourceSort === opt.key ? "bg-blue-500/20 text-blue-300" : "bg-gray-800/50 text-gray-500 hover:text-gray-300")}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-gray-600">{sortedFilteredSources.length} sources</span>
                    </div>
                    <div className="flex gap-1.5 mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          var bibEntries = sources.map(function(s, i) {
                            var key = "source" + (i + 1);
                            var title = String(s.title || s.url || "").replace(/[{}]/g, "");
                            var domain = String(s.domain || "");
                            var year = new Date().getFullYear();
                            var accessed = new Date().toISOString().slice(0, 10);
                            return "@online{" + key + ",\\n  title = {" + title + "},\\n  url = {" + s.url + "},\\n  urldate = {" + accessed + "},\\n  year = {" + year + "},\\n  note = {" + domain + "}\\n}";
                          }).join("\\n\\n");
                          onAction("__copy_text", { text: bibEntries, label: "BibTeX" });
                        }}
                        icon={<LucideReact.Copy className="w-3 h-3" />}
                      >
                        Copy BibTeX
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          var apaEntries = sources.map(function(s) {
                            var title = String(s.title || s.url || "");
                            var domain = String(s.domain || "");
                            var accessed = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
                            return domain + ". (n.d.). " + title + ". Retrieved " + accessed + ", from " + s.url;
                          }).join("\\n\\n");
                          onAction("__copy_text", { text: apaEntries, label: "APA" });
                        }}
                        icon={<LucideReact.Copy className="w-3 h-3" />}
                      >
                        Copy APA
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {sortedFilteredSources.slice(0, 25).map((s, i) => {
                        var origIdx = sources.indexOf(s);
                        var isExpanded = expandedSource === i;
                        var hasContent = s.fullContent && s.fullContent.length > 100;
                        return (
                          <div key={i} className="rounded bg-gray-800/30">
                            <div
                              className="flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-gray-700/40 transition-colors"
                              onClick={() => hasContent ? setExpandedSource(isExpanded ? null : i) : (s.url && onAction("open_url", { url: s.url }))}
                            >
                              <span className="text-[10px] text-gray-500 font-mono w-5 text-right shrink-0">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-blue-400 truncate">{String(s.title)}</div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-500">{String(s.domain)}</span>
                                  {(() => { const trust = getSourceTrust(s.domain); return trust ? <span className={"text-[9px] px-1 py-0.5 rounded " + trust.bg + " " + trust.color}>{trust.label}</span> : null; })()}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {sourceFindingMap[origIdx] && sourceFindingMap[origIdx].length > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 flex items-center gap-0.5" title={"Cited by " + sourceFindingMap[origIdx].length + " finding(s)"}>
                                    <LucideReact.Lightbulb className="w-2.5 h-2.5" />{sourceFindingMap[origIdx].length}
                                  </span>
                                )}
                                <div className="w-12">
                                  <Progress value={s.relevance || 0} max={100} variant="blue" />
                                </div>
                                {hasContent && (
                                  <LucideReact.ChevronDown className={"w-3 h-3 text-gray-500 transition-transform " + (isExpanded ? "rotate-180" : "")} />
                                )}
                                <button className="p-0.5 rounded hover:bg-gray-600/50" onClick={(e) => { e.stopPropagation(); s.url && onAction("open_url", { url: s.url }); }}>
                                  <LucideReact.ExternalLink className="w-3 h-3 text-gray-500" />
                                </button>
                              </div>
                            </div>
                            {/* Inline source reader */}
                            {isExpanded && hasContent && (
                              <div className="px-3 py-2 border-t border-gray-700/30 max-h-64 overflow-y-auto">
                                <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{String(s.fullContent).slice(0, 3000)}</div>
                                {String(s.fullContent).length > 3000 && (
                                  <div className="text-[10px] text-gray-500 mt-2">
                                    Showing first 3000 chars. <button className="text-blue-400 hover:text-blue-300" onClick={() => onAction("open_url", { url: s.url })}>Read full article</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Audit trail */}
                    {(searchQueries.length > 0 || gapQueries.length > 0) && (
                      <Accordion items={[{
                        value: "audit",
                        title: "How this was researched",
                        content: (
                          <div className="space-y-2">
                            {searchQueries.length > 0 && (
                              <div>
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Search queries ({searchQueries.length})</div>
                                <div className="flex flex-wrap gap-1">
                                  {searchQueries.map((q, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700/50">{q}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {gapQueries.length > 0 && (
                              <div>
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Gap-check queries ({gapQueries.length})</div>
                                <div className="flex flex-wrap gap-1">
                                  {gapQueries.map((q, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/20 text-amber-400 border border-amber-700/30">{q}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {metadata?.sourcesFound != null && (
                              <div className="text-[10px] text-gray-500">
                                {metadata.sourcesFound} sources found, {metadata.sectionsGenerated || 0} sections, {metadata.queriesRun || 0} queries run
                              </div>
                            )}
                          </div>
                        ),
                      }]} />
                    )}
                  </div>
                );
              }

              return null;
            }}
          </Tabs>
        </>
      )}

      {/* Metadata note */}
      {metadata?.note && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-400/70 px-1">
          {String(metadata.note).toLowerCase().includes("fail") || String(metadata.note).toLowerCase().includes("error")
            ? <LucideReact.AlertCircle className="w-3 h-3 shrink-0" />
            : <LucideReact.Info className="w-3 h-3 shrink-0" />
          }
          <span>{String(metadata.note)}</span>
          {String(metadata.note).toLowerCase().includes("fail") && (
            <button className="text-blue-400 hover:text-blue-300 ml-1 underline" onClick={() => onAction("search", { topic, depth: data?.depth || "standard", force: true })}>retry</button>
          )}
        </div>
      )}


      {/* Source preview popup */}
      <Dialog open={sourcePopup !== null} onClose={function() { setSourcePopup(null); }} title={sourcePopup ? String(sourcePopup.title) : ""} footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={function() { setSourcePopup(null); }}>Close</Button>
          {sourcePopup && sourcePopup.url && <Button variant="primary" onClick={function() { onAction("open_url", { url: sourcePopup.url }); }}><LucideReact.ExternalLink className="w-3.5 h-3.5" /> Open Source</Button>}
        </div>
      }>
        {sourcePopup && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">{String(sourcePopup.domain || "")}</span>
              {(function() { var trust = getSourceTrust(sourcePopup.domain); return trust ? <span className={"text-[9px] px-1.5 py-0.5 rounded " + trust.bg + " " + trust.color}>{trust.label}</span> : null; })()}
              {sourcePopup.relevance > 0 && (
                <div className="flex items-center gap-1">
                  <div className="w-12"><Progress value={sourcePopup.relevance || 0} max={100} variant="blue" /></div>
                  <span className="text-[9px] text-gray-500">{sourcePopup.relevance}%</span>
                </div>
              )}
            </div>
            {sourcePopup.snippet && <div className="text-sm text-gray-300 leading-relaxed">{String(sourcePopup.snippet)}</div>}
            {sourcePopup.fullContent && sourcePopup.fullContent.length > 100 && (
              <div className="mt-2 border-t border-gray-700/30 pt-2 max-h-48 overflow-y-auto">
                <div className="text-[10px] text-gray-500 uppercase mb-1">Extracted content</div>
                <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{String(sourcePopup.fullContent).slice(0, 2000)}</div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}`;

import type { ToolTemplate } from "../registry.js";

export function isResearcherSignature(signatureId: string): boolean {
  return signatureId === "research_board";
}

export function getResearcherTemplateCode(_signature: ToolTemplate): string {
  return RESEARCHER_TEMPLATE;
}

const RESEARCHER_TEMPLATE = `export default function GeneratedUI({ data, onAction }) {
  // ── ALL hooks at top level (React rules) ──
  const [topicInput, setTopicInput] = useState("");
  const [depthInput, setDepthInput] = useState("standard");
  const [followUpInput, setFollowUpInput] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [deepDiveInput, setDeepDiveInput] = useState("");
  const [imgErrors, setImgErrors] = useState({});
  const [expandedSource, setExpandedSource] = useState(null);
  const [playingVideos, setPlayingVideos] = useState({});

  const [shared, setShared] = useState(false);
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);

  // ── View detection ──
  const topic = String(data?.topic ?? "");
  const phase = String(data?.phase ?? "complete");
  const isWelcome = !topic || data?.category === "welcome";
  const isSearch = data?.tool === "enso_researcher_search" && !isWelcome;
  const isDeepDive = data?.tool === "enso_researcher_deep_dive";
  const isCompare = data?.tool === "enso_researcher_compare";
  const isFollowUp = data?.tool === "enso_researcher_follow_up";
  const isEmail = data?.tool === "enso_researcher_send_report";

  // ── Shared data extraction ──
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const keyFindings = Array.isArray(data?.keyFindings) ? data.keyFindings : [];
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const summary = String(data?.summary ?? "");
  const narrative = String(data?.narrative ?? "");
  const narrativeParagraphs = narrative ? narrative.split(/\\n\\n+/).filter((p) => p.trim()) : [];
  const metadata = data?.metadata || {};
  const images = Array.isArray(data?.images) ? data.images : [];
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  const books = Array.isArray(data?.books) ? data.books : [];
  const movies = Array.isArray(data?.movies) ? data.movies : [];
  const recommendedVideos = Array.isArray(data?.recommendedVideos) ? data.recommendedVideos : [];
  const contradictions = Array.isArray(data?.contradictions) ? data.contradictions : [];
  const searchQueries = Array.isArray(data?.searchQueries) ? data.searchQueries : (Array.isArray(metadata?.searchQueries) ? metadata.searchQueries : []);
  const gapQueries = Array.isArray(metadata?.gapQueries) ? metadata.gapQueries : [];
  const audioUrl = data?.audioUrl || null;
  const podcastScript = data?.podcastScript || null;
  const podcastStatus = data?.podcastStatus || null;
  const podcastError = data?.podcastError || null;
  const galleryImages = images.filter((img) => !imgErrors[img.url]);
  const handleImgError = (url) => setImgErrors((prev) => ({ ...prev, [url]: true }));
  const heroImage = images.find((img) => img.sectionIdx === 0) || images[0];

  // ── Research history ──
  const recentTopics = Array.isArray(data?.recentTopics) ? data.recentTopics : [];
  const timeAgo = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return Math.floor(days / 30) + "mo ago";
  };

  // ── YouTube embed helper ──
  const getYouTubeId = (url) => {
    if (!url) return null;
    const m = url.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };
  const togglePlay = (url) => setPlayingVideos((prev) => {
    if (prev[url]) return {}; // Pausing — clear all
    return { [url]: true };   // Playing — only this one (stops all others)
  });

  // ── Finding type styling ──
  const findingVariant = { fact: "success", trend: "info", insight: "default", warning: "warning" };
  const findingAccent = { fact: "emerald", trend: "blue", insight: "purple", warning: "amber" };
  const confidenceVariant = { high: "success", medium: "warning", low: "outline" };

  // ── Source trust classification ──
  const getSourceTrust = (domain) => {
    if (!domain) return null;
    const d = String(domain).toLowerCase();
    if (d.endsWith(".edu") || d.endsWith(".ac.uk") || d.endsWith(".ac.jp")) return { label: "Academic", color: "text-purple-400", bg: "bg-purple-500/10" };
    if (d.endsWith(".gov") || d.endsWith(".int") || d.endsWith(".mil")) return { label: "Gov", color: "text-emerald-400", bg: "bg-emerald-500/10" };
    if (d.endsWith(".org") || ["wikipedia.org", "britannica.com", "nature.com", "science.org", "arxiv.org"].some((t) => d.includes(t))) return { label: "Reference", color: "text-blue-400", bg: "bg-blue-500/10" };
    if (["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "nytimes.com", "washingtonpost.com", "theguardian.com", "economist.com"].some((t) => d.includes(t))) return { label: "News", color: "text-cyan-400", bg: "bg-cyan-500/10" };
    return null;
  };

  // ── Phase checks ──
  const isLoading = ["generating_queries", "searching", "sources", "synthesizing", "gap_checking", "deep_research"].includes(phase);
  const hasSynthesis = ["synthesized", "gap_checking", "complete", "generating_podcast"].includes(phase);
  const isComplete = phase === "complete" || phase === "generating_podcast";

  // ── Reading time estimate (avg 200 words/min for technical content) ──
  const wordCount = useMemo(() => {
    const text = [narrative, summary, ...keyFindings.map((f) => f.text), ...sections.flatMap((s) => [s.summary || "", ...(s.bullets || [])])].join(" ");
    return text.split(/\\s+/).filter((w) => w.length > 0).length;
  }, [narrative, summary, keyFindings, sections]);
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));

  // ── Narrative collapse (show first 3 paragraphs for long content) ──
  const NARRATIVE_COLLAPSE_THRESHOLD = 4;

  // ── Helper: source reference badges ──
  const SourceRefs = ({ refs }) => {
    if (!refs || refs.length === 0) return null;
    return (
      <span className="inline-flex gap-0.5 ml-1">
        {refs.slice(0, 3).map((idx) => (
          <span key={idx} className="text-[9px] px-1 py-0.5 rounded bg-gray-700/50 text-gray-400 font-mono cursor-pointer hover:bg-gray-600/50" onClick={(e) => { e.stopPropagation(); setExpandedSource(idx); }}>
            {idx + 1}
          </span>
        ))}
      </span>
    );
  };

  // ── Helper: skeleton pulse block ──
  const Skeleton = ({ className }) => (
    <div className={"animate-pulse bg-gray-700/40 rounded " + (className || "")} />
  );

  // ── Helper: phase status text ──
  const phaseLabels = {
    generating_queries: "Generating search queries...",
    searching: "Searching the web...",
    sources: "Gathering sources...",
    synthesizing: "Analyzing & synthesizing...",
    gap_checking: "Checking for gaps...",
    deep_research: "Deep research in progress (Claude Code)...",
    synthesized: "Finalizing...",
    complete: "Research complete",
  };

  // ── Video card component ──
  const VideoCard = ({ v, compact }) => {
    const ytId = getYouTubeId(v.url);
    const isPlaying = playingVideos[v.url];
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
  // VIEW 1: Welcome
  // ═══════════════════════════════════════════
  if (isWelcome) {
    const handleSearch = () => {
      const t = topicInput.trim();
      if (t) onAction("search", { topic: t, depth: depthInput });
    };
    const allSuggestionGroups = [
      ["AI in healthcare", "CRISPR gene editing breakthroughs", "mRNA vaccine applications beyond COVID"],
      ["Remote work productivity studies", "Electric vehicles vs hydrogen fuel", "Quantum computing applications"],
      ["Mediterranean diet benefits", "Weight loss drugs GLP-1 long-term effects", "How the immune system works"],
      ["SpaceX Starship progress", "Nuclear fusion timeline", "Neuromorphic computing trends"],
      ["History of the Roman Empire", "How black holes form", "Sourdough fermentation science"],
      ["Renewable energy storage breakthroughs", "Cybersecurity AI-powered threats", "Microplastics in food chain"],
    ];
    // Rotate suggestions based on day to keep content fresh
    const dayIdx = Math.floor(Date.now() / 86400000) % allSuggestionGroups.length;
    const allSuggestions = [...allSuggestionGroups[dayIdx], ...allSuggestionGroups[(dayIdx + 1) % allSuggestionGroups.length]];
    const recentTopicNames = new Set(recentTopics.map((r) => (r.meta?.topic || "").toLowerCase()));
    const suggestions = allSuggestions.filter((s) => !recentTopicNames.has(s.toLowerCase()));
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
          <Select
            options={[
              { value: "quick", label: "Quick" },
              { value: "standard", label: "Standard" },
              { value: "deep", label: "Deep" },
            ]}
            value={depthInput}
            onChange={(val) => setDepthInput(val || "standard")}
            placeholder="Depth"
          />
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
            <div className="flex flex-wrap gap-1.5">
              {recentTopics.map((entry) => {
                const entryTopic = entry.meta?.topic || entry.id || "";
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg bg-gray-800/40 hover:bg-gray-700/50 cursor-pointer transition-colors group px-3 py-1.5 flex items-center gap-2"
                    onClick={() => onAction("search", { topic: entryTopic })}
                  >
                    <span className="text-sm text-gray-200">{entryTopic}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-600/50 shrink-0"
                      onClick={(e) => { e.stopPropagation(); onAction("delete_history", { topic: entryTopic }); }}
                    >
                      <LucideReact.X className="w-3 h-3 text-gray-500" />
                    </button>
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
  // VIEW 6: Email result
  // ═══════════════════════════════════════════
  if (isEmail) {
    return (
      <div className="space-y-3">
        <Stat label="Research Report" value={topic || "Report"} accent={data?.success ? "emerald" : "rose"} />
        <UICard accent={data?.success ? "emerald" : "rose"}>
          <Badge variant={data?.success ? "success" : "danger"}>{data?.success ? "Sent" : "Not Sent"}</Badge>
          <div className="text-sm text-gray-200 mt-2">{String(data?.message ?? "")}</div>
          {data?.recipient && (
            <div className="text-xs text-gray-400 mt-1">To: {String(data.recipient)}</div>
          )}
        </UICard>
        {data?.fallbackHtml && (
          <Accordion items={[{
            value: "html",
            title: "HTML Report (copy to use)",
            content: (
              <div className="max-h-48 overflow-auto">
                <pre className="text-[10px] text-gray-400 whitespace-pre-wrap break-all">{String(data.fallbackHtml).slice(0, 3000)}</pre>
              </div>
            ),
          }]} />
        )}
        <Button variant="primary" onClick={() => onAction("search", { topic })}>Back to Research</Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // VIEW 3: Deep Dive
  // ═══════════════════════════════════════════
  if (isDeepDive) {
    const subtopic = String(data?.subtopic ?? "");
    const content = String(data?.content ?? "");
    const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
    const relatedSubtopics = Array.isArray(data?.relatedSubtopics) ? data.relatedSubtopics : [];
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
                {sources.slice(0, 10).map((s, i) => (
                  <div key={i} className="text-xs text-gray-400">
                    <span className="text-gray-500 font-mono">[{i + 1}]</span>{" "}
                    <span className="text-blue-400">{String(s.title)}</span>
                    <span className="text-gray-600"> — {String(s.domain)}</span>
                  </div>
                ))}
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
    const topicA = String(data?.topicA ?? "");
    const topicB = String(data?.topicB ?? "");
    const similarities = Array.isArray(data?.similarities) ? data.similarities : [];
    const differences = Array.isArray(data?.differences) ? data.differences : [];
    const tradeoffs = Array.isArray(data?.tradeoffs) ? data.tradeoffs : [];
    const verdict = String(data?.verdict ?? "");
    const parentTopic = topicA || topic;

    const ComparisonList = ({ items, accent }) => (
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
                {sources.slice(0, 10).map((s, i) => (
                  <div key={i} className="text-xs text-gray-400">
                    <span className="text-gray-500 font-mono">[{i + 1}]</span>{" "}
                    <span className="text-blue-400">{String(s.title)}</span>
                    <span className="text-gray-600"> — {String(s.domain)}</span>
                  </div>
                ))}
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
    const question = String(data?.question ?? "");
    const answer = String(data?.answer ?? "");
    const suggestedFollowUps = Array.isArray(data?.suggestedFollowUps) ? data.suggestedFollowUps : [];
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
                {sources.slice(0, 10).map((s, i) => (
                  <div key={i} className="text-xs text-gray-400">
                    <span className="text-gray-500 font-mono">[{i + 1}]</span>{" "}
                    <span className="text-blue-400">{String(s.title)}</span>
                    <span className="text-gray-600"> — {String(s.domain)}</span>
                  </div>
                ))}
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

  const filteredSources = sourceFilter
    ? sources.filter((s) =>
        String(s.title).toLowerCase().includes(sourceFilter.toLowerCase()) ||
        String(s.domain).toLowerCase().includes(sourceFilter.toLowerCase())
      )
    : sources;

  // Count media for tab labels
  const recVideos = recommendedVideos.map((rv) => videos[rv.index]).filter(Boolean);
  const otherVideos = videos.filter((_, i) => !recommendedVideos.some((rv) => rv.index === i));
  const hasMedia = videos.length > 0 || books.length > 0 || movies.length > 0;
  const mediaCount = videos.length + books.length + movies.length;

  // Build tab list dynamically
  const tabList = [
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
          {isComplete && !audioUrl && (
            <Button variant="ghost" onClick={() => {
              setPodcastLoading(true);
              onAction("generate_podcast", { topic });
            }} disabled={podcastLoading}>
              {podcastLoading
                ? <><div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /> <span className="hidden sm:inline">{podcastStatus === "rendering_audio" ? "Recording..." : "Writing..."}</span></>
                : podcastError
                  ? <><LucideReact.AlertCircle className="w-3.5 h-3.5 text-rose-400" /> <span className="hidden sm:inline">Retry</span></>
                  : <><LucideReact.Podcast className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Listen</span></>
              }
            </Button>
          )}
          {isComplete && audioUrl && (
            <Button variant="ghost" onClick={() => {
              const el = document.getElementById("research-audio-player");
              if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); }
            }}>
              <LucideReact.Headphones className="w-3.5 h-3.5 text-cyan-400" /> <span className="hidden sm:inline">Podcast</span>
            </Button>
          )}
          {isComplete && (
            <Button variant="ghost" onClick={() => onAction("__share_research_image", { topic })}>
              <LucideReact.Image className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Image</span>
            </Button>
          )}
          {isComplete && (
            <Button variant="ghost" onClick={() => {
              setShared(true);
              onAction("__share_research_pdf", { topic, summary, keyFindings, sections, sources, narrative, videos, books, movies, contradictions });
              setTimeout(() => setShared(false), 3000);
            }}>
              {shared
                ? <><LucideReact.Check className="w-3.5 h-3.5 text-emerald-400" /> <span className="hidden sm:inline">Saved!</span></>
                : <><LucideReact.FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PDF</span></>
              }
            </Button>
          )}
          {isComplete && (
            <Button variant="ghost" onClick={() => onAction("search", { topic: "" })}>
              <LucideReact.Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New</span>
            </Button>
          )}
          {isComplete && (
            <Button variant="primary" onClick={() => setEmailOpen(true)}>
              <LucideReact.Mail className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Email</span>
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
              const phaseOrder = ["generating_queries", "searching", "sources", "synthesizing", "gap_checking"];
              const currentIdx = phaseOrder.indexOf(phase);
              const thisIdx = [0, 1, 3].indexOf(i) >= 0 ? i : i;
              const dotPhases = [0, 1, 3]; // indices in phaseOrder
              const isDone = currentIdx > dotPhases[i];
              const isCurrent = currentIdx === dotPhases[i] || (i === 1 && currentIdx === 2);
              return (
                <div key={i} className={"w-1.5 h-1.5 rounded-full " + (isDone ? "bg-blue-400" : isCurrent ? "bg-blue-400 animate-pulse" : "bg-gray-600")} />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Complete status badges ── */}
      {isComplete && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="success">{sources.length} sources</Badge>
          {keyFindings.length > 0 && <Badge variant="info">{keyFindings.length} findings</Badge>}
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
      {/* ── Audio Player (when podcast is ready) ── */}
      {audioUrl && (
        <div id="research-audio-player" className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-cyan-400 uppercase tracking-wide">
            <LucideReact.Headphones className="w-3.5 h-3.5" /> AI Podcast Overview
          </div>
          <audio controls preload="metadata" className="w-full h-10" style={{ borderRadius: "8px" }}>
            <source src={audioUrl} type="audio/wav" />
            Your browser does not support audio playback.
          </audio>
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-gray-500">Two AI hosts discuss the key findings from this research</div>
            {podcastScript && (
              <button
                onClick={() => setScriptExpanded(!scriptExpanded)}
                className="flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-300 transition-colors"
              >
                <LucideReact.FileText className="w-3 h-3" />
                <span>{scriptExpanded ? "Hide" : "Show"} Transcript</span>
                <svg className={"w-3 h-3 transition-transform " + (scriptExpanded ? "rotate-180" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            )}
          </div>
          {scriptExpanded && podcastScript && (
            <div className="mt-2 pt-2 border-t border-cyan-500/20 max-h-[300px] overflow-y-auto text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
              {podcastScript.split(/\\n/).map((line, i) => {
                const hostMatch = line.match(/^(Host [AB]):\\s*(.*)/);
                if (hostMatch) {
                  const isA = hostMatch[1] === "Host A";
                  return (
                    <div key={i} className="mb-2">
                      <span className={"font-semibold " + (isA ? "text-cyan-400" : "text-purple-400")}>{hostMatch[1]}:</span>{" "}
                      <span>{hostMatch[2]}</span>
                    </div>
                  );
                }
                if (!line.trim()) return null;
                return <div key={i} className="mb-2 text-gray-400 italic">{line}</div>;
              })}
            </div>
          )}
        </div>
      )}

      {hasSynthesis && (
        <>
          {/* ── Summary preview (brief context before findings) ── */}
          {summary && (
            <div className="text-sm text-gray-300 leading-relaxed bg-gray-800/30 rounded-lg px-3 py-2.5 border-l-2 border-blue-500/40">
              {summary}
            </div>
          )}

          {/* ── Key Findings (prominent, findings-first) ── */}
          {keyFindings.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <LucideReact.Lightbulb className="w-3 h-3" /> Key Findings
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: keyFindings.length === 1 ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {keyFindings.map((f, i) => (
                  <UICard key={i} accent={findingAccent[f.type] || "blue"}>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-800/50 w-5 h-5 rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                        <Badge variant={findingVariant[f.type] || "default"}>{String(f.type)}</Badge>
                        <Badge variant={confidenceVariant[f.confidence] || "outline"}>{String(f.confidence)}</Badge>
                      </div>
                      <div className="text-sm text-gray-200 leading-relaxed">
                        {String(f.text)}
                        <SourceRefs refs={f.sourceRefs} />
                      </div>
                    </div>
                  </UICard>
                ))}
              </div>
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
                const inlineImages = galleryImages.slice(0, 3);
                const imgInsertIdx = Math.max(1, Math.floor(narrativeParagraphs.length / 3));
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
                      const isLong = narrativeParagraphs.length > NARRATIVE_COLLAPSE_THRESHOLD;
                      const visibleParagraphs = isLong && !narrativeExpanded ? narrativeParagraphs.slice(0, NARRATIVE_COLLAPSE_THRESHOLD) : narrativeParagraphs;
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

                    {/* Quick explore chips from sections */}
                    {sections.length > 0 && isComplete && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">Explore deeper</div>
                        <div className="flex flex-wrap gap-1.5">
                          {sections.slice(0, 5).map((s, i) => (
                            <button
                              key={i}
                              onClick={() => onAction("deep_dive", { topic, subtopic: s.title })}
                              className="text-[11px] px-2.5 py-1 rounded-full bg-gray-800/60 text-gray-300 border border-gray-700/50 hover:bg-blue-500/15 hover:border-blue-500/30 hover:text-blue-300 transition-colors"
                            >
                              {String(s.title)}
                            </button>
                          ))}
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
                const getSectionImage = (sIdx) => {
                  const img = images.find((i) => i.sectionIdx === sIdx);
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
                              const secImg = getSectionImage(i);
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
                          const bookUrl = b.url || "https://www.google.com/search?q=" + encodeURIComponent(b.title + (b.author ? " " + b.author : "") + " book");
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
                          const typeAccent = { movie: "rose", tv: "cyan", documentary: "teal", podcast: "orange" };
                          const typeIcon = { movie: "Film", tv: "Monitor", documentary: "Clapperboard", podcast: "Mic" };
                          const IconComp = LucideReact[typeIcon[m.type]] || LucideReact.Film;
                          const searchSuffix = { movie: "movie", tv: "tv show", documentary: "documentary", podcast: "podcast" };
                          const movieUrl = m.url || "https://www.google.com/search?q=" + encodeURIComponent(m.title + (m.year ? " " + m.year : "") + " " + (searchSuffix[m.type] || "movie"));
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
                    <div className="space-y-1">
                      {filteredSources.slice(0, 25).map((s, i) => {
                        const isExpanded = expandedSource === i;
                        const hasContent = s.fullContent && s.fullContent.length > 100;
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

      {/* Email dialog */}
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email Research: " + topic} footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            setEmailOpen(false);
            onAction("send_report", { recipient: emailAddr, topic, summary, narrative, keyFindings, sections, sources, images, videos });
          }}>Send Report</Button>
        </div>
      }>
        <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon={<LucideReact.Mail className="w-3.5 h-3.5" />} />
      </Dialog>
    </div>
  );
}`;

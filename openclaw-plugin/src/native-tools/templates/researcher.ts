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

  // ── View detection ──
  const topic = String(data?.topic ?? "");
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
  const metadata = data?.metadata || {};
  const images = Array.isArray(data?.images) ? data.images : [];
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  const heroImage = images.find((img) => img.sectionIdx === 0) || images[0];
  const galleryImages = images.filter((img) => !imgErrors[img.url]);
  const handleImgError = (url) => setImgErrors((prev) => ({ ...prev, [url]: true }));
  const getSectionImage = (sIdx) => {
    const img = images.find((i) => i.sectionIdx === sIdx);
    return img && !imgErrors[img.url] ? img : null;
  };

  // ── Finding type styling ──
  const findingVariant = { fact: "success", trend: "info", insight: "default", warning: "warning" };
  const findingAccent = { fact: "emerald", trend: "blue", insight: "purple", warning: "amber" };
  const confidenceVariant = { high: "success", medium: "warning", low: "outline" };

  // ── Helper: source reference badges ──
  const SourceRefs = ({ refs }) => {
    if (!refs || refs.length === 0) return null;
    return (
      <span className="inline-flex gap-0.5 ml-1">
        {refs.slice(0, 3).map((idx) => (
          <span key={idx} className="text-[9px] px-1 py-0.5 rounded bg-gray-700/50 text-gray-400 font-mono">
            {idx + 1}
          </span>
        ))}
      </span>
    );
  };

  // ═══════════════════════════════════════════
  // VIEW 1: Welcome — topic input
  // ═══════════════════════════════════════════
  if (isWelcome) {
    const handleSearch = () => {
      const t = topicInput.trim();
      if (t) onAction("search", { topic: t, depth: depthInput });
    };
    const suggestions = [
      "AI in healthcare", "Remote work trends 2026", "Quantum computing applications",
      "Mediterranean diet benefits", "Electric vehicles vs hydrogen fuel",
      "SaaS pricing strategies", "Ocean plastic cleanup technology", "Space tourism industry",
    ];
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <LucideReact.Search className="w-5 h-5 text-blue-400" />
            <div className="text-lg font-semibold text-gray-100">Research Assistant</div>
          </div>
          <div className="text-xs text-gray-400">Deep multi-angle web research with images, videos & AI synthesis</div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Enter any research topic..."
              value={topicInput}
              onChange={(val) => setTopicInput(val)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              icon="Search"
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
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-full h-full object-cover"
                  onError={() => handleImgError(img.url)}
                  referrerPolicy="no-referrer"
                />
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
            icon="MessageCircle"
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
        {items.length === 0 && <EmptyState icon="Minus" title="No data" description="No comparison data available" />}
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
            icon="MessageCircle"
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
  // VIEW 2: Research Overview (default)
  // ═══════════════════════════════════════════
  const filteredSources = sourceFilter
    ? sources.filter((s) =>
        String(s.title).toLowerCase().includes(sourceFilter.toLowerCase()) ||
        String(s.domain).toLowerCase().includes(sourceFilter.toLowerCase())
      )
    : sources;

  const mediaCount = galleryImages.length + videos.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Stat label="Research" value={topic} accent="blue" change={sources.length + " sources, " + sections.length + " sections"} />
        <div className="flex gap-1.5">
          <Button variant="ghost" onClick={() => onAction("search", { topic: "" })}>
            <LucideReact.Plus className="w-3.5 h-3.5" /> New
          </Button>
          <Button variant="primary" onClick={() => setEmailOpen(true)}>
            <LucideReact.Mail className="w-3.5 h-3.5" /> Email
          </Button>
        </div>
      </div>

      {/* Hero image */}
      {heroImage && !imgErrors[heroImage.url] && (
        <div className="w-full h-40 overflow-hidden rounded-lg">
          <img
            src={heroImage.url}
            alt={heroImage.title}
            className="w-full h-full object-cover"
            onError={() => handleImgError(heroImage.url)}
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {/* Executive Summary */}
      {summary && (
        <UICard accent="blue">
          <div className="text-sm text-gray-200 leading-relaxed">{summary}</div>
        </UICard>
      )}

      {/* Metadata note */}
      {metadata?.note && (
        <div className="text-[11px] text-amber-400/70 px-1">{String(metadata.note)}</div>
      )}

      {/* Main content tabs */}
      <Tabs
        tabs={[
          { value: "findings", label: "Findings (" + keyFindings.length + ")" },
          { value: "sections", label: "Sections (" + sections.length + ")" },
          { value: "media", label: "Media (" + mediaCount + ")" },
          { value: "sources", label: "Sources (" + sources.length + ")" },
        ]}
        defaultValue="findings"
        variant="pills"
      >
        {(tab) => {
          // ── Findings tab ──
          if (tab === "findings") {
            if (keyFindings.length === 0) {
              return <EmptyState icon="Lightbulb" title="No findings" description="No key findings were extracted" />;
            }
            return (
              <div className="space-y-2">
                {keyFindings.map((f, i) => (
                  <UICard key={i} accent={findingAccent[f.type] || "blue"}>
                    <div className="flex items-start gap-2">
                      <div className="flex gap-1 shrink-0 mt-0.5">
                        <Badge variant={findingVariant[f.type] || "default"}>
                          {String(f.type)}
                        </Badge>
                        <Badge variant={confidenceVariant[f.confidence] || "outline"}>
                          {String(f.confidence)}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-200 flex-1">
                        {String(f.text)}
                        <SourceRefs refs={f.sourceRefs} />
                      </div>
                    </div>
                  </UICard>
                ))}
              </div>
            );
          }

          // ── Sections tab ──
          if (tab === "sections") {
            if (sections.length === 0) {
              return <EmptyState icon="BookOpen" title="No sections" description="No research sections generated" />;
            }
            return (
              <div className="space-y-2">
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
                              <img
                                src={secImg.url}
                                alt={secImg.title}
                                className="w-full h-full object-cover"
                                onError={() => handleImgError(secImg.url)}
                                referrerPolicy="no-referrer"
                              />
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
                        <SourceRefs refs={s.sourceRefs} />
                        <Button
                          variant="outline"
                          onClick={() => onAction("deep_dive", { topic, subtopic: s.title })}
                        >
                          <LucideReact.ArrowRight className="w-3 h-3" /> Deep Dive
                        </Button>
                      </div>
                    ),
                  }))}
                  type="multiple"
                  defaultOpen={["sec-0"]}
                />
              </div>
            );
          }

          // ── Media tab ──
          if (tab === "media") {
            const hasImages = galleryImages.length > 0;
            const hasVideos = videos.length > 0;
            if (!hasImages && !hasVideos) {
              return <EmptyState icon="Image" title="No media" description="No images or videos found for this topic" />;
            }
            return (
              <div className="space-y-3">
                {hasImages && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <LucideReact.Image className="w-3 h-3" /> Images ({galleryImages.length})
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {galleryImages.slice(0, 9).map((img, i) => (
                        <div key={i} className="relative group overflow-hidden rounded-lg bg-gray-800">
                          <img
                            src={img.url}
                            alt={img.title}
                            className="w-full h-24 object-cover"
                            onError={() => handleImgError(img.url)}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                            <div className="text-[10px] text-gray-200 truncate">{img.title}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hasVideos && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <LucideReact.Play className="w-3 h-3" /> Videos ({videos.length})
                    </div>
                    <div className="space-y-2">
                      {videos.slice(0, 6).map((v, i) => (
                        <UICard key={i} accent="rose">
                          <div className="flex gap-3">
                            {v.thumbnail && (
                              <div className="w-28 h-20 rounded overflow-hidden shrink-0 relative bg-gray-800">
                                <img
                                  src={v.thumbnail}
                                  alt={v.title}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                {v.duration && (
                                  <div className="absolute bottom-0.5 right-0.5 bg-black/80 px-1 py-0.5 rounded text-[9px] text-white font-mono">
                                    {v.duration}
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                                    <LucideReact.Play className="w-4 h-4 text-white ml-0.5" />
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-gray-100 line-clamp-2">{v.title}</div>
                              <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                                {v.publisher && <Badge variant="info">{v.publisher}</Badge>}
                                {v.creator && <span className="text-[10px] text-gray-400">{v.creator}</span>}
                                {v.age && <span className="text-[10px] text-gray-500">{v.age}</span>}
                              </div>
                              {v.description && (
                                <div className="text-[10px] text-gray-400 mt-1 line-clamp-2">{v.description}</div>
                              )}
                            </div>
                          </div>
                        </UICard>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // ── Sources tab ──
          if (sources.length === 0) {
            return <EmptyState icon="ExternalLink" title="No sources" description="No web sources found (check API key)" />;
          }
          return (
            <div className="space-y-2">
              <Input
                placeholder="Filter sources..."
                value={sourceFilter}
                onChange={(val) => setSourceFilter(val)}
                icon="Filter"
              />
              <div className="space-y-1">
                {filteredSources.slice(0, 20).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-2 rounded bg-gray-800/30">
                    <span className="text-[10px] text-gray-500 font-mono w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-blue-400 truncate">{String(s.title)}</div>
                      <div className="text-[10px] text-gray-500">{String(s.domain)}</div>
                    </div>
                    <div className="w-16 shrink-0">
                      <Progress value={s.relevance || 0} max={100} variant="blue" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }}
      </Tabs>

      {/* Action bar */}
      <Separator />
      <div className="space-y-2">
        {/* Follow-up */}
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
            icon="MessageCircle"
          />
          <Button variant="primary" onClick={() => {
            if (followUpInput.trim()) {
              onAction("follow_up", { topic, question: followUpInput.trim() });
              setFollowUpInput("");
            }
          }}>Ask</Button>
        </div>
        {/* Compare */}
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
            icon="GitCompare"
          />
          <Button variant="outline" onClick={() => {
            if (compareInput.trim()) {
              onAction("compare", { topicA: topic, topicB: compareInput.trim() });
              setCompareInput("");
            }
          }}>Compare</Button>
        </div>
      </div>

      {/* Email dialog */}
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title={"Email Research: " + topic} footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            setEmailOpen(false);
            onAction("send_report", { recipient: emailAddr, topic, summary, keyFindings, sections, sources });
          }}>Send Report</Button>
        </div>
      }>
        <Input placeholder="recipient@example.com" value={emailAddr} onChange={(val) => setEmailAddr(val)} icon="Mail" />
      </Dialog>
    </div>
  );
}`;

export default function GeneratedUI({ data, onAction }) {
  // ── State ──
  var [expandedScene, setExpandedScene] = useState(null);
  var [selectedGalleryCategory, setSelectedGalleryCategory] = useState("all");
  var [selectedTemplate, setSelectedTemplate] = useState(null);
  // Landing state
  var [landingMode, setLandingMode] = useState("short_video");
  // Photo story state
  var [psImagePathsText, setPsImagePathsText] = useState(""); // newline-separated paths
  var [psConcept, setPsConcept] = useState("");
  var [psPlatform, setPsPlatform] = useState("douyin");
  var [psStyle, setPsStyle] = useState("cinematic");
  var [psDuration, setPsDuration] = useState(5);
  var [psDescriptions, setPsDescriptions] = useState(""); // newline-separated optional descriptions
  var [svPlatform, setSvPlatform] = useState("douyin");
  var [svCategory, setSvCategory] = useState("lifestyle");
  var [svDuration, setSvDuration] = useState(30);
  var [svConcept, setSvConcept] = useState("");
  var [svHookStyle, setSvHookStyle] = useState("auto");
  // Single clip state
  var [promptText, setPromptText] = useState("");
  var [durationVal, setDurationVal] = useState(5);
  var [resolutionVal, setResolutionVal] = useState("1080p");
  var [ratioVal, setRatioVal] = useState("9:16");
  var [styleVal, setStyleVal] = useState("cinematic");
  var [moodVal, setMoodVal] = useState("");
  var [audioEnabled, setAudioEnabled] = useState(true);
  // Craft prompt editing
  var [editingPrompt, setEditingPrompt] = useState(false);
  var [editPromptText, setEditPromptText] = useState("");

  var tool = data?.tool || "";
  var error = data?.error || "";

  // ── Shared helpers ──
  var PLATFORM_LABELS = { douyin: "抖音 Douyin", tiktok: "TikTok", rednote: "小红书", bilibili: "Bilibili", youtube_shorts: "YT Shorts", wechat: "微信视频号" };
  var PLATFORM_ICONS = { douyin: "🎵", tiktok: "🎶", rednote: "📕", bilibili: "📺", youtube_shorts: "▶️", wechat: "💬" };
  var PLATFORM_RATIO = { douyin: "9:16", tiktok: "9:16", rednote: "3:4", bilibili: "16:9", youtube_shorts: "9:16", wechat: "9:16" };

  var scoreVariant = function(score) {
    if (!score) return "outline";
    if (score >= 8.5) return "success";
    if (score >= 7) return "warning";
    return "danger";
  };
  var purposeVariant = function(p) {
    var m = { hook: "warning", cta: "pink", emotion: "purple", content: "blue", solution: "green", proof: "teal", conflict: "danger", context: "outline", action: "orange" };
    return m[p] || "outline";
  };

  var ratioPreviewStyle = function(ratio) {
    var map = { "16:9": { width: 48, height: 27 }, "9:16": { width: 27, height: 48 }, "1:1": { width: 36, height: 36 }, "4:3": { width: 40, height: 30 }, "3:4": { width: 30, height: 40 }, "21:9": { width: 56, height: 24 } };
    return map[ratio] || map["16:9"];
  };

  // ── Error State ──
  if (error) {
    return (
      <UICard accent="red" header="Error">
        <div className="space-y-3">
          <Badge variant="danger">{String(error)}</Badge>
          <div className="flex gap-2 flex-wrap">
            <Button variant="primary" icon={<LucideReact.Home size={14} />} onClick={function() { onAction("view", {}); }}>Studio Home</Button>
            <Button variant="outline" icon={<LucideReact.Grid3x3 size={14} />} onClick={function() { onAction("gallery", {}); }}>Gallery</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── 短视频 Project View ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_short_video") {
    var svScenes = data.scenes || [];
    var hookScene = null;
    var otherScenes = [];
    for (var si = 0; si < svScenes.length; si++) {
      if (svScenes[si].purpose === "hook" && !hookScene) hookScene = svScenes[si];
      else otherScenes.push(svScenes[si]);
    }
    if (!hookScene && svScenes.length > 0) { hookScene = svScenes[0]; otherScenes = svScenes.slice(1); }

    return (
      <div className="space-y-4">
        {/* Project Header */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <LucideReact.Clapperboard size={18} className="text-purple-400 flex-shrink-0" />
            <span className="text-sm font-bold text-white truncate">{String(data.projectTitle || "Short Video Project")}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="purple">{String(PLATFORM_ICONS[data.platform] || "🎬")} {String(data.platformName || data.platform || "Douyin")}</Badge>
            {data.hookScore ? <Badge variant={scoreVariant(data.hookScore)}>⚡ Hook {String(data.hookScore)}</Badge> : null}
            {data.viralScore ? <Badge variant={scoreVariant(data.viralScore)}>🔥 Viral {String(data.viralScore)}</Badge> : null}
          </div>
        </div>

        {/* Concept */}
        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-xs text-gray-400 italic">
          {String(data.concept || "")}
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
          <span className="flex items-center gap-1"><LucideReact.Maximize size={11} />{String(data.ratio || "9:16")}</span>
          <span className="flex items-center gap-1"><LucideReact.Monitor size={11} />{String(data.resolution || "1080p")}</span>
          <span className="flex items-center gap-1"><LucideReact.Clock size={11} />{String(data.totalDuration || 0)}s total</span>
          <span className="flex items-center gap-1"><LucideReact.Film size={11} />{String(svScenes.length)} scenes</span>
          {data.hookStyle && data.hookStyle !== "auto" ? <Badge variant="outline" size="sm">{String(data.hookStyle)} hook</Badge> : null}
        </div>

        {/* Hook Scene */}
        {hookScene ? (
          <div className="rounded-xl border border-orange-500/50 bg-orange-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-orange-400 font-bold text-xs">⚡ HOOK</span>
                <span className="text-xs text-gray-400">{String(hookScene.title || "")}</span>
                <Badge variant="warning">{String(hookScene.duration || 3)}s</Badge>
              </div>
              <Button variant="outline" size="sm" icon={<LucideReact.Play size={11} />}
                onClick={function() { onAction("generate", { prompt: hookScene.prompt, duration: hookScene.duration || 3, resolution: data.resolution || "1080p", ratio: data.ratio || "9:16", generate_audio: true }); }}>
                Generate
              </Button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{String(hookScene.prompt || "")}</p>
            {hookScene.caption ? (
              <div className="flex items-start gap-2 pt-1">
                <LucideReact.Type size={11} className="text-yellow-400/70 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-yellow-300 font-medium">"{String(hookScene.caption)}"</span>
                {hookScene.captionTiming ? <span className="text-xs text-gray-600 ml-1">{String(hookScene.captionTiming)}</span> : null}
              </div>
            ) : null}
            {hookScene.audioNote ? (
              <div className="flex items-start gap-2">
                <LucideReact.Music size={11} className="text-purple-400/70 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-gray-500">{String(hookScene.audioNote)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Remaining Scenes */}
        {otherScenes.length > 0 ? (
          <div className="space-y-1.5">
            {otherScenes.map(function(scene, idx) {
              var isExp = expandedScene === scene.number;
              return (
                <div key={idx} className={"rounded-lg border overflow-hidden transition-colors " + (isExp ? "border-white/20 bg-white/5" : "border-white/8 bg-white/3")}>
                  <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={function() { setExpandedScene(isExp ? null : scene.number); }}>
                    <span className="text-xs font-mono text-gray-600 w-5 flex-shrink-0">{String(scene.number)}</span>
                    <span className="text-xs text-gray-200 flex-1 truncate">{String(scene.title || "Scene " + scene.number)}</span>
                    <Badge variant={purposeVariant(scene.purpose)}>{String(scene.purpose || "content")}</Badge>
                    <span className="text-xs text-gray-600 flex-shrink-0">{String(scene.duration || 5)}s</span>
                    {scene.generated ? <LucideReact.CheckCircle size={11} className="text-green-400 flex-shrink-0" /> : null}
                    <LucideReact.ChevronDown size={11} className={"text-gray-500 flex-shrink-0 transition-transform duration-200 " + (isExp ? "rotate-180" : "")} />
                  </div>
                  {isExp ? (
                    <div className="px-3 pb-3 space-y-2.5 border-t border-white/8">
                      <p className="text-xs text-gray-300 leading-relaxed mt-2">{String(scene.prompt || "")}</p>
                      {scene.caption ? (
                        <div className="flex items-start gap-2">
                          <LucideReact.Type size={11} className="text-yellow-400/70 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-yellow-300">"{String(scene.caption)}"</span>
                          {scene.captionTiming ? <span className="text-xs text-gray-600 ml-1">{String(scene.captionTiming)}</span> : null}
                        </div>
                      ) : null}
                      {scene.audioNote ? (
                        <div className="flex items-start gap-2">
                          <LucideReact.Music size={11} className="text-purple-400/70 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-gray-500">{String(scene.audioNote)}</span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2 pt-0.5">
                        <Button variant="outline" size="sm" icon={<LucideReact.Play size={11} />}
                          onClick={function() { onAction("generate", { prompt: scene.prompt, duration: scene.duration || 5, resolution: data.resolution || "1080p", ratio: data.ratio || "9:16", generate_audio: true }); }}>
                          Generate This Scene
                        </Button>
                        <span className="text-xs text-gray-600">→ {String(scene.transition || "cut")}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Music Direction */}
        {(data.musicGenre || data.musicMood) ? (
          <div className="rounded-lg border border-white/10 bg-white/3 p-3">
            <div className="flex items-center gap-2 mb-2">
              <LucideReact.Music2 size={13} className="text-purple-400" />
              <span className="text-xs font-semibold text-gray-300">Music Direction</span>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {data.musicGenre ? <Badge variant="purple">{String(data.musicGenre)}</Badge> : null}
              {data.musicMood ? <Badge variant="outline">{String(data.musicMood)}</Badge> : null}
              {data.musicBPM ? <span className="text-xs text-gray-500">{String(data.musicBPM)} BPM</span> : null}
            </div>
            {data.ctaText ? <p className="text-xs text-gray-500 mt-2">CTA: <span className="text-gray-300">"{String(data.ctaText)}"</span></p> : null}
          </div>
        ) : null}

        {/* Platform Tips */}
        {data.platformTips && data.platformTips.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-400">Platform Tips</p>
            {data.platformTips.map(function(tip, i) {
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-purple-400 text-xs mt-0.5 flex-shrink-0">•</span>
                  <span className="text-xs text-gray-500">{String(tip)}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Hashtags */}
        {data.hashtags && data.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {data.hashtags.map(function(tag, i) {
              return <span key={i} className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-400/20">{String(tag)}</span>;
            })}
          </div>
        ) : null}

        {/* Action Row */}
        <div className="flex gap-2 flex-wrap pt-1">
          <Button variant="primary" icon={<LucideReact.Zap size={13} />}
            onClick={function() { onAction("batch_generate", { scenes: svScenes, ratio: data.ratio || "9:16", resolution: data.resolution || "1080p", generate_audio: true, project_id: data.projectId || "" }); }}>
            Generate All Scenes
          </Button>
          <Button variant="outline" icon={<LucideReact.Palette size={13} />}
            onClick={function() { onAction("style_gallery", {}); }}>
            Style Gallery
          </Button>
          <Button variant="ghost" icon={<LucideReact.Home size={13} />}
            onClick={function() { onAction("view", {}); }}>
            Studio
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Batch Generate Results ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_batch_generate") {
    var bResults = data.results || [];
    var bSuccess = data.successCount || 0;
    var bFailed = data.failedCount || 0;
    var bTotal = data.totalScenes || bResults.length;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LucideReact.Layers size={18} className="text-purple-400" />
            <span className="text-sm font-bold text-white">Batch Generation Results</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">{String(bSuccess)}/{String(bTotal)} done</Badge>
            {bFailed > 0 ? <Badge variant="danger">{String(bFailed)} failed</Badge> : null}
          </div>
        </div>

        {/* Progress bar */}
        <Progress value={bTotal > 0 ? (bSuccess / bTotal) * 100 : 0} />

        {/* Results list */}
        <div className="space-y-3">
          {bResults.map(function(r, idx) {
            return (
              <div key={idx} className={"rounded-lg border p-3 space-y-2 " + (r.status === "success" ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5")}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">#{String(r.number || (idx + 1))}</span>
                    <span className="text-xs text-gray-200 font-medium">{String(r.title || "Scene " + (idx + 1))}</span>
                    {r.purpose ? <Badge variant={purposeVariant(r.purpose)}>{String(r.purpose)}</Badge> : null}
                  </div>
                  <Badge variant={r.status === "success" ? "success" : "danger"}>
                    {r.status === "success" ? "✓ Done" : "✗ Failed"}
                  </Badge>
                </div>
                {r.status === "success" && r.url ? (
                  <video
                    src={r.url}
                    controls
                    className="w-full rounded-lg max-h-64 bg-black"
                    style={{ aspectRatio: (data.ratio || "9:16").replace(":", "/") }}
                  />
                ) : null}
                {r.caption ? (
                  <div className="flex items-center gap-2">
                    <LucideReact.Type size={11} className="text-yellow-400/70 flex-shrink-0" />
                    <span className="text-xs text-yellow-300">"{String(r.caption)}"</span>
                  </div>
                ) : null}
                {r.status === "failed" ? (
                  <div className="flex items-start gap-2">
                    <LucideReact.AlertCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-red-400">{String(r.error || "Generation failed")}</span>
                  </div>
                ) : null}
                {r.status === "failed" ? (
                  <Button variant="outline" size="sm" icon={<LucideReact.RefreshCw size={11} />}
                    onClick={function() { onAction("generate", { prompt: r.prompt, duration: r.duration || 5, resolution: data.resolution || "1080p", ratio: data.ratio || "9:16", generate_audio: true }); }}>
                    Retry
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" icon={<LucideReact.Grid3x3 size={13} />}
            onClick={function() { onAction("gallery", {}); }}>
            View Gallery
          </Button>
          <Button variant="ghost" icon={<LucideReact.Home size={13} />}
            onClick={function() { onAction("view", {}); }}>
            Studio
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Style Gallery ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_style_gallery") {
    var templates = data.templates || [];
    var allCategories = data.categories || ["all", "education", "lifestyle", "entertainment", "food", "travel", "beauty", "product"];
    var filtered = selectedGalleryCategory === "all"
      ? templates
      : templates.filter(function(t) { return t.category === selectedGalleryCategory; });

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LucideReact.Palette size={18} className="text-purple-400" />
            <span className="text-sm font-bold text-white">Viral Format Templates</span>
            <Badge variant="purple">{String(filtered.length)} templates</Badge>
          </div>
          <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />}
            onClick={function() { onAction("view", {}); }}>Studio</Button>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map(function(cat) {
            return (
              <button key={cat}
                className={"px-2.5 py-1 rounded-full text-xs transition-colors " + (selectedGalleryCategory === cat ? "bg-purple-500 text-white" : "bg-white/8 text-gray-400 hover:bg-white/15")}
                onClick={function() { setSelectedGalleryCategory(cat); }}>
                {String(cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1))}
              </button>
            );
          })}
        </div>

        {/* Template grid */}
        <div className="space-y-3">
          {filtered.map(function(tmpl, idx) {
            var isSelected = selectedTemplate === tmpl.id;
            return (
              <div key={idx} className={"rounded-xl border transition-colors overflow-hidden " + (isSelected ? "border-purple-500/60 bg-purple-500/5" : "border-white/10 bg-white/3 hover:border-white/20")}>
                {/* Template header */}
                <div className="p-3 cursor-pointer" onClick={function() { setSelectedTemplate(isSelected ? null : tmpl.id); }}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">{String(tmpl.name || tmpl.nameEn || "")}</span>
                        {tmpl.nameEn && tmpl.name !== tmpl.nameEn ? <span className="text-xs text-gray-500">{String(tmpl.nameEn)}</span> : null}
                        <Badge variant="outline">{String(tmpl.category || "")}</Badge>
                        <Badge variant={tmpl.hookType === "shock" || tmpl.hookType === "action" ? "warning" : "purple"}>{String(tmpl.hookType || "")} hook</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{String(tmpl.description || "")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge variant={scoreVariant(tmpl.viralPotential)}>🔥 {String(tmpl.viralPotential || "")}</Badge>
                      <span className="text-xs text-gray-600">{String(tmpl.totalDuration || "")}s</span>
                    </div>
                  </div>
                </div>

                {/* Expanded content */}
                {isSelected ? (
                  <div className="px-3 pb-3 space-y-3 border-t border-white/8">
                    {/* Structure */}
                    <div className="space-y-1 pt-2">
                      <p className="text-xs font-semibold text-gray-400">Scene Structure</p>
                      {(tmpl.structure || []).map(function(step, si) {
                        return (
                          <div key={si} className="flex items-center gap-2">
                            <span className="text-xs text-purple-400 font-mono w-4">{String(si + 1)}.</span>
                            <span className="text-xs text-gray-400">{String(step)}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Example prompt */}
                    {tmpl.examplePrompt ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-400">Example Prompt</p>
                        <div className="p-2 rounded-lg bg-black/30 border border-white/8">
                          <p className="text-xs text-gray-400 italic">{String(tmpl.examplePrompt)}</p>
                        </div>
                      </div>
                    ) : null}

                    {/* Best for */}
                    {tmpl.bestFor && tmpl.bestFor.length > 0 ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">Best for:</span>
                        {tmpl.bestFor.map(function(p) {
                          return <Badge key={p} variant="outline">{String(PLATFORM_ICONS[p] || "")} {String(PLATFORM_LABELS[p] || p)}</Badge>;
                        })}
                      </div>
                    ) : null}

                    {/* Use template button */}
                    <Button variant="primary" icon={<LucideReact.Sparkles size={13} />}
                      onClick={function() {
                        setSvConcept(tmpl.exampleConcept || "");
                        if (tmpl.bestFor && tmpl.bestFor.length > 0) setSvPlatform(tmpl.bestFor[0]);
                        setSvCategory(tmpl.category || "lifestyle");
                        setSvHookStyle(tmpl.hookType || "auto");
                        onAction("view", {});
                      }}>
                      Use This Template
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Photo Story Result ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_photo_story") {
    var psFrames = data.frames || [];
    var psTotalPhotos = data.totalPhotos || psFrames.length;
    var psSuccess = data.successCount || 0;
    var psFailed = data.failedCount || 0;
    var psRatio = data.ratio || "9:16";
    var psRatioCss = psRatio.replace(":", "/");

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <LucideReact.ImagePlay size={18} className="text-purple-400 flex-shrink-0" />
            <span className="text-sm font-bold text-white truncate">{String(data.projectTitle || "Photo Story")}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="purple">{String(data.platformName || data.platform || "Douyin")}</Badge>
            <Badge variant="success">{String(psSuccess)}/{String(psTotalPhotos)} done</Badge>
            {psFailed > 0 ? <Badge variant="danger">{String(psFailed)} failed</Badge> : null}
          </div>
        </div>

        {/* Narrative overview */}
        {data.narrativeOverview ? (
          <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-xs text-gray-400 italic">
            {String(data.narrativeOverview)}
          </div>
        ) : null}

        {/* Stats row */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
          <span className="flex items-center gap-1"><LucideReact.Images size={11} />{String(psTotalPhotos)} photos</span>
          <span className="flex items-center gap-1"><LucideReact.Maximize size={11} />{String(psRatio)}</span>
          <span className="flex items-center gap-1"><LucideReact.Clock size={11} />{String(data.durationPerPhoto || 5)}s/clip · {String(data.totalDuration || 0)}s total</span>
          {data.musicGenre ? <span className="flex items-center gap-1"><LucideReact.Music size={11} />{String(data.musicGenre)}</span> : null}
          {data.musicMood ? <Badge variant="outline">{String(data.musicMood)}</Badge> : null}
        </div>

        {/* Progress */}
        <Progress value={psTotalPhotos > 0 ? (psSuccess / psTotalPhotos) * 100 : 0} />

        {/* Frames */}
        <div className="space-y-3">
          {psFrames.map(function(frame, idx) {
            return (
              <div key={idx} className={"rounded-xl border overflow-hidden " + (frame.status === "success" ? "border-white/15" : "border-red-500/20")}>
                {/* Video player if generated */}
                {frame.status === "success" && frame.url ? (
                  <video
                    src={frame.url}
                    controls
                    className="w-full bg-black"
                    style={{ maxHeight: "320px" }}
                  />
                ) : null}

                {/* Frame info */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">#{String(frame.number)}</span>
                      <span className="text-xs text-gray-400 truncate max-w-32">{String(frame.imageFileName || frame.imagePath || "")}</span>
                      {frame.purpose ? <Badge variant={purposeVariant(frame.purpose)}>{String(frame.purpose)}</Badge> : null}
                    </div>
                    <Badge variant={frame.status === "success" ? "success" : "danger"}>
                      {frame.status === "success" ? "✓ Animated" : "✗ Failed"}
                    </Badge>
                  </div>

                  {/* Motion prompt */}
                  <div className="flex items-start gap-2">
                    <LucideReact.Move size={11} className="text-blue-400/70 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-500">{String(frame.motionPrompt || "")}</span>
                  </div>

                  {/* Caption */}
                  {frame.caption ? (
                    <div className="flex items-start gap-2">
                      <LucideReact.Type size={11} className="text-yellow-400/70 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-yellow-300">"{String(frame.caption)}"</span>
                    </div>
                  ) : null}

                  {/* Audio note */}
                  {frame.audioNote ? (
                    <div className="flex items-start gap-2">
                      <LucideReact.Music size={11} className="text-purple-400/70 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-gray-500">{String(frame.audioNote)}</span>
                    </div>
                  ) : null}

                  {/* Error */}
                  {frame.status === "failed" ? (
                    <div className="flex items-start gap-2">
                      <LucideReact.AlertCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-red-400">{String(frame.error || "Animation failed")}</span>
                    </div>
                  ) : null}

                  {/* Retry button for failed frames */}
                  {frame.status === "failed" ? (
                    <Button variant="outline" size="sm" icon={<LucideReact.RefreshCw size={11} />}
                      onClick={function() { onAction("animate", { image_path: frame.imagePath, prompt: frame.motionPrompt, duration: data.durationPerPhoto || 5, resolution: "1080p", ratio: psRatio }); }}>
                      Retry
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hashtags */}
        {data.hashtags && data.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {data.hashtags.map(function(tag, i) {
              return <span key={i} className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-400/20">{String(tag)}</span>;
            })}
          </div>
        ) : null}

        {/* Bottom actions */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" icon={<LucideReact.Grid3x3 size={13} />}
            onClick={function() { onAction("gallery", {}); }}>Gallery</Button>
          <Button variant="ghost" icon={<LucideReact.Home size={13} />}
            onClick={function() { onAction("view", {}); }}>Studio</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Landing / Studio Home ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_view") {
    var stats = data.stats || {};
    var recentEntries = data.recentEntries || [];

    var styleOptions = [
      { value: "cinematic", label: "Cinematic" }, { value: "anime", label: "Anime" },
      { value: "realistic", label: "Realistic" }, { value: "noir", label: "Noir" },
      { value: "fantasy", label: "Fantasy" }, { value: "sci-fi", label: "Sci-Fi" },
      { value: "documentary", label: "Documentary" }, { value: "viral", label: "Viral" }
    ];
    var moodOptions = [
      { value: "", label: "Auto" }, { value: "dramatic", label: "Dramatic" },
      { value: "serene", label: "Serene" }, { value: "energetic", label: "Energetic" },
      { value: "mysterious", label: "Mysterious" }, { value: "emotional", label: "Emotional" },
      { value: "playful", label: "Playful" }
    ];
    var resolutionOptions = [{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }];
    var ratioOptions = [
      { value: "9:16", label: "9:16 Portrait ↑" }, { value: "16:9", label: "16:9 Landscape" },
      { value: "1:1", label: "1:1 Square" }, { value: "3:4", label: "3:4 Classic" }, { value: "21:9", label: "21:9 Ultra" }
    ];
    var categoryOptions = [
      { value: "lifestyle", label: "Lifestyle" }, { value: "education", label: "Education" },
      { value: "entertainment", label: "Entertainment" }, { value: "food", label: "Food" },
      { value: "travel", label: "Travel" }, { value: "beauty", label: "Beauty" },
      { value: "product", label: "Product" }, { value: "comedy", label: "Comedy" }
    ];
    var hookStyleOptions = [
      { value: "auto", label: "Auto (AI chooses)" }, { value: "question", label: "Question" },
      { value: "shock", label: "Shock" }, { value: "action", label: "Action" },
      { value: "emotion", label: "Emotion" }, { value: "mystery", label: "Mystery" },
      { value: "trend", label: "Trending" }
    ];

    var rPreview = ratioPreviewStyle(ratioVal);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LucideReact.Clapperboard size={20} className="text-purple-400" />
            <span className="text-base font-bold text-white">Video Studio</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" icon={<LucideReact.Sparkles size={13} />}
              onClick={function() { onAction("style_gallery", {}); }}>
              Templates
            </Button>
            {stats.galleryCount > 0 ? (
              <Button variant="ghost" size="sm" icon={<LucideReact.Grid3x3 size={13} />}
                onClick={function() { onAction("gallery", {}); }}>
                {String(stats.galleryCount)}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" icon={<LucideReact.Clock size={13} />}
              onClick={function() { onAction("history", {}); }} />
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { id: "short_video", label: "🎬 短视频" },
            { id: "photo_story", label: "📸 Photo Story" },
            { id: "single", label: "Single Clip" },
            { id: "multi", label: "Multi-Scene" },
            { id: "animate", label: "Animate" }
          ].map(function(tab) {
            return (
              <Button key={tab.id}
                variant={landingMode === tab.id ? "primary" : "outline"}
                size="sm"
                onClick={function() { setLandingMode(tab.id); }}>
                {String(tab.label)}
              </Button>
            );
          })}
        </div>

        {/* ── 短视频 Creator ── */}
        {landingMode === "short_video" ? (
          <div className="space-y-3">
            {/* Platform selector */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-400">Platform</p>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.keys(PLATFORM_LABELS).map(function(pid) {
                  var isActive = svPlatform === pid;
                  return (
                    <button key={pid}
                      className={"rounded-lg px-2 py-2 text-xs transition-colors flex flex-col items-center gap-0.5 border " + (isActive ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10")}
                      onClick={function() { setSvPlatform(pid); }}>
                      <span className="text-sm">{String(PLATFORM_ICONS[pid] || "🎬")}</span>
                      <span className="leading-tight text-center">{String(PLATFORM_LABELS[pid] || pid)}</span>
                      <span className="text-gray-600" style={{ fontSize: "10px" }}>{String(PLATFORM_RATIO[pid] || "")}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category + Hook Style */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Category</p>
                <Select options={categoryOptions} value={svCategory} onChange={function(v) { setSvCategory(v); }} />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Hook Style</p>
                <Select options={hookStyleOptions} value={svHookStyle} onChange={function(v) { setSvHookStyle(v); }} />
              </div>
            </div>

            {/* Duration slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Total Duration</p>
                <span className="text-xs font-mono text-purple-400">{String(svDuration)}s</span>
              </div>
              <Slider min={10} max={90} step={5} value={svDuration} onChange={function(v) { setSvDuration(v); }} showValue={false} />
            </div>

            {/* Concept input */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Your Concept</p>
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2.5 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                rows={3}
                placeholder={"Describe your video idea in any language... e.g., 一个关于坚持的励志故事 or 'Before/after kitchen transformation'"}
                value={svConcept}
                onChange={function(v) { setSvConcept(v); }}
              />
            </div>

            {/* Generate button */}
            <Button variant="primary" icon={<LucideReact.Sparkles size={14} />}
              disabled={!svConcept.trim()}
              onClick={function() {
                onAction("short_video", { concept: svConcept, platform: svPlatform, category: svCategory, target_duration: svDuration, hook_style: svHookStyle });
              }}>
              Plan 短视频 Project
            </Button>
          </div>
        ) : null}

        {/* ── Photo Story ── */}
        {landingMode === "photo_story" ? (
          <div className="space-y-3">
            {/* Explainer */}
            <div className="p-3 rounded-lg bg-purple-500/8 border border-purple-500/20 text-xs text-purple-300 space-y-1">
              <p className="font-semibold">📸 → 🎬 Photo Story</p>
              <p className="text-purple-400/80">Paste your image file paths below. Each photo will be animated with cinematic motion (zoom, pan, Ken Burns) and woven into a narrative with captions and audio cues.</p>
            </div>

            {/* Image paths */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Image Paths <span className="text-gray-600">(one per line)</span></p>
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none font-mono"
                rows={4}
                placeholder={"/Users/you/Photos/trip1.jpg\n/Users/you/Photos/trip2.jpg\n/Users/you/Photos/trip3.jpg"}
                value={psImagePathsText}
                onChange={function(v) { setPsImagePathsText(v); }}
              />
              <p className="text-xs text-gray-600">
                {psImagePathsText.trim() ? String(psImagePathsText.trim().split("\n").filter(function(l) { return l.trim(); }).length) + " photos" : "No photos yet"}
                {" · "}Supports JPG, PNG, WEBP · Order determines narrative sequence
              </p>
            </div>

            {/* Concept */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Story Theme / Concept</p>
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                rows={2}
                placeholder="What story do these photos tell? e.g., '我们的东京三日游' or 'Product launch event highlights' or 'Before and after home renovation'"
                value={psConcept}
                onChange={function(v) { setPsConcept(v); }}
              />
            </div>

            {/* Optional descriptions */}
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Photo Descriptions <span className="text-gray-600">(optional — one per line, helps AI create better motions)</span></p>
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                rows={3}
                placeholder={"Senso-ji temple at golden hour\nShibuya crossing at night\nRamen shop owner smiling"}
                value={psDescriptions}
                onChange={function(v) { setPsDescriptions(v); }}
              />
            </div>

            {/* Platform + Style */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Platform</p>
                <Select
                  options={[
                    { value: "douyin", label: "🎵 抖音 Douyin" }, { value: "tiktok", label: "🎶 TikTok" },
                    { value: "rednote", label: "📕 小红书" }, { value: "bilibili", label: "📺 Bilibili" },
                    { value: "youtube_shorts", label: "▶️ YT Shorts" }, { value: "wechat", label: "💬 微信视频号" }
                  ]}
                  value={psPlatform}
                  onChange={function(v) { setPsPlatform(v); }}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Style</p>
                <Select
                  options={[
                    { value: "cinematic", label: "Cinematic" }, { value: "vlog", label: "Vlog" },
                    { value: "documentary", label: "Documentary" }, { value: "romantic", label: "Romantic" },
                    { value: "dramatic", label: "Dramatic" }, { value: "travel", label: "Travel" }
                  ]}
                  value={psStyle}
                  onChange={function(v) { setPsStyle(v); }}
                />
              </div>
            </div>

            {/* Duration per photo */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Duration per Photo</p>
                <span className="text-xs font-mono text-purple-400">{String(psDuration)}s / photo
                  {psImagePathsText.trim() ? (" · " + String(psImagePathsText.trim().split("\n").filter(function(l) { return l.trim(); }).length * psDuration) + "s total") : ""}
                </span>
              </div>
              <Slider min={4} max={10} step={1} value={psDuration} onChange={function(v) { setPsDuration(v); }} showValue={false} />
            </div>

            {/* Generate button */}
            <Button variant="primary" icon={<LucideReact.ImagePlay size={14} />}
              disabled={!psImagePathsText.trim() || !psConcept.trim()}
              onClick={function() {
                var paths = psImagePathsText.trim().split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
                var descs = psDescriptions.trim() ? psDescriptions.trim().split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; }) : [];
                var actionParams = { image_paths: paths, concept: psConcept, platform: psPlatform, style: psStyle, duration_per_photo: psDuration };
                if (descs.length > 0) actionParams.image_descriptions = descs;
                onAction("photo_story", actionParams);
              }}>
              Create Photo Story
            </Button>
          </div>
        ) : null}

        {/* ── Single Clip ── */}
        {landingMode === "single" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Scene Description</p>
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                rows={3}
                placeholder="Describe your scene... e.g., close-up of hands typing on keyboard at midnight, neon city lights reflected in rain-covered window"
                value={promptText}
                onChange={function(v) { setPromptText(v); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><p className="text-xs text-gray-500">Style</p><Select options={styleOptions} value={styleVal} onChange={function(v) { setStyleVal(v); }} /></div>
              <div className="space-y-1"><p className="text-xs text-gray-500">Mood</p><Select options={moodOptions} value={moodVal} onChange={function(v) { setMoodVal(v); }} /></div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Duration</p>
                <span className="text-xs font-mono text-purple-400">{String(durationVal)}s</span>
              </div>
              <Slider min={4} max={15} step={1} value={durationVal} onChange={function(v) { setDurationVal(v); }} showValue={false} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><p className="text-xs text-gray-500">Resolution</p><Select options={resolutionOptions} value={resolutionVal} onChange={function(v) { setResolutionVal(v); }} /></div>
              <div className="space-y-1"><p className="text-xs text-gray-500">Aspect Ratio</p><Select options={ratioOptions} value={ratioVal} onChange={function(v) { setRatioVal(v); }} /></div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="border border-gray-600/60 rounded bg-gray-700/30" style={{ width: rPreview.width, height: rPreview.height }} />
                <span className="text-xs text-gray-500">{ratioVal}</span>
              </div>
              <Switch checked={audioEnabled} onChange={function(v) { setAudioEnabled(v); }} label="Audio" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" icon={<LucideReact.Play size={14} />}
                disabled={!promptText.trim()}
                onClick={function() { onAction("generate", { prompt: promptText, duration: durationVal, resolution: resolutionVal, ratio: ratioVal, generate_audio: audioEnabled }); }}>
                Generate
              </Button>
              <Button variant="outline" icon={<LucideReact.Sparkles size={14} />}
                disabled={!promptText.trim()}
                onClick={function() { onAction("craft_prompt", { description: promptText, style: styleVal, mood: moodVal || undefined }); }}>
                Craft Prompt
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── Multi-Scene ── */}
        {landingMode === "multi" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Script / Story</p>
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                rows={5}
                placeholder="Write your full script or story. The AI will decompose it into individual video prompts with captions and audio cues..."
                value={promptText}
                onChange={function(v) { setPromptText(v); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><p className="text-xs text-gray-500">Style</p><Select options={styleOptions} value={styleVal} onChange={function(v) { setStyleVal(v); }} /></div>
              <div className="space-y-1"><p className="text-xs text-gray-500">Scene Duration</p>
                <Select options={[{value:"4",label:"4s"},{value:"5",label:"5s"},{value:"6",label:"6s"},{value:"8",label:"8s"},{value:"10",label:"10s"},{value:"12",label:"12s"}]}
                  value={String(durationVal)} onChange={function(v) { setDurationVal(Number(v)); }} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Platform (optional — for ratio presets)</p>
              <div className="flex gap-1.5 flex-wrap">
                {[{id:"",label:"General"},{id:"douyin",label:"🎵 抖音"},{id:"tiktok",label:"🎶 TikTok"},{id:"rednote",label:"📕 RedNote"},{id:"bilibili",label:"📺 Bilibili"}].map(function(p) {
                  return (
                    <button key={p.id}
                      className={"px-2.5 py-1 rounded-full text-xs transition-colors border " + (svPlatform === p.id ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10")}
                      onClick={function() { setSvPlatform(p.id); }}>
                      {String(p.label)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" icon={<LucideReact.Film size={14} />}
                disabled={!promptText.trim()}
                onClick={function() { onAction("script_to_scenes", { script: promptText, style: styleVal, duration_per_scene: durationVal, platform: svPlatform || undefined, short_video: svPlatform === "douyin" || svPlatform === "tiktok" }); }}>
                Break into Scenes
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── Animate ── */}
        {landingMode === "animate" ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-blue-500/8 border border-blue-500/20 text-xs text-blue-400">
              <p className="font-medium mb-1">Image to Video Animation</p>
              <p className="text-blue-400/80">Tell Enso which image to animate and describe the motion. Supports JPG, PNG, WEBP.</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Motion Description</p>
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                rows={2}
                placeholder="Describe the motion... e.g., gentle camera pan right, hair flowing in wind, clouds drift slowly"
                value={promptText}
                onChange={function(v) { setPromptText(v); }}
              />
            </div>
            <p className="text-xs text-gray-600">To animate an image, type in the chat: "animate this image [path]" or use the Enso file browser to select an image first.</p>
          </div>
        ) : null}

        {/* Recent Generations */}
        {recentEntries.length > 0 ? (
          <div className="space-y-2">
            <Separator />
            <p className="text-xs text-gray-500 font-medium">Recent</p>
            {recentEntries.map(function(entry, i) {
              return (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/4 hover:bg-white/7 transition-colors cursor-pointer"
                  onClick={function() { if (entry.prompt) setPromptText(entry.prompt); }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">{String(entry.prompt || "No prompt")}</p>
                    <p className="text-xs text-gray-600">{String(entry.date || "")}</p>
                  </div>
                  <Badge variant={entry.status === "success" ? "success" : "danger"}>{String(entry.type || "t2v")}</Badge>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Stats */}
        {stats.totalGenerations > 0 ? (
          <div className="flex gap-3 pt-1">
            <Stat label="Total" value={String(stats.totalGenerations || 0)} />
            <Stat label="Success" value={String(stats.successCount || 0)} />
            {stats.failedCount > 0 ? <Stat label="Failed" value={String(stats.failedCount || 0)} /> : null}
            {stats.galleryCount > 0 ? <Stat label="Gallery" value={String(stats.galleryCount || 0)} /> : null}
          </div>
        ) : null}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Generate Result ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_generate") {
    var genUrl = data.url || "";
    var genPrompt = data.prompt || "";
    var genRatio = data.ratio || "9:16";
    var genRatioCss = genRatio.replace(":", "/");

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LucideReact.Video size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">Generated Clip</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline">{String(genRatio)}</Badge>
            <Badge variant="outline">{String(data.resolution || "1080p")}</Badge>
            <Badge variant="outline">{String(data.duration || 5)}s</Badge>
          </div>
        </div>

        {genUrl ? (
          <video src={genUrl} controls className="w-full rounded-xl bg-black" style={{ aspectRatio: genRatioCss, maxHeight: "400px" }} />
        ) : null}

        {/* Prompt section */}
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400">Prompt Used</p>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" icon={<LucideReact.RefreshCw size={11} />}
                onClick={function() { onAction("generate", { prompt: genPrompt, duration: data.duration || 5, resolution: data.resolution || "1080p", ratio: genRatio, generate_audio: data.generateAudio !== false }); }}>
                Regenerate
              </Button>
              <Button variant="ghost" size="sm" icon={<LucideReact.Sparkles size={11} />}
                onClick={function() { onAction("craft_prompt", { description: genPrompt }); }}>
                Refine
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{String(genPrompt)}</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" icon={<LucideReact.Grid3x3 size={13} />}
            onClick={function() { onAction("gallery", {}); }}>Gallery</Button>
          <Button variant="ghost" icon={<LucideReact.Home size={13} />}
            onClick={function() { onAction("view", {}); }}>Studio</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Animate Result ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_animate") {
    var animUrl = data.url || "";
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <LucideReact.ImagePlay size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">Animated Video</span>
          <Badge variant="blue">{String(data.duration || 5)}s</Badge>
        </div>

        {animUrl ? (
          <video src={animUrl} controls className="w-full rounded-xl bg-black" style={{ maxHeight: "400px" }} />
        ) : null}

        {data.prompt ? (
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs font-semibold text-gray-400 mb-1">Motion Applied</p>
            <p className="text-xs text-gray-400">{String(data.prompt)}</p>
          </div>
        ) : null}

        {data.sourceImage ? (
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <LucideReact.Image size={11} />Source: {String(data.sourceImage)}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button variant="outline" icon={<LucideReact.Grid3x3 size={13} />} onClick={function() { onAction("gallery", {}); }}>Gallery</Button>
          <Button variant="ghost" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }}>Studio</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Craft Prompt Result ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_craft_prompt") {
    var crafted = data.craftedPrompt || "";
    var variants = data.variants || [];
    var displayPrompt = editingPrompt ? editPromptText : crafted;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <LucideReact.Sparkles size={16} className="text-yellow-400" />
          <span className="text-sm font-semibold text-white">Crafted Prompt</span>
          {data.suggestedRatio ? <Badge variant="outline">{String(data.suggestedRatio)}</Badge> : null}
          {data.suggestedDuration ? <Badge variant="outline">{String(data.suggestedDuration)}s</Badge> : null}
        </div>

        {data.originalDescription ? (
          <p className="text-xs text-gray-600 italic">From: "{String(data.originalDescription).slice(0, 80)}"</p>
        ) : null}

        {/* Main crafted prompt */}
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
          {editingPrompt ? (
            <textarea
              className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 resize-none"
              rows={4}
              value={editPromptText}
              onChange={function(v) { setEditPromptText(v); }}
            />
          ) : (
            <p className="text-xs text-gray-300 leading-relaxed">{String(crafted)}</p>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {!editingPrompt ? (
              <Button variant="ghost" size="sm" icon={<LucideReact.Edit size={11} />}
                onClick={function() { setEditPromptText(crafted); setEditingPrompt(true); }}>Edit</Button>
            ) : (
              <Button variant="ghost" size="sm" icon={<LucideReact.Check size={11} />}
                onClick={function() { setEditingPrompt(false); }}>Done</Button>
            )}
            <Button variant="primary" size="sm" icon={<LucideReact.Play size={11} />}
              onClick={function() { onAction("generate", { prompt: displayPrompt, duration: data.suggestedDuration || 5, resolution: "1080p", ratio: data.suggestedRatio || "9:16", generate_audio: true }); }}>
              Generate
            </Button>
          </div>
        </div>

        {data.styleNotes ? (
          <div className="p-2 rounded-lg bg-yellow-500/8 border border-yellow-500/20 text-xs text-yellow-400/90">
            {String(data.styleNotes)}
          </div>
        ) : null}

        {/* Variants */}
        {variants.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400">Variants</p>
            {variants.map(function(v, i) {
              return (
                <div key={i} className="rounded-lg border border-white/10 bg-white/3 p-2.5 space-y-2">
                  <p className="text-xs font-medium text-gray-300">{String(v.label || "Variant " + (i + 1))}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{String(v.prompt || "")}</p>
                  <Button variant="outline" size="sm" icon={<LucideReact.Play size={11} />}
                    onClick={function() { onAction("generate", { prompt: v.prompt, duration: data.suggestedDuration || 5, resolution: "1080p", ratio: data.suggestedRatio || "9:16", generate_audio: true }); }}>
                    Generate This
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}

        <Button variant="ghost" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }}>Studio</Button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Script to Scenes Storyboard ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_script_to_scenes") {
    var sbScenes = data.scenes || [];
    var sbPlatform = data.platform || "";
    var sbRatio = data.defaultRatio || "16:9";
    var sbIsShort = data.isShortVideo;
    var sbTotal = data.totalDuration || 0;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LucideReact.Film size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">Storyboard</span>
            <Badge variant="purple">{String(sbScenes.length)} scenes</Badge>
            <Badge variant="outline">{String(sbTotal)}s</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {sbPlatform ? <Badge variant="outline">{String(PLATFORM_ICONS[sbPlatform] || "🎬")} {String(PLATFORM_LABELS[sbPlatform] || sbPlatform)}</Badge> : null}
            {sbIsShort ? <Badge variant="warning">短视频</Badge> : null}
            {data.cached ? <Badge variant="outline">cached</Badge> : null}
          </div>
        </div>

        {/* Scenes */}
        <div className="space-y-2">
          {sbScenes.map(function(scene, idx) {
            var isExp = expandedScene === scene.sceneNumber;
            return (
              <div key={idx} className={"rounded-lg border overflow-hidden transition-colors " + (isExp ? "border-white/20" : "border-white/10")}>
                {/* Scene header */}
                <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={function() { setExpandedScene(isExp ? null : scene.sceneNumber); }}>
                  <span className="text-xs font-mono text-purple-400 w-5 flex-shrink-0">{String(scene.sceneNumber)}</span>
                  <span className="text-xs text-white font-medium flex-1 truncate">{String(scene.title || "Scene " + scene.sceneNumber)}</span>
                  {scene.purpose ? <Badge variant={purposeVariant(scene.purpose)}>{String(scene.purpose)}</Badge> : null}
                  <span className="text-xs text-gray-500">{String(scene.suggestedDuration || 5)}s</span>
                  <span className="text-xs text-gray-600">{String(scene.suggestedRatio || sbRatio)}</span>
                  <LucideReact.ChevronDown size={11} className={"text-gray-500 flex-shrink-0 transition-transform " + (isExp ? "rotate-180" : "")} />
                </div>

                {/* Expanded scene details */}
                {isExp ? (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-white/8 bg-white/3">
                    <p className="text-xs text-gray-300 leading-relaxed mt-2">{String(scene.prompt || "")}</p>

                    {scene.caption ? (
                      <div className="flex items-start gap-2 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-2.5 py-1.5">
                        <LucideReact.Type size={11} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="text-xs text-yellow-300 font-medium">"{String(scene.caption)}"</span>
                          {scene.mood ? <span className="text-xs text-gray-500 ml-2">· {String(scene.mood)}</span> : null}
                        </div>
                      </div>
                    ) : null}

                    {scene.audioNote ? (
                      <div className="flex items-start gap-2">
                        <LucideReact.Music size={11} className="text-purple-400/70 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-gray-500">{String(scene.audioNote)}</span>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <Button variant="primary" size="sm" icon={<LucideReact.Play size={11} />}
                        onClick={function() { onAction("generate", { prompt: scene.prompt, duration: scene.suggestedDuration || 5, resolution: "1080p", ratio: scene.suggestedRatio || sbRatio, generate_audio: true }); }}>
                        Generate
                      </Button>
                      <span className="text-xs text-gray-600">→ {String(scene.transition || "cut")}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Batch generate button */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={<LucideReact.Zap size={13} />}
            onClick={function() { onAction("batch_generate", { scenes: sbScenes.map(function(s) { return { number: s.sceneNumber, title: s.title, prompt: s.prompt, duration: s.suggestedDuration, suggestedRatio: s.suggestedRatio || sbRatio, caption: s.caption || "", audioNote: s.audioNote || "", purpose: s.purpose || "content" }; }), ratio: sbRatio, resolution: "1080p", generate_audio: true }); }}>
            Generate All Scenes
          </Button>
          <Button variant="ghost" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }}>Studio</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Gallery ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_gallery") {
    var videos = data.videos || [];
    var galleryTotal = data.totalCount || 0;
    var gallerySize = data.totalSizeMB || 0;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LucideReact.Grid3x3 size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">Video Gallery</span>
            <Badge variant="purple">{String(galleryTotal)} videos</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">{String(gallerySize.toFixed ? gallerySize.toFixed(1) : gallerySize)} MB</span>
            <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }}>Studio</Button>
          </div>
        </div>

        {videos.length === 0 ? (
          <EmptyState icon={<LucideReact.Video size={24} />} title="No videos yet" description="Generate your first video in the studio." />
        ) : (
          <div className="space-y-3">
            {videos.map(function(v, i) {
              return (
                <div key={i} className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
                  {v.url ? (
                    <video src={v.url} controls className="w-full bg-black" style={{ maxHeight: "280px" }} />
                  ) : null}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={v.type === "i2v" ? "blue" : "purple"}>{String(v.type || "t2v").toUpperCase()}</Badge>
                      <span className="text-xs text-gray-600">{String(v.date || "")} · {String(v.sizeMB || 0)} MB</span>
                    </div>
                    {v.prompt ? <p className="text-xs text-gray-400 line-clamp-2">{String(v.prompt)}</p> : null}
                    <Button variant="outline" size="sm" icon={<LucideReact.RefreshCw size={11} />}
                      onClick={function() { if (v.prompt) onAction("generate", { prompt: v.prompt, duration: 5, resolution: "1080p", ratio: "9:16", generate_audio: true }); }}>
                      Regenerate
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── History ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_history") {
    var histEntries = data.entries || [];
    var histTotal = data.totalGenerations || 0;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LucideReact.Clock size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">Generation History</span>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-3">
              <Stat label="Total" value={String(data.totalGenerations || 0)} />
              <Stat label="T2V" value={String(data.t2vCount || 0)} />
              <Stat label="I2V" value={String(data.i2vCount || 0)} />
            </div>
            <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }}>Studio</Button>
          </div>
        </div>

        {histEntries.length === 0 ? (
          <EmptyState icon={<LucideReact.Clock size={24} />} title="No history yet" description="Generated videos will appear here." />
        ) : (
          <div className="space-y-2">
            {histEntries.map(function(entry, i) {
              return (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/4 hover:bg-white/7 transition-colors">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-gray-300 line-clamp-2">{String(entry.prompt || "")}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-600">{String(entry.date || "")}</span>
                      <Badge variant={entry.type === "i2v" ? "blue" : "purple"}>{String(entry.type || "t2v").toUpperCase()}</Badge>
                      <span className="text-xs text-gray-600">{String(entry.duration || "")}s {String(entry.ratio || "")}</span>
                      <Badge variant={entry.status === "success" ? "success" : "danger"}>{String(entry.status || "")}</Badge>
                    </div>
                  </div>
                  {entry.status === "success" && entry.prompt ? (
                    <Button variant="ghost" size="sm" icon={<LucideReact.RotateCcw size={11} />}
                      onClick={function() { onAction("generate", { prompt: entry.prompt, duration: entry.duration || 5, resolution: entry.resolution || "1080p", ratio: entry.ratio || "9:16", generate_audio: true }); }} />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}

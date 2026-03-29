export default function GeneratedUI({ data, onAction }) {
  var [showFullPrompt, setShowFullPrompt] = useState(false);
  var [selectedVideo, setSelectedVideo] = useState(null);
  var [copiedPrompt, setCopiedPrompt] = useState(false);
  var [expandedScene, setExpandedScene] = useState(null);
  var [selectedEntry, setSelectedEntry] = useState(null);
  var [historySearch, setHistorySearch] = useState("");

  // ── Landing view state ──
  var [promptText, setPromptText] = useState("");
  var [durationVal, setDurationVal] = useState(5);
  var [resolutionVal, setResolutionVal] = useState("720p");
  var [ratioVal, setRatioVal] = useState("16:9");
  var [styleVal, setStyleVal] = useState("cinematic");
  var [moodVal, setMoodVal] = useState("");
  var [audioEnabled, setAudioEnabled] = useState(true);
  var [landingMode, setLandingMode] = useState("single");

  // ── Generate result editing state ──
  var [editingPrompt, setEditingPrompt] = useState(false);
  var [editPromptText, setEditPromptText] = useState("");
  var [editDuration, setEditDuration] = useState(5);
  var [editResolution, setEditResolution] = useState("720p");
  var [editRatio, setEditRatio] = useState("16:9");
  var [editAudio, setEditAudio] = useState(true);

  var tool = data?.tool || "";
  var error = data?.error || "";

  // ── Shared ratio preview helper ──
  var ratioPreviewStyle = function(ratio) {
    var map = {
      "16:9": { width: 48, height: 27 },
      "9:16": { width: 27, height: 48 },
      "1:1": { width: 36, height: 36 },
      "4:3": { width: 40, height: 30 },
      "3:4": { width: 30, height: 40 },
      "21:9": { width: 56, height: 24 }
    };
    return map[ratio] || map["16:9"];
  };

  // ── Error State ──
  if (error) {
    return (
      <UICard accent="red" header="Error">
        <div className="space-y-3">
          <Badge variant="danger">{String(error)}</Badge>
          <div className="flex gap-2 flex-wrap">
            <Button variant="primary" icon={<LucideReact.Home size={14} />} onClick={function() { onAction("view", {}); }}>
              Studio Home
            </Button>
            <Button variant="outline" icon={<LucideReact.Grid3x3 size={14} />} onClick={function() { onAction("gallery", {}); }}>
              Gallery
            </Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Landing / Setup View ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_view") {
    var stats = data.stats || {};
    var recentEntries = data.recentEntries || [];

    var resolutionOptions = [
      { value: "480p", label: "480p" },
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080p" }
    ];
    var ratioOptions = [
      { value: "16:9", label: "16:9 Landscape" },
      { value: "9:16", label: "9:16 Portrait" },
      { value: "1:1", label: "1:1 Square" },
      { value: "4:3", label: "4:3 Classic" },
      { value: "21:9", label: "21:9 Ultra" }
    ];
    var styleOptions = [
      { value: "cinematic", label: "Cinematic" },
      { value: "anime", label: "Anime" },
      { value: "realistic", label: "Realistic" },
      { value: "noir", label: "Noir" },
      { value: "fantasy", label: "Fantasy" },
      { value: "sci-fi", label: "Sci-Fi" },
      { value: "documentary", label: "Documentary" },
      { value: "horror", label: "Horror" },
      { value: "comedy", label: "Comedy" }
    ];
    var moodOptions = [
      { value: "", label: "Auto" },
      { value: "dramatic", label: "Dramatic" },
      { value: "serene", label: "Serene" },
      { value: "mysterious", label: "Mysterious" },
      { value: "energetic", label: "Energetic" },
      { value: "melancholic", label: "Melancholic" },
      { value: "epic", label: "Epic" },
      { value: "playful", label: "Playful" },
      { value: "dark", label: "Dark" }
    ];

    var rPreview = ratioPreviewStyle(ratioVal);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Clapperboard size={20} className="text-purple-400" />
            <span className="text-base font-bold text-white">Video Studio</span>
          </div>
          <div className="flex items-center gap-1">
            {stats.galleryCount > 0 ? (
              <Button variant="ghost" size="sm" icon={<LucideReact.Grid3x3 size={13} />} onClick={function() { onAction("gallery", {}); }}>
                {String(stats.galleryCount)}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" icon={<LucideReact.Clock size={13} />} onClick={function() { onAction("history", {}); }} />
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={landingMode === "single" ? "primary" : "outline"}
            size="sm"
            icon={<LucideReact.Video size={13} />}
            onClick={function() { setLandingMode("single"); }}
          >
            Single Clip
          </Button>
          <Button
            variant={landingMode === "script" ? "primary" : "outline"}
            size="sm"
            icon={<LucideReact.Film size={13} />}
            onClick={function() { setLandingMode("script"); }}
          >
            Multi-Scene
          </Button>
        </div>

        {/* Prompt Input — textarea for multi-line */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-400">
            {landingMode === "single" ? "Scene Description" : "Script / Story"}
          </p>
          <textarea
            className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
            rows={landingMode === "single" ? 3 : 5}
            placeholder={landingMode === "single"
              ? "Describe your scene... e.g., aerial shot over misty mountains at golden hour with cinematic lighting"
              : "Write your full script or story with multiple scenes..."}
            value={promptText}
            onChange={function(e) { setPromptText(e.target.value); }}
          />
          <p className="text-xs text-gray-600">
            {landingMode === "single"
              ? "Include camera movement, lighting, and style for best results"
              : "The AI will decompose your narrative into individual video prompts"}
          </p>
        </div>

        {/* Settings Grid — compact 2-column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LucideReact.Settings size={13} className="text-gray-500" />
            <p className="text-xs font-medium text-gray-400">Settings</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Style</p>
              <Select options={styleOptions} value={styleVal} onChange={function(v) { setStyleVal(v); }} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Mood</p>
              <Select options={moodOptions} value={moodVal} onChange={function(v) { setMoodVal(v); }} />
            </div>
          </div>

          {/* Duration slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Duration</p>
              <span className="text-xs font-mono text-purple-400">{String(durationVal) + "s"}</span>
            </div>
            <Slider min={4} max={12} step={1} value={durationVal} onChange={function(v) { setDurationVal(v); }} showValue={false} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Resolution</p>
              <Select options={resolutionOptions} value={resolutionVal} onChange={function(v) { setResolutionVal(v); }} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Aspect Ratio</p>
              <Select options={ratioOptions} value={ratioVal} onChange={function(v) { setRatioVal(v); }} />
            </div>
          </div>

          {/* Ratio preview + Audio toggle row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="border border-gray-600/60 rounded bg-gray-700/30"
                style={{ width: rPreview.width, height: rPreview.height }}
              />
              <span className="text-xs text-gray-500">{ratioVal}</span>
            </div>
            <Switch checked={audioEnabled} onChange={function(v) { setAudioEnabled(v); }} label="Audio" />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {landingMode === "single" ? (
            <Fragment>
              <Button
                variant="primary"
                icon={<LucideReact.Play size={14} />}
                disabled={!promptText.trim()}
                onClick={function() {
                  onAction("generate", {
                    prompt: promptText,
                    duration: durationVal,
                    resolution: resolutionVal,
                    ratio: ratioVal,
                    generate_audio: audioEnabled
                  });
                }}
              >
                Generate
              </Button>
              <Button
                variant="outline"
                icon={<LucideReact.Sparkles size={14} />}
                disabled={!promptText.trim()}
                onClick={function() {
                  onAction("craft_prompt", {
                    description: promptText,
                    style: styleVal,
                    mood: moodVal || undefined
                  });
                }}
              >
                Craft Prompt
              </Button>
            </Fragment>
          ) : (
            <Fragment>
              <Button
                variant="primary"
                icon={<LucideReact.Film size={14} />}
                disabled={!promptText.trim()}
                onClick={function() {
                  onAction("script_to_scenes", {
                    script: promptText,
                    style: styleVal,
                    duration_per_scene: durationVal
                  });
                }}
              >
                Break into Scenes
              </Button>
              <Button
                variant="outline"
                icon={<LucideReact.Sparkles size={14} />}
                disabled={!promptText.trim()}
                onClick={function() {
                  onAction("craft_prompt", {
                    description: promptText,
                    style: styleVal,
                    mood: moodVal || undefined
                  });
                }}
              >
                Craft Prompt
              </Button>
            </Fragment>
          )}
        </div>

        {/* Recent Generations */}
        {recentEntries.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Recent</p>
            {recentEntries.map(function(entry, i) {
              return (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/8 transition-colors cursor-pointer"
                  onClick={function() {
                    if (entry.prompt) setPromptText(entry.prompt);
                  }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">{String(entry.prompt || "No prompt")}</p>
                    <p className="text-xs text-gray-600">{String(entry.date || "")}</p>
                  </div>
                  <Badge variant={entry.status === "success" ? "success" : "danger"}>
                    {String(entry.type || "t2v").toUpperCase()}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Generate / Animate Result View ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_generate" || tool === "enso_video_studio_animate") {
    var videoUrl = data.url || data.videoUrl || "";
    var prompt = data.prompt || "";
    var duration = data.duration || 0;
    var resolution = data.resolution || "720p";
    var ratio = data.ratio || "16:9";
    var hasAudio = data.generateAudio !== false;
    var isAnimate = tool === "enso_video_studio_animate";
    var taskId = data.taskId || "";
    var sourceImage = data.sourceImage || "";

    var resOptGen = [
      { value: "480p", label: "480p" },
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080p" }
    ];
    var ratioOptGen = [
      { value: "16:9", label: "16:9" },
      { value: "9:16", label: "9:16" },
      { value: "1:1", label: "1:1" },
      { value: "4:3", label: "4:3" },
      { value: "21:9", label: "21:9" }
    ];

    return (
      <div className="space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={isAnimate ? "info" : "success"}>
              {isAnimate ? "Image-to-Video" : "Generated"}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }} />
            <Button variant="ghost" size="sm" icon={<LucideReact.Grid3x3 size={13} />} onClick={function() { onAction("gallery", {}); }} />
          </div>
        </div>

        {/* Video Player — prominent */}
        {videoUrl ? (
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
            <EnsoUI.VideoPlayer src={videoUrl} />
          </div>
        ) : (
          <EmptyState icon={<LucideReact.VideoOff size={24} />} title="No Video" description="Video URL was not returned" />
        )}

        {/* Compact stats row */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline">{String(duration) + "s"}</Badge>
          <Badge variant="outline">{String(resolution)}</Badge>
          <Badge variant="outline">{String(ratio)}</Badge>
          {hasAudio ? <Badge variant="outline">Audio</Badge> : null}
          {isAnimate && sourceImage ? <Badge variant="info">From image</Badge> : null}
        </div>

        {/* Prompt section — toggleable edit mode */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-400">Prompt</p>
            <Button variant="ghost" size="sm"
              icon={editingPrompt ? <LucideReact.X size={12} /> : <LucideReact.Pencil size={12} />}
              onClick={function() {
                if (!editingPrompt) {
                  setEditPromptText(prompt);
                  setEditDuration(duration || 5);
                  setEditResolution(resolution);
                  setEditRatio(ratio);
                  setEditAudio(hasAudio);
                }
                setEditingPrompt(!editingPrompt);
              }}>
              {editingPrompt ? "Cancel" : "Edit"}
            </Button>
          </div>

          {editingPrompt ? (
            <div className="space-y-3 p-3 rounded-lg border border-violet-500/30 bg-violet-500/5">
              <textarea
                className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 text-xs py-2 px-3 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                rows={4}
                value={editPromptText}
                onChange={function(e) { setEditPromptText(e.target.value); }}
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Duration</p>
                  <Slider min={4} max={12} step={1} value={editDuration} onChange={function(v) { setEditDuration(v); }} showValue={true} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Resolution</p>
                  <Select options={resOptGen} value={editResolution} onChange={function(v) { setEditResolution(v); }} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Ratio</p>
                  <Select options={ratioOptGen} value={editRatio} onChange={function(v) { setEditRatio(v); }} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Switch checked={editAudio} onChange={function(v) { setEditAudio(v); }} label="Audio" />
                <Button variant="primary" size="sm" icon={<LucideReact.Play size={13} />}
                  disabled={!editPromptText.trim()}
                  onClick={function() {
                    onAction("generate", {
                      prompt: editPromptText,
                      duration: editDuration,
                      resolution: editResolution,
                      ratio: editRatio,
                      generate_audio: editAudio
                    });
                  }}>
                  Regenerate
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-white/5">
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                {showFullPrompt || prompt.length <= 200 ? String(prompt) : String(prompt.slice(0, 200)) + "..."}
              </p>
              {prompt.length > 200 ? (
                <Button variant="ghost" size="sm" onClick={function() { setShowFullPrompt(!showFullPrompt); }}>
                  {showFullPrompt ? "Less" : "More"}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* Source image for animate */}
        {isAnimate && sourceImage ? (
          <div className="p-2 rounded-lg bg-white/5">
            <p className="text-xs text-gray-500">Source: {String(sourceImage)}</p>
          </div>
        ) : null}

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={<LucideReact.Plus size={14} />} onClick={function() { onAction("view", {}); }}>
            New
          </Button>
          <Button variant="outline" icon={<LucideReact.RefreshCw size={14} />} onClick={function() {
            onAction("generate", { prompt: prompt, duration: duration, resolution: resolution, ratio: ratio, generate_audio: hasAudio });
          }}>
            Redo
          </Button>
          <Button variant="outline" icon={<LucideReact.Wand2 size={14} />} onClick={function() {
            onAction("craft_prompt", { description: prompt });
          }}>
            Refine
          </Button>
        </div>

        {taskId ? (
          <p className="text-xs text-gray-600">Task: {String(taskId)}</p>
        ) : null}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Craft Prompt View ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_craft_prompt") {
    var craftedPrompt = data.craftedPrompt || "";
    var originalDesc = data.originalDescription || "";
    var suggestedDuration = data.suggestedDuration || 5;
    var suggestedRatio = data.suggestedRatio || "16:9";
    var suggestedResolution = data.suggestedResolution || "720p";
    var styleNotes = data.styleNotes || "";
    var promptVariants = data.variants || [];
    var isCached = data.cached || false;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Sparkles size={18} className="text-amber-400" />
            <span className="text-base font-semibold text-white">Crafted Prompt</span>
          </div>
          <div className="flex items-center gap-1">
            {isCached ? <Badge variant="outline">Cached</Badge> : null}
            <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }} />
          </div>
        </div>

        {originalDesc ? (
          <div className="p-2 rounded-lg bg-white/5">
            <p className="text-xs text-gray-500 mb-1">Your idea</p>
            <p className="text-xs text-gray-400">{String(originalDesc)}</p>
          </div>
        ) : null}

        {/* Main crafted prompt — prominent */}
        <UICard accent="amber" header="Optimized Prompt">
          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{String(craftedPrompt)}</p>
        </UICard>

        {styleNotes ? (
          <div className="p-2 rounded-lg bg-white/5">
            <p className="text-xs text-gray-500 mb-1">Style notes</p>
            <p className="text-xs text-gray-400">{String(styleNotes)}</p>
          </div>
        ) : null}

        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline">{String(suggestedDuration) + "s"}</Badge>
          <Badge variant="outline">{String(suggestedRatio)}</Badge>
          <Badge variant="outline">{String(suggestedResolution)}</Badge>
        </div>

        {/* Variants */}
        {promptVariants.length > 0 ? (
          <Accordion
            type="single"
            items={promptVariants.map(function(v, i) {
              return {
                value: "var_" + i,
                title: String(v.label || "Variant " + (i + 1)),
                content: (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 whitespace-pre-wrap">{String(v.prompt || "")}</p>
                    <Button variant="primary" size="sm" icon={<LucideReact.Play size={13} />}
                      onClick={function() { onAction("generate", { prompt: v.prompt, duration: suggestedDuration, resolution: suggestedResolution, ratio: suggestedRatio, generate_audio: true }); }}>
                      Generate
                    </Button>
                  </div>
                )
              };
            })}
          />
        ) : null}

        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={<LucideReact.Play size={14} />}
            onClick={function() { onAction("generate", { prompt: craftedPrompt, duration: suggestedDuration, resolution: suggestedResolution, ratio: suggestedRatio, generate_audio: true }); }}>
            Generate Video
          </Button>
          <Button variant="outline" icon={<LucideReact.Film size={14} />}
            onClick={function() { onAction("script_to_scenes", { script: originalDesc || craftedPrompt }); }}>
            Multi-Scene
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Script to Scenes (Storyboard) View ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_script_to_scenes") {
    var scenes = data.scenes || [];
    var totalScenes = data.totalScenes || scenes.length;
    var totalDuration = data.totalDuration || 0;
    var storyStyle = data.style || "cinematic";
    var originalScript = data.originalScript || "";
    var isCachedScenes = data.cached || false;

    if (scenes.length === 0) {
      return (
        <EmptyState
          icon={<LucideReact.Film size={32} />}
          title="No Scenes Generated"
          description="Could not decompose the script into scenes. Try a more detailed script."
          action={
            <div className="flex gap-2">
              <Button variant="primary" icon={<LucideReact.RefreshCw size={14} />} onClick={function() { onAction("script_to_scenes", { script: originalScript, style: storyStyle }); }}>Retry</Button>
              <Button variant="outline" icon={<LucideReact.Home size={14} />} onClick={function() { onAction("view", {}); }}>Studio</Button>
            </div>
          }
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Film size={18} className="text-amber-400" />
            <span className="text-base font-semibold text-white">Storyboard</span>
          </div>
          <div className="flex items-center gap-1">
            {isCachedScenes ? <Badge variant="outline">Cached</Badge> : null}
            <Badge variant="info">{String(totalScenes) + " scenes"}</Badge>
            <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }} />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline">{String(totalDuration) + "s total"}</Badge>
          <Badge variant="outline">{String(storyStyle)}</Badge>
        </div>

        {originalScript ? (
          <Accordion
            type="single"
            items={[{
              value: "script",
              title: "Original Script",
              content: <p className="text-xs text-gray-400 whitespace-pre-wrap">{String(originalScript)}</p>
            }]}
          />
        ) : null}

        <div className="space-y-3">
          {scenes.map(function(scene, i) {
            var sceneNum = scene.sceneNumber || (i + 1);
            var sceneTitle = scene.title || "Scene " + sceneNum;
            var scenePrompt = scene.prompt || "";
            var sceneDuration = scene.suggestedDuration || 5;
            var sceneRatio = scene.suggestedRatio || "16:9";
            var sceneMood = scene.mood || "";
            var accentColors = ["violet", "indigo", "purple", "cyan", "teal", "amber"];
            var accent = accentColors[i % accentColors.length];

            return (
              <UICard key={i} accent={accent} header={"#" + String(sceneNum) + " " + String(sceneTitle)}>
                <div className="space-y-2">
                  <p className="text-xs text-gray-200 whitespace-pre-wrap leading-relaxed">{String(scenePrompt)}</p>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="outline">{String(sceneDuration) + "s"}</Badge>
                    <Badge variant="outline">{String(sceneRatio)}</Badge>
                    {sceneMood ? <Badge variant="info">{String(sceneMood)}</Badge> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" icon={<LucideReact.Play size={13} />}
                      onClick={function() { onAction("generate", { prompt: scenePrompt, duration: sceneDuration, resolution: "720p", ratio: sceneRatio, generate_audio: true }); }}>
                      Generate
                    </Button>
                    <Button variant="ghost" size="sm" icon={<LucideReact.Wand2 size={13} />}
                      onClick={function() { onAction("craft_prompt", { description: scenePrompt, style: storyStyle, mood: sceneMood }); }}>
                      Refine
                    </Button>
                  </div>
                </div>
              </UICard>
            );
          })}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={<LucideReact.Home size={14} />} onClick={function() { onAction("view", {}); }}>
            New Project
          </Button>
          <Button variant="outline" icon={<LucideReact.Grid3x3 size={14} />} onClick={function() { onAction("gallery", {}); }}>
            Gallery
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Gallery View ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_gallery") {
    var videos = data.videos || [];
    var totalCount = data.totalCount || videos.length;
    var totalSizeMB = data.totalSizeMB || 0;

    if (videos.length === 0) {
      return (
        <EmptyState
          icon={<LucideReact.Film size={32} />}
          title="No Videos Yet"
          description="Generate your first video to see it here"
          action={<Button variant="primary" icon={<LucideReact.Home size={14} />} onClick={function() { onAction("view", {}); }}>Open Studio</Button>}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Film size={18} className="text-cyan-400" />
            <span className="text-base font-semibold text-white">Gallery</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="info">{String(totalCount)}</Badge>
            <Badge variant="outline">{String(totalSizeMB) + " MB"}</Badge>
            <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }} />
          </div>
        </div>

        {selectedVideo ? (
          <div className="space-y-3">
            {/* Full video player */}
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
              <EnsoUI.VideoPlayer src={selectedVideo.url || ""} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-1 flex-wrap">
                <Badge variant={selectedVideo.type === "i2v" ? "info" : "success"}>{selectedVideo.type === "i2v" ? "I2V" : "T2V"}</Badge>
                <Badge variant="outline">{String(selectedVideo.date || "")}</Badge>
                {selectedVideo.sizeMB ? <Badge variant="outline">{String(selectedVideo.sizeMB) + " MB"}</Badge> : null}
              </div>
              <Button variant="ghost" size="sm" icon={<LucideReact.ArrowLeft size={13} />} onClick={function() { setSelectedVideo(null); }}>
                Back
              </Button>
            </div>

            {selectedVideo.prompt ? (
              <div className="p-2 rounded-lg bg-white/5">
                <p className="text-xs text-gray-300 whitespace-pre-wrap">{String(selectedVideo.prompt)}</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" icon={<LucideReact.RefreshCw size={12} />}
                    onClick={function() { onAction("generate", { prompt: selectedVideo.prompt }); }}>
                    Regenerate
                  </Button>
                  <Button variant="ghost" size="sm" icon={<LucideReact.Wand2 size={12} />}
                    onClick={function() { onAction("craft_prompt", { description: selectedVideo.prompt }); }}>
                    Refine
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {videos.map(function(v, i) {
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/8 transition-colors cursor-pointer"
                  onClick={function() { setSelectedVideo(v); }}>
                  <div className="w-8 h-8 rounded bg-gray-700/50 flex items-center justify-center shrink-0">
                    <LucideReact.Play size={14} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200 truncate">{v.prompt ? String(v.prompt).slice(0, 60) : String(v.name || "Video " + (i + 1))}</p>
                    <p className="text-xs text-gray-600">{String(v.date || "")} {v.sizeMB ? " / " + String(v.sizeMB) + " MB" : ""}</p>
                  </div>
                  <Badge variant={v.type === "i2v" ? "info" : "success"}>{v.type === "i2v" ? "I2V" : "T2V"}</Badge>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={<LucideReact.Plus size={14} />} onClick={function() { onAction("view", {}); }}>
            New Video
          </Button>
          <Button variant="outline" icon={<LucideReact.Clock size={14} />} onClick={function() { onAction("history", {}); }}>
            History
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── History View ──
  // ══════════════════════════════════════════════════════════════════════
  if (tool === "enso_video_studio_history") {
    var entries = data.entries || [];
    var totalGenerations = data.totalGenerations || entries.length;
    var t2vCount = data.t2vCount || 0;
    var i2vCount = data.i2vCount || 0;
    var successCount = data.successCount || 0;
    var failedCount = data.failedCount || 0;

    // Client-side search filtering
    var displayEntries = entries;
    if (historySearch) {
      var searchLower = historySearch.toLowerCase();
      displayEntries = entries.filter(function(e) {
        return (e.prompt || "").toLowerCase().indexOf(searchLower) >= 0;
      });
    }

    if (entries.length === 0) {
      return (
        <EmptyState
          icon={<LucideReact.Clock size={32} />}
          title="No History"
          description="Your video generation history will appear here"
          action={<Button variant="primary" icon={<LucideReact.Home size={14} />} onClick={function() { onAction("view", {}); }}>Open Studio</Button>}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Clock size={18} className="text-emerald-400" />
            <span className="text-base font-semibold text-white">History</span>
          </div>
          <Button variant="ghost" size="sm" icon={<LucideReact.Home size={13} />} onClick={function() { onAction("view", {}); }} />
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Stat label="Total" value={String(totalGenerations)} accent="emerald" />
          <Stat label="T2V" value={String(t2vCount)} accent="purple" />
          <Stat label="I2V" value={String(i2vCount)} accent="indigo" />
          <Stat label="Success" value={totalGenerations > 0 ? String(Math.round(successCount / totalGenerations * 100)) + "%" : "--"} accent={failedCount > 0 ? "amber" : "emerald"} />
        </div>

        <Input
          icon={<LucideReact.Search size={13} />}
          placeholder="Search prompts..."
          value={historySearch}
          onChange={function(v) { setHistorySearch(v); }}
        />

        {selectedEntry ? (
          <div className="space-y-3">
            {selectedEntry.url ? (
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
                <EnsoUI.VideoPlayer src={selectedEntry.url} />
              </div>
            ) : null}
            <div className="p-2 rounded-lg bg-white/5">
              <p className="text-xs text-gray-300 whitespace-pre-wrap">{String(selectedEntry.prompt || "")}</p>
            </div>
            <div className="flex gap-1 flex-wrap">
              <Badge variant={selectedEntry.type === "i2v" ? "info" : "success"}>{selectedEntry.type === "i2v" ? "I2V" : "T2V"}</Badge>
              <Badge variant="outline">{String(selectedEntry.duration || "-") + "s"}</Badge>
              <Badge variant="outline">{String(selectedEntry.resolution || "720p")}</Badge>
              <Badge variant={selectedEntry.status === "success" ? "success" : "danger"}>{String(selectedEntry.status || "unknown")}</Badge>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedEntry.prompt ? (
                <Fragment>
                  <Button variant="primary" size="sm" icon={<LucideReact.RefreshCw size={13} />}
                    onClick={function() { onAction("generate", { prompt: selectedEntry.prompt, duration: selectedEntry.duration, resolution: selectedEntry.resolution, ratio: selectedEntry.ratio }); }}>
                    Regenerate
                  </Button>
                  <Button variant="outline" size="sm" icon={<LucideReact.Wand2 size={13} />}
                    onClick={function() { onAction("craft_prompt", { description: selectedEntry.prompt }); }}>
                    Refine
                  </Button>
                </Fragment>
              ) : null}
              <Button variant="ghost" size="sm" icon={<LucideReact.ArrowLeft size={13} />} onClick={function() { setSelectedEntry(null); }}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {displayEntries.map(function(e, i) {
              return (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/8 transition-colors cursor-pointer"
                  onClick={function() { setSelectedEntry(e); }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">{String((e.prompt || "").slice(0, 60))}{(e.prompt || "").length > 60 ? "..." : ""}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-gray-600">{String(e.date || "")}</span>
                      <span className="text-xs text-gray-600">{String(e.duration || "-") + "s"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={e.type === "i2v" ? "info" : "success"}>{String(e.type === "i2v" ? "I2V" : "T2V")}</Badge>
                    <Badge variant={e.status === "success" ? "success" : "danger"}>
                      {e.status === "success" ? <LucideReact.Check size={10} /> : <LucideReact.X size={10} />}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={<LucideReact.Plus size={14} />} onClick={function() { onAction("view", {}); }}>
            New Video
          </Button>
          <Button variant="outline" icon={<LucideReact.Grid3x3 size={14} />} onClick={function() { onAction("gallery", {}); }}>
            Gallery
          </Button>
        </div>
      </div>
    );
  }

  // ── Default / Unknown Tool → Redirect to Studio ──
  return (
    <EmptyState
      icon={<LucideReact.Clapperboard size={32} />}
      title="Video Studio"
      description="Create AI videos from text prompts or images"
      action={
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={<LucideReact.Home size={14} />} onClick={function() { onAction("view", {}); }}>
            Open Studio
          </Button>
          <Button variant="outline" icon={<LucideReact.Grid3x3 size={14} />} onClick={function() { onAction("gallery", {}); }}>
            Gallery
          </Button>
        </div>
      }
    />
  );
}

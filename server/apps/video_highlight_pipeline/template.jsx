export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  const fmtDuration = (s) => {
    if (!s && s !== 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return h + "h " + (m < 10 ? "0" : "") + m + "m " + (sec < 10 ? "0" : "") + sec + "s";
    return m + "m " + (sec < 10 ? "0" : "") + sec + "s";
  };
  const fmtSize = (b) => {
    if (!b && b !== 0) return "—";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };
  const pctBar = (val, max, color) => {
    const pct = Math.min(100, Math.max(0, (val / (max || 1)) * 100));
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className={"h-full rounded-full " + color} style={{ width: pct + "%" }} />
        </div>
        <span className="text-[10px] text-gray-500 w-8 text-right">{val.toFixed ? val.toFixed(2) : val}</span>
      </div>
    );
  };

  // ── Hooks (all at top level) ──
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [sortBy, setSortBy] = useState("rank");
  const [viewMode, setViewMode] = useState("grid");
  const [expandedClip, setExpandedClip] = useState(-1);
  const [showScoreDetails, setShowScoreDetails] = useState(false);

  // ── Detect view type ──
  const tool = data?.tool || "";
  const isAnalyze = tool === "enso_video_highlight_pipeline_analyze_video";
  const isExtract = tool === "enso_video_highlight_pipeline_extract_frames";
  const isPreview = tool === "enso_video_highlight_pipeline_preview_frames";
  const isReel = tool === "enso_video_highlight_pipeline_generate_highlight_reel";
  const isConfig = tool === "enso_video_highlight_pipeline_configure_pipeline";

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Pipeline Error"
          description={data.error}
          action={
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => onAction("analyze_video", { path: data.videoPath || "" })}>
                <LucideReact.RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry Analysis
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "get" })}>
                <LucideReact.Settings className="w-3.5 h-3.5 mr-1" /> Settings
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Analyze Video View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isAnalyze) {
    const meta = data.metadata || {};
    const scenes = data.scenes || [];
    const totalDur = meta.duration || 0;
    const videoName = (data.videoPath || "").replace(/\\/g, "/").split("/").pop() || "Video";

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <LucideReact.Video className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{videoName}</div>
            <div className="text-[11px] text-gray-500 truncate">{data.videoPath}</div>
          </div>
          <Badge variant="info">{scenes.length} scenes</Badge>
        </div>

        {/* Metadata Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Duration" value={fmtDuration(totalDur)} accent="blue" />
          <Stat label="Resolution" value={meta.width && meta.height ? meta.width + "×" + meta.height : "—"} accent="purple" />
          <Stat label="FPS" value={meta.fps || "—"} accent="cyan" />
          <Stat label="File Size" value={fmtSize(meta.fileSize)} accent="amber" />
        </div>

        {/* Technical Details */}
        <Accordion type="single" items={[{
          value: "tech",
          title: "Technical Details",
          content: (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-gray-500">Codec</div><div className="text-gray-300">{meta.codec || "—"}</div>
              <div className="text-gray-500">Bitrate</div><div className="text-gray-300">{meta.bitrate ? meta.bitrate + " kbps" : "—"}</div>
              <div className="text-gray-500">Audio</div><div className="text-gray-300">{meta.audioCodec || "none"} {meta.audioChannels ? "(" + meta.audioChannels + "ch)" : ""}</div>
              <div className="text-gray-500">Format</div><div className="text-gray-300">{meta.format || "—"}</div>
            </div>
          )
        }]} />

        <Separator />

        {/* Scene Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Scene Timeline</div>
            <div className="text-[10px] text-gray-600">Avg: {fmtDuration(data.avgSceneDuration || 0)}</div>
          </div>

          {/* Visual timeline bar */}
          {totalDur > 0 && (
            <div className="relative h-6 bg-gray-800 rounded-lg overflow-hidden">
              {scenes.map((scene, i) => {
                const nextTime = i < scenes.length - 1 ? scenes[i + 1].timestamp : totalDur;
                const left = (scene.timestamp / totalDur) * 100;
                const width = ((nextTime - scene.timestamp) / totalDur) * 100;
                const colors = ["bg-blue-500/60", "bg-purple-500/60", "bg-cyan-500/60", "bg-amber-500/60", "bg-emerald-500/60", "bg-rose-500/60", "bg-indigo-500/60", "bg-orange-500/60", "bg-teal-500/60", "bg-pink-500/60"];
                return (
                  <div key={i} className={"absolute top-0 h-full border-r border-gray-900/50 " + colors[i % colors.length]}
                    style={{ left: left + "%", width: Math.max(width, 0.5) + "%" }}
                    title={"Scene " + (i + 1) + " at " + fmtDuration(scene.timestamp)}>
                    {width > 5 && (
                      <div className="text-[8px] text-white/70 px-1 py-0.5 truncate">{i + 1}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Scene list */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {scenes.map((scene, i) => {
              const nextTime = i < scenes.length - 1 ? scenes[i + 1].timestamp : totalDur;
              const dur = nextTime - scene.timestamp;
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/40 rounded-lg text-xs">
                  <span className="w-5 h-5 rounded bg-gray-700 flex items-center justify-center text-[10px] text-gray-400 font-mono">{i + 1}</span>
                  <span className="text-gray-300 font-mono text-[11px] w-16">{fmtDuration(scene.timestamp)}</span>
                  <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full" style={{ width: Math.min(100, (dur / (totalDur / scenes.length)) * 50) + "%" }} />
                  </div>
                  <span className="text-[10px] text-gray-500 w-12 text-right">{fmtDuration(dur)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="primary" onClick={() => onAction("extract_frames", { path: data.videoPath, frameCount: 20 })}>
            <LucideReact.ImagePlus className="w-3.5 h-3.5 mr-1" /> Extract 20 Best Frames
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "get" })}>
            <LucideReact.Settings className="w-3.5 h-3.5 mr-1" /> Configure
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Extract Frames View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isExtract) {
    const frames = data.frames || [];
    const videoName = (data.videoPath || "").replace(/\\/g, "/").split("/").pop() || "Video";

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <LucideReact.ImagePlus className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Frames Extracted</div>
            <div className="text-[11px] text-gray-500 truncate">{videoName}</div>
          </div>
          <Badge variant="success">{data.extractedCount || frames.length} frames</Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Extracted" value={data.extractedCount || frames.length} accent="emerald" />
          <Stat label="Strategy" value={data.strategy || "balanced"} accent="purple" />
          <Stat label="Top Score" value={frames.length > 0 ? frames[0].compositeScore.toFixed(2) : "—"} accent="amber" />
        </div>

        <Separator />

        {/* Frame grid preview (top 8) */}
        <div className="space-y-2">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Top Frames (by score)</div>
          <div className="grid grid-cols-2 gap-2">
            {frames.slice(0, 8).map((frame, i) => (
              <div key={i} className="relative bg-gray-800 rounded-xl overflow-hidden border border-gray-700/50">
                <div className="aspect-video bg-gray-800 flex items-center justify-center">
                  <div className="text-center">
                    <LucideReact.Image className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                    <div className="text-[10px] text-gray-500 font-mono">#{frame.rank}</div>
                  </div>
                </div>
                <div className="px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-mono">{frame.timecode}</span>
                    <Badge variant={frame.compositeScore >= 0.8 ? "success" : frame.compositeScore >= 0.6 ? "info" : "warning"}>
                      {frame.compositeScore.toFixed(2)}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    {frame.scores && frame.scores.faceCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                        {frame.scores.faceCount} face{frame.scores.faceCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {frame.scores && frame.scores.sharpness >= 0.8 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">sharp</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {frames.length > 8 && (
            <div className="text-center text-[11px] text-gray-500">
              +{frames.length - 8} more frames
            </div>
          )}
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="primary" onClick={() => onAction("preview_frames", { path: data.videoPath })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> Review & Approve Frames
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("generate_highlight_reel", { path: data.videoPath })}>
            <LucideReact.Film className="w-3.5 h-3.5 mr-1" /> Generate Reel
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("analyze_video", { path: data.videoPath })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Preview Frames View (Gallery with Approve/Reject) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPreview) {
    const frames = data.frames || [];
    const videoName = (data.videoPath || "").replace(/\\/g, "/").split("/").pop() || "Video";

    const sortedFrames = useMemo(() => {
      const arr = [...frames];
      if (sortBy === "score") arr.sort((a, b) => b.compositeScore - a.compositeScore);
      else if (sortBy === "timestamp") arr.sort((a, b) => a.timestamp - b.timestamp);
      else arr.sort((a, b) => a.rank - b.rank);
      return arr;
    }, [frames, sortBy]);

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <LucideReact.Eye className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Frame Review</div>
            <div className="text-[11px] text-gray-500 truncate">{videoName}</div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Total" value={data.totalFrames || 0} accent="blue" />
          <Stat label="Approved" value={data.approvedCount || 0} accent="emerald" />
          <Stat label="Rejected" value={data.rejectedCount || 0} accent="rose" />
          <Stat label="Avg Score" value={data.avgScore ? data.avgScore.toFixed(2) : "—"} accent="amber" />
        </div>

        {/* Sort and view controls */}
        <div className="flex items-center gap-2">
          <Select
            options={[
              { value: "rank", label: "Sort by Rank" },
              { value: "score", label: "Sort by Score" },
              { value: "timestamp", label: "Sort by Time" }
            ]}
            value={sortBy}
            onChange={(v) => setSortBy(v)}
            placeholder="Sort by..."
          />
          <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setViewMode("grid")}
              className={"px-2 py-1 rounded text-xs transition-colors " + (viewMode === "grid" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300")}>
              <LucideReact.Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode("list")}
              className={"px-2 py-1 rounded text-xs transition-colors " + (viewMode === "list" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300")}>
              <LucideReact.List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <Separator />

        {/* Frame gallery */}
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
            {sortedFrames.map((frame, i) => (
              <div key={i}
                className={"relative rounded-xl overflow-hidden border transition-all cursor-pointer " +
                  (frame.approved !== false ? "border-gray-700/50 bg-gray-800" : "border-rose-500/30 bg-gray-800/60 opacity-60")}
                onClick={() => setSelectedFrame(selectedFrame === i ? null : i)}>
                {/* Frame placeholder */}
                <div className="aspect-video bg-gray-800 flex items-center justify-center relative">
                  <div className="text-center">
                    <LucideReact.Image className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                    <div className="text-[10px] text-gray-500 font-mono">#{frame.rank}</div>
                  </div>
                  {/* Approve/reject badge */}
                  <div className="absolute top-1 right-1">
                    {frame.approved !== false ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/30 flex items-center justify-center">
                        <LucideReact.Check className="w-3 h-3 text-emerald-400" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-rose-500/30 flex items-center justify-center">
                        <LucideReact.X className="w-3 h-3 text-rose-400" />
                      </span>
                    )}
                  </div>
                  {/* Rank badge */}
                  <div className="absolute top-1 left-1">
                    <span className="text-[9px] px-1.5 py-0.5 bg-black/50 text-gray-300 rounded font-mono">#{frame.rank}</span>
                  </div>
                </div>
                {/* Details */}
                <div className="px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-mono">{frame.timecode}</span>
                    <Badge variant={frame.compositeScore >= 0.8 ? "success" : frame.compositeScore >= 0.6 ? "info" : "warning"}>
                      {frame.compositeScore.toFixed(2)}
                    </Badge>
                  </div>
                  {/* Score bars (expanded) */}
                  {selectedFrame === i && frame.scores && (
                    <div className="space-y-1 pt-1 border-t border-gray-700/50">
                      <div className="text-[9px] text-gray-500">Sharpness</div>
                      {pctBar(frame.scores.sharpness || 0, 1, "bg-emerald-500")}
                      <div className="text-[9px] text-gray-500">Brightness</div>
                      {pctBar(frame.scores.brightness || 0, 1, "bg-amber-500")}
                      <div className="text-[9px] text-gray-500">Contrast</div>
                      {pctBar(frame.scores.contrast || 0, 1, "bg-blue-500")}
                      <div className="text-[9px] text-gray-500">Saturation</div>
                      {pctBar(frame.scores.saturation || 0, 1, "bg-purple-500")}
                      {frame.scores.faceCount > 0 && (
                        <div className="text-[9px] text-purple-300">{frame.scores.faceCount} face{frame.scores.faceCount !== 1 ? "s" : ""} detected</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {sortedFrames.map((frame, i) => (
              <div key={i}
                className={"flex items-center gap-3 px-3 py-2 rounded-lg transition-all " +
                  (frame.approved !== false ? "bg-gray-800/40 hover:bg-gray-800/70" : "bg-gray-800/20 opacity-60")}>
                <span className="w-6 text-center text-[10px] text-gray-500 font-mono">#{frame.rank}</span>
                <span className="text-xs text-gray-300 font-mono w-16">{frame.timecode}</span>
                <div className="flex-1">
                  {pctBar(frame.compositeScore || 0, 1, frame.compositeScore >= 0.8 ? "bg-emerald-500" : frame.compositeScore >= 0.6 ? "bg-blue-500" : "bg-amber-500")}
                </div>
                <Badge variant={frame.compositeScore >= 0.8 ? "success" : frame.compositeScore >= 0.6 ? "info" : "warning"}>
                  {frame.compositeScore.toFixed(2)}
                </Badge>
                {frame.scores && frame.scores.faceCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                    {frame.scores.faceCount}
                  </span>
                )}
                <span className="w-5 h-5 flex items-center justify-center">
                  {frame.approved !== false ? (
                    <LucideReact.Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <LucideReact.X className="w-3.5 h-3.5 text-rose-400" />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="primary" onClick={() => onAction("generate_highlight_reel", { path: data.videoPath })}>
            <LucideReact.Film className="w-3.5 h-3.5 mr-1" /> Generate Highlight Reel
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("extract_frames", { path: data.videoPath })}>
            <LucideReact.RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-extract
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("analyze_video", { path: data.videoPath })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Generate Highlight Reel View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isReel) {
    const clips = data.clips || [];
    const videoName = (data.videoPath || "").replace(/\\/g, "/").split("/").pop() || "Video";
    const reelFilename = (data.reelPath || "").replace(/\\/g, "/").split("/").pop() || "highlight_reel.mp4";

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <LucideReact.Film className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Highlight Reel</div>
            <div className="text-[11px] text-gray-500 truncate">{videoName}</div>
          </div>
          <Badge variant={data.status === "complete" ? "success" : "warning"}>
            {data.status === "complete" ? "Ready" : data.status || "pending"}
          </Badge>
        </div>

        {/* Reel Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Duration" value={fmtDuration(data.actualDuration)} accent="amber" />
          <Stat label="Clips" value={data.clipCount || clips.length} accent="blue" />
          <Stat label="Transitions" value={data.transitionStyle || "mixed"} accent="purple" />
          <Stat label="Resolution" value={data.outputResolution || "1920×1080"} accent="cyan" />
        </div>

        {/* Reel preview placeholder */}
        {data.status === "complete" && (
          <div className="bg-gray-800 rounded-xl border border-gray-700/50 overflow-hidden">
            <div className="aspect-video bg-gray-800 flex items-center justify-center">
              <div className="text-center space-y-2">
                <LucideReact.PlayCircle className="w-12 h-12 text-amber-400/60 mx-auto" />
                <div className="text-xs text-gray-400">{reelFilename}</div>
                <div className="text-[10px] text-gray-500">{fmtDuration(data.actualDuration)} • {data.clipCount} clips</div>
              </div>
            </div>
          </div>
        )}

        {/* Output path */}
        {data.reelPath && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/40 rounded-lg">
            <LucideReact.FileVideo className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-[11px] text-gray-400 truncate">{data.reelPath}</span>
          </div>
        )}

        <Separator />

        {/* Clip Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Clip Sequence</div>
            <Switch checked={showScoreDetails} onChange={setShowScoreDetails} label="Details" />
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {clips.map((clip, i) => (
              <div key={i}
                className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/40 rounded-lg hover:bg-gray-800/60 transition-colors cursor-pointer"
                onClick={() => setExpandedClip(expandedClip === i ? -1 : i)}>
                <span className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-mono">{i + 1}</span>
                <span className="text-[11px] text-gray-300 font-mono w-20">{clip.timecodeStart} →</span>
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500/50 rounded-full" style={{ width: Math.min(100, (clip.score || 0.5) * 100) + "%" }} />
                </div>
                {showScoreDetails && (
                  <span className="text-[10px] text-gray-500 w-8 text-right">{(clip.score || 0).toFixed(2)}</span>
                )}
                {clip.transition && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">{clip.transition}</span>
                )}
                {expandedClip === i && (
                  <LucideReact.ChevronDown className="w-3 h-3 text-gray-500" />
                )}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => onAction("preview_frames", { path: data.videoPath })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> Review Frames
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("extract_frames", { path: data.videoPath })}>
            <LucideReact.RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-extract
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("analyze_video", { path: data.videoPath })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Analysis
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Configure Pipeline View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isConfig) {
    const config = data.config || {};
    const isSet = data.action === "set";
    const isReset = data.action === "reset";

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-500/20 flex items-center justify-center">
            <LucideReact.Settings className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-100">Pipeline Configuration</div>
            <div className="text-[11px] text-gray-500">{data.message || ""}</div>
          </div>
          {(isSet || isReset) && <Badge variant="success">{isReset ? "Reset" : "Updated"}</Badge>}
        </div>

        {/* Configuration display */}
        <Tabs tabs={[
          { value: "extraction", label: "Extraction" },
          { value: "reel", label: "Highlight Reel" },
          { value: "scoring", label: "Scoring" }
        ]} defaultValue="extraction" variant="pills">
          {(tab) => {
            if (tab === "extraction") {
              return (
                <div className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Frame Count</div>
                      <div className="text-lg font-semibold text-gray-200">{config.frameCount || 20}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Scene Threshold</div>
                      <div className="text-lg font-semibold text-gray-200">{config.sceneThreshold || 0.3}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Scoring Strategy</div>
                      <Badge variant="info">{config.scoringStrategy || "balanced"}</Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">JPEG Quality</div>
                      <div className="text-lg font-semibold text-gray-200">{config.jpegQuality || 95}%</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", frameCount: 30 })}>
                      30 Frames
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", frameCount: 20 })}>
                      20 Frames
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", frameCount: 10 })}>
                      10 Frames
                    </Button>
                  </div>
                </div>
              );
            }
            if (tab === "reel") {
              return (
                <div className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Reel Duration</div>
                      <div className="text-lg font-semibold text-gray-200">{config.reelDuration || 60}s</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Clip Duration</div>
                      <div className="text-lg font-semibold text-gray-200">{config.clipDuration || 4.5}s</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Transition</div>
                      <Badge variant="info">{config.transitionStyle || "mixed"}</Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Trans. Duration</div>
                      <div className="text-lg font-semibold text-gray-200">{config.transitionDuration || 0.5}s</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">Resolution</div>
                      <div className="text-sm text-gray-300">{config.outputResolution || "1920×1080"}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase">FPS</div>
                      <div className="text-lg font-semibold text-gray-200">{config.outputFps || 30}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", reelDuration: 30 })}>
                      30s Reel
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", reelDuration: 60 })}>
                      60s Reel
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", reelDuration: 120 })}>
                      120s Reel
                    </Button>
                  </div>
                </div>
              );
            }
            if (tab === "scoring") {
              return (
                <div className="space-y-3 pt-3">
                  <div className="space-y-2">
                    <div className="text-[10px] text-gray-500 uppercase">Strategy: {config.scoringStrategy || "balanced"}</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Sharpness</span>
                        {pctBar(0.20, 1, "bg-emerald-500")}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Faces</span>
                        {pctBar(0.28, 1, "bg-purple-500")}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Centering</span>
                        {pctBar(0.18, 1, "bg-blue-500")}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Contrast</span>
                        {pctBar(0.12, 1, "bg-cyan-500")}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Brightness</span>
                        {pctBar(0.08, 1, "bg-amber-500")}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Saturation</span>
                        {pctBar(0.08, 1, "bg-rose-500")}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Face size</span>
                        {pctBar(0.06, 1, "bg-indigo-500")}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", scoringStrategy: "balanced" })}>
                      Balanced
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", scoringStrategy: "face-priority" })}>
                      Face Priority
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction("configure_pipeline", { action: "set", scoringStrategy: "sharpness" })}>
                      Sharpness
                    </Button>
                  </div>
                </div>
              );
            }
            return null;
          }}
        </Tabs>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="danger" onClick={() => onAction("configure_pipeline", { action: "reset" })}>
            <LucideReact.RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset Defaults
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Fallback / Unknown Tool View ──
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <EmptyState
        icon={<LucideReact.Video className="w-8 h-8 text-blue-400" />}
        title="Video Highlight Studio"
        description="Analyze a video to detect scenes, extract the best frames, and generate a polished highlight reel."
        action={
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="primary" onClick={() => onAction("configure_pipeline", { action: "get" })}>
              <LucideReact.Settings className="w-3.5 h-3.5 mr-1" /> Configure Pipeline
            </Button>
          </div>
        }
      />
    </div>
  );
}

export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (MUST be at top level) ──
  var curateTabState = useState("review");
  var curateTab = curateTabState[0];
  var setCurateTab = curateTabState[1];

  var previewIdxState = useState(0);
  var previewIdx = previewIdxState[0];
  var setPreviewIdx = previewIdxState[1];

  var showAllCandidatesState = useState(false);
  var showAllCandidates = showAllCandidatesState[0];
  var setShowAllCandidates = showAllCandidatesState[1];

  var lightboxState = useState(-1);
  var lightboxIdx = lightboxState[0];
  var setLightboxIdx = lightboxState[1];

  var expandedStepState = useState(-1);
  var expandedStep = expandedStepState[0];
  var setExpandedStep = expandedStepState[1];

  // ── Tool detection ──
  var tool = data && data.tool ? data.tool : "";
  var isLaunch = tool === "enso_micro_album_launch";
  var isCurate = tool === "enso_micro_album_curate";
  var isPreview = tool === "enso_micro_album_preview";
  var isOrderGuide = tool === "enso_micro_album_order_guide";
  var isCelebrate = tool === "enso_micro_album_celebrate";

  // ── Helpers ──
  var fmtDate = function(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return "";
      return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch(e) { return ""; }
  };

  var renderStars = function(rating) {
    var stars = [];
    for (var s = 0; s < 5; s++) {
      stars.push(
        <span key={s} style={{ color: s < rating ? "#fbbf24" : "#374151", fontSize: "14px" }}>★</span>
      );
    }
    return <span>{stars}</span>;
  };

  // ── Error view ──
  if (data && data.error) {
    var hasSubfolders = data.subfolders && data.subfolders.length > 0;
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <EmptyState
          icon={LucideReact.AlertCircle}
          title="Couldn't Start Album"
          description={data.error}
        />
        {data.suggestion && (
          <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40 text-gray-400 text-[11px]">
            {data.suggestion}
          </div>
        )}
        {hasSubfolders && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Try a subfolder:</div>
            <div className="grid grid-cols-2 gap-1.5">
              {data.subfolders.map(function(sf, idx) {
                return (
                  <Button key={idx} size="sm" variant="outline" onClick={function() { onAction("launch", { folder: sf.path }); }}>
                    <LucideReact.Folder className="w-3 h-3 mr-1" />
                    {sf.name}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <Button variant="primary" size="sm" onClick={function() { onAction("launch", {}); }}>
          <LucideReact.RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Try Again
        </Button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // LAUNCH VIEW — Show candidates + album spec
  // ══════════════════════════════════════════════════════════
  if (isLaunch && data.candidates) {
    var candidates = data.candidates || [];
    var spec = data.albumSpec || {};
    var displayCount = showAllCandidates ? candidates.length : Math.min(6, candidates.length);

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-lg font-bold text-white flex items-center justify-center gap-2">
            <LucideReact.Camera className="w-5 h-5 text-amber-400" />
            Your Album Candidates
          </div>
          <div className="text-[11px] text-gray-400">
            Scanned {data.totalScanned} photos — found your {candidates.length} best
          </div>
        </div>

        {/* Pre-decided specs */}
        <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">All decisions made for you</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Size" value={spec.size || "10×10"} accent="blue" />
            <Stat label="Pages" value={spec.pages || 24} accent="purple" />
            <Stat label="Paper" value={spec.paper || "Lustre"} accent="amber" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Stat label="Printer" value={spec.printer || "Printique"} accent="emerald" />
            <Stat label="Photos" value={spec.targetPhotos || 12} accent="rose" />
            <Stat label="Layout" value="Full-bleed" accent="cyan" />
          </div>
        </div>

        {/* Candidate grid */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">
            Top {candidates.length} candidates
          </div>
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {candidates.slice(0, displayCount).map(function(c, idx) {
              return (
                <div key={idx} className="relative rounded-lg overflow-hidden bg-gray-800 cursor-pointer group"
                  onClick={function() { setLightboxIdx(idx); }}>
                  <img
                    src={c.thumbnailUrl || c.mediaUrl}
                    alt={c.name}
                    style={{ width: "100%", height: "90px", objectFit: "cover" }}
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                    <div className="text-[8px] text-gray-300 truncate">{c.name}</div>
                    {c.rating > 0 && <div className="text-[8px]">{renderStars(c.rating)}</div>}
                  </div>
                  {c.isFavorite && (
                    <div className="absolute top-1 right-1">
                      <LucideReact.Heart className="w-3 h-3 text-red-400 fill-red-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {candidates.length > 6 && (
            <Button size="sm" variant="ghost" className="w-full mt-1.5" onClick={function() { setShowAllCandidates(!showAllCandidates); }}>
              {showAllCandidates ? "Show less" : "Show all " + candidates.length + " candidates"}
            </Button>
          )}
        </div>

        {/* Lightbox */}
        {lightboxIdx >= 0 && lightboxIdx < candidates.length && (
          <Dialog open={true} onClose={function() { setLightboxIdx(-1); }} title={candidates[lightboxIdx].name}>
            <div className="space-y-2">
              <img
                src={candidates[lightboxIdx].mediaUrl}
                alt={candidates[lightboxIdx].name}
                style={{ width: "100%", maxHeight: "300px", objectFit: "contain", borderRadius: "8px" }}
              />
              <div className="text-[11px] text-gray-300">{candidates[lightboxIdx].description}</div>
              <div className="flex gap-2 flex-wrap">
                {candidates[lightboxIdx].dateTaken && (
                  <Badge variant="outline">{fmtDate(candidates[lightboxIdx].dateTaken)}</Badge>
                )}
                {candidates[lightboxIdx].camera && candidates[lightboxIdx].camera.trim() && (
                  <Badge variant="info">{candidates[lightboxIdx].camera.trim()}</Badge>
                )}
                {candidates[lightboxIdx].rating > 0 && (
                  <Badge variant="warning">{candidates[lightboxIdx].rating}★</Badge>
                )}
              </div>
            </div>
          </Dialog>
        )}

        {/* CTA — Start Curating */}
        <div className="bg-emerald-900/30 rounded-xl p-3 border border-emerald-700/40 text-center space-y-2">
          <div className="text-[12px] text-emerald-300 font-medium">
            Ready? Just keep or skip each photo. That's it.
          </div>
          <Button variant="primary" onClick={function() { onAction("curate", { action: "start" }); }}>
            <LucideReact.Play className="w-4 h-4 mr-1.5" />
            Start Curating — Pick Your 12 Best
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // CURATE VIEW — Keep/skip interface
  // ══════════════════════════════════════════════════════════
  if (isCurate) {
    var status = data.status || "";
    var progress = data.progress || { reviewed: 0, kept: 0, skipped: 0, remaining: 0, target: 12 };

    // Album ready — celebration prompt
    if (status === "album_ready") {
      var keptPhotos = data.keptPhotos || [];
      return (
        <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
          <div className="text-center space-y-1">
            <div className="text-lg font-bold text-emerald-400 flex items-center justify-center gap-2">
              <LucideReact.CheckCircle className="w-5 h-5" />
              Album Ready!
            </div>
            <div className="text-[11px] text-gray-400">{data.message}</div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Kept" value={progress.kept} accent="emerald" />
            <Stat label="Skipped" value={progress.skipped} accent="gray" />
            <Stat label="Target" value={progress.target} accent="blue" />
          </div>

          {/* Thumbnail strip of selected photos */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">Your album photos</div>
            <div className="grid grid-cols-4 gap-1" style={{ maxHeight: "160px", overflowY: "auto", scrollbarWidth: "thin" }}>
              {keptPhotos.map(function(p, idx) {
                return (
                  <div key={idx} className="rounded-lg overflow-hidden">
                    <img src={p.thumbnailUrl || p.mediaUrl} alt={p.name}
                      style={{ width: "100%", height: "60px", objectFit: "cover" }} loading="lazy" />
                  </div>
                );
              })}
            </div>
          </div>

          <Button variant="primary" className="w-full" onClick={function() { onAction("preview", {}); }}>
            <LucideReact.BookOpen className="w-4 h-4 mr-1.5" />
            Preview Your Album
          </Button>
        </div>
      );
    }

    // Needs reconsideration
    if (status === "needs_reconsideration") {
      return (
        <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
          <div className="text-center space-y-1">
            <div className="text-base font-bold text-amber-400 flex items-center justify-center gap-2">
              <LucideReact.RotateCcw className="w-4 h-4" />
              Need {progress.target - progress.kept} More
            </div>
            <div className="text-[11px] text-gray-400">{data.message}</div>
          </div>

          <Progress value={progress.kept} max={progress.target} variant="amber" showLabel />

          <Button variant="primary" className="w-full" onClick={function() { onAction("curate", { action: "reconsider" }); }}>
            <LucideReact.RotateCcw className="w-4 h-4 mr-1.5" />
            Reconsider Skipped Photos
          </Button>
        </div>
      );
    }

    // No candidates
    if (status === "no_candidates" || status === "insufficient") {
      return (
        <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
          <EmptyState
            icon={LucideReact.ImageOff}
            title={status === "no_candidates" ? "No Album Started" : "Not Enough Photos"}
            description={data.message || data.error}
          />
          <Button variant="primary" className="w-full" onClick={function() { onAction("launch", {}); }}>
            <LucideReact.Camera className="w-4 h-4 mr-1.5" />
            Launch New Album
          </Button>
        </div>
      );
    }

    // Main reviewing state — show one photo at a time
    var currentPhoto = data.currentPhoto || {};
    var photoIndex = typeof data.photoIndex === "number" ? data.photoIndex : 0;

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <div className="text-[11px] text-gray-400 font-medium">
              {data.encouragement || "Keep or skip each photo"}
            </div>
            <Badge variant={progress.kept >= progress.target ? "success" : "info"}>
              {progress.kept}/{progress.target} kept
            </Badge>
          </div>
          <Progress value={progress.kept} max={progress.target} variant="emerald" />
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>{progress.reviewed} reviewed</span>
            <span>{progress.remaining} remaining</span>
          </div>
        </div>

        {/* Photo display */}
        {currentPhoto.mediaUrl && (
          <div className="space-y-2">
            <div className="rounded-xl overflow-hidden border border-gray-700/40">
              <img
                src={currentPhoto.mediaUrl}
                alt={currentPhoto.name || "Photo"}
                style={{ width: "100%", maxHeight: "320px", objectFit: "contain", backgroundColor: "#111" }}
              />
            </div>

            {/* Photo info */}
            <div className="bg-gray-800/60 rounded-xl p-2.5 border border-gray-700/40 space-y-1.5">
              <div className="text-[12px] text-gray-200 font-medium">{currentPhoto.name}</div>
              {currentPhoto.description && (
                <div className="text-[11px] text-gray-400">{currentPhoto.description}</div>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {currentPhoto.dateTaken && (
                  <Badge variant="outline" className="text-[9px]">
                    <LucideReact.Calendar className="w-2.5 h-2.5 mr-0.5" />
                    {fmtDate(currentPhoto.dateTaken)}
                  </Badge>
                )}
                {currentPhoto.camera && currentPhoto.camera.trim() && (
                  <Badge variant="outline" className="text-[9px]">
                    <LucideReact.Camera className="w-2.5 h-2.5 mr-0.5" />
                    {currentPhoto.camera.trim()}
                  </Badge>
                )}
                {currentPhoto.rating > 0 && (
                  <span className="text-[10px]">{renderStars(currentPhoto.rating)}</span>
                )}
              </div>
            </div>

            {/* Keep / Skip buttons — BIG and easy to tap */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                className="py-3 text-base border border-gray-600 hover:border-gray-500 hover:bg-gray-800"
                onClick={function() { onAction("curate", { action: "skip", photoIndex: photoIndex }); }}
              >
                <LucideReact.X className="w-5 h-5 mr-1.5 text-gray-400" />
                Skip
              </Button>
              <Button
                variant="primary"
                className="py-3 text-base"
                onClick={function() { onAction("curate", { action: "keep", photoIndex: photoIndex }); }}
              >
                <LucideReact.Check className="w-5 h-5 mr-1.5" />
                Keep
              </Button>
            </div>
          </div>
        )}

        {status === "reconsidering" && (
          <div className="bg-amber-900/20 rounded-lg p-2 border border-amber-700/30">
            <div className="text-[10px] text-amber-400 flex items-center gap-1">
              <LucideReact.RotateCcw className="w-3 h-3" />
              Reconsidering skipped photos — you need {progress.target - progress.kept} more
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // PREVIEW VIEW — Album layout preview
  // ══════════════════════════════════════════════════════════
  if (isPreview && data.album) {
    var album = data.album;
    var spreads = album.spreads || [];
    var specs = album.specs || {};
    var cover = album.coverPhoto || {};

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-lg font-bold text-white flex items-center justify-center gap-2">
            <LucideReact.BookOpen className="w-5 h-5 text-purple-400" />
            {album.title || "My Best Shots"}
          </div>
          <div className="text-[11px] text-gray-400">
            {album.photoCount} photos · {album.dateRange || "Your collection"}
          </div>
        </div>

        {/* Cover preview */}
        <div className="space-y-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Cover</div>
          <div className="rounded-xl overflow-hidden border-2 border-purple-500/30 relative">
            <img
              src={cover.thumbnailUrl || cover.mediaUrl}
              alt="Cover"
              style={{ width: "100%", height: "180px", objectFit: "cover" }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <div className="text-white text-sm font-bold">{album.title || "My Best Shots"}</div>
              {album.dateRange && <div className="text-gray-300 text-[10px]">{album.dateRange}</div>}
            </div>
          </div>
        </div>

        {/* Spread thumbnails */}
        <div className="space-y-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
            {spreads.length} Full-Bleed Spreads
          </div>

          {/* Spread navigation */}
          {spreads.length > 0 && (
            <div className="space-y-2">
              {/* Current spread large view */}
              <div className="rounded-xl overflow-hidden border border-gray-700/40 relative">
                <img
                  src={(spreads[previewIdx] && spreads[previewIdx].photo) ? (spreads[previewIdx].photo.thumbnailUrl || spreads[previewIdx].photo.mediaUrl) : ""}
                  alt={"Spread " + (previewIdx + 1)}
                  style={{ width: "100%", height: "200px", objectFit: "contain", backgroundColor: "#111" }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-gray-400">Spread {previewIdx + 1} of {spreads.length}</div>
                      <div className="text-[11px] text-white">{spreads[previewIdx] && spreads[previewIdx].photo ? spreads[previewIdx].photo.description : ""}</div>
                    </div>
                    {spreads[previewIdx] && spreads[previewIdx].photo && spreads[previewIdx].photo.dateTaken && (
                      <Badge variant="outline" className="text-[8px]">{spreads[previewIdx].photo.dateTaken}</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button size="sm" variant="ghost" disabled={previewIdx === 0}
                  onClick={function() { setPreviewIdx(Math.max(0, previewIdx - 1)); }}>
                  <LucideReact.ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="text-[10px] text-gray-500">Pages {spreads[previewIdx] ? spreads[previewIdx].pageStart : ""}-{spreads[previewIdx] ? spreads[previewIdx].pageEnd : ""}</div>
                <Button size="sm" variant="ghost" disabled={previewIdx >= spreads.length - 1}
                  onClick={function() { setPreviewIdx(Math.min(spreads.length - 1, previewIdx + 1)); }}>
                  <LucideReact.ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Thumbnail strip */}
              <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                {spreads.map(function(sp, idx) {
                  return (
                    <div key={idx}
                      className={"rounded-md overflow-hidden cursor-pointer border-2 flex-shrink-0 " + (idx === previewIdx ? "border-purple-400" : "border-transparent")}
                      onClick={function() { setPreviewIdx(idx); }}
                      style={{ width: "48px", height: "48px" }}>
                      <img src={sp.photo ? (sp.photo.thumbnailUrl || sp.photo.mediaUrl) : ""}
                        alt={"Spread " + (idx + 1)}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Specs & cost */}
        <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Album specifications</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Size" value={specs.size || "10×10"} accent="blue" />
            <Stat label="Pages" value={specs.pages || 24} accent="purple" />
            <Stat label="Paper" value={specs.paper || "Lustre"} accent="amber" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Cover" value={specs.cover || "Hardcover"} accent="emerald" />
            <Stat label="Layout" value={specs.layout || "Full-bleed"} accent="cyan" />
            <Stat label="Cost" value={album.costEstimate || "$45–65"} accent="rose" />
          </div>
        </div>

        {/* CTA */}
        <div className="bg-purple-900/20 rounded-xl p-3 border border-purple-700/30 text-center space-y-2">
          <div className="text-[12px] text-purple-300 font-medium">
            Your album looks great! Ready to make it real?
          </div>
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={function() { onAction("order_guide", {}); }}>
              <LucideReact.ShoppingCart className="w-4 h-4 mr-1.5" />
              Order Guide
            </Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("curate", { action: "start" }); }}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Re-curate
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ORDER GUIDE VIEW — Step-by-step instructions
  // ══════════════════════════════════════════════════════════
  if (isOrderGuide && data.steps) {
    var guideSteps = data.steps || [];
    var guideSpecs = data.specs || {};
    var tips = data.tips || [];

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-lg font-bold text-white flex items-center justify-center gap-2">
            <LucideReact.ShoppingCart className="w-5 h-5 text-blue-400" />
            5-Minute Ordering Guide
          </div>
          <div className="text-[11px] text-gray-400">
            {data.photoCount} photos · {guideSpecs.costEstimate || "$45–65"} · {data.totalTime || "5 minutes"}
          </div>
        </div>

        {/* Quick specs reference */}
        <div className="bg-blue-900/20 rounded-xl p-2.5 border border-blue-700/30">
          <div className="text-[10px] text-blue-400 font-medium mb-1.5">Your pre-decided specs (just match these):</div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div className="text-gray-400">Product: <span className="text-white">{guideSpecs.product || "Lay-Flat Photo Book"}</span></div>
            <div className="text-gray-400">Size: <span className="text-white">{guideSpecs.size || "10×10"}</span></div>
            <div className="text-gray-400">Cover: <span className="text-white">{guideSpecs.cover || "Hardcover Lustre"}</span></div>
            <div className="text-gray-400">Paper: <span className="text-white">{guideSpecs.paper || "Lustre"}</span></div>
            <div className="text-gray-400">Pages: <span className="text-white">{guideSpecs.pages || 24}</span></div>
            <div className="text-gray-400">Binding: <span className="text-white">{guideSpecs.binding || "Lay-flat"}</span></div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-1.5">
          {guideSteps.map(function(step, idx) {
            var isExpanded = expandedStep === idx;
            return (
              <div key={idx} className="bg-gray-800/60 rounded-xl border border-gray-700/40 overflow-hidden">
                <div className="p-2.5 cursor-pointer flex items-start gap-2" onClick={function() { setExpandedStep(isExpanded ? -1 : idx); }}>
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {step.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-white font-medium">{step.title}</div>
                    <div className="text-[10px] text-gray-400">{step.description}</div>
                  </div>
                  <Badge variant="outline" className="text-[8px] flex-shrink-0">{step.timeEstimate}</Badge>
                </div>
                {isExpanded && (
                  <div className="px-2.5 pb-2.5 pt-0 border-t border-gray-700/30 mt-0">
                    <ul className="space-y-1 mt-2">
                      {step.details.map(function(detail, di) {
                        return (
                          <li key={di} className="text-[10px] text-gray-300 flex gap-1.5 items-start">
                            <LucideReact.ChevronRight className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                            <span>{detail}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {step.photoOrder && (
                      <div className="mt-2 bg-gray-900/50 rounded-lg p-2">
                        <div className="text-[9px] text-gray-500 uppercase font-medium mb-1">Photo order:</div>
                        {step.photoOrder.map(function(po, pi) {
                          return (
                            <div key={pi} className="text-[9px] text-gray-400 flex gap-1">
                              <span className="text-blue-400 font-mono">{po.spreadNumber}.</span>
                              <span className="text-white">{po.name}</span>
                              {po.description && <span className="text-gray-500"> — {po.description}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tips */}
        {tips.length > 0 && (
          <Accordion type="single" items={[{
            value: "tips",
            title: "Pro Tips",
            content: (
              <ul className="space-y-1.5">
                {tips.map(function(tip, ti) {
                  return (
                    <li key={ti} className="text-[10px] text-gray-300 flex gap-1.5 items-start">
                      <LucideReact.Lightbulb className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </li>
                  );
                })}
              </ul>
            )
          }]} />
        )}

        {/* CTA */}
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={function() { onAction("celebrate", {}); }}>
            <LucideReact.PartyPopper className="w-4 h-4 mr-1.5" />
            I Ordered It!
          </Button>
          <Button variant="ghost" size="sm" onClick={function() { onAction("preview", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // CELEBRATE VIEW — Congratulations!
  // ══════════════════════════════════════════════════════════
  if (isCelebrate && data.milestone) {
    var milestone = data.milestone;
    var funFacts = data.funFacts || [];
    var nextSteps = data.nextSteps || [];
    var keptPhotos = data.keptPhotos || [];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Celebration header */}
        <div className="text-center space-y-2">
          <div className="text-3xl">🎉</div>
          <div className="text-xl font-bold text-emerald-400">{milestone.title || "First Album Complete!"}</div>
          {data.recipient && (
            <div className="text-[12px] text-gray-300">A gift for {data.recipient}</div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Photos Selected" value={milestone.photosSelected} accent="emerald" />
          <Stat label="From Library Of" value={milestone.totalLibrary.toLocaleString()} accent="blue" />
          <Stat label="Date Range" value={milestone.dateRange || "—"} accent="purple" />
          <Stat label="Est. Delivery" value={milestone.estimatedDelivery || "7–10 days"} accent="amber" />
        </div>

        {milestone.topCamera && (
          <div className="bg-gray-800/60 rounded-xl p-2.5 border border-gray-700/40 flex items-center gap-2">
            <LucideReact.Camera className="w-4 h-4 text-cyan-400" />
            <div className="text-[11px] text-gray-300">
              Primary camera: <span className="text-white font-medium">{milestone.topCamera}</span>
            </div>
          </div>
        )}

        {/* Photo strip */}
        {keptPhotos.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Your album photos</div>
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {keptPhotos.map(function(p, idx) {
                return (
                  <div key={idx} className="rounded-md overflow-hidden flex-shrink-0" style={{ width: "56px", height: "56px" }}>
                    <img src={p.thumbnailUrl || p.mediaUrl} alt={p.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fun facts */}
        {funFacts.length > 0 && (
          <div className="bg-emerald-900/20 rounded-xl p-3 border border-emerald-700/30 space-y-1.5">
            {funFacts.map(function(fact, fi) {
              return (
                <div key={fi} className="text-[11px] text-emerald-300 flex gap-1.5 items-start">
                  <LucideReact.Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>{fact}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Gift suggestion */}
        {data.giftSuggestion && (
          <div className="bg-purple-900/20 rounded-xl p-3 border border-purple-700/30">
            <div className="text-[11px] text-purple-300 flex gap-1.5 items-start">
              <LucideReact.Gift className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{data.giftSuggestion}</span>
            </div>
          </div>
        )}

        {/* Next steps */}
        {nextSteps.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">What's next</div>
            {nextSteps.map(function(ns, ni) {
              return (
                <div key={ni} className="text-[10px] text-gray-400 flex gap-1.5 items-start">
                  <LucideReact.ArrowRight className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span>{ns}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Total albums */}
        {data.totalAlbumsCompleted > 0 && (
          <div className="text-center">
            <Badge variant="success">Album #{data.totalAlbumsCompleted} completed</Badge>
          </div>
        )}

        {/* Start another */}
        <Button variant="outline" className="w-full" onClick={function() { onAction("launch", {}); }}>
          <LucideReact.Plus className="w-4 h-4 mr-1.5" />
          Start Album #{(data.totalAlbumsCompleted || 0) + 1}
        </Button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // DEFAULT / EMPTY STATE
  // ══════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
      <EmptyState
        icon={LucideReact.BookOpen}
        title="Micro Album"
        description="Create a beautiful photo album in under 10 minutes. No decisions needed — just keep or skip."
        action={
          <Button variant="primary" onClick={function() { onAction("launch", {}); }}>
            <LucideReact.Sparkles className="w-4 h-4 mr-1.5" />
            Launch My First Album
          </Button>
        }
      />
    </div>
  );
}

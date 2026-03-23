export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtSize = function(b) {
    if (!b && b !== 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };
  var fmtDate = function(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return String(d).substring(0, 10); }
  };
  var pathSegments = function(p) {
    if (!p) return [];
    var parts = String(p).replace(/\\/g, "/").split("/").filter(Boolean);
    var segs = [];
    for (var i = 0; i < parts.length; i++) {
      segs.push({ name: parts[i], path: parts.slice(0, i + 1).join("/") });
    }
    return segs;
  };

  // ── Hooks ──
  var viewModeState = useState("grid");
  var viewMode = viewModeState[0];
  var setViewMode = viewModeState[1];

  var lightboxState = useState(-1);
  var lightboxIdx = lightboxState[0];
  var setLightboxIdx = lightboxState[1];

  var searchQueryState = useState("");
  var searchQuery = searchQueryState[0];
  var setSearchQuery = searchQueryState[1];

  var favOnlyState = useState(false);
  var favOnly = favOnlyState[0];
  var setFavOnly = favOnlyState[1];

  var createInputState = useState(null);
  var createInput = createInputState[0];
  var setCreateInput = createInputState[1];

  var searchInputState = useState("");
  var searchInput = searchInputState[0];
  var setSearchInput = searchInputState[1];

  var selectModeState = useState(false);
  var selectMode = selectModeState[0];
  var setSelectMode = selectModeState[1];

  var selectedState = useState(new Set());
  var selected = selectedState[0];
  var setSelected = selectedState[1];

  var lbRef = useRef(null);

  var touchStartState = useState(null);
  var touchStart = touchStartState[0];
  var setTouchStart = touchStartState[1];

  var touchEndState = useState(null);
  var touchEnd = touchEndState[0];
  var setTouchEnd = touchEndState[1];

  var lbZoomState = useState(1);
  var lbZoom = lbZoomState[0];
  var setLbZoom = lbZoomState[1];

  var lbPanState = useState({ x: 0, y: 0 });
  var lbPan = lbPanState[0];
  var setLbPan = lbPanState[1];

  var collAddState = useState(false);
  var showCollAdd = collAddState[0];
  var setShowCollAdd = collAddState[1];

  var collNameState = useState("");
  var collAddName = collNameState[0];
  var setCollAddName = collNameState[1];

  useEffect(function() {
    if (lightboxIdx >= 0 && lbRef.current) lbRef.current.focus();
  }, [lightboxIdx]);

  useEffect(function() {
    setLbZoom(1);
    setLbPan({ x: 0, y: 0 });
  }, [lightboxIdx]);

  useEffect(function() {
    if (!selectMode) setSelected(new Set());
  }, [selectMode]);

  // ── Detect view type ──
  var tool = data && data.tool ? data.tool : "";
  var isDrives = tool === "enso_media_gallery_browse" && Array.isArray(data && data.drives);
  var isBrowse = tool === "enso_media_gallery_browse" && !Array.isArray(data && data.drives);
  var isPhoto = tool === "enso_media_gallery_view";
  var isFavoriteResult = tool === "enso_media_gallery_favorite";
  var isRateResult = tool === "enso_media_gallery_rate";
  var isSearch = tool === "enso_media_gallery_search";
  var isCollections = tool === "enso_media_gallery_collection";
  var isInspect = tool === "enso_media_gallery_inspect";
  var isStats = tool === "enso_media_gallery_stats";
  var isPhotoLike = isPhoto || isFavoriteResult || isRateResult || isInspect;

  var items = (data && data.items) ? data.items : [];
  var directories = (data && data.directories) ? data.directories : [];
  var currentPath = String((data && data.path) ? data.path : ".");
  var parentPath = data && data.parentPath;

  var filtered = useMemo(function() {
    var result = items;
    if (favOnly) result = result.filter(function(i) { return i.isFavorite; });
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      result = result.filter(function(i) {
        return (i.name || "").toLowerCase().indexOf(q) >= 0 ||
          (i.aiDescription || "").toLowerCase().indexOf(q) >= 0 ||
          (i.aiTags || []).some(function(t) { return t.toLowerCase().indexOf(q) >= 0; });
      });
    }
    return result;
  }, [items, searchQuery, favOnly]);

  // ── Error view ──
  if (data && data.error) {
    var errMsg = data.error || "";
    var isPathError = errMsg.indexOf("path") >= 0 || errMsg.indexOf("not exist") >= 0 || errMsg.indexOf("not found") >= 0 || errMsg.indexOf("ENOENT") >= 0;
    var errPath = data.path || "";
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-3">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title={isPathError ? "Path not found" : "Something went wrong"}
          description={errMsg}
        />
        <div className="flex gap-2 flex-wrap justify-center">
          <Button size="sm" onClick={function() { onAction("browse", {}); }}>
            <LucideReact.Home className="w-3.5 h-3.5 mr-1" /> Browse Home
          </Button>
          {isPathError && errPath && errPath.charAt(0) !== '/' && errPath.indexOf('/') > 0 && (
            <Button size="sm" variant="outline" onClick={function() { onAction("browse", { path: '/' + errPath }); }}>
              Try /{errPath}
            </Button>
          )}
          {isPathError && (
            <Button size="sm" variant="ghost" onClick={function() { onAction("browse", { path: "~/Downloads" }); }}>
              <LucideReact.Download className="w-3.5 h-3.5 mr-1" /> Downloads
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Stats View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isStats) {
    var byExt = data.byExtension || {};
    var extKeys = Object.keys(byExt).sort(function(a, b) { return byExt[b] - byExt[a]; });
    var cameras = data.byCamera || [];
    var months = data.byMonth || [];
    var rDist = data.ratingDistribution || {};
    var topRatedItems = data.topRated || [];
    var dateRange = data.dateRange || {};

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse", { path: data.path || "." }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">Folder Statistics</div>
            <div className="text-[11px] text-gray-500 truncate">{data.path || ""}</div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total Files" value={data.totalFiles || 0} accent="blue" />
          <Stat label="Total Size" value={fmtSize(data.totalSize || 0)} accent="purple" />
          <Stat label="Photos" value={data.imageCount || 0} accent="emerald" />
          <Stat label="Videos" value={data.videoCount || 0} accent="cyan" />
        </div>

        {(data.favoriteCount > 0 || data.subdirectoryCount > 0) && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Favorites" value={data.favoriteCount || 0} accent="rose" />
            <Stat label="Avg Size" value={fmtSize(data.avgFileSize || 0)} accent="amber" />
            <Stat label="Subfolders" value={data.subdirectoryCount || 0} accent="gray" />
          </div>
        )}

        {/* Metadata coverage */}
        {(data.withAI > 0 || data.withGPS > 0 || data.avgISO > 0) && (
          <div className="grid grid-cols-3 gap-2">
            {data.withAI > 0 && <Stat label="AI Tagged" value={data.withAI + "/" + (data.totalFiles || 0)} accent="purple" />}
            {data.withGPS > 0 && <Stat label="Geotagged" value={data.withGPS + "/" + (data.totalFiles || 0)} accent="blue" />}
            {data.avgISO > 0 && <Stat label="Avg ISO" value={data.avgISO} accent="amber" />}
          </div>
        )}

        {data.fromCache && (
          <div className="text-[9px] text-gray-600 text-center">Cached results (refreshes every 5 min)</div>
        )}

        {/* Date Range */}
        {dateRange.earliest && (
          <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Date Range</div>
            <div className="text-xs text-gray-200">
              {fmtDate(dateRange.earliest)} — {fmtDate(dateRange.latest)}
            </div>
          </div>
        )}

        {/* File Type Breakdown */}
        {extKeys.length > 0 && (
          <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-2">File Types</div>
            <div className="space-y-1.5">
              {extKeys.map(function(ext) {
                var count = byExt[ext];
                var pct = data.totalFiles > 0 ? Math.round((count / data.totalFiles) * 100) : 0;
                return (
                  <div key={ext} className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-12 text-right font-mono">{ext}</span>
                    <div className="flex-1">
                      <Progress value={pct} max={100} variant="blue" />
                    </div>
                    <span className="text-[10px] text-gray-400 w-12">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Camera Breakdown */}
        {cameras.length > 0 && (
          <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-2">Cameras / Devices</div>
            <div className="space-y-1.5">
              {cameras.map(function(cam, idx) {
                var pct = data.totalFiles > 0 ? Math.round((cam.count / data.totalFiles) * 100) : 0;
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <LucideReact.Camera className="w-3 h-3 text-gray-500 shrink-0" />
                    <span className="text-xs text-gray-200 flex-1 truncate">{cam.camera}</span>
                    <span className="text-[10px] text-gray-400">{cam.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rating Distribution */}
        {(function() {
          var hasRatings = false;
          for (var k = 1; k <= 5; k++) { if (rDist[String(k)] > 0) hasRatings = true; }
          if (!hasRatings) return null;
          return (
            <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
              <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-2">Rating Distribution</div>
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map(function(star) {
                  var count = rDist[String(star)] || 0;
                  var pct = data.totalFiles > 0 ? Math.round((count / data.totalFiles) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 w-16">
                        {Array.from({ length: star }, function(_, i) {
                          return <LucideReact.Star key={i} className="w-2.5 h-2.5 text-amber-400 fill-current" />;
                        })}
                      </div>
                      <div className="flex-1">
                        <Progress value={pct} max={100} variant="amber" />
                      </div>
                      <span className="text-[10px] text-gray-400 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-16">Unrated</span>
                  <div className="flex-1">
                    <Progress value={data.totalFiles > 0 ? Math.round(((rDist.unrated || 0) / data.totalFiles) * 100) : 0} max={100} variant="gray" />
                  </div>
                  <span className="text-[10px] text-gray-400 w-8 text-right">{rDist.unrated || 0}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Monthly Timeline */}
        {months.length > 1 && (
          <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-2">Timeline</div>
            <div className="flex items-end gap-1" style={{ height: "60px" }}>
              {(function() {
                var maxCount = 0;
                for (var mi = 0; mi < months.length; mi++) {
                  if (months[mi].count > maxCount) maxCount = months[mi].count;
                }
                return months.map(function(m, idx) {
                  var h = maxCount > 0 ? Math.max(4, Math.round((m.count / maxCount) * 56)) : 4;
                  return (
                    <EnsoUI.Tooltip key={idx} content={m.month + ": " + m.count + " files"}>
                      <div className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full bg-blue-500/60 rounded-sm" style={{ height: h + "px" }} />
                      </div>
                    </EnsoUI.Tooltip>
                  );
                });
              })()}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-gray-600">{months[0].month}</span>
              <span className="text-[9px] text-gray-600">{months[months.length - 1].month}</span>
            </div>
          </div>
        )}

        {/* Top Rated */}
        {topRatedItems.length > 0 && (
          <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-2">Top Rated</div>
            <div className="grid grid-cols-3 gap-1.5">
              {topRatedItems.slice(0, 6).map(function(tr, idx) {
                return (
                  <button key={idx} onClick={function() { onAction("view", { path: tr.path }); }}
                    className="relative bg-gray-700/40 rounded-lg overflow-hidden border border-gray-600/30 hover:border-amber-500/40 cursor-pointer text-left transition-all">
                    {tr.mediaUrl ? (
                      <img src={tr.mediaUrl} alt={tr.name} loading="lazy"
                        style={{ width: "100%", height: "70px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "70px" }} className="flex items-center justify-center bg-gray-700/30">
                        <LucideReact.Image className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    <div className="absolute top-1 right-1 flex gap-px">
                      {Array.from({ length: tr.rating }, function(_, i) {
                        return <LucideReact.Star key={i} className="w-2 h-2 text-amber-400 fill-current drop-shadow" />;
                      })}
                    </div>
                    <div className="px-1.5 py-1">
                      <div className="text-[9px] text-gray-300 truncate">{tr.name}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Largest File */}
        {data.largestFile && (
          <div className="text-[10px] text-gray-500 text-center">
            Largest file: {data.largestFile.name} ({fmtSize(data.largestFile.size)})
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Home / Drives View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isDrives) {
    var drives = (data && data.drives) || [];
    var quickAccess = (data && data.quickAccess) || [];
    var bookmarks = (data && data.bookmarks) || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {quickAccess.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Quick Access</div>
            <div className="grid grid-cols-3 gap-2">
              {quickAccess.map(function(qa, i) {
                return (
                  <button key={i} onClick={function() { onAction("browse", { path: qa.path }); }}
                    className="flex flex-col items-center gap-1.5 px-3 py-3 bg-gray-800/60 rounded-xl border border-gray-700/50 hover:bg-gray-750 hover:border-blue-500/30 cursor-pointer transition-all">
                    <LucideReact.FolderOpen className="w-5 h-5 text-blue-400" />
                    <span className="text-xs text-gray-300">{qa.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {bookmarks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Bookmarks</div>
            <div className="grid grid-cols-2 gap-2">
              {bookmarks.map(function(bm, i) {
                return (
                  <button key={i} onClick={function() { onAction("browse", { path: bm.path }); }}
                    className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/60 rounded-xl border border-amber-500/20 hover:border-amber-400/40 cursor-pointer text-left transition-all">
                    <LucideReact.Bookmark className="w-4 h-4 text-amber-400 fill-current shrink-0" />
                    <span className="text-xs text-gray-200 truncate">{bm.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Drives</div>
          <div className="flex flex-wrap gap-2">
            {drives.map(function(drv, i) {
              return (
                <button key={i} onClick={function() { onAction("browse", { path: drv.path }); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/60 rounded-xl border border-gray-700/50 hover:bg-gray-750 hover:border-blue-500/30 cursor-pointer transition-all">
                  <LucideReact.HardDrive className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-200">{drv.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />
        <Button variant="ghost" size="sm" onClick={function() { onAction("collection", { action: "list" }); }}>
          <LucideReact.FolderHeart className="w-3.5 h-3.5 mr-1.5" /> Collections
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Photo Detail View (also handles inspect/favorite/rate) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPhotoLike) {
    var exif = data.exif || {};
    var folderPath = data.folderPath || (data.path ? data.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/") : ".");
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse", { path: folderPath }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{data.name || "Photo"}</div>
            <div className="text-[11px] text-gray-500">
              {fmtSize(data.size)}
              {exif.width ? " \u00b7 " + exif.width + "\u00d7" + exif.height : ""}
              {data.megapixels ? " \u00b7 " + data.megapixels + " MP" : ""}
              {data.aspectRatioLabel ? " \u00b7 " + data.aspectRatioLabel : (data.orientation ? " \u00b7 " + data.orientation : "")}
            </div>
          </div>
          <button onClick={function() { onAction("favorite", { path: data.path }); }}
            className={"p-2.5 rounded-xl cursor-pointer transition-all " + (data.isFavorite ? "text-rose-400 bg-rose-500/10" : "text-gray-500 hover:text-rose-300 hover:bg-gray-800")}>
            {data.isFavorite ? <LucideReact.Heart className="w-4 h-4 fill-current" /> : <LucideReact.Heart className="w-4 h-4" />}
          </button>
        </div>

        {/* Media */}
        <div className="rounded-xl overflow-hidden bg-black/40 flex items-center justify-center" style={{ maxHeight: "400px" }}>
          {data.type === "video" ? (
            <video controls preload="metadata" src={data.mediaUrl}
              style={{ maxWidth: "100%", maxHeight: "400px" }}
              onClick={function(e) { e.stopPropagation(); }} />
          ) : (
            <img src={data.mediaUrl} alt={data.name}
              style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain" }} />
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map(function(star) {
            return (
              <button key={star}
                onClick={function() { onAction("rate", { path: data.path, rating: data.rating === star ? 0 : star }); }}
                className={"cursor-pointer transition-all p-0.5 " + (star <= (data.rating || 0) ? "text-amber-400" : "text-gray-600 hover:text-amber-300")}>
                <LucideReact.Star className={"w-4 h-4" + (star <= (data.rating || 0) ? " fill-current" : "")} />
              </button>
            );
          })}
        </div>

        {/* AI Description */}
        {data.aiDescription && (
          <div className="bg-purple-500/5 rounded-xl p-3 border border-purple-500/15">
            <div className="text-xs text-gray-300 leading-relaxed">{data.aiDescription}</div>
            {data.aiTags && data.aiTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {data.aiTags.map(function(tag, i) { return <Badge key={i} variant="info">{tag}</Badge>; })}
              </div>
            )}
          </div>
        )}

        {/* EXIF (collapsed by default) */}
        {(exif.cameraMake || exif.dateTaken || exif.focalLength) && (
          <Accordion type="single" items={[{
            value: "exif",
            title: "Camera Details",
            content: (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {exif.cameraMake && <><span className="text-gray-500">Camera</span><span className="text-gray-200">{exif.cameraMake} {exif.cameraModel || ""}</span></>}
                {exif.dateTaken && <><span className="text-gray-500">Date</span><span className="text-gray-200">{fmtDate(exif.dateTaken)}</span></>}
                {exif.focalLength && <><span className="text-gray-500">Focal</span><span className="text-gray-200">{exif.focalLength}</span></>}
                {exif.aperture && <><span className="text-gray-500">Aperture</span><span className="text-gray-200">{exif.aperture}</span></>}
                {exif.exposureTime && <><span className="text-gray-500">Shutter</span><span className="text-gray-200">{exif.exposureTime}</span></>}
                {exif.iso && <><span className="text-gray-500">ISO</span><span className="text-gray-200">{exif.iso}</span></>}
                {exif.gps && <><span className="text-gray-500">GPS</span><span className="text-gray-200">{exif.gps.lat.toFixed(4)}, {exif.gps.lng.toFixed(4)}</span></>}
              </div>
            ),
          }]} />
        )}

        {/* Cross-app navigation */}
        {data.type === "image" && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={function() { onAction("__cross_app", { target: "photo_studio", tool: "preview_styles", params: { photoPath: data.path } }); }}>
              <LucideReact.Palette className="w-3.5 h-3.5 mr-1" /> Style in Photo Studio
            </Button>
            <Button size="sm" variant="ghost" onClick={function() { onAction("__cross_app", { target: "photo_studio", tool: "adjust", params: { path: data.path } }); }}>
              <LucideReact.SlidersHorizontal className="w-3.5 h-3.5 mr-1" /> Adjust
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Search Results ──
  // ════════════════════════════════════════════════════════════════════════
  if (isSearch) {
    var results = data.results || [];
    var analytics = data.searchAnalytics || {};
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse", { path: data.path || "." }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{"\u201c" + (data.query || "") + "\u201d"}</div>
            <div className="text-[11px] text-gray-500">
              {(data.total || 0) + " results"}
              {data.totalScanned ? " from " + data.totalScanned + " scanned" : ""}
              {analytics.imageResults > 0 || analytics.videoResults > 0 ? " \u00b7 " + (analytics.imageResults || 0) + " photos, " + (analytics.videoResults || 0) + " videos" : ""}
            </div>
          </div>
        </div>

        {/* Search again */}
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input placeholder="Search..." value={searchInput}
              onChange={function(v) { setSearchInput(v); }}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
          </div>
          <Button size="sm" variant="primary"
            onClick={function() { if (searchInput.trim()) onAction("search", { path: data.path, query: searchInput.trim() }); }}>
            Search
          </Button>
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={<LucideReact.SearchX className="w-8 h-8" />}
            title="No matches"
            description={"Try different keywords or browse the folder."}
            action={<Button size="sm" onClick={function() { onAction("browse", { path: data.path || "." }); }}>Browse</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {results.map(function(item, idx) {
              return (
                <button key={idx} onClick={function() { onAction("view", { path: item.path }); }}
                  className="relative group bg-gray-800/60 rounded-lg overflow-hidden border border-gray-700/40 hover:border-blue-500/40 cursor-pointer text-left transition-all">
                  {item.mediaUrl ? (
                    <img src={item.type === "video" ? (item.thumbnailUrl || item.mediaUrl) : item.mediaUrl}
                      alt={item.name} loading="lazy"
                      style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "90px" }} className="bg-gray-700/30 flex items-center justify-center">
                      <LucideReact.Image className="w-6 h-6 text-gray-500" />
                    </div>
                  )}
                  {item.type === "video" && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "90px" }}
                      className="flex items-center justify-center bg-black/30">
                      <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                        <LucideReact.Play className="w-3 h-3 text-white ml-0.5" />
                      </div>
                    </div>
                  )}
                  {item.matchReason && (
                    <div className="absolute top-1 left-1">
                      <Badge variant="info" className="text-[8px]">{item.matchReason.split(":")[0]}</Badge>
                    </div>
                  )}
                  <div className="p-1.5">
                    <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Collections List ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCollections && data.action !== "view") {
    var colls = data.collections || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={function() { onAction("browse", {}); }}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-semibold text-gray-100">Collections</span>
            <Badge variant="outline">{colls.length}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { setCreateInput(createInput === null ? "" : null); }}>
            <LucideReact.Plus className="w-4 h-4" />
          </Button>
        </div>

        {createInput !== null && (
          <div className="flex gap-1.5">
            <div className="flex-1">
              <Input placeholder="Collection name..." value={createInput}
                onChange={function(v) { setCreateInput(v); }} size="sm" />
            </div>
            <Button size="sm" variant="primary"
              onClick={function() {
                if (createInput.trim()) {
                  onAction("collection", { action: "create", collectionName: createInput.trim() });
                  setCreateInput(null);
                }
              }}>Create</Button>
            <Button size="sm" variant="ghost" onClick={function() { setCreateInput(null); }}>
              <LucideReact.X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {colls.length === 0 ? (
          <EmptyState
            icon={<LucideReact.FolderHeart className="w-8 h-8" />}
            title="No collections yet"
            description="Organize your photos into albums."
            action={<Button size="sm" onClick={function() { setCreateInput(""); }}>Create</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {colls.map(function(col, i) {
              return (
                <button key={i} onClick={function() { onAction("collection", { action: "view", collectionName: col.name }); }}
                  className="bg-gray-800/60 rounded-xl border border-gray-700/40 overflow-hidden hover:border-rose-500/40 cursor-pointer text-left transition-all group">
                  {col.coverUrl ? (
                    <img src={col.coverUrl} alt={col.name} loading="lazy"
                      style={{ width: "100%", height: "80px", objectFit: "cover" }}
                      className="group-hover:opacity-90 transition-opacity" />
                  ) : (
                    <div style={{ width: "100%", height: "80px" }} className="bg-gray-700/30 flex items-center justify-center">
                      <LucideReact.Images className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                  <div className="p-2">
                    <div className="text-xs text-gray-200 truncate font-medium">{col.name}</div>
                    <div className="text-[10px] text-gray-500">{col.count} photos</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Collection Detail ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCollections && data.action === "view") {
    var colItems = data.items || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("collection", { action: "list" }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{data.collectionName}</div>
            <div className="text-[11px] text-gray-500">{data.total || colItems.length} photos</div>
          </div>
          <Button variant="danger" size="sm" onClick={function() { onAction("collection", { action: "delete", collectionName: data.collectionName }); }}>
            <LucideReact.Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {colItems.length === 0 ? (
          <EmptyState
            icon={<LucideReact.ImageOff className="w-8 h-8" />}
            title="Empty collection"
            description="Browse your gallery and add photos."
            action={<Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {colItems.map(function(item, idx) {
              return (
                <button key={idx} onClick={function() { onAction("view", { path: item.path }); }}
                  className="relative group bg-gray-800/60 rounded-lg overflow-hidden border border-gray-700/40 hover:border-blue-500/40 cursor-pointer text-left transition-all">
                  <img src={item.mediaUrl} alt={item.name} loading="lazy"
                    style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                  {item.isFavorite && (
                    <div className="absolute top-1 right-1">
                      <LucideReact.Heart className="w-3 h-3 text-rose-400 fill-current drop-shadow" />
                    </div>
                  )}
                  <div className="px-1.5 py-1">
                    <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Main Gallery / Browse View ──
  // ════════════════════════════════════════════════════════════════════════
  var summary = data && data.summary;

  return (
    <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-2.5">

      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 min-w-0">
        <button onClick={function() { onAction("browse", {}); }}
          className="p-1.5 rounded-lg hover:bg-gray-800 cursor-pointer text-gray-400 hover:text-blue-400 shrink-0 transition-all"
          title="Home">
          <LucideReact.Home className="w-4 h-4" />
        </button>
        {parentPath && (
          <button onClick={function() { onAction("browse", { path: parentPath }); }}
            className="p-1.5 rounded-lg hover:bg-gray-800 cursor-pointer text-gray-400 hover:text-gray-200 shrink-0 transition-all"
            title="Up">
            <LucideReact.ArrowUp className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-400 truncate flex items-center gap-0.5">
            {pathSegments(currentPath).slice(-3).map(function(seg, i) {
              return (
                <span key={i} className="flex items-center gap-0.5">
                  {i > 0 && <LucideReact.ChevronRight className="w-2.5 h-2.5 text-gray-600" />}
                  <button onClick={function() { onAction("browse", { path: seg.path }); }}
                    className="hover:text-blue-400 cursor-pointer transition-colors">
                    {seg.name}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
        {/* Stats button */}
        {items.length > 0 && (
          <button onClick={function() { onAction("stats", { path: currentPath }); }}
            className="p-1.5 rounded-lg hover:bg-gray-800 cursor-pointer text-gray-400 hover:text-purple-400 shrink-0 transition-all"
            title="Folder statistics">
            <LucideReact.BarChart3 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Summary Stats Bar ── */}
      {summary && (summary.imageCount > 0 || summary.videoCount > 0) && (
        <div className="flex items-center gap-3 px-2 py-1.5 bg-gray-800/40 rounded-lg text-[10px] text-gray-400">
          {summary.imageCount > 0 && (
            <span className="flex items-center gap-1">
              <LucideReact.Image className="w-3 h-3 text-emerald-500" />
              {summary.imageCount} photos
            </span>
          )}
          {summary.videoCount > 0 && (
            <span className="flex items-center gap-1">
              <LucideReact.Video className="w-3 h-3 text-cyan-500" />
              {summary.videoCount} videos
            </span>
          )}
          {summary.totalSize > 0 && (
            <span className="flex items-center gap-1">
              <LucideReact.HardDrive className="w-3 h-3 text-gray-500" />
              {fmtSize(summary.totalSize)}
            </span>
          )}
          {summary.favoriteCount > 0 && (
            <span className="flex items-center gap-1">
              <LucideReact.Heart className="w-3 h-3 text-rose-400" />
              {summary.favoriteCount}
            </span>
          )}
          {summary.dateRange && (
            <span className="hidden sm:flex items-center gap-1">
              <LucideReact.Calendar className="w-3 h-3 text-blue-400" />
              {fmtDate(summary.dateRange.earliest)} — {fmtDate(summary.dateRange.latest)}
            </span>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex-1 min-w-0" style={{ minWidth: "120px" }}>
          <Input placeholder="Filter..." value={searchQuery}
            onChange={function(v) { setSearchQuery(v); }}
            icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
        </div>

        {/* Type filter */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
          {[["all", "All"], ["image", "Photo"], ["video", "Video"]].map(function(pair) {
            var fVal = pair[0];
            var fLabel = pair[1];
            var isActive = ((data && data.filter) || "all") === fVal;
            return (
              <button key={fVal} onClick={function() { onAction("browse", { path: currentPath, filter: fVal, sortBy: (data && data.sortBy) || "name", sortDir: (data && data.sortDir) || "asc" }); }}
                className={"px-2 py-1 cursor-pointer transition-all text-[10px] " +
                  (isActive ? "bg-emerald-500/15 text-emerald-300" : "text-gray-500 hover:text-gray-300")}>
                {fLabel}
              </button>
            );
          })}
        </div>

        <Select size="sm" value={(data && data.sortBy) || "name"} options={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
          { value: "size", label: "Size" },
        ]} onChange={function(v) { onAction("browse", { path: currentPath, sortBy: v, sortDir: (data && data.sortDir) || "asc", filter: (data && data.filter) || "all" }); }} />

        {/* Sort direction toggle */}
        <button onClick={function() {
            var newDir = ((data && data.sortDir) || "asc") === "asc" ? "desc" : "asc";
            onAction("browse", { path: currentPath, sortBy: (data && data.sortBy) || "name", sortDir: newDir, filter: (data && data.filter) || "all" });
          }}
          className="p-1.5 rounded-lg cursor-pointer text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all"
          title={((data && data.sortDir) || "asc") === "desc" ? "Sorted descending" : "Sorted ascending"}>
          {((data && data.sortDir) || "asc") === "desc" ?
            <LucideReact.ArrowDown className="w-3.5 h-3.5" /> :
            <LucideReact.ArrowUp className="w-3.5 h-3.5" />
          }
        </button>

        <button onClick={function() { setFavOnly(!favOnly); }}
          className={"p-1.5 rounded-lg cursor-pointer transition-all " +
            (favOnly ? "bg-rose-500/15 text-rose-400" : "text-gray-500 hover:text-rose-300 hover:bg-gray-800")}
          title={favOnly ? "Show all" : "Favorites only"}>
          <LucideReact.Heart className={"w-3.5 h-3.5" + (favOnly ? " fill-current" : "")} />
        </button>

        <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
          <button onClick={function() { setViewMode("grid"); }}
            className={"px-2 py-1 cursor-pointer transition-all " +
              (viewMode === "grid" ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300")}>
            <LucideReact.Grid3x3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={function() { setViewMode("list"); }}
            className={"px-2 py-1 cursor-pointer transition-all " +
              (viewMode === "list" ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300")}>
            <LucideReact.List className="w-3.5 h-3.5" />
          </button>
        </div>

        <button onClick={function() { setSelectMode(!selectMode); setSelected(new Set()); }}
          className={"p-1.5 rounded-lg cursor-pointer transition-all " +
            (selectMode ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800")}
          title={selectMode ? "Cancel selection" : "Select multiple"}>
          <LucideReact.CheckSquare className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Subdirectories ── */}
      {directories.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {directories.slice(0, 10).map(function(dir, i) {
            return (
              <button key={i} onClick={function() { onAction("browse", { path: dir.path }); }}
                className="flex items-center gap-2 px-3 py-2.5 text-sm bg-gray-800/60 rounded-xl border border-gray-700/50 hover:bg-gray-700/60 hover:border-amber-500/30 cursor-pointer text-gray-200 transition-all">
                <LucideReact.Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="truncate flex-1">{dir.name}</span>
                {dir.itemCount > 0 && <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded-full">{dir.itemCount}</span>}
              </button>
            );
          })}
          {directories.length > 10 && (
            <span className="text-[10px] text-gray-500 self-center ml-1 col-span-2">+{directories.length - 10} more</span>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {filtered.length === 0 && (favOnly || searchQuery || directories.length === 0) ? (
        <EmptyState
          icon={<LucideReact.ImageOff className="w-8 h-8" />}
          title={favOnly ? "No favorites" : searchQuery ? "No matches" : "No media files"}
          description={
            favOnly ? "Mark photos as favorites with the heart icon."
            : searchQuery ? "Try a different filter."
            : "This folder has no photos or videos."
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-3 gap-1.5 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filtered.map(function(item, idx) {
            var isImage = item.type === "image";
            var isVideo = item.type === "video";
            var hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx}
                onClick={function() {
                  if (selectMode) {
                    setSelected(function(prev) {
                      var next = new Set(prev);
                      if (next.has(item.path)) next.delete(item.path);
                      else next.add(item.path);
                      return next;
                    });
                  } else {
                    if (isImage || isVideo) setLightboxIdx(idx);
                    else onAction("view", { path: item.path });
                  }
                }}
                className={"relative group bg-gray-800/50 rounded-lg overflow-hidden border cursor-pointer text-left transition-all " +
                  (selectMode && selected.has(item.path) ? "border-blue-500/60 ring-1 ring-blue-500/30" : "border-gray-700/30 hover:border-blue-500/40")}>
                {selectMode && (
                  <div className="absolute top-1.5 left-1.5 z-10">
                    <div className={"w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all " +
                      (selected.has(item.path) ? "bg-blue-500 border-blue-500" : "border-white/50 bg-black/30")}>
                      {selected.has(item.path) && <LucideReact.Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                )}
                {hasThumb ? (
                  <div style={{ position: "relative", width: "100%", height: "110px" }}>
                    <img src={isVideo ? item.thumbnailUrl : item.mediaUrl} alt={item.name} loading="lazy"
                      style={{ width: "100%", height: "110px", objectFit: "cover" }}
                      onError={function(e) { e.target.style.display = "none"; }} />
                    {isVideo && (
                      <div style={{ position: "absolute", inset: 0 }}
                        className="flex items-center justify-center bg-black/25 group-hover:bg-black/15 transition-all">
                        <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                          <LucideReact.Play className="w-3.5 h-3.5 text-white ml-0.5" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ width: "100%", height: "110px" }} className="flex items-center justify-center bg-gray-700/30">
                    {isVideo ? <LucideReact.Play className="w-6 h-6 text-purple-400" /> : <LucideReact.FileText className="w-6 h-6 text-gray-500" />}
                  </div>
                )}
                {item.isFavorite && (
                  <div className="absolute top-1 right-1">
                    <LucideReact.Heart className="w-3 h-3 text-rose-400 fill-current drop-shadow" />
                  </div>
                )}
                {item.rating > 0 && (
                  <div className="absolute top-1 left-1 flex gap-px">
                    {Array.from({ length: item.rating }, function(_, i) {
                      return <div key={i} className="w-1 h-1 rounded-full bg-amber-400" />;
                    })}
                  </div>
                )}
                <div className="px-1.5 py-1">
                  <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                </div>
                {/* Quick-rate overlay */}
                {item.type === "image" && (
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 py-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    style={{ touchAction: "none" }}
                    onClick={function(e) { e.stopPropagation(); }}>
                    {[1, 2, 3, 4, 5].map(function(star) {
                      return (
                        <button key={star}
                          onClick={function(e) { e.stopPropagation(); onAction("rate", { path: item.path, rating: item.rating === star ? 0 : star }); }}
                          className={"cursor-pointer transition-all p-0.5 " + (star <= (item.rating || 0) ? "text-amber-400" : "text-white/40 hover:text-amber-300")}>
                          <LucideReact.Star className={"w-3 h-3" + (star <= (item.rating || 0) ? " fill-current" : "")} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filtered.map(function(item, idx) {
            var isImage = item.type === "image";
            var isVideo = item.type === "video";
            var hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx}
                onClick={function() { if (isImage || isVideo) setLightboxIdx(idx); else onAction("view", { path: item.path }); }}
                className="flex items-center gap-2 w-full px-2 py-1.5 bg-gray-800/40 rounded-lg border border-gray-700/30 hover:bg-gray-800/70 cursor-pointer text-left transition-all">
                {hasThumb ? (
                  <div style={{ position: "relative", width: "44px", height: "34px", borderRadius: "6px", overflow: "hidden" }} className="shrink-0">
                    <img src={isVideo ? item.thumbnailUrl : item.mediaUrl} alt={item.name} loading="lazy"
                      style={{ width: "44px", height: "34px", objectFit: "cover" }} />
                    {isVideo && (
                      <div style={{ position: "absolute", inset: 0 }} className="flex items-center justify-center bg-black/30">
                        <LucideReact.Play className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ width: "44px", height: "34px", borderRadius: "6px" }} className="bg-gray-700/30 flex items-center justify-center shrink-0">
                    {isVideo ? <LucideReact.Video className="w-3.5 h-3.5 text-purple-400" /> : <LucideReact.FileText className="w-3.5 h-3.5 text-gray-500" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-200 truncate flex items-center gap-1">
                    {item.name}
                    {item.isFavorite && <LucideReact.Heart className="w-2.5 h-2.5 text-rose-400 fill-current shrink-0" />}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {fmtDate((item.exif && item.exif.dateTaken) || item.modifiedAt)} {"\u00b7"} {fmtSize(item.size)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating selection action bar */}
      {selectMode && selected.size > 0 && (
        <div className="sticky bottom-0 z-50 bg-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700/60 p-2 flex items-center gap-2 shadow-xl">
          <span className="text-xs text-gray-300 font-medium px-2">{selected.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={function() {
            var paths = Array.from(selected);
            paths.forEach(function(p) { onAction("favorite", { path: p }); });
          }}>
            <LucideReact.Heart className="w-3.5 h-3.5 mr-1" /> Fav
          </Button>
          <Button size="sm" variant="ghost" onClick={function() { setShowCollAdd(!showCollAdd); }}>
            <LucideReact.FolderPlus className="w-3.5 h-3.5 mr-1" /> Collection
          </Button>
          <Button size="sm" variant="ghost" onClick={function() {
            onAction("__cross_app", {
              target: "photo_studio",
              tool: "batch_process",
              params: { paths: Array.from(selected) }
            });
            setSelectMode(false); setSelected(new Set());
          }}>
            <LucideReact.Palette className="w-3.5 h-3.5 mr-1" /> Style
          </Button>
          <Button size="sm" variant="outline" onClick={function() { setSelectMode(false); setSelected(new Set()); }}>
            <LucideReact.X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Add to Collection inline */}
      {showCollAdd && selectMode && selected.size > 0 && (
        <div className="flex gap-1.5 px-2">
          <div className="flex-1">
            <Input placeholder="Collection name..." value={collAddName}
              onChange={function(v) { setCollAddName(v); }} size="sm" />
          </div>
          <Button size="sm" variant="primary" onClick={function() {
            if (collAddName.trim()) {
              var paths = Array.from(selected);
              onAction("collection", { action: "create", collectionName: collAddName.trim() });
              paths.forEach(function(p) {
                onAction("collection", { action: "add", collectionName: collAddName.trim(), photoPath: p });
              });
              setCollAddName("");
              setShowCollAdd(false);
              setSelectMode(false);
              setSelected(new Set());
            }
          }}>Add</Button>
          <Button size="sm" variant="ghost" onClick={function() { setShowCollAdd(false); }}>
            <LucideReact.X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxIdx >= 0 && lightboxIdx < filtered.length && (function() {
        var photo = filtered[lightboxIdx];
        return (
          <div ref={lbRef} tabIndex={0}
            onKeyDown={function(e) {
              if (e.key === "Escape") { setLightboxIdx(-1); setLbZoom(1); setLbPan({ x: 0, y: 0 }); }
              if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
              if (e.key === "ArrowRight" && lightboxIdx < filtered.length - 1) setLightboxIdx(lightboxIdx + 1);
            }}
            onTouchStart={function(e) {
              if (lbZoom > 1) return;
              setTouchEnd(null);
              setTouchStart(e.targetTouches[0].clientX);
            }}
            onTouchMove={function(e) {
              if (lbZoom > 1) return;
              setTouchEnd(e.targetTouches[0].clientX);
            }}
            onTouchEnd={function() {
              if (!touchStart || !touchEnd || lbZoom > 1) return;
              var dist = touchStart - touchEnd;
              var minSwipe = 50;
              if (dist > minSwipe && lightboxIdx < filtered.length - 1) setLightboxIdx(lightboxIdx + 1);
              if (dist < -minSwipe && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
              setTouchStart(null);
              setTouchEnd(null);
            }}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.95)", outline: "none",
            }}>

            {/* Close */}
            <button onClick={function() { setLightboxIdx(-1); }}
              style={{ position: "absolute", top: 12, right: 16, zIndex: 210 }}
              className="text-white/60 hover:text-white cursor-pointer p-2.5 rounded-lg hover:bg-white/10 transition-all">
              <LucideReact.X className="w-5 h-5" />
            </button>

            {/* Counter */}
            <div style={{ position: "absolute", top: 16, left: 16, zIndex: 210 }}
              className="text-white/40 text-xs font-medium">
              {lightboxIdx + 1} / {filtered.length}
            </div>

            {/* Prev */}
            {lightboxIdx > 0 && (
              <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                <LucideReact.ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Media */}
            {photo.type === "video" ? (
              <video controls autoPlay preload="metadata" src={photo.mediaUrl}
                style={{ maxWidth: "92vw", maxHeight: "82vh", borderRadius: "8px" }}
                onClick={function(e) { e.stopPropagation(); }} />
            ) : (
              <img src={photo.mediaUrl} alt={photo.name}
                onDoubleClick={function() {
                  if (lbZoom > 1) { setLbZoom(1); setLbPan({ x: 0, y: 0 }); }
                  else setLbZoom(2);
                }}
                style={{
                  maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain", borderRadius: "4px",
                  transform: "scale(" + lbZoom + ") translate(" + lbPan.x + "px, " + lbPan.y + "px)",
                  transition: "transform 0.2s ease",
                }} />
            )}

            {/* Next */}
            {lightboxIdx < filtered.length - 1 && (
              <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                <LucideReact.ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Bottom bar */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "16px 20px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              zIndex: 210,
            }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-white/90 truncate font-medium">{photo.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {fmtDate((photo.exif && photo.exif.dateTaken) || photo.modifiedAt)}
                    {" \u00b7 "}{fmtSize(photo.size)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {photo.type === "image" && (
                    <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(-1); onAction("__cross_app", { target: "photo_studio", tool: "preview_styles", params: { photoPath: photo.path } }); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 cursor-pointer transition-all text-xs"
                      title="Style in Photo Studio">
                      <LucideReact.Palette className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button onClick={function(e) { e.stopPropagation(); onAction("favorite", { path: photo.path }); }}
                    className={"p-2.5 rounded-lg cursor-pointer transition-all " + (photo.isFavorite ? "text-rose-400" : "text-white/40 hover:text-white")}>
                    <LucideReact.Heart className={"w-4 h-4" + (photo.isFavorite ? " fill-current" : "")} />
                  </button>
                  {[1, 2, 3, 4, 5].map(function(star) {
                    return (
                      <button key={star}
                        onClick={function(e) { e.stopPropagation(); onAction("rate", { path: photo.path, rating: photo.rating === star ? 0 : star }); }}
                        className={"cursor-pointer transition-all p-0.5 " + (star <= (photo.rating || 0) ? "text-amber-400" : "text-white/30 hover:text-amber-300")}>
                        <LucideReact.Star className={"w-3.5 h-3.5" + (star <= (photo.rating || 0) ? " fill-current" : "")} />
                      </button>
                    );
                  })}
                  <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(-1); onAction("view", { path: photo.path }); }}
                    className="p-2.5 rounded-lg text-white/40 hover:text-white cursor-pointer transition-all">
                    <LucideReact.Info className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

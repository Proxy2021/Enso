export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtDate = function(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return String(d).substring(0, 10); }
  };

  // ── All hooks at top level ──
  var _viewMode = useState("grid");
  var viewMode = _viewMode[0];
  var setViewMode = _viewMode[1];

  var _lightboxIdx = useState(-1);
  var lightboxIdx = _lightboxIdx[0];
  var setLightboxIdx = _lightboxIdx[1];

  var _slideIdx = useState(0);
  var slideIdx = _slideIdx[0];
  var setSlideIdx = _slideIdx[1];

  var _autoPlay = useState(false);
  var autoPlay = _autoPlay[0];
  var setAutoPlay = _autoPlay[1];

  var _filterText = useState("");
  var filterText = _filterText[0];
  var setFilterText = _filterText[1];

  var _selectedStyle = useState("all");
  var selectedStyle = _selectedStyle[0];
  var setSelectedStyle = _selectedStyle[1];

  var _showCaptions = useState(true);
  var showCaptions = _showCaptions[0];
  var setShowCaptions = _showCaptions[1];

  var lbRef = useRef(null);
  var slideTimerRef = useRef(null);

  // ── Detect tool ──
  var tool = data && data.tool ? data.tool : "";
  var isBrowse = tool === "enso_photo_gallery_browse_gallery";
  var isSlideshow = tool === "enso_photo_gallery_view_slideshow";
  var isExhibition = tool === "enso_photo_gallery_create_exhibition";
  var isCompare = tool === "enso_photo_gallery_compare_styles";
  var isFilter = tool === "enso_photo_gallery_filter_collection";

  var photos = data && data.photos ? data.photos : [];
  var styles = data && data.styles ? data.styles : [];

  // Auto-advance slideshow
  useEffect(function() {
    if (isSlideshow && autoPlay && photos.length > 1) {
      var interval = (data && data.interval) || 4000;
      slideTimerRef.current = setInterval(function() {
        setSlideIdx(function(prev) { return (prev + 1) % photos.length; });
      }, interval);
      return function() { clearInterval(slideTimerRef.current); };
    }
  }, [isSlideshow, autoPlay, photos.length]);

  // Lightbox focus
  useEffect(function() {
    if (lightboxIdx >= 0 && lbRef.current) lbRef.current.focus();
  }, [lightboxIdx]);

  // Filtered photos for browse
  var filteredPhotos = useMemo(function() {
    var result = photos;
    if (filterText) {
      var q = filterText.toLowerCase();
      result = result.filter(function(p) {
        return (p.title || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.style || "").toLowerCase().includes(q) ||
          (p.tags || []).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }
    if (selectedStyle !== "all") {
      result = result.filter(function(p) { return (p.style || "").toLowerCase() === selectedStyle.toLowerCase(); });
    }
    return result;
  }, [photos, filterText, selectedStyle]);

  // Collect unique styles
  var uniqueStyles = useMemo(function() {
    var s = {};
    photos.forEach(function(p) { if (p.style) s[p.style] = true; });
    return Object.keys(s);
  }, [photos]);

  // ── Error view ──
  if (data && data.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Something went wrong"
          description={data.error}
          action={<Button size="sm" onClick={function() { onAction("browse_gallery", {}); }}>Browse Gallery</Button>}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── SLIDESHOW VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isSlideshow && photos.length > 0) {
    var currentPhoto = photos[slideIdx] || photos[0];
    var transition = (data && data.transition) || "fade";
    return (
      <div className="bg-black rounded-2xl overflow-hidden border border-gray-800" style={{ position: "relative" }}>
        {/* Top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "12px 16px", background: "linear-gradient(rgba(0,0,0,0.7), transparent)" }}
          className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={function() { onAction("browse_gallery", { collection: data.collection }); }}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5 text-white" />
            </Button>
            <span className="text-white/80 text-xs font-medium">{data.collection || "Slideshow"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-xs">{slideIdx + 1} / {photos.length}</span>
            <button onClick={function() { setAutoPlay(!autoPlay); }}
              className={"p-1.5 rounded-lg cursor-pointer transition-all " + (autoPlay ? "text-emerald-400 bg-emerald-500/20" : "text-white/40 hover:text-white")}>
              {autoPlay
                ? <LucideReact.Pause className="w-4 h-4" />
                : <LucideReact.Play className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Main image */}
        <div style={{ width: "100%", height: "420px", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
          <img src={currentPhoto.url || currentPhoto.mediaUrl} alt={currentPhoto.title || ""}
            style={{ maxWidth: "100%", maxHeight: "420px", objectFit: "contain", transition: transition === "fade" ? "opacity 0.6s ease" : "transform 0.5s ease" }} />
        </div>

        {/* Nav arrows */}
        {slideIdx > 0 && (
          <button onClick={function() { setSlideIdx(slideIdx - 1); }}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
            className="p-2 rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 cursor-pointer transition-all backdrop-blur-sm">
            <LucideReact.ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {slideIdx < photos.length - 1 && (
          <button onClick={function() { setSlideIdx(slideIdx + 1); }}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
            className="p-2 rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 cursor-pointer transition-all backdrop-blur-sm">
            <LucideReact.ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Bottom caption */}
        {showCaptions && (currentPhoto.title || currentPhoto.description) && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "24px 20px 16px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>
            {currentPhoto.title && <div className="text-white text-sm font-semibold mb-1">{currentPhoto.title}</div>}
            {currentPhoto.description && <div className="text-white/60 text-xs leading-relaxed">{currentPhoto.description}</div>}
            {currentPhoto.style && <Badge variant="outline" className="mt-2">{currentPhoto.style}</Badge>}
          </div>
        )}

        {/* Thumbnail strip */}
        <div className="flex gap-1 p-2 overflow-x-auto bg-gray-950" style={{ scrollbarWidth: "thin" }}>
          {photos.map(function(p, i) {
            return (
              <button key={i} onClick={function() { setSlideIdx(i); }}
                style={{ width: "48px", height: "36px", borderRadius: "4px", overflow: "hidden", flexShrink: 0, border: i === slideIdx ? "2px solid #3b82f6" : "2px solid transparent" }}
                className="cursor-pointer transition-all" >
                <img src={p.thumbnail || p.url || p.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: i === slideIdx ? 1 : 0.5 }} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── EXHIBITION VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isExhibition) {
    var layout = (data && data.layout) || "museum";
    var exPhotos = data.photos || [];
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {/* Exhibition header */}
        <div style={{ padding: layout === "magazine" ? "24px 20px 16px" : "32px 24px 20px", background: layout === "minimal" ? "transparent" : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
          className="border-b border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <Button variant="ghost" size="sm" onClick={function() { onAction("browse_gallery", {}); }}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Badge variant="outline">{layout}</Badge>
          </div>
          <h2 style={{ fontSize: layout === "magazine" ? "20px" : "24px", fontWeight: 700, letterSpacing: layout === "minimal" ? "0.05em" : "-0.02em", lineHeight: 1.2 }}
            className="text-white mb-2">
            {data.title || "Untitled Exhibition"}
          </h2>
          {data.description && (
            <p style={{ fontSize: "13px", lineHeight: 1.6, maxWidth: "520px" }} className="text-gray-400">
              {data.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><LucideReact.Image className="w-3 h-3" /> {exPhotos.length} works</span>
            {data.curator && <span className="flex items-center gap-1"><LucideReact.User className="w-3 h-3" /> {data.curator}</span>}
          </div>
        </div>

        {/* Exhibition photos */}
        <div className="p-4">
          {layout === "museum" && (
            <div className="space-y-6">
              {exPhotos.map(function(photo, i) {
                return (
                  <div key={i} className="group">
                    <div className="rounded-xl overflow-hidden bg-black/40 border border-gray-700/30"
                      style={{ maxHeight: "320px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <img src={photo.url || photo.mediaUrl} alt={photo.title || ""}
                        style={{ maxWidth: "100%", maxHeight: "320px", objectFit: "contain" }} />
                    </div>
                    <div className="mt-3 px-1">
                      {photo.title && <div className="text-sm text-gray-200 font-medium">{photo.title}</div>}
                      <div className="flex items-center gap-2 mt-1">
                        {photo.style && <Badge variant="info">{photo.style}</Badge>}
                        {photo.date && <span className="text-[11px] text-gray-500">{fmtDate(photo.date)}</span>}
                      </div>
                      {photo.description && <div className="text-xs text-gray-400 mt-2 leading-relaxed">{photo.description}</div>}
                    </div>
                    {i < exPhotos.length - 1 && <Separator className="mt-6" />}
                  </div>
                );
              })}
            </div>
          )}

          {layout === "magazine" && (
            <div className="grid grid-cols-2 gap-3">
              {exPhotos.map(function(photo, i) {
                var isWide = i % 3 === 0;
                return (
                  <div key={i} className="group" style={{ gridColumn: isWide ? "span 2" : "span 1" }}>
                    <div className="rounded-lg overflow-hidden bg-black/40 border border-gray-700/30"
                      style={{ height: isWide ? "240px" : "160px" }}>
                      <img src={photo.url || photo.mediaUrl} alt={photo.title || ""}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        className="group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="mt-2 px-0.5">
                      {photo.title && <div className="text-xs text-gray-200 font-medium truncate">{photo.title}</div>}
                      {photo.style && <span className="text-[10px] text-gray-500">{photo.style}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {layout === "minimal" && (
            <div className="space-y-8">
              {exPhotos.map(function(photo, i) {
                return (
                  <div key={i} className="flex items-start gap-4">
                    <span className="text-gray-700 text-xs font-mono mt-1" style={{ minWidth: "24px" }}>{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1">
                      <div className="rounded-lg overflow-hidden bg-black/40 mb-2" style={{ maxHeight: "200px" }}>
                        <img src={photo.url || photo.mediaUrl} alt={photo.title || ""}
                          style={{ width: "100%", maxHeight: "200px", objectFit: "cover" }} />
                      </div>
                      {photo.title && <div className="text-xs text-gray-300 font-medium">{photo.title}</div>}
                      {photo.style && <div className="text-[10px] text-gray-500 mt-0.5">{photo.style}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Slideshow CTA */}
        <div className="p-3 border-t border-gray-800 flex justify-center">
          <Button size="sm" variant="primary" onClick={function() { onAction("view_slideshow", { collection: data.title }); }}>
            <LucideReact.Play className="w-3.5 h-3.5 mr-1.5" /> View as Slideshow
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── COMPARE STYLES VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isCompare) {
    var original = data.original || {};
    var variants = data.variants || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse_gallery", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Style Comparison</div>
            <div className="text-[11px] text-gray-500">{original.title || "Original"} in {variants.length} styles</div>
          </div>
        </div>

        {/* Original */}
        <div className="space-y-2">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Original</div>
          <div className="rounded-xl overflow-hidden bg-black/40 border border-gray-700/30" style={{ maxHeight: "200px" }}>
            <img src={original.url || original.mediaUrl} alt={original.title || "Original"}
              style={{ width: "100%", maxHeight: "200px", objectFit: "contain" }} />
          </div>
        </div>

        {/* Variants grid */}
        <div className="space-y-2">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Styled Variants</div>
          <div className="grid grid-cols-2 gap-2">
            {variants.map(function(v, i) {
              return (
                <div key={i} className="group rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/30 hover:border-purple-500/40 transition-all">
                  <div style={{ height: "140px", overflow: "hidden" }}>
                    <img src={v.url || v.mediaUrl} alt={v.style || "Variant"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      className="group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-2">
                    <div className="text-xs text-gray-200 font-medium">{v.style}</div>
                    {v.description && <div className="text-[10px] text-gray-500 mt-0.5 truncate">{v.description}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── FILTER / SEARCH RESULTS VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isFilter) {
    var results = data.results || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse_gallery", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">
              {data.query ? '"' + data.query + '"' : "Filter Results"}
            </div>
            <div className="text-[11px] text-gray-500">
              {results.length} of {data.totalScanned || "?"} photos
              {data.filterStyle ? " \u00b7 Style: " + data.filterStyle : ""}
            </div>
          </div>
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={<LucideReact.SearchX className="w-8 h-8" />}
            title="No matches"
            description="Try different keywords, styles, or tags."
            action={<Button size="sm" onClick={function() { onAction("browse_gallery", {}); }}>Browse All</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {results.map(function(item, idx) {
              return (
                <button key={idx} onClick={function() { setLightboxIdx(idx); }}
                  className="relative group bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/30 hover:border-blue-500/40 cursor-pointer text-left transition-all">
                  <div style={{ position: "relative", width: "100%", height: "100px" }}>
                    <img src={item.thumbnail || item.url || item.mediaUrl} alt={item.title || ""} loading="lazy"
                      style={{ width: "100%", height: "100px", objectFit: "cover" }} />
                  </div>
                  {item.style && (
                    <div className="absolute top-1 left-1">
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px" }} className="bg-purple-500/70 text-white backdrop-blur-sm">{item.style}</span>
                    </div>
                  )}
                  <div className="px-1.5 py-1">
                    <div className="text-[10px] text-gray-300 truncate">{item.title || item.name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Lightbox for filter results */}
        {lightboxIdx >= 0 && lightboxIdx < results.length && (function() {
          var photo = results[lightboxIdx];
          return (
            <div ref={lbRef} tabIndex={0}
              onKeyDown={function(e) {
                if (e.key === "Escape") setLightboxIdx(-1);
                if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
                if (e.key === "ArrowRight" && lightboxIdx < results.length - 1) setLightboxIdx(lightboxIdx + 1);
              }}
              style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.95)", outline: "none" }}>
              <button onClick={function() { setLightboxIdx(-1); }}
                style={{ position: "absolute", top: 12, right: 16, zIndex: 210 }}
                className="text-white/60 hover:text-white cursor-pointer p-1.5 rounded-lg hover:bg-white/10 transition-all">
                <LucideReact.X className="w-5 h-5" />
              </button>
              <div style={{ position: "absolute", top: 16, left: 16, zIndex: 210 }} className="text-white/40 text-xs">{lightboxIdx + 1} / {results.length}</div>
              {lightboxIdx > 0 && (
                <button onClick={function() { setLightboxIdx(lightboxIdx - 1); }}
                  style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                  className="text-white/40 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10 transition-all">
                  <LucideReact.ChevronLeft className="w-6 h-6" />
                </button>
              )}
              <img src={photo.url || photo.mediaUrl} alt={photo.title || ""}
                style={{ maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain", borderRadius: "4px" }} />
              {lightboxIdx < results.length - 1 && (
                <button onClick={function() { setLightboxIdx(lightboxIdx + 1); }}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                  className="text-white/40 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10 transition-all">
                  <LucideReact.ChevronRight className="w-6 h-6" />
                </button>
              )}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 20px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))", zIndex: 210 }}>
                <div className="text-sm text-white/90 font-medium">{photo.title || photo.name}</div>
                {photo.style && <Badge variant="info" className="mt-1">{photo.style}</Badge>}
                {photo.description && <div className="text-xs text-white/50 mt-1">{photo.description}</div>}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── BROWSE GALLERY VIEW (default / primary) ──
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-2.5">

      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-100 truncate flex items-center gap-2">
            <LucideReact.Camera className="w-4 h-4 text-purple-400 shrink-0" />
            {data && data.collection ? data.collection : "Photo Gallery"}
          </div>
          <div className="text-[11px] text-gray-500">{filteredPhotos.length} of {photos.length} photos</div>
        </div>
        <Button variant="ghost" size="sm" onClick={function() { onAction("view_slideshow", { collection: data && data.collection }); }}>
          <LucideReact.Play className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <Input placeholder="Filter photos..." value={filterText}
            onChange={function(v) { setFilterText(v); }}
            icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
        </div>

        {uniqueStyles.length > 0 && (
          <Select size="sm" value={selectedStyle} options={[{ value: "all", label: "All Styles" }].concat(
            uniqueStyles.map(function(s) { return { value: s, label: s }; })
          )} onChange={function(v) { setSelectedStyle(v); }} />
        )}

        <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
          <button onClick={function() { setViewMode("grid"); }}
            className={"px-2 py-1 cursor-pointer transition-all " + (viewMode === "grid" ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300")}>
            <LucideReact.Grid3x3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={function() { setViewMode("masonry"); }}
            className={"px-2 py-1 cursor-pointer transition-all " + (viewMode === "masonry" ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300")}>
            <LucideReact.LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button onClick={function() { setViewMode("list"); }}
            className={"px-2 py-1 cursor-pointer transition-all " + (viewMode === "list" ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300")}>
            <LucideReact.List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {filteredPhotos.length === 0 ? (
        <EmptyState
          icon={<LucideReact.ImageOff className="w-8 h-8" />}
          title={filterText || selectedStyle !== "all" ? "No matching photos" : "No photos yet"}
          description={filterText ? "Try different keywords." : "Add photos to your collection to get started."}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-3 gap-1.5 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filteredPhotos.map(function(item, idx) {
            return (
              <button key={idx} onClick={function() { setLightboxIdx(idx); }}
                className="relative group bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/30 hover:border-purple-500/40 cursor-pointer text-left transition-all">
                <div style={{ position: "relative", width: "100%", height: "110px" }}>
                  <img src={item.thumbnail || item.url || item.mediaUrl} alt={item.title || ""} loading="lazy"
                    style={{ width: "100%", height: "110px", objectFit: "cover" }}
                    className="group-hover:scale-105 transition-transform duration-300" />
                  {item.style && (
                    <div style={{ position: "absolute", bottom: 2, left: 2 }}>
                      <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "3px" }} className="bg-black/60 text-white/80 backdrop-blur-sm">{item.style}</span>
                    </div>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <div className="text-[10px] text-gray-300 truncate">{item.title || item.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : viewMode === "masonry" ? (
        <div style={{ columns: "2", columnGap: "6px" }} className="max-h-96 overflow-y-auto" >
          {filteredPhotos.map(function(item, idx) {
            var heights = ["130px", "170px", "150px", "190px", "140px"];
            var h = heights[idx % heights.length];
            return (
              <button key={idx} onClick={function() { setLightboxIdx(idx); }}
                style={{ breakInside: "avoid", marginBottom: "6px", display: "block", width: "100%" }}
                className="group rounded-lg overflow-hidden bg-gray-800/50 border border-gray-700/30 hover:border-purple-500/40 cursor-pointer transition-all">
                <div style={{ height: h, overflow: "hidden" }}>
                  <img src={item.thumbnail || item.url || item.mediaUrl} alt={item.title || ""} loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    className="group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="px-1.5 py-1">
                  <div className="text-[10px] text-gray-300 truncate">{item.title || item.name}</div>
                  {item.style && <div className="text-[9px] text-purple-400">{item.style}</div>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filteredPhotos.map(function(item, idx) {
            return (
              <button key={idx} onClick={function() { setLightboxIdx(idx); }}
                className="flex items-center gap-2.5 w-full px-2 py-1.5 bg-gray-800/40 rounded-lg border border-gray-700/30 hover:bg-gray-800/70 cursor-pointer text-left transition-all">
                <div style={{ width: "48px", height: "36px", borderRadius: "6px", overflow: "hidden" }} className="shrink-0">
                  <img src={item.thumbnail || item.url || item.mediaUrl} alt={item.title || ""} loading="lazy"
                    style={{ width: "48px", height: "36px", objectFit: "cover" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-200 truncate">{item.title || item.name}</div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                    {item.style && <span className="text-purple-400">{item.style}</span>}
                    {item.date && <span>{fmtDate(item.date)}</span>}
                    {item.tags && item.tags.length > 0 && <span>{item.tags.slice(0, 2).join(", ")}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-gray-800/50">
        <Button variant="ghost" size="sm" onClick={function() { onAction("filter_collection", { collection: data && data.collection }); }}>
          <LucideReact.Filter className="w-3 h-3 mr-1" /> Filter
        </Button>
        <Button variant="ghost" size="sm" onClick={function() { onAction("create_exhibition", { collection: data && data.collection }); }}>
          <LucideReact.Frame className="w-3 h-3 mr-1" /> Exhibition
        </Button>
        <Button variant="ghost" size="sm" onClick={function() { onAction("compare_styles", { collection: data && data.collection }); }}>
          <LucideReact.Columns className="w-3 h-3 mr-1" /> Compare
        </Button>
      </div>

      {/* ── Lightbox ── */}
      {lightboxIdx >= 0 && lightboxIdx < filteredPhotos.length && (function() {
        var photo = filteredPhotos[lightboxIdx];
        return (
          <div ref={lbRef} tabIndex={0}
            onKeyDown={function(e) {
              if (e.key === "Escape") setLightboxIdx(-1);
              if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
              if (e.key === "ArrowRight" && lightboxIdx < filteredPhotos.length - 1) setLightboxIdx(lightboxIdx + 1);
            }}
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.95)", outline: "none" }}>

            <button onClick={function() { setLightboxIdx(-1); }}
              style={{ position: "absolute", top: 12, right: 16, zIndex: 210 }}
              className="text-white/60 hover:text-white cursor-pointer p-1.5 rounded-lg hover:bg-white/10 transition-all">
              <LucideReact.X className="w-5 h-5" />
            </button>

            <div style={{ position: "absolute", top: 16, left: 16, zIndex: 210 }} className="text-white/40 text-xs font-medium">
              {lightboxIdx + 1} / {filteredPhotos.length}
            </div>

            {lightboxIdx > 0 && (
              <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/40 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10 transition-all">
                <LucideReact.ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <img src={photo.url || photo.mediaUrl} alt={photo.title || ""}
              style={{ maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain", borderRadius: "4px" }} />

            {lightboxIdx < filteredPhotos.length - 1 && (
              <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/40 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10 transition-all">
                <LucideReact.ChevronRight className="w-6 h-6" />
              </button>
            )}

            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "20px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))", zIndex: 210
            }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-white/90 font-medium truncate">{photo.title || photo.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {photo.style && <Badge variant="info">{photo.style}</Badge>}
                    {photo.date && <span className="text-[11px] text-gray-400">{fmtDate(photo.date)}</span>}
                  </div>
                  {photo.description && <div className="text-xs text-white/50 mt-1.5 leading-relaxed">{photo.description}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button onClick={function(e) { e.stopPropagation(); onAction("compare_styles", { photoId: photo.id, photoUrl: photo.url || photo.mediaUrl }); }}
                    className="p-2 rounded-lg text-white/40 hover:text-white cursor-pointer transition-all">
                    <LucideReact.Columns className="w-4 h-4" />
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

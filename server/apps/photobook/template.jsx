export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (always at top) ──
  var [currentPage, setCurrentPage] = useState(0);
  var [showThumbs, setShowThumbs] = useState(false);
  var [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  var [createTitle, setCreateTitle] = useState("");
  var [createSubtitle, setCreateSubtitle] = useState("");
  var [selectedStyle, setSelectedStyle] = useState("warm");
  var [selectedAccent, setSelectedAccent] = useState("#C4785B");

  // ── Tool detection ──
  var tool = data?.tool || "";
  var isBrowse = tool === "enso_photobook_browse";
  var isCreate = tool === "enso_photobook_create";
  var isView = tool === "enso_photobook_view";
  var isEdit = tool === "enso_photobook_edit";
  var isArrange = tool === "enso_photobook_arrange";
  var isStyle = tool === "enso_photobook_style";
  var isExport = tool === "enso_photobook_export";

  // ── Style system ──
  var STYLES = {
    warm: { bg: "#FAF8F5", bg2: "#F0EDE8", text: "#2C2C2C", muted: "#888888", faint: "#AAAAAA" },
    pure: { bg: "#FFFFFF", bg2: "#F5F5F5", text: "#333333", muted: "#888888", faint: "#AAAAAA" },
    moody: { bg: "#2C2C2C", bg2: "#404040", text: "#E8E4DF", muted: "#999999", faint: "#777777" }
  };
  var ACCENTS = [
    { id: "terracotta", hex: "#C4785B", name: "Terracotta" },
    { id: "sage", hex: "#B2BDA0", name: "Sage" },
    { id: "dusty-rose", hex: "#D4A5A5", name: "Dusty Rose" },
    { id: "slate", hex: "#708090", name: "Slate" },
    { id: "warm-gray", hex: "#A89F91", name: "Neutral" }
  ];

  var bookStyle = (data?.style) || "warm";
  var theme = STYLES[bookStyle] || STYLES.warm;
  var accent = (data?.accentColor) || "#C4785B";
  var photoBorder = "#E8E4DF";

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Something went wrong"
          description={data.error}
          action={<Button size="sm" onClick={() => onAction("browse", {})}>Go Home</Button>}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── BROWSE VIEW ──
  // ════════════════════════════════════════════════════════════════
  if (isBrowse) {
    var books = data?.books || [];
    var sources = data?.photoSources || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.BookOpen className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-semibold text-gray-100">Photobooks</span>
          </div>
        </div>

        {/* Existing books */}
        {books.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {(books || []).map(function(book, i) {
              return (
                <button key={book?.id || i}
                  onClick={() => onAction("view", { bookId: book?.id })}
                  className="bg-gray-800/60 rounded-xl border border-gray-700/40 overflow-hidden hover:border-amber-500/40 cursor-pointer text-left transition-all group">
                  {book?.coverUrl ? (
                    <div style={{ position: "relative", width: "100%", height: "100px", overflow: "hidden" }}>
                      <img src={book.coverUrl} alt={book?.title ?? ""} loading="lazy"
                        style={{ width: "100%", height: "100px", objectFit: "cover" }}
                        className="group-hover:opacity-90 transition-opacity" />
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
                        padding: "16px 8px 6px"
                      }}>
                        <div className="text-[10px] text-white/90 font-medium truncate">{book?.title ?? "Untitled"}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: "100px" }} className="bg-gray-700/30 flex items-center justify-center">
                      <LucideReact.BookOpen className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                  <div className="p-2">
                    <div className="text-[10px] text-gray-400">{book?.subtitle ?? ""}</div>
                    <div className="text-[10px] text-gray-500">{book?.pageCount ?? 0} pages · {book?.photoCount ?? 0} photos</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<LucideReact.BookOpen className="w-8 h-8" />}
            title="No photobooks yet"
            description="Create your first photobook from a photo folder."
          />
        )}

        <Separator />

        {/* Photo sources */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Photo Sources</div>
            <div className="flex flex-wrap gap-2">
              {(sources || []).map(function(src, i) {
                return (
                  <button key={i}
                    onClick={() => onAction("create", { title: src?.name ?? "New Book", photoPaths: [], path: src?.path })}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 rounded-xl border border-gray-700/50 hover:bg-gray-750 hover:border-amber-500/30 cursor-pointer transition-all">
                    <LucideReact.FolderOpen className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-gray-300">{src?.name ?? "Folder"}</span>
                    <span className="text-[10px] text-gray-500">{src?.count ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── CREATE RESULT VIEW ──
  // ════════════════════════════════════════════════════════════════
  if (isCreate) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(196,120,91,0.15)" }}>
            <LucideReact.Check className="w-4 h-4" style={{ color: data?.accentColor || "#C4785B" }} />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-100">{data?.title ?? "Photobook Created"}</div>
            <div className="text-[11px] text-gray-500">{data?.message ?? ""}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Pages" value={data?.pageCount ?? 0} accent="amber" />
          <Stat label="Style" value={data?.style ?? "warm"} accent="purple" />
          <Stat label="Font" value={(data?.fontPair ?? "lato").split("-")[0]} accent="cyan" />
        </div>

        {/* Page summary */}
        {(data?.pages || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(data?.pages || []).map(function(pg, i) {
              return (
                <Badge key={i} variant="outline">
                  {(pg?.templateId ?? "page")}
                </Badge>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => onAction("view", { bookId: data?.bookId })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> View Book
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("browse", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── VIEW — Full Photobook Viewer ──
  // ════════════════════════════════════════════════════════════════
  if (isView) {
    var pages = data?.pages || [];
    var totalPages = pages.length;
    var pg = pages[currentPage] || null;
    var bookTitle = data?.title || "Photobook";

    var goNext = function() { setCurrentPage(function(p) { return Math.min(p + 1, totalPages - 1); }); };
    var goPrev = function() { setCurrentPage(function(p) { return Math.max(p - 1, 0); }); };

    // Page wrapper (square aspect)
    var wrapStyle = { position: "relative", width: "100%", paddingBottom: "100%", background: theme.bg, overflow: "hidden" };
    var innerStyle = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };

    // ── Page renderers ──
    var renderCoverPage = function(p) {
      var photo = (p?.photos || [])[0];
      var text = p?.textContent || {};
      return (
        <div style={wrapStyle}>
          <div style={innerStyle}>
            {photo?.url && <img src={photo.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onClick={() => { if (photo) setFullscreenPhoto(photo); }} />}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
              padding: "48px 10% 40px", textAlign: "center"
            }}>
              <div style={{ color: "#FFF", fontSize: "28px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", lineHeight: 1.2, marginBottom: "6px" }}>
                {text?.heading || data?.title || ""}
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", letterSpacing: "2px" }}>
                {text?.subtitle || data?.subtitle || ""}
              </div>
            </div>
          </div>
        </div>
      );
    };

    var renderHeroPage = function(p) {
      var photo = (p?.photos || [])[0];
      return (
        <div style={wrapStyle}>
          <div style={innerStyle}>
            {photo?.url && <img src={photo.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
              onClick={() => { if (photo) setFullscreenPhoto(photo); }} />}
            {photo?.caption && (
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "linear-gradient(transparent, rgba(0,0,0,0.4))",
                padding: "24px 20px 12px"
              }}>
                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px", letterSpacing: "0.3px" }}>{photo.caption}</div>
              </div>
            )}
          </div>
        </div>
      );
    };

    var renderCenteredPage = function(p) {
      var photo = (p?.photos || [])[0];
      return (
        <div style={wrapStyle}>
          <div style={{ ...innerStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12%", background: theme.bg }}>
            <div style={{ width: "100%", borderRadius: "4px", overflow: "hidden", border: "1px solid " + photoBorder, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", cursor: "pointer" }}>
              {photo?.url && <img src={photo.url} alt="" style={{ width: "100%", display: "block", objectFit: "cover" }}
                onClick={() => { if (photo) setFullscreenPhoto(photo); }} />}
            </div>
            {photo?.caption && (
              <div style={{ marginTop: "14px", textAlign: "center", color: theme.muted, fontSize: "11px", letterSpacing: "0.3px" }}>{photo.caption}</div>
            )}
            {photo?.location && (
              <div style={{ marginTop: "3px", textAlign: "center", color: theme.faint, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase" }}>{photo.location}</div>
            )}
          </div>
        </div>
      );
    };

    var renderDuoPage = function(p) {
      var photos = p?.photos || [];
      return (
        <div style={wrapStyle}>
          <div style={{ ...innerStyle, padding: "8%", background: theme.bg, display: "flex", gap: "16px", alignItems: "stretch" }}>
            <div style={{ flex: "63", display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, borderRadius: "4px", overflow: "hidden", border: "1px solid " + photoBorder, cursor: "pointer" }}>
                {(photos[0])?.url && <img src={photos[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onClick={() => setFullscreenPhoto(photos[0])} />}
              </div>
              {(photos[0])?.caption && <div style={{ marginTop: "8px", color: theme.muted, fontSize: "11px" }}>{photos[0].caption}</div>}
            </div>
            <div style={{ flex: "33", display: "flex", flexDirection: "column", paddingTop: "12%" }}>
              <div style={{ flex: 1, maxHeight: "60%", borderRadius: "4px", overflow: "hidden", border: "1px solid " + photoBorder, cursor: "pointer" }}>
                {(photos[1])?.url && <img src={photos[1].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onClick={() => setFullscreenPhoto(photos[1])} />}
              </div>
              {(photos[1])?.caption && <div style={{ marginTop: "8px", color: theme.muted, fontSize: "11px" }}>{photos[1].caption}</div>}
            </div>
          </div>
        </div>
      );
    };

    var renderTrioPage = function(p) {
      var photos = p?.photos || [];
      return (
        <div style={wrapStyle}>
          <div style={{ ...innerStyle, padding: "8%", background: theme.bg, display: "flex", gap: "16px" }}>
            <div style={{ flex: "34", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ flex: 1, borderRadius: "4px", overflow: "hidden", border: "1px solid " + photoBorder, cursor: "pointer" }}>
                {(photos[0])?.url && <img src={photos[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onClick={() => setFullscreenPhoto(photos[0])} />}
              </div>
              <div style={{ flex: 1, borderRadius: "4px", overflow: "hidden", border: "1px solid " + photoBorder, cursor: "pointer" }}>
                {(photos[1])?.url && <img src={photos[1].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onClick={() => setFullscreenPhoto(photos[1])} />}
              </div>
            </div>
            <div style={{ flex: "58", borderRadius: "4px", overflow: "hidden", border: "1px solid " + photoBorder, cursor: "pointer" }}>
              {(photos[2])?.url && <img src={photos[2].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onClick={() => setFullscreenPhoto(photos[2])} />}
            </div>
          </div>
        </div>
      );
    };

    var renderTextPage = function(p) {
      var text = p?.textContent || {};
      return (
        <div style={wrapStyle}>
          <div style={{ ...innerStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: theme.bg, padding: "16%" }}>
            <div style={{ color: theme.text, fontSize: "24px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", textAlign: "center", lineHeight: 1.3, marginBottom: "10px" }}>
              {text?.heading ?? ""}
            </div>
            <div style={{ color: theme.muted, fontSize: "12px", letterSpacing: "1.5px", textAlign: "center", marginBottom: "24px", opacity: 0.7 }}>
              {text?.subtitle ?? ""}
            </div>
            <div style={{ width: "40px", height: "2px", background: accent }} />
          </div>
        </div>
      );
    };

    var renderCurrentPage = function() {
      if (!pg) return null;
      var tid = pg?.templateId || "hero";
      if (tid === "cover") return renderCoverPage(pg);
      if (tid === "hero") return renderHeroPage(pg);
      if (tid === "centered") return renderCenteredPage(pg);
      if (tid === "duo") return renderDuoPage(pg);
      if (tid === "trio") return renderTrioPage(pg);
      if (tid === "text") return renderTextPage(pg);
      return renderHeroPage(pg);
    };

    var getPageThumb = function(p) {
      if (!p) return null;
      var tid = p?.templateId || "";
      if (tid === "text") return null;
      var photos = p?.photos || [];
      if (photos.length > 0) return photos[0]?.url || null;
      return null;
    };

    return (
      <div style={{ background: "#1A1A1A", borderRadius: "16px", overflow: "hidden", position: "relative" }}>
        {/* Top chrome */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "rgba(0,0,0,0.5)" }}>
          <button onClick={() => onAction("browse", {})}
            className="text-gray-400 hover:text-white cursor-pointer p-1 rounded transition-all" style={{ background: "none", border: "none" }}>
            <LucideReact.ArrowLeft style={{ width: "16px", height: "16px" }} />
          </button>
          <button onClick={() => setShowThumbs(!showThumbs)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", fontSize: "12px", padding: "4px 8px" }}>
            {(currentPage + 1) + " / " + totalPages}
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => onAction("style", { bookId: data?.bookId })}
              className="text-gray-500 hover:text-amber-400 cursor-pointer p-1 rounded transition-all" style={{ background: "none", border: "none" }}>
              <LucideReact.Palette style={{ width: "14px", height: "14px" }} />
            </button>
            <button onClick={() => onAction("export", { bookId: data?.bookId })}
              className="text-gray-500 hover:text-emerald-400 cursor-pointer p-1 rounded transition-all" style={{ background: "none", border: "none" }}>
              <LucideReact.Download style={{ width: "14px", height: "14px" }} />
            </button>
          </div>
        </div>

        {/* Page */}
        <div style={{ position: "relative" }}>
          {renderCurrentPage()}
          {/* Prev */}
          {currentPage > 0 && (
            <button onClick={goPrev} style={{
              position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)",
              width: "34px", height: "34px", borderRadius: "50%",
              background: "rgba(0,0,0,0.35)", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5
            }}>
              <LucideReact.ChevronLeft style={{ width: "18px", height: "18px", color: "white" }} />
            </button>
          )}
          {/* Next */}
          {currentPage < totalPages - 1 && (
            <button onClick={goNext} style={{
              position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
              width: "34px", height: "34px", borderRadius: "50%",
              background: "rgba(0,0,0,0.35)", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5
            }}>
              <LucideReact.ChevronRight style={{ width: "18px", height: "18px", color: "white" }} />
            </button>
          )}
          {/* Page number */}
          {pg?.templateId !== "cover" && (
            <div style={{ position: "absolute", bottom: "10px", right: "14px", color: theme.faint, fontSize: "9px", letterSpacing: "1px", zIndex: 5, mixBlendMode: "difference" }}>
              {currentPage}
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {showThumbs && (
          <div style={{ display: "flex", gap: "5px", padding: "8px 10px", overflowX: "auto", background: "rgba(0,0,0,0.6)", scrollbarWidth: "none" }}>
            {(pages || []).map(function(p, idx) {
              var thumb = getPageThumb(p);
              var isActive = idx === currentPage;
              var isText = (p?.templateId) === "text";
              return (
                <button key={idx} onClick={() => setCurrentPage(idx)}
                  style={{
                    flexShrink: 0, width: "44px", height: "44px", borderRadius: "5px",
                    overflow: "hidden", border: isActive ? ("2px solid " + accent) : "2px solid transparent",
                    cursor: "pointer", background: isText ? theme.bg2 : "#333",
                    opacity: isActive ? 1 : 0.55, transition: "all 0.2s"
                  }}>
                  {thumb ? (
                    <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: theme.muted, fontSize: "8px" }}>
                      {isText ? "§" : (idx + 1)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Fullscreen overlay */}
        {fullscreenPhoto && (
          <div onClick={() => setFullscreenPhoto(null)}
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 200, cursor: "pointer" }}>
            <button onClick={(e) => { e.stopPropagation(); setFullscreenPhoto(null); }}
              style={{ position: "absolute", top: "14px", right: "14px", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", zIndex: 210, padding: "6px" }}>
              <LucideReact.X style={{ width: "20px", height: "20px" }} />
            </button>
            <img src={fullscreenPhoto?.url ?? ""} alt="" style={{ maxWidth: "92vw", maxHeight: "80vh", objectFit: "contain", borderRadius: "4px" }} />
            {fullscreenPhoto?.caption && (
              <div style={{ marginTop: "14px", color: "rgba(255,255,255,0.65)", fontSize: "12px", textAlign: "center", padding: "0 20px" }}>{fullscreenPhoto.caption}</div>
            )}
            {fullscreenPhoto?.location && (
              <div style={{ marginTop: "3px", color: "rgba(255,255,255,0.3)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase" }}>{fullscreenPhoto.location}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── EDIT RESULT VIEW ──
  // ════════════════════════════════════════════════════════════════
  if (isEdit) {
    var up = data?.updatedPage || {};
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="success">Updated</Badge>
          <span className="text-sm text-gray-200">{data?.message ?? "Page updated"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Stat label="Page" value={data?.page ?? "?"} accent="blue" />
          <Stat label="Template" value={up?.templateId ?? "?"} accent="purple" />
          <Stat label="Photos" value={(up?.photos || []).length} accent="amber" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => onAction("view", { bookId: data?.bookId })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> View Book
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("browse", {})}>Back</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── ARRANGE RESULT VIEW ──
  // ════════════════════════════════════════════════════════════════
  if (isArrange) {
    var pageOrder = data?.pageOrder || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="success">{data?.action ?? "Updated"}</Badge>
          <span className="text-sm text-gray-200">{data?.message ?? "Pages rearranged"}</span>
        </div>
        <Stat label="Total Pages" value={data?.totalPages ?? 0} accent="blue" />
        {pageOrder.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(pageOrder || []).map(function(pg, i) {
              return <Badge key={i} variant="outline">{i + ". " + (pg?.templateId ?? "?")}</Badge>;
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => onAction("view", { bookId: data?.bookId })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> View Book
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("browse", {})}>Back</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── STYLE VIEW ──
  // ════════════════════════════════════════════════════════════════
  if (isStyle) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <LucideReact.Palette className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-semibold text-gray-100">Style Updated</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Style" value={data?.style ?? "warm"} accent="purple" />
          <Stat label="Accent" value={ACCENTS.find(function(a) { return a.hex === data?.accentColor; })?.name ?? "Custom"} accent="amber" />
          <Stat label="Font" value={(data?.fontPair ?? "lato").split("-")[0]} accent="cyan" />
        </div>
        {/* Color preview */}
        <div className="flex gap-2">
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: data?.bgPrimary || "#FAF8F5", border: "1px solid rgba(255,255,255,0.1)" }} />
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: data?.bgSecondary || "#F0EDE8", border: "1px solid rgba(255,255,255,0.1)" }} />
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: data?.accentColor || "#C4785B" }} />
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: data?.textColor || "#2C2C2C", border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>
        <div className="text-xs text-gray-500">{data?.message ?? ""}</div>
        <Button size="sm" variant="primary" onClick={() => onAction("view", { bookId: data?.bookId })}>
          <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> View Book
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── EXPORT VIEW ──
  // ════════════════════════════════════════════════════════════════
  if (isExport) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <LucideReact.Download className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-100">{data?.message ?? "Export Ready"}</div>
            <div className="text-[11px] text-gray-500">{data?.title ?? ""}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Format" value={(data?.format ?? "pdf").toUpperCase()} accent="emerald" />
          <Stat label="Pages" value={data?.pageCount ?? 0} accent="blue" />
          <Stat label="Size" value={data?.estimatedSize ?? "?"} accent="amber" />
        </div>
        {data?.exportPath && (
          <div className="bg-gray-800/60 rounded-xl p-2.5 border border-gray-700/40">
            <div className="text-[10px] text-gray-500 mb-1">Saved to:</div>
            <div className="text-xs text-gray-200 truncate">{data.exportPath}</div>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => onAction("view", { bookId: data?.bookId })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> View Book
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("browse", {})}>Back</Button>
        </div>
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <EmptyState
        icon={<LucideReact.BookOpen className="w-8 h-8" />}
        title="Photobook Studio"
        description="Browse, create, and view digital photobooks."
        action={<Button size="sm" onClick={() => onAction("browse", {})}>Browse</Button>}
      />
    </div>
  );
}

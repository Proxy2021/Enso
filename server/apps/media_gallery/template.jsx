export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  const fmtSize = (b) => {
    if (!b && b !== 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };
  const fmtDate = (d) => {
    if (!d) return "";
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return String(d).substring(0, 10); }
  };
  const pathSegments = (p) => {
    if (!p) return [];
    const parts = String(p).replace(/\\/g, "/").split("/").filter(Boolean);
    const segs = [];
    for (let i = 0; i < parts.length; i++) {
      segs.push({ name: parts[i], path: parts.slice(0, i + 1).join("/") });
    }
    return segs;
  };

  // ── Hooks ──
  const [viewMode, setViewMode] = useState("grid");
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [createInput, setCreateInput] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const lbRef = useRef(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [lbZoom, setLbZoom] = useState(1);
  const [lbPan, setLbPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (lightboxIdx >= 0 && lbRef.current) lbRef.current.focus();
  }, [lightboxIdx]);

  useEffect(() => {
    setLbZoom(1);
    setLbPan({ x: 0, y: 0 });
  }, [lightboxIdx]);

  useEffect(() => {
    if (!selectMode) setSelected(new Set());
  }, [selectMode]);

  // ── Detect view type ──
  const tool = data?.tool || "";
  const isDrives = tool === "enso_media_gallery_browse" && Array.isArray(data?.drives);
  const isBrowse = tool === "enso_media_gallery_browse" && !Array.isArray(data?.drives);
  const isPhoto = tool === "enso_media_gallery_view";
  const isFavoriteResult = tool === "enso_media_gallery_favorite";
  const isRateResult = tool === "enso_media_gallery_rate";
  const isSearch = tool === "enso_media_gallery_search";
  const isCollections = tool === "enso_media_gallery_collection";
  const isInspect = tool === "enso_media_gallery_inspect";
  const isPhotoLike = isPhoto || isFavoriteResult || isRateResult || isInspect;

  const items = data?.items ?? [];
  const directories = data?.directories ?? [];
  const currentPath = String(data?.path ?? ".");
  const parentPath = data?.parentPath;

  const filtered = useMemo(() => {
    let result = items;
    if (favOnly) result = result.filter((i) => i.isFavorite);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.aiDescription || "").toLowerCase().includes(q) ||
        (i.aiTags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, searchQuery, favOnly]);

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

  // ════════════════════════════════════════════════════════════════════════
  // ── Home / Drives View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isDrives) {
    const drives = data?.drives || [];
    const quickAccess = data?.quickAccess || [];
    const bookmarks = data?.bookmarks || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Quick Access */}
        {quickAccess.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Quick Access</div>
            <div className="grid grid-cols-3 gap-2">
              {quickAccess.map((qa, i) => (
                <button key={i} onClick={() => onAction("browse", { path: qa.path })}
                  className="flex flex-col items-center gap-1.5 px-3 py-3 bg-gray-800/60 rounded-xl border border-gray-700/50 hover:bg-gray-750 hover:border-blue-500/30 cursor-pointer transition-all">
                  <LucideReact.FolderOpen className="w-5 h-5 text-blue-400" />
                  <span className="text-xs text-gray-300">{qa.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bookmarks */}
        {bookmarks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Bookmarks</div>
            <div className="grid grid-cols-2 gap-2">
              {bookmarks.map((bm, i) => (
                <button key={i} onClick={() => onAction("browse", { path: bm.path })}
                  className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/60 rounded-xl border border-amber-500/20 hover:border-amber-400/40 cursor-pointer text-left transition-all">
                  <LucideReact.Bookmark className="w-4 h-4 text-amber-400 fill-current shrink-0" />
                  <span className="text-xs text-gray-200 truncate">{bm.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drives */}
        <div className="space-y-2">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Drives</div>
          <div className="flex flex-wrap gap-2">
            {drives.map((drv, i) => (
              <button key={i} onClick={() => onAction("browse", { path: drv.path })}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/60 rounded-xl border border-gray-700/50 hover:bg-gray-750 hover:border-blue-500/30 cursor-pointer transition-all">
                <LucideReact.HardDrive className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-200">{drv.name}</span>
              </button>
            ))}
          </div>
        </div>

        <Separator />
        <Button variant="ghost" size="sm" onClick={() => onAction("collection", { action: "list" })}>
          <LucideReact.FolderHeart className="w-3.5 h-3.5 mr-1.5" /> Collections
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Photo Detail View (also handles inspect/favorite/rate) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPhotoLike) {
    const exif = data.exif || {};
    const folderPath = data.path ? data.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/") : ".";
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("browse", { path: folderPath })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{data.name || "Photo"}</div>
            <div className="text-[11px] text-gray-500">
              {fmtSize(data.size)}
              {exif.width ? " \u00b7 " + exif.width + "\u00d7" + exif.height : ""}
            </div>
          </div>
          <button onClick={() => onAction("favorite", { path: data.path })}
            className={"p-2.5 rounded-xl cursor-pointer transition-all " + (data.isFavorite ? "text-rose-400 bg-rose-500/10" : "text-gray-500 hover:text-rose-300 hover:bg-gray-800")}>
            {data.isFavorite ? <LucideReact.Heart className="w-4 h-4 fill-current" /> : <LucideReact.Heart className="w-4 h-4" />}
          </button>
        </div>

        {/* Media */}
        <div className="rounded-xl overflow-hidden bg-black/40 flex items-center justify-center" style={{ maxHeight: "400px" }}>
          {data.type === "video" ? (
            <video controls preload="metadata" src={data.mediaUrl}
              style={{ maxWidth: "100%", maxHeight: "400px" }}
              onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={data.mediaUrl} alt={data.name}
              style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain" }} />
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star}
              onClick={() => onAction("rate", { path: data.path, rating: data.rating === star ? 0 : star })}
              className={"cursor-pointer transition-all p-0.5 " + (star <= (data.rating || 0) ? "text-amber-400" : "text-gray-600 hover:text-amber-300")}>
              <LucideReact.Star className={"w-4 h-4" + (star <= (data.rating || 0) ? " fill-current" : "")} />
            </button>
          ))}
        </div>

        {/* AI Description */}
        {data.aiDescription && (
          <div className="bg-purple-500/5 rounded-xl p-3 border border-purple-500/15">
            <div className="text-xs text-gray-300 leading-relaxed">{data.aiDescription}</div>
            {data.aiTags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {data.aiTags.map((tag, i) => <Badge key={i} variant="info">{tag}</Badge>)}
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

        {/* Cross-app navigation — edit in Photo Studio */}
        {data.type === "image" && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => onAction("__cross_app", { target: "photo_studio", tool: "preview_styles", params: { photoPath: data.path } })}>
              <LucideReact.Palette className="w-3.5 h-3.5 mr-1" /> Style in Photo Studio
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAction("__cross_app", { target: "photo_studio", tool: "adjust", params: { path: data.path } })}>
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
    const results = data.results || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("browse", { path: data.path || "." })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">"{data.query}"</div>
            <div className="text-[11px] text-gray-500">{data.total || 0} results</div>
          </div>
        </div>

        {/* Search again */}
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input placeholder="Search..." value={searchInput}
              onChange={(v) => setSearchInput(v)}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
          </div>
          <Button size="sm" variant="primary"
            onClick={() => { if (searchInput.trim()) onAction("search", { path: data.path, query: searchInput.trim() }); }}>
            Search
          </Button>
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={<LucideReact.SearchX className="w-8 h-8" />}
            title="No matches"
            description={"Try different keywords or browse the folder."}
            action={<Button size="sm" onClick={() => onAction("browse", { path: data.path || "." })}>Browse</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {results.map((item, idx) => (
              <button key={idx} onClick={() => onAction("view", { path: item.path })}
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
                <div className="p-1.5">
                  <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Collections List ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCollections && data.action !== "view") {
    const colls = data.collections || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAction("browse", {})}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-semibold text-gray-100">Collections</span>
            <Badge variant="outline">{colls.length}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCreateInput(createInput === null ? "" : null)}>
            <LucideReact.Plus className="w-4 h-4" />
          </Button>
        </div>

        {createInput !== null && (
          <div className="flex gap-1.5">
            <div className="flex-1">
              <Input placeholder="Collection name..." value={createInput}
                onChange={(v) => setCreateInput(v)} size="sm" />
            </div>
            <Button size="sm" variant="primary"
              onClick={() => {
                if (createInput.trim()) {
                  onAction("collection", { action: "create", collectionName: createInput.trim() });
                  setCreateInput(null);
                }
              }}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreateInput(null)}>
              <LucideReact.X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {colls.length === 0 ? (
          <EmptyState
            icon={<LucideReact.FolderHeart className="w-8 h-8" />}
            title="No collections yet"
            description="Organize your photos into albums."
            action={<Button size="sm" onClick={() => setCreateInput("")}>Create</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {colls.map((col, i) => (
              <button key={i} onClick={() => onAction("collection", { action: "view", collectionName: col.name })}
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
            ))}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Collection Detail ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCollections && data.action === "view") {
    const colItems = data.items || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("collection", { action: "list" })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{data.collectionName}</div>
            <div className="text-[11px] text-gray-500">{data.total || colItems.length} photos</div>
          </div>
          <Button variant="danger" size="sm" onClick={() => onAction("collection", { action: "delete", collectionName: data.collectionName })}>
            <LucideReact.Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {colItems.length === 0 ? (
          <EmptyState
            icon={<LucideReact.ImageOff className="w-8 h-8" />}
            title="Empty collection"
            description="Browse your gallery and add photos."
            action={<Button size="sm" onClick={() => onAction("browse", {})}>Browse</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {colItems.map((item, idx) => (
              <button key={idx} onClick={() => onAction("view", { path: item.path })}
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
            ))}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Main Gallery / Browse View ──
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-2.5">

      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 min-w-0">
        <button onClick={() => onAction("browse", {})}
          className="p-1.5 rounded-lg hover:bg-gray-800 cursor-pointer text-gray-400 hover:text-blue-400 shrink-0 transition-all"
          title="Home">
          <LucideReact.Home className="w-4 h-4" />
        </button>
        {parentPath && (
          <button onClick={() => onAction("browse", { path: parentPath })}
            className="p-1.5 rounded-lg hover:bg-gray-800 cursor-pointer text-gray-400 hover:text-gray-200 shrink-0 transition-all"
            title="Up">
            <LucideReact.ArrowUp className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-400 truncate flex items-center gap-0.5">
            {pathSegments(currentPath).slice(-3).map((seg, i) => (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && <LucideReact.ChevronRight className="w-2.5 h-2.5 text-gray-600" />}
                <button onClick={() => onAction("browse", { path: seg.path })}
                  className="hover:text-blue-400 cursor-pointer transition-colors">
                  {seg.name}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <Input placeholder="Filter..." value={searchQuery}
            onChange={(v) => setSearchQuery(v)}
            icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
        </div>

        <Select size="sm" value={data?.sortBy || "name"} options={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
          { value: "size", label: "Size" },
        ]} onChange={(v) => onAction("browse", { path: currentPath, sortBy: v, sortDir: data?.sortDir || "asc", filter: data?.filter || "all" })} />

        <button onClick={() => setFavOnly(!favOnly)}
          className={"p-1.5 rounded-lg cursor-pointer transition-all " +
            (favOnly ? "bg-rose-500/15 text-rose-400" : "text-gray-500 hover:text-rose-300 hover:bg-gray-800")}
          title={favOnly ? "Show all" : "Favorites only"}>
          <LucideReact.Heart className={"w-3.5 h-3.5" + (favOnly ? " fill-current" : "")} />
        </button>

        <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
          <button onClick={() => setViewMode("grid")}
            className={"px-2 py-1 cursor-pointer transition-all " +
              (viewMode === "grid" ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300")}>
            <LucideReact.Grid3x3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setViewMode("list")}
            className={"px-2 py-1 cursor-pointer transition-all " +
              (viewMode === "list" ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300")}>
            <LucideReact.List className="w-3.5 h-3.5" />
          </button>
        </div>

        <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
          className={"p-1.5 rounded-lg cursor-pointer transition-all " +
            (selectMode ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800")}
          title={selectMode ? "Cancel selection" : "Select multiple"}>
          <LucideReact.CheckSquare className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Subdirectories ── */}
      {directories.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {directories.slice(0, 10).map((dir, i) => (
            <button key={i} onClick={() => onAction("browse", { path: dir.path })}
              className="flex items-center gap-2 px-3 py-2.5 text-sm bg-gray-800/60 rounded-xl border border-gray-700/50 hover:bg-gray-700/60 hover:border-amber-500/30 cursor-pointer text-gray-200 transition-all">
              <LucideReact.Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="truncate flex-1">{dir.name}</span>
              {dir.itemCount > 0 && <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded-full">{dir.itemCount}</span>}
            </button>
          ))}
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
          {filtered.map((item, idx) => {
            const isImage = item.type === "image";
            const isVideo = item.type === "video";
            const hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx}
                onClick={() => {
                  if (selectMode) {
                    setSelected((prev) => {
                      const next = new Set(prev);
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
                      onError={(e) => { e.target.style.display = "none"; }} />
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
                    {Array.from({ length: item.rating }, (_, i) => (
                      <div key={i} className="w-1 h-1 rounded-full bg-amber-400" />
                    ))}
                  </div>
                )}
                <div className="px-1.5 py-1">
                  <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                </div>
                {/* Quick-rate overlay */}
                {item.type === "image" && (
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 py-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    style={{ touchAction: "none" }}
                    onClick={(e) => e.stopPropagation()}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star}
                        onClick={(e) => { e.stopPropagation(); onAction("rate", { path: item.path, rating: item.rating === star ? 0 : star }); }}
                        className={"cursor-pointer transition-all p-0.5 " + (star <= (item.rating || 0) ? "text-amber-400" : "text-white/40 hover:text-amber-300")}>
                        <LucideReact.Star className={"w-3 h-3" + (star <= (item.rating || 0) ? " fill-current" : "")} />
                      </button>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filtered.map((item, idx) => {
            const isImage = item.type === "image";
            const isVideo = item.type === "video";
            const hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx}
                onClick={() => { if (isImage || isVideo) setLightboxIdx(idx); else onAction("view", { path: item.path }); }}
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
                    {fmtDate(item.exif?.dateTaken || item.modifiedAt)} {"\u00b7"} {fmtSize(item.size)}
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
          <Button size="sm" variant="ghost" onClick={() => {
            const paths = Array.from(selected);
            paths.forEach((p) => onAction("favorite", { path: p }));
          }}>
            <LucideReact.Heart className="w-3.5 h-3.5 mr-1" /> Favorite
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            onAction("__cross_app", {
              target: "photo_studio",
              tool: "batch_process",
              params: { paths: Array.from(selected) }
            });
            setSelectMode(false); setSelected(new Set());
          }}>
            <LucideReact.Palette className="w-3.5 h-3.5 mr-1" /> Style All
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
            <LucideReact.X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxIdx >= 0 && lightboxIdx < filtered.length && (() => {
        const photo = filtered[lightboxIdx];
        return (
          <div ref={lbRef} tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setLightboxIdx(-1); setLbZoom(1); setLbPan({ x: 0, y: 0 }); }
              if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
              if (e.key === "ArrowRight" && lightboxIdx < filtered.length - 1) setLightboxIdx(lightboxIdx + 1);
            }}
            onTouchStart={(e) => {
              if (lbZoom > 1) return;
              setTouchEnd(null);
              setTouchStart(e.targetTouches[0].clientX);
            }}
            onTouchMove={(e) => {
              if (lbZoom > 1) return;
              setTouchEnd(e.targetTouches[0].clientX);
            }}
            onTouchEnd={() => {
              if (!touchStart || !touchEnd || lbZoom > 1) return;
              const dist = touchStart - touchEnd;
              const minSwipe = 50;
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
            <button onClick={() => setLightboxIdx(-1)}
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
              <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                <LucideReact.ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Media */}
            {photo.type === "video" ? (
              <video controls autoPlay preload="metadata" src={photo.mediaUrl}
                style={{ maxWidth: "92vw", maxHeight: "82vh", borderRadius: "8px" }}
                onClick={(e) => e.stopPropagation()} />
            ) : (
              <img src={photo.mediaUrl} alt={photo.name}
                onDoubleClick={() => {
                  if (lbZoom > 1) { setLbZoom(1); setLbPan({ x: 0, y: 0 }); }
                  else setLbZoom(2);
                }}
                style={{
                  maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain", borderRadius: "4px",
                  transform: `scale(${lbZoom}) translate(${lbPan.x}px, ${lbPan.y}px)`,
                  transition: "transform 0.2s ease",
                }} />
            )}

            {/* Next */}
            {lightboxIdx < filtered.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                <LucideReact.ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Bottom bar — minimal */}
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
                    {fmtDate(photo.exif?.dateTaken || photo.modifiedAt)}
                    {" \u00b7 "}{fmtSize(photo.size)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {photo.type === "image" && (
                    <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(-1); onAction("__cross_app", { target: "photo_studio", tool: "preview_styles", params: { photoPath: photo.path } }); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 cursor-pointer transition-all text-xs"
                      title="Style in Photo Studio">
                      <LucideReact.Palette className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); onAction("favorite", { path: photo.path }); }}
                    className={"p-2.5 rounded-lg cursor-pointer transition-all " + (photo.isFavorite ? "text-rose-400" : "text-white/40 hover:text-white")}>
                    <LucideReact.Heart className={"w-4 h-4" + (photo.isFavorite ? " fill-current" : "")} />
                  </button>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star}
                      onClick={(e) => { e.stopPropagation(); onAction("rate", { path: photo.path, rating: photo.rating === star ? 0 : star }); }}
                      className={"cursor-pointer transition-all p-0.5 " + (star <= (photo.rating || 0) ? "text-amber-400" : "text-white/30 hover:text-amber-300")}>
                      <LucideReact.Star className={"w-3.5 h-3.5" + (star <= (photo.rating || 0) ? " fill-current" : "")} />
                    </button>
                  ))}
                  <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(-1); onAction("view", { path: photo.path }); }}
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

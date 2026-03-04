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
  const shortPath = (p) => {
    if (!p) return "";
    const parts = String(p).replace(/\\/g, "/").split("/");
    if (parts.length <= 3) return parts.join("/");
    return parts[0] + "/.../" + parts.slice(-2).join("/");
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

  // ── ALL hooks at top level (React rules — never inside conditionals) ──
  const [viewMode, setViewMode] = useState("grid");
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [createInput, setCreateInput] = useState(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const lbRef = useRef(null);

  // Focus lightbox for keyboard navigation
  useEffect(() => {
    if (lightboxIdx >= 0 && lbRef.current) lbRef.current.focus();
  }, [lightboxIdx]);

  // ── Detect view type from data.tool ──
  const tool = data?.tool || "";
  const isDrives = tool === "enso_media_gallery_browse" && Array.isArray(data?.drives);
  const isBrowse = tool === "enso_media_gallery_browse" && !Array.isArray(data?.drives);
  const isPhoto = tool === "enso_media_gallery_view";
  const isFavoriteResult = tool === "enso_media_gallery_favorite";
  const isRateResult = tool === "enso_media_gallery_rate";
  const isSearch = tool === "enso_media_gallery_search";
  const isCollections = tool === "enso_media_gallery_collection";
  const isInspect = tool === "enso_media_gallery_inspect";

  // Treat favorite/rate results like photo detail (they return photo data)
  const isPhotoLike = isPhoto || isFavoriteResult || isRateResult;

  const items = data?.items ?? [];
  const directories = data?.directories ?? [];
  const currentPath = String(data?.path ?? ".");
  const parentPath = data?.parentPath;

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = items;
    if (favOnly) result = result.filter((i) => i.isFavorite);
    if (typeFilter !== "all") result = result.filter((i) => i.type === typeFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.aiDescription || "").toLowerCase().includes(q) ||
        (i.aiTags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, searchQuery, favOnly, typeFilter]);

  // Count by type for filter badges
  const photoCt = useMemo(() => items.filter((i) => i.type === "image").length, [items]);
  const videoCt = useMemo(() => items.filter((i) => i.type === "video").length, [items]);

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
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
  // ── Drives / Home View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isDrives) {
    const drives = data?.drives || [];
    const quickAccess = data?.quickAccess || [];
    const bookmarks = data?.bookmarks || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-3">
        <div className="flex items-center gap-2">
          <LucideReact.Images className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-semibold text-gray-100">Media Gallery</span>
        </div>

        {/* Bookmarked Folders */}
        {bookmarks.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <LucideReact.Bookmark className="w-3 h-3" /> Bookmarks
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {bookmarks.map((bm, i) => (
                <button key={i} onClick={() => onAction("browse", { path: bm.path })}
                  className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-800 rounded-md border border-amber-500/30 hover:border-amber-400/60 cursor-pointer text-left min-w-0 transition-colors">
                  <LucideReact.Bookmark className="w-3.5 h-3.5 text-amber-400 fill-current shrink-0" />
                  <span className="text-xs text-gray-200 truncate">{bm.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Access */}
        {quickAccess.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <LucideReact.Zap className="w-3 h-3" /> Quick Access
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickAccess.map((qa, i) => (
                <button key={i} onClick={() => onAction("browse", { path: qa.path })}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700 hover:border-blue-500/40 cursor-pointer text-gray-300 transition-colors">
                  <LucideReact.FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  {qa.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drives */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <LucideReact.HardDrive className="w-3 h-3" /> Drives
          </div>
          <div className="flex flex-wrap gap-1.5">
            {drives.map((drv, i) => (
              <button key={i} onClick={() => onAction("browse", { path: drv.path })}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700 hover:border-blue-500/40 cursor-pointer text-gray-200 transition-colors">
                <LucideReact.HardDrive className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium">{drv.name}</span>
              </button>
            ))}
          </div>
        </div>

        <Separator />
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onAction("collection", { action: "list" })}>
            <LucideReact.FolderHeart className="w-3.5 h-3.5 mr-1" /> Collections
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Photo / Favorite / Rate Detail View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPhotoLike) {
    const exif = data.exif || {};
    const folderPath = data.path ? data.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/") : ".";
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Button variant="ghost" size="sm" onClick={() => onAction("browse", { path: folderPath })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{data.name || "Photo"}</div>
            <div className="text-[11px] text-gray-500">
              {fmtSize(data.size)}
              {exif.width ? " \u00b7 " + exif.width + "\u00d7" + exif.height : ""}
              {data.ext ? " \u00b7 " + data.ext.toUpperCase().replace(".", "") : ""}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => onAction("favorite", { path: data.path })}
              className={"p-1.5 rounded-md hover:bg-gray-700 cursor-pointer transition-colors " + (data.isFavorite ? "text-rose-400" : "text-gray-500 hover:text-rose-300")}>
              {data.isFavorite ? <LucideReact.Heart className="w-4 h-4 fill-current" /> : <LucideReact.Heart className="w-4 h-4" />}
            </button>
            <button onClick={() => onAction("inspect", { path: data.path })}
              className="p-1.5 rounded-md hover:bg-gray-700 cursor-pointer text-gray-500 hover:text-blue-300 transition-colors"
              title="Inspect metadata">
              <LucideReact.FileSearch className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media display */}
        <div className="rounded-lg overflow-hidden bg-black/40 flex items-center justify-center" style={{ maxHeight: "400px" }}>
          {data.type === "video" ? (
            <video controls preload="metadata" src={data.mediaUrl}
              style={{ maxWidth: "100%", maxHeight: "400px" }}
              onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={data.mediaUrl} alt={data.name}
              style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain" }} />
          )}
        </div>

        {/* Star Rating */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-500 mr-1">Rating:</span>
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star}
              onClick={() => onAction("rate", { path: data.path, rating: data.rating === star ? 0 : star })}
              className={"cursor-pointer transition-colors " + (star <= (data.rating || 0) ? "text-amber-400" : "text-gray-600 hover:text-amber-300")}>
              <LucideReact.Star className={"w-4 h-4" + (star <= (data.rating || 0) ? " fill-current" : "")} />
            </button>
          ))}
          {data.rating > 0 && (
            <span className="text-[11px] text-amber-400 ml-1">{data.rating}/5</span>
          )}
        </div>

        {/* AI Description + Tags */}
        {data.aiDescription ? (
          <UICard accent="purple">
            <div className="flex items-center gap-1.5 mb-1">
              <LucideReact.Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-medium text-purple-300">AI Description</span>
            </div>
            <div className="text-xs text-gray-300 leading-relaxed">{data.aiDescription}</div>
            {data.aiTags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {data.aiTags.map((tag, i) => <Badge key={i} variant="info">{tag}</Badge>)}
              </div>
            )}
          </UICard>
        ) : null}

        {/* EXIF Metadata */}
        {(exif.cameraMake || exif.dateTaken || exif.focalLength || exif.iso) && (
          <Accordion type="single" items={[{
            value: "exif",
            title: "Camera & EXIF Data",
            content: (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {exif.cameraMake && <><span className="text-gray-500">Camera</span><span className="text-gray-200">{exif.cameraMake} {exif.cameraModel || ""}</span></>}
                {exif.dateTaken && <><span className="text-gray-500">Date Taken</span><span className="text-gray-200">{fmtDate(exif.dateTaken)}</span></>}
                {exif.focalLength && <><span className="text-gray-500">Focal Length</span><span className="text-gray-200">{exif.focalLength}</span></>}
                {exif.aperture && <><span className="text-gray-500">Aperture</span><span className="text-gray-200">{exif.aperture}</span></>}
                {exif.exposureTime && <><span className="text-gray-500">Shutter Speed</span><span className="text-gray-200">{exif.exposureTime}</span></>}
                {exif.iso && <><span className="text-gray-500">ISO</span><span className="text-gray-200">{exif.iso}</span></>}
                {exif.width && <><span className="text-gray-500">Dimensions</span><span className="text-gray-200">{exif.width} \u00d7 {exif.height}</span></>}
                {exif.gps && <><span className="text-gray-500">GPS</span><span className="text-gray-200">{exif.gps.lat.toFixed(4)}, {exif.gps.lng.toFixed(4)}</span></>}
              </div>
            ),
          }]} />
        )}

        {/* Add to Collection */}
        <div className="flex gap-1.5 pt-1">
          <Button variant="outline" size="sm" onClick={() => onAction("collection", { action: "list" })}>
            <LucideReact.FolderPlus className="w-3.5 h-3.5 mr-1" /> Collections
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Inspect / Metadata View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isInspect) {
    const exif = data.exif || {};
    const folderPath = data.path ? data.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/") : ".";
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("view", { path: data.path })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.FileSearch className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-gray-100">File Inspector</span>
        </div>

        {/* Preview */}
        {data.mediaUrl && (
          <div className="rounded-lg overflow-hidden bg-black/40 flex items-center justify-center" style={{ maxHeight: "200px" }}>
            {data.type === "video" ? (
              <video preload="metadata" src={data.mediaUrl} style={{ maxWidth: "100%", maxHeight: "200px" }} />
            ) : (
              <img src={data.mediaUrl} alt={data.name} style={{ maxWidth: "100%", maxHeight: "200px", objectFit: "contain" }} />
            )}
          </div>
        )}

        {/* File Info Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="File" value={data.name || "Unknown"} accent="blue" />
          <Stat label="Size" value={fmtSize(data.size)} accent="emerald" />
          <Stat label="Type" value={(data.ext || "").toUpperCase().replace(".", "") || data.type} accent="purple" />
        </div>

        {/* Detailed Metadata Table */}
        <Accordion type="multiple" defaultOpen={["file", "exif"]} items={[
          {
            value: "file",
            title: "File Properties",
            content: (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <span className="text-gray-500">Full Path</span>
                <span className="text-gray-200 break-all text-[10px]">{data.path}</span>
                <span className="text-gray-500">Extension</span>
                <span className="text-gray-200">{data.ext}</span>
                <span className="text-gray-500">Media Type</span>
                <span className="text-gray-200 capitalize">{data.type}</span>
                <span className="text-gray-500">File Size</span>
                <span className="text-gray-200">{fmtSize(data.size)} ({(data.size || 0).toLocaleString()} bytes)</span>
                {data.modifiedAt && <><span className="text-gray-500">Modified</span><span className="text-gray-200">{fmtDate(data.modifiedAt)}</span></>}
                {data.isFavorite !== undefined && <><span className="text-gray-500">Favorite</span><span className="text-gray-200">{data.isFavorite ? "Yes" : "No"}</span></>}
                {data.rating > 0 && <><span className="text-gray-500">Rating</span><span className="text-gray-200">{data.rating}/5 stars</span></>}
              </div>
            ),
          },
          {
            value: "exif",
            title: "EXIF / Camera Data",
            content: (exif.cameraMake || exif.dateTaken || exif.width) ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {exif.cameraMake && <><span className="text-gray-500">Camera Make</span><span className="text-gray-200">{exif.cameraMake}</span></>}
                {exif.cameraModel && <><span className="text-gray-500">Camera Model</span><span className="text-gray-200">{exif.cameraModel}</span></>}
                {exif.dateTaken && <><span className="text-gray-500">Date Taken</span><span className="text-gray-200">{exif.dateTaken}</span></>}
                {exif.focalLength && <><span className="text-gray-500">Focal Length</span><span className="text-gray-200">{exif.focalLength}</span></>}
                {exif.aperture && <><span className="text-gray-500">Aperture</span><span className="text-gray-200">{exif.aperture}</span></>}
                {exif.exposureTime && <><span className="text-gray-500">Shutter Speed</span><span className="text-gray-200">{exif.exposureTime}</span></>}
                {exif.iso && <><span className="text-gray-500">ISO</span><span className="text-gray-200">{exif.iso}</span></>}
                {exif.width && <><span className="text-gray-500">Resolution</span><span className="text-gray-200">{exif.width} \u00d7 {exif.height} ({((exif.width * exif.height) / 1000000).toFixed(1)} MP)</span></>}
                {exif.gps && <><span className="text-gray-500">Latitude</span><span className="text-gray-200">{exif.gps.lat.toFixed(6)}</span></>}
                {exif.gps && <><span className="text-gray-500">Longitude</span><span className="text-gray-200">{exif.gps.lng.toFixed(6)}</span></>}
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">No EXIF data available for this file.</div>
            ),
          },
          {
            value: "ai",
            title: "AI Analysis",
            content: data.aiDescription ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-300 leading-relaxed">{data.aiDescription}</div>
                {data.aiTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {data.aiTags.map((tag, i) => <Badge key={i} variant="info">{tag}</Badge>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">No AI analysis available. View the photo to generate one.</div>
            ),
          },
        ]} />

        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onAction("view", { path: data.path })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> View Photo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAction("browse", { path: folderPath })}>
            <LucideReact.FolderOpen className="w-3.5 h-3.5 mr-1" /> Browse Folder
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Search Results View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isSearch) {
    const results = data.results || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("browse", { path: data.path || "." })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.Search className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-gray-100">Search: &quot;{data.query}&quot;</span>
        </div>

        {/* Search stats */}
        <div className="flex gap-3">
          <Stat label="Matches" value={data.total || 0} accent="blue" />
          <Stat label="Scanned" value={data.totalScanned || 0} accent="gray" />
          <Stat label="AI Tagged" value={data.totalWithAI || 0} accent="purple" />
        </div>

        {/* New search */}
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input placeholder="Search photos..." value={searchInput}
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
            description={"No photos matched \"" + data.query + "\". Try different keywords or browse the folder directly."}
            action={<Button size="sm" onClick={() => onAction("browse", { path: data.path || "." })}>Browse Folder</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {results.map((item, idx) => (
              <button key={idx} onClick={() => onAction("view", { path: item.path })}
                className="relative group bg-gray-800 rounded-md overflow-hidden border border-gray-600/50 hover:border-blue-500/60 cursor-pointer text-left transition-colors">
                {item.mediaUrl ? (
                  <img src={item.type === "video" ? (item.thumbnailUrl || item.mediaUrl) : item.mediaUrl}
                    alt={item.name} loading="lazy"
                    style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "90px" }} className="bg-gray-700/40 flex items-center justify-center">
                    <LucideReact.Image className="w-6 h-6 text-gray-500" />
                  </div>
                )}
                {item.type === "video" && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "90px" }}
                    className="flex items-center justify-center bg-black/30">
                    <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
                      <LucideReact.Play className="w-3 h-3 text-white ml-0.5" />
                    </div>
                  </div>
                )}
                <div className="p-1">
                  <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                  {item.matchReason && <div className="text-[10px] text-blue-400 truncate">{item.matchReason}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Collections List View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCollections && data.action !== "view") {
    const colls = data.collections || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAction("browse", {})}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <LucideReact.FolderHeart className="w-4 h-4 text-rose-400" />
            <span className="text-sm font-semibold text-gray-100">Collections</span>
            <Badge>{colls.length}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCreateInput(createInput === null ? "" : null)}>
            <LucideReact.Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Create new collection */}
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
            description="Create a collection to organize your favorite photos into albums."
            action={<Button size="sm" onClick={() => setCreateInput("")}>Create Collection</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {colls.map((col, i) => (
              <button key={i} onClick={() => onAction("collection", { action: "view", collectionName: col.name })}
                className="bg-gray-800 rounded-lg border border-gray-600/50 overflow-hidden hover:border-rose-500/60 cursor-pointer text-left transition-colors group">
                {col.coverUrl ? (
                  <img src={col.coverUrl} alt={col.name} loading="lazy"
                    style={{ width: "100%", height: "80px", objectFit: "cover" }}
                    className="group-hover:opacity-90 transition-opacity" />
                ) : (
                  <div style={{ width: "100%", height: "80px" }} className="bg-gray-700/50 flex items-center justify-center">
                    <LucideReact.Images className="w-6 h-6 text-gray-600" />
                  </div>
                )}
                <div className="p-1.5">
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
  // ── Collection Detail View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCollections && data.action === "view") {
    const colItems = data.items || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("collection", { action: "list" })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.FolderHeart className="w-4 h-4 text-rose-400" />
          <span className="text-sm font-semibold text-gray-100">{data.collectionName}</span>
          <Badge variant="outline">{data.total || colItems.length} photos</Badge>
        </div>

        {colItems.length === 0 ? (
          <EmptyState
            icon={<LucideReact.ImageOff className="w-8 h-8" />}
            title="Empty collection"
            description="Browse your gallery and add photos to this collection."
            action={<Button size="sm" onClick={() => onAction("browse", {})}>Browse Gallery</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {colItems.map((item, idx) => (
              <button key={idx} onClick={() => onAction("view", { path: item.path })}
                className="relative group bg-gray-800 rounded-md overflow-hidden border border-gray-600/50 hover:border-blue-500/60 cursor-pointer text-left transition-colors">
                <img src={item.mediaUrl} alt={item.name} loading="lazy"
                  style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                {item.isFavorite && (
                  <div className="absolute top-1 right-1">
                    <LucideReact.Heart className="w-3 h-3 text-rose-400 fill-current" />
                  </div>
                )}
                <div className="px-1 py-0.5">
                  <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <Separator />
        <Button variant="danger" size="sm" onClick={() => onAction("collection", { action: "delete", collectionName: data.collectionName })}>
          <LucideReact.Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Collection
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Main Gallery / Browse View (default) ──
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2">

      {/* ── Header with breadcrumbs ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={() => onAction("browse", {})}
            className="p-1 rounded hover:bg-gray-700 cursor-pointer text-gray-400 hover:text-gray-200 shrink-0 transition-colors"
            title="Home">
            <LucideReact.Home className="w-4 h-4" />
          </button>
          {parentPath && (
            <button onClick={() => onAction("browse", { path: parentPath })}
              className="p-1 rounded hover:bg-gray-700 cursor-pointer text-gray-400 hover:text-gray-200 shrink-0 transition-colors"
              title="Up one level">
              <LucideReact.ArrowUp className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
              <LucideReact.Images className="w-4 h-4 text-blue-400 shrink-0" />
              Media Gallery
            </div>
            {/* Breadcrumb path */}
            <div className="text-[11px] text-gray-500 truncate flex items-center gap-0.5 flex-wrap">
              {pathSegments(currentPath).slice(-3).map((seg, i, arr) => (
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
        <div className="flex items-center gap-1.5 shrink-0">
          <Stat label="Items" value={filtered.length} accent="blue" />
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Search filter */}
        <div className="flex-1 min-w-0" style={{ maxWidth: "200px" }}>
          <Input placeholder="Filter by name..." value={searchQuery}
            onChange={(v) => setSearchQuery(v)}
            icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
        </div>

        {/* Sort controls */}
        <Select size="sm" value={data?.sortBy || "name"} options={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
          { value: "size", label: "Size" },
        ]} onChange={(v) => onAction("browse", { path: currentPath, sortBy: v, sortDir: data?.sortDir || "asc", filter: data?.filter || "all" })} />

        <button onClick={() => onAction("browse", { path: currentPath, sortBy: data?.sortBy || "name", sortDir: data?.sortDir === "desc" ? "asc" : "desc", filter: data?.filter || "all" })}
          className="p-1.5 rounded-md bg-gray-800 border border-gray-600/50 hover:bg-gray-700 cursor-pointer text-gray-400 transition-colors"
          title={data?.sortDir === "desc" ? "Sort ascending" : "Sort descending"}>
          {data?.sortDir === "desc"
            ? <LucideReact.ArrowDownWideNarrow className="w-3.5 h-3.5" />
            : <LucideReact.ArrowUpNarrowWide className="w-3.5 h-3.5" />}
        </button>

        {/* Favorites filter */}
        <button onClick={() => setFavOnly(!favOnly)}
          className={"p-1.5 rounded-md border cursor-pointer transition-colors " +
            (favOnly ? "bg-rose-600/20 border-rose-500/60 text-rose-400" : "bg-gray-800 border-gray-600/50 text-gray-400 hover:bg-gray-700")}
          title={favOnly ? "Show all" : "Show favorites only"}>
          <LucideReact.Heart className={"w-3.5 h-3.5" + (favOnly ? " fill-current" : "")} />
        </button>

        {/* View mode toggle */}
        <div className="flex rounded-md border border-gray-600/50 overflow-hidden">
          <button onClick={() => setViewMode("grid")}
            className={"px-2 py-1 text-xs cursor-pointer transition-colors " +
              (viewMode === "grid" ? "bg-blue-600/30 text-blue-200" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
            <LucideReact.Grid3x3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setViewMode("list")}
            className={"px-2 py-1 text-xs cursor-pointer transition-colors " +
              (viewMode === "list" ? "bg-blue-600/30 text-blue-200" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
            <LucideReact.List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Media type filters ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { key: "all", label: "All", icon: LucideReact.Layers, count: items.length },
          { key: "image", label: "Photos", icon: LucideReact.Image, count: photoCt },
          { key: "video", label: "Videos", icon: LucideReact.Video, count: videoCt },
        ].map((ft) => (
          <button key={ft.key} onClick={() => setTypeFilter(ft.key)}
            className={"flex items-center gap-1 px-2 py-1 text-xs rounded-md border cursor-pointer transition-colors " +
              (typeFilter === ft.key
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "bg-gray-800 border-gray-600/50 text-gray-400 hover:bg-gray-700")}>
            <ft.icon className="w-3 h-3" />
            {ft.label}
            <span className="text-[10px] opacity-70">{ft.count}</span>
          </button>
        ))}
        <div className="flex-1" />
        {/* AI search */}
        <Button variant="outline" size="sm" onClick={() => onAction("collection", { action: "list" })}>
          <LucideReact.FolderHeart className="w-3 h-3 mr-1" /> Collections
        </Button>
      </div>

      {/* ── AI Search Bar ── */}
      <div className="flex gap-1.5">
        <div className="flex-1">
          <Input placeholder="AI search (e.g. sunset, portrait, dog)..." value={searchInput}
            onChange={(v) => setSearchInput(v)}
            icon={<LucideReact.Sparkles className="w-3.5 h-3.5" />} size="sm" />
        </div>
        <Button size="sm" variant="primary"
          onClick={() => { if (searchInput.trim()) onAction("search", { path: currentPath, query: searchInput.trim() }); }}>
          <LucideReact.Search className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ── Subdirectories ── */}
      {directories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {directories.slice(0, 12).map((dir, i) => (
            <button key={i} onClick={() => onAction("browse", { path: dir.path })}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700 hover:border-blue-500/40 cursor-pointer text-gray-300 transition-colors">
              <LucideReact.Folder className="w-3 h-3 text-amber-500" />
              <span className="truncate" style={{ maxWidth: "100px" }}>{dir.name}</span>
              {dir.itemCount > 0 && <Badge variant="outline">{dir.itemCount}</Badge>}
            </button>
          ))}
          {directories.length > 12 && (
            <span className="text-[10px] text-gray-500 self-center">+{directories.length - 12} more</span>
          )}
        </div>
      )}

      {/* ── Content: Grid or List ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<LucideReact.ImageOff className="w-8 h-8" />}
          title={favOnly ? "No favorites" : searchQuery ? "No matches" : "No media files"}
          description={
            favOnly ? "Mark photos as favorites with the heart icon."
            : searchQuery ? "Try a different filter term."
            : "This folder has no photos or videos."
          }
        />
      ) : viewMode === "grid" ? (
        /* ── Thumbnail Grid ── */
        <div className="grid grid-cols-3 gap-1.5 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filtered.map((item, idx) => {
            const isImage = item.type === "image";
            const isVideo = item.type === "video";
            const hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx}
                onClick={() => { if (isImage || isVideo) setLightboxIdx(idx); else onAction("view", { path: item.path }); }}
                className="relative group bg-gray-800 rounded-md overflow-hidden border border-gray-600/50 hover:border-blue-500/60 cursor-pointer text-left transition-colors">
                {hasThumb ? (
                  <div style={{ position: "relative", width: "100%", height: "110px" }}>
                    <img src={isVideo ? item.thumbnailUrl : item.mediaUrl} alt={item.name} loading="lazy"
                      style={{ width: "100%", height: "110px", objectFit: "cover" }}
                      onError={(e) => { e.target.style.display = "none"; }} />
                    {isVideo && (
                      <div style={{ position: "absolute", inset: 0 }}
                        className="flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                          <LucideReact.Play className="w-4 h-4 text-white ml-0.5" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ width: "100%", height: "110px" }} className="flex items-center justify-center bg-gray-700/40">
                    {isVideo ? (
                      <div className="flex flex-col items-center gap-1">
                        <LucideReact.Play className="w-6 h-6 text-purple-400" />
                        <span className="text-[9px] text-purple-300">Video</span>
                      </div>
                    ) : (
                      <LucideReact.FileText className="w-6 h-6 text-amber-400" />
                    )}
                  </div>
                )}
                {/* Overlay: favorite, AI tags, rating */}
                <div className="absolute top-1 right-1 flex gap-0.5">
                  {item.isFavorite && <span className="text-rose-400"><LucideReact.Heart className="w-3 h-3 fill-current" /></span>}
                  {item.aiTags?.length > 0 && <span className="text-purple-400"><LucideReact.Sparkles className="w-3 h-3" /></span>}
                </div>
                {item.rating > 0 && (
                  <div className="absolute top-1 left-1 flex">
                    {[1, 2, 3, 4, 5].map((s) => s <= item.rating
                      ? <LucideReact.Star key={s} className="w-2.5 h-2.5 text-amber-400 fill-current" />
                      : null
                    )}
                  </div>
                )}
                <div className="px-1 py-0.5">
                  <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                  <div className="text-[9px] text-gray-500">{fmtDate(item.exif?.dateTaken || item.modifiedAt)}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* ── List View ── */
        <div className="space-y-1 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filtered.map((item, idx) => {
            const isImage = item.type === "image";
            const isVideo = item.type === "video";
            const hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx}
                onClick={() => { if (isImage || isVideo) setLightboxIdx(idx); else onAction("view", { path: item.path }); }}
                className="flex items-center gap-2 w-full px-2 py-1.5 bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700/60 cursor-pointer text-left transition-colors">
                {hasThumb ? (
                  <div style={{ position: "relative", width: "48px", height: "36px", borderRadius: "4px", overflow: "hidden" }} className="shrink-0">
                    <img src={isVideo ? item.thumbnailUrl : item.mediaUrl} alt={item.name} loading="lazy"
                      style={{ width: "48px", height: "36px", objectFit: "cover" }} />
                    {isVideo && (
                      <div style={{ position: "absolute", inset: 0 }} className="flex items-center justify-center bg-black/30">
                        <LucideReact.Play className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ width: "48px", height: "36px", borderRadius: "4px" }} className="bg-gray-700/40 flex items-center justify-center shrink-0">
                    {isVideo ? <LucideReact.Video className="w-4 h-4 text-purple-400" /> : <LucideReact.FileText className="w-4 h-4 text-amber-400" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-200 truncate flex items-center gap-1">
                    {item.name}
                    {item.isFavorite && <LucideReact.Heart className="w-3 h-3 text-rose-400 fill-current shrink-0" />}
                    {item.aiTags?.length > 0 && <LucideReact.Sparkles className="w-3 h-3 text-purple-400 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {fmtDate(item.exif?.dateTaken || item.modifiedAt)} {"\u00b7"} {fmtSize(item.size)}
                    {item.exif?.width ? " \u00b7 " + item.exif.width + "\u00d7" + item.exif.height : ""}
                  </div>
                </div>
                {item.rating > 0 && (
                  <div className="flex shrink-0">
                    {[1, 2, 3, 4, 5].map((s) => s <= item.rating
                      ? <LucideReact.Star key={s} className="w-2.5 h-2.5 text-amber-400 fill-current" />
                      : null
                    )}
                  </div>
                )}
                <Badge variant="outline">{item.ext}</Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── Lightbox (full-screen overlay) ──                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {lightboxIdx >= 0 && lightboxIdx < filtered.length && (() => {
        const photo = filtered[lightboxIdx];
        return (
          <div ref={lbRef} tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Escape") setLightboxIdx(-1);
              if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
              if (e.key === "ArrowRight" && lightboxIdx < filtered.length - 1) setLightboxIdx(lightboxIdx + 1);
            }}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.92)", outline: "none",
            }}>

            {/* Close button */}
            <button onClick={() => setLightboxIdx(-1)}
              style={{ position: "absolute", top: 12, right: 16, zIndex: 210 }}
              className="text-white/70 hover:text-white cursor-pointer p-1 transition-colors">
              <LucideReact.X className="w-5 h-5" />
            </button>

            {/* Counter */}
            <div style={{ position: "absolute", top: 14, left: 16, zIndex: 210 }}
              className="text-white/50 text-xs">
              {lightboxIdx + 1} / {filtered.length}
            </div>

            {/* Previous */}
            {lightboxIdx > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/50 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10 transition-colors">
                <LucideReact.ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Media content */}
            {photo.type === "video" ? (
              <video controls autoPlay preload="metadata" src={photo.mediaUrl}
                style={{ maxWidth: "90vw", maxHeight: "78vh", borderRadius: "4px" }}
                onClick={(e) => e.stopPropagation()} />
            ) : (
              <img src={photo.mediaUrl} alt={photo.name}
                style={{ maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain", borderRadius: "4px" }} />
            )}

            {/* Next */}
            {lightboxIdx < filtered.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/50 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10 transition-colors">
                <LucideReact.ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Info bar at bottom */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "12px 16px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
              zIndex: 210,
            }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{photo.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {fmtDate(photo.exif?.dateTaken || photo.modifiedAt)}
                    {" \u00b7 "}{fmtSize(photo.size)}
                    {photo.exif?.width ? " \u00b7 " + photo.exif.width + "\u00d7" + photo.exif.height : ""}
                    {photo.exif?.cameraMake ? " \u00b7 " + photo.exif.cameraMake : ""}
                  </div>
                  {photo.aiDescription && (
                    <div className="text-[11px] text-purple-300 mt-0.5 line-clamp-1">{photo.aiDescription}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {/* Rating stars in lightbox */}
                  <div className="flex mr-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star}
                        onClick={(e) => { e.stopPropagation(); onAction("rate", { path: photo.path, rating: photo.rating === star ? 0 : star }); }}
                        className={"cursor-pointer " + (star <= (photo.rating || 0) ? "text-amber-400" : "text-white/30 hover:text-amber-300")}>
                        <LucideReact.Star className={"w-3.5 h-3.5" + (star <= (photo.rating || 0) ? " fill-current" : "")} />
                      </button>
                    ))}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onAction("favorite", { path: photo.path }); }}
                    className={"p-1.5 rounded cursor-pointer transition-colors " + (photo.isFavorite ? "text-rose-400" : "text-white/50 hover:text-white")}>
                    <LucideReact.Heart className={"w-4 h-4" + (photo.isFavorite ? " fill-current" : "")} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(-1); onAction("view", { path: photo.path }); }}
                    className="p-1.5 rounded text-white/50 hover:text-white cursor-pointer transition-colors">
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

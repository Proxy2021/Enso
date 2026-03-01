import type { ToolTemplate } from "../registry.js";

export function isMediaSignature(signatureId: string): boolean {
  return signatureId === "media_gallery";
}

export function getMediaTemplateCode(_signature: ToolTemplate): string {
  return MEDIA_GALLERY_TEMPLATE;
}

// ── Helpers that live outside the component (hoisted in the template string) ──

const MEDIA_GALLERY_TEMPLATE = `
export default function GeneratedUI({ data, onAction }) {
  // ── Helpers (inside component to avoid sandbox fnName detection) ──
  var fmtSize = function(b) {
    if (!b && b !== 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  };
  var fmtDate = function(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch(e) { return String(d).substring(0, 10); }
  };
  var shortPath = function(p) {
    if (!p) return "";
    var parts = String(p).replace(/\\\\/g, "/").split("/");
    if (parts.length <= 3) return parts.join("/");
    return parts[0] + "/.../" + parts.slice(-2).join("/");
  };
  // ── ALL hooks at top level (React rules) ──
  var _vm = useState("grid"), viewMode = _vm[0], setViewMode = _vm[1];
  var _lb = useState(-1), lightboxIdx = _lb[0], setLightboxIdx = _lb[1];
  var _sq = useState(""), searchQuery = _sq[0], setSearchQuery = _sq[1];
  var _ff = useState(false), favOnly = _ff[0], setFavOnly = _ff[1];
  var _ci = useState(null), createInput = _ci[0], setCreateInput = _ci[1];
  var _sd = useState(false), showDetail = _sd[0], setShowDetail = _sd[1];
  var lbRef = useRef(null);

  // Focus lightbox for keyboard nav
  useEffect(function() {
    if (lightboxIdx >= 0 && lbRef.current) lbRef.current.focus();
  }, [lightboxIdx]);

  // ── Detect view type ──
  var tool = data?.tool || "";
  var isDrives = tool === "enso_media_list_drives" || (Array.isArray(data?.drives) && !data?.items);
  var isBrowse = tool === "enso_media_browse_folder" || tool === "enso_media_scan_library" || (!tool && Array.isArray(data?.items));
  var isPhoto = tool === "enso_media_view_photo";
  var isGroup = tool === "enso_media_group_by_type";
  var isDescribe = tool === "enso_media_describe_photo";
  var isSearch = tool === "enso_media_search_photos";
  var isBatchTag = tool === "enso_media_batch_tag";
  var isCollections = tool === "enso_media_manage_collection";

  var items = data?.items ?? data?.rows ?? [];
  var directories = data?.directories ?? [];
  var currentPath = String(data?.path ?? ".");
  var parentPath = data?.parentPath;

  // Client-side filtering
  var filtered = useMemo(function() {
    var result = items;
    if (favOnly) result = result.filter(function(i) { return i.isFavorite; });
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      result = result.filter(function(i) {
        return (i.name || "").toLowerCase().includes(q)
          || (i.aiDescription || "").toLowerCase().includes(q)
          || (i.aiTags || []).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }
    return result;
  }, [items, searchQuery, favOnly]);

  // ── Drives / Home View (entry point) ──
  if (isDrives) {
    var drives = data?.drives || [];
    var quickAccess = data?.quickAccess || [];
    var bookmarks = data?.bookmarks || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-3">
        <div className="flex items-center gap-2">
          <LucideReact.Images className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-semibold text-gray-100">Photo Gallery</span>
        </div>

        {/* Bookmarked Folders */}
        {bookmarks.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <LucideReact.Bookmark className="w-3 h-3" /> Bookmarked Folders
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {bookmarks.map(function(bm, i) {
                return (
                  <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-md border border-amber-500/30 hover:border-amber-400/60 overflow-hidden">
                    <button onClick={function() { onAction("browse_folder", { path: bm.path }); }}
                      className="flex-1 flex items-center gap-1.5 px-2 py-1.5 text-left cursor-pointer hover:bg-gray-700/50 min-w-0">
                      <LucideReact.Bookmark className="w-3.5 h-3.5 text-amber-400 fill-current shrink-0" />
                      <span className="text-xs text-gray-200 truncate">{bm.name}</span>
                    </button>
                    <button onClick={function() { onAction("bookmark_folder", { path: bm.path, action: "remove" }); }}
                      className="p-1 text-gray-500 hover:text-rose-400 cursor-pointer shrink-0">
                      <LucideReact.X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Access */}
        {quickAccess.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <LucideReact.Zap className="w-3 h-3" /> Quick Access
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickAccess.map(function(qa, i) {
                return (
                  <button key={i} onClick={function() { onAction("browse_folder", { path: qa.path }); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700 hover:border-blue-500/40 cursor-pointer text-gray-300">
                    <LucideReact.FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                    {qa.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Drives */}
        <div className="space-y-1">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <LucideReact.HardDrive className="w-3 h-3" /> Drives
          </div>
          <div className="flex flex-wrap gap-1.5">
            {drives.map(function(drv, i) {
              return (
                <button key={i} onClick={function() { onAction("browse_folder", { path: drv.path }); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700 hover:border-blue-500/40 cursor-pointer text-gray-200">
                  <LucideReact.HardDrive className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium">{drv.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Collections shortcut */}
        <Separator />
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={function() { onAction("manage_collection", { action: "list" }); }}>
            <LucideReact.FolderHeart className="w-3.5 h-3.5 mr-1" /> Collections
          </Button>
        </div>
      </div>
    );
  }

  // ── Photo Detail View ──
  if (isPhoto) {
    var exif = data.exif || {};
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse_folder", { path: data.path ? data.path.replace(/\\\\/g, "/").split("/").slice(0, -1).join("/") : "." }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{data.name || "Photo"}</div>
            <div className="text-[11px] text-gray-500">{fmtSize(data.size)} {data.exif?.width ? " \\u00b7 " + data.exif.width + "\\u00d7" + data.exif.height : ""}</div>
          </div>
          <div className="flex gap-1">
            <button onClick={function() { onAction("toggle_favorite", { path: data.path }); }} className={"p-1.5 rounded-md hover:bg-gray-700 cursor-pointer " + (data.isFavorite ? "text-rose-400" : "text-gray-500")}>
              {data.isFavorite ? <LucideReact.Heart className="w-4 h-4 fill-current" /> : <LucideReact.Heart className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden bg-black/40 flex items-center justify-center" style={{ maxHeight: "400px" }}>
          {data.type === "video" ? (
            <EnsoUI.VideoPlayer src={data.mediaUrl} style={{ maxWidth: "100%", maxHeight: "400px" }} />
          ) : (
            <img src={data.mediaUrl} alt={data.name} style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain" }} />
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-500 mr-1">Rating:</span>
          {[1,2,3,4,5].map(function(star) {
            return <button key={star} onClick={function() { onAction("rate_photo", { path: data.path, rating: data.rating === star ? 0 : star }); }}
              className={"cursor-pointer " + (star <= (data.rating || 0) ? "text-amber-400" : "text-gray-600")}>
              <LucideReact.Star className={"w-4 h-4" + (star <= (data.rating || 0) ? " fill-current" : "")} />
            </button>;
          })}
        </div>

        {/* AI Description */}
        {data.aiDescription ? (
          <UICard accent="purple">
            <div className="flex items-center gap-1.5 mb-1">
              <LucideReact.Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-medium text-purple-300">AI Description</span>
            </div>
            <div className="text-xs text-gray-300 leading-relaxed">{data.aiDescription}</div>
            {data.aiTags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {data.aiTags.map(function(tag, i) { return <Badge key={i} variant="info">{tag}</Badge>; })}
              </div>
            )}
          </UICard>
        ) : (
          <Button variant="outline" size="sm" onClick={function() { onAction("describe_photo", { path: data.path }); }}>
            <LucideReact.Sparkles className="w-3.5 h-3.5 mr-1" /> Describe with AI
          </Button>
        )}

        {/* EXIF Metadata */}
        {(exif.cameraMake || exif.dateTaken || exif.focalLength) && (
          <Accordion type="single" items={[{
            value: "exif",
            title: "Camera & EXIF Data",
            content: (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {exif.cameraMake && <><span className="text-gray-500">Camera</span><span className="text-gray-200">{exif.cameraMake} {exif.cameraModel || ""}</span></>}
                {exif.dateTaken && <><span className="text-gray-500">Date Taken</span><span className="text-gray-200">{exif.dateTaken}</span></>}
                {exif.focalLength && <><span className="text-gray-500">Focal Length</span><span className="text-gray-200">{exif.focalLength}</span></>}
                {exif.aperture && <><span className="text-gray-500">Aperture</span><span className="text-gray-200">{exif.aperture}</span></>}
                {exif.exposureTime && <><span className="text-gray-500">Exposure</span><span className="text-gray-200">{exif.exposureTime}</span></>}
                {exif.iso && <><span className="text-gray-500">ISO</span><span className="text-gray-200">{exif.iso}</span></>}
                {exif.width && <><span className="text-gray-500">Dimensions</span><span className="text-gray-200">{exif.width} \\u00d7 {exif.height}</span></>}
                {exif.gps && <><span className="text-gray-500">GPS</span><span className="text-gray-200">{exif.gps.lat.toFixed(4)}, {exif.gps.lng.toFixed(4)}</span></>}
              </div>
            ),
          }]} />
        )}
      </div>
    );
  }

  // ── AI Describe View ──
  if (isDescribe) {
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse_folder", { path: data.path ? data.path.replace(/\\\\/g, "/").split("/").slice(0, -1).join("/") : "." }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-gray-100">AI Photo Analysis</span>
          {data.cached && <Badge variant="outline">cached</Badge>}
        </div>
        <div className="rounded-lg overflow-hidden bg-black/40 flex items-center justify-center" style={{ maxHeight: "300px" }}>
          <img src={data.mediaUrl} alt={data.name} style={{ maxWidth: "100%", maxHeight: "300px", objectFit: "contain" }} />
        </div>
        <div className="text-xs font-medium text-gray-200">{data.name}</div>
        {data.description && (
          <UICard accent="purple">
            <div className="text-xs text-gray-300 leading-relaxed">{data.description}</div>
          </UICard>
        )}
        {data.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.tags.map(function(tag, i) { return <Badge key={i} variant="info">{tag}</Badge>; })}
          </div>
        )}
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={function() { onAction("describe_photo", { path: data.path }); }}>Re-describe</Button>
          <Button variant="ghost" size="sm" onClick={function() { onAction("view_photo", { path: data.path }); }}>Full Details</Button>
        </div>
      </div>
    );
  }

  // ── Search Results View ──
  if (isSearch) {
    var results = data.results || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse_folder", { path: data.path || "." }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.Search className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-gray-100">Search: "{data.query}"</span>
        </div>
        <div className="flex gap-2 text-[11px] text-gray-500">
          <span>{data.total} matches</span>
          <span>\\u00b7 {data.totalScanned} scanned</span>
          <span>\\u00b7 {data.totalWithAI} AI-tagged</span>
        </div>
        {results.length === 0 ? (
          <EmptyState
            icon={<LucideReact.SearchX className="w-8 h-8" />}
            title="No matches"
            description={"No photos matched \\\"" + data.query + "\\\". Try batch tagging first to add AI descriptions."}
            action={<Button size="sm" onClick={function() { onAction("batch_tag", { path: data.path }); }}>Batch Tag Photos</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
            {results.map(function(item, idx) {
              return (
                <button key={idx} onClick={function() { onAction("view_photo", { path: item.path }); }}
                  className="relative group bg-gray-800 rounded-md overflow-hidden border border-gray-600/50 hover:border-blue-500/60 cursor-pointer text-left">
                  <img src={item.mediaUrl} alt={item.name} loading="lazy"
                    style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                  <div className="p-1">
                    <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                    <div className="text-[10px] text-blue-400 truncate">{item.matchReason}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Batch Tag View ──
  if (isBatchTag) {
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse_folder", { path: data.path || "." }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-gray-100">Batch AI Tagging</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Tagged" value={data.tagged || 0} accent="emerald" />
          <Stat label="Already Done" value={data.skipped || 0} accent="blue" />
          <Stat label="Remaining" value={data.remaining || 0} accent="amber" />
          <Stat label="Errors" value={data.errors || 0} accent={data.errors > 0 ? "rose" : "gray"} />
        </div>
        {(data.remaining || 0) > 0 && (
          <Button variant="primary" size="sm" onClick={function() { onAction("batch_tag", { path: data.path, limit: 10 }); }}>
            <LucideReact.Sparkles className="w-3.5 h-3.5 mr-1" /> Tag More Photos
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={function() { onAction("browse_folder", { path: data.path }); }}>
          Back to Gallery
        </Button>
      </div>
    );
  }

  // ── Group View ──
  if (isGroup) {
    var groups = data.groups || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2 mb-1">
          <Button variant="ghost" size="sm" onClick={function() { onAction("browse_folder", { path: currentPath }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-semibold text-gray-100">Media by Type</span>
        </div>
        {groups.map(function(g, i) {
          var icons = { image: LucideReact.Image, video: LucideReact.Video, document: LucideReact.FileText };
          var Ic = icons[g.type] || LucideReact.File;
          var accents = { image: "blue", video: "purple", document: "amber" };
          return (
            <UICard key={i} accent={accents[g.type] || "gray"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ic className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-200 capitalize">{g.type}</span>
                </div>
                <Badge variant="default">{g.count}</Badge>
              </div>
            </UICard>
          );
        })}
      </div>
    );
  }

  // ── Collections View ──
  if (isCollections && data.action !== "view") {
    var colls = data.collections || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={function() { onAction("browse_folder", { path: "~" }); }}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <LucideReact.FolderHeart className="w-4 h-4 text-rose-400" />
            <span className="text-sm font-semibold text-gray-100">Collections</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { setCreateInput(createInput === null ? "" : null); }}>
            <LucideReact.Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        {createInput !== null && (
          <div className="flex gap-1.5">
            <Input placeholder="Collection name..." value={createInput} onChange={function(v) { setCreateInput(v); }} size="sm" />
            <Button size="sm" variant="primary" onClick={function() { if (createInput.trim()) { onAction("manage_collection", { action: "create", collectionName: createInput.trim() }); setCreateInput(null); } }}>Create</Button>
          </div>
        )}
        {colls.length === 0 ? (
          <EmptyState icon={<LucideReact.FolderHeart className="w-8 h-8" />} title="No collections" description="Create a collection to organize your photos." />
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {colls.map(function(col, i) {
              return (
                <button key={i} onClick={function() { onAction("manage_collection", { action: "view", collectionName: col.name }); }}
                  className="bg-gray-800 rounded-lg border border-gray-600/50 overflow-hidden hover:border-blue-500/60 cursor-pointer text-left">
                  {col.coverUrl ? (
                    <img src={col.coverUrl} alt={col.name} loading="lazy" style={{ width: "100%", height: "80px", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "80px" }} className="bg-gray-700/50 flex items-center justify-center">
                      <LucideReact.Images className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                  <div className="p-1.5">
                    <div className="text-xs text-gray-200 truncate">{col.name}</div>
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

  // ── Collection Detail View ──
  if (isCollections && data.action === "view") {
    var colItems = data.items || [];
    return (
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("manage_collection", { action: "list" }); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.FolderHeart className="w-4 h-4 text-rose-400" />
          <span className="text-sm font-semibold text-gray-100">{data.collectionName}</span>
          <Badge>{data.total} photos</Badge>
        </div>
        {colItems.length === 0 ? (
          <EmptyState icon={<LucideReact.ImageOff className="w-8 h-8" />} title="Empty collection" description="Add photos from the gallery view." />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
            {colItems.map(function(item, idx) {
              return (
                <button key={idx} onClick={function() { onAction("view_photo", { path: item.path }); }}
                  className="relative group bg-gray-800 rounded-md overflow-hidden border border-gray-600/50 hover:border-blue-500/60 cursor-pointer text-left">
                  <img src={item.mediaUrl} alt={item.name} loading="lazy"
                    style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                  <div className="px-1 py-0.5">
                    <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <Button variant="danger" size="sm" onClick={function() { onAction("manage_collection", { action: "delete", collectionName: data.collectionName }); }}>
          <LucideReact.Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Collection
        </Button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Main Gallery / Browse View (default) ──
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={function() { onAction("list_drives", {}); }}
            className="p-1 rounded hover:bg-gray-700 cursor-pointer text-gray-400 hover:text-gray-200 shrink-0"
            title="Home">
            <LucideReact.Home className="w-4 h-4" />
          </button>
          {parentPath && (
            <button onClick={function() { onAction("browse_folder", { path: parentPath }); }}
              className="p-1 rounded hover:bg-gray-700 cursor-pointer text-gray-400 hover:text-gray-200 shrink-0"
              title="Up">
              <LucideReact.ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
              <LucideReact.Images className="w-4 h-4 text-blue-400 shrink-0" />
              Photo Gallery
            </div>
            <div className="text-[11px] text-gray-500 truncate">{shortPath(currentPath)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={function() { onAction("bookmark_folder", { path: currentPath }); }}
            className="p-1.5 rounded-md hover:bg-gray-700 cursor-pointer text-gray-400 hover:text-amber-400"
            title="Bookmark this folder">
            <LucideReact.Bookmark className="w-4 h-4" />
          </button>
          <Stat label="Photos" value={filtered.length} accent="blue" />
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex-1 min-w-0" style={{ maxWidth: "200px" }}>
          <Input placeholder="Filter photos..." value={searchQuery}
            onChange={function(v) { setSearchQuery(v); }}
            icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
        </div>
        <Select size="sm" value={data?.sortBy || "name"} options={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
          { value: "size", label: "Size" },
        ]} onChange={function(v) { onAction("browse_folder", { path: currentPath, sortBy: v, sortDir: data?.sortDir || "asc", filter: data?.filter || "all" }); }} />
        <button onClick={function() { onAction("browse_folder", { path: currentPath, sortBy: data?.sortBy || "name", sortDir: data?.sortDir === "desc" ? "asc" : "desc", filter: data?.filter || "all" }); }}
          className="p-1.5 rounded-md bg-gray-800 border border-gray-600/50 hover:bg-gray-700 cursor-pointer text-gray-400">
          {data?.sortDir === "desc" ? <LucideReact.ArrowDownWideNarrow className="w-3.5 h-3.5" /> : <LucideReact.ArrowUpNarrowWide className="w-3.5 h-3.5" />}
        </button>
        <button onClick={function() { setFavOnly(!favOnly); }}
          className={"p-1.5 rounded-md border cursor-pointer " + (favOnly ? "bg-rose-600/20 border-rose-500/60 text-rose-400" : "bg-gray-800 border-gray-600/50 text-gray-400 hover:bg-gray-700")}>
          <LucideReact.Heart className={"w-3.5 h-3.5" + (favOnly ? " fill-current" : "")} />
        </button>
        <div className="flex rounded-md border border-gray-600/50 overflow-hidden">
          <button onClick={function() { setViewMode("grid"); }}
            className={"px-2 py-1 text-xs cursor-pointer " + (viewMode === "grid" ? "bg-blue-600/30 text-blue-200" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
            <LucideReact.Grid3x3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={function() { setViewMode("list"); }}
            className={"px-2 py-1 text-xs cursor-pointer " + (viewMode === "list" ? "bg-blue-600/30 text-blue-200" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
            <LucideReact.List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" onClick={function() { onAction("batch_tag", { path: currentPath, limit: 10 }); }}>
          <LucideReact.Sparkles className="w-3 h-3 mr-1" /> AI Tag All
        </Button>
        <Button variant="outline" size="sm" onClick={function() { onAction("manage_collection", { action: "list" }); }}>
          <LucideReact.FolderHeart className="w-3 h-3 mr-1" /> Collections
        </Button>
        <Button variant="outline" size="sm" onClick={function() { onAction("group_by_type", { path: currentPath }); }}>
          <LucideReact.PieChart className="w-3 h-3 mr-1" /> By Type
        </Button>
      </div>

      {/* ── Subdirectories ── */}
      {directories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {directories.slice(0, 12).map(function(dir, i) {
            return (
              <button key={i} onClick={function() { onAction("browse_folder", { path: dir.path }); }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700 hover:border-blue-500/40 cursor-pointer text-gray-300">
                <LucideReact.Folder className="w-3 h-3 text-amber-500" />
                <span className="truncate" style={{ maxWidth: "100px" }}>{dir.name}</span>
                {dir.itemCount > 0 && <span className="text-gray-500 text-[10px]">{dir.itemCount}</span>}
              </button>
            );
          })}
          {directories.length > 12 && <span className="text-[10px] text-gray-500 self-center">+{directories.length - 12} more</span>}
        </div>
      )}

      {/* ── Thumbnail Grid ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<LucideReact.ImageOff className="w-8 h-8" />}
          title={favOnly ? "No favorites" : "No photos"}
          description={favOnly ? "Mark photos as favorites with the heart icon." : "This folder has no media files."}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-3 gap-1.5 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {filtered.map(function(item, idx) {
            var isImage = item.type === "image";
            var isVideo = item.type === "video";
            var hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx} onClick={function() { if (hasThumb) setLightboxIdx(idx); else onAction("view_photo", { path: item.path }); }}
                className="relative group bg-gray-800 rounded-md overflow-hidden border border-gray-600/50 hover:border-blue-500/60 cursor-pointer text-left">
                {hasThumb ? (
                  <div style={{ position: "relative", width: "100%", height: "110px" }}>
                    <img src={isVideo ? item.thumbnailUrl : item.mediaUrl} alt={item.name} loading="lazy"
                      style={{ width: "100%", height: "110px", objectFit: "cover" }}
                      onError={function(e) { e.target.style.display = "none"; }} />
                    {isVideo && (
                      <div style={{ position: "absolute", inset: 0 }} className="flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                          <LucideReact.Play className="w-4 h-4 text-white ml-0.5" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ width: "100%", height: "110px" }} className="flex items-center justify-center bg-gray-700/40">
                    {isVideo ? <LucideReact.Video className="w-6 h-6 text-purple-400" /> : <LucideReact.FileText className="w-6 h-6 text-amber-400" />}
                  </div>
                )}
                {/* Overlay indicators */}
                <div className="absolute top-1 right-1 flex gap-0.5">
                  {item.isFavorite && <span className="text-rose-400"><LucideReact.Heart className="w-3 h-3 fill-current" /></span>}
                  {item.aiTags?.length > 0 && <span className="text-purple-400"><LucideReact.Sparkles className="w-3 h-3" /></span>}
                </div>
                {item.rating > 0 && (
                  <div className="absolute top-1 left-1 flex">
                    {[1,2,3,4,5].map(function(s) {
                      return s <= item.rating ? <LucideReact.Star key={s} className="w-2.5 h-2.5 text-amber-400 fill-current" /> : null;
                    })}
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
          {filtered.map(function(item, idx) {
            var isImage = item.type === "image";
            var isVideo = item.type === "video";
            var hasThumb = isImage || (isVideo && item.thumbnailUrl);
            return (
              <button key={item.path || idx} onClick={function() { if (hasThumb) setLightboxIdx(idx); else onAction("view_photo", { path: item.path }); }}
                className="flex items-center gap-2 w-full px-2 py-1.5 bg-gray-800 rounded-md border border-gray-600/50 hover:bg-gray-700/60 cursor-pointer text-left">
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
                    {fmtDate(item.exif?.dateTaken || item.modifiedAt)} \\u00b7 {fmtSize(item.size)}
                    {item.exif?.width ? " \\u00b7 " + item.exif.width + "\\u00d7" + item.exif.height : ""}
                  </div>
                </div>
                {item.rating > 0 && <div className="flex shrink-0">{[1,2,3,4,5].map(function(s) { return s <= item.rating ? <LucideReact.Star key={s} className="w-2.5 h-2.5 text-amber-400 fill-current" /> : null; })}</div>}
                <Badge variant="outline">{item.ext}</Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── Lightbox (full-screen overlay) ──                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {lightboxIdx >= 0 && lightboxIdx < filtered.length && (function() {
        var photo = filtered[lightboxIdx];
        return (
          <div ref={lbRef} tabIndex={0}
            onKeyDown={function(e) {
              if (e.key === "Escape") setLightboxIdx(-1);
              if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
              if (e.key === "ArrowRight" && lightboxIdx < filtered.length - 1) setLightboxIdx(lightboxIdx + 1);
            }}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.92)", outline: "none",
            }}>

            {/* Close */}
            <button onClick={function() { setLightboxIdx(-1); }}
              style={{ position: "absolute", top: 12, right: 16, zIndex: 210 }}
              className="text-white/70 hover:text-white text-lg cursor-pointer p-1">
              <LucideReact.X className="w-5 h-5" />
            </button>

            {/* Counter */}
            <div style={{ position: "absolute", top: 14, left: 16, zIndex: 210 }}
              className="text-white/50 text-xs">{lightboxIdx + 1} / {filtered.length}</div>

            {/* Prev */}
            {lightboxIdx > 0 && (
              <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/50 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10">
                <LucideReact.ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Media */}
            {photo.type === "video" ? (
              <EnsoUI.VideoPlayer src={photo.mediaUrl} style={{ maxWidth: "90vw", maxHeight: "78vh", borderRadius: "4px" }} />
            ) : (
              <img src={photo.mediaUrl} alt={photo.name}
                style={{ maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain", borderRadius: "4px" }} />
            )}

            {/* Next */}
            {lightboxIdx < filtered.length - 1 && (
              <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                className="text-white/50 hover:text-white cursor-pointer p-2 rounded-full hover:bg-white/10">
                <LucideReact.ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Info bar */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 16px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))", zIndex: 210 }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{photo.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {fmtDate(photo.exif?.dateTaken || photo.modifiedAt)} \\u00b7 {fmtSize(photo.size)}
                    {photo.exif?.width ? " \\u00b7 " + photo.exif.width + "\\u00d7" + photo.exif.height : ""}
                    {photo.exif?.cameraMake ? " \\u00b7 " + photo.exif.cameraMake : ""}
                  </div>
                  {photo.aiDescription && (
                    <div className="text-[11px] text-purple-300 mt-0.5 line-clamp-1">{photo.aiDescription}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button onClick={function(e) { e.stopPropagation(); onAction("toggle_favorite", { path: photo.path }); }}
                    className={"p-1.5 rounded cursor-pointer " + (photo.isFavorite ? "text-rose-400" : "text-white/50 hover:text-white")}>
                    <LucideReact.Heart className={"w-4 h-4" + (photo.isFavorite ? " fill-current" : "")} />
                  </button>
                  <button onClick={function(e) { e.stopPropagation(); onAction("describe_photo", { path: photo.path }); }}
                    className="p-1.5 rounded text-white/50 hover:text-purple-300 cursor-pointer">
                    <LucideReact.Sparkles className="w-4 h-4" />
                  </button>
                  <button onClick={function(e) { e.stopPropagation(); setLightboxIdx(-1); onAction("view_photo", { path: photo.path }); }}
                    className="p-1.5 rounded text-white/50 hover:text-white cursor-pointer">
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
}`;

export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (all at top level) ──
  const [selectedStyle, setSelectedStyle] = useState("kodak_portra_400");
  const [collectionName, setCollectionName] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [bookPage, setBookPage] = useState(0);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [activeTab, setActiveTab] = useState("Film Stocks");
  const [previewFilter, setPreviewFilter] = useState("all");
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxName, setLightboxName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStyle, setProcessingStyle] = useState("");
  const [processingCount, setProcessingCount] = useState(0);

  // ── Detect tool view ──
  const tool = data?.tool || "";
  const isImport = tool === "enso_photo_studio_import_photos";
  const isApplyStyle = tool === "enso_photo_studio_apply_style";
  const isBatchProcess = tool === "enso_photo_studio_batch_process";
  const isCollection = tool === "enso_photo_studio_manage_collection";
  const isCompare = tool === "enso_photo_studio_compare_versions";
  const isPhotobook = tool === "enso_photo_studio_photobook";
  const isAdjust = tool === "enso_photo_studio_adjust";
  const isPreviewStyles = tool === "enso_photo_studio_preview_styles";
  const isListStyles = tool === "enso_photo_studio_list_styles";

  // ── Reset processing overlay when data changes (batch completes or navigates away) ──
  useEffect(() => {
    if (isProcessing && !isImport) {
      setIsProcessing(false);
    }
  }, [tool]);

  // ── Safety timeout: clear processing overlay after 3 minutes ──
  useEffect(() => {
    if (isProcessing) {
      var timer = setTimeout(function() { setIsProcessing(false); }, 180000);
      return function() { clearTimeout(timer); };
    }
  }, [isProcessing]);

  // ── Helpers ──
  const getIcon = (name) => {
    var I = LucideReact[name];
    return I ? I : LucideReact.Aperture;
  };
  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };
  const defaultUi = { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-300" };

  // ── Lightbox overlay (full-view photo) ──
  var lightbox = lightboxUrl ? (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={function() { setLightboxUrl(null); }}>
      <button onClick={function() { setLightboxUrl(null); }} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", padding: 8, zIndex: 10 }}>
        <LucideReact.X className="w-7 h-7 text-white/70 hover:text-white" />
      </button>
      <img src={lightboxUrl} alt={lightboxName} style={{ maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 80px)", objectFit: "contain", borderRadius: 8 }} onClick={function(e) { e.stopPropagation(); }} />
      <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        {lightboxName && <div className="text-sm text-white/60" style={{ pointerEvents: "auto" }}>{lightboxName}</div>}
        <div className="flex gap-2" style={{ pointerEvents: "auto" }} onClick={function(e) { e.stopPropagation(); }}>
          <Button size="sm" variant="outline" onClick={function() { onAction("__save_photo", { url: lightboxUrl, filename: lightboxName || "photo.jpg" }); }}>
            <LucideReact.Download className="w-3 h-3 mr-1" /> Save
          </Button>
          <Button size="sm" variant="outline" onClick={function() { onAction("__share_photo", { url: lightboxUrl, filename: lightboxName || "photo.jpg" }); }}>
            <LucideReact.Share2 className="w-3 h-3 mr-1" /> Share
          </Button>
          <Button size="sm" variant="outline" onClick={function() { setLightboxUrl(null); }}>
            <LucideReact.X className="w-3 h-3 mr-1" /> Close
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  // ── Processing overlay (shown while batch is running) ──
  const processingOverlay = isProcessing ? (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <LucideReact.Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-100">Processing Photos</div>
          <div className="text-[11px] text-gray-500">{processingCount} photo{processingCount !== 1 ? "s" : ""} · {processingStyle.replace(/_/g, " ")}</div>
        </div>
        <Badge variant="info">
          <LucideReact.Zap className="w-3 h-3 mr-1" /> Working
        </Badge>
      </div>
      <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/40 flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-violet-500/30 flex items-center justify-center">
            <LucideReact.Aperture className="w-8 h-8 text-violet-400 animate-spin" style={{ animationDuration: "3s" }} />
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center">
            <LucideReact.Sparkles className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <div className="text-xs text-gray-200 font-medium">Applying {processingStyle.replace(/_/g, " ")} style</div>
          <div className="text-[11px] text-gray-500">Each photo is being professionally graded...</div>
        </div>
        <div className="w-full space-y-1">
          <div className="h-1.5 bg-gray-700/40 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
          <div className="text-[10px] text-gray-500 text-center">This may take a moment for large photos</div>
        </div>
      </div>
    </div>
  ) : null;

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Something went wrong"
          description={data.error}
          action={<Button size="sm" onClick={() => onAction("import_photos", {})}>Start Over</Button>}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Processing Overlay (shown while batch is in progress) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isProcessing && isImport) {
    return processingOverlay;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Import / Browse Photos View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isImport) {
    var currentPath = data.path || "";
    var parentPath = data.parentPath || "";
    var directories = data.directories || [];
    var items = data.items || [];
    var isRoot = !currentPath || currentPath === "/";
    var folderName = isRoot ? "Select a Folder" : currentPath.split("/").filter(Boolean).pop() || currentPath;

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {lightbox}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <LucideReact.ImagePlus className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-100">Photo Studio</div>
              <div className="text-[11px] text-gray-500">Browse & select photos</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onAction("manage_collection", { action: "list" })}>
            <LucideReact.FolderOpen className="w-3.5 h-3.5 mr-1" /> Collections
          </Button>
        </div>

        {/* Breadcrumb */}
        {!isRoot && (
          <div className="flex items-center gap-1 text-[11px] overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
            <button onClick={() => onAction("import_photos", {})} className="text-violet-400 hover:text-violet-300 cursor-pointer shrink-0">
              <LucideReact.HardDrive className="w-3.5 h-3.5" />
            </button>
            {currentPath.split("/").filter(Boolean).map(function(seg, idx, arr) {
              var segPath = "/" + arr.slice(0, idx + 1).join("/");
              var isLast = idx === arr.length - 1;
              return (
                <span key={idx} className="flex items-center gap-1 shrink-0">
                  <LucideReact.ChevronRight className="w-3 h-3 text-gray-600" />
                  {isLast ? (
                    <span className="text-gray-200 font-medium">{seg}</span>
                  ) : (
                    <button onClick={() => onAction("import_photos", { path: segPath })}
                      className="text-violet-400 hover:text-violet-300 cursor-pointer truncate max-w-[100px]">{seg}</button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Up button */}
        {!isRoot && parentPath && (
          <button onClick={() => onAction("import_photos", { path: parentPath })}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30 hover:border-gray-600/50 hover:bg-gray-800/60 cursor-pointer transition-all text-left">
            <LucideReact.ArrowUp className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-400">Up to parent</span>
          </button>
        )}

        {/* Directories */}
        {directories.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{isRoot ? "Locations" : "Folders"}</div>
            <div className="space-y-1 max-h-48 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {directories.map(function(dir, idx) {
                return (
                  <button key={idx} onClick={() => onAction("import_photos", { path: dir.path })}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30 hover:border-violet-500/30 hover:bg-gray-800/60 cursor-pointer transition-all text-left group">
                    {isRoot ? (
                      <LucideReact.HardDrive className="w-4 h-4 text-violet-400 shrink-0" />
                    ) : (
                      <LucideReact.Folder className="w-4 h-4 text-amber-400 shrink-0 group-hover:text-amber-300" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 truncate">{dir.name}</div>
                      {dir.itemCount > 0 && <div className="text-[10px] text-gray-500">{dir.itemCount} image{dir.itemCount !== 1 ? "s" : ""}</div>}
                    </div>
                    <LucideReact.ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0 group-hover:text-gray-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Photo thumbnails */}
        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{items.length} photo{items.length !== 1 ? "s" : ""}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setViewMode("grid")} className={"p-1 rounded cursor-pointer " + (viewMode === "grid" ? "text-violet-400 bg-violet-500/10" : "text-gray-500 hover:text-gray-300")}>
                  <LucideReact.LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setViewMode("list")} className={"p-1 rounded cursor-pointer " + (viewMode === "list" ? "text-violet-400 bg-violet-500/10" : "text-gray-500 hover:text-gray-300")}>
                  <LucideReact.List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {viewMode === "grid" ? (
              <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {items.map(function(item, idx) {
                  return (
                    <div key={idx} className="relative group bg-gray-800/60 rounded-xl overflow-hidden border border-gray-700/40 hover:border-violet-500/40 transition-all cursor-pointer"
                      onClick={function() { if (item.mediaUrl) { setLightboxUrl(item.mediaUrl); setLightboxName(item.name); } }}>
                      {item.mediaUrl ? (
                        <img src={item.mediaUrl} alt={item.name} loading="lazy" style={{ width: "100%", height: "100px", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100px" }} className="bg-gray-700/30 flex items-center justify-center">
                          <LucideReact.Image className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                      <div className="p-1.5">
                        <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                        <div className="text-[9px] text-gray-500">{formatSize(item.size)}</div>
                      </div>
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={function(e) { e.stopPropagation(); onAction("preview_styles", { photoPath: item.path }); }}
                          className="p-1 rounded-md bg-black/60 text-violet-300 hover:text-violet-200 cursor-pointer backdrop-blur-sm">
                          <LucideReact.Palette className="w-3 h-3" />
                        </button>
                        <button onClick={function(e) { e.stopPropagation(); if (item.mediaUrl) { setLightboxUrl(item.mediaUrl); setLightboxName(item.name); } }}
                          className="p-1 rounded-md bg-black/60 text-gray-300 hover:text-white cursor-pointer backdrop-blur-sm">
                          <LucideReact.Maximize2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {items.map(function(item, idx) {
                  return (
                    <div key={idx} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-gray-800/40 border border-gray-700/30 hover:border-violet-500/30 transition-all group">
                      {item.mediaUrl ? (
                        <img src={item.mediaUrl} alt={item.name} loading="lazy" className="rounded-md shrink-0" style={{ width: "40px", height: "40px", objectFit: "cover" }} />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-gray-700/30 flex items-center justify-center shrink-0">
                          <LucideReact.Image className="w-4 h-4 text-gray-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-200 truncate">{item.name}</div>
                        <div className="text-[10px] text-gray-500">{formatSize(item.size)} · {item.ext}</div>
                      </div>
                      <button onClick={() => onAction("preview_styles", { photoPath: item.path })}
                        className="p-1.5 rounded-lg bg-gray-700/40 hover:bg-violet-500/20 cursor-pointer transition-all opacity-0 group-hover:opacity-100">
                        <LucideReact.Palette className="w-3.5 h-3.5 text-violet-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions bar */}
        {items.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-gray-800/40">
            <div className="flex gap-2">
              <Button size="sm" variant="outline"
                onClick={() => onAction("photobook", { paths: items.map(function(it) { return it.path; }), layout: "auto", title: folderName || "Photo Book", folderPath: currentPath })}>
                <LucideReact.BookOpen className="w-3 h-3 mr-1" /> Photo Book
              </Button>
              <Button size="sm" variant={showStylePicker ? "primary" : "outline"} onClick={() => setShowStylePicker(!showStylePicker)}>
                <LucideReact.Wand2 className="w-3 h-3 mr-1" /> Batch Process
              </Button>
            </div>

            {/* Style picker — inline with category tabs */}
            {showStylePicker && (
              <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/40 space-y-3">
                {/* Category tabs */}
                <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                  {["Film Stocks", "Cinematic", "Photographers", "Trending"].map(function(cat) {
                    return (
                      <button key={cat} onClick={() => setActiveTab(cat)}
                        className={"px-2.5 py-1 rounded-lg text-[10px] font-medium cursor-pointer transition-all whitespace-nowrap " +
                          (activeTab === cat ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent")}>
                        {cat}
                      </button>
                    );
                  })}
                </div>

                {/* Style cards for active tab */}
                <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {(data._allStyles || [
                    { id: "kodak_portra_400", name: "Portra 400", subtitle: "Kodak", category: "Film Stocks", ui: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300" } },
                    { id: "kodak_portra_160", name: "Portra 160", subtitle: "Kodak", category: "Film Stocks", ui: { bg: "bg-orange-400/10", border: "border-orange-400/30", text: "text-orange-300" } },
                    { id: "kodak_gold_200", name: "Gold 200", subtitle: "Kodak", category: "Film Stocks", ui: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-300" } },
                    { id: "kodak_ektar_100", name: "Ektar 100", subtitle: "Kodak", category: "Film Stocks", ui: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300" } },
                    { id: "kodak_trix_400", name: "Tri-X 400", subtitle: "Kodak", category: "Film Stocks", ui: { bg: "bg-gray-500/10", border: "border-gray-400/30", text: "text-gray-300" } },
                    { id: "fuji_pro400h", name: "Pro 400H", subtitle: "Fujifilm", category: "Film Stocks", ui: { bg: "bg-teal-400/10", border: "border-teal-400/30", text: "text-teal-300" } },
                    { id: "fuji_superia", name: "Superia 400", subtitle: "Fujifilm", category: "Film Stocks", ui: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-300" } },
                    { id: "ilford_hp5", name: "HP5 Plus", subtitle: "Ilford", category: "Film Stocks", ui: { bg: "bg-zinc-500/10", border: "border-zinc-400/30", text: "text-zinc-300" } },
                    { id: "ilford_delta_3200", name: "Delta 3200", subtitle: "Ilford", category: "Film Stocks", ui: { bg: "bg-neutral-600/10", border: "border-neutral-500/30", text: "text-neutral-300" } },
                    { id: "cinestill_800t", name: "CineStill 800T", subtitle: "Tungsten", category: "Film Stocks", ui: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300" } },
                    { id: "cross_processed", name: "Cross Process", subtitle: "E-6 in C-41", category: "Film Stocks", ui: { bg: "bg-lime-500/10", border: "border-lime-500/30", text: "text-lime-300" } },
                    { id: "wong_kar_wai", name: "Wong Kar-wai", subtitle: "王家卫", category: "Cinematic", ui: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300" } },
                    { id: "wes_anderson", name: "Wes Anderson", subtitle: "Pastel Symmetry", category: "Cinematic", ui: { bg: "bg-pink-400/10", border: "border-pink-400/30", text: "text-pink-300" } },
                    { id: "blade_runner", name: "Blade Runner", subtitle: "Cyberpunk Noir", category: "Cinematic", ui: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-300" } },
                    { id: "tarantino", name: "Tarantino", subtitle: "Grindhouse", category: "Cinematic", ui: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300" } },
                    { id: "ghibli", name: "Studio Ghibli", subtitle: "宮崎駿", category: "Cinematic", ui: { bg: "bg-emerald-400/10", border: "border-emerald-400/30", text: "text-emerald-300" } },
                    { id: "nordic_noir", name: "Nordic Noir", subtitle: "Scandinavian", category: "Cinematic", ui: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300" } },
                    { id: "terrence_malick", name: "Terrence Malick", subtitle: "Golden Hour", category: "Cinematic", ui: { bg: "bg-amber-400/10", border: "border-amber-400/30", text: "text-amber-200" } },
                    { id: "hitchcock", name: "Hitchcock", subtitle: "Suspense Noir", category: "Cinematic", ui: { bg: "bg-gray-600/10", border: "border-gray-500/30", text: "text-gray-200" } },
                    { id: "moriyama", name: "Moriyama", subtitle: "森山大道", category: "Photographers", ui: { bg: "bg-gray-600/10", border: "border-gray-500/30", text: "text-gray-200" } },
                    { id: "fan_ho", name: "Fan Ho", subtitle: "何藩", category: "Photographers", ui: { bg: "bg-stone-500/10", border: "border-stone-400/30", text: "text-stone-300" } },
                    { id: "saul_leiter", name: "Saul Leiter", subtitle: "Through Glass", category: "Photographers", ui: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300" } },
                    { id: "vivian_maier", name: "Vivian Maier", subtitle: "Street Portrait", category: "Photographers", ui: { bg: "bg-slate-500/10", border: "border-slate-400/30", text: "text-slate-300" } },
                    { id: "moody_natural", name: "Moody Natural", subtitle: "Dark Editorial", category: "Trending", ui: { bg: "bg-stone-500/10", border: "border-stone-500/30", text: "text-stone-300" } },
                    { id: "soft_film", name: "Soft Film", subtitle: "Polished Nostalgia", category: "Trending", ui: { bg: "bg-rose-400/10", border: "border-rose-400/30", text: "text-rose-300" } },
                    { id: "clean_bright", name: "Clean & Bright", subtitle: "Modern Commercial", category: "Trending", ui: { bg: "bg-sky-400/10", border: "border-sky-400/30", text: "text-sky-300" } },
                    { id: "warm_vintage_bw", name: "Warm Vintage B&W", subtitle: "Sepia Soul", category: "Trending", ui: { bg: "bg-amber-600/10", border: "border-amber-600/30", text: "text-amber-400" } },
                    { id: "faded_editorial", name: "Faded Editorial", subtitle: "Fashion Magazine", category: "Trending", ui: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-300" } },
                  ]).filter(function(s) { return s.category === activeTab; }).map(function(s) {
                    var isSelected = selectedStyle === s.id;
                    var ui = s.ui || defaultUi;
                    return (
                      <button key={s.id} onClick={() => setSelectedStyle(s.id)}
                        className={"flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-all text-left " +
                          (isSelected ? ui.bg + " " + ui.border + " ring-1 ring-inset " + ui.border.replace("border-", "ring-") : "bg-gray-800/40 border-gray-700/40 text-gray-400 hover:border-gray-600")}>
                        <div className={"w-6 h-6 rounded-lg flex items-center justify-center shrink-0 " + (isSelected ? ui.bg : "bg-gray-700/30")}>
                          <LucideReact.Aperture className={"w-3 h-3 " + (isSelected ? ui.text : "text-gray-500")} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={"text-[11px] font-semibold truncate " + (isSelected ? ui.text : "text-gray-300")}>{s.name}</div>
                          <div className={"text-[9px] truncate " + (isSelected ? "opacity-60" : "text-gray-600")}>{s.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Button size="sm" variant="primary" onClick={() => { setShowStylePicker(false); setIsProcessing(true); setProcessingStyle(selectedStyle); setProcessingCount(items.length); onAction("batch_process", { collection: currentPath, style: selectedStyle }); }}>
                    <LucideReact.Play className="w-3 h-3 mr-1" /> Process {items.length} Photo{items.length !== 1 ? "s" : ""}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowStylePicker(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {items.length === 0 && directories.length === 0 && !isRoot && (
          <EmptyState icon={<LucideReact.ImageOff className="w-8 h-8 text-gray-500" />} title="No images found"
            description="This folder doesn't contain any images."
            action={<Button size="sm" onClick={() => onAction("import_photos", { path: parentPath })}><LucideReact.ArrowUp className="w-3.5 h-3.5 mr-1" /> Go Back</Button>}
          />
        )}
        {isRoot && directories.length === 0 && (
          <EmptyState icon={<LucideReact.HardDrive className="w-8 h-8 text-gray-500" />} title="No drives found" description="Could not list drives on this machine." />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Style Previews View (NEW) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPreviewStyles) {
    var previewResults = data.results || [];
    var previewCategories = data.categories || {};
    var catNames = Object.keys(previewCategories);
    var displayResults = previewFilter === "all" ? previewResults : previewResults.filter(function(r) { return r.category === previewFilter; });

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Style Previews</div>
            <div className="text-[11px] text-gray-500">{previewResults.length} styles · tap to apply</div>
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          <button onClick={() => setPreviewFilter("all")}
            className={"px-2.5 py-1 rounded-lg text-[10px] font-medium cursor-pointer transition-all whitespace-nowrap " +
              (previewFilter === "all" ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent")}>
            All ({previewResults.length})
          </button>
          {catNames.map(function(cat) {
            var count = (previewCategories[cat] || []).length;
            return (
              <button key={cat} onClick={() => setPreviewFilter(cat)}
                className={"px-2.5 py-1 rounded-lg text-[10px] font-medium cursor-pointer transition-all whitespace-nowrap " +
                  (previewFilter === cat ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent")}>
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Preview grid */}
        <div className="grid grid-cols-2 gap-2 max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {displayResults.map(function(item) {
            var ui = item.ui || defaultUi;
            return (
              <button key={item.id} onClick={() => onAction("apply_style", { photoId: data.photoPath, style: item.id })}
                className={"rounded-xl overflow-hidden border cursor-pointer transition-all hover:scale-[1.02] text-left " + ui.border + " hover:" + ui.border}>
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.name} loading="lazy" style={{ width: "100%", height: "120px", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "120px" }} className={"flex items-center justify-center " + ui.bg}>
                    <LucideReact.Aperture className={"w-8 h-8 " + ui.text} />
                  </div>
                )}
                <div className="p-2 bg-gray-800/60">
                  <div className={"text-[11px] font-semibold " + ui.text}>{item.name}</div>
                  <div className="text-[9px] text-gray-500">{item.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>

        {displayResults.length === 0 && (
          <EmptyState icon={<LucideReact.Palette className="w-8 h-8 text-gray-500" />} title="No previews"
            description="Preview generation may have failed. Try again with a different photo." />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── List Styles View (NEW) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isListStyles) {
    var allStyles = data.styles || [];
    var categories = data.categories || {};
    var catKeys = Object.keys(categories);

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">All Styles</div>
            <div className="text-[11px] text-gray-500">{data.total || allStyles.length} styles available</div>
          </div>
        </div>

        {catKeys.map(function(catName) {
          var catStyles = categories[catName] || [];
          return (
            <div key={catName} className="space-y-1.5">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{catName}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {catStyles.map(function(s) {
                  var ui = s.ui || defaultUi;
                  return (
                    <div key={s.id} className={"px-2.5 py-2 rounded-lg border " + ui.border + " " + ui.bg}>
                      <div className={"text-[11px] font-semibold " + ui.text}>{s.name}</div>
                      <div className="text-[9px] text-gray-500">{s.subtitle}</div>
                      <div className="text-[9px] text-gray-600 mt-0.5 line-clamp-1">{s.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Apply Style View (REWRITTEN — shows real before/after) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isApplyStyle) {
    var photo = data.photo || {};
    var result = data.result || {};
    var style = data.style || "";
    var styleName = data.styleName || style.replace(/_/g, " ");

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {lightbox}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">{styleName}</div>
            <div className="text-[11px] text-gray-500">{photo.name || "Photo"}</div>
          </div>
          <Badge variant="info">
            <LucideReact.CheckCircle className="w-3 h-3 mr-1" /> Processed
          </Badge>
        </div>

        {/* Before / After — click to view full size */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Original</div>
            <div className="rounded-xl overflow-hidden border border-gray-700/40 bg-black/30 cursor-pointer hover:ring-1 hover:ring-gray-500/40 transition-all group relative"
              onClick={function() { if (photo.originalUrl) { setLightboxUrl(photo.originalUrl); setLightboxName("Original — " + (photo.name || "Photo")); } }}>
              {photo.originalUrl ? (
                <img src={photo.originalUrl} alt="Original" style={{ width: "100%", height: "160px", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "160px" }} className="flex items-center justify-center">
                  <LucideReact.Image className="w-8 h-8 text-gray-600" />
                </div>
              )}
              {photo.originalUrl && (
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <LucideReact.Maximize2 className="w-5 h-5 text-white drop-shadow" />
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Styled</div>
            <div className="rounded-xl overflow-hidden border border-violet-500/30 bg-black/30 cursor-pointer hover:ring-1 hover:ring-violet-500/40 transition-all group relative"
              onClick={function() { var url = result.mediaUrl || result.thumbUrl; if (url) { setLightboxUrl(url); setLightboxName(styleName + " — " + (photo.name || "Photo")); } }}>
              {(result.thumbUrl || result.mediaUrl) ? (
                <img src={result.thumbUrl || result.mediaUrl} alt="Styled" style={{ width: "100%", height: "160px", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "160px" }} className="flex items-center justify-center bg-violet-500/10">
                  <LucideReact.Aperture className="w-8 h-8 text-violet-300" />
                </div>
              )}
              {(result.thumbUrl || result.mediaUrl) && (
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <LucideReact.Maximize2 className="w-5 h-5 text-white drop-shadow" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        {result.width > 0 && (
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>{result.width} × {result.height}</span>
            {result.size_mb > 0 && <span>{result.size_mb} MB</span>}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => onAction("preview_styles", { photoPath: photo.path || photo.id })}>
            <LucideReact.Palette className="w-3.5 h-3.5 mr-1" /> Try Other Styles
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("compare_versions", { photoId: photo.path || photo.id })}>
            <LucideReact.Columns className="w-3.5 h-3.5 mr-1" /> Compare
          </Button>
          <Button size="sm" variant="ghost" onClick={function() { onAction("manage_collection", { action: "add", collectionName: "Latest Edits", photoPath: result.outputFile }); }}>
            <LucideReact.FolderPlus className="w-3.5 h-3.5 mr-1" /> Save to Collection
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Batch Process View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isBatchProcess) {
    var results = data.results || [];
    var total = data.total || results.length;
    var completed = data.completed || results.length;
    var batchStyle = data.style || "";
    var failedCount = data.failed || 0;

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {lightbox}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setIsProcessing(false); onAction("import_photos", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Batch Processing</div>
            <div className="text-[11px] text-gray-500">{completed}/{total} photos · {batchStyle.replace(/_/g, " ")}</div>
          </div>
          <Badge variant={data.status === "complete" ? "success" : "info"}>
            {data.status === "complete" ? (
              <><LucideReact.CheckCircle className="w-3 h-3 mr-1" /> Done</>
            ) : (
              <><LucideReact.Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing</>
            )}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Progress</span>
            <span className="text-gray-200 font-medium">{total > 0 ? Math.round((completed / total) * 100) : 0}%</span>
          </div>
          <Progress value={completed} max={total} />
          {data.status === "complete" && (
            <div className="flex items-center gap-2 text-[10px] pt-1">
              <span className="text-emerald-400">{completed - failedCount} processed</span>
              {failedCount > 0 && <span className="text-rose-400">{failedCount} failed</span>}
            </div>
          )}
        </div>

        {/* Auto-saved to collection notice */}
        {data.status === "complete" && data.savedToCollection && (
          <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-lg">
            <LucideReact.FolderCheck className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-[11px] text-violet-300">Auto-saved to <strong>Latest Edits</strong> collection</span>
            <button className="ml-auto text-[10px] text-violet-400 hover:text-violet-300 cursor-pointer underline"
              onClick={() => onAction("manage_collection", { action: "view", name: "Latest Edits" })}>View</button>
          </div>
        )}

        {/* Photo results grid — click to view full size */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {results.map(function(item, idx) {
              return (
                <div key={idx} className={"rounded-xl overflow-hidden border transition-all cursor-pointer hover:ring-1 hover:ring-violet-500/40 " +
                  (item.status === "success" ? "border-emerald-500/30" : item.status === "error" ? "border-rose-500/30" : "border-gray-700/40")}
                  onClick={function() { if (item.fullUrl || item.styledUrl) { setLightboxUrl(item.fullUrl || item.styledUrl); setLightboxName(item.name || "Photo"); } }}>
                  <div className="relative group">
                    {item.styledUrl ? (
                      <img src={item.styledUrl} alt={item.name} loading="lazy" style={{ width: "100%", height: "100px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100px" }} className="bg-gray-700/30 flex items-center justify-center">
                        <LucideReact.Image className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    {item.status === "success" && (
                      <div className="absolute top-1 right-1"><LucideReact.CheckCircle className="w-4 h-4 text-emerald-400 drop-shadow" /></div>
                    )}
                    {item.status === "error" && (
                      <div className="absolute top-1 right-1"><LucideReact.XCircle className="w-4 h-4 text-rose-400 drop-shadow" /></div>
                    )}
                    {/* Full view hint on hover */}
                    {item.styledUrl && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <LucideReact.Maximize2 className="w-5 h-5 text-white drop-shadow" />
                      </div>
                    )}
                  </div>
                  <div className="p-1.5">
                    <div className="text-[10px] text-gray-300 truncate">{item.name || "Photo"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        {data.status === "complete" && (
          <div className="flex gap-2 flex-wrap">
            {data.outputDir && (
              <Button size="sm" variant="outline" onClick={() => onAction("photobook", {
                paths: results.map(function(r) { return r.id; }),
                layout: "auto",
                title: batchStyle.replace(/_/g, " "),
                folderPath: data.collection
              })}>
                <LucideReact.BookOpen className="w-3 h-3 mr-1" /> Photo Book
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onAction("import_photos", { path: data.collection })}>
              <LucideReact.FolderOpen className="w-3 h-3 mr-1" /> Browse Folder
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Manage Collection View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCollection) {
    var action = data.action || "list";
    var collections = data.collections || [];

    if (action === "list" || action === "create" || action === "delete" || action === "rename") {
      return (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
                <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-sm font-semibold text-gray-100">Collections</span>
              <Badge variant="outline">{collections.length}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCreateMode(!createMode)}>
              <LucideReact.Plus className="w-4 h-4" />
            </Button>
          </div>

          {createMode && (
            <div className="flex gap-1.5">
              <div className="flex-1">
                <Input placeholder="Collection name..." value={collectionName} onChange={(v) => setCollectionName(v)} size="sm" />
              </div>
              <Button size="sm" variant="primary" onClick={() => { if (collectionName.trim()) { onAction("manage_collection", { action: "create", name: collectionName.trim() }); setCollectionName(""); setCreateMode(false); } }}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setCreateMode(false)}><LucideReact.X className="w-3.5 h-3.5" /></Button>
            </div>
          )}

          {data.message && (
            <div className="bg-emerald-500/10 rounded-lg px-3 py-2 border border-emerald-500/20">
              <span className="text-xs text-emerald-300">{data.message}</span>
            </div>
          )}

          {collections.length === 0 ? (
            <EmptyState icon={<LucideReact.FolderHeart className="w-8 h-8 text-gray-500" />} title="No collections yet"
              description="Create collections to organize your photos."
              action={<Button size="sm" onClick={() => setCreateMode(true)}>Create Collection</Button>} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {collections.map(function(col, i) {
                return (
                  <button key={i} onClick={() => onAction("manage_collection", { action: "view", name: col.name })}
                    className="bg-gray-800/60 rounded-xl border border-gray-700/40 overflow-hidden hover:border-violet-500/40 cursor-pointer text-left transition-all group">
                    {col.coverUrl ? (
                      <img src={col.coverUrl} alt={col.name} loading="lazy" style={{ width: "100%", height: "80px", objectFit: "cover" }} className="group-hover:opacity-90 transition-opacity" />
                    ) : (
                      <div style={{ width: "100%", height: "80px" }} className="bg-gray-700/30 flex items-center justify-center">
                        <LucideReact.Images className="w-6 h-6 text-gray-600" />
                      </div>
                    )}
                    <div className="p-2">
                      <div className="text-xs text-gray-200 truncate font-medium">{col.name}</div>
                      <div className="text-[10px] text-gray-500">{col.count || 0} photos</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    var colItems = data.items || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("manage_collection", { action: "list" })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{data.name || "Collection"}</div>
            <div className="text-[11px] text-gray-500">{colItems.length} photo{colItems.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        {colItems.length === 0 ? (
          <EmptyState icon={<LucideReact.ImageOff className="w-8 h-8" />} title="Empty collection"
            description="Import photos and add them to this collection."
            action={<Button size="sm" onClick={() => onAction("import_photos", {})}>Import Photos</Button>} />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {colItems.map(function(item, idx) {
              return (
                <button key={idx} onClick={() => onAction("preview_styles", { photoPath: item.id || item.path })}
                  className="relative group bg-gray-800/60 rounded-lg overflow-hidden border border-gray-700/40 hover:border-violet-500/40 cursor-pointer text-left transition-all">
                  {item.url ? (
                    <img src={item.url} alt={item.name} loading="lazy" style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "90px" }} className="bg-gray-700/30 flex items-center justify-center">
                      <LucideReact.Image className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="px-1.5 py-1">
                    <div className="text-[10px] text-gray-300 truncate">{item.name || "Photo"}</div>
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
  // ── Compare Versions View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isCompare) {
    var original = data.original || {};
    var versions = data.versions || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Compare Versions</div>
            <div className="text-[11px] text-gray-500">{original.name || "Photo"} · {versions.length} version{versions.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Original</div>
          <div className="rounded-xl overflow-hidden border border-gray-700/40 bg-black/30">
            {original.url ? (
              <img src={original.url} alt="Original" style={{ width: "100%", height: "180px", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "180px" }} className="flex items-center justify-center">
                <LucideReact.Image className="w-10 h-10 text-gray-600" />
              </div>
            )}
          </div>
        </div>

        {versions.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Styled Versions</div>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {versions.map(function(ver, idx) {
                return (
                  <div key={idx} className="rounded-xl overflow-hidden border border-gray-700/40 bg-gray-800/40">
                    {ver.url ? (
                      <img src={ver.url} alt={ver.style} loading="lazy" style={{ width: "100%", height: "100px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100px" }} className="flex items-center justify-center bg-gray-700/20">
                        <LucideReact.Aperture className="w-8 h-8 text-gray-500" />
                      </div>
                    )}
                    <div className="p-2">
                      <div className="text-[11px] font-medium text-gray-200">{(ver.style || "").replace(/_/g, " ")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState icon={<LucideReact.Layers className="w-8 h-8 text-gray-500" />} title="No styled versions"
            description="Apply a style to create versions you can compare."
            action={<Button size="sm" onClick={() => onAction("preview_styles", { photoPath: data.photoId })}>
              <LucideReact.Palette className="w-3.5 h-3.5 mr-1" /> Preview Styles
            </Button>} />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Photo Book View (ENHANCED) ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPhotobook) {
    var pages = data.pages || [];
    var totalPages = pages.length;
    var currentPage = pages[bookPage] || pages[0];

    var getPageLayout = function(page) {
      if (!page) return "space-y-2";
      var type = page.type;
      if (type === "contact") return "grid grid-cols-" + (page.columns || 3) + " gap-1";
      if (type === "grid") return "grid grid-cols-" + (page.columns || 2) + " gap-2";
      if (type === "editorial") return "grid grid-cols-3 gap-2";
      return "space-y-2";
    };

    var getPhotoHeight = function(page, photo, idx) {
      var type = page.type;
      if (type === "hero" && idx === 0) return "220px";
      if (type === "panoramic") return "200px";
      if (type === "minimal") return "280px";
      if (type === "title") return "260px";
      if (type === "contact") return "100px";
      if (type === "editorial" && photo.position === "large") return "200px";
      if (type === "editorial" && photo.position === "small") return "200px";
      return "140px";
    };

    var getColSpan = function(page, photo, idx) {
      if (page.type === "hero" && idx === 0 && (page.photos || []).length > 1) return "col-span-full";
      if (page.type === "panoramic") return "col-span-full";
      if (page.type === "minimal") return "col-span-full";
      if (page.type === "title") return "col-span-full";
      if (page.type === "editorial" && photo.position === "large") return "col-span-2";
      return "";
    };

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", { path: data.folderPath || "" })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
          <div className="text-center flex-1">
            <div className="text-sm font-semibold text-gray-100">{data.title || "Photo Book"}</div>
            {data.subtitle && <div className="text-[10px] text-gray-500 italic">{data.subtitle}</div>}
          </div>
          <Badge variant="secondary">{bookPage + 1}/{totalPages}</Badge>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            <LucideReact.BookOpen className="w-3 h-3 mr-1" />
            {(data.layout || "auto").replace(/_/g, " ")} · {data.totalPhotos || 0} photos
          </Badge>
          {currentPage && (
            <Badge variant="outline" className="text-[10px] text-gray-500">
              {currentPage.type}
            </Badge>
          )}
        </div>

        {currentPage && (
          <div className={getPageLayout(currentPage)}>
            {(currentPage.photos || []).map(function(photo, i) {
              return (
                <div key={i}
                  className={"relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 " + getColSpan(currentPage, photo, i)}>
                  {photo.path ? (
                    <img src={photo.path} alt={photo.caption || ""} loading="lazy"
                      style={{ width: "100%", height: getPhotoHeight(currentPage, photo, i), objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: getPhotoHeight(currentPage, photo, i) }} className="flex items-center justify-center">
                      <LucideReact.Image className="w-8 h-8 text-gray-600" />
                    </div>
                  )}
                  {photo.caption && currentPage.type !== "contact" && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-white text-[10px] italic leading-tight line-clamp-2">{photo.caption}</p>
                    </div>
                  )}
                  {photo.orientation && currentPage.type !== "contact" && (
                    <div className="absolute top-1 left-1">
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-black/50 text-gray-400 backdrop-blur-sm">
                        {photo.orientation === "landscape" ? "⬜" : photo.orientation === "portrait" ? "⬛" : "⬜"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-1">
          <Button variant="ghost" size="sm" disabled={bookPage === 0}
            onClick={() => setBookPage(function(p) { return Math.max(0, p - 1); })}>
            <LucideReact.ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex gap-1">
            {pages.slice(0, 12).map(function(_, i) {
              return (
                <button key={i}
                  className={"w-2 h-2 rounded-full transition-colors cursor-pointer " + (i === bookPage ? "bg-violet-400" : "bg-gray-600 hover:bg-gray-500")}
                  onClick={() => setBookPage(i)} />
              );
            })}
            {pages.length > 12 && <span className="text-gray-500 text-[9px]">+{pages.length - 12}</span>}
          </div>
          <Button variant="ghost" size="sm" disabled={bookPage >= totalPages - 1}
            onClick={() => setBookPage(function(p) { return Math.min(totalPages - 1, p + 1); })}>
            <LucideReact.ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Adjust View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isAdjust) {
    var adjParams = [
      { key: "brightness", label: "Brightness", icon: "Sun", min: -100, max: 100 },
      { key: "contrast", label: "Contrast", icon: "Circle", min: -100, max: 100 },
      { key: "saturation", label: "Saturation", icon: "Droplets", min: -100, max: 100 },
      { key: "temperature", label: "Temperature", icon: "Thermometer", min: -100, max: 100 },
      { key: "grain", label: "Grain", icon: "Sparkles", min: 0, max: 100 },
      { key: "vignette", label: "Vignette", icon: "Maximize", min: 0, max: 100 },
      { key: "fade", label: "Fade", icon: "Layers", min: 0, max: 100 },
    ];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Fine Tune</div>
            <div className="text-[11px] text-gray-500">{data.name || "Photo"}</div>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden border border-gray-700/40 bg-black/30">
          {data.mediaUrl ? (
            <img src={data.mediaUrl} alt={data.name} style={{ width: "100%", height: "200px", objectFit: "contain" }} />
          ) : (
            <div style={{ width: "100%", height: "200px" }} className="flex items-center justify-center">
              <LucideReact.Image className="w-10 h-10 text-gray-600" />
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          {adjParams.map(function(adj) {
            var IconComp = LucideReact[adj.icon] || LucideReact.Circle;
            var val = data.adjustments ? (data.adjustments[adj.key] || 0) : 0;
            return (
              <div key={adj.key} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400 flex items-center gap-1"><IconComp className="w-3 h-3" /> {adj.label}</span>
                  <span className="text-gray-200 font-medium">{val}</span>
                </div>
                <Progress value={((val - adj.min) / (adj.max - adj.min)) * 100} max={100} />
              </div>
            );
          })}
        </div>

        <Button size="sm" className="w-full" onClick={() => onAction("preview_styles", { photoPath: data.path })}>
          <LucideReact.Palette className="w-3.5 h-3.5 mr-1" /> Apply Style Instead
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Default / Fallback View ──
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <EmptyState
        icon={<LucideReact.Camera className="w-10 h-10 text-violet-400" />}
        title="Photo Studio"
        description="Professional photo processing with 28 styles — Film Stocks, Cinematic, Photographers, and Trending looks."
        action={<Button size="sm" variant="primary" onClick={() => onAction("import_photos", {})}>
          <LucideReact.ImagePlus className="w-3.5 h-3.5 mr-1" /> Get Started
        </Button>}
      />
    </div>
  );
}

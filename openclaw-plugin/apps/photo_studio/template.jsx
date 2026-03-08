export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (all at top level) ──
  const [selectedStyle, setSelectedStyle] = useState("norwegian_blue");
  const [intensity, setIntensity] = useState(75);
  const [collectionName, setCollectionName] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [sliderVal, setSliderVal] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // grid or list
  const [bookPage, setBookPage] = useState(0);
  const [showStylePicker, setShowStylePicker] = useState(false);

  useEffect(() => {
    if (sliderVal === null && data?.intensity) setSliderVal(data.intensity);
  }, [data?.intensity, sliderVal]);

  // ── Detect tool view ──
  const tool = data?.tool || "";
  const isImport = tool === "enso_photo_studio_import_photos";
  const isApplyStyle = tool === "enso_photo_studio_apply_style";
  const isBatchProcess = tool === "enso_photo_studio_batch_process";
  const isCollection = tool === "enso_photo_studio_manage_collection";
  const isCompare = tool === "enso_photo_studio_compare_versions";
  const isPhotobook = tool === "enso_photo_studio_photobook";
  const isAdjust = tool === "enso_photo_studio_adjust";

  // ── Helpers ──
  // Processing styles (real pixel processing)
  const processStyles = {
    norwegian_blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300", icon: "Mountain", label: "Norwegian Blue", desc: "Deep moody Nordic blue tones" },
    golden_hour: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300", icon: "Sun", label: "Golden Hour", desc: "Warm golden light" },
    film_noir: { bg: "bg-gray-600/10", border: "border-gray-500/30", text: "text-gray-200", icon: "Moon", label: "Film Noir", desc: "High contrast B&W" },
    vintage_film: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300", icon: "Camera", label: "Vintage Film", desc: "Cross-processed faded look" },
    teal_orange: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-300", icon: "Film", label: "Teal & Orange", desc: "Hollywood cinematic split-tone" },
    moody_desaturated: { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-300", icon: "CloudRain", label: "Moody", desc: "Muted desaturated tones" },
    high_contrast_bw: { bg: "bg-gray-500/10", border: "border-gray-400/30", text: "text-gray-300", icon: "Contrast", label: "B&W Contrast", desc: "Classic high-contrast B&W" },
    warm_fade: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300", icon: "Sunset", label: "Warm Fade", desc: "Warm pastels, lifted blacks" },
  };
  const processStyleKeys = Object.keys(processStyles);

  // Legacy style colors (for apply_style views)
  const styleColors = {
    ...processStyles,
    wong_kar_wai: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300", icon: "Film" },
    wes_anderson: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-300", icon: "Palette" },
    terrence_malick: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-300", icon: "Sun" },
    cyberpunk: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-300", icon: "Zap" },
    studio_ghibli: { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-300", icon: "Cloud" },
    vintage_kodachrome: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300", icon: "Camera" },
    watercolor: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300", icon: "Droplets" },
    oil_painting: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300", icon: "Brush" },
    sketch: { bg: "bg-gray-500/10", border: "border-gray-400/30", text: "text-gray-300", icon: "Pencil" },
    pop_art: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-300", icon: "Zap" },
    vintage: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300", icon: "Clock" },
    noir: { bg: "bg-gray-600/10", border: "border-gray-500/30", text: "text-gray-200", icon: "Moon" },
    impressionist: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-300", icon: "Palette" },
    anime: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300", icon: "Sparkles" },
    moriyama_daido: { bg: "bg-gray-600/10", border: "border-gray-500/30", text: "text-gray-200", icon: "Camera" },
  };
  const allStyles = Object.keys(styleColors);
  const getStyleInfo = (s) => styleColors[s] || styleColors.watercolor;
  const getIcon = (name) => {
    var I = LucideReact[name];
    return I ? I : LucideReact.Paintbrush;
  };

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
  // ── Import / Browse Photos View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isImport) {
    var currentPath = data.path || "";
    var parentPath = data.parentPath || "";
    var directories = data.directories || [];
    var items = data.items || [];
    var isRoot = !currentPath || currentPath === "/";
    var folderName = isRoot ? "Select a Folder" : currentPath.split("/").filter(Boolean).pop() || currentPath;
    var formatSize = function(bytes) {
      if (!bytes) return "";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(1) + " MB";
    };

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
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

        {/* Breadcrumb navigation */}
        {!isRoot && (
          <div className="flex items-center gap-1 text-[11px] overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
            <button
              onClick={() => onAction("import_photos", {})}
              className="text-violet-400 hover:text-violet-300 cursor-pointer shrink-0">
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
                    <button
                      onClick={() => onAction("import_photos", { path: segPath })}
                      className="text-violet-400 hover:text-violet-300 cursor-pointer truncate max-w-[100px]">
                      {seg}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Up button + folder info */}
        {!isRoot && parentPath && (
          <button
            onClick={() => onAction("import_photos", { path: parentPath })}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30 hover:border-gray-600/50 hover:bg-gray-800/60 cursor-pointer transition-all text-left">
            <LucideReact.ArrowUp className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-400">Up to parent</span>
          </button>
        )}

        {/* Directories */}
        {directories.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
              {isRoot ? "Locations" : "Folders"}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {directories.map(function(dir, idx) {
                return (
                  <button key={idx}
                    onClick={() => onAction("import_photos", { path: dir.path })}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30 hover:border-violet-500/30 hover:bg-gray-800/60 cursor-pointer transition-all text-left group">
                    {isRoot ? (
                      <LucideReact.HardDrive className="w-4 h-4 text-violet-400 shrink-0" />
                    ) : (
                      <LucideReact.Folder className="w-4 h-4 text-amber-400 shrink-0 group-hover:text-amber-300" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 truncate">{dir.name}</div>
                      {dir.itemCount > 0 && (
                        <div className="text-[10px] text-gray-500">{dir.itemCount} image{dir.itemCount !== 1 ? "s" : ""}</div>
                      )}
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
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                {items.length} photo{items.length !== 1 ? "s" : ""}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setViewMode("grid")}
                  className={"p-1 rounded cursor-pointer " + (viewMode === "grid" ? "text-violet-400 bg-violet-500/10" : "text-gray-500 hover:text-gray-300")}>
                  <LucideReact.LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setViewMode("list")}
                  className={"p-1 rounded cursor-pointer " + (viewMode === "list" ? "text-violet-400 bg-violet-500/10" : "text-gray-500 hover:text-gray-300")}>
                  <LucideReact.List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {viewMode === "grid" ? (
              <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {items.map(function(item, idx) {
                  return (
                    <div key={idx} className="relative group bg-gray-800/60 rounded-xl overflow-hidden border border-gray-700/40 hover:border-violet-500/40 transition-all">
                      {item.mediaUrl ? (
                        <img src={item.mediaUrl} alt={item.name} loading="lazy"
                          style={{ width: "100%", height: "100px", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100px" }} className="bg-gray-700/30 flex items-center justify-center">
                          <LucideReact.Image className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                      <div className="p-1.5">
                        <div className="text-[10px] text-gray-300 truncate">{item.name}</div>
                        <div className="text-[9px] text-gray-500">{formatSize(item.size)}</div>
                      </div>
                      {/* Hover action */}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onAction("apply_style", { photoId: item.path, style: "watercolor", intensity: 75 })}
                          className="p-1 rounded-md bg-black/60 text-violet-300 hover:text-violet-200 cursor-pointer backdrop-blur-sm">
                          <LucideReact.Paintbrush className="w-3 h-3" />
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
                        <img src={item.mediaUrl} alt={item.name} loading="lazy"
                          className="rounded-md shrink-0"
                          style={{ width: "40px", height: "40px", objectFit: "cover" }} />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-gray-700/30 flex items-center justify-center shrink-0">
                          <LucideReact.Image className="w-4 h-4 text-gray-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-200 truncate">{item.name}</div>
                        <div className="text-[10px] text-gray-500">{formatSize(item.size)} · {item.ext}</div>
                      </div>
                      <button onClick={() => onAction("apply_style", { photoId: item.path, style: "watercolor", intensity: 75 })}
                        className="p-1.5 rounded-lg bg-gray-700/40 hover:bg-violet-500/20 cursor-pointer transition-all opacity-0 group-hover:opacity-100">
                        <LucideReact.Paintbrush className="w-3.5 h-3.5 text-violet-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions bar when items exist */}
        {items.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-gray-800/40">
            <div className="flex gap-2">
              <Button size="sm" variant="outline"
                onClick={() => onAction("photobook", {
                  paths: items.map(function(it) { return it.path; }),
                  layout: "magazine",
                  title: folderName || "Photo Book",
                  folderPath: currentPath
                })}>
                <LucideReact.BookOpen className="w-3 h-3 mr-1" /> Photo Book
              </Button>
              <Button size="sm" variant={showStylePicker ? "primary" : "outline"}
                onClick={() => setShowStylePicker(!showStylePicker)}>
                <LucideReact.Wand2 className="w-3 h-3 mr-1" /> Process Photos
              </Button>
            </div>

            {/* Inline style picker */}
            {showStylePicker && (
              <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/40 space-y-3">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Choose a Style</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {processStyleKeys.map(function(s) {
                    var info = processStyles[s];
                    var Icon = LucideReact[info.icon] || LucideReact.Paintbrush;
                    var isSelected = selectedStyle === s;
                    return (
                      <button key={s}
                        onClick={() => setSelectedStyle(s)}
                        className={"flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-all text-left " +
                          (isSelected ? info.bg + " " + info.border + " " + info.text : "bg-gray-800/40 border-gray-700/40 text-gray-400 hover:border-gray-600")}>
                        <Icon className="w-4 h-4 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium truncate">{info.label}</div>
                          <div className={"text-[9px] truncate " + (isSelected ? "opacity-70" : "text-gray-500")}>{info.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Button size="sm" variant="primary"
                    onClick={() => {
                      setShowStylePicker(false);
                      onAction("batch_process", {
                        collection: currentPath,
                        style: selectedStyle,
                        intensity: intensity
                      });
                    }}>
                    <LucideReact.Play className="w-3 h-3 mr-1" /> Process {items.length} Photo{items.length !== 1 ? "s" : ""}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowStylePicker(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state — no items and no directories */}
        {items.length === 0 && directories.length === 0 && !isRoot && (
          <EmptyState
            icon={<LucideReact.ImageOff className="w-8 h-8 text-gray-500" />}
            title="No images found"
            description="This folder doesn't contain any images. Try navigating to a different folder."
            action={<Button size="sm" onClick={() => onAction("import_photos", { path: parentPath })}>
              <LucideReact.ArrowUp className="w-3.5 h-3.5 mr-1" /> Go Back
            </Button>}
          />
        )}

        {/* Root empty state */}
        {isRoot && directories.length === 0 && (
          <EmptyState
            icon={<LucideReact.HardDrive className="w-8 h-8 text-gray-500" />}
            title="No drives found"
            description="Could not list drives on this machine."
          />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Apply Style View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isApplyStyle) {
    var photo = data.photo || {};
    var result = data.result || {};
    var style = data.style || "watercolor";
    var si = getStyleInfo(style);
    var StyleIcon = getIcon(si.icon);
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Style Applied</div>
            <div className="text-[11px] text-gray-500">{photo.name || "Photo"}</div>
          </div>
          <Badge variant="info" className={si.bg + " " + si.text + " " + si.border}>
            <StyleIcon className="w-3 h-3 mr-1" />{style.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Before / After */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Original</div>
            <div className="rounded-xl overflow-hidden border border-gray-700/40 bg-black/30">
              {photo.url ? (
                <img src={photo.url} alt="Original" style={{ width: "100%", height: "160px", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "160px" }} className="flex items-center justify-center">
                  <LucideReact.Image className="w-8 h-8 text-gray-600" />
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Styled</div>
            <div className={"rounded-xl overflow-hidden border " + si.border + " bg-black/30"}>
              {result.url ? (
                <img src={result.url} alt="Styled" style={{ width: "100%", height: "160px", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "160px" }} className={"flex items-center justify-center " + si.bg}>
                  <StyleIcon className={"w-8 h-8 " + si.text} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Intensity */}
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Intensity</span>
            <span className="text-xs text-gray-200 font-medium">{data.intensity || 75}%</span>
          </div>
          <Progress value={data.intensity || 75} max={100} />
        </div>

        {/* Re-style controls */}
        <div className="space-y-2">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Try Another Style</div>
          <div className="flex flex-wrap gap-1.5">
            {allStyles.map((s) => {
              var info = getStyleInfo(s);
              var Icon = getIcon(info.icon);
              return (
                <button key={s}
                  onClick={() => onAction("apply_style", { photoId: photo.id, style: s, intensity: data.intensity || 75 })}
                  className={"flex items-center gap-1 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all text-[11px] " +
                    (s === style ? info.bg + " " + info.border + " " + info.text : "bg-gray-800/40 border-gray-700/40 text-gray-400 hover:border-gray-600")}>
                  <Icon className="w-3 h-3" />
                  {s.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onAction("compare_versions", { photoId: photo.id })}>
            <LucideReact.Columns className="w-3.5 h-3.5 mr-1" /> Compare All
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
    var style = data.style || "watercolor";
    var si = getStyleInfo(style);
    var StyleIcon = getIcon(si.icon);
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Batch Processing</div>
            <div className="text-[11px] text-gray-500">{completed}/{total} photos completed</div>
          </div>
          <Badge variant="info" className={si.bg + " " + si.text}>
            <StyleIcon className="w-3 h-3 mr-1" />{style.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Progress */}
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Progress</span>
            <span className="text-gray-200 font-medium">{total > 0 ? Math.round((completed / total) * 100) : 0}%</span>
          </div>
          <Progress value={completed} max={total} />
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Intensity: {data.intensity || 75}%</span>
            <span>{data.status === "complete" ? "Done" : "Processing..."}</span>
          </div>
        </div>

        {/* Results grid */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {results.map((item, idx) => (
              <div key={idx} className={"rounded-xl overflow-hidden border transition-all " +
                (item.status === "success" ? "border-emerald-500/30" : item.status === "error" ? "border-rose-500/30" : "border-gray-700/40")}>
                <div className="relative">
                  {item.styledUrl ? (
                    <img src={item.styledUrl} alt={item.name} loading="lazy"
                      style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                  ) : item.originalUrl ? (
                    <div className="relative">
                      <img src={item.originalUrl} alt={item.name} loading="lazy"
                        style={{ width: "100%", height: "90px", objectFit: "cover", opacity: 0.5 }} />
                      {item.status === "processing" && (
                        <div style={{ position: "absolute", inset: 0 }} className="flex items-center justify-center bg-black/40">
                          <LucideReact.Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: "90px" }} className="bg-gray-700/30 flex items-center justify-center">
                      <LucideReact.Image className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  {item.status === "success" && (
                    <div className="absolute top-1 right-1">
                      <LucideReact.CheckCircle className="w-4 h-4 text-emerald-400 drop-shadow" />
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute top-1 right-1">
                      <LucideReact.XCircle className="w-4 h-4 text-rose-400 drop-shadow" />
                    </div>
                  )}
                </div>
                <div className="p-1.5">
                  <div className="text-[10px] text-gray-300 truncate">{item.name || "Photo"}</div>
                </div>
              </div>
            ))}
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

    // List view
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
                <Input placeholder="Collection name..." value={collectionName}
                  onChange={(v) => setCollectionName(v)} size="sm" />
              </div>
              <Button size="sm" variant="primary"
                onClick={() => {
                  if (collectionName.trim()) {
                    onAction("manage_collection", { action: "create", name: collectionName.trim() });
                    setCollectionName("");
                    setCreateMode(false);
                  }
                }}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setCreateMode(false)}>
                <LucideReact.X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {data.message && (
            <div className="bg-emerald-500/10 rounded-lg px-3 py-2 border border-emerald-500/20">
              <span className="text-xs text-emerald-300">{data.message}</span>
            </div>
          )}

          {collections.length === 0 ? (
            <EmptyState
              icon={<LucideReact.FolderHeart className="w-8 h-8 text-gray-500" />}
              title="No collections yet"
              description="Create collections to organize your original and styled photos."
              action={<Button size="sm" onClick={() => setCreateMode(true)}>Create Collection</Button>}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {collections.map((col, i) => (
                <button key={i} onClick={() => onAction("manage_collection", { action: "view", name: col.name })}
                  className="bg-gray-800/60 rounded-xl border border-gray-700/40 overflow-hidden hover:border-violet-500/40 cursor-pointer text-left transition-all group">
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
                    <div className="text-[10px] text-gray-500">{col.count || 0} photos</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // View single collection
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
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => onAction("batch_process", { collection: data.name, style: "watercolor", intensity: 75 })}>
              <LucideReact.Paintbrush className="w-3.5 h-3.5" />
            </Button>
            <Button variant="danger" size="sm" onClick={() => onAction("manage_collection", { action: "delete", name: data.name })}>
              <LucideReact.Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {colItems.length === 0 ? (
          <EmptyState
            icon={<LucideReact.ImageOff className="w-8 h-8" />}
            title="Empty collection"
            description="Import photos and add them to this collection."
            action={<Button size="sm" onClick={() => onAction("import_photos", {})}>Import Photos</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {colItems.map((item, idx) => (
              <button key={idx} onClick={() => onAction("apply_style", { photoId: item.id, style: "watercolor", intensity: 75 })}
                className="relative group bg-gray-800/60 rounded-lg overflow-hidden border border-gray-700/40 hover:border-violet-500/40 cursor-pointer text-left transition-all">
                {item.url ? (
                  <img src={item.url} alt={item.name} loading="lazy"
                    style={{ width: "100%", height: "90px", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "90px" }} className="bg-gray-700/30 flex items-center justify-center">
                    <LucideReact.Image className="w-5 h-5 text-gray-500" />
                  </div>
                )}
                <div className="px-1.5 py-1">
                  <div className="text-[10px] text-gray-300 truncate">{item.name || "Photo"}</div>
                </div>
              </button>
            ))}
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
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("import_photos", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Compare Versions</div>
            <div className="text-[11px] text-gray-500">{original.name || "Photo"} · {versions.length} version{versions.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Original */}
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

        {/* Styled versions */}
        {versions.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Styled Versions</div>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {versions.map((ver, idx) => {
                var vsi = getStyleInfo(ver.style);
                var VIcon = getIcon(vsi.icon);
                return (
                  <div key={idx} className={"rounded-xl overflow-hidden border " + vsi.border + " bg-gray-800/40"}>
                    {ver.url ? (
                      <img src={ver.url} alt={ver.style} loading="lazy"
                        style={{ width: "100%", height: "100px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100px" }} className={"flex items-center justify-center " + vsi.bg}>
                        <VIcon className={"w-8 h-8 " + vsi.text} />
                      </div>
                    )}
                    <div className="p-2 flex items-center justify-between">
                      <div>
                        <div className={"text-[11px] font-medium " + vsi.text}>{(ver.style || "").replace(/_/g, " ")}</div>
                        <div className="text-[9px] text-gray-500">{ver.intensity || 75}% intensity</div>
                      </div>
                      <button onClick={() => onAction("apply_style", { photoId: data.photoId, style: ver.style, intensity: ver.intensity || 75 })}
                        className="p-1.5 rounded-lg bg-gray-700/40 hover:bg-gray-600/40 cursor-pointer transition-all">
                        <LucideReact.RefreshCw className={"w-3 h-3 " + vsi.text} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<LucideReact.Layers className="w-8 h-8 text-gray-500" />}
            title="No styled versions"
            description="Apply a style to create versions you can compare."
            action={<Button size="sm" onClick={() => onAction("apply_style", { photoId: data.photoId, style: "watercolor", intensity: 75 })}>
              <LucideReact.Paintbrush className="w-3.5 h-3.5 mr-1" /> Apply Style
            </Button>}
          />
        )}

        {/* Quick style buttons */}
        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Quick Apply</div>
          <div className="flex flex-wrap gap-1.5">
            {allStyles.map((s) => {
              var info = getStyleInfo(s);
              var Icon = getIcon(info.icon);
              var already = versions.some((v) => v.style === s);
              return (
                <button key={s}
                  onClick={() => onAction("apply_style", { photoId: data.photoId, style: s, intensity: 75 })}
                  className={"flex items-center gap-1 px-2 py-1 rounded-lg border cursor-pointer transition-all text-[10px] " +
                    (already ? info.bg + " " + info.border + " " + info.text + " opacity-60" : "bg-gray-800/40 border-gray-700/40 text-gray-400 hover:border-gray-600")}>
                  <Icon className="w-2.5 h-2.5" />
                  {s.replace(/_/g, " ")}
                  {already && <LucideReact.Check className="w-2.5 h-2.5" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Photo Book View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPhotobook) {
    var pages = data.pages || [];
    var totalPages = pages.length;
    var currentPage = pages[bookPage] || pages[0];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {/* Book header */}
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

        {/* Layout badge */}
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            <LucideReact.BookOpen className="w-3 h-3 mr-1" />
            {(data.layout || "magazine").replace(/_/g, " ")} · {data.totalPhotos || 0} photos
          </Badge>
        </div>

        {/* Page content */}
        {currentPage && (
          <div className={
            currentPage.type === "hero"
              ? "space-y-2"
              : currentPage.type === "contact"
              ? "grid grid-cols-3 gap-1"
              : "grid grid-cols-2 gap-2"
          }>
            {(currentPage.photos || []).map(function(photo, i) {
              return (
                <div
                  key={i}
                  className={"relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 " +
                    (currentPage.type === "hero" && i === 0 ? "col-span-full" : "")}
                >
                  {photo.path ? (
                    <img
                      src={photo.path}
                      alt={photo.caption || ""}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: currentPage.type === "hero" && i === 0 ? "220px" : currentPage.type === "contact" ? "100px" : "140px",
                        objectFit: "cover"
                      }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "140px" }} className="flex items-center justify-center">
                      <LucideReact.Image className="w-8 h-8 text-gray-600" />
                    </div>
                  )}
                  {photo.caption && currentPage.type !== "contact" && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-white text-[10px] italic leading-tight line-clamp-2">{photo.caption}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center justify-center gap-3 pt-1">
          <Button
            variant="ghost" size="sm"
            disabled={bookPage === 0}
            onClick={() => setBookPage(function(p) { return Math.max(0, p - 1); })}
          >
            <LucideReact.ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex gap-1">
            {pages.slice(0, 12).map(function(_, i) {
              return (
                <button
                  key={i}
                  className={"w-2 h-2 rounded-full transition-colors cursor-pointer " +
                    (i === bookPage ? "bg-violet-400" : "bg-gray-600 hover:bg-gray-500")}
                  onClick={() => setBookPage(i)}
                />
              );
            })}
            {pages.length > 12 && <span className="text-gray-500 text-[9px]">+{pages.length - 12}</span>}
          </div>

          <Button
            variant="ghost" size="sm"
            disabled={bookPage >= totalPages - 1}
            onClick={() => setBookPage(function(p) { return Math.min(totalPages - 1, p + 1); })}
          >
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

        {/* Photo preview */}
        <div className="rounded-xl overflow-hidden border border-gray-700/40 bg-black/30">
          {data.mediaUrl ? (
            <img src={data.mediaUrl} alt={data.name} style={{ width: "100%", height: "200px", objectFit: "contain" }} />
          ) : (
            <div style={{ width: "100%", height: "200px" }} className="flex items-center justify-center">
              <LucideReact.Image className="w-10 h-10 text-gray-600" />
            </div>
          )}
        </div>

        {data.description && (
          <div className="bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-700/30">
            <span className="text-[11px] text-gray-300 italic">{data.description}</span>
          </div>
        )}

        {/* Adjustment sliders */}
        <div className="space-y-2.5">
          {adjParams.map(function(adj) {
            var IconComp = LucideReact[adj.icon] || LucideReact.Circle;
            var val = data.adjustments ? (data.adjustments[adj.key] || 0) : 0;
            return (
              <div key={adj.key} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400 flex items-center gap-1">
                    <IconComp className="w-3 h-3" /> {adj.label}
                  </span>
                  <span className="text-gray-200 font-medium">{val}</span>
                </div>
                <Progress value={((val - adj.min) / (adj.max - adj.min)) * 100} max={100} />
              </div>
            );
          })}
        </div>

        <Button size="sm" className="w-full" onClick={() => onAction("apply_style", { photoId: data.path, style: "watercolor", intensity: 75 })}>
          <LucideReact.Paintbrush className="w-3.5 h-3.5 mr-1" /> Apply Style Instead
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
        description="Import photos, apply artistic styles, and organize your creative work."
        action={<Button size="sm" variant="primary" onClick={() => onAction("import_photos", {})}>
          <LucideReact.ImagePlus className="w-3.5 h-3.5 mr-1" /> Get Started
        </Button>}
      />
    </div>
  );
}
export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (all at top level) ──
  const [urls, setUrls] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("watercolor");
  const [intensity, setIntensity] = useState(75);
  const [collectionName, setCollectionName] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [sliderVal, setSliderVal] = useState(null);

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

  // ── Helpers ──
  const styleColors = {
    watercolor: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300", icon: "Droplets" },
    oil_painting: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300", icon: "Brush" },
    sketch: { bg: "bg-gray-500/10", border: "border-gray-400/30", text: "text-gray-300", icon: "Pencil" },
    pop_art: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-300", icon: "Zap" },
    vintage: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300", icon: "Clock" },
    noir: { bg: "bg-gray-600/10", border: "border-gray-500/30", text: "text-gray-200", icon: "Moon" },
    impressionist: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-300", icon: "Palette" },
    anime: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300", icon: "Sparkles" },
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
  // ── Import Photos View ──
  // ════════════════════════════════════════════════════════════════════════
  if (isImport) {
    var photos = data.photos || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <LucideReact.ImagePlus className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-100">Photo Studio</div>
              <div className="text-[11px] text-gray-500">{photos.length} photo{photos.length !== 1 ? "s" : ""} imported</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onAction("manage_collection", { action: "list" })}>
            <LucideReact.FolderOpen className="w-3.5 h-3.5 mr-1" /> Collections
          </Button>
        </div>

        {/* Import form */}
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40 space-y-2">
          <div className="text-xs text-gray-400 font-medium">Import by URL(s)</div>
          <Input
            placeholder="Paste image URLs (one per line or comma-separated)..."
            value={urls}
            onChange={(v) => setUrls(v)}
            icon={<LucideReact.Link className="w-3.5 h-3.5" />}
            size="sm"
          />
          <Button size="sm" variant="primary"
            onClick={() => {
              if (urls.trim()) {
                onAction("import_photos", { urls: urls.trim() });
                setUrls("");
              }
            }}>
            <LucideReact.Upload className="w-3.5 h-3.5 mr-1" /> Import
          </Button>
        </div>

        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Imported Photos</div>
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {photos.map((photo, idx) => (
                <div key={idx} className="relative group bg-gray-800/60 rounded-xl overflow-hidden border border-gray-700/40 hover:border-violet-500/40 transition-all">
                  {photo.url ? (
                    <img src={photo.url} alt={photo.name || "Photo"} loading="lazy"
                      style={{ width: "100%", height: "100px", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100px" }} className="bg-gray-700/30 flex items-center justify-center">
                      <LucideReact.Image className="w-6 h-6 text-gray-500" />
                    </div>
                  )}
                  <div className="p-1.5 space-y-1">
                    <div className="text-[10px] text-gray-300 truncate">{photo.name || "Untitled"}</div>
                    {photo.dimensions && (
                      <div className="text-[9px] text-gray-500">{photo.dimensions}</div>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onAction("apply_style", { photoId: photo.id, style: "watercolor", intensity: 75 })}
                      className="p-1 rounded-md bg-black/60 text-violet-300 hover:text-violet-200 cursor-pointer backdrop-blur-sm">
                      <LucideReact.Paintbrush className="w-3 h-3" />
                    </button>
                    <button onClick={() => onAction("compare_versions", { photoId: photo.id })}
                      className="p-1 rounded-md bg-black/60 text-blue-300 hover:text-blue-200 cursor-pointer backdrop-blur-sm">
                      <LucideReact.Columns className="w-3 h-3" />
                    </button>
                  </div>
                  {photo.styledVersions > 0 && (
                    <div className="absolute bottom-8 left-1.5">
                      <Badge variant="info" className="text-[8px]">{photo.styledVersions} style{photo.styledVersions !== 1 ? "s" : ""}</Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {photos.length === 0 && (
          <EmptyState
            icon={<LucideReact.Camera className="w-8 h-8 text-gray-500" />}
            title="No photos yet"
            description="Import photos by URL to get started with artistic styling."
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
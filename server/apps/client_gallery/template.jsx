export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  const fmtDate = (ts) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch(e) { return ""; }
  };
  const fmtTime = (ts) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch(e) { return ""; }
  };
  const timeAgo = (ts) => {
    if (!ts) return "";
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    return days + "d ago";
  };

  // ── State ──
  const [editingCaption, setEditingCaption] = useState(null);
  const [captionText, setCaptionText] = useState("");
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const [captionStyle, setCaptionStyle] = useState("elegant");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCover, setNewCover] = useState("");

  const tool = data?.tool || "";

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Something went wrong"
          description={data.error}
          action={<Button size="sm" onClick={() => onAction("create_gallery", {})}>Back to Galleries</Button>}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── GALLERY LIST VIEW (create_gallery) ──
  // ════════════════════════════════════════════════════════════════════════
  if (tool === "enso_client_gallery_create_gallery") {
    const galleries = data.galleries || [];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-gray-100 flex items-center gap-2">
              <LucideReact.Images className="w-5 h-5 text-violet-400" />
              Client Galleries
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{galleries.length} {galleries.length === 1 ? "gallery" : "galleries"}</div>
          </div>
          <Button size="sm" variant="primary" onClick={() => setShowCreate(!showCreate)}>
            <LucideReact.Plus className="w-3.5 h-3.5 mr-1" />
            New Gallery
          </Button>
        </div>

        {/* Success message */}
        {data.message && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
            <LucideReact.CheckCircle className="w-3.5 h-3.5" />
            {data.message}
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-3 space-y-2.5">
            <div className="text-xs text-gray-400 font-medium">Create New Gallery</div>
            <Input placeholder="Gallery name (e.g. 'Wedding — Sarah & James')" value={newName}
              onChange={(v) => setNewName(v)} size="sm" />
            <Input placeholder="Client name" value={newClient}
              onChange={(v) => setNewClient(v)} size="sm" />
            <Input placeholder="Event/theme description (for AI captions)" value={newDesc}
              onChange={(v) => setNewDesc(v)} size="sm" />
            <Input placeholder="Cover photo URL (optional)" value={newCover}
              onChange={(v) => setNewCover(v)} size="sm" />
            <div className="flex gap-2">
              <Button size="sm" variant="primary"
                onClick={() => {
                  if (newName.trim() && newClient.trim()) {
                    var p = { name: newName.trim(), clientName: newClient.trim() };
                    if (newDesc.trim()) p.description = newDesc.trim();
                    if (newCover.trim()) p.coverPhotoUrl = newCover.trim();
                    onAction("create_gallery", p);
                    setShowCreate(false);
                    setNewName(""); setNewClient(""); setNewDesc(""); setNewCover("");
                  }
                }}>
                Create Gallery
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Gallery cards */}
        {galleries.length === 0 ? (
          <EmptyState
            icon={<LucideReact.Images className="w-8 h-8 text-gray-600" />}
            title="No galleries yet"
            description="Create your first client gallery to get started."
            action={<Button size="sm" onClick={() => setShowCreate(true)}>Create Gallery</Button>}
          />
        ) : (
          <div className="space-y-2">
            {galleries.map((g, i) => (
              <button key={g.id || i}
                onClick={() => onAction("add_photos", { galleryId: g.id, photos: [] })}
                className="w-full flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/40 hover:border-violet-500/40 cursor-pointer text-left transition-all">
                {/* Cover thumbnail */}
                {g.coverPhotoUrl ? (
                  <img src={g.coverPhotoUrl} alt={g.name}
                    style={{ width: "56px", height: "56px", borderRadius: "10px", objectFit: "cover" }}
                    className="shrink-0" />
                ) : (
                  <div style={{ width: "56px", height: "56px", borderRadius: "10px" }}
                    className="bg-gray-700/40 flex items-center justify-center shrink-0">
                    <LucideReact.Image className="w-5 h-5 text-gray-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-100 truncate">{g.name}</div>
                  <div className="text-xs text-gray-400 truncate">{g.clientName}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={g.status === "published" ? "success" : "outline"}>
                      {g.status || "draft"}
                    </Badge>
                    <span className="text-[10px] text-gray-500">
                      {g.photoCount || 0} photos
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {g.totalDownloads || 0} downloads
                    </span>
                  </div>
                </div>
                <LucideReact.ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── GALLERY EDITOR VIEW (add_photos / edit_caption / generate_captions) ──
  // ════════════════════════════════════════════════════════════════════════
  if (tool === "enso_client_gallery_add_photos" ||
      tool === "enso_client_gallery_edit_caption" ||
      tool === "enso_client_gallery_generate_captions") {
    const photos = data.photos || [];
    const galleryId = data.galleryId || "";
    const galleryName = data.galleryName || "Gallery";
    const isCaption = tool === "enso_client_gallery_generate_captions";

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("create_gallery", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">{galleryName}</div>
            <div className="text-[11px] text-gray-500">{data.total || photos.length} photos</div>
          </div>
        </div>

        {/* Success message */}
        {data.message && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
            <LucideReact.CheckCircle className="w-3.5 h-3.5" />
            {data.message}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => onAction("get_gallery_page", { galleryId: galleryId })}>
            <LucideReact.Eye className="w-3.5 h-3.5 mr-1" /> Preview
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction("get_download_stats", { galleryId: galleryId })}>
            <LucideReact.BarChart3 className="w-3.5 h-3.5 mr-1" /> Analytics
          </Button>
          <div className="flex-1" />
          <Select size="sm" value={captionStyle} options={[
            { value: "elegant", label: "Elegant" },
            { value: "storytelling", label: "Storytelling" },
            { value: "minimal", label: "Minimal" },
            { value: "descriptive", label: "Descriptive" },
          ]} onChange={(v) => setCaptionStyle(v)} />
          <Button size="sm" variant="primary"
            onClick={() => onAction("generate_captions", { galleryId: galleryId, style: captionStyle })}>
            <LucideReact.Sparkles className="w-3.5 h-3.5 mr-1" /> Generate Captions
          </Button>
        </div>

        {/* Caption generation stats */}
        {isCaption && data.generated !== undefined && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-emerald-400">
              <LucideReact.CheckCircle className="w-3 h-3" />
              {data.generated} generated
            </div>
            {data.skipped > 0 && (
              <div className="flex items-center gap-1 text-gray-500">
                <LucideReact.SkipForward className="w-3 h-3" />
                {data.skipped} skipped
              </div>
            )}
            <Badge variant="info">{data.style || "elegant"}</Badge>
          </div>
        )}

        {/* Photo grid with captions */}
        {photos.length === 0 ? (
          <EmptyState
            icon={<LucideReact.ImagePlus className="w-8 h-8 text-gray-600" />}
            title="No photos yet"
            description="Add photos to this gallery to get started."
          />
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {photos.map((photo, idx) => (
              <div key={photo.id || idx}
                className="flex gap-3 p-2.5 bg-gray-800/50 rounded-xl border border-gray-700/30 hover:border-gray-600/50 transition-all">
                {/* Thumbnail */}
                <button onClick={() => setLightboxIdx(idx)}
                  className="shrink-0 cursor-pointer rounded-lg overflow-hidden" style={{ width: "80px", height: "80px" }}>
                  <img src={photo.url} alt={photo.filename}
                    style={{ width: "80px", height: "80px", objectFit: "cover" }}
                    onError={(e) => { e.target.style.display = "none"; }} />
                </button>
                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-200 truncate">{photo.filename}</span>
                    {photo.captionGenerated && !photo.captionEditedByUser && (
                      <Badge variant="info">AI</Badge>
                    )}
                    {photo.captionEditedByUser && (
                      <Badge variant="outline">Edited</Badge>
                    )}
                  </div>
                  {/* Caption display / edit */}
                  {editingCaption === photo.id ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={captionText}
                        onChange={(e) => setCaptionText(e.target.value)}
                        className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 resize-none focus:outline-none focus:border-violet-500/50"
                        rows={2}
                        placeholder="Enter caption..."
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="primary"
                          onClick={() => {
                            if (captionText.trim()) {
                              onAction("edit_caption", { galleryId: galleryId, photoId: photo.id, caption: captionText.trim() });
                            }
                            setEditingCaption(null);
                          }}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCaption(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {photo.caption ? (
                        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{photo.caption}</p>
                      ) : (
                        <p className="text-[11px] text-gray-600 italic">No caption yet</p>
                      )}
                    </div>
                  )}
                  {/* Photo actions */}
                  {editingCaption !== photo.id && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingCaption(photo.id); setCaptionText(photo.caption || ""); }}
                        className="text-[10px] text-gray-500 hover:text-violet-400 cursor-pointer transition-colors flex items-center gap-0.5">
                        <LucideReact.Pencil className="w-2.5 h-2.5" /> Edit
                      </button>
                      <span className="text-gray-700">|</span>
                      <button
                        onClick={() => onAction("generate_captions", { galleryId: galleryId, style: captionStyle, regenerateAll: true })}
                        className="text-[10px] text-gray-500 hover:text-blue-400 cursor-pointer transition-colors flex items-center gap-0.5">
                        <LucideReact.RefreshCw className="w-2.5 h-2.5" /> Regen All
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lightbox */}
        {lightboxIdx >= 0 && lightboxIdx < photos.length && (() => {
          const photo = photos[lightboxIdx];
          return (
            <div
              onClick={() => setLightboxIdx(-1)}
              style={{
                position: "fixed", inset: 0, zIndex: 200,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.95)",
              }}>
              <button onClick={() => setLightboxIdx(-1)}
                style={{ position: "absolute", top: 12, right: 16, zIndex: 210 }}
                className="text-white/60 hover:text-white cursor-pointer p-2.5 rounded-lg hover:bg-white/10 transition-all">
                <LucideReact.X className="w-5 h-5" />
              </button>
              <div style={{ position: "absolute", top: 16, left: 16, zIndex: 210 }}
                className="text-white/40 text-xs font-medium">
                {lightboxIdx + 1} / {photos.length}
              </div>
              {lightboxIdx > 0 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                  style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                  className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                  <LucideReact.ChevronLeft className="w-6 h-6" />
                </button>
              )}
              <img src={photo.url} alt={photo.filename}
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "92vw", maxHeight: "75vh", objectFit: "contain", borderRadius: "4px" }} />
              {lightboxIdx < photos.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                  className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                  <LucideReact.ChevronRight className="w-6 h-6" />
                </button>
              )}
              {photo.caption && (
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 24px",
                  background: "linear-gradient(transparent, rgba(0,0,0,0.85))", zIndex: 210 }}>
                  <div className="text-sm text-white/90 font-medium mb-1">{photo.filename}</div>
                  <div className="text-xs text-white/60 leading-relaxed">{photo.caption}</div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── PREVIEW VIEW (get_gallery_page) ──
  // ════════════════════════════════════════════════════════════════════════
  if (tool === "enso_client_gallery_get_gallery_page") {
    const photos = data.photos || [];
    const galleryId = data.galleryId || "";

    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {/* Preview banner */}
        <div className="bg-violet-500/10 border-b border-violet-500/20 px-4 py-2 flex items-center gap-2">
          <LucideReact.Eye className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs text-violet-300 font-medium">Client Gallery Preview</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => onAction("add_photos", { galleryId: galleryId, photos: [] })}>
            <LucideReact.ArrowLeft className="w-3 h-3 mr-1" /> Editor
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("get_download_stats", { galleryId: galleryId })}>
            <LucideReact.BarChart3 className="w-3 h-3 mr-1" /> Stats
          </Button>
        </div>

        {/* Gallery header */}
        <div className="p-4 space-y-1">
          {data.coverPhotoUrl && (
            <div className="rounded-xl overflow-hidden mb-3" style={{ maxHeight: "200px" }}>
              <img src={data.coverPhotoUrl} alt="Cover"
                style={{ width: "100%", maxHeight: "200px", objectFit: "cover" }} />
            </div>
          )}
          <div className="text-lg font-bold text-gray-100">{data.galleryName || "Gallery"}</div>
          {data.clientName && <div className="text-sm text-gray-400">For {data.clientName}</div>}
          {data.description && <div className="text-xs text-gray-500 mt-1">{data.description}</div>}
          <div className="text-[11px] text-gray-600 mt-1">{photos.length} photos</div>
        </div>

        <Separator />

        {/* Photo grid with captions and download buttons */}
        {photos.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<LucideReact.Image className="w-8 h-8 text-gray-600" />}
              title="No photos in this gallery"
              description="Add photos from the editor view."
            />
          </div>
        ) : (
          <div className="p-3 space-y-3 max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {photos.map((photo, idx) => (
              <div key={photo.id || idx}
                className="bg-gray-800/40 rounded-xl border border-gray-700/30 overflow-hidden">
                {/* Photo */}
                <button onClick={() => setLightboxIdx(idx)}
                  className="w-full cursor-pointer">
                  <img src={photo.url} alt={photo.filename}
                    style={{ width: "100%", maxHeight: "300px", objectFit: "cover" }}
                    onError={(e) => { e.target.style.display = "none"; }} />
                </button>
                {/* Caption + downloads */}
                <div className="p-3 space-y-2">
                  {photo.caption && (
                    <p className="text-xs text-gray-300 leading-relaxed italic">"{photo.caption}"</p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 truncate flex-1">{photo.filename}</span>
                    <Button size="sm" variant="outline"
                      onClick={() => onAction("record_download", { galleryId: galleryId, photoId: photo.id, resolution: "web" })}>
                      <LucideReact.Monitor className="w-3 h-3 mr-1" /> Web
                    </Button>
                    <Button size="sm" variant="primary"
                      onClick={() => onAction("record_download", { galleryId: galleryId, photoId: photo.id, resolution: "print" })}>
                      <LucideReact.Printer className="w-3 h-3 mr-1" /> Print
                    </Button>
                  </div>
                  {(photo.webDownloads > 0 || photo.printDownloads > 0) && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-600">
                      <LucideReact.Download className="w-2.5 h-2.5" />
                      {photo.webDownloads > 0 && <span>{photo.webDownloads} web</span>}
                      {photo.printDownloads > 0 && <span>{photo.printDownloads} print</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Preview lightbox */}
        {lightboxIdx >= 0 && lightboxIdx < photos.length && (() => {
          const photo = photos[lightboxIdx];
          return (
            <div
              onClick={() => setLightboxIdx(-1)}
              style={{
                position: "fixed", inset: 0, zIndex: 200,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.95)",
              }}>
              <button onClick={() => setLightboxIdx(-1)}
                style={{ position: "absolute", top: 12, right: 16, zIndex: 210 }}
                className="text-white/60 hover:text-white cursor-pointer p-2.5 rounded-lg hover:bg-white/10 transition-all">
                <LucideReact.X className="w-5 h-5" />
              </button>
              {lightboxIdx > 0 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                  style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                  className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                  <LucideReact.ChevronLeft className="w-6 h-6" />
                </button>
              )}
              <img src={photo.url} alt={photo.filename}
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "92vw", maxHeight: "75vh", objectFit: "contain", borderRadius: "4px" }} />
              {lightboxIdx < photos.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 210 }}
                  className="text-white/40 hover:text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-all">
                  <LucideReact.ChevronRight className="w-6 h-6" />
                </button>
              )}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 24px",
                background: "linear-gradient(transparent, rgba(0,0,0,0.85))", zIndex: 210 }}>
                <div className="text-sm text-white/90 font-medium mb-1">{photo.filename}</div>
                {photo.caption && <div className="text-xs text-white/60 leading-relaxed italic">"{photo.caption}"</div>}
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" variant="outline"
                    onClick={(e) => { e.stopPropagation(); onAction("record_download", { galleryId: galleryId, photoId: photo.id, resolution: "web" }); }}>
                    <LucideReact.Monitor className="w-3 h-3 mr-1" /> Web
                  </Button>
                  <Button size="sm" variant="primary"
                    onClick={(e) => { e.stopPropagation(); onAction("record_download", { galleryId: galleryId, photoId: photo.id, resolution: "print" }); }}>
                    <LucideReact.Printer className="w-3 h-3 mr-1" /> Print
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── DOWNLOAD CONFIRMATION (record_download) ──
  // ════════════════════════════════════════════════════════════════════════
  if (tool === "enso_client_gallery_record_download") {
    const galleryId = data.galleryId || "";
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <LucideReact.Download className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Download Recorded</div>
            <div className="text-xs text-gray-400">{data.message}</div>
          </div>
        </div>

        {data.photoUrl && (
          <div className="rounded-xl overflow-hidden">
            <img src={data.photoUrl} alt={data.photoFilename}
              style={{ width: "100%", maxHeight: "200px", objectFit: "cover" }} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-gray-500">Photo</div>
            <div className="text-gray-200 truncate">{data.photoFilename || data.photoId}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-gray-500">Resolution</div>
            <Badge variant={data.resolution === "print" ? "success" : "info"}>
              {data.resolution === "print" ? "Print (Full)" : "Web (1200px)"}
            </Badge>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-gray-500">Client</div>
            <div className="text-gray-200">{data.clientName || "Guest"}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-gray-500">Total Downloads</div>
            <div className="text-gray-200 font-medium">{data.totalDownloads || 0}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onAction("get_gallery_page", { galleryId: galleryId })}>
            <LucideReact.ArrowLeft className="w-3 h-3 mr-1" /> Gallery
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction("get_download_stats", { galleryId: galleryId })}>
            <LucideReact.BarChart3 className="w-3 h-3 mr-1" /> Analytics
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── ANALYTICS VIEW (get_download_stats) ──
  // ════════════════════════════════════════════════════════════════════════
  if (tool === "enso_client_gallery_get_download_stats") {
    const stats = data.stats || {};
    const topPhotos = data.topPhotos || [];
    const clientBreakdown = data.clientBreakdown || [];
    const recentDownloads = data.recentDownloads || [];
    const galleryId = data.galleryId || "";

    const tabs = [
      { value: "overview", label: "Overview" },
      { value: "photos", label: "Photos (" + topPhotos.length + ")" },
      { value: "clients", label: "Clients (" + clientBreakdown.length + ")" },
      { value: "activity", label: "Activity" },
    ];

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("add_photos", { galleryId: galleryId, photos: [] })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate flex items-center gap-2">
              <LucideReact.BarChart3 className="w-4 h-4 text-blue-400" />
              {data.galleryName || "Gallery"} — Analytics
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onAction("get_gallery_page", { galleryId: galleryId })}>
            <LucideReact.Eye className="w-3 h-3 mr-1" /> Preview
          </Button>
        </div>

        <Tabs tabs={tabs} defaultValue="overview" variant="pills">
          {(tab) => {
            // ── Overview ──
            if (tab === "overview") {
              return (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Total Downloads" value={stats.totalDownloads || 0} accent="blue" />
                    <Stat label="Unique Clients" value={stats.uniqueClients || 0} accent="violet" />
                    <Stat label="Web Downloads" value={stats.webDownloads || 0} accent="cyan" />
                    <Stat label="Print Downloads" value={stats.printDownloads || 0} accent="emerald" />
                  </div>
                  {stats.totalDownloads > 0 && (
                    <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
                      <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Resolution Breakdown</div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-12">Web</span>
                          <div className="flex-1 bg-gray-700/50 rounded-full h-2 overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full transition-all"
                              style={{ width: ((stats.webDownloads || 0) / Math.max(stats.totalDownloads, 1) * 100) + "%" }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{stats.webDownloads || 0}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-12">Print</span>
                          <div className="flex-1 bg-gray-700/50 rounded-full h-2 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: ((stats.printDownloads || 0) / Math.max(stats.totalDownloads, 1) * 100) + "%" }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{stats.printDownloads || 0}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // ── Top Photos ──
            if (tab === "photos") {
              if (topPhotos.length === 0) {
                return (
                  <div className="pt-2">
                    <EmptyState
                      icon={<LucideReact.Image className="w-7 h-7 text-gray-600" />}
                      title="No downloads yet"
                      description="Download stats will appear here once clients start downloading."
                    />
                  </div>
                );
              }
              return (
                <div className="space-y-2 pt-2 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {topPhotos.map((p, idx) => (
                    <div key={p.photoId || idx}
                      className="flex items-center gap-2.5 p-2 bg-gray-800/40 rounded-xl border border-gray-700/30">
                      {p.url && (
                        <img src={p.url} alt={p.filename}
                          style={{ width: "44px", height: "44px", borderRadius: "8px", objectFit: "cover" }}
                          className="shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-200 truncate font-medium">{p.filename}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-blue-400">{p.webDownloads} web</span>
                          <span className="text-[10px] text-emerald-400">{p.printDownloads} print</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-gray-200">{p.totalDownloads}</div>
                        <div className="text-[10px] text-gray-500">downloads</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            // ── Client Breakdown ──
            if (tab === "clients") {
              if (clientBreakdown.length === 0) {
                return (
                  <div className="pt-2">
                    <EmptyState
                      icon={<LucideReact.Users className="w-7 h-7 text-gray-600" />}
                      title="No client activity"
                      description="Client download breakdowns will appear here."
                    />
                  </div>
                );
              }
              return (
                <div className="pt-2">
                  <DataTable
                    columns={[
                      { key: "clientName", label: "Client", sortable: true },
                      { key: "downloads", label: "Total", sortable: true },
                      { key: "web", label: "Web", sortable: true },
                      { key: "print", label: "Print", sortable: true },
                    ]}
                    data={clientBreakdown}
                    pageSize={10}
                    striped
                  />
                </div>
              );
            }

            // ── Recent Activity ──
            if (tab === "activity") {
              if (recentDownloads.length === 0) {
                return (
                  <div className="pt-2">
                    <EmptyState
                      icon={<LucideReact.Clock className="w-7 h-7 text-gray-600" />}
                      title="No activity yet"
                      description="Recent download events will appear here."
                    />
                  </div>
                );
              }
              return (
                <div className="space-y-1.5 pt-2 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {recentDownloads.map((dl, idx) => (
                    <div key={idx}
                      className="flex items-center gap-2.5 px-2.5 py-2 bg-gray-800/40 rounded-lg border border-gray-700/20">
                      <div className={"w-7 h-7 rounded-full flex items-center justify-center shrink-0 " +
                        (dl.resolution === "print" ? "bg-emerald-500/15" : "bg-blue-500/15")}>
                        {dl.resolution === "print"
                          ? <LucideReact.Printer className="w-3.5 h-3.5 text-emerald-400" />
                          : <LucideReact.Monitor className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-200 truncate">{dl.photoFilename}</div>
                        <div className="text-[10px] text-gray-500">
                          {dl.clientName || "Guest"} · {dl.resolution}
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-600 shrink-0">
                        {timeAgo(dl.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            return null;
          }}
        </Tabs>
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <EmptyState
        icon={<LucideReact.Images className="w-8 h-8 text-violet-400" />}
        title="Client Gallery"
        description="Create and manage photo galleries for client delivery."
        action={<Button size="sm" variant="primary" onClick={() => onAction("create_gallery", {})}>Get Started</Button>}
      />
    </div>
  );
}
export default function GeneratedUI({ data, onAction }) {
  // ── All hooks at top level (React rules) ──
  var [activeTab, setActiveTab] = useState("auto");
  var [folderInput, setFolderInput] = useState("");
  var [selectedImgIdx, setSelectedImgIdx] = useState(0);
  var [zoomed, setZoomed] = useState(false);
  var [exportMode, setExportMode] = useState("copy");
  var [outputPath, setOutputPath] = useState("");
  var [moveRejected, setMoveRejected] = useState(false);
  var [starRating, setStarRating] = useState(3);
  var containerRef = useRef(null);

  // Determine view from data.tool
  var tool = data?.tool || "";
  var isScan = tool === "enso_photo_culling_tool_scan_folder" || tool === "enso_photo_culling_tool_analyze_images";
  var isReview = tool === "enso_photo_culling_tool_review_session";
  var isExport = tool === "enso_photo_culling_tool_export_selections";
  var hasError = !!data?.error;

  // Auto-select tab based on data.tool
  var computedTab = activeTab;
  if (activeTab === "auto") {
    if (isReview) computedTab = "review";
    else if (isExport) computedTab = "export";
    else computedTab = "scan";
  }

  // Sync selectedImgIdx with server state
  useEffect(function() {
    if (isReview && data?.currentImageIndex != null) setSelectedImgIdx(data.currentImageIndex);
  }, [isReview, data?.currentImageIndex]);

  // Reset zoom on image change
  useEffect(function() { setZoomed(false); }, [selectedImgIdx, data?.currentGroupIndex]);

  // Keyboard handler
  useEffect(function() {
    var el = containerRef.current;
    if (!el) return;
    function handleKey(e) {
      if (computedTab !== "review") return;
      var key = e.key;
      if (key === "p" || key === "P") { e.preventDefault(); onAction("review_session", { action: "keep" }); }
      else if (key === "x" || key === "X") { e.preventDefault(); onAction("review_session", { action: "reject" }); }
      else if (key === "u" || key === "U") { e.preventDefault(); onAction("review_session", { action: "unmark" }); }
      else if (key === "ArrowRight") { e.preventDefault(); onAction("review_session", { direction: "next_image" }); }
      else if (key === "ArrowLeft") { e.preventDefault(); onAction("review_session", { direction: "prev_image" }); }
      else if (key === "ArrowDown") { e.preventDefault(); onAction("review_session", { direction: "next_group" }); }
      else if (key === "ArrowUp") { e.preventDefault(); onAction("review_session", { direction: "prev_group" }); }
      else if (key === " ") { e.preventDefault(); setZoomed(function(z) { return !z; }); }
    }
    el.addEventListener("keydown", handleKey);
    return function() { el.removeEventListener("keydown", handleKey); };
  }, [computedTab, onAction]);

  // Focus container for keyboard events
  useEffect(function() {
    if (containerRef.current && computedTab === "review") containerRef.current.focus();
  }, [computedTab, data?.currentGroupIndex, data?.currentImageIndex]);

  // Helpers
  var fmtSize = function(b) {
    if (!b) return "\u2014";
    if (b > 1048576) return (b / 1048576).toFixed(1) + " MB";
    if (b > 1024) return (b / 1024).toFixed(1) + " KB";
    return b + " B";
  };
  var fmtDate = function(d) {
    if (!d) return "\u2014";
    try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return d; }
  };
  var statusColor = function(s) { return s === "approved" ? "#22c55e" : s === "rejected" ? "#ef4444" : "#6b7280"; };
  var statusBorder = function(s) { return s === "approved" ? "2px solid #22c55e" : s === "rejected" ? "2px solid #ef4444" : "2px solid transparent"; };

  // Icons
  var CheckIcon = LucideReact.Check;
  var XIcon = LucideReact.X;
  var StarIcon = LucideReact.Star;
  var EyeOffIcon = LucideReact.EyeOff;
  var CameraIcon = LucideReact.Camera;
  var FolderIcon = LucideReact.Folder;
  var ImageIcon = LucideReact.Image;
  var DownloadIcon = LucideReact.Download;
  var ZapIcon = LucideReact.Zap;
  var AlertIcon = LucideReact.AlertTriangle;
  var SearchIcon = LucideReact.Search;
  var ChevronLeftIcon = LucideReact.ChevronLeft;
  var ChevronRightIcon = LucideReact.ChevronRight;
  var ChevronUpIcon = LucideReact.ChevronUp;
  var ChevronDownIcon = LucideReact.ChevronDown;
  var RefreshIcon = LucideReact.RefreshCw;
  var UndoIcon = LucideReact.Undo2;
  var UserIcon = LucideReact.User;

  // ── Error view ──
  if (hasError) {
    return (
      <div style={{ background: "#1a1a1a", color: "#e5e5e5", padding: 24, borderRadius: 12, minHeight: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <AlertIcon size={20} color="#ef4444" />
          <span style={{ color: "#ef4444", fontWeight: 600 }}>Error</span>
        </div>
        <p style={{ color: "#a3a3a3" }}>{data.error}</p>
        <Button variant="outline" onClick={function() { onAction("scan_folder", { folderPath: data?.folderPath || "" }); }} style={{ marginTop: 16 }}>Try Again</Button>
      </div>
    );
  }

  // Tab config
  var tabs = [{ value: "scan", label: "Scan" }, { value: "review", label: "Review" }, { value: "export", label: "Export" }];
  var stats = data?.stats || {};
  var totalImages = data?.totalImages || 0;
  var totalGroups = data?.totalGroups || (data?.groups || []).length || 0;

  // ── SCAN VIEW ──
  var renderScanView = function() {
    var groups = data?.groups || [];
    var hasScanData = totalImages > 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
        <UICard>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 4 }}>Folder Path</div>
              <Input placeholder="C:/Users/Photos/Wedding..." value={folderInput || data?.folderPath || ""} onChange={function(e) { setFolderInput(e.target.value); }} />
            </div>
            <Button variant="primary" onClick={function() { onAction("scan_folder", { folderPath: folderInput || data?.folderPath || "" }); }}>
              <SearchIcon size={14} style={{ marginRight: 4 }} /> Scan Folder
            </Button>
            {hasScanData && (
              <Button variant="outline" onClick={function() { onAction("scan_folder", { folderPath: data?.folderPath || folderInput, rescan: true }); }}>
                <RefreshIcon size={14} style={{ marginRight: 4 }} /> Rescan
              </Button>
            )}
          </div>
        </UICard>

        {hasScanData && (
          <Fragment>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              <Stat label="Total Photos" value={totalImages} accent="blue" />
              <Stat label="Burst Groups" value={totalGroups} accent="purple" />
              <Stat label="Blur Flagged" value={stats.blurFlagged || 0} accent={stats.blurFlagged > 0 ? "amber" : "default"} />
              <Stat label="Eyes Closed" value={stats.eyesClosedFlagged || 0} accent={stats.eyesClosedFlagged > 0 ? "rose" : "default"} />
              {stats.approved > 0 && <Stat label="Kept" value={stats.approved} accent="green" />}
              {stats.rejected > 0 && <Stat label="Rejected" value={stats.rejected} accent="red" />}
            </div>

            {data?.message && (
              <div style={{ background: "#262626", borderRadius: 8, padding: "10px 14px", color: "#a3a3a3", fontSize: 13 }}>
                {data.resumed && <Badge variant="info" style={{ marginRight: 8 }}>Resumed</Badge>}
                {data.message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" onClick={function() { setActiveTab("review"); onAction("review_session", {}); }}>
                <CameraIcon size={14} style={{ marginRight: 4 }} /> Start Review
              </Button>
              <Button variant="outline" onClick={function() { onAction("analyze_images", {}); }}>
                <ZapIcon size={14} style={{ marginRight: 4 }} /> Re-analyze
              </Button>
            </div>

            {groups.length > 0 && (
              <UICard header={"Groups (" + groups.length + ")"}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, maxHeight: 400, overflowY: "auto" }}>
                  {groups.slice(0, 50).map(function(grp, idx) {
                    var firstImg = grp.images?.[0];
                    return (
                      <div key={grp.groupId || idx} style={{ background: "#262626", borderRadius: 8, overflow: "hidden", cursor: "pointer" }}
                        onClick={function() { setActiveTab("review"); onAction("review_session", { groupIndex: idx }); }}>
                        {firstImg?.mediaUrl ? (
                          <img src={firstImg.mediaUrl} alt={firstImg.filename || ""} loading="lazy" style={{ width: "100%", height: 100, objectFit: "cover" }} onError={function(e) { e.target.style.display = "none"; }} />
                        ) : (
                          <div style={{ width: "100%", height: 100, background: "#333", display: "flex", alignItems: "center", justifyContent: "center" }}><ImageIcon size={24} color="#555" /></div>
                        )}
                        <div style={{ padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#a3a3a3" }}>{grp.groupId}</span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <Badge variant={grp.groupType === "burst" ? "info" : "outline"}>{grp.groupType === "burst" ? "Burst" : "Single"}</Badge>
                            <span style={{ fontSize: 11, color: "#888" }}>{grp.imageCount}x</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {groups.length > 50 && <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>Showing 50 of {groups.length} groups</p>}
              </UICard>
            )}
          </Fragment>
        )}

        {!hasScanData && !data?.message && (
          <EmptyState icon={FolderIcon} title="Scan a Shoot Folder" description="Enter a folder path above and click Scan to discover and analyze photos." />
        )}
      </div>
    );
  };

  // ── REVIEW VIEW ──
  var renderReviewView = function() {
    var currentGroup = data?.currentGroup;
    var currentImage = data?.currentImage;
    var groupImages = currentGroup?.images || [];
    var groupOverview = data?.groupOverview || [];
    var gi = data?.currentGroupIndex || 0;
    var ii = data?.currentImageIndex || 0;
    var viewIdx = selectedImgIdx < groupImages.length ? selectedImgIdx : ii;
    var viewImage = groupImages[viewIdx] || currentImage || {};

    if (!currentGroup && !currentImage) {
      return (
        <div style={{ textAlign: "center", padding: 40 }}>
          <EmptyState icon={CameraIcon} title="No Review Session" description="Scan a folder first, then start reviewing." />
          <Button variant="primary" onClick={function() { setActiveTab("scan"); }} style={{ marginTop: 16 }}>Go to Scan</Button>
        </div>
      );
    }

    var completionPct = data?.completionPercent || 0;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Status bar */}
        <div style={{ background: "#262626", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "#a3a3a3", fontSize: 12 }}>Group {gi + 1}/{data?.totalGroups || 0}</span>
            <Separator orientation="vertical" />
            <span style={{ color: "#a3a3a3", fontSize: 12 }}>Image {viewIdx + 1}/{groupImages.length}</span>
            <Separator orientation="vertical" />
            <Badge variant={currentGroup?.groupType === "burst" ? "info" : "outline"}>{currentGroup?.groupType || "\u2014"}</Badge>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "#22c55e", fontSize: 12 }}>{stats.approved || 0} kept</span>
            <span style={{ color: "#ef4444", fontSize: 12 }}>{stats.rejected || 0} rejected</span>
            <span style={{ color: "#6b7280", fontSize: 12 }}>{stats.pending || 0} pending</span>
            <span style={{ color: "#e5e5e5", fontSize: 12, fontWeight: 600 }}>{completionPct}%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: "#333" }}>
          <div style={{ height: "100%", width: completionPct + "%", background: "linear-gradient(90deg, #22c55e, #3b82f6)", transition: "width 0.3s" }} />
        </div>

        {/* 3-column layout */}
        <div style={{ display: "flex", gap: 0, minHeight: 400 }}>
          {/* Left: filmstrip */}
          <div style={{ width: 90, background: "#1f1f1f", overflowY: "auto", padding: "8px 4px", flexShrink: 0, borderRight: "1px solid #333" }}>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, padding: "0 4px 6px", fontWeight: 600 }}>Burst</div>
            {groupImages.map(function(img, idx) {
              var isActive = idx === viewIdx;
              return (
                <div key={idx} style={{ position: "relative", marginBottom: 4, borderRadius: 6, overflow: "hidden", cursor: "pointer", border: isActive ? "2px solid #3b82f6" : statusBorder(img.status), opacity: isActive ? 1 : 0.8 }}
                  onClick={function() { setSelectedImgIdx(idx); }}>
                  {img.mediaUrl ? (
                    <img src={img.mediaUrl} alt={img.filename || ""} loading="lazy" style={{ width: "100%", height: 56, objectFit: "cover", display: "block" }} onError={function(e) { e.target.style.display = "none"; }} />
                  ) : (
                    <div style={{ width: "100%", height: 56, background: "#333", display: "flex", alignItems: "center", justifyContent: "center" }}><ImageIcon size={14} color="#555" /></div>
                  )}
                  <div style={{ position: "absolute", top: 2, right: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                    {img.status === "approved" && <div style={{ background: "#22c55e", borderRadius: 4, padding: "1px 3px", lineHeight: 1 }}><CheckIcon size={10} color="#fff" /></div>}
                    {img.status === "rejected" && <div style={{ background: "#ef4444", borderRadius: 4, padding: "1px 3px", lineHeight: 1 }}><XIcon size={10} color="#fff" /></div>}
                  </div>
                  {img.isSharpest && <div style={{ position: "absolute", top: 2, left: 2 }}><div style={{ background: "#eab308", borderRadius: 4, padding: "1px 3px", lineHeight: 1 }}><StarIcon size={10} color="#fff" /></div></div>}
                  {img.blurFlag && <div style={{ position: "absolute", bottom: 2, left: 2 }}><div style={{ background: "rgba(239,68,68,0.8)", borderRadius: 4, padding: "1px 3px", lineHeight: 1 }}><AlertIcon size={9} color="#fff" /></div></div>}
                  {img.eyesClosedFlag && <div style={{ position: "absolute", bottom: 2, right: 2 }}><div style={{ background: "rgba(168,85,247,0.8)", borderRadius: 4, padding: "1px 3px", lineHeight: 1 }}><EyeOffIcon size={9} color="#fff" /></div></div>}
                </div>
              );
            })}
          </div>

          {/* Center: main photo */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#111", minWidth: 0 }}>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: zoomed ? "zoom-out" : "zoom-in", minHeight: 300 }}
              onClick={function() { setZoomed(function(z) { return !z; }); }}>
              {viewImage.mediaUrl ? (
                <img src={viewImage.mediaUrl} alt={viewImage.filename || ""} style={{ maxWidth: zoomed ? "200%" : "100%", maxHeight: zoomed ? "200%" : "100%", objectFit: "contain", transition: "all 0.2s", transform: zoomed ? "scale(2)" : "scale(1)" }} onError={function(e) { e.target.style.display = "none"; }} />
              ) : (
                <div style={{ color: "#555", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><ImageIcon size={48} /><span>No preview</span></div>
              )}

              {/* Quality overlays */}
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {viewImage.sharpnessNormalized != null && (
                  <div style={{ background: "rgba(0,0,0,0.7)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                    <ZapIcon size={12} color={viewImage.blurFlag ? "#ef4444" : "#22c55e"} />
                    <span style={{ fontSize: 11, color: "#e5e5e5" }}>Sharpness: {viewImage.sharpnessNormalized}%</span>
                  </div>
                )}
                {viewImage.blurFlag && <div style={{ background: "rgba(239,68,68,0.8)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}><AlertIcon size={12} color="#fff" /><span style={{ fontSize: 11, color: "#fff" }}>Blurry</span></div>}
                {viewImage.eyesClosedFlag && <div style={{ background: "rgba(168,85,247,0.8)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}><EyeOffIcon size={12} color="#fff" /><span style={{ fontSize: 11, color: "#fff" }}>Eyes Closed</span></div>}
                {viewImage.isSharpest && <div style={{ background: "rgba(234,179,8,0.8)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}><StarIcon size={12} color="#fff" /><span style={{ fontSize: 11, color: "#fff" }}>Sharpest</span></div>}
              </div>

              {/* Status badge */}
              {viewImage.status && viewImage.status !== "pending" && (
                <div style={{ position: "absolute", top: 12, right: 12, background: statusColor(viewImage.status), borderRadius: 6, padding: "4px 10px" }}>
                  <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, textTransform: "uppercase" }}>{viewImage.status === "approved" ? "KEEP" : "REJECT"}</span>
                </div>
              )}

              {/* AI suggestion */}
              {viewImage.autoSuggestion && viewImage.status === "pending" && (
                <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.7)", borderRadius: 6, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <ZapIcon size={12} color="#eab308" />
                  <span style={{ fontSize: 11, color: "#e5e5e5" }}>AI: <b style={{ color: viewImage.autoSuggestion === "keep" || viewImage.autoSuggestion === "approve" ? "#22c55e" : "#ef4444" }}>{viewImage.autoSuggestion}</b></span>
                  {viewImage.autoReason && <span style={{ fontSize: 10, color: "#888" }}> \u2014 {viewImage.autoReason}</span>}
                </div>
              )}

              {/* Nav arrows */}
              <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }} onClick={function(e) { e.stopPropagation(); onAction("review_session", { direction: "prev_image" }); }}>
                <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "50%", padding: 6, cursor: "pointer" }}><ChevronLeftIcon size={20} color="#fff" /></div>
              </div>
              <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }} onClick={function(e) { e.stopPropagation(); onAction("review_session", { direction: "next_image" }); }}>
                <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "50%", padding: 6, cursor: "pointer" }}><ChevronRightIcon size={20} color="#fff" /></div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 12px", background: "#1a1a1a", borderTop: "1px solid #333" }}>
              <Button variant={viewImage.status === "rejected" ? "danger" : "outline"} onClick={function() { onAction("review_session", { action: "reject" }); }} style={{ minWidth: 80 }}>
                <XIcon size={14} style={{ marginRight: 4 }} /> Reject (X)
              </Button>
              <Button variant="outline" onClick={function() { onAction("review_session", { action: "unmark" }); }} style={{ minWidth: 80 }}>
                <UndoIcon size={14} style={{ marginRight: 4 }} /> Unmark (U)
              </Button>
              <Button variant={viewImage.status === "approved" ? "primary" : "outline"} onClick={function() { onAction("review_session", { action: "keep" }); }} style={{ minWidth: 80, background: viewImage.status === "approved" ? "#22c55e" : undefined }}>
                <CheckIcon size={14} style={{ marginRight: 4 }} /> Keep (P)
              </Button>
            </div>
          </div>

          {/* Right: metadata */}
          <div style={{ width: 200, background: "#1f1f1f", overflowY: "auto", padding: 10, flexShrink: 0, borderLeft: "1px solid #333", fontSize: 12 }}>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Metadata</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: "#e5e5e5", fontWeight: 600, wordBreak: "break-all", marginBottom: 4 }}>{viewImage.filename || "\u2014"}</div>
              <div style={{ color: "#888", fontSize: 11 }}>{fmtSize(viewImage.sizeBytes)}</div>
            </div>
            <Separator style={{ margin: "8px 0" }} />

            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Camera</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {viewImage.exif?.cameraModel && <div style={{ color: "#ccc" }}><CameraIcon size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />{viewImage.exif.cameraMake ? viewImage.exif.cameraMake + " " : ""}{viewImage.exif.cameraModel}</div>}
              {viewImage.exif?.dateTaken && <div style={{ color: "#888" }}>{fmtDate(viewImage.exif.dateTaken)}</div>}
              {viewImage.exif?.iso && <div style={{ color: "#888" }}>ISO {viewImage.exif.iso}</div>}
              {viewImage.exif?.shutterSpeed && <div style={{ color: "#888" }}>{viewImage.exif.shutterSpeed}</div>}
              {viewImage.exif?.aperture && <div style={{ color: "#888" }}>{viewImage.exif.aperture}</div>}
              {viewImage.exif?.focalLength && <div style={{ color: "#888" }}>{viewImage.exif.focalLength}</div>}
            </div>
            <Separator style={{ margin: "8px 0" }} />

            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Sharpness</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#ccc" }}>Score</span>
                <span style={{ color: viewImage.blurFlag ? "#ef4444" : "#22c55e", fontWeight: 600 }}>{viewImage.sharpnessNormalized != null ? viewImage.sharpnessNormalized + "%" : "\u2014"}</span>
              </div>
              <div style={{ height: 6, background: "#333", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: (viewImage.sharpnessNormalized || 0) + "%", background: viewImage.blurFlag ? "#ef4444" : "#22c55e", borderRadius: 3, transition: "width 0.3s" }} />
              </div>
              {viewImage.isSharpest && <div style={{ color: "#eab308", fontSize: 10, marginTop: 4 }}><StarIcon size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />Sharpest in group</div>}
              {viewImage.blurFlag && <div style={{ color: "#ef4444", fontSize: 10, marginTop: 4 }}><AlertIcon size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />Below threshold</div>}
            </div>
            <Separator style={{ margin: "8px 0" }} />

            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Faces</div>
            <div style={{ marginBottom: 10 }}>
              {(viewImage.faces || []).length === 0 ? (
                <div style={{ color: "#888" }}>No faces detected</div>
              ) : (
                <Fragment>
                  <div style={{ color: "#ccc", marginBottom: 4 }}><UserIcon size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />{viewImage.faces.length} face{viewImage.faces.length !== 1 ? "s" : ""}</div>
                  {viewImage.eyesClosedFlag && <div style={{ color: "#a855f7", fontSize: 10 }}><EyeOffIcon size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />Eyes closed</div>}
                </Fragment>
              )}
            </div>
            <Separator style={{ margin: "8px 0" }} />

            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Group Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Button variant="outline" onClick={function() { onAction("review_session", { action: "keep_group" }); }} style={{ fontSize: 11, padding: "4px 8px" }}>
                <CheckIcon size={12} style={{ marginRight: 4 }} /> Keep Best
              </Button>
              <Button variant="outline" onClick={function() { onAction("review_session", { action: "reject_group" }); }} style={{ fontSize: 11, padding: "4px 8px" }}>
                <XIcon size={12} style={{ marginRight: 4 }} /> Reject All
              </Button>
              <Button variant="outline" onClick={function() { onAction("review_session", { action: "undo" }); }} style={{ fontSize: 11, padding: "4px 8px" }}>
                <UndoIcon size={12} style={{ marginRight: 4 }} /> Undo
              </Button>
            </div>
          </div>
        </div>

        {/* Group navigator */}
        <div style={{ background: "#1f1f1f", borderTop: "1px solid #333", padding: "6px 8px", display: "flex", gap: 4, overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 8 }}>
            <div style={{ cursor: "pointer", padding: 4 }} onClick={function() { onAction("review_session", { direction: "prev_group" }); }}><ChevronUpIcon size={14} color="#888" /></div>
            <div style={{ cursor: "pointer", padding: 4 }} onClick={function() { onAction("review_session", { direction: "next_group" }); }}><ChevronDownIcon size={14} color="#888" /></div>
          </div>
          {groupOverview.map(function(grp, idx) {
            var isActive = grp.isActive;
            var compColor = grp.completion === "done" ? "#22c55e" : grp.completion === "partial" ? "#eab308" : "#444";
            return (
              <div key={grp.groupId || idx} style={{ minWidth: 44, height: 36, borderRadius: 6, cursor: "pointer", background: isActive ? "#333" : "#262626", border: isActive ? "2px solid #3b82f6" : "2px solid " + compColor, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2px 6px", flexShrink: 0 }}
                onClick={function() { onAction("review_session", { direction: "jump_group", groupIndex: idx }); }}>
                <span style={{ fontSize: 9, color: isActive ? "#e5e5e5" : "#888", fontWeight: isActive ? 600 : 400 }}>{grp.groupId}</span>
                <span style={{ fontSize: 8, color: "#666" }}>{grp.imageCount}x</span>
              </div>
            );
          })}
        </div>

        {/* Keyboard hints */}
        <div style={{ background: "#111", padding: "6px 12px", display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
          {[{ key: "P", label: "Keep" }, { key: "X", label: "Reject" }, { key: "U", label: "Unmark" }, { key: "\u2190/\u2192", label: "Nav Photos" }, { key: "\u2191/\u2193", label: "Nav Groups" }, { key: "Space", label: "Zoom" }].map(function(s) {
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ background: "#333", border: "1px solid #555", borderRadius: 4, padding: "1px 6px", fontSize: 10, color: "#ccc", fontFamily: "monospace" }}>{s.key}</span>
                <span style={{ fontSize: 10, color: "#666" }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── EXPORT VIEW ──
  var renderExportView = function() {
    var hasExportData = isExport;
    var groupSummary = data?.groupSummary || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          <Stat label="Kept" value={stats.approved || 0} accent="green" />
          <Stat label="Rejected" value={stats.rejected || 0} accent="red" />
          <Stat label="Pending" value={stats.pending || 0} accent={stats.pending > 0 ? "amber" : "default"} />
        </div>

        {stats.pending > 0 && (
          <div style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <AlertIcon size={16} color="#eab308" />
            <span style={{ color: "#eab308", fontSize: 13 }}>{stats.pending} images still pending</span>
            <Button variant="outline" onClick={function() { setActiveTab("review"); onAction("review_session", {}); }} style={{ marginLeft: "auto", fontSize: 11 }}>Continue Review</Button>
          </div>
        )}

        {!hasExportData && (
          <UICard header="Export Settings">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 4 }}>Output Folder</div>
                <Input placeholder="Default: _approved/ subfolder" value={outputPath} onChange={function(e) { setOutputPath(e.target.value); }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 4 }}>Export Mode</div>
                <Select value={exportMode} onChange={function(v) { setExportMode(v); }} options={[
                  { value: "copy", label: "Copy approved photos" },
                  { value: "move", label: "Move approved photos" },
                  { value: "list", label: "Generate list only" }
                ]} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Switch checked={moveRejected} onChange={function(v) { setMoveRejected(v); }} />
                <span style={{ fontSize: 12, color: "#ccc" }}>Move rejected to _rejected/</span>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 4 }}>Star Rating</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(function(n) {
                    return <div key={n} onClick={function() { setStarRating(n); }} style={{ cursor: "pointer", padding: 4 }}><StarIcon size={18} color={n <= starRating ? "#eab308" : "#555"} fill={n <= starRating ? "#eab308" : "none"} /></div>;
                  })}
                </div>
              </div>
              <Button variant="primary" onClick={function() {
                var p = { exportMode: exportMode, starRating: starRating, moveRejected: moveRejected };
                if (outputPath.trim()) p.outputPath = outputPath.trim();
                onAction("export_selections", p);
              }}>
                <DownloadIcon size={14} style={{ marginRight: 4 }} /> Export
              </Button>
            </div>
          </UICard>
        )}

        {hasExportData && (
          <Fragment>
            <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <CheckIcon size={18} color="#22c55e" />
                <span style={{ color: "#22c55e", fontWeight: 600 }}>Export Complete</span>
              </div>
              <p style={{ color: "#a3a3a3", fontSize: 13, margin: 0 }}>{data.message}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              <Stat label="Exported" value={data.exported || 0} accent="green" />
              <Stat label="Skipped" value={data.skipped || 0} accent="default" />
              {data.moved > 0 && <Stat label="Moved" value={data.moved} accent="amber" />}
            </div>
            {data.outputPath && <div style={{ background: "#262626", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}><span style={{ color: "#888" }}>Output: </span><span style={{ color: "#e5e5e5" }}>{data.outputPath}</span></div>}
            {(data.errors || []).length > 0 && (
              <UICard header={"Errors (" + data.errors.length + ")"} accent="red">
                {data.errors.map(function(err, idx) { return <div key={idx} style={{ fontSize: 12, color: "#ef4444", padding: "4px 0" }}>{err.path}: {err.error}</div>; })}
              </UICard>
            )}
            {groupSummary.length > 0 && (
              <DataTable columns={[
                { key: "groupId", label: "Group", sortable: true },
                { key: "groupType", label: "Type", render: function(v) { return <Badge variant={v === "burst" ? "info" : "outline"}>{v}</Badge>; } },
                { key: "imageCount", label: "Images", sortable: true },
                { key: "kept", label: "Kept", sortable: true, render: function(v) { return <span style={{ color: "#22c55e" }}>{v}</span>; } },
                { key: "rejected", label: "Rejected", sortable: true, render: function(v) { return <span style={{ color: "#ef4444" }}>{v}</span>; } }
              ]} data={groupSummary} pageSize={20} striped />
            )}
            <Button variant="outline" onClick={function() {
              var p = { exportMode: exportMode, starRating: starRating, moveRejected: moveRejected };
              if (outputPath.trim()) p.outputPath = outputPath.trim();
              onAction("export_selections", p);
            }}><RefreshIcon size={14} style={{ marginRight: 4 }} /> Export Again</Button>
          </Fragment>
        )}
      </div>
    );
  };

  // ── Main render ──
  return (
    <div ref={containerRef} tabIndex={0} style={{ background: "#1a1a1a", color: "#e5e5e5", borderRadius: 12, overflow: "hidden", outline: "none" }}>
      <Tabs tabs={tabs} defaultValue={computedTab} variant="boxed">
        {function(tab) {
          if (tab === "review") return renderReviewView();
          if (tab === "export") return renderExportView();
          return renderScanView();
        }}
      </Tabs>
    </div>
  );
}

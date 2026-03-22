export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  const fmtSize = (b) => {
    if (!b && b !== 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };
  const fmtDuration = (s) => {
    if (!s && s !== 0) return "0:00";
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };
  const fmtTimestamp = (s) => {
    if (!s && s !== 0) return "0:00";
    return fmtDuration(s);
  };

  // ── State ──
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const lbRef = useRef(null);

  useEffect(() => {
    if (lightboxIdx >= 0 && lbRef.current) lbRef.current.focus();
  }, [lightboxIdx]);

  // ── Detect tool type ──
  const tool = data?.tool || "";
  const isInspect = tool === "enso_media_processing_inspect";
  const isFrames = tool === "enso_media_processing_frames";
  const isScenes = tool === "enso_media_processing_scenes";
  const isThumbnail = tool === "enso_media_processing_thumbnail";
  const isSheet = tool === "enso_media_processing_sheet";
  const isUpscale = tool === "enso_media_processing_upscale";
  const isRmbg = tool === "enso_media_processing_rmbg";

  // ── Error state ──
  if (data?.error) {
    return (
      <div style={{ padding: 16, color: "#ef4444", background: "#1a1a2e", borderRadius: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Error</div>
        <div style={{ opacity: 0.85 }}>{data.error}</div>
        {data.path && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.5 }}>{data.path}</div>}
      </div>
    );
  }

  // ── Video Inspect View ──
  if (isInspect) {
    const fields = [
      { label: "Duration", value: fmtDuration(data.duration) },
      { label: "Resolution", value: data.width && data.height ? `${data.width}×${data.height}` : "—" },
      { label: "Codec", value: data.codec || "—" },
      { label: "FPS", value: data.fps || "—" },
      { label: "Bitrate", value: data.bitrate ? `${data.bitrate} kbps` : "—" },
      { label: "File Size", value: fmtSize(data.fileSize) },
      { label: "Format", value: data.format || "—" },
      { label: "Audio", value: data.audioCodec ? `${data.audioCodec} (${data.audioChannels}ch)` : "None" },
    ];

    return (
      <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Video Inspection</div>
            {data.path && <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{data.path}</div>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {fields.map((f, i) => (
            <div key={i} style={{ padding: "8px 12px", background: "#252540", borderRadius: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>{f.label}</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{f.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => onAction("frames", { path: data.path })} style={btnStyle}>Extract Frames</button>
          <button onClick={() => onAction("scenes", { path: data.path })} style={btnStyle}>Detect Scenes</button>
          <button onClick={() => onAction("thumbnail", { path: data.path })} style={btnStyle}>Generate Thumbnail</button>
        </div>
      </div>
    );
  }

  // ── Frames View ──
  if (isFrames) {
    const frames = data.frames || [];
    const items = frames.map((f, i) => {
      const name = typeof f === "string" ? f.split(/[\\/]/).pop() : `frame_${i + 1}`;
      return { path: typeof f === "string" ? f : "", name };
    });

    return (
      <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🎞️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Extracted Frames</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>{items.length} frames from {data.path || "video"}</div>
          </div>
        </div>
        {items.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", opacity: 0.5 }}>No frames extracted</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            {items.map((item, i) => (
              <div key={i} onClick={() => setLightboxIdx(i)} style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", background: "#252540" }}>
                <img src={`/media${item.path}`} alt={item.name} style={{ width: "100%", height: 90, objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
                <div style={{ padding: "4px 6px", fontSize: 10, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
              </div>
            ))}
          </div>
        )}
        {data.outputDir && <div style={{ marginTop: 8, fontSize: 11, opacity: 0.4 }}>Saved to: {data.outputDir}</div>}

        {/* Lightbox */}
        {lightboxIdx >= 0 && lightboxIdx < items.length && (
          <div ref={lbRef} tabIndex={0}
            onClick={() => setLightboxIdx(-1)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setLightboxIdx(-1);
              if (e.key === "ArrowRight" && lightboxIdx < items.length - 1) setLightboxIdx(lightboxIdx + 1);
              if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
            }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, outline: "none" }}>
            <img src={`/media${items[lightboxIdx].path}`} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }} />
            <div style={{ position: "absolute", bottom: 16, color: "#fff", fontSize: 13 }}>
              {items[lightboxIdx].name} — {lightboxIdx + 1}/{items.length}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Scene Detection View ──
  if (isScenes) {
    const scenes = data.scenes || [];

    return (
      <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Scene Detection</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>{scenes.length} scene boundaries found</div>
          </div>
        </div>
        {scenes.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", opacity: 0.5 }}>No scene changes detected (try lowering the threshold)</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scenes.map((scene, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#252540", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14, minWidth: 60 }}>
                  {fmtTimestamp(scene.timestamp)}
                </div>
                <div style={{ flex: 1, height: 4, background: "#3a3a5c", borderRadius: 2 }}>
                  <div style={{ width: `${Math.min(100, (scene.score || 0.5) * 100)}%`, height: "100%", background: "#6366f1", borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>
                  Scene {i + 1}{scene.frameNumber ? ` (frame ${scene.frameNumber})` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
        {data.path && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => onAction("frames", { path: data.path, mode: "keyframes" })} style={btnStyle}>Extract Keyframes</button>
            <button onClick={() => onAction("inspect", { path: data.path })} style={btnStyle}>Inspect Video</button>
          </div>
        )}
      </div>
    );
  }

  // ── Thumbnail View ──
  if (isThumbnail) {
    return (
      <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🖼️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Video Thumbnail</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>
              At {fmtTimestamp(data.timestamp || 1)} — {data.size || "320x240"}
            </div>
          </div>
        </div>
        {data.outputPath && (
          <div style={{ borderRadius: 8, overflow: "hidden", background: "#252540" }}>
            <img src={`/media${data.outputPath}`} alt="Video thumbnail" style={{ width: "100%", maxWidth: 480, display: "block" }} onError={(e) => { e.target.style.display = "none"; e.target.parentElement.innerHTML = '<div style="padding:24px;text-align:center;opacity:0.5">Thumbnail saved to: ' + data.outputPath + '</div>'; }} />
          </div>
        )}
        {data.path && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => onAction("inspect", { path: data.path })} style={btnStyle}>Inspect Video</button>
            <button onClick={() => onAction("frames", { path: data.path })} style={btnStyle}>Extract Frames</button>
          </div>
        )}
      </div>
    );
  }

  // ── Contact Sheet View ──
  if (isSheet) {
    return (
      <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Contact Sheet</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>
              {data.photoCount || 0} photos — {data.dimensions ? `${data.dimensions.width}×${data.dimensions.height}` : ""}
            </div>
          </div>
        </div>
        {data.outputPath && (
          <div style={{ borderRadius: 8, overflow: "hidden", background: "#252540" }}>
            <img src={`/media${data.outputPath}`} alt="Contact sheet" style={{ width: "100%", display: "block" }} onError={(e) => { e.target.style.display = "none"; e.target.parentElement.innerHTML = '<div style="padding:24px;text-align:center;opacity:0.5">Contact sheet saved to: ' + data.outputPath + '</div>'; }} />
          </div>
        )}
        {data.path && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => onAction("browse", { path: data.path })} style={btnStyle}>Browse Folder</button>
          </div>
        )}
      </div>
    );
  }

  // ── Upscale View ──
  if (isUpscale) {
    return (
      <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>AI Upscale</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>
              {data.metadata?.method || "AI"} — {data.metadata?.width}×{data.metadata?.height}
            </div>
          </div>
        </div>
        {data.outputPath && (
          <div style={{ borderRadius: 8, overflow: "hidden", background: "#252540" }}>
            <img src={`/media${data.outputPath}`} alt="Upscaled image" style={{ width: "100%", maxWidth: 600, display: "block" }} onError={(e) => { e.target.style.display = "none"; e.target.parentElement.innerHTML = '<div style="padding:24px;text-align:center;opacity:0.5">Upscaled image saved to: ' + data.outputPath + '</div>'; }} />
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.4 }}>
          {data.outputPath && `Saved to: ${data.outputPath}`}
        </div>
      </div>
    );
  }

  // ── Background Removal View ──
  if (isRmbg) {
    return (
      <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>✂️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Background Removed</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>{data.metadata?.method || "AI"} — {data.metadata?.format || "PNG"}</div>
          </div>
        </div>
        {data.outputPath && (
          <div style={{ borderRadius: 8, overflow: "hidden", background: "repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 20px 20px" }}>
            <img src={`/media${data.outputPath}`} alt="Background removed" style={{ width: "100%", maxWidth: 600, display: "block" }} onError={(e) => { e.target.style.display = "none"; e.target.parentElement.innerHTML = '<div style="padding:24px;text-align:center;opacity:0.5">Result saved to: ' + data.outputPath + '</div>'; }} />
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.4 }}>
          {data.outputPath && `Saved to: ${data.outputPath}`}
        </div>
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div style={{ padding: 16, background: "#1a1a2e", borderRadius: 12, color: "#e0e0e0" }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Media Processing</div>
      <pre style={{ fontSize: 12, opacity: 0.6, whiteSpace: "pre-wrap" }}>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

// ── Shared button style ──
const btnStyle = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)",
  color: "#e0e0e0",
  fontSize: 13,
  cursor: "pointer",
};

import type { ToolTemplate } from "../registry.js";

export function isBrowserSignature(signatureId: string): boolean {
  return signatureId === "remote_browser";
}

export function getBrowserTemplateCode(_signature: ToolTemplate): string {
  return BROWSER_TEMPLATE;
}

const BROWSER_TEMPLATE = `export default function GeneratedUI({ data, onAction }) {
  const [urlInput, setUrlInput] = useState(data?.url || "");
  const [typeText, setTypeText] = useState("");
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [imgError, setImgError] = useState(false);
  const imgRef = useRef(null);

  const hasScreenshot = Boolean(data?.screenshotUrl);
  const bookmarks = Array.isArray(data?.bookmarks) ? data.bookmarks : [];
  const vw = data?.viewportWidth || 1280;
  const vh = data?.viewportHeight || 800;

  useEffect(() => {
    if (data?.url) setUrlInput(data.url);
  }, [data?.url]);

  const handleNavigate = () => {
    if (!urlInput.trim()) return;
    onAction("navigate", { url: urlInput.trim() });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleNavigate();
  };

  const handleScreenshotClick = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = vw / rect.width;
    const scaleY = vh / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    onAction("click", { x, y });
  };

  const handleType = () => {
    if (!typeText.trim()) return;
    onAction("type", { text: typeText.trim(), submit: true });
    setTypeText("");
  };

  const handleTypeKeyDown = (e) => {
    if (e.key === "Enter") handleType();
  };

  // Group bookmarks by folder
  const folderMap = useMemo(() => {
    const map = {};
    bookmarks.forEach((bm) => {
      const folder = bm.folder || "Other";
      if (!map[folder]) map[folder] = [];
      map[folder].push(bm);
    });
    return map;
  }, [bookmarks]);
  const folders = Object.keys(folderMap);

  // ── Bookmarks-only view (no active page) ──
  if (!hasScreenshot) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        {/* URL bar */}
        <div className="flex items-center gap-2 p-3 bg-gray-800 border-b border-gray-700">
          <LucideReact.Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL to browse..."
            className="flex-1 bg-gray-700 text-sm text-gray-100 px-3 py-1.5 rounded-lg border border-gray-600 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleNavigate}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
          >Go</button>
        </div>

        {/* Bookmarks grid */}
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <LucideReact.Bookmark className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-gray-100">Bookmarks</span>
            <span className="text-xs text-gray-500">({bookmarks.length})</span>
          </div>

          {bookmarks.length === 0 ? (
            <EmptyState
              icon={LucideReact.BookmarkX}
              title="No bookmarks found"
              description="No Chrome or Edge bookmarks detected. Type a URL above to get started."
            />
          ) : (
            <div className="space-y-3 max-h-[480px] overflow-y-auto">
              {folders.map((folder) => (
                <div key={folder}>
                  <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <LucideReact.FolderOpen className="w-3 h-3" />
                    {folder}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {folderMap[folder].slice(0, 30).map((bm, idx) => (
                      <button
                        key={idx}
                        onClick={() => onAction("navigate", { url: bm.url })}
                        className="text-left bg-gray-800 rounded-lg border border-gray-700/60 px-3 py-2 hover:bg-gray-700/70 hover:border-gray-600 cursor-pointer transition-colors"
                      >
                        <div className="text-xs text-gray-200 truncate">{bm.name}</div>
                        <div className="text-[10px] text-gray-500 truncate mt-0.5">{bm.url.replace(/^https?:\\/\\//, "").slice(0, 40)}</div>
                        {bm.source ? (
                          <div className="mt-1">
                            <span className={"text-[9px] px-1.5 py-0.5 rounded-full " + (bm.source === "chrome" ? "bg-green-900/40 text-green-400" : "bg-blue-900/40 text-blue-400")}>
                              {bm.source}
                            </span>
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Browser view (active page with screenshot) ──
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Navigation bar */}
      <div className="flex items-center gap-1.5 p-2 bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => onAction("back", {})}
          disabled={!data?.canGoBack}
          className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 disabled:text-gray-600 cursor-pointer disabled:cursor-default"
          title="Back"
        >
          <LucideReact.ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAction("back", { forward: true })}
          disabled={!data?.canGoForward}
          className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 disabled:text-gray-600 cursor-pointer disabled:cursor-default"
          title="Forward"
        >
          <LucideReact.ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAction("navigate", { url: data?.url })}
          className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 cursor-pointer"
          title="Refresh"
        >
          <LucideReact.RotateCw className="w-4 h-4" />
        </button>

        {/* URL bar */}
        <div className="flex-1 flex items-center">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-gray-700 text-xs text-gray-100 px-3 py-1.5 rounded-lg border border-gray-600 outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={handleNavigate}
          className="p-1.5 rounded-md hover:bg-gray-700 text-blue-400 cursor-pointer"
          title="Go"
        >
          <LucideReact.ArrowRightCircle className="w-4 h-4" />
        </button>

        <button
          onClick={() => onAction("open", {})}
          className="p-1.5 rounded-md hover:bg-gray-700 text-amber-400 cursor-pointer"
          title="Home / Bookmarks"
        >
          <LucideReact.Home className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowBookmarks(!showBookmarks)}
          className={"p-1.5 rounded-md hover:bg-gray-700 cursor-pointer " + (showBookmarks ? "text-amber-300 bg-gray-700" : "text-gray-400")}
          title="Toggle bookmarks"
        >
          <LucideReact.Bookmark className="w-4 h-4" />
        </button>
      </div>

      {/* Page title */}
      {data?.title ? (
        <div className="px-3 py-1 bg-gray-800/50 border-b border-gray-700/50">
          <div className="text-[11px] text-gray-400 truncate">{data.title}</div>
        </div>
      ) : null}

      {/* Bookmarks dropdown */}
      {showBookmarks && bookmarks.length > 0 ? (
        <div className="border-b border-gray-700 bg-gray-800/80 p-2 max-h-40 overflow-y-auto">
          <div className="flex flex-wrap gap-1">
            {bookmarks.slice(0, 40).map((bm, idx) => (
              <button
                key={idx}
                onClick={() => { onAction("navigate", { url: bm.url }); setShowBookmarks(false); }}
                className="text-[10px] px-2 py-1 rounded-md bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-gray-100 cursor-pointer truncate max-w-[180px]"
                title={bm.url}
              >
                {bm.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Screenshot viewport */}
      <div className="relative cursor-crosshair" style={{ aspectRatio: vw + "/" + vh }}>
        {imgError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-500 text-sm">
            <LucideReact.ImageOff className="w-8 h-8 mr-2" />
            Screenshot failed to load
          </div>
        ) : (
          <img
            ref={imgRef}
            src={data?.screenshotUrl}
            alt="Browser viewport"
            className="w-full h-full object-contain"
            onClick={handleScreenshotClick}
            onError={() => setImgError(true)}
            draggable={false}
          />
        )}
      </div>

      {/* Bottom controls: scroll + type */}
      <div className="flex items-center gap-1.5 p-2 bg-gray-800 border-t border-gray-700">
        <button
          onClick={() => onAction("scroll", { direction: "up", amount: 400 })}
          className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 cursor-pointer"
          title="Scroll up"
        >
          <LucideReact.ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAction("scroll", { direction: "down", amount: 400 })}
          className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 cursor-pointer"
          title="Scroll down"
        >
          <LucideReact.ChevronDown className="w-4 h-4" />
        </button>

        <div className="flex-1 h-px bg-gray-700 mx-1" />

        <input
          type="text"
          value={typeText}
          onChange={(e) => setTypeText(e.target.value)}
          onKeyDown={handleTypeKeyDown}
          placeholder="Type text + Enter..."
          className="flex-1 bg-gray-700 text-xs text-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-600 outline-none focus:border-blue-500"
        />
        <button
          onClick={handleType}
          className="p-1.5 rounded-md hover:bg-gray-700 text-blue-400 cursor-pointer"
          title="Send text"
        >
          <LucideReact.SendHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}`;

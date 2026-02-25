import type { ToolTemplate } from "../registry.js";

export function isFilesystemSignature(signatureId: string): boolean {
  return signatureId === "directory_listing";
}

export function getFilesystemTemplateCode(_signature: ToolTemplate): string {
  return FILESYSTEM_TEMPLATE;
}

const FILESYSTEM_TEMPLATE = `export default function GeneratedUI({ data, onAction }) {
  const rows = Array.isArray(data?.rows)
    ? data.rows
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.matches)
        ? data.matches
        : [];
  const currentPath = String(data?.path ?? ".");
  const total = data?.total ?? rows.length;

  // View state
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingIdx, setRenamingIdx] = useState(-1);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [fileContent, setFileContent] = useState(null);

  // If the data contains file content (read_text_file result), show it
  const isFileView = data?.tool === "enso_fs_read_text_file" && data?.content != null;
  // If the data is an open_file result (media-aware viewer)
  const isOpenFileView = data?.tool === "enso_fs_open_file";
  // If the data contains stat info, show it
  const isStatView = data?.tool === "enso_fs_stat_path" && data?.type != null;
  // If the data contains drives list, show drives view
  const isDrivesView = data?.tool === "enso_fs_list_drives" || Array.isArray(data?.drives);

  const isDir = (type) => type === "directory" || type === "symlink";
  const formatSize = (bytes) => {
    if (bytes == null || bytes === 0) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  };
  const pathSep = currentPath.includes("\\\\") ? "\\\\" : "/";
  const segments = currentPath.split(/[\\\\/]/).filter(Boolean);
  const parentPath = segments.length > 1 ? segments.slice(0, -1).join(pathSep) : null;
  // On Windows, re-add drive letter prefix
  const buildPath = (segs) => {
    const p = segs.join(pathSep);
    return /^[a-zA-Z]$/.test(segs[0]) ? segs[0] + ":" + pathSep + segs.slice(1).join(pathSep) : p;
  };
  const fileIcon = (type, name) => {
    if (type === "directory") return "\uD83D\uDCC1";
    if (type === "symlink") return "\uD83D\uDD17";
    const ext = name.lastIndexOf(".") > 0 ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    if ([".png",".jpg",".jpeg",".gif",".webp",".svg",".bmp"].includes(ext)) return "\uD83D\uDDBC\uFE0F";
    if ([".mp4",".webm",".avi",".mov"].includes(ext)) return "\uD83C\uDFA5";
    if ([".mp3",".wav",".ogg",".flac"].includes(ext)) return "\uD83C\uDFB5";
    if ([".pdf"].includes(ext)) return "\uD83D\uDCC4";
    if ([".zip",".tar",".gz",".rar",".7z"].includes(ext)) return "\uD83D\uDCE6";
    if ([".js",".ts",".py",".sh",".rs",".go",".java",".c",".cpp",".h"].includes(ext)) return "\uD83D\uDCDD";
    return "\uD83D\uDCC4";
  };

  // Sort items — directories first, then by selected field
  const sorted = [...rows].sort((a, b) => {
    const aDir = isDir(a.type) ? 0 : 1;
    const bDir = isDir(b.type) ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    if (sortBy === "size") {
      const diff = (a.size ?? 0) - (b.size ?? 0);
      return sortDir === "asc" ? diff : -diff;
    }
    if (sortBy === "type") {
      const cmp = String(a.type ?? "").localeCompare(String(b.type ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    }
    const cmp = String(a.name ?? "").localeCompare(String(b.name ?? ""));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  };
  const sortArrow = (field) => sortBy === field ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  // ── File content viewer ──
  if (isFileView) {
    const fileName = currentPath.split(/[\\\\/]/).pop() || currentPath;
    const filePath = data.path ?? currentPath;
    const parent = filePath.split(/[\\\\/]/).slice(0, -1).join(pathSep);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => onAction("list_directory", { path: parent })}
              className="px-2 py-1 text-xs rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600 shrink-0"
            >\u2190 Back</button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">\uD83D\uDCDD {fileName}</div>
              <div className="text-[10px] text-gray-500 truncate">{data.path} \u2022 {formatSize(data.size)}{data.truncated ? " (truncated)" : ""}</div>
            </div>
          </div>
        </div>
        <pre className="bg-gray-950 border border-gray-700/60 rounded-lg p-3 text-xs text-gray-300 overflow-auto max-h-96 whitespace-pre-wrap break-words font-mono leading-relaxed">{data.content}</pre>
      </div>
    );
  }

  // ── Open file viewer (media-aware) ──
  if (isOpenFileView) {
    const filePath = data.path ?? currentPath;
    const parent = filePath.split(/[\\\\/]/).slice(0, -1).join(pathSep);
    const backBtn = (
      <button
        onClick={() => onAction("list_directory", { path: parent })}
        className="px-2 py-1 text-xs rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600 shrink-0"
      >\u2190 Back</button>
    );

    if (data.fileType === "image") {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {backBtn}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">\uD83D\uDDBC\uFE0F {data.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{data.path} \u2022 {formatSize(data.size)}</div>
            </div>
          </div>
          <div className="bg-gray-950 border border-gray-700/60 rounded-lg p-2 flex items-center justify-center min-h-[200px]">
            <img
              src={data.mediaUrl}
              alt={data.name}
              style={{ maxWidth: "100%", maxHeight: "480px", objectFit: "contain", borderRadius: "6px" }}
            />
          </div>
        </div>
      );
    }

    if (data.fileType === "video") {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {backBtn}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">\uD83C\uDFA5 {data.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{data.path} \u2022 {formatSize(data.size)}</div>
            </div>
          </div>
          <div className="bg-gray-950 border border-gray-700/60 rounded-lg p-2">
            <video
              src={data.mediaUrl}
              controls
              style={{ maxWidth: "100%", maxHeight: "480px", borderRadius: "6px" }}
            >
              Your browser does not support video playback.
            </video>
          </div>
        </div>
      );
    }

    if (data.fileType === "audio") {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {backBtn}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">\uD83C\uDFB5 {data.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{data.path} \u2022 {formatSize(data.size)}</div>
            </div>
          </div>
          <div className="bg-gray-950 border border-gray-700/60 rounded-lg px-4 py-6 flex flex-col items-center gap-3">
            <div className="text-3xl">\uD83C\uDFB5</div>
            <div className="text-sm text-gray-200 font-medium">{data.name}</div>
            <audio
              src={data.mediaUrl}
              controls
              style={{ width: "100%", maxWidth: "400px" }}
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        </div>
      );
    }

    if (data.fileType === "pdf") {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {backBtn}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">\uD83D\uDCC4 {data.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{data.path} \u2022 {formatSize(data.size)}</div>
            </div>
          </div>
          <div className="bg-gray-950 border border-gray-700/60 rounded-lg overflow-hidden" style={{ height: "500px" }}>
            <iframe
              src={data.mediaUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
              title={data.name}
            />
          </div>
        </div>
      );
    }

    if (data.fileType === "text" && data.content != null) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            {backBtn}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">\uD83D\uDCDD {data.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{data.path} \u2022 {formatSize(data.size)}{data.truncated ? " (truncated)" : ""}</div>
            </div>
          </div>
          <pre className="bg-gray-950 border border-gray-700/60 rounded-lg p-3 text-xs text-gray-300 overflow-auto max-h-96 whitespace-pre-wrap break-words font-mono leading-relaxed">{data.content}</pre>
        </div>
      );
    }

    // Unknown binary
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {backBtn}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">\uD83D\uDCC4 {data.name}</div>
            <div className="text-[10px] text-gray-500 truncate">{data.path} \u2022 {formatSize(data.size)}</div>
          </div>
        </div>
        <div className="bg-gray-800 border border-gray-700/50 rounded-lg px-4 py-6 text-center">
          <div className="text-2xl mb-2">\uD83D\uDCC2</div>
          <div className="text-xs text-gray-400">This file type ({data.ext || "unknown"}) cannot be previewed.</div>
          <div className="text-[10px] text-gray-500 mt-1">{formatSize(data.size)}</div>
        </div>
      </div>
    );
  }

  // ── Stat viewer ──
  if (isStatView) {
    const statPath = data.path ?? currentPath;
    const parent = statPath.split(/[\\\\/]/).slice(0, -1).join(pathSep);
    const fmtDate = (ms) => ms ? new Date(ms).toLocaleString() : "-";
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAction("list_directory", { path: parent })}
            className="px-2 py-1 text-xs rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600 shrink-0"
          >\u2190 Back</button>
          <div className="text-sm font-semibold text-gray-100 truncate">{fileIcon(data.type, statPath.split(/[\\\\/]/).pop())} {statPath.split(/[\\\\/]/).pop()}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Type", data.type],
            ["Size", formatSize(data.size)],
            ["Modified", fmtDate(data.mtimeMs)],
            ["Created", fmtDate(data.ctimeMs)],
            ["Accessed", fmtDate(data.atimeMs)],
            ["Mode", data.mode != null ? "0" + (data.mode & 0o777).toString(8) : "-"],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-800 rounded-md border border-gray-700/50 px-2.5 py-1.5">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
              <div className="text-xs text-gray-200">{val}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 truncate">Full path: {statPath}</div>
      </div>
    );
  }

  // ── Drives view ──
  if (isDrivesView) {
    const drives = Array.isArray(data?.drives) ? data.drives : [];
    const home = data?.home ?? "";
    const cwd = data?.cwd ?? "";
    const driveIcon = (name) => {
      const n = String(name).toLowerCase();
      if (n.includes("volume") || n.includes("mnt")) return "\uD83D\uDCBF";
      if (n.startsWith("~") || n.includes("home") || n.includes("users")) return "\uD83C\uDFE0";
      if (/^[a-z]:/i.test(n)) return "\uD83D\uDCBE";
      if (n === "/") return "\uD83D\uDDA5\uFE0F";
      return "\uD83D\uDCBE";
    };
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-100">\uD83D\uDCBB System Drives</div>
          <button
            onClick={() => onAction("list_drives", {})}
            className="px-2 py-1 text-[11px] rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600"
          >\u21BB Refresh</button>
        </div>

        {/* Quick-access */}
        {(home || cwd) && (
          <div className="flex gap-2">
            {home && (
              <button
                onClick={() => onAction("list_directory", { path: home })}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-blue-600/15 border border-blue-500/40 hover:bg-blue-600/25 text-blue-300 transition-colors"
              ><span>\uD83C\uDFE0</span> Home <span className="text-[10px] text-blue-400/60 truncate max-w-[140px]">({home})</span></button>
            )}
            {cwd && cwd !== home && (
              <button
                onClick={() => onAction("list_directory", { path: cwd })}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-purple-600/15 border border-purple-500/40 hover:bg-purple-600/25 text-purple-300 transition-colors"
              ><span>\uD83D\uDCC2</span> Working Dir <span className="text-[10px] text-purple-400/60 truncate max-w-[140px]">({cwd})</span></button>
            )}
          </div>
        )}

        {/* Drives grid */}
        <div className="grid grid-cols-2 gap-2">
          {drives.map((drive, idx) => (
            <button
              key={drive.path || idx}
              onClick={() => onAction("list_directory", { path: drive.path })}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700/60 hover:bg-gray-700/70 hover:border-gray-600 transition-colors text-left group"
            >
              <span className="text-lg">{driveIcon(drive.name)}</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-200 group-hover:text-gray-100 truncate">{drive.name}</div>
                {drive.path !== drive.name && <div className="text-[10px] text-gray-500 truncate">{drive.path}</div>}
              </div>
            </button>
          ))}
        </div>

        {drives.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-gray-500">No drives detected.</div>
        )}
        <div className="text-[10px] text-gray-500">{drives.length} drive{drives.length !== 1 ? "s" : ""} available</div>
      </div>
    );
  }

  // ── Main directory view ──
  return (
    <div className="space-y-2">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap text-xs">
        {segments.map((seg, i) => {
          const navPath = buildPath(segments.slice(0, i + 1));
          const isLast = i === segments.length - 1;
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-600">/</span>}
              {isLast ? (
                <span className="text-gray-200 font-medium">{seg}</span>
              ) : (
                <button onClick={() => onAction("list_directory", { path: navPath })} className="text-blue-400 hover:text-blue-300 hover:underline">{seg}</button>
              )}
            </span>
          );
        })}
        <span className="text-gray-600 ml-1">({total} items)</span>
      </div>

      {/* Toolbar */}
      <div className="flex gap-1.5 flex-wrap">
        {parentPath && (
          <button
            onClick={() => onAction("list_directory", { path: buildPath(segments.slice(0, -1)) })}
            className="px-2 py-1 text-[11px] rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600"
          >\u2191 Up</button>
        )}
        <button
          onClick={() => onAction("list_drives", {})}
          className="px-2 py-1 text-[11px] rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600"
          title="Show all system drives"
        >\uD83D\uDCBB Drives</button>
        <button
          onClick={() => onAction("refresh", {})}
          className="px-2 py-1 text-[11px] rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600"
        >\u21BB Refresh</button>
        <button
          onClick={() => { setShowNewFolder(true); setNewFolderName(""); }}
          className="px-2 py-1 text-[11px] rounded-md bg-emerald-700/30 border border-emerald-500/50 hover:bg-emerald-700/45 text-emerald-300"
        >+ New Folder</button>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query.trim() && onAction("search_paths", { path: currentPath, query, type: "any" })}
            placeholder="Search..."
            className="w-36 bg-gray-800 border border-gray-600/60 rounded-md px-2 py-1 text-[11px] text-gray-100 focus:outline-none focus:border-blue-500/50"
          />
          <button
            onClick={() => query.trim() && onAction("search_paths", { path: currentPath, query, type: "any" })}
            className="px-2 py-1 text-[11px] rounded-md bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/45"
          >\uD83D\uDD0D</button>
        </div>
      </div>

      {/* New folder inline form */}
      {showNewFolder && (
        <div className="flex items-center gap-1.5 bg-gray-800 rounded-md border border-emerald-500/30 px-2 py-1.5">
          <span className="text-xs">\uD83D\uDCC1</span>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) {
                onAction("create_directory", { path: currentPath + pathSep + newFolderName.trim() });
                setShowNewFolder(false);
              }
              if (e.key === "Escape") setShowNewFolder(false);
            }}
            placeholder="Folder name"
            autoFocus
            className="flex-1 bg-gray-900 border border-gray-600/60 rounded px-2 py-0.5 text-xs text-gray-100 focus:outline-none"
          />
          <button
            onClick={() => {
              if (newFolderName.trim()) {
                onAction("create_directory", { path: currentPath + pathSep + newFolderName.trim() });
                setShowNewFolder(false);
              }
            }}
            className="px-2 py-0.5 text-[11px] rounded bg-emerald-600/40 border border-emerald-500/50 hover:bg-emerald-600/60 text-emerald-200"
          >Create</button>
          <button onClick={() => setShowNewFolder(false)} className="text-gray-500 hover:text-gray-300 text-xs px-1">\u2715</button>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-500/40 rounded-md px-2.5 py-2">
          <span className="text-xs text-rose-300 flex-1 truncate">Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</span>
          <button
            onClick={() => { onAction("delete_path", { path: confirmDelete.path }); setConfirmDelete(null); }}
            className="px-2 py-0.5 text-[11px] rounded bg-rose-600/50 border border-rose-500/60 hover:bg-rose-600/70 text-rose-100"
          >Delete</button>
          <button onClick={() => setConfirmDelete(null)} className="text-gray-400 hover:text-gray-200 text-xs px-1">Cancel</button>
        </div>
      )}

      {/* Column header */}
      <div className="grid grid-cols-[1fr_70px_80px_auto] gap-2 px-2 text-[10px] text-gray-500 uppercase tracking-wide border-b border-gray-700/50 pb-1">
        <button onClick={() => toggleSort("name")} className="text-left hover:text-gray-300">Name{sortArrow("name")}</button>
        <button onClick={() => toggleSort("size")} className="text-right hover:text-gray-300">Size{sortArrow("size")}</button>
        <button onClick={() => toggleSort("type")} className="text-left hover:text-gray-300">Type{sortArrow("type")}</button>
        <span>Actions</span>
      </div>

      {/* File list */}
      <div className="space-y-0.5 max-h-80 overflow-y-auto">
        {sorted.length > 0 ? sorted.slice(0, 100).map((item, idx) => {
          const name = String(item?.name ?? "");
          const type = String(item?.type ?? "file");
          const itemPath = String(item?.path ?? "");
          const isRenaming = renamingIdx === idx;
          return (
            <div key={itemPath || idx} className="group grid grid-cols-[1fr_70px_80px_auto] gap-2 items-center px-2 py-1.5 rounded-md hover:bg-gray-800/60 transition-colors">
              {/* Name */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm shrink-0">{fileIcon(type, name)}</span>
                {isRenaming ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renameValue.trim() && renameValue !== name) {
                        onAction("rename_path", { path: itemPath, newName: renameValue.trim() });
                        setRenamingIdx(-1);
                      }
                      if (e.key === "Escape") setRenamingIdx(-1);
                    }}
                    autoFocus
                    className="flex-1 bg-gray-900 border border-blue-500/50 rounded px-1.5 py-0.5 text-xs text-gray-100 focus:outline-none min-w-0"
                  />
                ) : (
                  isDir(type) ? (
                    <button onClick={() => onAction("list_directory", { path: itemPath })} className="text-xs text-blue-300 hover:text-blue-200 hover:underline truncate text-left">{name}</button>
                  ) : (
                    <button onClick={() => onAction("open_file", { path: itemPath })} className="text-xs text-gray-200 hover:text-blue-300 hover:underline truncate text-left">{name}</button>
                  )
                )}
              </div>
              {/* Size */}
              <div className="text-[11px] text-gray-400 text-right">{isDir(type) ? "-" : formatSize(item.size)}</div>
              {/* Type */}
              <div className="text-[10px] text-gray-500">{type}{item.extension ? " ." + item.extension : ""}</div>
              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isDir(type) && (
                  <button onClick={() => onAction("open_file", { path: itemPath })} className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-700/30 border border-emerald-500/40 hover:bg-emerald-700/50 text-emerald-300" title="Open file">\u{1F4D6}</button>
                )}
                <button onClick={() => onAction("stat_path", { path: itemPath })} className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 border border-gray-600 hover:bg-gray-600" title="Info">\u2139\uFE0F</button>
                <button onClick={() => { setRenamingIdx(idx); setRenameValue(name); }} className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 border border-gray-600 hover:bg-gray-600" title="Rename">\u270F\uFE0F</button>
                <button onClick={() => setConfirmDelete({ name, path: itemPath })} className="px-1.5 py-0.5 text-[10px] rounded bg-rose-700/25 border border-rose-500/40 hover:bg-rose-700/45 text-rose-300" title="Delete">\uD83D\uDDD1\uFE0F</button>
              </div>
            </div>
          );
        }) : (
          <div className="px-2 py-6 text-center text-xs text-gray-500">
            This directory is empty.
          </div>
        )}
      </div>
    </div>
  );
}`;

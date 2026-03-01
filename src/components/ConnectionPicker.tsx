import { useState, useEffect } from "react";
import { useChatStore } from "../store/chat";
import {
  loadBackends,
  addBackend,
  removeBackend,
  clearActiveBackend,
  type BackendConfig,
} from "../lib/connection";

type TestStatus = "idle" | "testing" | "ok" | "fail";

export default function ConnectionPicker() {
  const show = useChatStore((s) => s.showConnectionPicker);
  const setShow = useChatStore((s) => s.setShowConnectionPicker);
  const connectToBackend = useChatStore((s) => s.connectToBackend);
  const connectionState = useChatStore((s) => s.connectionState);
  const connect = useChatStore((s) => s.connect);

  const [backends, setBackends] = useState<BackendConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMsg, setTestMsg] = useState("");

  // Refresh list when opened
  useEffect(() => {
    if (show) {
      setBackends(loadBackends());
      setShowAdd(false);
      setTestStatus("idle");
      setTestMsg("");
    }
  }, [show]);

  if (!show) return null;

  function handleTest() {
    const testUrl = url.replace(/\/+$/, "");
    if (!testUrl) { setTestMsg("Enter a URL first"); setTestStatus("fail"); return; }
    setTestStatus("testing");
    setTestMsg("");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`${testUrl}/health`, { headers, signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.status === "ok") {
          setTestStatus("ok");
          const machine = data.machine as { name?: string; hostname?: string; platform?: string; arch?: string; memoryGB?: number } | undefined;
          const parts: string[] = [];
          if (machine?.name) {
            parts.push(machine.name);
            // Auto-fill name field if empty
            if (!name.trim()) setName(machine.name);
          }
          if (machine?.platform) parts.push(`${machine.platform}/${machine.arch}`);
          if (machine?.memoryGB) parts.push(`${machine.memoryGB}GB`);
          if (!parts.length) parts.push("Connected");
          setTestMsg(parts.join(" · "));
        } else {
          setTestStatus("fail");
          setTestMsg("Unexpected response");
        }
      })
      .catch((err: Error) => {
        setTestStatus("fail");
        setTestMsg(err.message || "Connection failed");
      });
  }

  function handleAdd() {
    if (!url.trim()) return;
    const config = addBackend({
      name: name.trim() || new URL(url).hostname,
      url: url.replace(/\/+$/, ""),
      token: token.trim(),
    });
    setBackends(loadBackends());
    setShowAdd(false);
    setName(""); setUrl(""); setToken("");
    connectToBackend(config);
    setShow(false);
  }

  function handleConnect(config: BackendConfig) {
    connectToBackend(config);
    setShow(false);
  }

  function handleRemove(id: string) {
    removeBackend(id);
    setBackends(loadBackends());
  }

  function handleLocalMode() {
    clearActiveBackend();
    connect();
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShow(false)}>
      <div className="bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Connect to Backend</h2>
            <p className="text-xs text-gray-500 mt-0.5">Choose an OpenClaw server to connect to</p>
          </div>
          <button onClick={() => setShow(false)} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Local mode button */}
          <button
            onClick={handleLocalMode}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/80 transition-colors text-left group"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">Local Server</div>
              <div className="text-xs text-gray-500">Same-origin (default dev mode)</div>
            </div>
            {connectionState === "connected" && !loadBackends().find(() => false) && (
              <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            )}
          </button>

          {/* Saved backends */}
          {backends.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <button
                onClick={() => handleConnect(b)}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/80 transition-colors text-left"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200 truncate">{b.name}</div>
                  <div className="text-xs text-gray-500 truncate">{b.url}</div>
                </div>
              </button>
              <button
                onClick={() => handleRemove(b.id)}
                className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                title="Remove"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          ))}

          {/* Add backend form */}
          {showAdd ? (
            <div className="border border-gray-700/50 rounded-lg p-3 space-y-2.5 bg-gray-800/30">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-server:3001"
                className="w-full px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Access token"
                type="password"
                className="w-full px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleTest}
                  disabled={testStatus === "testing"}
                  className="text-xs px-2.5 py-1 rounded-md border border-gray-600/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 transition-colors disabled:opacity-50"
                >
                  {testStatus === "testing" ? "Testing..." : "Test"}
                </button>
                {testStatus === "ok" && <span className="text-xs text-emerald-400">{testMsg}</span>}
                {testStatus === "fail" && <span className="text-xs text-red-400">{testMsg}</span>}
                <div className="flex-1" />
                <button
                  onClick={() => setShowAdd(false)}
                  className="text-xs px-2.5 py-1 rounded-md text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!url.trim()}
                  className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-40"
                >
                  Connect
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors text-sm"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Remote Server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

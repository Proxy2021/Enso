import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { SystemEnhanceDialog } from "./SystemEnhanceDialog";
import type { AppInfo } from "@shared/types";

// ── Types ──

interface SprintMeta {
  sprintId: string;
  goal?: string;
  startedAt: number;
  completedAt?: number;
  status: string;
  phases?: Record<string, boolean>;
  files?: string[];
}

interface DiscoveryMeta {
  discoveryId: string;
  focus?: string;
  startedAt: number;
  completedAt?: number;
  phases?: Record<string, boolean>;
  files?: string[];
}

// ── Helpers ──

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ──

export default function EvolveView() {
  const { t } = useT();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);
  const apps = useChatStore((s) => s.apps);
  const fetchApps = useChatStore((s) => s.fetchApps);
  const deleteApp = useChatStore((s) => s.deleteApp);
  const runApp = useChatStore((s) => s.runApp);

  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  const [showBuildDialog, setShowBuildDialog] = useState(false);
  const [sprints, setSprints] = useState<SprintMeta[]>([]);
  const [discoveries, setDiscoveries] = useState<DiscoveryMeta[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(true);
  const [loadingDiscoveries, setLoadingDiscoveries] = useState(true);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const fetchSprints = useCallback(async () => {
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/evolution-sprints`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSprints(data.sprints ?? []);
      }
    } catch { /* ignore */ }
    setLoadingSprints(false);
  }, []);

  const fetchDiscoveries = useCallback(async () => {
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/discovery-results`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDiscoveries(data.discoveries ?? []);
      }
    } catch { /* ignore */ }
    setLoadingDiscoveries(false);
  }, []);

  useEffect(() => { fetchSprints(); fetchDiscoveries(); }, [fetchSprints, fetchDiscoveries]);

  const switchToChatAndSend = (msg: string) => {
    sendMessage(msg);
    setActiveTab("chat");
    setChatViewOpen(true);
  };

  const userApps = apps.filter((a) => !a.system && !a.shipped);
  const systemApps = apps.filter((a) => a.system || a.shipped);

  return (
    <div className="flex-1 overflow-y-auto mobile-view-enter">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-8">

        {/* Quick Actions */}
        <section>
          <h1 className="text-lg font-semibold text-gray-100 mb-4">{t("tab.evolve")}</h1>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickAction
              icon={<SparklesIcon />}
              label={t("welcome.tile.evolve")}
              sublabel={t("welcome.tile.evolve.desc")}
              accent="purple"
              onClick={() => switchToChatAndSend("/evolve")}
            />
            <QuickAction
              icon={<SearchIcon />}
              label={t("welcome.tile.discover")}
              sublabel={t("welcome.tile.discover.desc")}
              accent="amber"
              onClick={() => switchToChatAndSend("/discover")}
            />
            <QuickAction
              icon={<HammerIcon />}
              label="Build App"
              sublabel="Create a new app"
              accent="orange"
              onClick={() => setShowBuildDialog(true)}
            />
            <QuickAction
              icon={<WrenchIcon />}
              label={t("dialog.systemEnhance")}
              sublabel="Improve Enso itself"
              accent="cyan"
              onClick={() => setShowEnhanceDialog(true)}
            />
          </div>
        </section>

        {/* App Ecosystem */}
        <section>
          <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-3">App Ecosystem</h2>
          {apps.length === 0 ? (
            <p className="text-sm text-gray-600">No apps installed</p>
          ) : (
            <>
              {userApps.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">User Apps</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {userApps.map((app) => (
                      <AppCard key={app.appId} app={app} onRun={runApp} onDelete={deleteApp} />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">System & Shipped</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {systemApps.map((app) => (
                    <AppCard key={app.appId} app={app} onRun={runApp} />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Evolution History */}
        <section>
          <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-3">Evolution History</h2>
          {loadingSprints ? (
            <p className="text-sm text-gray-600">Loading sprints...</p>
          ) : sprints.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p className="text-sm">No evolution sprints yet</p>
              <p className="text-xs mt-1">Type /evolve to start your first sprint</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sprints.map((sp) => (
                <button
                  key={sp.sprintId}
                  onClick={() => switchToChatAndSend("/evolution-history")}
                  className="w-full text-left rounded-xl border border-gray-800/50 bg-gray-900/30 hover:bg-gray-800/40 px-4 py-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border bg-purple-500/20 text-purple-300 border-purple-500/30">sprint</span>
                      <span className={`text-[10px] font-medium ${sp.status === "complete" ? "text-emerald-400" : "text-yellow-400"}`}>{sp.status}</span>
                    </div>
                    <span className="text-[10px] text-gray-600">{formatDate(sp.startedAt)}</span>
                  </div>
                  {sp.goal && <p className="text-xs text-gray-400 mt-1 truncate">{sp.goal}</p>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Discovery History */}
        <section>
          <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-3">Discovery History</h2>
          {loadingDiscoveries ? (
            <p className="text-sm text-gray-600">Loading discoveries...</p>
          ) : discoveries.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p className="text-sm">No discovery sprints yet</p>
              <p className="text-xs mt-1">Type /discover to launch your first AI VC discovery</p>
            </div>
          ) : (
            <div className="space-y-2">
              {discoveries.map((d) => (
                <button
                  key={d.discoveryId}
                  onClick={() => switchToChatAndSend("/discovery-history")}
                  className="w-full text-left rounded-xl border border-gray-800/50 bg-gray-900/30 hover:bg-gray-800/40 px-4 py-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border bg-amber-500/20 text-amber-300 border-amber-500/30">discovery</span>
                    </div>
                    <span className="text-[10px] text-gray-600">{formatDate(d.startedAt)}</span>
                  </div>
                  {d.focus && <p className="text-xs text-gray-400 mt-1 truncate">{d.focus}</p>}
                </button>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Dialogs */}
      {showEnhanceDialog && (
        <SystemEnhanceDialog onClose={() => setShowEnhanceDialog(false)} />
      )}
      {showBuildDialog && (
        <BuildAppQuickDialog onClose={() => setShowBuildDialog(false)} />
      )}
    </div>
  );
}

// ── Subcomponents ──

function QuickAction({ icon, label, sublabel, accent, onClick }: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  accent: string;
  onClick: () => void;
}) {
  const accentClasses: Record<string, string> = {
    purple: "from-purple-500/15 to-purple-500/5 border-purple-500/25 hover:border-purple-500/40 text-purple-300",
    amber: "from-amber-500/15 to-amber-500/5 border-amber-500/25 hover:border-amber-500/40 text-amber-300",
    orange: "from-orange-500/15 to-orange-500/5 border-orange-500/25 hover:border-orange-500/40 text-orange-300",
    cyan: "from-cyan-500/15 to-cyan-500/5 border-cyan-500/25 hover:border-cyan-500/40 text-cyan-300",
  };
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border bg-gradient-to-b transition-all active:scale-[0.97] cursor-pointer ${accentClasses[accent] ?? accentClasses.purple}`}
    >
      <div className="w-8 h-8 flex items-center justify-center">{icon}</div>
      <div className="text-center">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">{sublabel}</p>
      </div>
    </button>
  );
}

function AppCard({ app, onRun, onDelete }: { app: AppInfo; onRun: (id: string) => void; onDelete?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-800/50 bg-gray-900/30 hover:bg-gray-800/30 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
        {app.appId.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{app.appId}</p>
        <p className="text-[10px] text-gray-500 truncate">{app.description}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onRun(app.toolFamily)} className="px-2 py-1 text-[10px] rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 transition-colors cursor-pointer">Run</button>
        {onDelete && (
          <button onClick={() => onDelete(app.toolFamily)} className="px-2 py-1 text-[10px] rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors cursor-pointer">Del</button>
        )}
      </div>
    </div>
  );
}

function BuildAppQuickDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-5 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-100 mb-2">Build App</h3>
        <p className="text-xs text-gray-500 mb-3">Describe what app you want. Claude Code will build it.</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g., a weather dashboard with forecast charts..."
          className="w-full h-24 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder:text-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/40"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">Cancel</button>
          <button
            onClick={() => {
              if (text.trim()) {
                sendMessage(`Build an Enso app: ${text.trim()}`);
                setActiveTab("chat");
                setChatViewOpen(true);
                onClose();
              }
            }}
            disabled={!text.trim()}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-40 cursor-pointer"
          >
            Build
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icons ──

function SparklesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function HammerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
      <path d="m18 15 4-4" />
      <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

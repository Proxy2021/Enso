import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { formatDate } from "../lib/time-utils";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { SystemEnhanceDialog } from "./SystemEnhanceDialog";
import { MobileViewHeader } from "./TabNavigation";
import type { AppInfo } from "@shared/types";

// ── App Icon ──

const S = 14; // default icon size for app icons

const APP_ICONS: Record<string, { icon: (s: number) => React.ReactNode; color: string; bg: string }> = {
  filesystem:    { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>, color: "text-blue-400", bg: "bg-blue-500/15" },
  web_browser:   { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, color: "text-sky-400", bg: "bg-sky-500/15" },
  researcher:    { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  clawhub:       { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>, color: "text-violet-400", bg: "bg-violet-500/15" },
  media_gallery: { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>, color: "text-pink-400", bg: "bg-pink-500/15" },
  photo_studio:  { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>, color: "text-rose-400", bg: "bg-rose-500/15" },
  seedance:      { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>, color: "text-orange-400", bg: "bg-orange-500/15" },
  data_analyzer: { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>, color: "text-cyan-400", bg: "bg-cyan-500/15" },
  market_intelligence: { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>, color: "text-amber-400", bg: "bg-amber-500/15" },
  remote_desktop: { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>, color: "text-teal-400", bg: "bg-teal-500/15" },
  note_keeper:   { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>, color: "text-yellow-400", bg: "bg-yellow-500/15" },
  world_clock:   { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, color: "text-indigo-400", bg: "bg-indigo-500/15" },
  video_studio:  { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>, color: "text-red-400", bg: "bg-red-500/15" },
  file_organizer: { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m15 13-3-3-3 3"/></svg>, color: "text-green-400", bg: "bg-green-500/15" },
  intake_form_builder: { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>, color: "text-lime-400", bg: "bg-lime-500/15" },
  alpharank:     { icon: (z) => <svg width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8" rx="1"/><rect x="14" y="5" width="3" height="13" rx="1"/></svg>, color: "text-purple-400", bg: "bg-purple-500/15" },
};

/** Renders an icon for an app — uses known icons or falls back to the first letter. */
export function AppIcon({ appId, size = 28 }: { appId: string; size?: number }) {
  const entry = APP_ICONS[appId];
  const iconSize = Math.round(size * 0.5);
  if (entry) {
    return (
      <div className={`rounded-lg ${entry.bg} flex items-center justify-center ${entry.color} shrink-0`} style={{ width: size, height: size }}>
        {entry.icon(iconSize)}
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0" style={{ width: size, height: size }}>
      {appId.charAt(0).toUpperCase()}
    </div>
  );
}

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

// ── Component ──

export default function EvolveView() {
  const { t } = useT();
  const launchCommandInNewChat = useChatStore((s) => s.launchCommandInNewChat);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);
  const apps = useChatStore((s) => s.apps);
  const fetchApps = useChatStore((s) => s.fetchApps);
  const deleteApp = useChatStore((s) => s.deleteApp);
  const storeRunApp = useChatStore((s) => s.runApp);

  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  const [showBuildDialog, setShowBuildDialog] = useState(false);
  const [evolveDialog, setEvolveDialog] = useState<{ title: string; description: string; placeholder: string; baseCommand: string; accent: string } | null>(null);
  const [sprints, setSprints] = useState<SprintMeta[]>([]);
  const [discoveries, setDiscoveries] = useState<DiscoveryMeta[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(true);
  const [loadingDiscoveries, setLoadingDiscoveries] = useState(true);
  const [sprintError, setSprintError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const fetchSprints = useCallback(async () => {
    try {
      setSprintError(null);
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/evolution-sprints`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSprints(data.sprints ?? []);
      } else {
        setSprintError(`Failed to load sprints (${res.status})`);
      }
    } catch {
      setSprintError("Could not connect to server");
    }
    setLoadingSprints(false);
  }, []);

  const fetchDiscoveries = useCallback(async () => {
    try {
      setDiscoveryError(null);
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/discovery-results`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDiscoveries(data.results ?? []);
      } else {
        setDiscoveryError(`Failed to load discoveries (${res.status})`);
      }
    } catch {
      setDiscoveryError("Could not connect to server");
    }
    setLoadingDiscoveries(false);
  }, []);

  useEffect(() => { fetchSprints(); fetchDiscoveries(); }, [fetchSprints, fetchDiscoveries]);

  const runApp = (toolFamily: string) => {
    storeRunApp(toolFamily);
    setActiveTab("chat");
    setChatViewOpen(true);
  };

  const openEvolveProject = () => setEvolveDialog({
    title: "Evolve Project",
    description: "Run an AI sprint to improve Enso. Optionally specify a focus area.",
    placeholder: "e.g., improve the chat experience, fix mobile layout issues...",
    baseCommand: "/evolve",
    accent: "purple",
  });

  const openDiscover = () => setEvolveDialog({
    title: "AI Discovery",
    description: "Find market opportunities and project ideas. Optionally specify a focus.",
    placeholder: "e.g., AI tools for education, developer productivity...",
    baseCommand: "/discover",
    accent: "amber",
  });

  const openEvolveApp = (appId: string) => setEvolveDialog({
    title: `Evolve: ${appId}`,
    description: `Improve the "${appId}" app with Claude Code. Optionally describe what to improve.`,
    placeholder: "e.g., add dark mode, improve the chart layout, add export...",
    baseCommand: `/code Improve and enhance the "${appId}" app. Review its current template and executors, then make meaningful improvements.`,
    accent: "purple",
  });

  const userApps = apps.filter((a) => !a.system && !a.shipped);
  const systemApps = apps.filter((a) => a.system || a.shipped);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 mobile-view-enter">
      <MobileViewHeader title={t("tab.evolve")} />
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-6 space-y-6 sm:space-y-8">

        {/* Quick Actions */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickAction
              icon={<SparklesIcon />}
              label={t("welcome.tile.evolve")}
              sublabel={t("welcome.tile.evolve.desc")}
              accent="purple"
              onClick={openEvolveProject}
            />
            <QuickAction
              icon={<SearchIcon />}
              label={t("welcome.tile.discover")}
              sublabel={t("welcome.tile.discover.desc")}
              accent="amber"
              onClick={openDiscover}
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
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {userApps.map((app) => (
                      <AppCard key={app.appId} app={app} onRun={runApp} onDelete={deleteApp} onEvolve={openEvolveApp} />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">System & Shipped</p>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {systemApps.map((app) => (
                    <AppCard key={app.appId} app={app} onRun={runApp} onEvolve={openEvolveApp} />
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
          ) : sprintError ? (
            <div className="text-center py-4">
              <p className="text-sm text-red-400">{sprintError}</p>
              <button onClick={fetchSprints} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Retry</button>
            </div>
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
                  onClick={() => launchCommandInNewChat("/evolution-history")}
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
          ) : discoveryError ? (
            <div className="text-center py-4">
              <p className="text-sm text-red-400">{discoveryError}</p>
              <button onClick={fetchDiscoveries} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Retry</button>
            </div>
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
                  onClick={() => launchCommandInNewChat("/discovery-history")}
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
      </div>

      {showEnhanceDialog && (
        <SystemEnhanceDialog onClose={() => setShowEnhanceDialog(false)} />
      )}
      {showBuildDialog && (
        <BuildAppQuickDialog onClose={() => setShowBuildDialog(false)} />
      )}
      {evolveDialog && (
        <EvolveInstructionDialog
          {...evolveDialog}
          onClose={() => setEvolveDialog(null)}
          onLaunch={(cmd) => { setEvolveDialog(null); launchCommandInNewChat(cmd); }}
        />
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
      className={`flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-2xl border bg-gradient-to-b transition-all active:scale-[0.97] cursor-pointer ${accentClasses[accent] ?? accentClasses.purple}`}
    >
      <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">{icon}</div>
      <div className="text-center">
        <p className="text-xs sm:text-sm font-medium">{label}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 hidden sm:block">{sublabel}</p>
      </div>
    </button>
  );
}

function AppCard({ app, onRun, onDelete, onEvolve }: { app: AppInfo; onRun: (id: string) => void; onDelete?: (id: string) => void; onEvolve?: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl border border-gray-800/50 bg-gray-900/30 hover:bg-gray-800/30 active:bg-gray-800/40 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <AppIcon appId={app.appId} size={24} />
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-gray-200 truncate">{app.appId}</p>
          <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">{app.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onEvolve && (
          <button onClick={() => onEvolve(app.appId)} className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] rounded bg-purple-500/10 text-purple-400 border border-purple-500/25 hover:bg-purple-500/20 active:bg-purple-500/25 transition-colors cursor-pointer">Evolve</button>
        )}
        <button onClick={() => onRun(app.toolFamily)} className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 active:bg-indigo-500/25 transition-colors cursor-pointer">Run</button>
        {onDelete && (
          <button onClick={() => onDelete(app.toolFamily)} className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 active:bg-red-500/25 transition-colors cursor-pointer">Del</button>
        )}
      </div>
    </div>
  );
}

function BuildAppQuickDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const launchCommandInNewChat = useChatStore((s) => s.launchCommandInNewChat);

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
            onClick={async () => {
              if (text.trim()) {
                await launchCommandInNewChat(`Build an Enso app: ${text.trim()}`);
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

const ACCENT_CLASSES: Record<string, { ring: string; btn: string; btnText: string; btnBorder: string; btnHover: string }> = {
  purple: { ring: "focus:ring-purple-500/40", btn: "bg-purple-500/20", btnText: "text-purple-300", btnBorder: "border-purple-500/30", btnHover: "hover:bg-purple-500/30" },
  amber: { ring: "focus:ring-amber-500/40", btn: "bg-amber-500/20", btnText: "text-amber-300", btnBorder: "border-amber-500/30", btnHover: "hover:bg-amber-500/30" },
};

function EvolveInstructionDialog({ title, description, placeholder, baseCommand, accent, onClose, onLaunch }: {
  title: string; description: string; placeholder: string; baseCommand: string; accent: string;
  onClose: () => void; onLaunch: (command: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const colors = ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.purple;

  const handleLaunch = () => {
    const cmd = instruction.trim()
      ? `${baseCommand} ${instruction.trim()}`
      : baseCommand;
    onLaunch(cmd);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-5 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-100 mb-1">{title}</h3>
        <p className="text-xs text-gray-500 mb-3">{description}</p>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={placeholder}
          className={`w-full h-20 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder:text-gray-600 resize-none focus:outline-none focus:ring-1 ${colors.ring}`}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">Cancel</button>
          <button
            onClick={handleLaunch}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg ${colors.btn} ${colors.btnText} border ${colors.btnBorder} ${colors.btnHover} transition-colors cursor-pointer`}
          >
            {instruction.trim() ? "Launch" : "Launch (default)"}
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

import type { ReactNode } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import SettingsPanel from "./SettingsPanel";
import DebugReporter from "./DebugReporter";

type TabId = "chat" | "cortex" | "tasks" | "evolve" | "projects" | "me";

/** Controls-only header bar for tabs that need action buttons. Desktop only.
 *  No title — the active tab in the rail already labels the view. */
export function TabHeader({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="hidden sm:flex items-center justify-end px-4 py-1.5 border-b border-gray-800/60 bg-gray-950/50 shrink-0">
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Lightweight mobile header with safe area padding and optional title + controls.
 *  Shown only on mobile (sm:hidden). Provides consistent top chrome across all tabs. */
export function MobileViewHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="sm:hidden flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 bg-gray-950/90 backdrop-blur-lg shrink-0">
      <h1 className="text-lg font-bold text-gray-100 tracking-tight">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

const ICON_SIZE = 20;

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TasksIcon({ active }: { active: boolean }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function EvolveIcon({ active }: { active: boolean }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
      {active && <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function ProjectsIcon({ active }: { active: boolean }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function MeIcon({ active }: { active: boolean }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CortexIcon({ active }: { active: boolean }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a6 6 0 0 0-6 6c0 1.5.5 2.8 1.4 3.8A6 6 0 0 0 6 16c0 2.2 1.2 4.2 3 5.2" />
      <path d="M12 2a6 6 0 0 1 6 6c0 1.5-.5 2.8-1.4 3.8A6 6 0 0 1 18 16c0 2.2-1.2 4.2-3 5.2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10V6" /><path d="M12 14v4" />
      <path d="M10.5 11L7 9" /><path d="M13.5 13L17 15" />
      <path d="M13.5 11L17 9" /><path d="M10.5 13L7 15" />
    </svg>
  );
}

const TABS: Array<{ id: TabId; labelKey: string; Icon: typeof ChatIcon }> = [
  { id: "chat", labelKey: "tab.chat", Icon: ChatIcon },
  { id: "cortex", labelKey: "tab.cortex", Icon: CortexIcon },
  { id: "tasks", labelKey: "tab.tasks", Icon: TasksIcon },
  { id: "evolve", labelKey: "tab.evolve", Icon: EvolveIcon },
  { id: "projects", labelKey: "tab.projects", Icon: ProjectsIcon },
  { id: "me", labelKey: "tab.me", Icon: MeIcon },
];

/** Desktop left rail — hidden on mobile */
export function DesktopTabRail() {
  const { t } = useT();
  const activeTab = useChatStore((s) => s.activeTab);
  const setActiveTab = useChatStore((s) => s.setActiveTab);

  return (
    <nav className="hidden sm:flex flex-col flex-shrink-0 w-[60px] border-r border-gray-800/80 bg-gray-950/90 pt-3 pb-2 items-center gap-1">
      <div className="mb-3 flex items-center justify-center">
        <span className="text-[13px] font-bold tracking-tight text-indigo-400">Enso</span>
      </div>
      {TABS.map(({ id, labelKey, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`relative flex flex-col items-center justify-center w-13 py-2 rounded-xl transition-all duration-150 group ${
              active
                ? "text-indigo-400 bg-indigo-500/10"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
            }`}
            title={t(labelKey)}
          >
            {active && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-indigo-400" />
            )}
            <Icon active={active} />
            <span className={`text-[9px] mt-0.5 leading-tight ${active ? "font-semibold" : "font-medium"}`}>
              {t(labelKey)}
            </span>
          </button>
        );
      })}
      <div className="mt-auto pt-2 flex flex-col items-center gap-3">
        <SettingsPanel />
        <DebugReporter />
      </div>
    </nav>
  );
}

/** Mobile bottom tab bar — hidden on desktop, hides when inside a chat */
export function MobileTabBar() {
  const { t } = useT();
  const activeTab = useChatStore((s) => s.activeTab);
  const chatViewOpen = useChatStore((s) => s.chatViewOpen);
  const setActiveTab = useChatStore((s) => s.setActiveTab);

  if (activeTab === "chat" && chatViewOpen) return null;

  return (
    <nav className="sm:hidden flex-shrink-0 border-t border-gray-800/80 bg-gray-950/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch">
        {TABS.map(({ id, labelKey, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors duration-150 ${
                active ? "text-indigo-400" : "text-gray-500 active:text-gray-300"
              }`}
            >
              <Icon active={active} />
              <span className={`text-[10px] leading-tight ${active ? "font-semibold" : "font-medium"}`}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function TabNavigation() {
  return (
    <>
      <DesktopTabRail />
      <MobileTabBar />
    </>
  );
}

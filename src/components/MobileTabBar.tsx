import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";

type MobileTab = "chat" | "tools" | "inbox" | "me";

const TAB_ICON_SIZE = 22;

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ToolsIcon({ active }: { active: boolean }) {
  return (
    <svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function InboxIcon({ active }: { active: boolean }) {
  return (
    <svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3H10l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function MeIcon({ active }: { active: boolean }) {
  return (
    <svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function MobileTabBar() {
  const { t } = useT();
  const mobileTab = useChatStore((s) => s.mobileTab);
  const setMobileTab = useChatStore((s) => s.setMobileTab);

  const tabs: Array<{ id: MobileTab; labelKey: string; Icon: typeof ChatIcon }> = [
    { id: "chat", labelKey: "mobile.tab.chat", Icon: ChatIcon },
    { id: "tools", labelKey: "mobile.tab.tools", Icon: ToolsIcon },
    { id: "inbox", labelKey: "mobile.tab.inbox", Icon: InboxIcon },
    { id: "me", labelKey: "mobile.tab.me", Icon: MeIcon },
  ];

  return (
    <nav className="sm:hidden flex-shrink-0 border-t border-gray-800/80 bg-gray-950/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch">
        {tabs.map(({ id, labelKey, Icon }) => {
          const active = mobileTab === id;
          return (
            <button
              key={id}
              onClick={() => setMobileTab(id)}
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

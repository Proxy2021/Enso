import { useState, useRef, useCallback, useEffect } from "react";
import { useChatStore, type ConversationEntry } from "../store/chat";
import { useT } from "../lib/i18n";

let _toggleMobileOpen: (() => void) | null = null;
export function toggleMobileConversations() {
  _toggleMobileOpen?.();
}

export default function ConversationSidebar() {
  const { t } = useT();
  const conversationsList = useChatStore((s) => s.conversationsList);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const startNewChat = useChatStore((s) => s.startNewChat);
  const deleteConversationById = useChatStore((s) => s.deleteConversationById);
  const renameConversationById = useChatStore((s) => s.renameConversationById);
  const connectionState = useChatStore((s) => s.connectionState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Expose toggle for the header button
  useEffect(() => {
    _toggleMobileOpen = () => setMobileOpen((o) => !o);
    return () => { _toggleMobileOpen = null; };
  }, []);

  // Swipe-to-close: track horizontal swipe on the drawer
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - touchStartX.current;
    // Only allow swiping right (to close)
    touchDeltaX.current = Math.max(0, delta);
    setSwipeOffset(touchDeltaX.current);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (touchDeltaX.current > 80) {
      setMobileOpen(false);
    }
    setSwipeOffset(0);
    touchDeltaX.current = 0;
  }, []);

  const beginRename = (c: ConversationEntry) => {
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const commitRename = async () => {
    if (editingId && editTitle.trim()) {
      await renameConversationById(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const disabled = connectionState !== "connected";

  const list = (
    <div className="flex flex-col h-full min-h-0 bg-gray-900/95 border-r border-gray-800/90 w-[min(100%,280px)] sm:w-[240px]">
      <div className="p-2 border-b border-gray-800/80 flex-shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void startNewChat();
            setMobileOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 sm:py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 active:bg-indigo-400 active:scale-[0.98] disabled:opacity-40 text-sm font-medium text-white transition-all duration-150"
        >
          <span className="text-lg leading-none">+</span>
          {t("conversations.newChat")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5">
        {conversationsList.map((c) => (
          <div
            key={c.id}
            className={`group relative rounded-lg border transition-colors ${
              c.id === activeConversationId
                ? "border-indigo-500/50 bg-indigo-500/10"
                : "border-transparent hover:bg-gray-800/60 active:bg-gray-800/80"
            }`}
          >
            {editingId === c.id ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="w-full bg-gray-950/80 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-indigo-500/60"
              />
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (c.id !== activeConversationId) selectConversation(c.id);
                  setMobileOpen(false);
                }}
                className="w-full text-left px-2.5 py-2.5 sm:py-2 pr-14 text-xs text-gray-200 truncate"
                title={c.title}
              >
                {c.title}
              </button>
            )}
            {editingId !== c.id && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  className="p-1.5 sm:p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 active:bg-gray-700"
                  title={t("conversations.rename")}
                  onClick={() => beginRename(c)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="p-1.5 sm:p-1 rounded text-gray-500 hover:text-red-300 hover:bg-red-950/40 active:bg-red-950/60"
                  title={t("conversations.delete")}
                  onClick={() => void deleteConversationById(c.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden sm:flex flex-shrink-0 h-full min-h-0">{list}</div>
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            style={{ opacity: swipeOffset > 0 ? Math.max(0, 1 - swipeOffset / 200) : 1 }}
            onClick={() => setMobileOpen(false)}
          />
          <div
            ref={drawerRef}
            className="relative h-full shadow-2xl z-10"
            style={{
              transform: swipeOffset > 0 ? `translateX(-${swipeOffset}px)` : undefined,
              transition: swipeOffset > 0 ? "none" : "transform 0.2s ease-out",
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Swipe handle indicator */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gray-600/50 rounded-full mr-1" />
            {list}
          </div>
        </div>
      )}
    </>
  );
}

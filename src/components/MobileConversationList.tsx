import { useState, useRef, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore, type ConversationEntry } from "../store/chat";
import { useT } from "../lib/i18n";

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-fuchsia-400 to-purple-600",
  "from-cyan-400 to-sky-600",
  "from-lime-400 to-green-600",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getAvatarGradient(id: string): string {
  return AVATAR_GRADIENTS[hashCode(id) % AVATAR_GRADIENTS.length];
}

function getAvatarLetter(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "E";
  const first = trimmed.charAt(0);
  if (/[\u4e00-\u9fff]/.test(first)) return first;
  return first.toUpperCase();
}

function formatTimeCompact(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function MobileConversationList() {
  const { t } = useT();
  const { conversationsList, activeConversationId, connectionState } = useChatStore(
    useShallow((s) => ({
      conversationsList: s.conversationsList,
      activeConversationId: s.activeConversationId,
      connectionState: s.connectionState,
    }))
  );
  const selectConversation = useChatStore((s) => s.selectConversation);
  const startNewChat = useChatStore((s) => s.startNewChat);
  const deleteConversationById = useChatStore((s) => s.deleteConversationById);
  const renameConversationById = useChatStore((s) => s.renameConversationById);
  const disabled = connectionState !== "connected";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipingId(id);
    setSwipeOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = touchStartX.current - e.touches[0].clientX;
    setSwipeOffset(Math.max(0, Math.min(delta, 80)));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset > 60 && swipingId) {
      setSwipeOffset(80);
    } else {
      setSwipeOffset(0);
      setSwipingId(null);
    }
  }, [swipeOffset, swipingId]);

  const beginRename = (c: ConversationEntry) => {
    setEditingId(c.id);
    setEditTitle(c.title);
    setSwipeOffset(0);
    setSwipingId(null);
  };

  const commitRename = async () => {
    if (editingId && editTitle.trim()) {
      await renameConversationById(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-xl font-bold text-gray-100 tracking-tight">{t("conversations.chats")}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void startNewChat()}
            disabled={disabled}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.92] transition-all duration-150 disabled:opacity-40"
            title={t("conversations.newChat")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {conversationsList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-gray-700">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">{t("mobile.noConversations")}</p>
            <button
              onClick={() => void startNewChat()}
              disabled={disabled}
              className="mt-4 px-5 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 active:scale-[0.96] transition-all disabled:opacity-40"
            >
              {t("conversations.newChat")}
            </button>
          </div>
        )}

        {conversationsList.map((c) => {
          const isActive = c.id === activeConversationId;
          const isEditing = editingId === c.id;
          const isSwiping = swipingId === c.id;
          const currentOffset = isSwiping ? swipeOffset : 0;
          const showActions = currentOffset >= 60;

          return (
            <div key={c.id} className="relative overflow-hidden rounded-2xl mb-1 contain-row">
              {/* Swipe-reveal action buttons */}
              {isSwiping && (
                <div className="absolute right-0 top-0 bottom-0 flex items-stretch">
                  <button
                    onClick={() => { beginRename(c); }}
                    className="w-16 flex items-center justify-center bg-indigo-600 text-white"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      void deleteConversationById(c.id);
                      setSwipingId(null);
                      setSwipeOffset(0);
                    }}
                    className="w-16 flex items-center justify-center bg-red-600 text-white"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Conversation item */}
              <div
                style={{
                  transform: currentOffset > 0 ? `translateX(-${currentOffset}px)` : undefined,
                  transition: isSwiping && currentOffset > 0 ? "none" : "transform 0.2s ease-out",
                }}
                onTouchStart={(e) => handleTouchStart(e, c.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {isEditing ? (
                  <div className="px-4 py-3 bg-gray-900/80">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-indigo-500/60"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!showActions) {
                        selectConversation(c.id);
                      }
                    }}
                    className={`w-full text-left flex items-center gap-3.5 px-4 py-3.5 transition-all duration-150 rounded-2xl ${
                      isActive
                        ? "bg-indigo-500/10"
                        : "active:bg-gray-800/60"
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`shrink-0 w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarGradient(c.id)} flex items-center justify-center shadow-lg`}>
                      <span className="text-white text-lg font-bold">{getAvatarLetter(c.title)}</span>
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${isActive ? "text-gray-100 font-semibold" : "text-gray-200 font-medium"}`}>
                          {c.title}
                        </span>
                        {c.updatedAt && (
                          <span className="text-[11px] text-gray-500 shrink-0 tabular-nums">
                            {formatTimeCompact(c.updatedAt)}
                          </span>
                        )}
                      </div>
                      {c.preview && (
                        <p className="text-xs text-gray-500 truncate mt-0.5 leading-relaxed">
                          {c.preview}
                        </p>
                      )}
                    </div>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

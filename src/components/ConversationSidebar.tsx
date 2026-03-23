import { useState } from "react";
import { useChatStore, type ConversationEntry } from "../store/chat";
import { useT } from "../lib/i18n";

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
    <div className="flex flex-col h-full min-h-0 bg-gray-900/95 border-r border-gray-800/90 w-[min(100%,260px)] sm:w-[240px]">
      <div className="p-2 border-b border-gray-800/80 flex-shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void startNewChat();
            setMobileOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
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
                : "border-transparent hover:bg-gray-800/60"
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
                className="w-full text-left px-2.5 py-2 pr-14 text-xs text-gray-200 truncate"
                title={c.title}
              >
                {c.title}
              </button>
            )}
            {editingId !== c.id && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800"
                  title={t("conversations.rename")}
                  onClick={() => beginRename(c)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="p-1 rounded text-gray-500 hover:text-red-300 hover:bg-red-950/40"
                  title={t("conversations.delete")}
                  onClick={() => void deleteConversationById(c.id)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <button
        type="button"
        className="sm:hidden fixed bottom-[4.5rem] left-3 z-30 px-2.5 py-1.5 rounded-lg border border-gray-700 bg-gray-900/95 text-[11px] text-gray-300 shadow-lg"
        onClick={() => setMobileOpen((o) => !o)}
      >
        {t("conversations.chats")}
      </button>
      <div className="hidden sm:flex flex-shrink-0 h-full min-h-0">{list}</div>
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-40 flex">
          <button type="button" className="flex-1 bg-black/50" aria-label="Close" onClick={() => setMobileOpen(false)} />
          <div className="h-full shadow-2xl">{list}</div>
        </div>
      )}
    </>
  );
}

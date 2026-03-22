import { useChatStore } from "../store/chat";

function truncate(text: string | undefined, max: number): string {
  if (!text) return "Untitled app";
  return text.length > max ? text.slice(0, max) + "\u2026" : text;
}

export default function PinnedSidebar() {
  const pinnedCards = useChatStore((s) => s.pinnedCards);
  const cards = useChatStore((s) => s.cards);
  const showSidebar = useChatStore((s) => s.showSidebar);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);
  const unpinCard = useChatStore((s) => s.unpinCard);

  if (!showSidebar || pinnedCards.length === 0) return null;

  function handleScrollTo(cardId: string) {
    document.getElementById(`card-${cardId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/40 z-30"
        onClick={toggleSidebar}
      />
      <aside className="fixed md:relative right-0 top-0 bottom-0 w-[70vw] max-w-56 sm:w-56 z-40 md:z-0 border-l border-gray-800 bg-gray-950/95 backdrop-blur overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
          <span className="text-xs font-medium text-gray-400">Pinned Apps</span>
          <button
            onClick={toggleSidebar}
            className="w-10 h-10 sm:w-auto sm:h-auto flex items-center justify-center text-gray-500 hover:text-gray-300 text-sm leading-none"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {pinnedCards.map((id) => {
            const card = cards[id];
            if (!card) return null;
            const family = card.appCardMode?.toolFamily ?? card.cardMode?.toolFamily;
            return (
              <div
                key={id}
                className="group flex items-center gap-2 px-3 py-3 sm:py-2 hover:bg-gray-800/60 cursor-pointer transition-all duration-150"
                onClick={() => handleScrollTo(id)}
              >
                <div className="flex-1 min-w-0">
                  {family && (
                    <div className="text-[10px] text-indigo-400 truncate">{family}</div>
                  )}
                  <div className="text-xs text-gray-300 truncate">
                    {truncate(card.text, 40)}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); unpinCard(id); }}
                  className="text-gray-600 hover:text-gray-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Unpin"
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}

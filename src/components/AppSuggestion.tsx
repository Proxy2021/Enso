import { useState, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { AppBuilderDialog } from "./AppBuilderDialog";
import { useT } from "../lib/i18n";

const CATEGORY_ICONS: Record<string, string> = {
  table: "\uD83D\uDCCA",      // 📊
  list: "\uD83D\uDCCB",       // 📋
  budget: "\uD83D\uDCB0",     // 💰
  timeline: "\uD83D\uDCC5",   // 📅
  comparison: "\u2696\uFE0F",  // ⚖️
  tracker: "\u2705",           // ✅
};

interface AppSuggestionProps {
  cardId: string;
  suggestion: {
    category: string;
    label: string;
    suggestedFamily?: string;
    buildHint?: string;
  };
  cardText: string;
}

export default function AppSuggestion({ cardId, suggestion, cardText }: AppSuggestionProps) {
  const { t } = useT();
  const [dismissed, setDismissed] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const enhanceCardWithFamily = useChatStore((s) => s.enhanceCardWithFamily);

  const handleEnhance = useCallback(() => {
    if (suggestion.suggestedFamily) {
      enhanceCardWithFamily(cardId, suggestion.suggestedFamily);
    } else {
      // No family match — open Build App dialog with the hint
      setShowBuilder(true);
    }
  }, [cardId, suggestion.suggestedFamily, enhanceCardWithFamily]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // Clear the suggestion from the card
    useChatStore.setState((s) => {
      const card = s.cards[cardId];
      if (!card) return s;
      return {
        cards: {
          ...s.cards,
          [cardId]: { ...card, appSuggestion: undefined },
        },
      };
    });
  }, [cardId]);

  if (dismissed) return null;

  const icon = CATEGORY_ICONS[suggestion.category] ?? "\u2728";
  const hasFamily = !!suggestion.suggestedFamily;

  return (
    <>
      <div className="mx-3 mt-1.5 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-500/25 bg-violet-500/5 animate-in fade-in slide-in-from-bottom-1 duration-300">
        <span className="text-sm shrink-0">{icon}</span>
        <span className="text-[11px] text-gray-300 flex-1 leading-snug">
          {suggestion.label}
        </span>
        <button
          onClick={handleEnhance}
          className="shrink-0 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-all duration-150"
        >
          {hasFamily ? (
            <>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              Enhance
            </>
          ) : (
            <>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Build App
            </>
          )}
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-gray-500 hover:text-gray-300 text-xs px-1 transition-all duration-150"
          title={t("common.dismiss")}
        >
          &times;
        </button>
      </div>
      {showBuilder && (
        <AppBuilderDialog
          cardId={cardId}
          cardText={cardText}
          defaultDefinition={suggestion.buildHint}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </>
  );
}

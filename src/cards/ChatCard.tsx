import { useState } from "react";
import MarkdownText from "../components/MarkdownText";
import MediaGallery from "../components/MediaGallery";
import AppSuggestion from "../components/AppSuggestion";
import { useChatStore } from "../store/chat";
import type { CardRendererProps } from "./types";

export default function ChatCard({ card }: CardRendererProps) {
  const hasMedia = Boolean(card.mediaUrls?.length);
  const showRestart = (card.data as Record<string, unknown> | undefined)?.restartPrompt === true;

  return (
    <div className="px-3 py-2">
      <div className="text-sm leading-relaxed text-gray-100">
        <MarkdownText text={card.text ?? ""} />
      </div>
      {hasMedia && <MediaGallery urls={card.mediaUrls!} />}
      {showRestart && <RestartButton />}
      {card.appSuggestion && card.status === "complete" && (
        <AppSuggestion
          cardId={card.id}
          suggestion={card.appSuggestion}
          cardText={card.text ?? ""}
        />
      )}
      {card.status === "streaming" && (
        <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      )}
    </div>
  );
}

function RestartButton() {
  const [clicked, setClicked] = useState(false);

  return (
    <button
      onClick={() => {
        setClicked(true);
        useChatStore.getState().restartServer();
      }}
      disabled={clicked}
      className="mt-2 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md border border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
      {clicked ? "Restarting…" : "Restart Services"}
    </button>
  );
}

import MarkdownText from "../components/MarkdownText";
import MediaGallery from "../components/MediaGallery";
import type { CardRendererProps } from "./types";

export default function ChatCard({ card }: CardRendererProps) {
  const hasMedia = Boolean(card.mediaUrls?.length);

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[86%] bg-gray-900/85 border border-gray-700/80 text-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
        <div className="text-sm leading-relaxed">
          <MarkdownText text={card.text ?? ""} />
        </div>
        {hasMedia && <MediaGallery urls={card.mediaUrls!} />}
        {card.status === "streaming" && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        )}
      </div>
    </div>
  );
}

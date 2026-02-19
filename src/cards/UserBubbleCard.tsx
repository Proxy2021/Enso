import MediaGallery from "../components/MediaGallery";
import type { CardRendererProps } from "./types";

export default function UserBubbleCard({ card }: CardRendererProps) {
  const hasMedia = Boolean(card.mediaUrls?.length);

  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[86%] bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl rounded-br-md px-4 py-3 border border-indigo-400/40 shadow-[0_12px_30px_rgba(79,70,229,0.35)]">
        {card.text && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {card.text}
          </p>
        )}
        {hasMedia && <MediaGallery urls={card.mediaUrls!} />}
      </div>
    </div>
  );
}

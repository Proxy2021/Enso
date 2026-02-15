import MediaGallery from "../components/MediaGallery";
import type { CardRendererProps } from "./types";

export default function UserBubbleCard({ card }: CardRendererProps) {
  const hasMedia = Boolean(card.mediaUrls?.length);

  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[80%] bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5">
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

import { useState } from "react";
import type { ChatMessage } from "../types";
import DynamicUI from "./DynamicUI";
import MarkdownText from "./MarkdownText";

interface MessageBubbleProps {
  message: ChatMessage;
}

function MediaGallery({ urls }: { urls: string[] }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const validUrls = urls.filter((u) => !failedUrls.has(u));
  if (validUrls.length === 0) return null;

  return (
    <div
      className={`grid gap-1.5 mt-2 ${
        validUrls.length === 1
          ? "grid-cols-1"
          : validUrls.length === 2
            ? "grid-cols-2"
            : "grid-cols-2"
      }`}
    >
      {validUrls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg border border-gray-700/50 hover:border-gray-500 transition-colors"
        >
          <img
            src={url}
            alt={`Media ${i + 1}`}
            className="w-full h-auto max-h-64 object-cover bg-gray-900"
            loading="lazy"
            onError={() =>
              setFailedUrls((prev) => new Set(prev).add(url))
            }
          />
        </a>
      ))}
    </div>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasUI = Boolean(message.generatedUI);
  const hasMedia = Boolean(message.mediaUrls?.length);
  const [showRawText, setShowRawText] = useState(false);

  // When we have generated UI, the component is the primary display
  if (!isUser && hasUI) {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[90%] w-full">
          <DynamicUI
            componentCode={message.generatedUI!}
            data={message.data ?? {}}
          />
          {hasMedia && <MediaGallery urls={message.mediaUrls!} />}
          {message.text && (
            <div className="mt-1 px-1">
              <button
                onClick={() => setShowRawText(!showRawText)}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                {showRawText ? "Hide response text" : "Show response text"}
              </button>
              {showRawText && (
                <div className="mt-1 bg-gray-800/50 rounded-lg px-3 py-2 text-sm text-gray-400 border border-gray-700/50">
                  <MarkdownText text={message.text} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] ${
          isUser
            ? "bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5"
            : "bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5"
        }`}
      >
        {isUser ? (
          <>
            {message.text && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.text}
              </p>
            )}
            {hasMedia && <MediaGallery urls={message.mediaUrls!} />}
          </>
        ) : (
          <>
            <div className="text-sm leading-relaxed">
              <MarkdownText text={message.text} />
            </div>
            {hasMedia && <MediaGallery urls={message.mediaUrls!} />}
          </>
        )}

        {message.state === "streaming" && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        )}
      </div>
    </div>
  );
}

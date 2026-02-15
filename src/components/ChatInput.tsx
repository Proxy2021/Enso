import { useState, useRef } from "react";
import { useChatStore } from "../store/chat";

export default function ChatInput() {
  const [text, setText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendMessageWithMedia = useChatStore((s) => s.sendMessageWithMedia);
  const connectionState = useChatStore((s) => s.connectionState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const disabled = connectionState !== "connected";

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || disabled) return;

    if (attachedFiles.length > 0) {
      await sendMessageWithMedia(trimmed, attachedFiles);
    } else {
      sendMessage(trimmed);
    }

    setText("");
    setAttachedFiles([]);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      setAttachedFiles((prev) => [...prev, ...files]);
    }
    e.target.value = "";
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="border-t border-gray-800 p-4">
      <div className="max-w-3xl mx-auto">
        {attachedFiles.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachedFiles.map((file, i) => (
              <div
                key={i}
                className="relative group rounded-lg overflow-hidden border border-gray-700 bg-gray-800"
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-16 w-16 object-cover"
                />
                <button
                  onClick={() => removeFile(i)}
                  className="absolute top-0 right-0 bg-gray-900/80 text-gray-300 hover:text-white rounded-bl-lg px-1.5 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-2.5 rounded-xl text-sm transition-colors"
            title="Attach image"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Disconnected..." : "Type a message..."}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={disabled || (!text.trim() && attachedFiles.length === 0)}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

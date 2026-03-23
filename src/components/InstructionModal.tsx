import { useState, useEffect, useRef } from "react";
import { TIMINGS } from "../lib/constants";
import { useVoiceInput } from "./VoiceMicButton";

export interface InstructionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel?: string;
  multiline?: boolean;
  /** Shown when the modal opens (e.g. app builder seed text). */
  initialValue?: string;
  /** Matches existing app builder styling. */
  accent?: "indigo" | "amber";
}

export function InstructionModal({
  open,
  onClose,
  onSubmit,
  title,
  description,
  placeholder,
  submitLabel,
  cancelLabel = "Cancel",
  multiline = false,
  initialValue = "",
  accent = "indigo",
}: InstructionModalProps) {
  const [text, setText] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { VoiceMic } = useVoiceInput(setText);

  useEffect(() => {
    if (open) setText(initialValue);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      if (multiline) textareaRef.current?.focus();
      else inputRef.current?.focus();
    }, TIMINGS.FOCUS_DELAY);
    return () => window.clearTimeout(id);
  }, [open, multiline]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Enter") {
      if (multiline && e.shiftKey) return;
      if (multiline) e.preventDefault();
      submit();
    }
  };

  if (!open) return null;

  const focusRing =
    accent === "amber" ? "focus:border-amber-500/50" : "focus:border-indigo-500/50";
  const inputClassName = `flex-1 bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none ${focusRing} ${multiline ? "resize-none" : ""}`;

  const submitClassName =
    accent === "amber"
      ? "px-3 py-1.5 text-xs rounded-md border border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      : "px-3 py-1.5 text-xs rounded-md border border-indigo-500/60 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed";

  const fieldRowClass = multiline ? "flex items-start gap-1.5" : "flex items-center gap-1.5";

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-gray-900 border-t sm:border border-gray-700 rounded-t-2xl sm:rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.55)] animate-[slideUp_0.2s_ease-out] sm:animate-none">
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-8 h-1 rounded-full bg-gray-600" />
        </div>
        <div className="px-4 py-3 border-b border-gray-700/70">
          <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
          <p className="text-xs text-gray-400 mt-1">{description}</p>
        </div>
        <div className="px-4 py-3">
          <div className={fieldRowClass}>
            {multiline ? (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                placeholder={placeholder}
                className={inputClassName}
              />
            ) : (
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={inputClassName}
              />
            )}
            <VoiceMic />
          </div>
        </div>
        <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-700/70 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 sm:px-3 py-2 sm:py-1.5 text-xs rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 active:bg-gray-700 active:scale-[0.97] transition-all duration-150"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className={submitClassName}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

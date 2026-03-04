import { useCallback, useState } from "react";
import { useSpeechRecognition } from "../lib/use-speech-recognition";
import { useVoiceRecorder } from "../lib/use-voice-recorder";
import { isNative } from "../lib/platform";

interface VoiceMicButtonProps {
  /** Called with final transcript text to append to the input */
  onTranscript: (text: string) => void;
  /** Button size variant */
  size?: "sm" | "md";
  /** Additional class names */
  className?: string;
}

/**
 * Reusable microphone button with platform-adaptive voice input.
 * Web: uses Web Speech API (Chrome/Edge/Firefox).
 * Native: uses MediaRecorder + server-side Gemini transcription.
 */
export function VoiceMicButton({ onTranscript, size = "sm", className = "" }: VoiceMicButtonProps) {
  const speech = useSpeechRecognition(onTranscript);
  const recorder = useVoiceRecorder(onTranscript);
  const voice = isNative ? recorder : speech;

  if (!voice.isSupported) return null;

  const isListening = voice.isListening;
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <button
      type="button"
      onClick={voice.toggleListening}
      className={`relative rounded-md transition-colors ${
        isListening
          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          : "text-gray-400 hover:text-gray-200"
      } ${size === "sm" ? "p-1.5" : "px-3 py-2.5 rounded-xl"} ${className}`}
      title={isListening ? "Stop recording" : "Voice input"}
    >
      {isListening && (
        <span className={`absolute inset-0 bg-red-500/20 animate-pulse ${size === "sm" ? "rounded-md" : "rounded-xl"}`} />
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative z-10"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    </button>
  );
}

/**
 * Hook that wraps voice input for use in any text input.
 * Returns { onTranscript, VoiceMic } where VoiceMic is a pre-wired button.
 */
export function useVoiceInput(setText: (updater: (prev: string) => string) => void, size?: "sm" | "md") {
  const onTranscript = useCallback((transcript: string) => {
    setText((prev) => {
      const separator = prev.length > 0 && !prev.endsWith(" ") ? " " : "";
      return prev + separator + transcript;
    });
  }, [setText]);

  const Mic = useCallback(() => (
    <VoiceMicButton onTranscript={onTranscript} size={size} />
  ), [onTranscript, size]);

  return { onTranscript, VoiceMic: Mic };
}

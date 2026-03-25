import { useState, useEffect } from "react";

interface VoiceOverlayProps {
  transcript: string;
  isInCancelZone: boolean;
  isFallbackRecorder: boolean;
  isTranscribing: boolean;
  startTime: number;
}

export function VoiceOverlay({
  transcript,
  isInCancelZone,
  isFallbackRecorder,
  isTranscribing,
  startTime,
}: VoiceOverlayProps) {
  const displayText = isFallbackRecorder
    ? (isTranscribing ? "Transcribing..." : "Recording...")
    : (transcript || "Listening...");

  const hasRealText = !isFallbackRecorder && !!transcript;

  // Recording timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timerText = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col transition-colors duration-200 ${
        isInCancelZone ? "bg-black/90" : "bg-black/80"
      }`}
      style={{ touchAction: "none" }}
    >
      {/* Cancel zone indicator (top) */}
      <div
        className={`flex items-center justify-center pt-[env(safe-area-inset-top)] px-6 transition-all duration-200 ${
          isInCancelZone ? "flex-[0_0_30%] bg-red-900/40" : "flex-[0_0_15%]"
        }`}
      >
        <div className={`flex flex-col items-center gap-2 transition-all duration-200 ${
          isInCancelZone ? "scale-110" : "opacity-40 scale-90"
        }`}>
          <svg
            width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke={isInCancelZone ? "#f87171" : "#9ca3af"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span className={`text-sm font-medium transition-colors duration-200 ${
            isInCancelZone ? "text-red-400" : "text-gray-500"
          }`}>
            {isInCancelZone ? "Release to cancel" : "Slide up to cancel"}
          </span>
        </div>
      </div>

      {/* Transcript display (center) */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-hidden">
        <p className={`text-center leading-relaxed max-w-md transition-all duration-200 ${
          hasRealText
            ? "text-2xl text-gray-100 font-medium"
            : "text-xl text-gray-400 italic"
        } ${isInCancelZone ? "opacity-30 scale-95" : "opacity-100"}`}>
          {displayText}
        </p>
      </div>

      {/* Recording indicator (bottom) — waveform + timer */}
      <div className={`flex flex-col items-center gap-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 transition-all duration-200 ${
        isInCancelZone ? "opacity-30" : "opacity-100"
      }`}>
        {/* Waveform bars */}
        <div className="flex items-center justify-center gap-1 h-16">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1 bg-red-400 rounded-full"
              style={{
                animation: `waveform ${0.7 + i * 0.08}s ease-in-out ${i * 0.1}s infinite alternate`,
                height: "24px",
              }}
            />
          ))}
        </div>
        {/* Timer */}
        <span className="text-base font-mono text-red-400/80 tabular-nums">
          {timerText}
        </span>
        <span className="text-sm text-gray-400">
          {isInCancelZone ? "" : "Release to send"}
        </span>
      </div>
    </div>
  );
}

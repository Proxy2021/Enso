interface VoiceOverlayProps {
  transcript: string;
  isInCancelZone: boolean;
  isFallbackRecorder: boolean;
  isTranscribing: boolean;
}

export function VoiceOverlay({
  transcript,
  isInCancelZone,
  isFallbackRecorder,
  isTranscribing,
}: VoiceOverlayProps) {
  const displayText = isFallbackRecorder
    ? (isTranscribing ? "Transcribing..." : "Recording...")
    : (transcript || "Listening...");

  const hasRealText = !isFallbackRecorder && !!transcript;

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

      {/* Recording indicator (bottom) */}
      <div className={`flex flex-col items-center gap-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 transition-all duration-200 ${
        isInCancelZone ? "opacity-30" : "opacity-100"
      }`}>
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
          <span className="relative block w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/60 flex items-center justify-center">
            <svg
              width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </span>
        </div>
        <span className="text-sm text-gray-400">
          {isInCancelZone ? "" : "Release to send"}
        </span>
      </div>
    </div>
  );
}

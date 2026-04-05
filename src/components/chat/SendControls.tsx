import type { DesktopPttHandlers } from "./usePushToTalk";
import { useT } from "../../lib/i18n";

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
  </svg>
);

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

interface SendControlsProps {
  disabled: boolean;
  hasContent: boolean;
  hasShellSession: boolean;
  speechSupported: boolean;
  onSend: () => void;
  pttHandlers: DesktopPttHandlers;
}

export function SendControls({
  disabled,
  hasContent,
  hasShellSession,
  speechSupported,
  onSend,
  pttHandlers,
}: SendControlsProps) {
  const { t } = useT();
  return (
    <>
      {/* Mobile: send-only button (PTT is via textarea long-press) */}
      <div className="sm:hidden">
        <button
          onClick={onSend}
          disabled={disabled || (!hasContent && !hasShellSession)}
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-400 active:scale-[0.95] disabled:opacity-50 text-white px-3 py-2.5 min-h-[44px] min-w-[44px] rounded-xl text-sm font-medium transition-all duration-150"
        >
          <SendIcon />
        </button>
      </div>

      {/* Desktop: mic + send side by side */}
      <div className="hidden sm:flex items-center gap-2">
        {speechSupported && (
          <button
            disabled={disabled}
            className="relative px-3 py-2.5 min-h-[44px] min-w-[44px] rounded-xl text-sm transition-all duration-150 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-300 disabled:opacity-50 select-none touch-none"
            title={t("chat.holdToTalk")}
            aria-label={t("chat.holdToTalk")}
            {...pttHandlers}
          >
            <MicIcon />
          </button>
        )}
        <button
          onClick={onSend}
          disabled={disabled || !hasContent}
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-400 active:scale-[0.95] disabled:opacity-50 disabled:hover:bg-indigo-600 text-white px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-all duration-150"
        >
          Send
        </button>
      </div>
    </>
  );
}

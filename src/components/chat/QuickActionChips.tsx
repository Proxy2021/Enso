import { useT } from "../../lib/i18n";

interface QuickActionChipsProps {
  disabled: boolean;
  onResearch: () => void;
  onCode: () => void;
  onCamera: () => void;
  onOrchestrate: () => void;
}

export function QuickActionChips({ disabled, onResearch, onCode, onCamera, onOrchestrate }: QuickActionChipsProps) {
  const { t } = useT();
  const chipClass = "shrink-0 flex items-center gap-1 px-3 py-2.5 min-h-[44px] rounded-full border border-gray-700/50 bg-gray-900/40 text-[11px] text-gray-300 active:bg-gray-800 active:scale-[0.96] transition-all disabled:opacity-40";

  return (
    <div className="sm:hidden flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide pb-0.5">
      <button onClick={onResearch} disabled={disabled} className={chipClass}>
        <span className="text-xs">&#x1f50d;</span> {t("mobile.quickAction.research")}
      </button>
      <button onClick={onCode} disabled={disabled} className={chipClass}>
        <span className="text-xs">&#x1f4bb;</span> {t("mobile.quickAction.code")}
      </button>
      <button onClick={onCamera} disabled={disabled} className={chipClass}>
        <span className="text-xs">&#x1f4f7;</span> {t("attach.camera")}
      </button>
      <button onClick={onOrchestrate} disabled={disabled} className={chipClass}>
        <span className="text-xs">&#x26a1;</span> {t("mobile.quickAction.orchestrate")}
      </button>
    </div>
  );
}

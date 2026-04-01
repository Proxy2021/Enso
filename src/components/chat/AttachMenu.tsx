import { useRef, useEffect } from "react";
import { ATTACH_CATEGORIES } from "./attach-categories";
import { useT } from "../../lib/i18n";

interface AttachMenuProps {
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCategorySelect: (cat: (typeof ATTACH_CATEGORIES)[number]) => void;
  onImageResearch: () => void;
}

export function AttachMenu({ disabled, open, onToggle, onClose, onCategorySelect, onImageResearch }: AttachMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open, onClose]);

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={onToggle}
          disabled={disabled}
          className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 active:scale-[0.95] disabled:opacity-50 text-gray-300 px-3 py-2.5 min-h-[44px] min-w-[44px] rounded-xl text-sm transition-all duration-150"
          title="Attach file"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>

        {open && (
          <div className="absolute bottom-full left-0 mb-1 w-48 bg-gray-800 border border-gray-600/60 rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.4)] overflow-hidden z-50">
            <button
              key="image-research"
              onClick={() => { onClose(); onImageResearch(); }}
              className="sm:hidden w-full text-left px-3 py-3 flex items-center gap-3 text-gray-300 hover:bg-gray-700/50 active:bg-gray-600/50 active:scale-[0.98] transition-all duration-150"
            >
              <span className="text-indigo-400 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" /></svg>
              </span>
              <span className="text-xs">Research image</span>
            </button>
            {ATTACH_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategorySelect(cat)}
                className="w-full text-left px-3 py-3 sm:py-2.5 flex items-center gap-3 text-gray-300 hover:bg-gray-700/50 active:bg-gray-600/50 active:scale-[0.98] transition-all duration-150"
              >
                <span className="text-indigo-400 shrink-0">{cat.icon}</span>
                <span className="text-xs">{t(cat.labelKey)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Image-to-Research button — hidden on mobile, visible on desktop */}
      <button
        onClick={onImageResearch}
        disabled={disabled}
        className="hidden sm:flex bg-gray-800 hover:bg-gray-700 active:bg-gray-600 active:scale-[0.95] disabled:opacity-50 text-indigo-400 hover:text-indigo-300 px-3 py-2.5 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm transition-all duration-150"
        title="Upload image to research"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" /></svg>
      </button>
    </>
  );
}

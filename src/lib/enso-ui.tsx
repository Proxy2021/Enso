/**
 * EnsoUI — Pre-styled component library for Enso's sandbox.
 *
 * All components are pure React + Tailwind CSS (no external dependencies).
 * Injected into the sandbox scope as `EnsoUI`, destructured in the preamble
 * so generated templates can use them directly: <Tabs>, <DataTable>, <Badge>, etc.
 *
 * Design tokens match Enso's dark theme:
 *   bg-gray-900 (outer), bg-gray-800 (cards), border-gray-600/50, text-gray-100
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import mpegts from "mpegts.js";

/* ═══════════════════════════════════════════════════════════════════════════
   ACCENT COLORS — shared palette used across components
   ═══════════════════════════════════════════════════════════════════════════ */

type Accent = "blue" | "emerald" | "amber" | "purple" | "rose" | "cyan" | "orange" | "red" | "gray" | "violet" | "indigo" | "teal" | "pink";

const accentStyles: Record<Accent, { border: string; bg: string; text: string }> = {
  blue:    { border: "border-blue-400",    bg: "bg-blue-400/10",    text: "text-blue-400"    },
  emerald: { border: "border-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-400" },
  amber:   { border: "border-amber-400",   bg: "bg-amber-400/10",  text: "text-amber-400"   },
  purple:  { border: "border-purple-400",  bg: "bg-purple-400/10", text: "text-purple-400"  },
  rose:    { border: "border-rose-400",    bg: "bg-rose-400/10",   text: "text-rose-400"    },
  cyan:    { border: "border-cyan-400",    bg: "bg-cyan-400/10",   text: "text-cyan-400"    },
  orange:  { border: "border-orange-400",  bg: "bg-orange-400/10", text: "text-orange-400"  },
  red:     { border: "border-red-400",     bg: "bg-red-400/10",    text: "text-red-400"     },
  gray:    { border: "border-gray-400",    bg: "bg-gray-400/10",   text: "text-gray-400"    },
  violet:  { border: "border-violet-400",  bg: "bg-violet-400/10", text: "text-violet-400"  },
  indigo:  { border: "border-indigo-400",  bg: "bg-indigo-400/10", text: "text-indigo-400"  },
  teal:    { border: "border-teal-400",    bg: "bg-teal-400/10",   text: "text-teal-400"    },
  pink:    { border: "border-pink-400",    bg: "bg-pink-400/10",   text: "text-pink-400"    },
};

/** Safe accent lookup — returns a valid style even for unknown accent values */
function getAccent(accent?: string): { border: string; bg: string; text: string } {
  if (!accent) return accentStyles.blue;
  return accentStyles[accent as Accent] ?? accentStyles.blue;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. CARD — Styled container with optional header, footer, accent
   ═══════════════════════════════════════════════════════════════════════════ */

function Card({
  children,
  className = "",
  accent,
  header,
  footer,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: Accent;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const a = accent ? getAccent(accent) : null;
  const base = "rounded-lg border overflow-hidden";
  const colors = a
    ? `${a.bg} ${a.border} border-l-2`
    : "bg-gray-800 border-gray-600/50";

  return (
    <div className={`${base} ${colors} ${className}`}>
      {header && (
        <div className="px-2.5 py-2 border-b border-gray-700/50 flex items-center justify-between">
          {typeof header === "string" ? (
            <span className="text-sm font-semibold text-gray-100">{header}</span>
          ) : header}
        </div>
      )}
      <div className="p-2.5">{children}</div>
      {footer && (
        <div className="px-2.5 py-2 border-t border-gray-700/50">{footer}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. SEPARATOR — Horizontal / vertical divider
   ═══════════════════════════════════════════════════════════════════════════ */

function Separator({
  orientation = "horizontal",
  className = "",
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return orientation === "horizontal" ? (
    <div className={`border-t border-gray-700/50 my-2 ${className}`} />
  ) : (
    <div className={`border-l border-gray-700/50 mx-2 self-stretch ${className}`} />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. TABS — Multi-view navigation with render-function children
   ═══════════════════════════════════════════════════════════════════════════ */

function Tabs({
  tabs,
  value: controlledValue,
  defaultValue,
  onChange,
  children,
  variant = "pills",
  className = "",
}: {
  tabs: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  children: React.ReactNode | ((activeTab: string) => React.ReactNode);
  variant?: "pills" | "underline" | "boxed";
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? tabs[0]?.value ?? "");
  const activeTab = controlledValue ?? internalValue;

  const handleTabClick = useCallback(
    (v: string) => {
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  const tabBarStyles: Record<string, string> = {
    pills: "flex gap-1 p-0.5 bg-gray-800/60 rounded-lg border border-gray-700/50",
    underline: "flex gap-0 border-b border-gray-700/50",
    boxed: "flex gap-0 bg-gray-800 rounded-t-lg border border-b-0 border-gray-700/50 overflow-hidden",
  };

  const getTabStyle = (isActive: boolean) => {
    if (variant === "pills") {
      return isActive
        ? "bg-gray-700 text-gray-100 shadow-sm"
        : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40";
    }
    if (variant === "underline") {
      return isActive
        ? "text-violet-400 border-b-2 border-violet-400 -mb-px"
        : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent -mb-px";
    }
    // boxed
    return isActive
      ? "bg-gray-700 text-gray-100 border-b-2 border-violet-400"
      : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 border-b-2 border-transparent";
  };

  return (
    <div className={className}>
      <div className={tabBarStyles[variant] ?? tabBarStyles.pills}>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabClick(tab.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer ${getTabStyle(activeTab === tab.value)}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5">
        {typeof children === "function" ? children(activeTab) : children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. BUTTON — Consistent button with variants
   ═══════════════════════════════════════════════════════════════════════════ */

function Button({
  children,
  onClick,
  variant = "default",
  size = "sm",
  icon,
  disabled = false,
  loading = false,
  className = "",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600",
    primary: "bg-violet-600 border-violet-500 text-white hover:bg-violet-500",
    ghost: "bg-transparent border-transparent text-gray-300 hover:bg-gray-700/50 hover:text-gray-100",
    danger: "bg-rose-600/15 border-rose-500/40 text-rose-400 hover:bg-rose-600/25",
    outline: "bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700/50",
  };

  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3 py-1.5 text-xs gap-2",
    lg: "px-4 py-2 text-sm gap-2",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant] ?? variants.default} ${sizes[size] ?? sizes.sm} ${className}`}
    >
      {loading ? (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. BADGE — Status indicator / tag
   ═══════════════════════════════════════════════════════════════════════════ */

function Badge({
  children,
  variant = "default",
  size = "sm",
  dot = false,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline";
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "bg-gray-700 text-gray-300 border-gray-600",
    success: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    warning: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    danger: "bg-rose-400/15 text-rose-400 border-rose-400/30",
    info: "bg-blue-400/15 text-blue-400 border-blue-400/30",
    outline: "bg-transparent text-gray-300 border-gray-500",
  };

  const dotColors: Record<string, string> = {
    default: "bg-gray-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-rose-400",
    info: "bg-blue-400",
    outline: "bg-gray-400",
  };

  const sizeStyles = size === "md"
    ? "px-2 py-0.5 text-xs"
    : "px-1.5 py-0.5 text-[10px]";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${variants[variant] ?? variants.default} ${sizeStyles} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] ?? dotColors.default}`} />}
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. SWITCH — Boolean on/off toggle
   ═══════════════════════════════════════════════════════════════════════════ */

function Switch({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  label,
  size = "md",
  disabled = false,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = controlledChecked ?? internalChecked;

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !isChecked;
    if (controlledChecked === undefined) setInternalChecked(next);
    onChange?.(next);
  }, [isChecked, controlledChecked, onChange, disabled]);

  const trackSize = size === "sm" ? "w-7 h-4" : "w-9 h-5";
  const thumbSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const thumbTranslate = isChecked
    ? (size === "sm" ? "translate-x-3" : "translate-x-4")
    : "translate-x-0.5";

  return (
    <button
      role="switch"
      aria-checked={isChecked}
      onClick={toggle}
      disabled={disabled}
      className={`inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span
        className={`relative inline-flex shrink-0 rounded-full transition-colors duration-200 ${trackSize} ${isChecked ? "bg-violet-600" : "bg-gray-600"}`}
      >
        <span
          className={`inline-block rounded-full bg-white shadow-sm transition-transform duration-200 mt-[3px] ${thumbSize} ${thumbTranslate}`}
        />
      </span>
      {label && <span className="text-xs text-gray-300">{label}</span>}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. SELECT — Styled native <select>
   ═══════════════════════════════════════════════════════════════════════════ */

function Select({
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  placeholder = "Select...",
  size = "sm",
  className = "",
}: {
  options: Array<{ value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  const sizeStyles = size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-xs";

  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        value={currentValue}
        onChange={handleChange}
        className={`appearance-none bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 pr-7 cursor-pointer focus:outline-none focus:border-violet-500/50 transition-colors ${sizeStyles}`}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. INPUT — Styled text input
   ═══════════════════════════════════════════════════════════════════════════ */

function Input({
  value: controlledValue,
  defaultValue,
  onChange,
  onKeyDown,
  placeholder = "",
  type = "text",
  icon,
  size = "sm",
  disabled = false,
  className = "",
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: "text" | "number" | "search" | "email" | "url";
  icon?: React.ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  const sizeStyles = size === "md" ? "py-1.5 text-xs" : "py-1 text-xs";

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {icon && (
        <span className="absolute left-2 text-gray-400 pointer-events-none">{icon}</span>
      )}
      <input
        type={type}
        value={currentValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 w-full focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50 ${sizeStyles} ${icon ? "pl-7 pr-2.5" : "px-2.5"}`}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. SLIDER — Range input
   ═══════════════════════════════════════════════════════════════════════════ */

function Slider({
  value: controlledValue,
  defaultValue = 50,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = false,
}: {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  return (
    <div className="flex items-center gap-2.5">
      {label && <span className="text-xs text-gray-400 shrink-0">{label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={handleChange}
        className="flex-1 h-1.5 rounded-full appearance-none bg-gray-700 cursor-pointer accent-violet-500 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md"
      />
      {showValue && (
        <span className="text-xs text-gray-300 font-medium tabular-nums min-w-[2.5rem] text-right">
          {currentValue}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. PROGRESS — Completion / loading bar
   ═══════════════════════════════════════════════════════════════════════════ */

function Progress({
  value,
  max = 100,
  variant = "default",
  size = "md",
  showLabel = false,
  label,
  className = "",
}: {
  value: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const barColors: Record<string, string> = {
    default: "bg-violet-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
  };

  const heights: Record<string, string> = {
    sm: "h-1",
    md: "h-1.5",
    lg: "h-2.5",
  };

  return (
    <div className={`w-full ${className}`}>
      {(label || showLabel) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs text-gray-400">{label}</span>}
          {showLabel && <span className="text-xs text-gray-300 tabular-nums">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={`w-full bg-gray-700 rounded-full overflow-hidden ${heights[size] ?? heights.md}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColors[variant] ?? barColors.default}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. ACCORDION — Collapsible sections
   ═══════════════════════════════════════════════════════════════════════════ */

function Accordion({
  items,
  type = "single",
  defaultOpen,
  className = "",
}: {
  items: Array<{ value: string; title: string | React.ReactNode; content: React.ReactNode }>;
  type?: "single" | "multiple";
  defaultOpen?: string | string[];
  className?: string;
}) {
  const [openItems, setOpenItems] = useState<Set<string>>(() => {
    if (!defaultOpen) return new Set<string>();
    return new Set(Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen]);
  });

  const toggleItem = useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          if (type === "single") next.clear();
          next.add(value);
        }
        return next;
      });
    },
    [type],
  );

  return (
    <div className={`space-y-1 ${className}`}>
      {items.map((item) => {
        const isOpen = openItems.has(item.value);
        return (
          <div key={item.value} className="border border-gray-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleItem(item.value)}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium text-gray-200 bg-gray-800/60 hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                {typeof item.title === "string" ? item.title : item.title}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
            >
              <div className="px-2.5 py-2 text-xs text-gray-300">{item.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   12. TOOLTIP — CSS-only hover tooltip
   ═══════════════════════════════════════════════════════════════════════════ */

function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const positionStyles: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  return (
    <span className="relative inline-flex group">
      {children}
      <span
        className={`absolute z-50 px-2 py-1 text-[10px] text-gray-100 bg-gray-900 border border-gray-600 rounded-md shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${positionStyles[side] ?? positionStyles.top}`}
      >
        {content}
      </span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   13. DIALOG — In-card modal overlay (no portals)
   ═══════════════════════════════════════════════════════════════════════════ */

function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Dialog box */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl">
        {/* Header */}
        {(title || description) && (
          <div className="px-4 pt-4 pb-2">
            {title && <h3 className="text-sm font-semibold text-gray-100">{title}</h3>}
            {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
          </div>
        )}
        {/* Body */}
        <div className="px-4 py-2 text-xs text-gray-300">{children}</div>
        {/* Footer */}
        {footer && (
          <div className="px-4 py-3 border-t border-gray-700/50 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   14. DATA TABLE — Sortable, paginated data table
   ═══════════════════════════════════════════════════════════════════════════ */

function DataTable({
  columns,
  data,
  pageSize = 0,
  striped = false,
  compact = false,
  onRowClick,
  className = "",
}: {
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  }>;
  data: Array<Record<string, unknown>>;
  pageSize?: number;
  striped?: boolean;
  compact?: boolean;
  onRowClick?: (row: Record<string, unknown>) => void;
  className?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const totalPages = pageSize > 0 ? Math.ceil(sortedData.length / pageSize) : 1;
  const pagedData = pageSize > 0
    ? sortedData.slice(page * pageSize, (page + 1) * pageSize)
    : sortedData;

  const cellPad = compact ? "px-2 py-1" : "px-2.5 py-1.5";

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-gray-700">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                className={`${cellPad} text-gray-400 font-medium whitespace-nowrap ${col.sortable ? "cursor-pointer hover:text-gray-200 select-none" : ""}`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    <svg
                      className={`w-3 h-3 transition-transform ${sortDir === "desc" ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={striped ? "divide-y divide-gray-700/30" : "divide-y divide-gray-700/50"}>
          {pagedData.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`
                ${onRowClick ? "cursor-pointer hover:bg-gray-700/40" : ""}
                ${striped && i % 2 === 1 ? "bg-gray-800/40" : ""}
                transition-colors
              `}
            >
              {columns.map((col) => (
                <td key={col.key} className={`${cellPad} text-gray-200 whitespace-nowrap`}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
          {pagedData.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={`${cellPad} text-gray-500 text-center`}>
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px] text-gray-500">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sortedData.length)} of {sortedData.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-0.5 text-[10px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-0.5 text-[10px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   15. STAT — KPI metric tile
   ═══════════════════════════════════════════════════════════════════════════ */

function Stat({
  label,
  value,
  change,
  icon,
  trend,
  accent = "blue",
}: {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "flat";
  accent?: Accent;
}) {
  const a = getAccent(accent);
  const effectiveTrend = trend ?? (change != null ? (change >= 0 ? "up" : "down") : undefined);

  return (
    <div className={`${a.bg} border ${a.border} rounded-lg p-2.5`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
          <p className={`text-sm font-bold ${a.text} tabular-nums`}>{value}</p>
        </div>
        {icon && <span className={`${a.text} opacity-60`}>{icon}</span>}
      </div>
      {change != null && (
        <div className="mt-1.5 flex items-center gap-1">
          {effectiveTrend === "up" && (
            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          )}
          {effectiveTrend === "down" && (
            <svg className="w-3 h-3 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
          <span className={`text-[10px] font-medium tabular-nums ${effectiveTrend === "up" ? "text-emerald-400" : effectiveTrend === "down" ? "text-rose-400" : "text-gray-400"}`}>
            {change >= 0 ? "+" : ""}{change}%
          </span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   16. EMPTY STATE — Zero-state placeholder
   ═══════════════════════════════════════════════════════════════════════════ */

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {icon && <span className="text-gray-500 mb-2">{icon}</span>}
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {description && <p className="text-xs text-gray-500 mt-1 max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   17. VIDEO PLAYER — Smart video player with MPEG-TS transmuxing support
   ═══════════════════════════════════════════════════════════════════════════ */

function VideoPlayer({
  src,
  container,
  onError,
  className = "",
  style,
}: {
  src: string;
  container?: "mpegts" | "mp4" | "unknown";
  onError?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const [error, setError] = useState(false);
  const [useMpegts, setUseMpegts] = useState(container === "mpegts");

  // Tear down any active mpegts.js player instance
  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.unload();
        playerRef.current.detachMediaElement();
        playerRef.current.destroy();
      } catch { /* ignore cleanup errors */ }
      playerRef.current = null;
    }
  }, []);

  // Initialize mpegts.js when useMpegts flips to true
  useEffect(() => {
    if (!useMpegts || !videoRef.current) return;
    if (!mpegts.isSupported()) {
      // MSE unavailable — nothing we can do
      setError(true);
      onError?.();
      return;
    }

    const player = mpegts.createPlayer(
      { type: "mpegts", url: src, isLive: false },
      { enableWorker: false, enableStashBuffer: true },
    );

    player.attachMediaElement(videoRef.current);
    player.load();
    playerRef.current = player;

    player.on(mpegts.Events.ERROR, () => {
      destroyPlayer();
      setError(true);
      onError?.();
    });

    return () => { destroyPlayer(); };
  }, [src, useMpegts, destroyPlayer, onError]);

  // Native <video> error → try mpegts.js as fallback
  const handleNativeError = useCallback(() => {
    if (!useMpegts && !error && mpegts.isSupported()) {
      setUseMpegts(true);
    } else {
      setError(true);
      onError?.();
    }
  }, [useMpegts, error, onError]);

  if (error) return null; // parent shows the error/System Player UI

  const defaultStyle: React.CSSProperties = {
    width: "100%",
    maxHeight: "480px",
    borderRadius: "6px",
    background: "#000",
    ...style,
  };

  return (
    <video
      ref={videoRef}
      src={useMpegts ? undefined : src}
      controls
      preload="metadata"
      onError={useMpegts ? undefined : handleNativeError}
      className={className}
      style={defaultStyle}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT — Single namespace object injected into sandbox
   ═══════════════════════════════════════════════════════════════════════════ */

export const EnsoUI = {
  Card,
  Separator,
  Tabs,
  Button,
  Badge,
  Switch,
  Select,
  Input,
  Slider,
  Progress,
  Accordion,
  Tooltip,
  Dialog,
  DataTable,
  Stat,
  EmptyState,
  VideoPlayer,
};

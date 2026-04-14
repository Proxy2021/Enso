/**
 * ReactToTL — Shared popup for sending instructions/feedback to Team Leader or any agent.
 * Supports text + image attachments (file picker, clipboard paste, drag-drop).
 *
 * Used from: CardShareMenu, FocusView, OrchestrationCard, TasksView (inline variant).
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders, resolveMediaUrl } from "../lib/connection";
import { pushToast } from "../lib/notifications";
import { compressImageFile } from "../lib/media-actions";

// ── Types ──

export interface ReactContext {
  type: "card" | "focus" | "entity" | "sprint" | "deliverable" | "direct";
  summary: string;
  focusId?: string;
  /** Extra detail merged into context for TL */
  detail?: string;
}

export interface AgentOption {
  id: string;
  name: string;
  role?: string;
  type: "tl" | "expert";
  focusTitle?: string;
  focusId?: string;
  expertId?: string;
}

interface ImageAttachment {
  file: File;
  previewUrl: string; // blob: URL for local preview
  uploading: boolean;
  serverUrl?: string; // /media/... URL after upload
  error?: string;
}

interface Props {
  context: ReactContext;
  onClose: () => void;
  /** Pre-select a specific agent (defaults to TL) */
  defaultAgentId?: string;
  /** Show as popup (absolute positioned) or inline */
  mode?: "popup" | "inline";
}

// ── Agent Cache ──

let _agentCache: AgentOption[] | null = null;
let _agentCacheAt = 0;
const CACHE_TTL = 60_000;

async function fetchAgents(): Promise<AgentOption[]> {
  if (_agentCache && Date.now() - _agentCacheAt < CACHE_TTL) return _agentCache;
  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/agents`, { headers: authHeaders() });
    if (res.ok) {
      const { agents } = await res.json();
      _agentCache = agents;
      _agentCacheAt = Date.now();
      return agents;
    }
  } catch { /* fallback */ }
  return [{ id: "tl", name: "Team Leader", type: "tl" as const }];
}

export function invalidateAgentCache(): void { _agentCache = null; }

// ── Upload Helper ──

async function uploadImage(file: File): Promise<string> {
  const compressed = await compressImageFile(file);
  const baseUrl = getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/upload`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": compressed.type }),
    body: compressed,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  return data.mediaUrl as string;
}

// ── Component ──

export default function ReactToTL({ context, onClose, defaultAgentId, mode = "popup" }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([{ id: "tl", name: "Team Leader", type: "tl" }]);
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId || "tl");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load agents
  useEffect(() => { fetchAgents().then(setAgents); }, []);

  // Auto-focus textarea
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Click outside to close (popup mode only)
  useEffect(() => {
    if (mode !== "popup") return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, mode]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => { images.forEach(img => URL.revokeObjectURL(img.previewUrl)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Add image files and start uploading
  const addImages = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    // Create preview entries immediately
    const newAttachments: ImageAttachment[] = imageFiles.map(f => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
      uploading: true,
    }));
    setImages(prev => [...prev, ...newAttachments]);

    // Upload each in parallel
    for (let i = 0; i < newAttachments.length; i++) {
      const attachment = newAttachments[i];
      try {
        const serverUrl = await uploadImage(attachment.file);
        setImages(prev => prev.map(img =>
          img.previewUrl === attachment.previewUrl
            ? { ...img, uploading: false, serverUrl }
            : img
        ));
      } catch (err) {
        setImages(prev => prev.map(img =>
          img.previewUrl === attachment.previewUrl
            ? { ...img, uploading: false, error: "Upload failed" }
            : img
        ));
      }
    }
  }, []);

  // Handle clipboard paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  }, [addImages]);

  // Handle drag-drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    addImages(files);
  }, [addImages]);

  const removeImage = useCallback((previewUrl: string) => {
    setImages(prev => {
      const img = prev.find(i => i.previewUrl === previewUrl);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(i => i.previewUrl !== previewUrl);
    });
  }, []);

  const submit = useCallback(async () => {
    const hasText = text.trim().length > 0;
    const hasImages = images.some(img => img.serverUrl);
    if ((!hasText && !hasImages) || sending) return;

    // Wait for any still-uploading images
    const stillUploading = images.some(img => img.uploading);
    if (stillUploading) {
      pushToast("Please wait", "Images still uploading...", false, 2000);
      return;
    }

    setSending(true);
    try {
      const selected = agents.find(a => a.id === selectedAgentId);
      const fullSummary = context.detail ? `${context.summary} | ${context.detail}` : context.summary;

      let agentTarget: { agent: "tl" } | { agent: "expert"; focusId: string; expertId: string } | undefined;
      if (selected?.type === "expert" && selected.focusId && selected.expertId) {
        agentTarget = { agent: "expert", focusId: selected.focusId, expertId: selected.expertId };
      }

      const imageUrls = images.filter(img => img.serverUrl).map(img => img.serverUrl!);

      await fetch(`${getBackendBaseUrl()}/api/reacts`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || (imageUrls.length ? `[${imageUrls.length} image(s) attached]` : ""),
          action: "custom",
          context: { type: context.type, summary: fullSummary, focusId: context.focusId },
          imageUrls,
          agentTarget,
        }),
      });

      // Cleanup blob URLs
      images.forEach(img => URL.revokeObjectURL(img.previewUrl));
      const targetName = selected?.name || "Team Leader";
      const imgNote = imageUrls.length ? ` + ${imageUrls.length} image(s)` : "";
      pushToast(`Sent to ${targetName}`, context.summary.slice(0, 50) + imgNote, true, 3000);
      onClose();
    } catch {
      pushToast("Failed to send", "Please try again", false);
    } finally {
      setSending(false);
    }
  }, [text, sending, agents, selectedAgentId, context, onClose, images]);

  const hasContent = text.trim().length > 0 || images.some(img => img.serverUrl);

  const containerClass = mode === "popup"
    ? "absolute top-full right-0 mt-1 w-80 bg-gray-900 border border-violet-500/30 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-[200] p-3"
    : "w-full bg-gray-900/40 border border-violet-500/20 rounded-lg p-3";

  return (
    <div
      ref={ref}
      className={containerClass}
      onClick={(e) => e.stopPropagation()}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
    >
      {/* Context preview */}
      <p className="text-[10px] text-gray-500 mb-2 leading-snug line-clamp-2">
        Re: {context.summary}
      </p>

      {/* Agent selector */}
      <div className="flex items-center gap-2 mb-2">
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="text-[11px] bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-300 focus:outline-none focus:border-violet-500 flex-1 min-w-0"
        >
          {agents.map(a => (
            <option key={a.id} value={a.id}>
              {a.type === "tl" ? `\uD83D\uDC54 ${a.name}` : `\u2726 ${a.name}${a.focusTitle ? ` (${a.focusTitle})` : ""}`}
            </option>
          ))}
        </select>
      </div>

      {/* Textarea with paste support */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={handlePaste}
        placeholder="Your instruction or feedback... (paste images with Ctrl+V)"
        className="w-full h-16 text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500 resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && hasContent) {
            e.preventDefault();
            submit();
          }
        }}
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {images.map((img) => (
            <div key={img.previewUrl} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-gray-700 shrink-0">
              <img
                src={img.previewUrl}
                alt=""
                className={`w-full h-full object-cover ${img.uploading ? "opacity-50" : ""} ${img.error ? "opacity-30" : ""}`}
              />
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {img.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
                  <span className="text-[8px] text-red-300">Failed</span>
                </div>
              )}
              {img.serverUrl && (
                <div className="absolute top-0.5 right-0.5">
                  <span className="text-[8px] text-emerald-400">{"\u2713"}</span>
                </div>
              )}
              <button
                onClick={() => removeImage(img.previewUrl)}
                className="absolute top-0 left-0 w-4 h-4 bg-black/70 text-gray-300 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-br"
              >
                {"\u00D7"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions: attach + send */}
      <div className="flex items-center mt-2">
        {/* Image attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-[10px] px-2 py-1.5 rounded-lg text-gray-400 hover:text-violet-300 hover:bg-violet-500/10 transition-colors flex items-center gap-1"
          title="Attach image (or paste with Ctrl+V)"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>Image</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addImages(Array.from(e.target.files));
            e.target.value = "";
          }}
        />

        <div className="flex-1" />

        {mode === "popup" && (
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 transition-colors mr-2"
          >
            Cancel
          </button>
        )}
        <button
          onClick={submit}
          disabled={!hasContent || sending}
          className="text-[11px] px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-30 transition-colors"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}

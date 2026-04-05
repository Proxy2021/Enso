import { useT } from "../../lib/i18n";

export interface IrPreviewState {
  file: File;
  localUrl: string;
  topic: string;
  loading: boolean;
  serverPath: string;
}

interface ImageResearchPreviewProps {
  preview: IrPreviewState;
  onCancel: () => void;
  onAction: (topic: string, file: File, intent: "image_research" | "image_search") => void;
  onTopicChange: (topic: string) => void;
}

export function ImageResearchPreview({ preview, onCancel, onAction, onTopicChange }: ImageResearchPreviewProps) {
  const { t } = useT();
  return (
    <div className="mb-3 bg-gray-800/90 border border-gray-600/60 rounded-xl p-3 shadow-lg">
      <div className="flex gap-3">
        {/* Image thumbnail */}
        <div className="shrink-0">
          <img src={preview.localUrl} alt="Preview" className="w-20 h-20 object-cover rounded-lg border border-gray-600" />
        </div>
        {/* Topic area */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/></svg>
            {preview.loading ? "Analyzing image..." : "Research topic (edit if needed)"}
          </div>
          {preview.loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400">{t("chat.extractingTopic")}</span>
            </div>
          ) : (
            <textarea
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:border-indigo-500 outline-none resize-none"
              rows={2}
              value={preview.topic}
              onChange={e => onTopicChange(e.target.value)}
              placeholder={t("chat.describeResearch")}
              autoFocus
            />
          )}
        </div>
      </div>
      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <div className="flex gap-1.5 ml-auto">
          {([
            { label: t("chat.imageAction.research"), icon: "\uD83D\uDD0D", prefix: "", intent: "image_research" as const },
            { label: t("chat.imageAction.similar"), icon: "\uD83D\uDDBC\uFE0F", prefix: "", intent: "image_search" as const },
            { label: t("chat.imageAction.shop"), icon: "\uD83D\uDED2", prefix: "Find prices, reviews, and where to buy: ", intent: "image_research" as const },
            { label: t("chat.imageAction.translate"), icon: "\uD83C\uDF10", prefix: "Translate all text visible in this image. Detected content: ", intent: "image_research" as const },
          ]).map(action => (
            <button
              key={action.label}
              onClick={() => {
                const topic = action.prefix + preview.topic.trim();
                onAction(topic, preview.file, action.intent);
              }}
              disabled={preview.loading || !preview.topic.trim()}
              className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1"
            >
              <span className="text-xs">{action.icon}</span> {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

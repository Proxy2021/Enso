import { useChatStore } from "../store/chat";
import { InstructionModal } from "./InstructionModal";
import { useT } from "../lib/i18n";

interface SystemEnhanceDialogProps {
  onClose: () => void;
}

export function SystemEnhanceDialog({ onClose }: SystemEnhanceDialogProps) {
  const { t } = useT();
  const launchSystemEnhance = useChatStore((s) => s.launchSystemEnhance);

  return (
    <InstructionModal
      open
      onClose={onClose}
      onSubmit={(text) => {
        launchSystemEnhance(text);
      }}
      title={t("dialog.systemEnhance")}
      description={t("dialog.systemEnhancePrompt")}
      placeholder="e.g., improve error handling across all tool families, add better loading states, optimize WebSocket reconnection..."
      submitLabel={t("dialog.enhance")}
      multiline
    />
  );
}

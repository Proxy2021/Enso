import { useChatStore } from "../store/chat";
import { InstructionModal } from "./InstructionModal";
import { useT } from "../lib/i18n";

interface EnsoCodeDialogProps {
  onClose: () => void;
}

export function EnsoCodeDialog({ onClose }: EnsoCodeDialogProps) {
  const { t } = useT();
  const launchEnsoCode = useChatStore((s) => s.launchEnsoCode);

  return (
    <InstructionModal
      open
      onClose={onClose}
      onSubmit={(text) => {
        launchEnsoCode(text);
      }}
      title={t("dialog.codeWithClaude")}
      description={t("dialog.codePrompt")}
      placeholder="e.g., add a new tool to the filesystem family, fix the WebSocket reconnection..."
      submitLabel={t("dialog.start")}
    />
  );
}

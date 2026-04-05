import { useChatStore } from "../store/chat";
import { InstructionModal } from "./InstructionModal";
import { useT } from "../lib/i18n";

interface CodeInvestigateDialogProps {
  cardId: string;
  onClose: () => void;
}

export function CodeInvestigateDialog({ cardId, onClose }: CodeInvestigateDialogProps) {
  const { t } = useT();
  const codeInvestigate = useChatStore((s) => s.codeInvestigate);

  return (
    <InstructionModal
      open
      onClose={onClose}
      onSubmit={(text) => {
        codeInvestigate(cardId, text);
      }}
      title={t("dialog.enhanceApp")}
      description={t("dialog.enhancePrompt")}
      placeholder="e.g., add interactive charts, improve the layout, add new data views, make it mobile-friendly..."
      submitLabel={t("dialog.start")}
    />
  );
}

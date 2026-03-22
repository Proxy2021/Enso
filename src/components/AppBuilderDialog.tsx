import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { InstructionModal } from "./InstructionModal";

interface AppBuilderDialogProps {
  cardId: string;
  cardText: string;
  defaultDefinition?: string;
  onClose: () => void;
}

export function AppBuilderDialog({
  cardId,
  cardText,
  defaultDefinition,
  onClose,
}: AppBuilderDialogProps) {
  const buildApp = useChatStore((s) => s.buildApp);
  const { t } = useT();

  return (
    <InstructionModal
      open
      onClose={onClose}
      onSubmit={(text) => {
        buildApp(cardId, cardText, text);
      }}
      title={t("builder.title")}
      description={t("builder.description")}
      placeholder={t("builder.placeholder")}
      submitLabel={t("builder.buildApp")}
      cancelLabel={t("builder.cancel")}
      initialValue={defaultDefinition ?? ""}
      accent="amber"
    />
  );
}

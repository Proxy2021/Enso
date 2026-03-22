import { useChatStore } from "../store/chat";
import { InstructionModal } from "./InstructionModal";

interface CodeInvestigateDialogProps {
  cardId: string;
  onClose: () => void;
}

export function CodeInvestigateDialog({ cardId, onClose }: CodeInvestigateDialogProps) {
  const codeInvestigate = useChatStore((s) => s.codeInvestigate);

  return (
    <InstructionModal
      open
      onClose={onClose}
      onSubmit={(text) => {
        codeInvestigate(cardId, text);
      }}
      title="Enhance App"
      description="How would you like to improve or extend this app?"
      placeholder="e.g., add interactive charts, improve the layout, add new data views, make it mobile-friendly..."
      submitLabel="Start"
    />
  );
}

import { useChatStore } from "../store/chat";
import { InstructionModal } from "./InstructionModal";

interface SystemEnhanceDialogProps {
  onClose: () => void;
}

export function SystemEnhanceDialog({ onClose }: SystemEnhanceDialogProps) {
  const launchSystemEnhance = useChatStore((s) => s.launchSystemEnhance);

  return (
    <InstructionModal
      open
      onClose={onClose}
      onSubmit={(text) => {
        launchSystemEnhance(text);
      }}
      title="System Enhance"
      description="Describe what you want to improve across the Enso system. Claude Code will analyze and implement changes."
      placeholder="e.g., improve error handling across all tool families, add better loading states, optimize WebSocket reconnection..."
      submitLabel="Enhance"
      multiline
    />
  );
}

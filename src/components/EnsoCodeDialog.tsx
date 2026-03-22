import { useChatStore } from "../store/chat";
import { InstructionModal } from "./InstructionModal";

interface EnsoCodeDialogProps {
  onClose: () => void;
}

export function EnsoCodeDialog({ onClose }: EnsoCodeDialogProps) {
  const launchEnsoCode = useChatStore((s) => s.launchEnsoCode);

  return (
    <InstructionModal
      open
      onClose={onClose}
      onSubmit={(text) => {
        launchEnsoCode(text);
      }}
      title="Code with Claude"
      description="What would you like Claude Code to work on?"
      placeholder="e.g., add a new tool to the filesystem family, fix the WebSocket reconnection..."
      submitLabel="Start"
    />
  );
}

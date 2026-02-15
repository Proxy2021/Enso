export interface ChatMessage {
  id: string;
  runId: string;
  role: "user" | "assistant";
  text: string;
  data?: unknown;
  generatedUI?: string;
  mediaUrls?: string[];
  state: "sending" | "streaming" | "complete" | "error";
}

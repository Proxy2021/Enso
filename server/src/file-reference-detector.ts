/**
 * Detects implicit file/folder references in user messages.
 * When present without actual file attachments, intercepts BEFORE
 * sending to Gemini API (prevents 400 errors).
 *
 * Added Sprint 11 (E1): File-reference detection
 */

const FILE_REFERENCE_PATTERNS = [
  // Deictic references: "these photos", "this folder", "my images"
  /\b(these|this|the|my)\s+(\d+\s+)?(photos?|images?|pictures?|videos?|files?|shots?|frames?)\b/i,
  // Folder references: "in this folder", "from this directory"
  /\b(in\s+this|from\s+this|this)\s+(folder|directory|album|collection)\b/i,
  // Attached file references
  /\b(the\s+)?attached\s+(photos?|files?|images?|videos?)\b/i,
  // Demonstrative references to specific content
  /\b(this\s+reference\s+(photo|image)|reference\s+image)\b/i,
];

// Patterns that indicate the user is asking about a concept, not referencing files
const CONCEPTUAL_PATTERNS = [
  /\bwhat\s+(is|are)\s+(a\s+)?/i,
  /\bhow\s+(do|does|to|can)\b/i,
  /\bexplain\b/i,
  /\btell\s+me\s+about\b/i,
];

export function detectFileReference(message: string, hasAttachments: boolean): {
  referencesFiles: boolean;
  missingAttachments: boolean;
  suggestedPrompt: string | null;
} {
  // Skip conceptual questions — "what is a contact sheet" should NOT trigger
  if (CONCEPTUAL_PATTERNS.some(p => p.test(message))) {
    return { referencesFiles: false, missingAttachments: false, suggestedPrompt: null };
  }

  const referencesFiles = FILE_REFERENCE_PATTERNS.some(p => p.test(message));
  const missingAttachments = referencesFiles && !hasAttachments;

  return {
    referencesFiles,
    missingAttachments,
    suggestedPrompt: missingAttachments
      ? "Which files would you like me to work with? You can share a file or folder path, or browse your files below."
      : null,
  };
}

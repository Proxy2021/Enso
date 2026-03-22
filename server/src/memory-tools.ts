/**
 * memory-tools.ts — Agent-callable memory search and retrieval tools.
 *
 * Following OpenClaw's pattern: the agent actively searches and reads memory
 * when relevant, rather than blindly injecting all memory into every prompt.
 * This is more token-efficient and produces better recall.
 */

import type { EnsoAgentTool } from "./local-types.js";
import {
  searchMemory,
  getMemoryFile,
  listMemoryFiles,
  appendDailyMemory,
} from "./memory-bridge.js";

export function createMemoryTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_memory_search",
      label: "Memory Search",
      description: "Search across all Enso memory files (long-term memory, user profile, daily logs) using keyword matching. Use this BEFORE answering questions about prior work, user preferences, decisions, or past conversations. Returns ranked snippets with file references.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — keywords or phrases to find in memory",
          },
          maxResults: {
            type: "number",
            description: "Maximum results to return (default: 5)",
          },
        },
        required: ["query"],
      },
      isPrimary: true,
      execute: async (_callId, params) => {
        const query = String(params.query ?? "");
        const maxResults = Number(params.maxResults ?? 5);

        if (!query.trim()) {
          return { content: [{ type: "text", text: JSON.stringify({ results: [], message: "Empty query" }) }] };
        }

        const results = searchMemory(query, maxResults);
        const files = listMemoryFiles();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: "enso_memory_search",
              query,
              results: results.map((r) => ({
                file: r.file,
                snippet: r.snippet,
                relevance: Math.round(r.score * 100) + "%",
              })),
              availableFiles: files.map((f) => f.name),
              totalFiles: files.length,
            }),
          }],
        };
      },
    },
    {
      name: "enso_memory_get",
      label: "Memory Read",
      description: "Read a specific memory file by name. Use after memory_search to pull full context from a matched file. Supports reading specific line ranges for large files.",
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "Memory file name (e.g. 'ENSO_MEMORY.md', 'ENSO_USER.md', 'daily/2026-03-22.md')",
          },
          fromLine: {
            type: "number",
            description: "Start reading from this line number (1-based, optional)",
          },
          lineCount: {
            type: "number",
            description: "Number of lines to read (optional, defaults to entire file)",
          },
        },
        required: ["file"],
      },
      execute: async (_callId, params) => {
        const fileName = String(params.file ?? "");
        const fromLine = params.fromLine ? Number(params.fromLine) : undefined;
        const lineCount = params.lineCount ? Number(params.lineCount) : undefined;

        const content = getMemoryFile(fileName, fromLine, lineCount);
        if (content === null) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                tool: "enso_memory_get",
                file: fileName,
                content: "",
                message: `File "${fileName}" not found. Use memory_search to discover available files.`,
              }),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: "enso_memory_get",
              file: fileName,
              content,
              lines: content.split("\n").length,
            }),
          }],
        };
      },
    },
    {
      name: "enso_memory_save",
      label: "Memory Save",
      description: "Save a durable note to today's memory log. Use this to remember important facts, user preferences, decisions, or context that should persist across conversations. Append-only — never overwrites existing memory.",
      parameters: {
        type: "object",
        properties: {
          note: {
            type: "string",
            description: "The note to save. Be concise but include key facts. Format: '**Topic**: details'",
          },
        },
        required: ["note"],
      },
      execute: async (_callId, params) => {
        const note = String(params.note ?? "").trim();
        if (!note) {
          return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_memory_save", success: false, error: "Empty note" }) }] };
        }

        const success = appendDailyMemory(note);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: "enso_memory_save",
              success,
              message: success ? "Saved to today's memory log" : "Failed to save",
            }),
          }],
        };
      },
    },
  ];
}

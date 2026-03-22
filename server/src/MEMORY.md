# Enso Memory System

Enso has a multi-layered memory system that enables persistent, context-aware conversations. The system learns from interactions, provides agent-driven recall, and maintains conversation continuity across sessions.

## Architecture Overview

```
~/.enso/
├── memory/
│   ├── ENSO_USER.md          # User profile (manually editable)
│   ├── ENSO_MEMORY.md        # Curated long-term memory (auto-consolidated)
│   └── daily/
│       ├── 2026-03-20.md     # Daily append-only conversation log
│       ├── 2026-03-21.md
│       └── 2026-03-22.md     # Today's notes
└── cards/
    └── <clientId>.jsonl      # Card history journal (200 entries, auto-rotated)
```

## Two-Layer Storage

### Layer 1: Daily Logs (`memory/daily/YYYY-MM-DD.md`)
- **Purpose**: Capture everything from today's conversations
- **Write pattern**: Append-only, timestamped entries
- **Retention**: Kept for 2 days, then consolidated into curated memory
- **Sources**: Auto-extraction after responses, agent `enso_memory_save` calls, pre-compaction flush

### Layer 2: Curated Memory (`ENSO_MEMORY.md`)
- **Purpose**: Persistent long-term facts, preferences, decisions
- **Write pattern**: Consolidated from daily logs by LLM (keeps important facts, drops ephemera)
- **Size limit**: 4KB max, auto-pruned with LLM summarization
- **Always in context**: Injected into agent prompts (last 2KB)

### User Profile (`ENSO_USER.md`)
- **Purpose**: Manually editable user profile
- **Write pattern**: Written via Settings panel "About You" tab
- **Size limit**: 1KB injected into prompts
- **Always in context**: Injected alongside memory

## Components

### Memory Extractor (`memory-extractor.ts`)
Auto-learns from conversations. After each assistant response:
1. Calls Gemini Flash (or configured LLM) to extract memorable facts
2. Appends to today's daily log (not curated memory)
3. Rate-limited: max 1 extraction per 30 seconds
4. Skips trivial exchanges (greetings, short Q&A)
5. Deduplicates: skips if same topic already in today's log

**LLM provider**: Uses `callMemoryLLM()` which prefers Gemini Flash (cheapest) but falls back to any configured provider via the unified `callChatLLM()` system.

### Memory Tools (`memory-tools.ts`)
Three agent-callable tools for active memory recall:

| Tool | Purpose |
|------|---------|
| `enso_memory_search` | Keyword search across all memory files. Agent uses this before answering questions about prior work. |
| `enso_memory_get` | Read a specific memory file (supports line ranges). Used after search to pull full context. |
| `enso_memory_save` | Save a durable note to today's daily log. Agent uses this to remember new facts. |

### Memory Bridge (`memory-bridge.ts`)
Core infrastructure with five responsibilities:
1. **Card History**: JSONL journal per client, card state recovery after restart
2. **Context Injection**: `buildEnsoContext()` combines memory + app usage + errors for prompts
3. **Memory Surface**: Read/write ENSO_USER.md + ENSO_MEMORY.md
4. **Daily Logs**: `appendDailyMemory()`, `readRecentDailyLogs()`, `listDailyLogFiles()`
5. **Memory Search**: `searchMemory()` keyword matching, `getMemoryFile()` targeted reads

### Pre-Compaction Flush (`standalone-agent.ts`)
When conversation history exceeds 30 turns (before trimming to 40):
1. Extract substantive user messages from the older entries
2. Save topic summary to daily memory log
3. Trim history as normal

This prevents losing valuable context when the in-memory history is compacted.

## Data Flow

### Auto-Learning Flow
```
User sends message → Agent responds
                          ↓
                  deliverEnsoReply()
                          ↓
              extractAndPersistMemory() [fire-and-forget]
                          ↓
              Gemini Flash extracts facts
                          ↓
              appendDailyMemory() → memory/daily/2026-03-22.md
                          ↓
              invalidateContextCache() → next prompt picks up new memory
```

### Agent Recall Flow
```
User asks "What did we discuss yesterday?"
                    ↓
        Agent sees "## Memory Recall" in system prompt
                    ↓
        Agent calls enso_memory_search("yesterday discussion")
                    ↓
        searchMemory() scans MEMORY.md + daily logs
                    ↓
        Returns ranked snippets with file refs
                    ↓
        Agent calls enso_memory_get("daily/2026-03-21.md")
                    ↓
        Gets full content → synthesizes answer
```

### Consolidation Flow (Daily → Curated)
```
Daily log from 3+ days ago exists
                    ↓
        pruneIfNeeded() triggers
                    ↓
        LLM consolidates older daily logs:
          Keep: preferences, decisions, projects, accomplishments
          Drop: trivial exchanges, one-off questions
                    ↓
        appendEnsoMemory() → ENSO_MEMORY.md
                    ↓
        Delete consolidated daily files
                    ↓
        If MEMORY.md > 4KB → LLM prunes older entries
```

### Follow-Up Suggestions Flow
```
Agent sends response
        ↓
generateFollowUps() [heuristic, no LLM]
        ↓
Pattern match: research? code? steps? comparison?
        ↓
Send followUps message → frontend renders chips
        ↓
User clicks chip → sendMessage(prompt)
```

### Recent Topics Flow
```
Client connects → chat.history handler
        ↓
getRecentConversationTopics(clientId, 5)
        ↓
Groups card history into conversations (30-min gap)
        ↓
Extracts first user message as topic
        ↓
Send recentTopics → WelcomeCard renders "Pick up where you left off"
```

## Configuration

Memory extraction uses the centralized LLM provider system:
- **Primary**: Gemini Flash (cheapest for background tasks)
- **Fallback**: Any configured provider via `callChatLLM()`
- **Token budget**: User profile 1KB + memory 2KB = 3KB max in prompts
- **Context cache**: 60-second TTL, invalidated on new memory writes

## Key Files

| File | Purpose |
|------|---------|
| `server/src/memory-bridge.ts` | Core storage, search, context injection |
| `server/src/memory-extractor.ts` | Auto-learning from conversations |
| `server/src/memory-tools.ts` | Agent-callable search/get/save tools |
| `server/src/followup-generator.ts` | Heuristic follow-up suggestions |
| `server/src/standalone-agent.ts` | Pre-compaction flush, memory recall prompt |
| `src/components/FollowUpChips.tsx` | Follow-up chip UI |
| `src/components/WelcomeCard.tsx` | Recent topics section |
| `shared/types.ts` | Protocol types (followUps, recentTopics) |
| `src/cards/types.ts` | Card interface (followUps field) |

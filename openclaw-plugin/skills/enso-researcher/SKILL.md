---
name: enso-researcher
description: Deep multi-angle web research with AI synthesis, images, videos, and persistent history.
metadata: { "openclaw": { "emoji": "🔬", "requires": { "env": ["GEMINI_API_KEY"] } } }
---

# Enso Researcher

Deep web research with multi-query coverage, AI-synthesized narrative, images, videos, and a persistent research library.

## When to use

Use the researcher tools when:

- The user asks to **research**, **investigate**, or **look into** a topic
- A question needs **multiple sources** for a thorough answer (not a quick factual lookup)
- The user wants a **comprehensive overview** with citations
- Comparing two approaches, technologies, or perspectives
- Following up on a previously researched topic with a specific question

Do NOT use for:

- Simple factual questions ("What's the capital of France?")
- Tasks that need real-time data (stock prices, live scores)
- Requests the agent can answer from its own knowledge

## Tools

### enso_researcher_search (start here)

Primary entry point. Runs multiple web queries, fetches sources, and synthesizes findings with Gemini.

```
enso_researcher_search({ topic: "quantum computing applications", depth: "standard" })
```

- `depth`: `quick` (3 queries, fast), `standard` (6 queries, balanced), `deep` (8 queries, thorough)
- Results are **cached** — repeated searches return instantly from the research library
- Use `force: true` to bypass cache and get fresh results
- Returns: narrative, key findings, sections, sources, images, videos

### enso_researcher_deep_dive

Drill into a specific subtopic after an initial search.

```
enso_researcher_deep_dive({ topic: "quantum computing", subtopic: "error correction breakthroughs" })
```

### enso_researcher_compare

Side-by-side comparison of two topics with structured analysis.

```
enso_researcher_compare({ topicA: "React", topicB: "Vue", context: "for a startup MVP" })
```

### enso_researcher_follow_up

Ask a specific follow-up question in the context of prior research.

```
enso_researcher_follow_up({ topic: "quantum computing", question: "What are the main challenges for commercial adoption?" })
```

### enso_researcher_send_report

Email a research report. Pass the data from a previous search result.

```
enso_researcher_send_report({ recipient: "user@example.com", topic: "...", summary: "...", narrative: "...", keyFindings: [...], sections: [...], sources: [...] })
```

### enso_researcher_delete_history

Remove a topic from the persistent research library.

```
enso_researcher_delete_history({ topic: "outdated topic" })
```

## Workflow

1. **Start with `search`** — always research first before deep dives or comparisons
2. **Deep dive or follow up** — use the original topic to maintain context
3. **Compare** — works best after researching both topics individually
4. **Email** — pass the structured data from a search result to `send_report`

## Notes

- Research results persist across sessions in the user's research library
- The tool returns structured JSON; on Enso's UI channel it renders as an interactive research board
- Gemini API key is required for AI synthesis; without it, raw source results are returned

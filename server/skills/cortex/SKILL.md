---
name: cortex
description: "Knowledge Cortex: explore, discover, and grow your AI-maintained knowledge base with graph visualization, web discovery, and daily digest"
---

# Cortex

Knowledge Cortex: explore, discover, and grow your AI-maintained knowledge base with graph visualization, web discovery, and daily digest

## Available Tools

### enso_cortex_explore (primary)

Get Cortex dashboard: page stats by category, recent updates, top entities by connectivity, knowledge gaps, and recent operations log

### enso_cortex_read

Read a specific Cortex page with backlinks, outgoing links, related pages, and tags

Parameters:
- `path` (string): Page path (e.g. 'entities/react.md')

### enso_cortex_search

Search Cortex pages by keyword with optional category and tag filters

Parameters:
- `query` (string): Search query
- `category` (string): Filter by category: entities, concepts, sources, synthesis
- `tag` (string): Filter by tag

### enso_cortex_graph

Build knowledge graph with nodes (pages) and edges (wiki links) for visualization

### enso_cortex_discover

Search the web for latest content related to a Cortex topic, with AI-suggested branches to explore

Parameters:
- `topic` (string): Topic to discover new content for
- `path` (string): Optional: wiki page path to read context from

### enso_cortex_ingest

Ingest new knowledge into the Cortex from text, URL, or topic

Parameters:
- `text` (string): Text content to ingest
- `url` (string): Source URL for reference
- `topic` (string): Topic label

### enso_cortex_digest

Generate an AI summary of the Cortex: strengths, knowledge gaps, and suggested next explorations

### enso_cortex_daily_discovery

Daily scheduled task: search web for latest developments on top Cortex topics, ingest findings, and email a curated digest

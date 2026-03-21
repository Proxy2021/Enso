---
name: ai_pulse
description: "Stay current on AI developments with trending news, GitHub repos, and research highlights with a reading list"
---

# Ai Pulse

Stay current on AI developments with trending news, GitHub repos, and research highlights with a reading list

## Available Tools

### enso_ai_pulse_briefing (primary)

Get a daily AI briefing with the latest news, model releases, and trending topics

Parameters:
- `topic` (string): Optional focus topic (e.g. 'LLMs', 'computer vision', 'robotics')

### enso_ai_pulse_trending_repos

Discover trending AI/ML GitHub repositories

Parameters:
- `category` (string): Category filter: all, llm, vision, agents, tools, datasets (default: all)

### enso_ai_pulse_search_topic

Search for a specific AI topic, tool, paper, or technology

Parameters:
- `query` (string): Search query about AI topics

### enso_ai_pulse_reading_list

Manage your AI reading list — save, view, or remove items

Parameters:
- `action` (string): Action: view, save, remove
- `title` (string): Title of item to save
- `url` (string): URL of item to save
- `summary` (string): Summary of item to save
- `itemId` (string): ID of item to remove

---
name: sprint_results
description: "Sprint Results Dashboard — interactive view of focus area sprint deliverables with one-click actions, progress tracking, and shareable summaries. Shows deliverable cards, recommended first action, next steps, and focus area cycle progress."
---

Sprint Results Dashboard — interactive view of focus area sprint deliverables with one-click actions, progress tracking, and shareable summaries. Shows deliverable cards, recommended first action, next steps, and focus area cycle progress.

## Tool Reference

### enso_sprint_results_load (primary)

Load sprint results for a focus area. Shows deliverable cards, recommended first action, next steps, and cycle progress. If no focusId is given, loads results for the most recently completed sprint. Use when the user says: 'show sprint results', 'sprint dashboard', 'what did the sprint produce', 'show deliverables', 'focus area results'.

Parameters:
- `focusId` (string): Focus area ID to load results for. If omitted, loads the most recently completed sprint.

### enso_sprint_results_launch

Launch or open a specific sprint deliverable. For apps, triggers a run. For articles/ideas/synthesis, opens the entity content. Use when the user clicks an action button on a deliverable card.

Parameters:
- `entityId` (string): The Cortex entity ID of the deliverable
- `entityType` (string): Type: app, article, idea, or synthesis
- `focusId` (string): Focus area ID for context

### enso_sprint_results_next_cycle

Start the next evolution cycle for a focus area. Triggers a new Evaluate phase. Use when the user clicks 'Start Next Cycle'.

Parameters:
- `focusId` (string): Focus area ID to start the next cycle for

### enso_sprint_results_share

Generate a shareable text summary of sprint results. Produces a formatted summary suitable for sharing via email, chat, or notes. Use when the user clicks 'Share Results'.

Parameters:
- `focusId` (string): Focus area ID
- `format` (string): Output format: 'text' or 'markdown' (default: 'markdown')

### enso_sprint_results_mark_status

Mark a deliverable's status as viewed or acted-on. Tracks engagement with sprint deliverables. Use when the user interacts with a deliverable.

Parameters:
- `focusId` (string): Focus area ID
- `entityId` (string): The entity ID of the deliverable
- `status` (string): New status: 'viewed' or 'acted_on'

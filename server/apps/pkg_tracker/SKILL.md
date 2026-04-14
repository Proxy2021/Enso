---
name: pkg_tracker
description: "Personal Knowledge Graph deployment tracker with phase-based progress, data source monitoring, graph statistics, and quick actions for managing PKG infrastructure"
---

Personal Knowledge Graph deployment tracker with phase-based progress, data source monitoring, graph statistics, and quick actions for managing PKG infrastructure

## Tool Reference

### enso_pkg_tracker_get_status (primary)

Get the full PKG deployment status including all phases, tool statuses, progress bars, and data source health. Use when the user says: 'show PKG status', 'deployment progress', 'check tracker', 'open PKG tracker', 'knowledge graph setup'.

### enso_pkg_tracker_update_status

Update the deployment status of a specific tool within a phase. Statuses: not_started, in_progress, deployed, verified. Use when: 'mark Calibre-Web as deployed', 'update Neo4j status', 'set tool status'.

Parameters:
- `toolId` (string): Tool identifier (e.g. calibre_web, neo4j, jellyfin)
- `status` (string): New status: not_started, in_progress, deployed, or verified

### enso_pkg_tracker_update_notes

Update notes or toggle checklist items for a deployment tool. Use when: 'add notes to Neo4j', 'check off Docker install for Calibre', 'update tool notes'.

Parameters:
- `toolId` (string): Tool identifier
- `notes` (string): New notes text (optional, omit to keep current)
- `toggleCheckItem` (number): Index of checklist item to toggle (0-based, optional)

### enso_pkg_tracker_check_connections

Check connection status and health of all configured data sources. Returns live status for each source. Use when: 'check connections', 'data source health', 'are my services running'.

### enso_pkg_tracker_graph_stats

Get knowledge graph statistics including node counts by type, relationship counts, and most connected entities. Returns placeholder data until Neo4j is deployed. Use when: 'graph stats', 'knowledge graph overview', 'show graph metrics'.

### enso_pkg_tracker_run_action

Execute a quick action: full_sync, reset_tracker, export_status, or add_custom_tool. Use when: 'run full sync', 'reset tracker', 'export status', 'add custom tool'.

Parameters:
- `action` (string): Action to run: full_sync, reset_tracker, export_status, add_custom_tool
- `phaseId` (string): Phase ID for add_custom_tool action
- `toolName` (string): Tool name for add_custom_tool action
- `checklistItems` (string): Comma-separated checklist items for add_custom_tool

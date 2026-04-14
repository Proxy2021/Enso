---
name: workflow_mapper
description: "Workflow integration mapper — inventory your daily tools, map workflows, discover Enso integration opportunities, and build automation rules to eliminate friction"
---

Workflow integration mapper — inventory your daily tools, map workflows, discover Enso integration opportunities, and build automation rules to eliminate friction

## Tool Reference

### enso_workflow_mapper_browse (primary)

View your workflow profile: tool inventory summary, mapped workflows, integration score, and automation rules. Use when the user says: 'open workflow mapper', 'show my workflows', 'workflow dashboard', 'integration planner', 'show my tools'.

### enso_workflow_mapper_inventory

Add, remove, or update tools in your daily tool inventory. Specify category, frequency, use case, and pain points for each tool. Use when the user says: 'add a tool', 'I use Slack', 'update my tools', 'remove tool', 'edit tool inventory'.

Parameters:
- `action` (string): Action: add, remove, update, list
- `name` (string): Tool name (e.g. Gmail, Slack, GitHub, Notion, Calendar)
- `category` (string): Category: Communication, Productivity, Development, Media, Finance, Other
- `frequency` (string): Usage frequency: daily, weekly, monthly
- `useCase` (string): Primary use case in 1-3 words
- `painPoints` (string): Optional friction or pain points with this tool
- `toolId` (string): Tool ID for remove/update actions

### enso_workflow_mapper_map_workflow

Create or edit a daily workflow mapping with ordered steps, tools used, time estimates, and friction points. Use template names like 'Morning routine', 'Work deep focus', 'Meeting prep', 'End of day review', 'Weekend planning'. Use when the user says: 'map a workflow', 'create workflow', 'morning routine', 'map my process', 'add workflow steps'.

Parameters:
- `action` (string): Action: create, view, add_step, remove_step, delete
- `name` (string): Workflow name
- `template` (string): Template: morning_routine, deep_focus, meeting_prep, end_of_day, weekend_planning, blank
- `workflowId` (string): Workflow ID for view/edit/delete actions
- `stepLabel` (string): Step description for add_step
- `stepTool` (string): Tool used at this step for add_step
- `stepMinutes` (number): Estimated minutes for this step
- `stepFriction` (string): Friction/pain point at this step (optional)
- `stepId` (string): Step ID for remove_step

### enso_workflow_mapper_analyze

Analyze your tool inventory and workflows to discover integration opportunities — where Enso can add value, connect tools, save time, and reduce friction. Returns scored recommendations with impact levels. Use when the user says: 'find integration opportunities', 'how can Enso help', 'analyze my workflow', 'integration suggestions', 'where can Enso fit in'.

Parameters:
- `focus` (string): Focus area: all, communication, productivity, automation, time_saving (default: all)

### enso_workflow_mapper_automation

Create, view, or manage automation rules: 'When [trigger] in [tool], Enso should [action]'. Includes pre-built templates. Use when the user says: 'create automation', 'set up a rule', 'when this happens do that', 'automation templates', 'build automation'.

Parameters:
- `action` (string): Action: create, list, delete, use_template
- `trigger` (string): Trigger event description
- `triggerTool` (string): Tool that triggers the automation
- `ensoAction` (string): What Enso should do when triggered
- `priority` (string): Priority: high, medium, low
- `templateId` (string): Template ID for use_template action
- `automationId` (string): Automation ID for delete action

### enso_workflow_mapper_export

Export your workflow map, integration analysis, and automation plan as a structured report. Use when the user says: 'export workflow report', 'download integration plan', 'export my workflow map', 'save analysis'.

Parameters:
- `format` (string): Export format: summary, detailed, json (default: summary)

---
name: project_planner
description: "Project planning with phases, milestones, deliverables, risk matrices, and team assignments"
---

# Project Planner

Project planning with phases, milestones, deliverables, risk matrices, and team assignments

## Available Tools

### enso_project_planner_create (primary)

Create a project plan with phases, milestones, deliverables, and team assignments for any topic or goal

Parameters:
- `topic` (string): The project topic or goal to plan (e.g., 'product launch', 'office relocation', 'app development')
- `duration` (number): Total duration in days (default: 90)
- `teams` (string): Comma-separated list of team/owner names to assign deliverables to

### enso_project_planner_timeline

View the full project timeline with all phases, milestones, and deliverables

Parameters:
- `planId` (string): Plan ID to view

### enso_project_planner_add_milestone

Add a new milestone with deliverables to an existing project plan

Parameters:
- `planId` (string): Plan ID to add milestone to
- `name` (string): Milestone name
- `phase` (string): Phase ID this milestone belongs to
- `dayRange` (string): Day range (e.g., 'Days 15-25')
- `owner` (string): Team or person responsible
- `deliverables` (string): Comma-separated list of deliverable titles

### enso_project_planner_update

Update the status of a milestone (Planned, In Progress, Complete, At Risk)

Parameters:
- `planId` (string): Plan ID
- `milestoneId` (string): Milestone ID to update
- `status` (string): New status: Planned, In Progress, Complete, or At Risk

### enso_project_planner_risks

View the project risk matrix organized by likelihood and impact

Parameters:
- `planId` (string): Plan ID to view risks for

### enso_project_planner_summary

Get a summary dashboard with completion stats, phase breakdown, and progress

Parameters:
- `planId` (string): Plan ID to summarize

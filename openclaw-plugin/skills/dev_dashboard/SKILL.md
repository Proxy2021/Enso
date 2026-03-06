---
name: dev_dashboard
description: "Developer command center for tracking projects, ideas, tasks, and dev notes across coding sessions"
---

# Dev Dashboard

Developer command center for tracking projects, ideas, tasks, and dev notes across coding sessions

## Available Tools

### enso_dev_overview (primary)

Show the developer dashboard with project list, recent tasks, and quick stats

### enso_dev_scan_repos

Scan a directory for git repositories and add them to the project tracker

Parameters:
- `path` (string): Directory to scan for git repos (default: ~/Desktop/Github)

### enso_dev_manage_task

Create, update, or delete a project task

Parameters:
- `action` (string): Action: create, update, delete
- `taskId` (string): Task ID for update/delete
- `title` (string): Task title (for create)
- `project` (string): Project name (for create)
- `status` (string): Status: idea, todo, in-progress, done
- `priority` (string): Priority: low, medium, high
- `notes` (string): Task notes

### enso_dev_notebook

Manage dev notebook entries — save quick notes, code snippets, and links

Parameters:
- `action` (string): Action: view, add, delete
- `content` (string): Note content (for add)
- `tag` (string): Tag for categorization (e.g. 'snippet', 'idea', 'link', 'bug')
- `noteId` (string): Note ID for delete

### enso_dev_search_github

Search GitHub for repositories, tools, or code examples

Parameters:
- `query` (string): Search query

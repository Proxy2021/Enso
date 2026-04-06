---
name: projects_scanner
description: "Projects Scanner: discover and browse software projects on your machine with tech stack detection."
---

# Projects Scanner

Projects Scanner: discover and browse software projects on your machine with tech stack detection.

## Available Tools

### enso_projects_scannerbrowse (primary)

Browse detected software projects with technology stacks and file type analysis.

Parameters:
- `type` (string): Filter by project type (node, python, rust, etc.)
- `query` (string): Search by project name

### enso_projects_scannerscan

Scan the filesystem for software projects.

Parameters:
- `maxDepth` (number): Max directory depth (default: 3)

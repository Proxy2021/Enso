---
name: photo_culling_tool
description: "AI-powered photo culling tool — scan shoot folders, auto-detect sharpest frames, flag blurry/eyes-closed shots, approve/reject with keyboard shortcuts, and export results"
---

# Photo Culling Tool

AI-powered photo culling tool — scan shoot folders, auto-detect sharpest frames, flag blurry/eyes-closed shots, approve/reject with keyboard shortcuts, and export results

## Available Tools

### enso_photo_culling_tool_scan (primary)

Scan a folder of photos, extract EXIF, analyze sharpness, group bursts, and create a culling session. Use when the user says: 'cull my photos', 'scan shoot folder', 'open photo culling', 'analyze my shoot', 'find best shots'.

Parameters:
- `folderPath` (string): Path to the folder containing photos to scan
- `burstThresholdMs` (number): Milliseconds between shots to group as burst (default: 3000)
- `blurThreshold` (number): Sharpness score below which images are flagged blurry (default: 50)
- `skipFaces` (boolean): Skip face/eyes-closed detection (default: false)
- `rescan` (boolean): Force rescan even if a session exists (default: false)

### enso_photo_culling_tool_review

View current culling group with burst filmstrip, sharpness scores, and face flags. Use when navigating through the culling workflow.

Parameters:
- `groupIndex` (number): Group index to jump to
- `imageIndex` (number): Image index within the group

### enso_photo_culling_tool_decide

Approve, reject, or skip an image. Supports undo and group-level actions. Use for culling decisions.

Parameters:
- `action` (string): Decision action: approve, reject, skip, undo, approve_group, reject_group
- `imagePath` (string): Specific image path (optional, defaults to current)
- `groupId` (string): Group ID for group-level actions

### enso_photo_culling_tool_navigate

Navigate between groups and images: next/prev group, next/prev image, jump to group.

Parameters:
- `direction` (string): Navigation direction: next_group, prev_group, next_image, prev_image, jump_group
- `targetIndex` (number): Target group index for jump_group

### enso_photo_culling_tool_export

Export culling decisions as JSON sidecar files. Optionally move rejected images to a subfolder.

Parameters:
- `exportMode` (string): What to export: approved_only, all_decided, or all (default: all_decided)
- `starRating` (number): Star rating for approved images 1-5 (default: 1)
- `moveRejected` (boolean): Move rejected images to _rejected subfolder (default: false)

### enso_photo_culling_tool_settings

View or update culling thresholds (blur threshold, burst grouping window). Updates re-evaluate flags without rescanning.

Parameters:
- `burstThresholdMs` (number): Burst grouping window in milliseconds
- `blurThreshold` (number): Sharpness score below which images are flagged blurry
- `earThreshold` (number): Eye aspect ratio threshold for eyes-closed detection

### enso_photo_culling_tool_summary

Show session summary: totals, approved/rejected/pending counts, completion percentage, group-by-group breakdown.

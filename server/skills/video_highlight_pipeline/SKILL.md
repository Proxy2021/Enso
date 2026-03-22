---
name: video_highlight_pipeline
description: "Video highlight studio for scene detection, best-frame extraction, scoring, and highlight reel assembly from event/wedding videos"
---

# Video Highlight Pipeline

Video highlight studio for scene detection, best-frame extraction, scoring, and highlight reel assembly from event/wedding videos

## Available Tools

### enso_video_highlight_pipeline_analyze_video (primary)

Analyze a video file: probe metadata and detect scene change boundaries. Use when: 'analyze this video', 'detect scenes', 'inspect video', 'what's in this video'.

Parameters:
- `path` (string): Path to the video file
- `threshold` (number): Scene detection sensitivity (0.0-1.0, lower = more sensitive, default: 0.3)

### enso_video_highlight_pipeline_extract_frames

Extract the N best still frames from the video based on scene boundaries and a scoring strategy (sharpness, face-priority, or balanced).

Parameters:
- `path` (string): Path to the video file
- `frameCount` (number): Number of best frames to extract (default: 20)
- `scoringStrategy` (string): Scoring strategy: sharpness, face-priority, or balanced (default: balanced)
- `outputDir` (string): Output directory for extracted frames (default: auto)

### enso_video_highlight_pipeline_preview_frames

Display extracted frames as a gallery with quality scores and timestamps for review. Allows approve/reject toggling before highlight reel generation.

Parameters:
- `path` (string): Path to the video file (used to load stored frame data)
- `outputDir` (string): Directory containing extracted frames
- `sortBy` (string): Sort frames by: score, timestamp, or rank (default: rank)

### enso_video_highlight_pipeline_generate_highlight_reel

Assemble a highlight reel video from approved frames/clips with configurable duration, transition style, and audio handling.

Parameters:
- `path` (string): Path to the source video file
- `duration` (number): Target reel duration in seconds (default: 60)
- `clipDuration` (number): Duration of each clip segment in seconds (default: 4.5)
- `transitionStyle` (string): Transition style: dissolve, fadewhite, smoothleft, mixed (default: mixed)
- `outputDir` (string): Output directory for the highlight reel

### enso_video_highlight_pipeline_configure_pipeline

View or update pipeline configuration: scoring weights, frame count, reel duration, transition preferences, and output settings.

Parameters:
- `action` (string): Action: get (view current), set (update settings), reset (restore defaults)
- `frameCount` (number): Number of best frames to extract (default: 20)
- `reelDuration` (number): Target highlight reel duration in seconds (default: 60)
- `clipDuration` (number): Duration per clip in seconds (default: 4.5)
- `transitionDuration` (number): Transition duration in seconds (default: 0.5)
- `transitionStyle` (string): Transition style: dissolve, fadewhite, smoothleft, mixed
- `scoringStrategy` (string): Frame scoring: sharpness, face-priority, balanced
- `sceneThreshold` (number): Scene detection threshold (0.0-1.0)

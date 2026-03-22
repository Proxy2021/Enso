---
name: media_processing
description: "Media processing tools: video intelligence (inspect, scene detection, frame extraction), contact sheets, AI upscaling, background removal"
---

# Media Processing

Media processing tools: video intelligence (inspect, scene detection, frame extraction), contact sheets, AI upscaling, background removal

## Available Tools

### enso_media_processing_inspect (primary)

Inspect a video file: get duration, resolution, codec, fps, bitrate, audio info. Use when user says: 'inspect this video', 'video details', 'what format is this video'.

Parameters:
- `path` (string): Path to the video file

### enso_media_processing_frames

Extract frames from a video at intervals, keyframes, or a specific count. Use when user says: 'extract frames', 'grab stills from video', 'get screenshots from video'.

Parameters:
- `path` (string): Path to the video file
- `mode` (string): Extraction mode: interval (every N seconds), keyframes (I-frames only), or count (N evenly-spaced frames). Default: count
- `value` (number): Seconds for interval mode, or frame count for count mode. Default: 10

### enso_media_processing_scenes

Detect scene changes/boundaries in a video using frame difference analysis. Use when user says: 'detect scenes', 'find scene changes', 'scene boundaries'.

Parameters:
- `path` (string): Path to the video file
- `threshold` (number): Scene change sensitivity (0.0-1.0, lower = more sensitive). Default: 0.3

### enso_media_processing_thumbnail

Generate a thumbnail image from a video at a specific timestamp. Use when user says: 'video thumbnail', 'generate preview image', 'screenshot at timestamp'.

Parameters:
- `path` (string): Path to the video file
- `time` (number): Timestamp in seconds to capture. Default: 1
- `size` (string): Output size (e.g., '640x480', '1280x720'). Default: 320x240

### enso_media_processing_sheet

Generate a contact sheet (thumbnail grid) from a folder of photos with filename and EXIF metadata overlay. Use when user says: 'contact sheet', 'thumbnail grid', 'proof sheet', 'photo grid'.

Parameters:
- `path` (string): Path to folder containing photos
- `columns` (number): Number of columns in grid. Default: 5
- `showExif` (boolean): Show EXIF metadata overlay. Default: true
- `thumbSize` (number): Size of each thumbnail in pixels. Default: 300

### enso_media_processing_upscale

Upscale an image to 2x or 4x resolution using AI enhancement. Use when user says: 'upscale photo', 'increase resolution', 'enlarge image', 'make larger for printing'.

Parameters:
- `path` (string): Path to the image file
- `scale` (number): Scale factor: 2 or 4. Default: 2

### enso_media_processing_rmbg

Remove the background from an image, outputting a transparent PNG. Use when user says: 'remove background', 'transparent PNG', 'cut out subject', 'product cutout'.

Parameters:
- `path` (string): Path to the image file
- `outputFormat` (string): Output format: png or webp. Default: png

---
name: video_studio
description: "AI video generation studio: create cinematic videos from text prompts, animate still images, craft optimized prompts, and manage a video gallery"
---

Build a new app based on this card's context: ​[init:claude-opus-4-6|2.1.63|19|0|bypassPermissions]

## Tool Reference

### enso_video_studio_generate (primary)

Generate a video from a text prompt using Seedance AI. Supports cinematic, realistic, anime, and 3D styles. Duration 4-12 seconds, up to 1080p resolution with native audio.

Parameters:
- `prompt` (string): Detailed scene description. English recommended. Include camera motion, lighting, and style for best results.
- `duration` (number): Video duration in seconds (4-12). Default: 5
- `resolution` (string): Output resolution: 480p, 720p, or 1080p. Default: 720p
- `ratio` (string): Aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9. Default: 16:9
- `generate_audio` (boolean): Generate native audio alongside the video. Default: true
- `seed` (number): Random seed for reproducibility. Optional.

### enso_video_studio_animate

Animate a still image into a video using Seedance AI. Provide an image as the first frame and an optional motion description.

Parameters:
- `image_path` (string): Absolute path to the source image to animate (first frame)
- `prompt` (string): Optional motion/scene description (e.g., 'camera slowly zooms in, leaves sway gently')
- `duration` (number): Video duration in seconds (4-12). Default: 5
- `resolution` (string): Output resolution: 480p, 720p, or 1080p. Default: 720p
- `ratio` (string): Aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive. Default: adaptive

### enso_video_studio_craft_prompt

Use AI to craft an optimized Seedance video prompt from a rough description, script, or idea. Returns a detailed English prompt with camera directions, lighting, and style notes, plus recommended generation settings.

Parameters:
- `description` (string): Your rough idea, story script, or scene description in any language
- `style` (string): Visual style hint: cinematic, anime, realistic, noir, fantasy, sci-fi, documentary. Default: cinematic
- `mood` (string): Mood hint: dramatic, serene, mysterious, energetic, melancholic, epic. Optional.

### enso_video_studio_gallery

Browse all generated Seedance videos with file details, sorted by most recent. Shows video previews, creation dates, and sizes.

Parameters:
- `sortBy` (string): Sort by: date or size. Default: date
- `sortDir` (string): Sort direction: desc or asc. Default: desc (newest first)
- `filter` (string): Filter by type: all, t2v (text-to-video), i2v (image-to-video). Default: all

### enso_video_studio_history

View the history of all video generation tasks including prompts, settings, and outcomes. Tracks both text-to-video and image-to-video generations.

Parameters:
- `limit` (number): Maximum number of history entries to return. Default: 50

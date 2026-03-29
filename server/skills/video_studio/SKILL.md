---
name: video_studio
description: "AI video generation studio: create 短视频 projects for Douyin/TikTok/RedNote/Bilibili with AI scene planning, animate still images into photo stories, generate single clips from text prompts, decompose scripts into storyboards, craft optimized prompts, and browse your video gallery"
---

# Video Studio

AI video generation studio for production-level short-form video (短视频) creation. Plan full multi-scene projects with viral hooks, animate photo collections, generate single clips, and browse your gallery.

## Available Tools

### enso_video_studio_view (primary)

Open the Video Studio landing page. Shows a 5-tab interface: 短视频 project planner, Photo Story, Single Clip, Multi-Scene storyboard, and Animate. The 短视频 tab is the recommended starting point for creating platform-optimized vertical video content.

### enso_video_studio_short_video

Plan a complete 短视频 (short-form video) project for a specific platform with AI-generated scene breakdown, hook strategy, music direction, platform tips, and hashtags. Returns a full storyboard ready for batch generation.

Parameters:
- `concept` (string): Your video idea in any language — e.g., "Morning coffee ritual with ASMR sounds" or "一个关于坚持的励志故事"
- `platform` (string): Target platform: douyin, tiktok, rednote, bilibili, youtube_shorts, wechat. Default: douyin
- `category` (string): Content category: lifestyle, education, food, travel, beauty, entertainment, product. Default: lifestyle
- `target_duration` (number): Total video duration in seconds (15-60). Default: 30
- `hook_style` (string): Hook style: action, question, mystery, shock, emotional, tutorial, auto. Default: auto

### enso_video_studio_batch_generate

Generate multiple video scenes in sequence from a scene list. Use after short_video or script_to_scenes to render all scenes. Shows per-scene progress and video players on completion.

Parameters:
- `scenes` (array): Array of scene objects with prompt, duration, ratio, resolution
- `projectId` (string): Optional project ID to update stored project state

### enso_video_studio_style_gallery

Browse 14 viral format templates for short-form video across 7 categories (education, lifestyle, entertainment, food, travel, beauty, product). Each template includes hook type, scene structure, viral potential score, and an example prompt. Use to inspire or pre-fill a new 短视频 project.

### enso_video_studio_photo_story

Animate a list of static images into a cohesive short video narrative using Image-to-Video AI. Each image gets AI-generated motion directions (Ken Burns zoom, pan, push-in, tilt-up). Returns per-frame video clips with captions, audio notes, and platform-optimized hashtags.

Parameters:
- `image_paths` (array): Absolute paths to source images (JPG, PNG, WEBP)
- `concept` (string): Story theme — what narrative do your photos tell?
- `platform` (string): Target platform: douyin, tiktok, rednote, bilibili, youtube_shorts, wechat. Default: douyin
- `style` (string): Visual style: cinematic, emotional, energetic, nostalgic. Default: cinematic
- `duration_per_photo` (number): Seconds per animated clip (4-15). Default: 5
- `image_descriptions` (array): Optional human-provided descriptions for each image

### enso_video_studio_generate

Generate a single video clip from a text prompt using Seedance AI. Duration 4-30 seconds (limit depends on your BytePlus API tier), up to 1080p with native audio. Default: 1080p 9:16 portrait for 短视频.

Parameters:
- `prompt` (string): Detailed scene description in English. Include camera motion, lighting, subjects, and style.
- `duration` (number): Video duration in seconds (4-30). Default: 5
- `resolution` (string): Output resolution: 480p, 720p, or 1080p. Default: 1080p
- `ratio` (string): Aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9. Default: 9:16
- `generate_audio` (boolean): Generate native audio alongside the video. Default: true
- `seed` (number): Random seed for reproducibility. Optional.

### enso_video_studio_animate

Animate a still image into a video using Seedance AI. Provide an image file path as the first frame and an optional motion description.

Parameters:
- `image_path` (string): Absolute path to the source image to animate (first frame)
- `prompt` (string): Optional motion/scene description (e.g., 'camera slowly zooms in, leaves sway gently')
- `duration` (number): Video duration in seconds (4-30). Default: 5
- `resolution` (string): Output resolution: 480p, 720p, or 1080p. Default: 1080p
- `ratio` (string): Aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive. Default: adaptive

### enso_video_studio_craft_prompt

Craft an optimized Seedance video prompt from a rough idea in any language. Returns a detailed English prompt with camera directions, lighting, and style, plus recommended settings and alternative variants.

Parameters:
- `description` (string): Your rough idea or scene description in any language
- `style` (string): Visual style: cinematic, anime, realistic, noir, fantasy, sci-fi, documentary. Default: cinematic
- `mood` (string): Mood hint: dramatic, serene, mysterious, energetic, melancholic, epic. Optional.

### enso_video_studio_script_to_scenes

Decompose a full script or multi-scene narrative into individual scene prompts with captions, audio notes, and transitions. Supports platform-specific ratio defaults.

Parameters:
- `script` (string): Full script, story, or multi-scene concept in any language
- `scene_count` (number): Target number of scenes (2-12). Default: auto-detect
- `style` (string): Visual style for all scenes. Default: cinematic
- `duration_per_scene` (number): Target duration per scene in seconds (3-15). Default: 5
- `platform` (string): Target platform for ratio defaults: douyin, tiktok, rednote, bilibili. Optional.

### enso_video_studio_gallery

Browse all generated Seedance videos with file details, prompts, and video previews.

Parameters:
- `sortBy` (string): Sort by: date or size. Default: date
- `sortDir` (string): Sort direction: desc or asc. Default: desc
- `filter` (string): Filter by type: all, t2v, i2v. Default: all

### enso_video_studio_history

View history of all video generation tasks including prompts, settings, outcomes, and links to generated videos.

Parameters:
- `limit` (number): Maximum entries to return. Default: 50
- `search` (string): Search prompts by keyword. Optional.
- `status` (string): Filter by status: all, success, failed. Default: all

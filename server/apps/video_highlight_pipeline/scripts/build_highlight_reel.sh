#!/usr/bin/env bash
# build_highlight_reel.sh — Stage 5: Build highlight reel with xfade transitions
# Usage: ./build_highlight_reel.sh <input_video> [output_dir] [target_duration] [clip_duration] [transition_duration]
#
# Requires: best_frames.json and scenes.json in output_dir
# Outputs:  highlight_reel.mp4, highlights.json in output_dir

set -euo pipefail

# --- Arguments ---
INPUT_VIDEO="${1:?Usage: build_highlight_reel.sh <input_video> [output_dir] [target_dur] [clip_dur] [trans_dur]}"
OUTPUT_DIR="${2:-./output}"
TARGET_DURATION="${3:-60}"
CLIP_DURATION="${4:-4.5}"
TRANSITION_DURATION="${5:-0.5}"

# --- Validate ---
if [ ! -f "$INPUT_VIDEO" ]; then
    echo "ERROR: Input video not found: $INPUT_VIDEO" >&2
    exit 1
fi

BEST_FRAMES_JSON="$OUTPUT_DIR/best_frames.json"
SCENES_JSON="$OUTPUT_DIR/scenes.json"

if [ ! -f "$BEST_FRAMES_JSON" ]; then
    echo "ERROR: best_frames.json not found in $OUTPUT_DIR" >&2
    echo "  Run extract_frames.py first." >&2
    exit 1
fi

if [ ! -f "$SCENES_JSON" ]; then
    echo "ERROR: scenes.json not found in $OUTPUT_DIR" >&2
    exit 1
fi

command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg is required" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 is required" >&2; exit 1; }

CLIPS_DIR="$OUTPUT_DIR/clips"
mkdir -p "$CLIPS_DIR"

# --- Run highlight reel assembly via Python ---
echo "Building highlight reel (target=${TARGET_DURATION}s, clip=${CLIP_DURATION}s, transition=${TRANSITION_DURATION}s)..."

python3 - "$INPUT_VIDEO" "$OUTPUT_DIR" "$TARGET_DURATION" "$CLIP_DURATION" "$TRANSITION_DURATION" <<'PYEOF'
import sys
import json
import os
import subprocess
import math
from datetime import datetime

input_video = sys.argv[1]
output_dir = sys.argv[2]
target_duration = float(sys.argv[3])
clip_duration = float(sys.argv[4])
transition_duration = float(sys.argv[5])

clips_dir = os.path.join(output_dir, "clips")

# Load data
with open(os.path.join(output_dir, "best_frames.json")) as f:
    best_data = json.load(f)
best_frames = best_data["frames"]

with open(os.path.join(output_dir, "scenes.json")) as f:
    scenes_data = json.load(f)
scenes = scenes_data["scenes"]
video_duration = scenes_data.get("total_duration_sec", scenes[-1]["end_time"] if scenes else 0)

def format_timecode(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


# ── Stage 5a: Select clips ──

# Calculate number of clips needed
effective_clip = clip_duration - transition_duration
n_clips = int(round((target_duration + transition_duration) / clip_duration))
n_clips = max(8, min(n_clips, 18))  # clamp 8-18

if len(best_frames) < n_clips:
    n_clips = len(best_frames)

# Subsample for even temporal distribution
if len(best_frames) > n_clips:
    step = len(best_frames) / n_clips
    clip_frames = [best_frames[int(i * step)] for i in range(n_clips)]
else:
    clip_frames = best_frames[:n_clips]

# Sort chronologically
clip_frames.sort(key=lambda f: f["timestamp_sec"])

# Wedding-elegant transition rotation
TRANSITIONS = [
    "dissolve", "fadewhite", "dissolve",
    "smoothleft", "dissolve", "fade"
]

# Build clip definitions
highlights = []
for i, frame in enumerate(clip_frames):
    t = frame["timestamp_sec"]
    half = clip_duration / 2
    clip_start = max(0, t - half)

    # Clamp to scene boundaries
    scene = next((s for s in scenes if s["start_time"] <= t < s["end_time"]), None)
    if scene:
        clip_start = max(clip_start, scene["start_time"])
        clip_end = clip_start + clip_duration
        if clip_end > scene["end_time"]:
            clip_start = max(scene["start_time"], scene["end_time"] - clip_duration)
        # Final clamp to video duration
        if clip_start + clip_duration > video_duration:
            clip_start = max(0, video_duration - clip_duration)

    transition = TRANSITIONS[i % len(TRANSITIONS)] if i < len(clip_frames) - 1 else None

    highlights.append({
        "clip_index": i,
        "source_frame_rank": frame.get("rank", i + 1),
        "clip_start_sec": round(clip_start, 3),
        "clip_end_sec": round(clip_start + clip_duration, 3),
        "clip_duration": clip_duration,
        "scene_id": frame.get("scene_id", 0),
        "composite_score": frame.get("composite_score", 0),
        "timecode_start": format_timecode(clip_start),
        "timecode_end": format_timecode(clip_start + clip_duration),
        "transition_to_next": transition,
        "normalized_filename": f"clip_{i+1:02d}.mp4"
    })

print(f"  Selected {len(highlights)} clips for highlight reel")


# ── Stage 5b: Extract and normalize clips ──

print("  Extracting and normalizing clips...")
for clip in highlights:
    clip_num = clip["clip_index"] + 1
    raw_path = os.path.join(clips_dir, f"raw_clip_{clip_num:02d}.mp4")
    norm_path = os.path.join(clips_dir, f"clip_{clip_num:02d}.mp4")

    # Extract with stream copy (fast)
    cmd_extract = [
        "ffmpeg", "-y",
        "-ss", str(clip["clip_start_sec"]),
        "-i", input_video,
        "-t", str(clip["clip_duration"]),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        raw_path
    ]
    result = subprocess.run(cmd_extract, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    WARNING: Failed to extract clip {clip_num}: {result.stderr[:200]}")
        continue

    # Normalize (required for xfade — consistent format, resolution, fps)
    cmd_normalize = [
        "ffmpeg", "-y",
        "-i", raw_path,
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
               "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        norm_path
    ]
    result = subprocess.run(cmd_normalize, capture_output=True, text=True)
    if result.returncode != 0:
        # Retry without audio (source clip may lack audio)
        cmd_normalize_no_audio = [
            "ffmpeg", "-y",
            "-i", raw_path,
            "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
                   "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-an",
            norm_path
        ]
        result2 = subprocess.run(cmd_normalize_no_audio, capture_output=True, text=True)
        if result2.returncode != 0:
            print(f"    WARNING: Failed to normalize clip {clip_num}: {result2.stderr[:200]}")
            continue

    # Clean up raw clip
    try:
        os.remove(raw_path)
    except OSError:
        pass

    print(f"    Clip {clip_num:02d}: {clip['timecode_start']} → {clip['timecode_end']} "
          f"(score={clip['composite_score']:.4f})")


# ── Stage 5c: Build xfade filter chain ──

print("  Building xfade filter chain...")

# Verify all clips exist
valid_clips = []
for clip in highlights:
    clip_path = os.path.join(clips_dir, clip["normalized_filename"])
    if os.path.isfile(clip_path):
        valid_clips.append(clip)
    else:
        print(f"    WARNING: Missing normalized clip: {clip['normalized_filename']}")

if len(valid_clips) < 2:
    print("ERROR: Need at least 2 clips for highlight reel", file=sys.stderr)
    sys.exit(1)

n = len(valid_clips)

# Check if clips have audio
has_audio = True
probe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams",
             os.path.join(clips_dir, valid_clips[0]["normalized_filename"])]
probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
if probe_result.returncode == 0:
    probe_data = json.loads(probe_result.stdout)
    audio_streams = [s for s in probe_data.get("streams", []) if s.get("codec_type") == "audio"]
    has_audio = len(audio_streams) > 0

# Build FFmpeg inputs
inputs = []
for clip in valid_clips:
    inputs.extend(["-i", os.path.join(clips_dir, clip["normalized_filename"])])

# Build video xfade filter chain
filters = []
prev_label = "[0:v]"

for i in range(1, n):
    offset = i * (clip_duration - transition_duration)
    transition = valid_clips[i - 1].get("transition_to_next", "dissolve") or "dissolve"

    in_label = f"[{i}:v]"
    if i < n - 1:
        out_label = f"[v{i:02d}]"
    else:
        out_label = "[vout]"

    filters.append(
        f"{prev_label}{in_label}xfade=transition={transition}"
        f":duration={transition_duration}:offset={offset:.3f}{out_label}"
    )

    if i < n - 1:
        prev_label = f"[v{i:02d}]"

# Build audio crossfade chain (if audio exists)
if has_audio:
    prev_audio = "[0:a]"
    for i in range(1, n):
        in_label = f"[{i}:a]"
        if i < n - 1:
            out_label = f"[a{i:02d}]"
        else:
            out_label = "[aout]"
        filters.append(
            f"{prev_audio}{in_label}acrossfade=d={transition_duration}"
            f":c1=tri:c2=tri{out_label}"
        )
        if i < n - 1:
            prev_audio = f"[a{i:02d}]"

filter_complex = ";\n".join(filters)

reel_path = os.path.join(output_dir, "highlight_reel.mp4")

cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex]
if has_audio:
    cmd += ["-map", "[vout]", "-map", "[aout]"]
else:
    cmd += ["-map", "[vout]"]
cmd += [
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    reel_path
]

print(f"  Rendering reel with {n} clips and {n-1} transitions...")
result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print(f"ERROR: xfade render failed:\n{result.stderr[:500]}", file=sys.stderr)

    # Fallback: try video-only if audio caused issues
    if has_audio:
        print("  Retrying without audio crossfade...")
        # Rebuild with video only
        video_filters = [f for f in filters if "xfade" in f]
        filter_complex_v = ";\n".join(video_filters)
        cmd_fallback = (
            ["ffmpeg", "-y"] + inputs +
            ["-filter_complex", filter_complex_v,
             "-map", "[vout]", "-an",
             "-c:v", "libx264", "-preset", "medium", "-crf", "18",
             "-movflags", "+faststart",
             reel_path]
        )
        result2 = subprocess.run(cmd_fallback, capture_output=True, text=True)
        if result2.returncode != 0:
            print(f"ERROR: Video-only render also failed:\n{result2.stderr[:500]}", file=sys.stderr)
            sys.exit(1)
        print("  Rendered reel (video only, no audio)")
    else:
        sys.exit(1)

# Generate thumbnail
thumbnail_path = os.path.join(output_dir, "reel_thumbnail.jpg")
subprocess.run([
    "ffmpeg", "-y", "-ss", "2", "-i", reel_path,
    "-frames:v", "1", "-q:v", "2", thumbnail_path
], capture_output=True)

# Calculate actual reel duration
probe_reel = subprocess.run(
    ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", reel_path],
    capture_output=True, text=True
)
actual_duration = target_duration
if probe_reel.returncode == 0:
    reel_info = json.loads(probe_reel.stdout)
    actual_duration = float(reel_info.get("format", {}).get("duration", target_duration))

# Write highlights.json
highlights_output = {
    "version": 1,
    "reel_params": {
        "target_duration_sec": target_duration,
        "clip_duration_sec": clip_duration,
        "transition_duration_sec": transition_duration,
        "transition_style": "wedding_elegant",
        "output_resolution": "1920x1080",
        "output_fps": 30,
        "codec": "libx264",
        "crf": 18
    },
    "actual_duration_sec": round(actual_duration, 2),
    "clip_count": len(valid_clips),
    "created_at": datetime.utcnow().isoformat() + "Z",
    "clips": valid_clips,
    "reel_path": "highlight_reel.mp4",
    "reel_thumbnail": "reel_thumbnail.jpg"
}

highlights_path = os.path.join(output_dir, "highlights.json")
with open(highlights_path, "w") as f:
    json.dump(highlights_output, f, indent=2)

print(f"\n  Highlight reel: {reel_path}")
print(f"  Duration: {actual_duration:.1f}s ({len(valid_clips)} clips)")
print(f"  Highlights manifest: {highlights_path}")
PYEOF

echo "Highlight reel build complete."

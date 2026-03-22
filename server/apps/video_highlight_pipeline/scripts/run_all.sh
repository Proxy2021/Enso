#!/usr/bin/env bash
# run_all.sh — Master orchestrator for the video highlight pipeline
# Usage: ./run_all.sh <input_video> [output_dir] [num_best_frames] [reel_duration_sec]
#
# Chains all stages:
#   1. detect_scenes.sh → scenes.json
#   2. extract_frames.py → frames.json, best_frames.json, frames/*.jpg
#   3. build_highlight_reel.sh → highlight_reel.mp4, highlights.json
#   4. Produces results.json summary
#
# Environment variables for advanced config:
#   SCENE_THRESHOLD        Scene detection threshold (default: 3.0)
#   MIN_SCENE_LEN          Minimum scene length in seconds (default: 3)
#   MAX_SCENE_DURATION     Max scene duration before subdivision (default: 120)
#   MIN_FRAME_SPACING      Minimum seconds between selected frames (default: 30)
#   CLIP_DURATION          Duration of each highlight clip (default: 4.5)
#   TRANSITION_DURATION    Crossfade transition duration (default: 0.5)
#   SAMPLE_FPS             Candidate extraction rate (default: 1)
#   ANALYSIS_WIDTH         Frame analysis width in pixels (default: 1280)
#   FACE_DETECTION         on|off (default: on)

set -euo pipefail

# --- Arguments ---
INPUT_VIDEO="${1:?Usage: run_all.sh <input_video> [output_dir] [num_best] [reel_duration]}"
OUTPUT_DIR="${2:-./output}"
NUM_BEST="${3:-20}"
REEL_DURATION="${4:-60}"

# --- Config from env vars ---
SCENE_THRESHOLD="${SCENE_THRESHOLD:-3.0}"
MIN_SCENE_LEN="${MIN_SCENE_LEN:-3}"
MAX_SCENE_DURATION="${MAX_SCENE_DURATION:-120}"
MIN_FRAME_SPACING="${MIN_FRAME_SPACING:-30}"
CLIP_DURATION="${CLIP_DURATION:-4.5}"
TRANSITION_DURATION="${TRANSITION_DURATION:-0.5}"
SAMPLE_FPS="${SAMPLE_FPS:-1}"
ANALYSIS_WIDTH="${ANALYSIS_WIDTH:-1280}"
FACE_DETECTION="${FACE_DETECTION:-on}"

# --- Validate ---
if [ ! -f "$INPUT_VIDEO" ]; then
    echo "ERROR: Input video not found: $INPUT_VIDEO" >&2
    exit 1
fi

# Resolve to absolute path
INPUT_VIDEO="$(cd "$(dirname "$INPUT_VIDEO")" && pwd)/$(basename "$INPUT_VIDEO")"

command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg is required" >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe is required" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 is required" >&2; exit 1; }

# Find script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$OUTPUT_DIR"

# Track timing
PIPELINE_START=$(date +%s)

echo "======================================"
echo " Video Highlight Pipeline"
echo "======================================"
echo "  Input:    $INPUT_VIDEO"
echo "  Output:   $OUTPUT_DIR"
echo "  Best:     $NUM_BEST frames"
echo "  Reel:     ${REEL_DURATION}s target"
echo "======================================"
echo ""

# --- Stage 1: Scene Detection ---
echo "═══ STAGE 1/3: Scene Detection ═══"
STAGE1_START=$(date +%s)

bash "$SCRIPT_DIR/detect_scenes.sh" \
    "$INPUT_VIDEO" \
    "$OUTPUT_DIR" \
    "$SCENE_THRESHOLD" \
    "$MIN_SCENE_LEN" \
    "$MAX_SCENE_DURATION"

STAGE1_END=$(date +%s)
STAGE1_TIME=$((STAGE1_END - STAGE1_START))
echo "  Stage 1 completed in ${STAGE1_TIME}s"
echo ""

# --- Stage 2-4: Frame Extraction, Scoring, Selection, Export ---
echo "═══ STAGE 2/3: Frame Extraction & Selection ═══"
STAGE2_START=$(date +%s)

python3 "$SCRIPT_DIR/extract_frames.py" \
    "$INPUT_VIDEO" \
    --output-dir "$OUTPUT_DIR" \
    --num-best "$NUM_BEST" \
    --min-spacing "$MIN_FRAME_SPACING" \
    --sample-fps "$SAMPLE_FPS" \
    --analysis-width "$ANALYSIS_WIDTH" \
    --face-detection "$FACE_DETECTION"

STAGE2_END=$(date +%s)
STAGE2_TIME=$((STAGE2_END - STAGE2_START))
echo "  Stages 2-4 completed in ${STAGE2_TIME}s"
echo ""

# --- Stage 5: Highlight Reel ---
echo "═══ STAGE 3/3: Highlight Reel Assembly ═══"
STAGE3_START=$(date +%s)

bash "$SCRIPT_DIR/build_highlight_reel.sh" \
    "$INPUT_VIDEO" \
    "$OUTPUT_DIR" \
    "$REEL_DURATION" \
    "$CLIP_DURATION" \
    "$TRANSITION_DURATION"

STAGE3_END=$(date +%s)
STAGE3_TIME=$((STAGE3_END - STAGE3_START))
echo "  Stage 5 completed in ${STAGE3_TIME}s"
echo ""

PIPELINE_END=$(date +%s)
TOTAL_TIME=$((PIPELINE_END - PIPELINE_START))

# --- Generate results.json ---
echo "═══ Generating results.json ═══"

python3 - "$INPUT_VIDEO" "$OUTPUT_DIR" "$TOTAL_TIME" "$STAGE1_TIME" "$STAGE2_TIME" "$STAGE3_TIME" <<'PYEOF'
import sys
import json
import os
from datetime import datetime

input_video = sys.argv[1]
output_dir = sys.argv[2]
total_time = int(sys.argv[3])
stage1_time = int(sys.argv[4])
stage2_time = int(sys.argv[5])
stage3_time = int(sys.argv[6])

# Load all manifests
def load_json(filename):
    path = os.path.join(output_dir, filename)
    if os.path.isfile(path):
        with open(path) as f:
            return json.load(f)
    return None

scenes_data = load_json("scenes.json")
frames_data = load_json("frames.json")
best_frames_data = load_json("best_frames.json")
highlights_data = load_json("highlights.json")

# Build results summary
scenes = scenes_data.get("scenes", []) if scenes_data else []
best_frames = best_frames_data.get("frames", []) if best_frames_data else []

# Collect frame paths and scores
frame_paths = []
frame_scores = []
for f in best_frames:
    filename = f.get("output_filename", f"best_{f.get('rank',0):02d}.jpg")
    frame_paths.append(os.path.join("frames", filename))
    frame_scores.append({
        "rank": f.get("rank", 0),
        "timestamp_sec": f.get("timestamp_sec", 0),
        "timecode": f.get("timecode", ""),
        "composite_score": f.get("composite_score", 0),
        "scene_id": f.get("scene_id", 0),
        "face_count": f.get("scores", {}).get("face_count", 0),
        "sharpness": f.get("scores", {}).get("sharpness", 0),
        "filename": filename
    })

# Collect clip timestamps
clip_timestamps = []
if highlights_data:
    for clip in highlights_data.get("clips", []):
        clip_timestamps.append({
            "clip_index": clip.get("clip_index", 0),
            "start_sec": clip.get("clip_start_sec", 0),
            "end_sec": clip.get("clip_end_sec", 0),
            "timecode_start": clip.get("timecode_start", ""),
            "timecode_end": clip.get("timecode_end", ""),
            "scene_id": clip.get("scene_id", 0),
            "transition": clip.get("transition_to_next"),
            "score": clip.get("composite_score", 0)
        })

# Video metadata
video_meta = scenes_data.get("video_metadata", {}) if scenes_data else {}

results = {
    "version": 1,
    "pipeline": "video_highlight_pipeline",
    "created_at": datetime.utcnow().isoformat() + "Z",
    "input": {
        "video_path": os.path.abspath(input_video),
        "duration_sec": video_meta.get("duration_sec", 0),
        "fps": video_meta.get("fps", 0),
        "resolution": video_meta.get("resolution", "unknown")
    },
    "performance": {
        "total_time_sec": total_time,
        "stage_times": {
            "scene_detection_sec": stage1_time,
            "frame_extraction_and_selection_sec": stage2_time,
            "highlight_reel_sec": stage3_time
        }
    },
    "scenes": {
        "total_count": len(scenes),
        "original_count": scenes_data.get("original_scene_count", len(scenes)) if scenes_data else 0,
        "detection_params": scenes_data.get("detection_params", {}) if scenes_data else {}
    },
    "best_frames": {
        "count": len(best_frames),
        "frame_paths": frame_paths,
        "frame_scores": frame_scores
    },
    "highlight_reel": {
        "clip_count": highlights_data.get("clip_count", 0) if highlights_data else 0,
        "actual_duration_sec": highlights_data.get("actual_duration_sec", 0) if highlights_data else 0,
        "clip_timestamps": clip_timestamps,
        "output_path": "highlight_reel.mp4",
        "reel_params": highlights_data.get("reel_params", {}) if highlights_data else {}
    },
    "output_files": {
        "scenes_json": "scenes.json",
        "frames_json": "frames.json",
        "best_frames_json": "best_frames.json",
        "highlights_json": "highlights.json",
        "stills_directory": "frames/",
        "highlight_reel": "highlight_reel.mp4",
        "reel_thumbnail": "reel_thumbnail.jpg"
    }
}

results_path = os.path.join(output_dir, "results.json")
with open(results_path, "w") as f:
    json.dump(results, f, indent=2)

print(f"  Results written to {results_path}")

# Print summary
print(f"\n{'='*40}")
print(f" PIPELINE COMPLETE")
print(f"{'='*40}")
print(f"  Scenes detected:    {len(scenes)}")
print(f"  Best frames:        {len(best_frames)}")
print(f"  Highlight clips:    {highlights_data.get('clip_count', '?') if highlights_data else '?'}")
print(f"  Reel duration:      {highlights_data.get('actual_duration_sec', '?') if highlights_data else '?'}s")
print(f"  Total time:         {total_time}s ({total_time//60}m {total_time%60}s)")
print(f"  Output directory:   {os.path.abspath(output_dir)}")
print(f"{'='*40}")
PYEOF

echo ""
echo "All outputs are in: $OUTPUT_DIR/"
echo "  - results.json (full summary)"
echo "  - frames/ (${NUM_BEST} best stills)"
echo "  - highlight_reel.mp4 (${REEL_DURATION}s reel)"

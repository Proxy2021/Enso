#!/usr/bin/env bash
# detect_scenes.sh — Stage 1: Detect scene changes using PySceneDetect
# Usage: ./detect_scenes.sh <input_video> [output_dir] [threshold] [min_scene_len_sec] [max_scene_duration_sec]
#
# Outputs: <output_dir>/scenes.json

set -euo pipefail

# --- Arguments ---
INPUT_VIDEO="${1:?Usage: detect_scenes.sh <input_video> [output_dir] [threshold] [min_scene_len] [max_scene_dur]}"
OUTPUT_DIR="${2:-./output}"
THRESHOLD="${3:-3.0}"
MIN_SCENE_LEN="${4:-3}"
MAX_SCENE_DURATION="${5:-120}"

# --- Validate ---
if [ ! -f "$INPUT_VIDEO" ]; then
    echo "ERROR: Input video not found: $INPUT_VIDEO" >&2
    exit 1
fi

command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 is required" >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe is required" >&2; exit 1; }

# Check PySceneDetect is installed
python3 -c "import scenedetect" 2>/dev/null || {
    echo "ERROR: PySceneDetect not installed. Run: pip install scenedetect[opencv]" >&2
    exit 1
}

mkdir -p "$OUTPUT_DIR"

# --- Probe video metadata ---
echo "Probing video metadata..."
VIDEO_INFO=$(ffprobe -v quiet -print_format json -show_format -show_streams "$INPUT_VIDEO")
DURATION=$(echo "$VIDEO_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['format'].get('duration','0'))")
FPS=$(echo "$VIDEO_INFO" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('streams', []):
    if s.get('codec_type') == 'video':
        r = s.get('r_frame_rate', '30/1')
        parts = r.split('/')
        print(round(int(parts[0]) / int(parts[1]), 2) if len(parts) == 2 else r)
        break
else:
    print('30')
")
RESOLUTION=$(echo "$VIDEO_INFO" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('streams', []):
    if s.get('codec_type') == 'video':
        print(f\"{s.get('width','?')}x{s.get('height','?')}\")
        break
else:
    print('unknown')
")

echo "  Duration: ${DURATION}s | FPS: $FPS | Resolution: $RESOLUTION"

# --- Run scene detection via Python ---
echo "Running scene detection (threshold=$THRESHOLD, min_scene_len=${MIN_SCENE_LEN}s)..."

python3 - "$INPUT_VIDEO" "$OUTPUT_DIR" "$THRESHOLD" "$MIN_SCENE_LEN" "$MAX_SCENE_DURATION" "$DURATION" "$FPS" "$RESOLUTION" <<'PYEOF'
import sys
import json
import os
from datetime import datetime

video_path = sys.argv[1]
output_dir = sys.argv[2]
threshold = float(sys.argv[3])
min_scene_len_sec = float(sys.argv[4])
max_scene_duration = float(sys.argv[5])
total_duration = float(sys.argv[6])
fps = float(sys.argv[7])
resolution = sys.argv[8]

try:
    from scenedetect import open_video, SceneManager
    from scenedetect.detectors import AdaptiveDetector
except ImportError:
    print("ERROR: scenedetect not available", file=sys.stderr)
    sys.exit(1)

# Open video and detect scenes
video = open_video(video_path)
sm = SceneManager()
sm.add_detector(AdaptiveDetector(
    adaptive_threshold=threshold,
    min_scene_len=int(min_scene_len_sec * fps)
))

print(f"  Analyzing video ({total_duration:.0f}s)... this may take a while.")
sm.detect_scenes(video, show_progress=True)
scene_list = sm.get_scene_list()

# Build scene records
scenes = []
for i, (start, end) in enumerate(scene_list):
    scenes.append({
        "id": i,
        "start_time": start.get_seconds(),
        "end_time": end.get_seconds(),
        "start_timecode": str(start),
        "end_timecode": str(end),
        "duration": end.get_seconds() - start.get_seconds(),
        "start_frame": start.get_frames(),
        "end_frame": end.get_frames(),
        "is_subdivision": False
    })

# Handle case where no scenes detected (single continuous shot)
if not scenes:
    scenes.append({
        "id": 0,
        "start_time": 0.0,
        "end_time": total_duration,
        "start_timecode": "00:00:00.000",
        "end_timecode": f"{int(total_duration//3600):02d}:{int((total_duration%3600)//60):02d}:{total_duration%60:06.3f}",
        "duration": total_duration,
        "start_frame": 0,
        "end_frame": int(total_duration * fps),
        "is_subdivision": False
    })

original_count = len(scenes)

# Subdivide long scenes
subdivided = []
next_id = 0
for scene in scenes:
    dur = scene["duration"]
    if dur > max_scene_duration:
        n_chunks = max(2, int(dur / 60))
        chunk_dur = dur / n_chunks
        for c in range(n_chunks):
            chunk_start = scene["start_time"] + c * chunk_dur
            chunk_end = scene["start_time"] + (c + 1) * chunk_dur
            subdivided.append({
                "id": next_id,
                "start_time": round(chunk_start, 3),
                "end_time": round(chunk_end, 3),
                "start_timecode": f"{int(chunk_start//3600):02d}:{int((chunk_start%3600)//60):02d}:{chunk_start%60:06.3f}",
                "end_timecode": f"{int(chunk_end//3600):02d}:{int((chunk_end%3600)//60):02d}:{chunk_end%60:06.3f}",
                "duration": round(chunk_dur, 3),
                "start_frame": int(chunk_start * fps),
                "end_frame": int(chunk_end * fps),
                "is_subdivision": True,
                "parent_scene_id": scene["id"]
            })
            next_id += 1
    else:
        scene["id"] = next_id
        subdivided.append(scene)
        next_id += 1

scenes = subdivided

# Write output
output = {
    "version": 1,
    "video_path": os.path.abspath(video_path),
    "detection_params": {
        "method": "detect-adaptive",
        "threshold": threshold,
        "min_scene_len_sec": min_scene_len_sec,
        "max_scene_duration_sec": max_scene_duration
    },
    "video_metadata": {
        "duration_sec": total_duration,
        "fps": fps,
        "resolution": resolution
    },
    "original_scene_count": original_count,
    "total_scenes": len(scenes),
    "total_duration_sec": total_duration,
    "created_at": datetime.utcnow().isoformat() + "Z",
    "scenes": scenes
}

output_path = os.path.join(output_dir, "scenes.json")
with open(output_path, "w") as f:
    json.dump(output, f, indent=2)

print(f"\n  Detected {original_count} scenes ({len(scenes)} after subdivision)")
print(f"  Output: {output_path}")
PYEOF

echo "Scene detection complete."

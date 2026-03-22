#!/usr/bin/env python3
"""
detect_scenes.py - Stage 1: Detect scene changes in a video using PySceneDetect.

Uses AdaptiveDetector which handles gradual transitions (common in wedding
ceremonies) far better than threshold-based or FFmpeg scene filters.

Usage:
    python detect_scenes.py <input_video> [options]

Outputs:
    <output_dir>/scenes.json - Scene boundaries with timestamps and metadata.

Requirements:
    pip install scenedetect[opencv]
    ffprobe (part of FFmpeg)
"""

import argparse
import json
import math
import os
import subprocess
import sys
from datetime import datetime, timezone


def parse_args():
    p = argparse.ArgumentParser(
        description="Detect scene changes in a video using PySceneDetect AdaptiveDetector"
    )
    p.add_argument("input_video", help="Path to input video file")
    p.add_argument(
        "--output-dir", default="./output",
        help="Directory for output files (default: ./output)"
    )
    p.add_argument(
        "--threshold", type=float, default=3.0,
        help="AdaptiveDetector threshold — lower = more sensitive (default: 3.0)"
    )
    p.add_argument(
        "--min-scene-len", type=float, default=3.0,
        help="Minimum scene length in seconds (default: 3.0)"
    )
    p.add_argument(
        "--max-scene-duration", type=float, default=120.0,
        help="Subdivide scenes longer than this many seconds (default: 120)"
    )
    return p.parse_args()


def probe_video(video_path):
    """Extract video metadata using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: ffprobe failed: {result.stderr[:300]}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(result.stdout)
    duration = float(data["format"].get("duration", 0))
    fps = 30.0
    width, height = 0, 0

    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            r = stream.get("r_frame_rate", "30/1")
            parts = r.split("/")
            if len(parts) == 2 and int(parts[1]) != 0:
                fps = round(int(parts[0]) / int(parts[1]), 2)
            else:
                fps = float(parts[0])
            width = stream.get("width", 0)
            height = stream.get("height", 0)
            break

    return {
        "duration_sec": duration,
        "fps": fps,
        "resolution": f"{width}x{height}",
        "width": width,
        "height": height,
    }


def format_timecode(seconds):
    """Format seconds as HH:MM:SS.mmm timecode."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def detect_scenes_pyscenedetect(video_path, threshold, min_scene_len_sec, fps):
    """Run PySceneDetect AdaptiveDetector on the video."""
    try:
        from scenedetect import open_video, SceneManager
        from scenedetect.detectors import AdaptiveDetector
    except ImportError:
        print(
            "ERROR: PySceneDetect not installed.\n"
            "  Install with: pip install scenedetect[opencv]",
            file=sys.stderr,
        )
        sys.exit(1)

    video = open_video(video_path)
    manager = SceneManager()
    manager.add_detector(
        AdaptiveDetector(
            adaptive_threshold=threshold,
            min_scene_len=int(min_scene_len_sec * fps),
        )
    )

    print("  Analyzing video... this may take several minutes for long videos.")
    manager.detect_scenes(video, show_progress=True)
    return manager.get_scene_list()


def subdivide_long_scenes(scenes, max_duration, fps):
    """Split scenes exceeding max_duration into roughly equal chunks."""
    result = []
    next_id = 0

    for scene in scenes:
        dur = scene["duration"]
        if dur > max_duration:
            n_chunks = max(2, int(dur / 60))
            chunk_dur = dur / n_chunks
            for c in range(n_chunks):
                chunk_start = scene["start_time"] + c * chunk_dur
                chunk_end = scene["start_time"] + (c + 1) * chunk_dur
                result.append({
                    "id": next_id,
                    "start_time": round(chunk_start, 3),
                    "end_time": round(chunk_end, 3),
                    "start_timecode": format_timecode(chunk_start),
                    "end_timecode": format_timecode(chunk_end),
                    "duration": round(chunk_dur, 3),
                    "start_frame": int(chunk_start * fps),
                    "end_frame": int(chunk_end * fps),
                    "is_subdivision": True,
                    "parent_scene_id": scene["id"],
                })
                next_id += 1
        else:
            scene["id"] = next_id
            result.append(scene)
            next_id += 1

    return result


def main():
    args = parse_args()

    # Validate input
    if not os.path.isfile(args.input_video):
        print(f"ERROR: Input video not found: {args.input_video}", file=sys.stderr)
        sys.exit(1)

    import shutil
    for tool in ["ffprobe"]:
        if shutil.which(tool) is None:
            print(f"ERROR: {tool} is required but not found in PATH", file=sys.stderr)
            sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    # Probe video
    print("Probing video metadata...")
    meta = probe_video(args.input_video)
    print(
        f"  Duration: {meta['duration_sec']:.1f}s | "
        f"FPS: {meta['fps']} | Resolution: {meta['resolution']}"
    )

    # Detect scenes
    print(
        f"Running scene detection "
        f"(threshold={args.threshold}, min_scene_len={args.min_scene_len}s)..."
    )
    scene_list = detect_scenes_pyscenedetect(
        args.input_video, args.threshold, args.min_scene_len, meta["fps"]
    )

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
            "is_subdivision": False,
        })

    # Handle zero-scene case (continuous single shot)
    if not scenes:
        d = meta["duration_sec"]
        scenes.append({
            "id": 0,
            "start_time": 0.0,
            "end_time": d,
            "start_timecode": "00:00:00.000",
            "end_timecode": format_timecode(d),
            "duration": d,
            "start_frame": 0,
            "end_frame": int(d * meta["fps"]),
            "is_subdivision": False,
        })

    original_count = len(scenes)

    # Subdivide long scenes
    scenes = subdivide_long_scenes(scenes, args.max_scene_duration, meta["fps"])

    # Write output
    output = {
        "version": 1,
        "video_path": os.path.abspath(args.input_video),
        "detection_params": {
            "method": "pyscenedetect-adaptive",
            "threshold": args.threshold,
            "min_scene_len_sec": args.min_scene_len,
            "max_scene_duration_sec": args.max_scene_duration,
        },
        "video_metadata": meta,
        "original_scene_count": original_count,
        "total_scenes": len(scenes),
        "total_duration_sec": meta["duration_sec"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scenes": scenes,
    }

    output_path = os.path.join(args.output_dir, "scenes.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDetected {original_count} scenes ({len(scenes)} after subdivision)")
    print(f"Output: {output_path}")


if __name__ == "__main__":
    main()

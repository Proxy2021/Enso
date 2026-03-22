#!/usr/bin/env python3
"""
run_pipeline.py - Master orchestrator for the wedding video highlight pipeline.

Chains all stages:
  1. detect_scenes.py   -> scenes.json
  2. extract_frames.py  -> frames.json, best_frames.json, frames/*.png
  3. build_highlight_reel.py -> highlight_reel.mp4, highlights.json
  4. Produces results.json summary with timing data

Usage:
    python run_pipeline.py <input_video> [options]

    python run_pipeline.py wedding.mp4 --output-dir ./wedding-output
    python run_pipeline.py ceremony.mov --num-best 30 --target-duration 90
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser(
        description="Full wedding video highlight pipeline: scenes -> frames -> reel"
    )
    p.add_argument("input_video", help="Path to input video file")
    p.add_argument("--output-dir", default="./output", help="Output directory")
    p.add_argument("--num-best", type=int, default=20, help="Best frames to select")
    p.add_argument("--target-duration", type=float, default=60.0, help="Reel duration (sec)")

    # Scene detection params
    p.add_argument("--scene-threshold", type=float, default=3.0)
    p.add_argument("--min-scene-len", type=float, default=3.0)
    p.add_argument("--max-scene-duration", type=float, default=120.0)

    # Frame extraction params
    p.add_argument("--min-frame-spacing", type=float, default=30.0)
    p.add_argument("--sample-fps", type=int, default=1)
    p.add_argument("--analysis-width", type=int, default=1280)
    p.add_argument("--face-detection", default="on", choices=["on", "off"])

    # Highlight reel params
    p.add_argument("--clip-duration", type=float, default=4.5)
    p.add_argument("--transition-duration", type=float, default=0.5)

    return p.parse_args()


def run_stage(label, cmd):
    """Run a pipeline stage, printing output and checking for errors."""
    print(f"\n{'=' * 50}")
    print(f"  {label}")
    print(f"{'=' * 50}\n")

    start = time.time()
    result = subprocess.run(
        [sys.executable] + cmd,
        text=True,
    )
    elapsed = time.time() - start

    if result.returncode != 0:
        print(f"\nERROR: {label} failed (exit code {result.returncode})", file=sys.stderr)
        sys.exit(result.returncode)

    print(f"\n  [{label}] completed in {elapsed:.1f}s")
    return elapsed


def main():
    args = parse_args()

    if not os.path.isfile(args.input_video):
        print(f"ERROR: Input video not found: {args.input_video}", file=sys.stderr)
        sys.exit(1)

    # Resolve paths
    input_video = os.path.abspath(args.input_video)
    output_dir = os.path.abspath(args.output_dir)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(output_dir, exist_ok=True)

    print("=" * 50)
    print("  Video Highlight Pipeline")
    print("=" * 50)
    print(f"  Input:  {input_video}")
    print(f"  Output: {output_dir}")
    print(f"  Best:   {args.num_best} frames")
    print(f"  Reel:   {args.target_duration}s target")
    print("=" * 50)

    pipeline_start = time.time()

    # ── Stage 1: Scene Detection ──
    t1 = run_stage("Stage 1/3: Scene Detection", [
        os.path.join(script_dir, "detect_scenes.py"),
        input_video,
        "--output-dir", output_dir,
        "--threshold", str(args.scene_threshold),
        "--min-scene-len", str(args.min_scene_len),
        "--max-scene-duration", str(args.max_scene_duration),
    ])

    # ── Stage 2-4: Frame Extraction & Selection ──
    t2 = run_stage("Stage 2/3: Frame Extraction & Selection", [
        os.path.join(script_dir, "extract_frames.py"),
        input_video,
        "--output-dir", output_dir,
        "--num-best", str(args.num_best),
        "--min-spacing", str(args.min_frame_spacing),
        "--sample-fps", str(args.sample_fps),
        "--analysis-width", str(args.analysis_width),
        "--face-detection", args.face_detection,
    ])

    # ── Stage 3: Highlight Reel ──
    t3 = run_stage("Stage 3/3: Highlight Reel Assembly", [
        os.path.join(script_dir, "build_highlight_reel.py"),
        input_video,
        "--output-dir", output_dir,
        "--target-duration", str(args.target_duration),
        "--clip-duration", str(args.clip_duration),
        "--transition-duration", str(args.transition_duration),
    ])

    total_time = time.time() - pipeline_start

    # ── Generate results.json ──
    def load_json(filename):
        path = os.path.join(output_dir, filename)
        if os.path.isfile(path):
            with open(path) as f:
                return json.load(f)
        return None

    scenes_data = load_json("scenes.json")
    best_frames_data = load_json("best_frames.json")
    highlights_data = load_json("highlights.json")

    scenes = scenes_data.get("scenes", []) if scenes_data else []
    best_frames = best_frames_data.get("frames", []) if best_frames_data else []
    video_meta = scenes_data.get("video_metadata", {}) if scenes_data else {}

    frame_scores = []
    frame_paths = []
    for f in best_frames:
        filename = f.get("output_filename", f"best_{f.get('rank', 0):02d}.png")
        frame_paths.append(os.path.join("frames", filename))
        frame_scores.append({
            "rank": f.get("rank", 0),
            "timestamp_sec": f.get("timestamp_sec", 0),
            "timecode": f.get("timecode", ""),
            "composite_score": f.get("composite_score", 0),
            "scene_id": f.get("scene_id", 0),
            "face_count": f.get("scores", {}).get("face_count", 0),
            "sharpness": f.get("scores", {}).get("sharpness", 0),
            "filename": filename,
        })

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
                "score": clip.get("composite_score", 0),
            })

    results = {
        "version": 1,
        "pipeline": "wedding_video_highlight",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input": {
            "video_path": input_video,
            "duration_sec": video_meta.get("duration_sec", 0),
            "fps": video_meta.get("fps", 0),
            "resolution": video_meta.get("resolution", "unknown"),
        },
        "performance": {
            "total_time_sec": round(total_time, 1),
            "stage_times": {
                "scene_detection_sec": round(t1, 1),
                "frame_extraction_and_selection_sec": round(t2, 1),
                "highlight_reel_sec": round(t3, 1),
            },
        },
        "scenes": {
            "total_count": len(scenes),
            "original_count": scenes_data.get("original_scene_count", len(scenes)) if scenes_data else 0,
            "detection_params": scenes_data.get("detection_params", {}) if scenes_data else {},
        },
        "best_frames": {
            "count": len(best_frames),
            "frame_paths": frame_paths,
            "frame_scores": frame_scores,
        },
        "highlight_reel": {
            "clip_count": highlights_data.get("clip_count", 0) if highlights_data else 0,
            "actual_duration_sec": highlights_data.get("actual_duration_sec", 0) if highlights_data else 0,
            "clip_timestamps": clip_timestamps,
            "output_path": "highlight_reel.mp4",
            "reel_params": highlights_data.get("reel_params", {}) if highlights_data else {},
        },
        "output_files": {
            "scenes_json": "scenes.json",
            "frames_json": "frames.json",
            "best_frames_json": "best_frames.json",
            "highlights_json": "highlights.json",
            "stills_directory": "frames/",
            "highlight_reel": "highlight_reel.mp4",
            "reel_thumbnail": "reel_thumbnail.jpg",
        },
    }

    results_path = os.path.join(output_dir, "results.json")
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)

    minutes = int(total_time // 60)
    seconds = int(total_time % 60)

    print(f"\n{'=' * 50}")
    print(f"  PIPELINE COMPLETE")
    print(f"{'=' * 50}")
    print(f"  Scenes detected:  {len(scenes)}")
    print(f"  Best frames:      {len(best_frames)}")
    print(f"  Highlight clips:  {highlights_data.get('clip_count', '?') if highlights_data else '?'}")
    print(f"  Reel duration:    {highlights_data.get('actual_duration_sec', '?') if highlights_data else '?'}s")
    print(f"  Total time:       {minutes}m {seconds}s")
    print(f"  Output:           {output_dir}")
    print(f"{'=' * 50}")
    print(f"\nAll outputs in: {output_dir}/")
    print(f"  - results.json        (full summary)")
    print(f"  - frames/             ({args.num_best} best PNG stills)")
    print(f"  - highlight_reel.mp4  ({args.target_duration}s reel)")


if __name__ == "__main__":
    main()

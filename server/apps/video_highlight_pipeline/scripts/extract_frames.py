#!/usr/bin/env python3
"""
extract_frames.py — Stages 2-4: Extract candidates, score, select best, export stills.

Usage:
    python3 extract_frames.py <input_video> [options]

Options:
    --output-dir DIR          Output directory (default: ./output)
    --scenes-json PATH        Path to scenes.json (default: <output_dir>/scenes.json)
    --num-best N              Number of best frames to select (default: 20)
    --min-spacing SEC         Minimum spacing between selected frames (default: 30)
    --sample-fps N            Candidate frame extraction rate (default: 1)
    --analysis-width PX       Width for scoring analysis (default: 1280)
    --skip-candidates         Skip candidate extraction if already done
    --skip-scoring            Skip scoring if frames.json already exists
    --face-detection on|off   Enable/disable face detection (default: on)
"""

import argparse
import json
import os
import subprocess
import sys
import math
from datetime import datetime
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Extract and score video frames")
    parser.add_argument("input_video", help="Path to input video file")
    parser.add_argument("--output-dir", default="./output", help="Output directory")
    parser.add_argument("--scenes-json", default=None, help="Path to scenes.json")
    parser.add_argument("--num-best", type=int, default=20, help="Number of best frames")
    parser.add_argument("--min-spacing", type=float, default=30, help="Min seconds between selections")
    parser.add_argument("--sample-fps", type=int, default=1, help="Candidate extraction FPS")
    parser.add_argument("--analysis-width", type=int, default=1280, help="Analysis frame width")
    parser.add_argument("--skip-candidates", action="store_true", help="Skip candidate extraction")
    parser.add_argument("--skip-scoring", action="store_true", help="Skip scoring stage")
    parser.add_argument("--face-detection", default="on", choices=["on", "off"],
                        help="Enable face detection")
    return parser.parse_args()


def format_timecode(seconds):
    """Format seconds as HH:MM:SS timecode."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def find_scene_for_timestamp(scenes, timestamp):
    """Find which scene a timestamp belongs to."""
    for scene in scenes:
        if scene["start_time"] <= timestamp < scene["end_time"]:
            return scene["id"]
    # If past all scenes, assign to last scene
    if scenes:
        return scenes[-1]["id"]
    return 0


# ─── Stage 2a: Extract candidate frames ───────────────────────────────────────

def extract_candidates(input_video, output_dir, sample_fps, analysis_width):
    """Extract candidate frames at given FPS using FFmpeg."""
    candidates_dir = os.path.join(output_dir, "candidates")
    os.makedirs(candidates_dir, exist_ok=True)

    print(f"  Extracting candidates at {sample_fps} fps (width={analysis_width}px)...")

    cmd = [
        "ffmpeg", "-y",
        "-i", input_video,
        "-vf", f"fps={sample_fps},scale={analysis_width}:-1",
        "-q:v", "3",
        os.path.join(candidates_dir, "frame_%05d.jpg")
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: FFmpeg candidate extraction failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    # Count extracted frames
    frames = sorted(Path(candidates_dir).glob("frame_*.jpg"))
    print(f"  Extracted {len(frames)} candidate frames")
    return candidates_dir, len(frames)


# ─── Stage 2b: Score candidate frames ─────────────────────────────────────────

def score_all_frames(candidates_dir, scenes, total_candidates, sample_fps, use_faces):
    """Score every candidate frame and return scored frame list."""
    import cv2
    import numpy as np

    face_detector = None
    if use_faces:
        try:
            import mediapipe as mp
            mp_face = mp.solutions.face_detection
            face_detector = mp_face.FaceDetection(
                model_selection=1,
                min_detection_confidence=0.5
            )
        except ImportError:
            print("  WARNING: mediapipe not installed, disabling face detection")
            use_faces = False

    print(f"  Scoring {total_candidates} candidate frames (faces={'on' if use_faces else 'off'})...")

    scored_frames = []
    for idx in range(1, total_candidates + 1):
        frame_path = os.path.join(candidates_dir, f"frame_{idx:05d}.jpg")
        if not os.path.exists(frame_path):
            continue

        frame_bgr = cv2.imread(frame_path)
        if frame_bgr is None:
            continue

        timestamp_sec = (idx - 1) / sample_fps  # frame_00001.jpg = time 0s
        scene_id = find_scene_for_timestamp(scenes, timestamp_sec)

        # Score the frame
        score, details = score_frame(frame_bgr, face_detector, use_faces)

        scored_frames.append({
            "index": idx,
            "timestamp_sec": round(timestamp_sec, 3),
            "timecode": format_timecode(timestamp_sec),
            "scene_id": scene_id,
            "candidate_path": f"candidates/frame_{idx:05d}.jpg",
            "composite_score": score,
            "scores": details
        })

        # Progress indicator
        if idx % 100 == 0 or idx == total_candidates:
            print(f"    Scored {idx}/{total_candidates} ({idx*100//total_candidates}%)")

    if face_detector:
        face_detector.close()

    return scored_frames


def score_frame(frame_bgr, face_detector, use_faces):
    """
    Score a single frame. Returns (composite_score, detail_dict).
    Composite score is 0.0-1.0.
    """
    import cv2
    import numpy as np

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

    # 1. Sharpness (Laplacian variance)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness = min(laplacian_var / 500.0, 1.0)

    # 2. Brightness (penalize extremes — peak at 128)
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    mean_brightness = float(hsv[:, :, 2].mean())
    brightness = 1.0 - abs(mean_brightness - 128.0) / 128.0

    # 3. Face detection
    face_count = 0
    face_center_score = 0.0
    face_size_score = 0.0

    if use_faces and face_detector:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = face_detector.process(rgb)
        if results.detections:
            face_count = len(results.detections)
            for det in results.detections:
                bb = det.location_data.relative_bounding_box
                cx = bb.xmin + bb.width / 2
                cy = bb.ymin + bb.height / 2
                dist = ((cx - 0.5) ** 2 + (cy - 0.5) ** 2) ** 0.5
                center = 1.0 - min(dist / 0.7, 1.0)
                face_center_score = max(face_center_score, center)
                area = bb.width * bb.height
                face_size_score = max(face_size_score, min(area / 0.05, 1.0))

    faces_norm = min(face_count / 3.0, 1.0)

    # 4. Contrast (histogram entropy)
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    hist = hist / hist.sum()
    hist = hist[hist > 0]
    entropy = float(-np.sum(hist * np.log2(hist)))
    contrast = min(entropy / 8.0, 1.0)

    # 5. Color saturation
    mean_sat = float(hsv[:, :, 1].mean())
    saturation = min(mean_sat / 128.0, 1.0)

    # Weighted composite (tuned for people-centric video)
    composite = (
        0.20 * sharpness +
        0.08 * brightness +
        0.28 * faces_norm +
        0.18 * face_center_score +
        0.06 * face_size_score +
        0.12 * contrast +
        0.08 * saturation
    )

    details = {
        "sharpness": round(sharpness, 4),
        "brightness": round(brightness, 4),
        "face_count": face_count,
        "face_center": round(face_center_score, 4),
        "face_size": round(face_size_score, 4),
        "contrast": round(contrast, 4),
        "saturation": round(saturation, 4),
        "laplacian_raw": round(float(laplacian_var), 2),
        "entropy_raw": round(entropy, 4)
    }

    return round(composite, 6), details


# ─── Stage 3: Select best N frames ────────────────────────────────────────────

def select_best_frames(frames, scenes, n=20, min_spacing_sec=30):
    """
    Select top N frames with diversity constraints:
    - Minimum temporal spacing
    - Per-scene budget cap
    - Chronological output ordering
    """
    total_scenes = len(scenes) if scenes else 1
    max_per_scene = max(2, math.ceil(n / total_scenes) * 2)

    # Sort by composite score descending
    ranked = sorted(frames, key=lambda f: f["composite_score"], reverse=True)

    selected = []
    used_times = []
    scene_counts = {}

    for frame in ranked:
        t = frame["timestamp_sec"]
        sid = frame["scene_id"]

        # Check minimum spacing
        if any(abs(t - ut) < min_spacing_sec for ut in used_times):
            continue

        # Check scene budget
        if scene_counts.get(sid, 0) >= max_per_scene:
            continue

        selected.append(frame.copy())
        used_times.append(t)
        scene_counts[sid] = scene_counts.get(sid, 0) + 1

        if len(selected) >= n:
            break

    # Sort chronologically and assign rank
    selected.sort(key=lambda f: f["timestamp_sec"])
    for i, frame in enumerate(selected):
        frame["rank"] = i + 1

    return selected


# ─── Stage 4: Export high-resolution stills ────────────────────────────────────

def export_stills(video_path, best_frames, output_dir):
    """Extract selected frames at full source resolution."""
    frames_dir = os.path.join(output_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    print(f"  Exporting {len(best_frames)} high-resolution stills...")

    for frame in best_frames:
        t = frame["timestamp_sec"]
        mins = int(t // 60)
        secs = int(t % 60)
        filename = f"best_{frame['rank']:02d}_{mins:02d}m{secs:02d}s.jpg"
        output_path = os.path.join(frames_dir, filename)

        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{t:.3f}",
            "-i", video_path,
            "-frames:v", "1",
            "-q:v", "1",
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"    WARNING: Failed to export frame at {t:.1f}s: {result.stderr[:200]}")
            continue

        frame["output_filename"] = filename
        print(f"    Exported: {filename} (score={frame['composite_score']:.4f})")

    return frames_dir


# ─── Main pipeline ────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    if not os.path.isfile(args.input_video):
        print(f"ERROR: Input video not found: {args.input_video}", file=sys.stderr)
        sys.exit(1)

    output_dir = args.output_dir
    os.makedirs(output_dir, exist_ok=True)

    scenes_path = args.scenes_json or os.path.join(output_dir, "scenes.json")
    use_faces = args.face_detection == "on"

    # Load scenes
    if not os.path.isfile(scenes_path):
        print(f"ERROR: scenes.json not found at {scenes_path}", file=sys.stderr)
        print("  Run detect_scenes.sh first.", file=sys.stderr)
        sys.exit(1)

    with open(scenes_path) as f:
        scenes_data = json.load(f)
    scenes = scenes_data["scenes"]
    print(f"Loaded {len(scenes)} scenes from {scenes_path}")

    # ── Stage 2a: Extract candidates ──
    candidates_dir = os.path.join(output_dir, "candidates")
    if args.skip_candidates and os.path.isdir(candidates_dir):
        total_candidates = len(list(Path(candidates_dir).glob("frame_*.jpg")))
        print(f"Skipping candidate extraction ({total_candidates} existing frames)")
    else:
        candidates_dir, total_candidates = extract_candidates(
            args.input_video, output_dir, args.sample_fps, args.analysis_width
        )

    if total_candidates == 0:
        print("ERROR: No candidate frames extracted", file=sys.stderr)
        sys.exit(1)

    # ── Stage 2b: Score candidates ──
    frames_json_path = os.path.join(output_dir, "frames.json")
    if args.skip_scoring and os.path.isfile(frames_json_path):
        print(f"Skipping scoring (loading existing {frames_json_path})")
        with open(frames_json_path) as f:
            frames_data = json.load(f)
        scored_frames = frames_data["frames"]
    else:
        scored_frames = score_all_frames(
            candidates_dir, scenes, total_candidates, args.sample_fps, use_faces
        )

        # Write frames.json
        frames_output = {
            "version": 1,
            "total_candidates": total_candidates,
            "scoring_params": {
                "sample_fps": args.sample_fps,
                "analysis_width": args.analysis_width,
                "face_detection": use_faces,
                "weights": {
                    "sharpness": 0.20,
                    "brightness": 0.08,
                    "faces": 0.28,
                    "face_center": 0.18,
                    "face_size": 0.06,
                    "contrast": 0.12,
                    "saturation": 0.08
                }
            },
            "created_at": datetime.utcnow().isoformat() + "Z",
            "frames": scored_frames
        }
        with open(frames_json_path, "w") as f:
            json.dump(frames_output, f, indent=2)
        print(f"  Wrote {frames_json_path} ({len(scored_frames)} frames)")

    # ── Stage 3: Select best N ──
    print(f"\nSelecting top {args.num_best} frames (min spacing={args.min_spacing}s)...")
    best_frames = select_best_frames(scored_frames, scenes, args.num_best, args.min_spacing)
    print(f"  Selected {len(best_frames)} frames across {len(set(f['scene_id'] for f in best_frames))} scenes")

    # ── Stage 4: Export stills ──
    print("\nExporting high-resolution stills...")
    export_stills(args.input_video, best_frames, output_dir)

    # Write best_frames.json
    best_frames_output = {
        "version": 1,
        "selection_params": {
            "target_count": args.num_best,
            "min_spacing_sec": args.min_spacing,
        },
        "selected_count": len(best_frames),
        "scene_coverage": len(set(f["scene_id"] for f in best_frames)),
        "total_scenes": len(scenes),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "frames": best_frames
    }
    best_frames_path = os.path.join(output_dir, "best_frames.json")
    with open(best_frames_path, "w") as f:
        json.dump(best_frames_output, f, indent=2)

    print(f"\nDone. Wrote {best_frames_path}")
    print(f"Stills in: {os.path.join(output_dir, 'frames')}/")

    # Print summary
    scores = [f["composite_score"] for f in best_frames]
    if scores:
        print(f"\nScore summary: min={min(scores):.4f} max={max(scores):.4f} avg={sum(scores)/len(scores):.4f}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
build_highlight_reel.py - Stage 5: Assemble a highlight reel from scored frames.

Selects clips around the best-scored frame timestamps, extracts and normalizes
each clip to a consistent format, then chains them together using FFmpeg xfade
transitions (dissolve, fadewhite, smoothleft) into a single MP4.

Usage:
    python build_highlight_reel.py <input_video> [options]

Requires:
    - best_frames.json and scenes.json in <output_dir> (from prior stages)
    - ffmpeg and ffprobe in PATH

Outputs:
    - <output_dir>/highlight_reel.mp4
    - <output_dir>/reel_thumbnail.jpg
    - <output_dir>/highlights.json
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone


def parse_args():
    p = argparse.ArgumentParser(
        description="Build a highlight reel from scored video frames with xfade transitions"
    )
    p.add_argument("input_video", help="Path to source video file")
    p.add_argument(
        "--output-dir", default="./output",
        help="Directory containing best_frames.json and scenes.json (default: ./output)"
    )
    p.add_argument(
        "--target-duration", type=float, default=60.0,
        help="Target reel duration in seconds (default: 60)"
    )
    p.add_argument(
        "--clip-duration", type=float, default=4.5,
        help="Duration of each highlight clip in seconds (default: 4.5)"
    )
    p.add_argument(
        "--transition-duration", type=float, default=0.5,
        help="Duration of each xfade transition in seconds (default: 0.5)"
    )
    p.add_argument(
        "--output-width", type=int, default=1920,
        help="Output video width (default: 1920)"
    )
    p.add_argument(
        "--output-height", type=int, default=1080,
        help="Output video height (default: 1080)"
    )
    p.add_argument(
        "--output-fps", type=int, default=30,
        help="Output video FPS (default: 30)"
    )
    return p.parse_args()


def format_timecode(seconds):
    """Format seconds as HH:MM:SS.mmm timecode."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def check_audio_stream(filepath):
    """Return True if the file contains an audio stream."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams", filepath,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False
    data = json.loads(result.stdout)
    return any(s.get("codec_type") == "audio" for s in data.get("streams", []))


def get_duration(filepath):
    """Get file duration in seconds via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", filepath,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return 0.0
    data = json.loads(result.stdout)
    return float(data.get("format", {}).get("duration", 0))


def main():
    args = parse_args()

    if not os.path.isfile(args.input_video):
        print(f"ERROR: Input video not found: {args.input_video}", file=sys.stderr)
        sys.exit(1)

    best_frames_path = os.path.join(args.output_dir, "best_frames.json")
    scenes_path = os.path.join(args.output_dir, "scenes.json")

    if not os.path.isfile(best_frames_path):
        print(f"ERROR: best_frames.json not found in {args.output_dir}", file=sys.stderr)
        print("  Run extract_frames.py first.", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(scenes_path):
        print(f"ERROR: scenes.json not found in {args.output_dir}", file=sys.stderr)
        sys.exit(1)

    # Load data
    with open(best_frames_path) as f:
        best_data = json.load(f)
    best_frames = best_data["frames"]

    with open(scenes_path) as f:
        scenes_data = json.load(f)
    scenes = scenes_data["scenes"]
    video_duration = scenes_data.get(
        "total_duration_sec",
        scenes[-1]["end_time"] if scenes else 0,
    )

    clips_dir = os.path.join(args.output_dir, "clips")
    os.makedirs(clips_dir, exist_ok=True)

    # ── Stage 5a: Select clips ──

    # Calculate optimal clip count
    n_clips = int(round(
        (args.target_duration + args.transition_duration) / args.clip_duration
    ))
    n_clips = max(8, min(n_clips, 18))
    n_clips = min(n_clips, len(best_frames))

    # Subsample for even temporal distribution
    if len(best_frames) > n_clips:
        step = len(best_frames) / n_clips
        clip_frames = [best_frames[int(i * step)] for i in range(n_clips)]
    else:
        clip_frames = best_frames[:n_clips]

    clip_frames.sort(key=lambda f: f["timestamp_sec"])

    # Wedding-elegant transition rotation
    TRANSITIONS = ["dissolve", "fadewhite", "dissolve", "smoothleft", "dissolve", "fade"]

    highlights = []
    for i, frame in enumerate(clip_frames):
        t = frame["timestamp_sec"]
        half = args.clip_duration / 2
        clip_start = max(0, t - half)

        # Clamp to scene boundaries
        scene = next(
            (s for s in scenes if s["start_time"] <= t < s["end_time"]),
            None,
        )
        if scene:
            clip_start = max(clip_start, scene["start_time"])
            clip_end = clip_start + args.clip_duration
            if clip_end > scene["end_time"]:
                clip_start = max(scene["start_time"], scene["end_time"] - args.clip_duration)
            if clip_start + args.clip_duration > video_duration:
                clip_start = max(0, video_duration - args.clip_duration)

        transition = TRANSITIONS[i % len(TRANSITIONS)] if i < len(clip_frames) - 1 else None

        highlights.append({
            "clip_index": i,
            "source_frame_rank": frame.get("rank", i + 1),
            "clip_start_sec": round(clip_start, 3),
            "clip_end_sec": round(clip_start + args.clip_duration, 3),
            "clip_duration": args.clip_duration,
            "scene_id": frame.get("scene_id", 0),
            "composite_score": frame.get("composite_score", 0),
            "timecode_start": format_timecode(clip_start),
            "timecode_end": format_timecode(clip_start + args.clip_duration),
            "transition_to_next": transition,
            "normalized_filename": f"clip_{i + 1:02d}.mp4",
        })

    print(f"Selected {len(highlights)} clips for highlight reel")

    # ── Stage 5b: Extract and normalize clips ──

    print("Extracting and normalizing clips...")
    w, h = args.output_width, args.output_height
    fps = args.output_fps

    for clip in highlights:
        clip_num = clip["clip_index"] + 1
        raw_path = os.path.join(clips_dir, f"raw_clip_{clip_num:02d}.mp4")
        norm_path = os.path.join(clips_dir, clip["normalized_filename"])

        # Fast extract via stream copy
        cmd_extract = [
            "ffmpeg", "-y",
            "-ss", str(clip["clip_start_sec"]),
            "-i", args.input_video,
            "-t", str(clip["clip_duration"]),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            raw_path,
        ]
        result = subprocess.run(cmd_extract, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  WARNING: Failed to extract clip {clip_num}: {result.stderr[:200]}")
            continue

        # Re-encode to consistent format for xfade compatibility
        vf = (
            f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,"
            f"fps={fps},format=yuv420p"
        )
        cmd_norm = [
            "ffmpeg", "-y",
            "-i", raw_path,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            norm_path,
        ]
        result = subprocess.run(cmd_norm, capture_output=True, text=True)
        if result.returncode != 0:
            # Retry without audio (source may lack audio track)
            cmd_norm_silent = [
                "ffmpeg", "-y",
                "-i", raw_path,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-an",
                norm_path,
            ]
            result2 = subprocess.run(cmd_norm_silent, capture_output=True, text=True)
            if result2.returncode != 0:
                print(f"  WARNING: Failed to normalize clip {clip_num}: {result2.stderr[:200]}")
                continue

        # Clean up raw clip
        try:
            os.remove(raw_path)
        except OSError:
            pass

        print(
            f"  Clip {clip_num:02d}: {clip['timecode_start']} -> {clip['timecode_end']} "
            f"(score={clip['composite_score']:.4f})"
        )

    # ── Stage 5c: Build xfade filter chain ──

    print("Building xfade filter chain...")

    # Verify all clips exist
    valid_clips = []
    for clip in highlights:
        clip_path = os.path.join(clips_dir, clip["normalized_filename"])
        if os.path.isfile(clip_path):
            valid_clips.append(clip)
        else:
            print(f"  WARNING: Missing normalized clip: {clip['normalized_filename']}")

    if len(valid_clips) < 2:
        print("ERROR: Need at least 2 clips for highlight reel", file=sys.stderr)
        sys.exit(1)

    n = len(valid_clips)

    # Check if first clip has audio
    has_audio = check_audio_stream(
        os.path.join(clips_dir, valid_clips[0]["normalized_filename"])
    )

    # Build FFmpeg input args
    inputs = []
    for clip in valid_clips:
        inputs.extend(["-i", os.path.join(clips_dir, clip["normalized_filename"])])

    # Build video xfade filter chain
    filters = []
    prev_label = "[0:v]"

    for i in range(1, n):
        offset = i * (args.clip_duration - args.transition_duration)
        transition = valid_clips[i - 1].get("transition_to_next", "dissolve") or "dissolve"

        in_label = f"[{i}:v]"
        out_label = "[vout]" if i == n - 1 else f"[v{i:02d}]"

        filters.append(
            f"{prev_label}{in_label}xfade=transition={transition}"
            f":duration={args.transition_duration}:offset={offset:.3f}{out_label}"
        )

        if i < n - 1:
            prev_label = f"[v{i:02d}]"

    # Build audio crossfade chain (if audio exists)
    if has_audio:
        prev_audio = "[0:a]"
        for i in range(1, n):
            in_label = f"[{i}:a]"
            out_label = "[aout]" if i == n - 1 else f"[a{i:02d}]"
            filters.append(
                f"{prev_audio}{in_label}acrossfade=d={args.transition_duration}"
                f":c1=tri:c2=tri{out_label}"
            )
            if i < n - 1:
                prev_audio = f"[a{i:02d}]"

    filter_complex = ";\n".join(filters)
    reel_path = os.path.join(args.output_dir, "highlight_reel.mp4")

    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex]
    if has_audio:
        cmd += ["-map", "[vout]", "-map", "[aout]"]
    else:
        cmd += ["-map", "[vout]"]
    cmd += [
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        reel_path,
    ]

    print(f"  Rendering reel with {n} clips and {n - 1} transitions...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"  xfade render failed: {result.stderr[:400]}")
        if has_audio:
            print("  Retrying without audio crossfade...")
            video_filters = [f for f in filters if "xfade" in f]
            filter_complex_v = ";\n".join(video_filters)
            cmd_fallback = (
                ["ffmpeg", "-y"] + inputs
                + ["-filter_complex", filter_complex_v,
                   "-map", "[vout]", "-an",
                   "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                   "-movflags", "+faststart",
                   reel_path]
            )
            result2 = subprocess.run(cmd_fallback, capture_output=True, text=True)
            if result2.returncode != 0:
                print(f"ERROR: Video-only render also failed:\n{result2.stderr[:400]}", file=sys.stderr)
                sys.exit(1)
            print("  Rendered reel (video only, no audio)")
        else:
            sys.exit(1)

    # Generate thumbnail
    thumbnail_path = os.path.join(args.output_dir, "reel_thumbnail.jpg")
    subprocess.run(
        ["ffmpeg", "-y", "-ss", "2", "-i", reel_path,
         "-frames:v", "1", "-q:v", "2", thumbnail_path],
        capture_output=True,
    )

    # Measure actual reel duration
    actual_duration = get_duration(reel_path) or args.target_duration

    # Write highlights.json manifest
    highlights_output = {
        "version": 1,
        "reel_params": {
            "target_duration_sec": args.target_duration,
            "clip_duration_sec": args.clip_duration,
            "transition_duration_sec": args.transition_duration,
            "transition_style": "wedding_elegant",
            "output_resolution": f"{args.output_width}x{args.output_height}",
            "output_fps": args.output_fps,
            "codec": "libx264",
            "crf": 18,
        },
        "actual_duration_sec": round(actual_duration, 2),
        "clip_count": len(valid_clips),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "clips": valid_clips,
        "reel_path": "highlight_reel.mp4",
        "reel_thumbnail": "reel_thumbnail.jpg",
    }

    highlights_path = os.path.join(args.output_dir, "highlights.json")
    with open(highlights_path, "w") as f:
        json.dump(highlights_output, f, indent=2)

    print(f"\nHighlight reel: {reel_path}")
    print(f"Duration: {actual_duration:.1f}s ({len(valid_clips)} clips)")
    print(f"Manifest: {highlights_path}")


if __name__ == "__main__":
    main()

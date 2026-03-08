#!/usr/bin/env python3
"""
Enso Photo Processor — Multi-style batch image processing CLI.
Supports JPEG/PNG/TIFF and RAW files (.3FR, .ARW, .CR2, .NEF, .DNG, .RAF, .ORF, .RW2).
Outputs NDJSON progress lines for integration with Enso's media tools.
"""

import os
import sys
import json
import argparse
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

# Supported file extensions
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp"}
RAW_EXTS = {".3fr", ".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw"}

QUALITY = 95


# ═══════════════════════════════════════════════════════════════════
# Shared utilities
# ═══════════════════════════════════════════════════════════════════

def apply_curve(channel, shadows_shift=0, midtone_shift=0, highlight_shift=0):
    """Apply a 3-point tone curve to a single channel (0-255 numpy array)."""
    lut = np.zeros(256, dtype=np.float64)
    p0 = max(0, min(255, 0 + shadows_shift))
    p1 = max(0, min(255, 128 + midtone_shift))
    p2 = max(0, min(255, 255 + highlight_shift))
    for i in range(256):
        if i <= 128:
            t = i / 128.0
            lut[i] = p0 * (1 - t) + p1 * t
        else:
            t = (i - 128) / 127.0
            lut[i] = p1 * (1 - t) + p2 * t
    lut = np.clip(lut, 0, 255).astype(np.uint8)
    return lut[channel]


def add_vignette(img_array, strength=0.3):
    """Apply vignette darkening from edges."""
    h, w = img_array.shape[:2]
    Y, X = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    dist = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    max_dist = np.sqrt(cx ** 2 + cy ** 2)
    dist_norm = dist / max_dist
    vignette = 1.0 - strength * (dist_norm ** 1.8)
    vignette = np.clip(vignette, 0, 1)
    out = img_array.astype(np.float64)
    for c in range(3):
        out[:, :, c] *= vignette
    return np.clip(out, 0, 255).astype(np.uint8)


def adjust_saturation(img_array, factor):
    """Adjust saturation. factor=0 is grayscale, 1 is unchanged, >1 is more saturated."""
    img = img_array.astype(np.float64)
    gray = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    for c in range(3):
        img[:, :, c] = gray + factor * (img[:, :, c] - gray)
    return np.clip(img, 0, 255).astype(np.uint8)


def s_curve_contrast(img_array, strength=0.15):
    """Apply S-curve contrast on luminance."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    lum_norm = lum / 255.0
    lum_curved = lum_norm + strength * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    scale = np.where(lum > 0, (lum_curved * 255) / np.maximum(lum, 1), 1.0)
    for c in range(3):
        img[:, :, c] = np.clip(img[:, :, c] * scale, 0, 255)
    return np.clip(img, 0, 255).astype(np.uint8)


def lift_blacks(img_array, amount=15):
    """Lift shadow values."""
    return np.clip(img_array.astype(np.float64) + amount, 0, 255).astype(np.uint8)


def fade_highlights(img_array, amount=8):
    """Pull white point down for film look."""
    return np.clip(img_array.astype(np.float64), 0, 255 - amount).astype(np.uint8)


# ═══════════════════════════════════════════════════════════════════
# Style implementations
# ═══════════════════════════════════════════════════════════════════

def style_norwegian_blue(img_array):
    """Deep moody Nordic blue tones — dramatic and atmospheric."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Lift blacks with blue push in shadows
    r = r + 18
    g = g + 18
    b = b + 26

    # Cool color shift
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=-10, midtone_shift=-8, highlight_shift=-2)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=-4, midtone_shift=-3, highlight_shift=-2)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=14, midtone_shift=10, highlight_shift=2)

    img_out = np.stack([r, g, b], axis=2).astype(np.float64)

    # Strong S-curve contrast
    img_out = s_curve_contrast(img_out.astype(np.uint8), strength=0.22).astype(np.float64)

    # Heavy desaturation (30% toward gray)
    gray = 0.299 * img_out[:, :, 0] + 0.587 * img_out[:, :, 1] + 0.114 * img_out[:, :, 2]
    for c in range(3):
        img_out[:, :, c] = img_out[:, :, c] * 0.70 + gray * 0.30

    # Pull greens toward teal
    green_dominant = (img_out[:, :, 1] > img_out[:, :, 0] + 10) & (img_out[:, :, 1] > img_out[:, :, 2])
    img_out[:, :, 2] = np.where(green_dominant, np.clip(img_out[:, :, 2] + img_out[:, :, 1] * 0.15, 0, 255), img_out[:, :, 2])
    img_out[:, :, 1] = np.where(green_dominant, np.clip(img_out[:, :, 1] * 0.92, 0, 255), img_out[:, :, 1])

    # Boost blues and teals
    blue_dominant = (img_out[:, :, 2] > img_out[:, :, 0] + 12) & (img_out[:, :, 2] > img_out[:, :, 1])
    teal_area = blue_dominant | ((img_out[:, :, 1] > img_out[:, :, 0]) & (img_out[:, :, 2] > img_out[:, :, 0] + 8))
    for c in [1, 2]:
        img_out[:, :, c] = np.where(teal_area, np.clip(img_out[:, :, c] * 1.18, 0, 255), img_out[:, :, c])

    # Fade highlights + cool wash
    img_out = np.clip(img_out, 0, 247)
    img_out[:, :, 2] = np.clip(img_out[:, :, 2] + 3, 0, 255)
    img_out[:, :, 0] = np.clip(img_out[:, :, 0] - 2, 0, 255)

    return np.clip(img_out, 0, 255).astype(np.uint8)


def style_golden_hour(img_array):
    """Warm golden tones — soft, luminous, and inviting."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Warm push: boost reds and yellows, reduce blues
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=8, midtone_shift=12, highlight_shift=5)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=3, midtone_shift=6, highlight_shift=2)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=-8, midtone_shift=-12, highlight_shift=-5)

    img_out = np.stack([r, g, b], axis=2)

    # Soft contrast
    img_out = s_curve_contrast(img_out, strength=0.12)

    # Slight saturation boost for warm tones
    img_f = img_out.astype(np.float64)
    warm_mask = (img_f[:, :, 0] > img_f[:, :, 2] + 20)
    gray = 0.299 * img_f[:, :, 0] + 0.587 * img_f[:, :, 1] + 0.114 * img_f[:, :, 2]
    boost = 1.15
    for c in range(3):
        img_f[:, :, c] = np.where(warm_mask,
                                    np.clip(gray + boost * (img_f[:, :, c] - gray), 0, 255),
                                    img_f[:, :, c])

    # Lift blacks slightly
    img_out = lift_blacks(np.clip(img_f, 0, 255).astype(np.uint8), amount=10)

    # Fade highlights
    img_out = fade_highlights(img_out, amount=6)

    # Light vignette
    img_out = add_vignette(img_out, strength=0.2)

    return img_out


def style_film_noir(img_array):
    """High contrast B&W with warm-tinted shadows and strong vignette."""
    img = img_array.astype(np.float64)

    # Convert to luminance
    gray = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]

    # Strong S-curve for high contrast
    lum_norm = gray / 255.0
    strength = 0.30
    lum_curved = lum_norm + strength * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved * 255, 0, 255)

    # Slight warm tint in shadows
    r = lum_curved.copy()
    g = lum_curved.copy()
    b = lum_curved.copy()

    shadow_mask = lum_curved < 100
    r = np.where(shadow_mask, np.clip(r + 6, 0, 255), r)
    g = np.where(shadow_mask, np.clip(g + 2, 0, 255), g)
    b = np.where(shadow_mask, np.clip(b - 4, 0, 255), b)

    img_out = np.stack([r, g, b], axis=2).astype(np.uint8)

    # Lift blacks slightly
    img_out = lift_blacks(img_out, amount=8)

    # Strong vignette
    img_out = add_vignette(img_out, strength=0.45)

    return img_out


def style_vintage_film(img_array):
    """Cross-processed look: cyan shadows, yellow highlights, faded colors."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Cross-process: cyan shadows, yellow highlights
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=-12, midtone_shift=0, highlight_shift=10)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=5, midtone_shift=3, highlight_shift=6)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=15, midtone_shift=0, highlight_shift=-12)

    img_out = np.stack([r, g, b], axis=2)

    # Desaturate somewhat
    img_out = adjust_saturation(img_out, 0.65)

    # Lift blacks heavily
    img_out = lift_blacks(img_out, amount=22)

    # Fade highlights
    img_out = fade_highlights(img_out, amount=12)

    # Soft contrast
    img_out = s_curve_contrast(img_out, strength=0.10)

    # Add grain via noise
    noise = np.random.normal(0, 8, img_out.shape).astype(np.float64)
    img_out = np.clip(img_out.astype(np.float64) + noise, 0, 255).astype(np.uint8)

    # Light vignette
    img_out = add_vignette(img_out, strength=0.25)

    return img_out


def style_teal_orange(img_array):
    """Hollywood cinematic split-tone: teal shadows / warm highlights."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Shadow regions get teal push
    shadow_mask = lum < 120
    highlight_mask = lum >= 120

    # Shadows: reduce red, boost green+blue (teal)
    r = np.where(shadow_mask, np.clip(r - 15, 0, 255), r)
    g = np.where(shadow_mask, np.clip(g + 5, 0, 255), g)
    b = np.where(shadow_mask, np.clip(b + 18, 0, 255), b)

    # Highlights: boost red+green (warm/orange), reduce blue
    r = np.where(highlight_mask, np.clip(r + 12, 0, 255), r)
    g = np.where(highlight_mask, np.clip(g + 4, 0, 255), g)
    b = np.where(highlight_mask, np.clip(b - 14, 0, 255), b)

    img_out = np.stack([r, g, b], axis=2).astype(np.uint8)

    # Medium contrast
    img_out = s_curve_contrast(img_out, strength=0.18)

    # Slight desaturation
    img_out = adjust_saturation(img_out, 0.85)

    # Lift blacks
    img_out = lift_blacks(img_out, amount=12)

    # Medium vignette
    img_out = add_vignette(img_out, strength=0.28)

    return img_out


def style_moody_desaturated(img_array):
    """Heavy desaturation, cool cast, lifted blacks, soft contrast."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Cool color shift
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=-6, midtone_shift=-4, highlight_shift=-2)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=-2, midtone_shift=0, highlight_shift=0)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=8, midtone_shift=5, highlight_shift=2)

    img_out = np.stack([r, g, b], axis=2)

    # Heavy desaturation
    img_out = adjust_saturation(img_out, 0.35)

    # Soft contrast
    img_out = s_curve_contrast(img_out, strength=0.10)

    # Lift blacks
    img_out = lift_blacks(img_out, amount=20)

    # Fade highlights
    img_out = fade_highlights(img_out, amount=10)

    # Vignette
    img_out = add_vignette(img_out, strength=0.30)

    return img_out


def style_high_contrast_bw(img_array):
    """Classic high-contrast B&W with film-style tone curve."""
    img = img_array.astype(np.float64)

    # Weighted luminance (favor red channel for skin tones, like a red filter)
    gray = 0.35 * img[:, :, 0] + 0.50 * img[:, :, 1] + 0.15 * img[:, :, 2]

    # Strong S-curve
    lum_norm = gray / 255.0
    strength = 0.35
    lum_curved = lum_norm + strength * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved * 255, 0, 255)

    img_out = np.stack([lum_curved, lum_curved, lum_curved], axis=2).astype(np.uint8)

    # Slight black lift
    img_out = lift_blacks(img_out, amount=5)

    # Mild vignette
    img_out = add_vignette(img_out, strength=0.20)

    return img_out


def style_warm_fade(img_array):
    """Warm pastel tones, heavily lifted blacks, reduced contrast, soft."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Warm push
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=10, midtone_shift=8, highlight_shift=3)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=4, midtone_shift=3, highlight_shift=0)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=-4, midtone_shift=-6, highlight_shift=-3)

    img_out = np.stack([r, g, b], axis=2)

    # Desaturate moderately
    img_out = adjust_saturation(img_out, 0.55)

    # Heavy black lift
    img_out = lift_blacks(img_out, amount=28)

    # Fade highlights
    img_out = fade_highlights(img_out, amount=15)

    # Very soft negative contrast (flatten the S-curve slightly)
    img_f = img_out.astype(np.float64)
    mid = 128.0
    flatten = 0.08
    img_f = mid + (img_f - mid) * (1 - flatten)
    img_out = np.clip(img_f, 0, 255).astype(np.uint8)

    # Soft vignette
    img_out = add_vignette(img_out, strength=0.18)

    return img_out


# ═══════════════════════════════════════════════════════════════════
# Style registry
# ═══════════════════════════════════════════════════════════════════

STYLES = {
    "norwegian_blue": style_norwegian_blue,
    "golden_hour": style_golden_hour,
    "film_noir": style_film_noir,
    "vintage_film": style_vintage_film,
    "teal_orange": style_teal_orange,
    "moody_desaturated": style_moody_desaturated,
    "high_contrast_bw": style_high_contrast_bw,
    "warm_fade": style_warm_fade,
}


# ═══════════════════════════════════════════════════════════════════
# File loading
# ═══════════════════════════════════════════════════════════════════

def load_image(path):
    """Load an image file as a numpy uint8 RGB array."""
    ext = os.path.splitext(path)[1].lower()

    if ext in RAW_EXTS:
        try:
            import rawpy
        except ImportError:
            raise ImportError("rawpy is required for RAW file processing: pip install rawpy")
        with rawpy.imread(path) as raw:
            rgb = raw.postprocess(
                use_camera_wb=True,
                no_auto_bright=False,
                output_bps=8,
                half_size=False,
            )
        return rgb
    else:
        pil_img = Image.open(path).convert("RGB")
        return np.array(pil_img)


def get_image_files(directory):
    """List all supported image files in directory."""
    all_exts = IMAGE_EXTS | RAW_EXTS
    files = []
    for f in sorted(os.listdir(directory)):
        ext = os.path.splitext(f)[1].lower()
        if ext in all_exts:
            files.append(f)
    return files


# ═══════════════════════════════════════════════════════════════════
# Processing
# ═══════════════════════════════════════════════════════════════════

def process_single_file(args):
    """Process a single file. Used by multiprocessing pool."""
    idx, total, fname, src_path, dst_path, style_name = args

    if os.path.exists(dst_path):
        return json.dumps({
            "status": "skipped",
            "file": fname,
            "index": idx,
            "total": total,
            "reason": "already exists"
        })

    try:
        # Load
        rgb = load_image(src_path)

        # Apply style
        style_fn = STYLES[style_name]
        styled = style_fn(rgb)

        # Convert to PIL for final touches
        pil_img = Image.fromarray(styled)

        # Slight sharpening
        pil_img = pil_img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=40, threshold=2))

        # Slight brightness reduction for moodiness
        enhancer = ImageEnhance.Brightness(pil_img)
        pil_img = enhancer.enhance(0.97)

        # Save
        pil_img.save(dst_path, "JPEG", quality=QUALITY, subsampling=0)

        size_mb = os.path.getsize(dst_path) / (1024 * 1024)
        return json.dumps({
            "status": "processed",
            "file": fname,
            "index": idx,
            "total": total,
            "output": os.path.basename(dst_path),
            "size_mb": round(size_mb, 1)
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "file": fname,
            "index": idx,
            "total": total,
            "error": str(e)
        })


def main():
    parser = argparse.ArgumentParser(description="Enso Photo Processor")
    parser.add_argument("--input-dir", required=True, help="Source directory with photos")
    parser.add_argument("--output-dir", required=True, help="Output directory for processed photos")
    parser.add_argument("--style", required=True, choices=list(STYLES.keys()), help="Processing style")
    parser.add_argument("--quality", type=int, default=95, help="JPEG quality (1-100)")
    args = parser.parse_args()

    global QUALITY
    QUALITY = args.quality

    if not os.path.isdir(args.input_dir):
        print(json.dumps({"status": "error", "error": f"Input directory not found: {args.input_dir}"}), flush=True)
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    files = get_image_files(args.input_dir)
    total = len(files)

    if total == 0:
        print(json.dumps({"status": "complete", "processed": 0, "failed": 0, "skipped": 0, "output_dir": args.output_dir}), flush=True)
        sys.exit(0)

    # Build task list
    tasks = []
    for i, fname in enumerate(files, 1):
        src = os.path.join(args.input_dir, fname)
        base = os.path.splitext(fname)[0]
        dst = os.path.join(args.output_dir, f"{base}.jpg")
        tasks.append((i, total, fname, src, dst, args.style))

    # Process with multiprocessing
    num_workers = max(1, multiprocessing.cpu_count() - 1)
    processed = 0
    failed = 0
    skipped = 0

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(process_single_file, t): t for t in tasks}
        for future in as_completed(futures):
            result_line = future.result()
            print(result_line, flush=True)
            result = json.loads(result_line)
            if result["status"] == "processed":
                processed += 1
            elif result["status"] == "error":
                failed += 1
            elif result["status"] == "skipped":
                skipped += 1

    # Final summary
    print(json.dumps({
        "status": "complete",
        "processed": processed,
        "failed": failed,
        "skipped": skipped,
        "total": total,
        "output_dir": args.output_dir
    }), flush=True)


if __name__ == "__main__":
    main()

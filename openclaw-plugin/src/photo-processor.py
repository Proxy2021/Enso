#!/usr/bin/env python3
"""
Enso Photo Processor v3 — Professional-grade recipe-based photo style engine.

Uses photo_engine.py for spline curves, H&D film response, LAB color space,
feathered luminosity masks, blend modes, organic film grain, and layer compositing.

Reads style recipes from styles.json. Adding a new style = adding a JSON entry. Zero code changes.

Supports JPEG/PNG/TIFF and RAW files (.3FR, .ARW, .CR2, .NEF, .DNG, .RAF, .ORF, .RW2).
Outputs NDJSON progress lines for integration with Enso's media tools.

Usage:
  Batch:   python photo-processor.py --input-dir /photos --output-dir /out --style kodak_portra_400 --styles-file styles.json
  Single:  python photo-processor.py --input-file photo.jpg --output-file out.jpg --style kodak_portra_400 --styles-file styles.json
  Preview: python photo-processor.py --input-file photo.jpg --output-file preview.jpg --style kodak_portra_400 --styles-file styles.json --preview
  List:    python photo-processor.py --styles-file styles.json --list-styles
"""

import os
import sys
import json
import argparse
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

# Import professional processing engine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo_engine import (
    apply_curves, adjust_lab, apply_monochrome, apply_split_tone,
    apply_shadow_crush, apply_highlight_blow, apply_contrast,
    adjust_saturation, apply_warm_boost, apply_flatten_contrast,
    apply_desaturate_blend, apply_green_to_teal, apply_teal_boost,
    apply_green_boost, apply_sky_boost, apply_selective_boost,
    lift_blacks, fade_highlights, color_tint, apply_halation,
    apply_film_grain, add_vignette, apply_haze_highlights,
    apply_layer_stack, luminosity_mask, blend, compute_luminance
)

# Allow very large images (Hasselblad 100MP etc.)
Image.MAX_IMAGE_PIXELS = None

# Supported file extensions
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp"}
RAW_EXTS = {".3fr", ".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw"}

QUALITY = 95

# Global recipe registry — loaded from styles.json at startup
RECIPE_REGISTRY = {}


# ===================================================================
# Recipe Engine v3 — Professional pipeline
# ===================================================================

def apply_recipe(img_array, recipe):
    """Apply a style recipe to an image array.

    If recipe has "layers" key: uses layer compositor for full control.
    Otherwise: sequential pipeline with professional primitives.

    Pipeline order:
    1. Monochrome conversion
    2. Curves (spline/H&D via photo_engine)
    3. LAB adjustments
    4. Split tone (feathered luminosity masks)
    5. Shadow color / Shadow tint / Midtone tint (feathered)
    6. Color tint (global)
    7. Shadow crush / Highlight blow (feathered)
    8. Haze highlights
    9. Contrast (with optional blend mode)
    10. Flatten contrast
    11. Desaturate blend
    12. Saturation
    13. Warm boost / Green boost / Sky boost
    14. Green-to-teal / Teal boost
    15. Selective boost
    16. Black lift / Highlight fade
    17. Halation
    18. Grain (organic film grain)
    19. Vignette
    """
    # Layer-based processing (full control)
    if "layers" in recipe:
        return apply_layer_stack(img_array, recipe["layers"])

    img = img_array.copy()

    # 1. Monochrome conversion
    if "monochrome" in recipe:
        mono = recipe["monochrome"]
        weights = mono.get("weights", [0.299, 0.587, 0.114])
        img = apply_monochrome(img, weights)

    # 2. Curves (spline/H&D/legacy)
    if "curves" in recipe:
        img = apply_curves(img, recipe["curves"])

    # 3. LAB adjustments
    if "lab_adjust" in recipe:
        la = recipe["lab_adjust"]
        img = adjust_lab(img,
                         l_shift=la.get("l_shift", 0),
                         a_shift=la.get("a_shift", 0),
                         b_shift=la.get("b_shift", 0),
                         chroma_scale=la.get("chroma_scale", 1.0),
                         hue_rotate=la.get("hue_rotate", 0))

    # 4. Split tone (feathered)
    if "split_tone" in recipe:
        st = recipe["split_tone"]
        img = apply_split_tone(img,
                               shadow_zone=st.get("shadow_zone", "shadows"),
                               highlight_zone=st.get("highlight_zone", "highlights"),
                               feather=st.get("feather", 30),
                               shadows=st.get("shadows"),
                               highlights=st.get("highlights"),
                               blend_mode=st.get("blend_mode"),
                               opacity=st.get("opacity", 1.0))

    # 5a. Shadow color (feathered)
    if "shadow_color" in recipe:
        sc = recipe["shadow_color"]
        # Use feathered mask via tint with shadow zone
        shifts = {"r": sc.get("r", 0), "g": sc.get("g", 0), "b": sc.get("b", 0)}
        if any(v != 0 for v in shifts.values()):
            mask = luminosity_mask(img, zone="shadows",
                                   feather=sc.get("feather", 25),
                                   custom_range=(0, sc.get("threshold", 80)))
            tinted = img.astype(np.float64)
            for c_idx, c_key in enumerate(["r", "g", "b"]):
                if shifts[c_key] != 0:
                    tinted[:,:,c_idx] += shifts[c_key]
            tinted = np.clip(tinted, 0, 255)
            img_f = img.astype(np.float64)
            for c in range(3):
                img_f[:,:,c] = img_f[:,:,c] * (1 - mask) + tinted[:,:,c] * mask
            img = np.clip(img_f, 0, 255).astype(np.uint8)

    # 5b. Shadow tint (feathered)
    if "shadow_tint" in recipe:
        st = recipe["shadow_tint"]
        shifts = {"r": st.get("r", 0), "g": st.get("g", 0), "b": st.get("b", 0)}
        if any(v != 0 for v in shifts.values()):
            mask = luminosity_mask(img, zone="shadows", feather=st.get("feather", 25))
            tinted = img.astype(np.float64)
            for c_idx, c_key in enumerate(["r", "g", "b"]):
                if shifts[c_key] != 0:
                    tinted[:,:,c_idx] += shifts[c_key]
            tinted = np.clip(tinted, 0, 255)
            img_f = img.astype(np.float64)
            for c in range(3):
                img_f[:,:,c] = img_f[:,:,c] * (1 - mask) + tinted[:,:,c] * mask
            img = np.clip(img_f, 0, 255).astype(np.uint8)

    # 5c. Midtone tint (feathered)
    if "midtone_tint" in recipe:
        mt = recipe["midtone_tint"]
        shifts = {"r": mt.get("r", 0), "g": mt.get("g", 0), "b": mt.get("b", 0)}
        if any(v != 0 for v in shifts.values()):
            mask = luminosity_mask(img, zone="midtones", feather=mt.get("feather", 25))
            tinted = img.astype(np.float64)
            for c_idx, c_key in enumerate(["r", "g", "b"]):
                if shifts[c_key] != 0:
                    tinted[:,:,c_idx] += shifts[c_key]
            tinted = np.clip(tinted, 0, 255)
            img_f = img.astype(np.float64)
            for c in range(3):
                img_f[:,:,c] = img_f[:,:,c] * (1 - mask) + tinted[:,:,c] * mask
            img = np.clip(img_f, 0, 255).astype(np.uint8)

    # 6. Global color tint
    if "color_tint" in recipe:
        ct = recipe["color_tint"]
        img = color_tint(img, r_shift=ct.get("r", 0), g_shift=ct.get("g", 0), b_shift=ct.get("b", 0))

    # 7a. Shadow crush (feathered)
    if "shadow_crush" in recipe:
        sc = recipe["shadow_crush"]
        img = apply_shadow_crush(img,
                                 threshold=sc.get("threshold", 60),
                                 factor=sc.get("factor", 0.65),
                                 feather=sc.get("feather", 20))

    # 7b. Highlight blow (feathered)
    if "highlight_blow" in recipe:
        hb = recipe["highlight_blow"]
        img = apply_highlight_blow(img,
                                   threshold=hb.get("threshold", 200),
                                   factor=hb.get("factor", 1.15),
                                   feather=hb.get("feather", 20))

    # 8. Haze highlights (feathered)
    if "haze_highlights" in recipe:
        hh = recipe["haze_highlights"]
        img = apply_haze_highlights(img,
                                    threshold=hh.get("threshold", 180),
                                    factor=hh.get("factor", 0.92),
                                    add=hh.get("add", 20))

    # 9. Contrast (with optional blend mode)
    if "contrast" in recipe:
        ct = recipe["contrast"]
        img = apply_contrast(img,
                             strength=ct.get("strength", 0.15),
                             contrast_type=ct.get("type", "s_curve"),
                             blend_mode=ct.get("blend_mode"))

    # 10. Flatten contrast
    if "flatten_contrast" in recipe:
        fc = recipe["flatten_contrast"]
        img = apply_flatten_contrast(img,
                                     midpoint=fc.get("midpoint", 128),
                                     amount=fc.get("amount", 0.15))

    # 11. Desaturate blend
    if "desaturate_blend" in recipe:
        img = apply_desaturate_blend(img, blend_amount=recipe["desaturate_blend"])

    # 12. Saturation
    if "saturation" in recipe:
        img = adjust_saturation(img, recipe["saturation"])

    # 13a. Warm boost
    if "warm_boost" in recipe:
        wb = recipe["warm_boost"]
        img = apply_warm_boost(img,
                               threshold=wb.get("threshold", 15),
                               saturation_factor=wb.get("saturation_factor", 1.12))

    # 13b. Green boost
    if "green_boost" in recipe:
        gb = recipe["green_boost"]
        img = apply_green_boost(img, factor=gb.get("factor", 1.10), warm_shift=gb.get("warm_shift", 6))

    # 13c. Sky boost
    if "sky_boost" in recipe:
        sb = recipe["sky_boost"]
        img = apply_sky_boost(img, blue_factor=sb.get("blue_factor", 1.08), green_add=sb.get("green_add", 4))

    # 14a. Green to teal
    if "green_to_teal" in recipe:
        gt = recipe["green_to_teal"]
        img = apply_green_to_teal(img, blue_add_factor=gt.get("blue_add_factor", 0.15), green_reduce=gt.get("green_reduce", 0.92))

    # 14b. Teal boost
    if "teal_boost" in recipe:
        tb = recipe["teal_boost"]
        img = apply_teal_boost(img, factor=tb.get("factor", 1.18))

    # 15. Selective boost
    if "selective_boost" in recipe:
        sb = recipe["selective_boost"]
        img = apply_selective_boost(img,
                                    channel=sb.get("channel", "r"),
                                    threshold=sb.get("threshold", 10),
                                    factor=sb.get("factor", 1.2))

    # 16a. Black lift
    if "black_lift" in recipe:
        img = lift_blacks(img, amount=recipe["black_lift"])

    # 16b. Highlight fade
    if "highlight_fade" in recipe:
        img = fade_highlights(img, amount=recipe["highlight_fade"])

    # 17. Halation
    if "halation" in recipe:
        h = recipe["halation"]
        if isinstance(h, dict):
            img = apply_halation(img, strength=h.get("strength", 0.15), radius=h.get("radius"))
        else:
            img = apply_halation(img, strength=h)

    # 18. Grain (organic film grain)
    if "grain" in recipe:
        gr = recipe["grain"]
        if isinstance(gr, dict):
            img = apply_film_grain(img,
                                   amount=gr.get("amount", 12),
                                   size=gr.get("size", 1.5),
                                   roughness=gr.get("roughness", 0.5),
                                   color_grain=gr.get("color_grain", False),
                                   r_amount=gr.get("r_amount"),
                                   g_amount=gr.get("g_amount"),
                                   b_amount=gr.get("b_amount"),
                                   luminance_aware=gr.get("luminance_aware", True),
                                   iso_profile=gr.get("iso_profile"))
        else:
            img = apply_film_grain(img, amount=gr)

    # 19. Vignette
    if "vignette" in recipe:
        img = add_vignette(img, strength=recipe["vignette"])

    return img


# ===================================================================
# Style registry — loads from styles.json
# ===================================================================

def load_styles(styles_file):
    """Load styles from a JSON file. Returns dict of {style_id: recipe_dict}."""
    with open(styles_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    styles = {}
    for style_id, style_def in data.get("styles", {}).items():
        if "recipe" in style_def:
            styles[style_id] = style_def["recipe"]
    return styles


def list_styles_info(styles_file):
    """List all available styles with metadata."""
    with open(styles_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    categories = {c["id"]: c["name"] for c in data.get("categories", [])}
    result = []
    for style_id, style_def in data.get("styles", {}).items():
        result.append({
            "id": style_id,
            "name": style_def.get("name", style_id),
            "subtitle": style_def.get("subtitle", ""),
            "category": categories.get(style_def.get("category", ""), style_def.get("category", "")),
            "description": style_def.get("description", ""),
            "tags": style_def.get("tags", [])
        })
    return result


# ===================================================================
# File loading
# ===================================================================

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
        pil_img = Image.open(path)
        pil_img = ImageOps.exif_transpose(pil_img)  # Apply EXIF orientation
        pil_img = pil_img.convert("RGB")
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


# ===================================================================
# Processing — single file and batch
# ===================================================================

def process_single_file(args):
    """Process a single file (for multiprocessing pool).
    args: (idx, total, fname, src_path, dst_path, style_name, recipe, preview_size, quality)
    """
    idx, total, fname, src_path, dst_path, style_name, recipe, preview_size, quality = args

    if os.path.exists(dst_path):
        # Ensure thumbnail exists even for previously processed files
        thumb_dir = os.path.join(os.path.dirname(dst_path), "thumbs")
        thumb_path = os.path.join(thumb_dir, os.path.basename(dst_path))
        if not os.path.exists(thumb_path):
            try:
                os.makedirs(thumb_dir, exist_ok=True)
                thumb = Image.open(dst_path)
                thumb = ImageOps.exif_transpose(thumb)
                thumb.thumbnail((800, 800), Image.LANCZOS)
                thumb.save(thumb_path, "JPEG", quality=75)
            except Exception:
                pass
        return json.dumps({
            "status": "skipped",
            "file": fname,
            "index": idx,
            "total": total,
            "reason": "already exists"
        })

    try:
        rgb = load_image(src_path)

        # Preview mode: resize before processing (much faster)
        if preview_size and preview_size > 0:
            pil_preview = Image.fromarray(rgb)
            pil_preview.thumbnail((preview_size, preview_size), Image.LANCZOS)
            rgb = np.array(pil_preview)

        styled = apply_recipe(rgb, recipe)
        pil_img = Image.fromarray(styled)

        # Slight sharpening
        pil_img = pil_img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=40, threshold=2))
        # Slight brightness reduction for moodiness
        enhancer = ImageEnhance.Brightness(pil_img)
        pil_img = enhancer.enhance(0.97)

        pil_img.save(dst_path, "JPEG", quality=quality, subsampling=0)

        # Generate web-friendly thumbnail (skip for preview mode)
        if not preview_size:
            thumb_dir = os.path.join(os.path.dirname(dst_path), "thumbs")
            os.makedirs(thumb_dir, exist_ok=True)
            thumb_path = os.path.join(thumb_dir, os.path.basename(dst_path))
            thumb = pil_img.copy()
            thumb.thumbnail((800, 800), Image.LANCZOS)
            thumb.save(thumb_path, "JPEG", quality=75)

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


def process_single_photo(input_file, output_file, recipe, preview_size=0, quality=95):
    """Process a single photo file (non-batch mode). Returns result dict."""
    try:
        rgb = load_image(input_file)

        if preview_size and preview_size > 0:
            pil_preview = Image.fromarray(rgb)
            pil_preview.thumbnail((preview_size, preview_size), Image.LANCZOS)
            rgb = np.array(pil_preview)

        styled = apply_recipe(rgb, recipe)
        pil_img = Image.fromarray(styled)
        pil_img = pil_img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=40, threshold=2))
        enhancer = ImageEnhance.Brightness(pil_img)
        pil_img = enhancer.enhance(0.97)

        os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
        pil_img.save(output_file, "JPEG", quality=quality, subsampling=0)

        # Generate thumbnail alongside output
        if not preview_size:
            thumb_dir = os.path.join(os.path.dirname(output_file), "thumbs")
            os.makedirs(thumb_dir, exist_ok=True)
            thumb_path = os.path.join(thumb_dir, os.path.basename(output_file))
            thumb = pil_img.copy()
            thumb.thumbnail((800, 800), Image.LANCZOS)
            thumb.save(thumb_path, "JPEG", quality=75)

        size_mb = os.path.getsize(output_file) / (1024 * 1024)
        w, h = pil_img.size
        return {
            "status": "processed",
            "file": os.path.basename(input_file),
            "output": output_file,
            "size_mb": round(size_mb, 1),
            "width": w,
            "height": h
        }
    except Exception as e:
        return {
            "status": "error",
            "file": os.path.basename(input_file),
            "error": str(e)
        }


# ===================================================================
# CLI entry point
# ===================================================================

def main():
    parser = argparse.ArgumentParser(description="Enso Photo Processor v3 — Professional recipe-based engine")

    # Style selection
    parser.add_argument("--style", help="Style name from styles.json")
    parser.add_argument("--styles-file", help="Path to styles.json recipe file")

    # Batch mode
    parser.add_argument("--input-dir", help="Source directory with photos (batch mode)")
    parser.add_argument("--output-dir", help="Output directory for processed photos (batch mode)")

    # Single file mode
    parser.add_argument("--input-file", help="Single input photo path")
    parser.add_argument("--output-file", help="Single output photo path")

    # Options
    parser.add_argument("--quality", type=int, default=95, help="JPEG quality (1-100)")
    parser.add_argument("--preview", action="store_true", help="Preview mode: resize before processing")
    parser.add_argument("--preview-size", type=int, default=400, help="Preview resize target (default: 400px)")

    # Utility
    parser.add_argument("--list-styles", action="store_true", help="List all available styles and exit")

    args = parser.parse_args()

    global QUALITY
    QUALITY = args.quality

    # Resolve styles file path
    styles_file = args.styles_file
    if not styles_file:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        styles_file = os.path.join(script_dir, "styles.json")

    if not os.path.exists(styles_file):
        print(json.dumps({"status": "error", "error": f"Styles file not found: {styles_file}"}), flush=True)
        sys.exit(1)

    # Load recipe registry
    global RECIPE_REGISTRY
    RECIPE_REGISTRY = load_styles(styles_file)

    # --list-styles mode
    if args.list_styles:
        styles_info = list_styles_info(styles_file)
        print(json.dumps({"status": "styles_list", "styles": styles_info, "count": len(styles_info)}), flush=True)
        sys.exit(0)

    # Validate style
    if not args.style:
        print(json.dumps({"status": "error", "error": "No --style specified. Use --list-styles to see available styles."}), flush=True)
        sys.exit(1)

    if args.style not in RECIPE_REGISTRY:
        available = list(RECIPE_REGISTRY.keys())
        print(json.dumps({"status": "error", "error": f"Unknown style '{args.style}'. Available: {available}"}), flush=True)
        sys.exit(1)

    recipe = RECIPE_REGISTRY[args.style]
    preview_size = args.preview_size if args.preview else 0

    # Single file mode
    if args.input_file:
        if not args.output_file:
            base, ext = os.path.splitext(args.input_file)
            args.output_file = f"{base}_{args.style}.jpg"

        if not os.path.isfile(args.input_file):
            print(json.dumps({"status": "error", "error": f"Input file not found: {args.input_file}"}), flush=True)
            sys.exit(1)

        result = process_single_photo(args.input_file, args.output_file, recipe,
                                      preview_size=preview_size, quality=QUALITY)
        print(json.dumps(result), flush=True)
        sys.exit(0 if result["status"] == "processed" else 1)

    # Batch mode
    if not args.input_dir:
        print(json.dumps({"status": "error", "error": "Specify --input-dir (batch) or --input-file (single)."}), flush=True)
        sys.exit(1)

    if not args.output_dir:
        print(json.dumps({"status": "error", "error": "Batch mode requires --output-dir."}), flush=True)
        sys.exit(1)

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
        tasks.append((i, total, fname, src, dst, args.style, recipe, preview_size, QUALITY))

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

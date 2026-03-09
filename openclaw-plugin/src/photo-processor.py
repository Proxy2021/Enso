#!/usr/bin/env python3
"""
Enso Photo Processor v2 — Data-driven recipe-based photo style engine.
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
from PIL import Image, ImageFilter, ImageEnhance
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

# Allow very large images (Hasselblad 100MP etc.)
Image.MAX_IMAGE_PIXELS = None

# Supported file extensions
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp"}
RAW_EXTS = {".3fr", ".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw"}

QUALITY = 95

# Global recipe registry — loaded from styles.json at startup
RECIPE_REGISTRY = {}


# ===================================================================
# Core utilities — low-level image manipulation building blocks
# ===================================================================

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
    if strength <= 0:
        return img_array
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
    if factor == 1.0:
        return img_array
    img = img_array.astype(np.float64)
    gray = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    for c in range(3):
        img[:, :, c] = gray + factor * (img[:, :, c] - gray)
    return np.clip(img, 0, 255).astype(np.uint8)


def s_curve_contrast(img_array, strength=0.15):
    """Apply S-curve contrast on luminance."""
    if strength <= 0:
        return img_array
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    lum_norm = lum / 255.0
    lum_curved = lum_norm + strength * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    scale = np.where(lum > 0, (lum_curved * 255) / np.maximum(lum, 1), 1.0)
    for c in range(3):
        img[:, :, c] = np.clip(img[:, :, c] * scale, 0, 255)
    return np.clip(img, 0, 255).astype(np.uint8)


def double_s_curve_contrast(img_array, strength=0.38):
    """Apply a double S-curve for extreme contrast (Moriyama, Delta 3200)."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    lum_norm = lum / 255.0
    # First pass
    s1 = strength
    lum_curved = lum_norm + s1 * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    # Second pass (weaker)
    s2 = strength * 0.47
    lum_curved = lum_curved + s2 * np.sin(2 * np.pi * lum_curved) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    scale = np.where(lum > 0, (lum_curved * 255) / np.maximum(lum, 1), 1.0)
    for c in range(3):
        img[:, :, c] = np.clip(img[:, :, c] * scale, 0, 255)
    return np.clip(img, 0, 255).astype(np.uint8)


def lift_blacks(img_array, amount=15):
    """Lift shadow values."""
    if amount <= 0:
        return img_array
    return np.clip(img_array.astype(np.float64) + amount, 0, 255).astype(np.uint8)


def fade_highlights(img_array, amount=8):
    """Pull white point down for film look."""
    if amount <= 0:
        return img_array
    return np.clip(img_array.astype(np.float64), 0, 255 - amount).astype(np.uint8)


def add_grain(img_array, amount=12, luminance_aware=False):
    """Add film-like grain. luminance_aware: more grain in midtones, less in shadows/highlights."""
    if amount <= 0:
        return img_array
    noise = np.random.normal(0, amount, img_array.shape).astype(np.float64)
    if luminance_aware:
        lum = (0.299 * img_array[:, :, 0].astype(np.float64) +
               0.587 * img_array[:, :, 1].astype(np.float64) +
               0.114 * img_array[:, :, 2].astype(np.float64)) / 255.0
        # Bell curve: more grain in midtones, less at extremes
        grain_mask = np.exp(-4.0 * (lum - 0.5) ** 2)
        grain_mask = np.clip(grain_mask * 0.7 + 0.3, 0, 1)  # floor at 30%
        for c in range(3):
            noise[:, :, c] *= grain_mask
    return np.clip(img_array.astype(np.float64) + noise, 0, 255).astype(np.uint8)


def color_tint(img_array, r_shift=0, g_shift=0, b_shift=0):
    """Apply global RGB shifts."""
    if r_shift == 0 and g_shift == 0 and b_shift == 0:
        return img_array
    img = img_array.astype(np.float64)
    img[:, :, 0] = np.clip(img[:, :, 0] + r_shift, 0, 255)
    img[:, :, 1] = np.clip(img[:, :, 1] + g_shift, 0, 255)
    img[:, :, 2] = np.clip(img[:, :, 2] + b_shift, 0, 255)
    return img.astype(np.uint8)


def selective_color_boost(img_array, channel_idx, threshold=10, boost=1.2):
    """Boost saturation in areas where a specific channel dominates."""
    img = img_array.astype(np.float64)
    others = [i for i in range(3) if i != channel_idx]
    dominant = (img[:, :, channel_idx] > img[:, :, others[0]] + threshold) & \
               (img[:, :, channel_idx] > img[:, :, others[1]] + threshold)
    gray = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    for c in range(3):
        img[:, :, c] = np.where(dominant, np.clip(gray + boost * (img[:, :, c] - gray), 0, 255), img[:, :, c])
    return np.clip(img, 0, 255).astype(np.uint8)


# ===================================================================
# New recipe utilities — extended building blocks for JSON recipes
# ===================================================================

def apply_monochrome(img_array, weights):
    """Convert to B&W with custom channel weights, output as 3-channel grayscale."""
    img = img_array.astype(np.float64)
    w = weights
    gray = w[0] * img[:, :, 0] + w[1] * img[:, :, 1] + w[2] * img[:, :, 2]
    gray = np.clip(gray, 0, 255)
    return np.stack([gray, gray, gray], axis=2).astype(np.uint8)


def apply_shadow_crush(img_array, threshold=60, factor=0.65):
    """Crush shadow values below threshold."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    shadow_mask = lum < threshold
    for c in range(3):
        img[:, :, c] = np.where(shadow_mask, img[:, :, c] * factor, img[:, :, c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_highlight_blow(img_array, threshold=200, factor=1.15):
    """Blow out highlights above threshold for extreme B&W looks."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    bright_mask = lum > threshold
    for c in range(3):
        img[:, :, c] = np.where(bright_mask, np.clip(img[:, :, c] * factor, 0, 255), img[:, :, c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_shadow_color(img_array, threshold=80, r_shift=0, g_shift=0, b_shift=0):
    """Push color into shadows (below luminance threshold)."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    shadow_mask = lum < threshold
    if r_shift != 0:
        img[:, :, 0] = np.where(shadow_mask, np.clip(img[:, :, 0] + r_shift, 0, 255), img[:, :, 0])
    if g_shift != 0:
        img[:, :, 1] = np.where(shadow_mask, np.clip(img[:, :, 1] + g_shift, 0, 255), img[:, :, 1])
    if b_shift != 0:
        img[:, :, 2] = np.where(shadow_mask, np.clip(img[:, :, 2] + b_shift, 0, 255), img[:, :, 2])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_split_tone(img_array, shadow_threshold=110, shadows=None, highlights=None):
    """Split-tone: different color casts for shadows vs highlights."""
    shadows = shadows or {}
    highlights = highlights or {}
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    shadow_mask = lum < shadow_threshold
    highlight_mask = lum >= shadow_threshold

    for c_idx, c_key in enumerate(["r", "g", "b"]):
        s_val = shadows.get(c_key, 0)
        h_val = highlights.get(c_key, 0)
        if s_val != 0:
            img[:, :, c_idx] = np.where(shadow_mask, np.clip(img[:, :, c_idx] + s_val, 0, 255), img[:, :, c_idx])
        if h_val != 0:
            img[:, :, c_idx] = np.where(highlight_mask, np.clip(img[:, :, c_idx] + h_val, 0, 255), img[:, :, c_idx])

    return np.clip(img, 0, 255).astype(np.uint8)


def apply_midtone_tint(img_array, r_shift=0, g_shift=0, b_shift=0):
    """Apply color tint only in midtone range (60-200 luminance)."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    mid_mask = (lum > 60) & (lum < 200)
    if r_shift != 0:
        img[:, :, 0] = np.where(mid_mask, np.clip(img[:, :, 0] + r_shift, 0, 255), img[:, :, 0])
    if g_shift != 0:
        img[:, :, 1] = np.where(mid_mask, np.clip(img[:, :, 1] + g_shift, 0, 255), img[:, :, 1])
    if b_shift != 0:
        img[:, :, 2] = np.where(mid_mask, np.clip(img[:, :, 2] + b_shift, 0, 255), img[:, :, 2])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_shadow_tint(img_array, r_shift=0, g_shift=0, b_shift=0):
    """Apply color tint only in shadow range (< 60 luminance)."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    shadow_mask = lum < 60
    if r_shift != 0:
        img[:, :, 0] = np.where(shadow_mask, np.clip(img[:, :, 0] + r_shift, 0, 255), img[:, :, 0])
    if g_shift != 0:
        img[:, :, 1] = np.where(shadow_mask, np.clip(img[:, :, 1] + g_shift, 0, 255), img[:, :, 1])
    if b_shift != 0:
        img[:, :, 2] = np.where(shadow_mask, np.clip(img[:, :, 2] + b_shift, 0, 255), img[:, :, 2])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_warm_boost(img_array, threshold=15, saturation_factor=1.12):
    """Boost saturation specifically in warm-toned areas (skin tones, golden light)."""
    img = img_array.astype(np.float64)
    warm_mask = (img[:, :, 0] > img[:, :, 2] + threshold) & (img[:, :, 0] > 100)
    gray = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    for c in range(3):
        img[:, :, c] = np.where(warm_mask,
                                np.clip(gray + saturation_factor * (img[:, :, c] - gray), 0, 255),
                                img[:, :, c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_flatten_contrast(img_array, midpoint=135, amount=0.15):
    """Flatten contrast — compress dynamic range toward a midpoint."""
    if amount <= 0:
        return img_array
    img = img_array.astype(np.float64)
    img = midpoint + (img - midpoint) * (1 - amount)
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_desaturate_blend(img_array, blend=0.65):
    """Blend image with grayscale version (0 = full gray, 1 = original color).
    blend is the color retention amount."""
    img = img_array.astype(np.float64)
    gray = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    for c in range(3):
        img[:, :, c] = img[:, :, c] * blend + gray * (1 - blend)
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_green_to_teal(img_array, blue_add_factor=0.15, green_reduce=0.92):
    """Convert green-dominant areas toward teal (push blue, reduce green)."""
    img = img_array.astype(np.float64)
    green_dominant = (img[:, :, 1] > img[:, :, 0] + 10) & (img[:, :, 1] > img[:, :, 2])
    img[:, :, 2] = np.where(green_dominant,
                            np.clip(img[:, :, 2] + img[:, :, 1] * blue_add_factor, 0, 255),
                            img[:, :, 2])
    img[:, :, 1] = np.where(green_dominant,
                            np.clip(img[:, :, 1] * green_reduce, 0, 255),
                            img[:, :, 1])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_teal_boost(img_array, factor=1.18):
    """Boost teal/blue-dominant areas."""
    img = img_array.astype(np.float64)
    blue_dominant = (img[:, :, 2] > img[:, :, 0] + 12) & (img[:, :, 2] > img[:, :, 1])
    teal_area = blue_dominant | ((img[:, :, 1] > img[:, :, 0]) & (img[:, :, 2] > img[:, :, 0] + 8))
    for c in [1, 2]:
        img[:, :, c] = np.where(teal_area, np.clip(img[:, :, c] * factor, 0, 255), img[:, :, c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_green_boost(img_array, factor=1.10, warm_shift=6):
    """Boost green-dominant areas (Ghibli lush nature)."""
    img = img_array.astype(np.float64)
    green_dominant = (img[:, :, 1] > img[:, :, 0]) & (img[:, :, 1] > img[:, :, 2])
    img[:, :, 1] = np.where(green_dominant, np.clip(img[:, :, 1] * factor, 0, 255), img[:, :, 1])
    if warm_shift > 0:
        img[:, :, 0] = np.where(green_dominant, np.clip(img[:, :, 0] + warm_shift, 0, 255), img[:, :, 0])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_sky_boost(img_array, blue_factor=1.08, green_add=4):
    """Boost sky blue areas gently."""
    img = img_array.astype(np.float64)
    blue_sky = (img[:, :, 2] > img[:, :, 0] + 20) & (img[:, :, 2] > img[:, :, 1])
    img[:, :, 2] = np.where(blue_sky, np.clip(img[:, :, 2] * blue_factor, 0, 255), img[:, :, 2])
    if green_add > 0:
        img[:, :, 1] = np.where(blue_sky, np.clip(img[:, :, 1] + green_add, 0, 255), img[:, :, 1])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_haze_highlights(img_array, threshold=180, factor=0.92, add=20):
    """Compress and lift highlights for hazy/dreamy look (Malick golden hour)."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    bright = lum > threshold
    for c in range(3):
        img[:, :, c] = np.where(bright, np.clip(img[:, :, c] * factor + add, 0, 255), img[:, :, c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_halation(img_array, strength=0.15):
    """Simulate halation (red bloom around bright areas, like CineStill 800T).
    Blurs the red channel of bright areas and bleeds it outward."""
    if strength <= 0:
        return img_array
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]

    # Extract bright areas
    bright_mask = (lum > 180).astype(np.float64)

    # Create a red glow from bright areas
    red_glow = img[:, :, 0] * bright_mask

    # Blur the glow (simulate light scatter) — use PIL for Gaussian blur
    glow_img = Image.fromarray(np.clip(red_glow, 0, 255).astype(np.uint8))
    # Blur radius proportional to image size
    blur_radius = max(5, min(img_array.shape[0], img_array.shape[1]) // 80)
    glow_blurred = np.array(glow_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))).astype(np.float64)

    # Blend the halation glow back into red channel
    img[:, :, 0] = np.clip(img[:, :, 0] + glow_blurred * strength, 0, 255)
    # Slight warm bleed into green
    img[:, :, 1] = np.clip(img[:, :, 1] + glow_blurred * strength * 0.3, 0, 255)

    return np.clip(img, 0, 255).astype(np.uint8)


# ===================================================================
# Recipe engine — interprets JSON recipe from styles.json
# ===================================================================

def apply_recipe(img_array, recipe):
    """Apply a style recipe (dict from styles.json) to an image array.

    Processing order is carefully designed:
    1. Monochrome (fundamental change)
    2. Per-channel curves (base color grading)
    3. Split tone / shadow color / shadow tint / midtone tint
    4. Color tint (global)
    5. Shadow crush / highlight blow
    6. Haze highlights
    7. Contrast (S-curve)
    8. Flatten contrast
    9. Desaturate blend
    10. Saturation
    11. Warm boost / green boost / sky boost
    12. Green-to-teal / teal boost
    13. Selective boost
    14. Black lift / highlight fade
    15. Halation
    16. Grain
    17. Vignette
    """
    img = img_array.copy()

    # 1. Monochrome conversion
    if "monochrome" in recipe:
        mono = recipe["monochrome"]
        weights = mono.get("weights", [0.299, 0.587, 0.114])
        img = apply_monochrome(img, weights)

    # 2. Per-channel curves
    if "curves" in recipe:
        curves = recipe["curves"]
        r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
        if "r" in curves:
            rc = curves["r"]
            r = apply_curve(np.clip(r, 0, 255).astype(np.uint8),
                            rc.get("shadows", 0), rc.get("midtones", 0), rc.get("highlights", 0))
        if "g" in curves:
            gc = curves["g"]
            g = apply_curve(np.clip(g, 0, 255).astype(np.uint8),
                            gc.get("shadows", 0), gc.get("midtones", 0), gc.get("highlights", 0))
        if "b" in curves:
            bc = curves["b"]
            b = apply_curve(np.clip(b, 0, 255).astype(np.uint8),
                            bc.get("shadows", 0), bc.get("midtones", 0), bc.get("highlights", 0))
        img = np.stack([r, g, b], axis=2)

    # 3. Split tone
    if "split_tone" in recipe:
        st = recipe["split_tone"]
        img = apply_split_tone(img,
                               shadow_threshold=st.get("shadow_threshold", 110),
                               shadows=st.get("shadows"),
                               highlights=st.get("highlights"))

    # 4. Shadow color push
    if "shadow_color" in recipe:
        sc = recipe["shadow_color"]
        img = apply_shadow_color(img,
                                 threshold=sc.get("threshold", 80),
                                 r_shift=sc.get("r", 0),
                                 g_shift=sc.get("g", 0),
                                 b_shift=sc.get("b", 0))

    # 5. Shadow tint
    if "shadow_tint" in recipe:
        st = recipe["shadow_tint"]
        img = apply_shadow_tint(img,
                                r_shift=st.get("r", 0),
                                g_shift=st.get("g", 0),
                                b_shift=st.get("b", 0))

    # 6. Midtone tint
    if "midtone_tint" in recipe:
        mt = recipe["midtone_tint"]
        img = apply_midtone_tint(img,
                                 r_shift=mt.get("r", 0),
                                 g_shift=mt.get("g", 0),
                                 b_shift=mt.get("b", 0))

    # 7. Global color tint
    if "color_tint" in recipe:
        ct = recipe["color_tint"]
        img = color_tint(img,
                         r_shift=ct.get("r", 0),
                         g_shift=ct.get("g", 0),
                         b_shift=ct.get("b", 0))

    # 8. Shadow crush
    if "shadow_crush" in recipe:
        sc = recipe["shadow_crush"]
        img = apply_shadow_crush(img,
                                 threshold=sc.get("threshold", 60),
                                 factor=sc.get("factor", 0.65))

    # 9. Highlight blow
    if "highlight_blow" in recipe:
        hb = recipe["highlight_blow"]
        img = apply_highlight_blow(img,
                                   threshold=hb.get("threshold", 200),
                                   factor=hb.get("factor", 1.15))

    # 10. Haze highlights
    if "haze_highlights" in recipe:
        hh = recipe["haze_highlights"]
        img = apply_haze_highlights(img,
                                    threshold=hh.get("threshold", 180),
                                    factor=hh.get("factor", 0.92),
                                    add=hh.get("add", 20))

    # 11. Contrast
    if "contrast" in recipe:
        ct = recipe["contrast"]
        strength = ct.get("strength", 0.15)
        ctype = ct.get("type", "s_curve")
        if ctype == "double_s_curve":
            img = double_s_curve_contrast(img, strength=strength)
        else:
            img = s_curve_contrast(img, strength=strength)

    # 12. Flatten contrast
    if "flatten_contrast" in recipe:
        fc = recipe["flatten_contrast"]
        img = apply_flatten_contrast(img,
                                     midpoint=fc.get("midpoint", 128),
                                     amount=fc.get("amount", 0.15))

    # 13. Desaturate blend
    if "desaturate_blend" in recipe:
        img = apply_desaturate_blend(img, blend=recipe["desaturate_blend"])

    # 14. Saturation
    if "saturation" in recipe:
        img = adjust_saturation(img, recipe["saturation"])

    # 15. Warm boost
    if "warm_boost" in recipe:
        wb = recipe["warm_boost"]
        img = apply_warm_boost(img,
                               threshold=wb.get("threshold", 15),
                               saturation_factor=wb.get("saturation_factor", 1.12))

    # 16. Green boost
    if "green_boost" in recipe:
        gb = recipe["green_boost"]
        img = apply_green_boost(img,
                                factor=gb.get("factor", 1.10),
                                warm_shift=gb.get("warm_shift", 6))

    # 17. Sky boost
    if "sky_boost" in recipe:
        sb = recipe["sky_boost"]
        img = apply_sky_boost(img,
                              blue_factor=sb.get("blue_factor", 1.08),
                              green_add=sb.get("green_add", 4))

    # 18. Green to teal
    if "green_to_teal" in recipe:
        gt = recipe["green_to_teal"]
        img = apply_green_to_teal(img,
                                  blue_add_factor=gt.get("blue_add_factor", 0.15),
                                  green_reduce=gt.get("green_reduce", 0.92))

    # 19. Teal boost
    if "teal_boost" in recipe:
        tb = recipe["teal_boost"]
        img = apply_teal_boost(img, factor=tb.get("factor", 1.18))

    # 20. Selective color boost
    if "selective_boost" in recipe:
        sb = recipe["selective_boost"]
        ch_map = {"r": 0, "g": 1, "b": 2}
        ch_idx = ch_map.get(sb.get("channel", "r"), 0)
        img = selective_color_boost(img,
                                    channel_idx=ch_idx,
                                    threshold=sb.get("threshold", 10),
                                    boost=sb.get("factor", 1.2))

    # 21. Black lift
    if "black_lift" in recipe:
        img = lift_blacks(img, amount=recipe["black_lift"])

    # 22. Highlight fade
    if "highlight_fade" in recipe:
        img = fade_highlights(img, amount=recipe["highlight_fade"])

    # 23. Halation
    if "halation" in recipe:
        img = apply_halation(img, strength=recipe["halation"])

    # 24. Grain
    if "grain" in recipe:
        gr = recipe["grain"]
        if isinstance(gr, dict):
            img = add_grain(img,
                            amount=gr.get("amount", 12),
                            luminance_aware=gr.get("luminance_aware", False))
        else:
            img = add_grain(img, amount=gr)

    # 25. Vignette
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


# ===================================================================
# Processing — single file and batch
# ===================================================================

def process_single_file(args):
    """Process a single file. Used by multiprocessing pool.
    args is a tuple: (idx, total, fname, src_path, dst_path, style_name, recipe, preview_size, quality)
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
        # Load
        rgb = load_image(src_path)

        # Preview mode: resize to target before processing (much faster)
        if preview_size and preview_size > 0:
            pil_preview = Image.fromarray(rgb)
            pil_preview.thumbnail((preview_size, preview_size), Image.LANCZOS)
            rgb = np.array(pil_preview)

        # Apply style via recipe engine
        styled = apply_recipe(rgb, recipe)

        # Convert to PIL for final touches
        pil_img = Image.fromarray(styled)

        # Slight sharpening
        pil_img = pil_img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=40, threshold=2))

        # Slight brightness reduction for moodiness
        enhancer = ImageEnhance.Brightness(pil_img)
        pil_img = enhancer.enhance(0.97)

        # Save full-resolution (or preview-resolution)
        pil_img.save(dst_path, "JPEG", quality=quality, subsampling=0)

        # Generate web-friendly thumbnail for UI display (skip for preview mode)
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
    parser = argparse.ArgumentParser(description="Enso Photo Processor v2 — Recipe-based style engine")

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
    parser.add_argument("--preview", action="store_true", help="Preview mode: resize to 400px before processing")
    parser.add_argument("--preview-size", type=int, default=400, help="Preview resize target (default: 400px)")

    # Utility
    parser.add_argument("--list-styles", action="store_true", help="List all available styles and exit")

    args = parser.parse_args()

    global QUALITY
    QUALITY = args.quality

    # Resolve styles file path
    styles_file = args.styles_file
    if not styles_file:
        # Default: look for styles.json next to this script
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

    # ── Single file mode ──
    if args.input_file:
        if not args.output_file:
            # Auto-generate output path
            base, ext = os.path.splitext(args.input_file)
            args.output_file = f"{base}_{args.style}.jpg"

        if not os.path.isfile(args.input_file):
            print(json.dumps({"status": "error", "error": f"Input file not found: {args.input_file}"}), flush=True)
            sys.exit(1)

        result = process_single_photo(args.input_file, args.output_file, recipe,
                                      preview_size=preview_size, quality=QUALITY)
        print(json.dumps(result), flush=True)
        sys.exit(0 if result["status"] == "processed" else 1)

    # ── Batch mode ──
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

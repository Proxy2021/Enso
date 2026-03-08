#!/usr/bin/env python3
"""
Enso Photo Processor — Cinematic & iconic photographer style batch processing.
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


def add_grain(img_array, amount=12):
    """Add film-like luminance grain."""
    noise = np.random.normal(0, amount, img_array.shape).astype(np.float64)
    return np.clip(img_array.astype(np.float64) + noise, 0, 255).astype(np.uint8)


def color_tint(img_array, r_shift=0, g_shift=0, b_shift=0):
    """Apply global RGB shifts."""
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


# ═══════════════════════════════════════════════════════════════════
# Style implementations — 10 iconic cinematic & photographer looks
# ═══════════════════════════════════════════════════════════════════

def style_wong_kar_wai(img_array):
    """王家卫 — Neon-soaked, saturated amber & teal, crushed blacks, romantic warmth.
    Inspired by In the Mood for Love, Chungking Express, Fallen Angels."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Warm amber push — reds and yellows get saturated
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=5, midtone_shift=14, highlight_shift=8)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=-2, midtone_shift=4, highlight_shift=2)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=8, midtone_shift=-6, highlight_shift=-10)

    img_out = np.stack([r, g, b], axis=2).astype(np.float64)

    # Crush blacks — deep shadow rolloff
    shadow_mask = lum < 60
    img_out = np.where(shadow_mask[:, :, np.newaxis],
                       img_out * 0.65,  # crush shadows
                       img_out)

    # Teal push in shadows
    img_out[:, :, 1] = np.where(lum < 80, np.clip(img_out[:, :, 1] + 8, 0, 255), img_out[:, :, 1])
    img_out[:, :, 2] = np.where(lum < 80, np.clip(img_out[:, :, 2] + 14, 0, 255), img_out[:, :, 2])

    # Saturate warm tones (neon glow)
    warm = (img_out[:, :, 0] > img_out[:, :, 2] + 15)
    gray = 0.299 * img_out[:, :, 0] + 0.587 * img_out[:, :, 1] + 0.114 * img_out[:, :, 2]
    for c in range(3):
        img_out[:, :, c] = np.where(warm, np.clip(gray + 1.35 * (img_out[:, :, c] - gray), 0, 255), img_out[:, :, c])

    # Strong S-curve
    img_out = s_curve_contrast(np.clip(img_out, 0, 255).astype(np.uint8), strength=0.22).astype(np.float64)

    # Slight overall saturation boost
    img_out = adjust_saturation(np.clip(img_out, 0, 255).astype(np.uint8), 1.15).astype(np.float64)

    # Heavy vignette (intimate framing)
    img_out = add_vignette(np.clip(img_out, 0, 255).astype(np.uint8), strength=0.40)

    return img_out


def style_moriyama(img_array):
    """森山大道 — Extreme high-contrast B&W, heavy grain, blown highlights, deep blacks.
    Gritty Japanese street photography. Raw, confrontational, pure."""
    img = img_array.astype(np.float64)

    # Convert to luminance with slight red-channel bias (Moriyama's contrast style)
    gray = 0.35 * img[:, :, 0] + 0.45 * img[:, :, 1] + 0.20 * img[:, :, 2]

    # Extreme S-curve — crush shadows, blow highlights
    lum_norm = gray / 255.0
    # Double S-curve for extreme contrast
    strength1 = 0.38
    lum_curved = lum_norm + strength1 * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    # Second pass
    strength2 = 0.18
    lum_curved = lum_curved + strength2 * np.sin(2 * np.pi * lum_curved) / (2 * np.pi)
    lum_curved = np.clip(lum_curved * 255, 0, 255)

    # Push extremes — blow highlights, crush blacks
    lum_curved = np.where(lum_curved > 200, np.clip(lum_curved * 1.15, 0, 255), lum_curved)
    lum_curved = np.where(lum_curved < 50, np.clip(lum_curved * 0.6, 0, 255), lum_curved)

    img_out = np.stack([lum_curved, lum_curved, lum_curved], axis=2).astype(np.uint8)

    # Heavy grain — Moriyama's signature noise
    img_out = add_grain(img_out, amount=22)

    # Slight vignette
    img_out = add_vignette(img_out, strength=0.25)

    return img_out


def style_wes_anderson(img_array):
    """Wes Anderson — Pastel palette, flat contrast, warm retro whimsy.
    Inspired by Grand Budapest Hotel, Moonrise Kingdom, The Royal Tenenbaums."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Warm pastel push — lift everything toward pastels
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=18, midtone_shift=10, highlight_shift=3)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=12, midtone_shift=6, highlight_shift=0)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=6, midtone_shift=-2, highlight_shift=-4)

    img_out = np.stack([r, g, b], axis=2)

    # Desaturate toward pastels (but keep some color)
    img_out = adjust_saturation(img_out, 0.60)

    # Flatten contrast — reduce the S-curve, compress dynamic range
    img_f = img_out.astype(np.float64)
    mid = 135.0  # slightly bright midpoint
    flatten = 0.15
    img_f = mid + (img_f - mid) * (1 - flatten)
    img_out = np.clip(img_f, 0, 255).astype(np.uint8)

    # Heavy black lift (no true blacks in Wes Anderson)
    img_out = lift_blacks(img_out, amount=30)

    # Fade highlights (no harsh whites)
    img_out = fade_highlights(img_out, amount=12)

    # Tiny warm tint
    img_out = color_tint(img_out, r_shift=4, g_shift=2, b_shift=-3)

    # Very subtle grain for vintage feel
    img_out = add_grain(img_out, amount=5)

    return img_out


def style_blade_runner(img_array):
    """Blade Runner — Cyberpunk noir: teal shadows, orange highlights, deep crushed blacks.
    Neon-lit dystopia. Smoky atmosphere. The future is dark and beautiful."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Split tone: teal shadows / orange highlights
    shadow_mask = lum < 110
    highlight_mask = lum >= 110

    # Shadows: deep teal (reduce red, push cyan-blue)
    r = np.where(shadow_mask, np.clip(r - 20, 0, 255), r)
    g = np.where(shadow_mask, np.clip(g + 6, 0, 255), g)
    b = np.where(shadow_mask, np.clip(b + 22, 0, 255), b)

    # Highlights: warm orange
    r = np.where(highlight_mask, np.clip(r + 14, 0, 255), r)
    g = np.where(highlight_mask, np.clip(g + 3, 0, 255), g)
    b = np.where(highlight_mask, np.clip(b - 16, 0, 255), b)

    img_out = np.stack([r, g, b], axis=2).astype(np.uint8)

    # Strong S-curve contrast
    img_out = s_curve_contrast(img_out, strength=0.24)

    # Crush blacks hard
    img_f = img_out.astype(np.float64)
    lum2 = 0.299 * img_f[:, :, 0] + 0.587 * img_f[:, :, 1] + 0.114 * img_f[:, :, 2]
    deep_shadow = lum2 < 40
    for c in range(3):
        img_f[:, :, c] = np.where(deep_shadow, img_f[:, :, c] * 0.5, img_f[:, :, c])
    img_out = np.clip(img_f, 0, 255).astype(np.uint8)

    # Slight desaturation (smoky atmosphere)
    img_out = adjust_saturation(img_out, 0.82)

    # Boost teal/blue areas (neon signs)
    img_out = selective_color_boost(img_out, channel_idx=2, threshold=12, boost=1.25)

    # Heavy vignette
    img_out = add_vignette(img_out, strength=0.38)

    return img_out


def style_ghibli(img_array):
    """宮崎駿 Studio Ghibli — Soft pastoral warmth, lush greens, gentle sky blues.
    Dreamy nostalgia from Spirited Away, My Neighbor Totoro, Howl's Moving Castle."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Warm but gentle — soft golden light
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=6, midtone_shift=8, highlight_shift=2)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=4, midtone_shift=10, highlight_shift=4)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=2, midtone_shift=2, highlight_shift=6)

    img_out = np.stack([r, g, b], axis=2).astype(np.float64)

    # Boost greens (Ghibli's lush nature)
    green_dominant = (img_out[:, :, 1] > img_out[:, :, 0]) & (img_out[:, :, 1] > img_out[:, :, 2])
    img_out[:, :, 1] = np.where(green_dominant, np.clip(img_out[:, :, 1] * 1.10, 0, 255), img_out[:, :, 1])
    # Add warmth to greens (yellow-green, not harsh)
    img_out[:, :, 0] = np.where(green_dominant, np.clip(img_out[:, :, 0] + 6, 0, 255), img_out[:, :, 0])

    # Boost sky blues gently
    blue_sky = (img_out[:, :, 2] > img_out[:, :, 0] + 20) & (img_out[:, :, 2] > img_out[:, :, 1])
    img_out[:, :, 2] = np.where(blue_sky, np.clip(img_out[:, :, 2] * 1.08, 0, 255), img_out[:, :, 2])
    img_out[:, :, 1] = np.where(blue_sky, np.clip(img_out[:, :, 1] + 4, 0, 255), img_out[:, :, 1])

    # Very soft contrast (Ghibli is gentle, not harsh)
    img_out = s_curve_contrast(np.clip(img_out, 0, 255).astype(np.uint8), strength=0.08)

    # Moderate saturation — colorful but not garish
    img_out = adjust_saturation(img_out, 1.08)

    # Lift shadows (no harsh darkness)
    img_out = lift_blacks(img_out, amount=18)

    # Fade highlights slightly (watercolor softness)
    img_out = fade_highlights(img_out, amount=8)

    # Very light vignette
    img_out = add_vignette(img_out, strength=0.12)

    return img_out


def style_kodak_portra(img_array):
    """Kodak Portra 400 — The king of portrait film. Warm skin tones, soft highlight rolloff,
    pastel shadow lift, subtle grain. Beautiful, natural, timeless."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Portra's warm bias — subtle red/yellow push
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=6, midtone_shift=8, highlight_shift=4)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=3, midtone_shift=4, highlight_shift=2)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=-2, midtone_shift=-4, highlight_shift=-3)

    img_out = np.stack([r, g, b], axis=2)

    # Soft S-curve (Portra is not contrasty)
    img_out = s_curve_contrast(img_out, strength=0.10)

    # Warm skin tone boost — boost saturation in warm areas
    img_f = img_out.astype(np.float64)
    warm_mask = (img_f[:, :, 0] > img_f[:, :, 2] + 15) & (img_f[:, :, 0] > 100)
    gray = 0.299 * img_f[:, :, 0] + 0.587 * img_f[:, :, 1] + 0.114 * img_f[:, :, 2]
    for c in range(3):
        img_f[:, :, c] = np.where(warm_mask, np.clip(gray + 1.12 * (img_f[:, :, c] - gray), 0, 255), img_f[:, :, c])
    img_out = np.clip(img_f, 0, 255).astype(np.uint8)

    # Pastel shadow lift (Portra's signature)
    img_out = lift_blacks(img_out, amount=14)

    # Soft highlight rolloff
    img_out = fade_highlights(img_out, amount=8)

    # Subtle grain (film texture)
    img_out = add_grain(img_out, amount=8)

    # Light vignette
    img_out = add_vignette(img_out, strength=0.15)

    return img_out


def style_tarantino(img_array):
    """Tarantino — High saturation, punchy 70s grindhouse aesthetic.
    Kill Bill yellows, Pulp Fiction warmth, boosted reds, strong contrast."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Hot 70s color push — heavy warm bias
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=8, midtone_shift=15, highlight_shift=6)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=2, midtone_shift=8, highlight_shift=3)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=-6, midtone_shift=-10, highlight_shift=-5)

    img_out = np.stack([r, g, b], axis=2)

    # Crank saturation up
    img_out = adjust_saturation(img_out, 1.30)

    # Strong S-curve (punchy, in-your-face)
    img_out = s_curve_contrast(img_out, strength=0.25)

    # Boost reds specifically (blood, neon signs, lips)
    img_out = selective_color_boost(img_out, channel_idx=0, threshold=15, boost=1.3)

    # Slight yellow tint (70s film stock)
    img_out = color_tint(img_out, r_shift=4, g_shift=3, b_shift=-6)

    # Moderate grain (grindhouse texture)
    img_out = add_grain(img_out, amount=10)

    # Slight black lift
    img_out = lift_blacks(img_out, amount=8)

    # Medium vignette
    img_out = add_vignette(img_out, strength=0.28)

    return img_out


def style_nordic_noir(img_array):
    """Nordic Noir — Icy blue-gray Scandinavian crime thriller mood.
    Heavy desaturation, cold clinical tones, lifted blacks, overcast atmosphere."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Cold blue push in everything
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=-10, midtone_shift=-8, highlight_shift=-2)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=-4, midtone_shift=-3, highlight_shift=-2)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=14, midtone_shift=10, highlight_shift=2)

    img_out = np.stack([r, g, b], axis=2).astype(np.float64)

    # S-curve contrast
    img_out = s_curve_contrast(np.clip(img_out, 0, 255).astype(np.uint8), strength=0.20).astype(np.float64)

    # Heavy desaturation (cold, clinical)
    gray = 0.299 * img_out[:, :, 0] + 0.587 * img_out[:, :, 1] + 0.114 * img_out[:, :, 2]
    for c in range(3):
        img_out[:, :, c] = img_out[:, :, c] * 0.65 + gray * 0.35

    # Pull greens toward teal
    green_dominant = (img_out[:, :, 1] > img_out[:, :, 0] + 10) & (img_out[:, :, 1] > img_out[:, :, 2])
    img_out[:, :, 2] = np.where(green_dominant, np.clip(img_out[:, :, 2] + img_out[:, :, 1] * 0.15, 0, 255), img_out[:, :, 2])
    img_out[:, :, 1] = np.where(green_dominant, np.clip(img_out[:, :, 1] * 0.92, 0, 255), img_out[:, :, 1])

    # Boost teals and blues
    blue_dominant = (img_out[:, :, 2] > img_out[:, :, 0] + 12) & (img_out[:, :, 2] > img_out[:, :, 1])
    teal_area = blue_dominant | ((img_out[:, :, 1] > img_out[:, :, 0]) & (img_out[:, :, 2] > img_out[:, :, 0] + 8))
    for c in [1, 2]:
        img_out[:, :, c] = np.where(teal_area, np.clip(img_out[:, :, c] * 1.18, 0, 255), img_out[:, :, c])

    # Lift blacks (overcast, no true blacks)
    img_out = lift_blacks(np.clip(img_out, 0, 255).astype(np.uint8), amount=18)

    # Fade highlights + cool wash
    img_out = fade_highlights(img_out, amount=10)
    img_out = color_tint(img_out, r_shift=-2, g_shift=0, b_shift=3)

    # Vignette
    img_out = add_vignette(img_out, strength=0.30)

    return img_out


def style_terrence_malick(img_array):
    """Terrence Malick — Golden magic hour glow, ethereal lifted shadows, hazy warmth.
    Tree of Life, Badlands, Days of Heaven. Nature poetry in light."""
    img = img_array.astype(np.float64)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]

    # Golden hour warmth — strong warm push
    r = apply_curve(np.clip(r, 0, 255).astype(np.uint8), shadows_shift=10, midtone_shift=14, highlight_shift=6)
    g = apply_curve(np.clip(g, 0, 255).astype(np.uint8), shadows_shift=4, midtone_shift=8, highlight_shift=3)
    b = apply_curve(np.clip(b, 0, 255).astype(np.uint8), shadows_shift=-8, midtone_shift=-14, highlight_shift=-6)

    img_out = np.stack([r, g, b], axis=2)

    # Soft contrast (ethereal, not harsh)
    img_out = s_curve_contrast(img_out, strength=0.10)

    # Boost warm tones (golden light hitting faces and fields)
    img_f = img_out.astype(np.float64)
    warm_mask = (img_f[:, :, 0] > img_f[:, :, 2] + 20)
    gray = 0.299 * img_f[:, :, 0] + 0.587 * img_f[:, :, 1] + 0.114 * img_f[:, :, 2]
    for c in range(3):
        img_f[:, :, c] = np.where(warm_mask, np.clip(gray + 1.18 * (img_f[:, :, c] - gray), 0, 255), img_f[:, :, c])

    # Hazy highlight glow — compress highlights (lens flare feel)
    lum = 0.299 * img_f[:, :, 0] + 0.587 * img_f[:, :, 1] + 0.114 * img_f[:, :, 2]
    bright = lum > 180
    for c in range(3):
        img_f[:, :, c] = np.where(bright, np.clip(img_f[:, :, c] * 0.92 + 20, 0, 255), img_f[:, :, c])

    img_out = np.clip(img_f, 0, 255).astype(np.uint8)

    # Lift blacks (ethereal — no harsh shadows)
    img_out = lift_blacks(img_out, amount=16)

    # Fade highlights (hazy light)
    img_out = fade_highlights(img_out, amount=10)

    # Light vignette
    img_out = add_vignette(img_out, strength=0.22)

    return img_out


def style_hitchcock(img_array):
    """Alfred Hitchcock — Dramatic B&W, deep shadows, suspenseful contrast.
    Psycho, Vertigo, Rear Window. Cinematic tension in every frame."""
    img = img_array.astype(np.float64)

    # Convert to luminance — slight green-channel bias (classic cinema B&W response)
    gray = 0.30 * img[:, :, 0] + 0.55 * img[:, :, 1] + 0.15 * img[:, :, 2]

    # Strong S-curve — dramatic but not as extreme as Moriyama
    lum_norm = gray / 255.0
    strength = 0.32
    lum_curved = lum_norm + strength * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved * 255, 0, 255)

    # Slight warm tint in midtones (classic film warmth)
    r = lum_curved.copy()
    g = lum_curved.copy()
    b = lum_curved.copy()

    mid_mask = (lum_curved > 60) & (lum_curved < 200)
    r = np.where(mid_mask, np.clip(r + 4, 0, 255), r)
    b = np.where(mid_mask, np.clip(b - 3, 0, 255), b)

    # Cool shadows (suspense)
    shadow_mask = lum_curved < 60
    b = np.where(shadow_mask, np.clip(b + 5, 0, 255), b)
    r = np.where(shadow_mask, np.clip(r - 2, 0, 255), r)

    img_out = np.stack([r, g, b], axis=2).astype(np.uint8)

    # Minimal black lift (keep dramatic darks)
    img_out = lift_blacks(img_out, amount=5)

    # Very subtle grain (35mm film)
    img_out = add_grain(img_out, amount=6)

    # Strong dramatic vignette
    img_out = add_vignette(img_out, strength=0.42)

    return img_out


# ═══════════════════════════════════════════════════════════════════
# Style registry
# ═══════════════════════════════════════════════════════════════════

STYLES = {
    "wong_kar_wai": style_wong_kar_wai,
    "moriyama": style_moriyama,
    "wes_anderson": style_wes_anderson,
    "blade_runner": style_blade_runner,
    "ghibli": style_ghibli,
    "kodak_portra": style_kodak_portra,
    "tarantino": style_tarantino,
    "nordic_noir": style_nordic_noir,
    "terrence_malick": style_terrence_malick,
    "hitchcock": style_hitchcock,
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

"""
Enso Photo Engine v3 — Professional-grade image processing primitives.

Provides: spline curves, H&D film response, LAB color space, luminosity masks,
blend modes, organic film grain, and layer compositing.

Dependencies: numpy, scipy, PIL/Pillow
"""

import numpy as np
from scipy.interpolate import CubicSpline
from scipy.ndimage import gaussian_filter
from PIL import Image, ImageFilter


# ===================================================================
# Spline Curves + H&D Film Response
# ===================================================================

def build_spline_lut(control_points):
    """Build 256-element LUT from arbitrary control points using cubic spline.

    Args:
        control_points: list of [input, output] pairs (0-255 range).
                        Endpoints auto-added if missing.
    Returns:
        np.ndarray of shape (256,) dtype uint8
    """
    pts = sorted(control_points, key=lambda p: p[0])
    # Auto-add endpoints if missing
    if pts[0][0] != 0:
        pts.insert(0, [0, 0])
    if pts[-1][0] != 255:
        pts.append([255, 255])

    xs = np.array([p[0] for p in pts], dtype=np.float64)
    ys = np.array([p[1] for p in pts], dtype=np.float64)

    # Remove duplicates (keep last)
    _, unique_idx = np.unique(xs, return_index=True)
    xs = xs[unique_idx]
    ys = ys[unique_idx]

    if len(xs) < 2:
        return np.arange(256, dtype=np.uint8)

    cs = CubicSpline(xs, ys, bc_type='clamped')
    lut = cs(np.arange(256))
    return np.clip(lut, 0, 255).astype(np.uint8)


def apply_spline_curve(channel, control_points):
    """Apply multi-point spline curve to a single channel via LUT lookup."""
    lut = build_spline_lut(control_points)
    return lut[np.clip(channel, 0, 255).astype(np.uint8)]


def apply_film_hd_curve(channel, toe=0.3, toe_strength=0.5, shoulder=0.3,
                         shoulder_strength=0.5, midtone_contrast=1.0):
    """Apply H&D (Hurter-Driffield) characteristic film curve.

    Models the actual sensitometric response of photographic film:
    - Toe: compressed shadows with gradual density buildup
    - Linear: proportional response with adjustable contrast
    - Shoulder: compressed highlights with density saturation

    Args:
        channel: uint8 numpy array (single channel)
        toe: 0-1, how far the toe extends into the range
        toe_strength: 0-1, compression amount in toe (0=linear, 1=heavy)
        shoulder: 0-1, how far shoulder extends down from top
        shoulder_strength: 0-1, compression in shoulder
        midtone_contrast: slope multiplier for the linear section
    """
    x = np.arange(256) / 255.0  # normalized [0,1]
    y = np.zeros_like(x)

    toe_end = max(0.01, min(0.5, toe))
    shoulder_start = max(0.5, min(0.99, 1.0 - shoulder))

    for i, xi in enumerate(x):
        if xi < toe_end:
            # Toe region: power curve for gradual buildup
            t = xi / toe_end
            # Blend between linear and compressed
            linear_val = xi
            power = 1.0 + toe_strength * 1.5  # 1.0 to 2.5
            compressed_val = toe_end * (t ** power)
            y[i] = compressed_val
        elif xi > shoulder_start:
            # Shoulder region: inverse power curve for rolloff
            t = (xi - shoulder_start) / (1.0 - shoulder_start)
            # Value at shoulder_start from midtone section
            mid_range = shoulder_start - toe_end
            y_at_shoulder = y[int(shoulder_start * 255)] if int(shoulder_start * 255) > 0 else shoulder_start
            remaining = 1.0 - y_at_shoulder
            power = 1.0 / (1.0 + shoulder_strength * 1.5)  # flattening
            compressed = y_at_shoulder + remaining * (t ** power)
            y[i] = compressed
        else:
            # Linear midtone region with adjustable contrast
            t = (xi - toe_end) / max(0.001, (shoulder_start - toe_end))
            # y value at toe_end
            y_toe = y[max(0, int(toe_end * 255))]
            y_shoulder_target = 1.0 - shoulder_strength * 0.15  # where we need to arrive
            y[i] = y_toe + t * (y_shoulder_target - y_toe) * midtone_contrast

    # Ensure monotonically increasing
    for i in range(1, len(y)):
        if y[i] < y[i-1]:
            y[i] = y[i-1]

    lut = np.clip(y * 255, 0, 255).astype(np.uint8)
    return lut[np.clip(channel, 0, 255).astype(np.uint8)]


def apply_curves(img_array, curves_spec):
    """Apply curves to image — supports spline points and H&D film response.

    Format:
        {"r": {"points": [[0,0], [64,70], [128,135], [255,255]]}}  → spline
        {"r": {"hd_curve": {"toe": 0.3, "shoulder": 0.3, ...}}}    → film H&D
        {"master": {"points": [...]}}                                → luminance curve
    """
    img = img_array.copy()

    # Master curve (applied to luminance, preserving color ratios)
    if "master" in curves_spec:
        master = curves_spec["master"]
        img_f = img.astype(np.float64)
        lum = 0.2126 * img_f[:,:,0] + 0.7152 * img_f[:,:,1] + 0.0722 * img_f[:,:,2]
        lum = np.clip(lum, 0, 255)

        if "points" in master:
            new_lum = apply_spline_curve(lum.astype(np.uint8), master["points"]).astype(np.float64)
        elif "hd_curve" in master:
            hd = master["hd_curve"]
            new_lum = apply_film_hd_curve(lum.astype(np.uint8), **hd).astype(np.float64)
        else:
            new_lum = lum

        scale = np.where(lum > 0, new_lum / np.maximum(lum, 1), 1.0)
        for c in range(3):
            img_f[:,:,c] = np.clip(img_f[:,:,c] * scale, 0, 255)
        img = img_f.astype(np.uint8)

    # Per-channel curves
    for c_idx, c_key in enumerate(["r", "g", "b"]):
        if c_key in curves_spec:
            ch_spec = curves_spec[c_key]
            ch = img[:,:,c_idx]

            if "points" in ch_spec:
                img[:,:,c_idx] = apply_spline_curve(ch, ch_spec["points"])
            elif "hd_curve" in ch_spec:
                hd = ch_spec["hd_curve"]
                img[:,:,c_idx] = apply_film_hd_curve(ch, **hd)

    return img


# ===================================================================
# LAB Color Space
# ===================================================================

def _srgb_to_linear(srgb):
    """Convert sRGB [0,255] to linear RGB [0,1]."""
    s = srgb.astype(np.float64) / 255.0
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(linear):
    """Convert linear RGB [0,1] to sRGB [0,255]."""
    l = np.clip(linear, 0, 1)
    s = np.where(l <= 0.0031308, l * 12.92, 1.055 * (l ** (1.0/2.4)) - 0.055)
    return np.clip(s * 255, 0, 255)


def _lab_f(t):
    """CIE LAB f function."""
    delta = 6.0 / 29.0
    return np.where(t > delta**3, t ** (1.0/3.0), t / (3 * delta**2) + 4.0/29.0)


def _lab_f_inv(t):
    """Inverse CIE LAB f function."""
    delta = 6.0 / 29.0
    return np.where(t > delta, t ** 3, 3 * delta**2 * (t - 4.0/29.0))


# D65 illuminant reference white
_D65 = np.array([0.95047, 1.00000, 1.08883])

# sRGB to XYZ matrix (D65)
_RGB_TO_XYZ = np.array([
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.0721750],
    [0.0193339, 0.1191920, 0.9503041]
])

_XYZ_TO_RGB = np.linalg.inv(_RGB_TO_XYZ)


def rgb_to_lab(img_array):
    """Convert sRGB uint8 array to CIE LAB float64 array.
    L: [0,100], a: [-128,127], b: [-128,127]
    """
    linear = _srgb_to_linear(img_array)
    # RGB to XYZ: shape (H,W,3) @ (3,3).T
    h, w = linear.shape[:2]
    xyz = linear.reshape(-1, 3) @ _RGB_TO_XYZ.T
    xyz = xyz.reshape(h, w, 3)

    # Normalize by D65
    xyz[:,:,0] /= _D65[0]
    xyz[:,:,1] /= _D65[1]
    xyz[:,:,2] /= _D65[2]

    fx = _lab_f(xyz[:,:,0])
    fy = _lab_f(xyz[:,:,1])
    fz = _lab_f(xyz[:,:,2])

    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)

    return np.stack([L, a, b], axis=2)


def lab_to_rgb(lab_array):
    """Convert CIE LAB float64 array back to sRGB uint8."""
    L = lab_array[:,:,0]
    a = lab_array[:,:,1]
    b = lab_array[:,:,2]

    fy = (L + 16) / 116
    fx = a / 500 + fy
    fz = fy - b / 200

    x = _lab_f_inv(fx) * _D65[0]
    y = _lab_f_inv(fy) * _D65[1]
    z = _lab_f_inv(fz) * _D65[2]

    xyz = np.stack([x, y, z], axis=2)
    h, w = xyz.shape[:2]
    linear = xyz.reshape(-1, 3) @ _XYZ_TO_RGB.T
    linear = linear.reshape(h, w, 3)

    srgb = _linear_to_srgb(linear)
    return np.clip(srgb, 0, 255).astype(np.uint8)


def lab_to_lch(lab_array):
    """Convert LAB to LCH (Luminance, Chroma, Hue in degrees)."""
    L = lab_array[:,:,0]
    a = lab_array[:,:,1]
    b = lab_array[:,:,2]
    C = np.sqrt(a**2 + b**2)
    H = np.degrees(np.arctan2(b, a)) % 360
    return np.stack([L, C, H], axis=2)


def lch_to_lab(lch_array):
    """Convert LCH back to LAB."""
    L = lch_array[:,:,0]
    C = lch_array[:,:,1]
    H = np.radians(lch_array[:,:,2])
    a = C * np.cos(H)
    b = C * np.sin(H)
    return np.stack([L, a, b], axis=2)


def adjust_lab(img_array, l_shift=0, a_shift=0, b_shift=0,
               chroma_scale=1.0, hue_rotate=0):
    """Perform luminance-independent color grading in LAB/LCH space.

    Args:
        img_array: uint8 RGB array
        l_shift: add to L channel (lightness)
        a_shift: shift a axis (green←→red)
        b_shift: shift b axis (blue←→yellow)
        chroma_scale: scale chroma in LCH (perceptually uniform saturation)
        hue_rotate: rotate hue by degrees in LCH
    """
    lab = rgb_to_lab(img_array)

    if l_shift != 0:
        lab[:,:,0] = np.clip(lab[:,:,0] + l_shift, 0, 100)
    if a_shift != 0:
        lab[:,:,1] += a_shift
    if b_shift != 0:
        lab[:,:,2] += b_shift

    if chroma_scale != 1.0 or hue_rotate != 0:
        lch = lab_to_lch(lab)
        if chroma_scale != 1.0:
            lch[:,:,1] *= chroma_scale
        if hue_rotate != 0:
            lch[:,:,2] = (lch[:,:,2] + hue_rotate) % 360
        lab = lch_to_lab(lch)

    return lab_to_rgb(lab)


# ===================================================================
# Luminosity Masks
# ===================================================================

# Zone definitions: (low, high) in luminance [0-255]
LUMINOSITY_ZONES = {
    "blacks":     (0, 25),
    "shadows":    (0, 64),
    "darks":      (25, 100),
    "midtones":   (64, 192),
    "lights":     (155, 230),
    "highlights": (192, 255),
    "whites":     (230, 255),
}


def compute_luminance(img_array):
    """Compute luminance as float64 [0,255]."""
    img = img_array.astype(np.float64)
    return 0.2126 * img[:,:,0] + 0.7152 * img[:,:,1] + 0.0722 * img[:,:,2]


def luminosity_mask(img_array, zone="midtones", feather=30.0, custom_range=None):
    """Generate smooth luminosity mask with feathered edges.

    Args:
        zone: one of "blacks","shadows","darks","midtones","lights","highlights","whites"
        feather: edge softness (higher = smoother transitions)
        custom_range: (low, high) override

    Returns:
        float64 mask (H,W) values [0,1]
    """
    lum = compute_luminance(img_array)

    if custom_range:
        low, high = custom_range
    else:
        low, high = LUMINOSITY_ZONES.get(zone, (64, 192))

    if feather <= 0:
        # Hard mask (legacy behavior)
        return ((lum >= low) & (lum <= high)).astype(np.float64)

    # Smooth sigmoid ramps
    # Rise: smoothstep from (low - feather) to (low + feather)
    # Fall: smoothstep from (high - feather) to (high + feather)
    mask = np.ones_like(lum)

    # Lower edge ramp
    low_start = low - feather
    low_end = low + feather * 0.5
    if low > 0:
        t_low = np.clip((lum - low_start) / max(0.1, low_end - low_start), 0, 1)
        # Smoothstep: 3t² - 2t³
        ramp_low = t_low * t_low * (3 - 2 * t_low)
        mask = np.minimum(mask, ramp_low)

    # Upper edge ramp
    high_start = high - feather * 0.5
    high_end = high + feather
    if high < 255:
        t_high = np.clip((lum - high_start) / max(0.1, high_end - high_start), 0, 1)
        ramp_high = 1.0 - t_high * t_high * (3 - 2 * t_high)
        mask = np.minimum(mask, ramp_high)

    return np.clip(mask, 0, 1)


def color_range_mask(img_array, target_hue, hue_range=30.0,
                     saturation_min=0.15, feather=15.0):
    """Isolate specific hue range for targeted adjustments.

    Args:
        target_hue: target in degrees (0=red, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta)
        hue_range: +/- degrees around target
        saturation_min: minimum saturation to include (avoids matching grays)
        feather: edge softness in hue degrees
    """
    img = img_array.astype(np.float64) / 255.0

    # RGB to HSV (vectorized)
    cmax = np.max(img, axis=2)
    cmin = np.min(img, axis=2)
    delta = cmax - cmin

    # Saturation
    sat = np.where(cmax > 0, delta / np.maximum(cmax, 1e-10), 0)

    # Hue
    hue = np.zeros_like(delta)
    r, g, b = img[:,:,0], img[:,:,1], img[:,:,2]

    mask_r = (cmax == r) & (delta > 0)
    mask_g = (cmax == g) & (delta > 0) & ~mask_r
    mask_b = (delta > 0) & ~mask_r & ~mask_g

    hue = np.where(mask_r, 60 * (((g - b) / np.maximum(delta, 1e-10)) % 6), hue)
    hue = np.where(mask_g, 60 * ((b - r) / np.maximum(delta, 1e-10) + 2), hue)
    hue = np.where(mask_b, 60 * ((r - g) / np.maximum(delta, 1e-10) + 4), hue)
    hue = hue % 360

    # Hue distance (circular)
    hue_dist = np.abs(hue - target_hue)
    hue_dist = np.minimum(hue_dist, 360 - hue_dist)

    # Hue mask with feathered edge
    total_range = hue_range + feather
    hue_mask = np.where(hue_dist <= hue_range, 1.0,
                        np.where(hue_dist <= total_range,
                                 0.5 * (1 + np.cos(np.pi * (hue_dist - hue_range) / max(0.1, feather))),
                                 0.0))

    # Saturation threshold
    sat_mask = np.where(sat >= saturation_min, 1.0,
                        np.clip(sat / max(0.01, saturation_min), 0, 1))

    return np.clip(hue_mask * sat_mask, 0, 1)


def radial_mask(shape, center=(0.5, 0.5), inner_radius=0.3, outer_radius=0.8):
    """Radial gradient mask.

    Args:
        shape: (H, W)
        center: (cx, cy) as fractions of image size
        inner_radius: fully included radius (as fraction of diagonal)
        outer_radius: fully excluded radius
    """
    h, w = shape
    Y, X = np.ogrid[:h, :w]
    cx, cy = center[0] * w, center[1] * h
    diag = np.sqrt(w**2 + h**2) * 0.5

    dist = np.sqrt((X - cx)**2 + (Y - cy)**2) / diag

    if outer_radius <= inner_radius:
        return (dist <= inner_radius).astype(np.float64)

    mask = np.clip(1.0 - (dist - inner_radius) / (outer_radius - inner_radius), 0, 1)
    # Smoothstep
    return mask * mask * (3 - 2 * mask)


def gradient_mask(shape, direction="top_to_bottom", start=0.0, end=1.0):
    """Linear gradient mask.

    Args:
        shape: (H, W)
        direction: "top_to_bottom", "bottom_to_top", "left_to_right", "right_to_left"
        start: gradient start value (0-1)
        end: gradient end value (0-1)
    """
    h, w = shape

    if direction in ("top_to_bottom", "bottom_to_top"):
        grad = np.linspace(0, 1, h).reshape(-1, 1) * np.ones((1, w))
        if direction == "bottom_to_top":
            grad = 1 - grad
    else:
        grad = np.ones((h, 1)) * np.linspace(0, 1, w).reshape(1, -1)
        if direction == "right_to_left":
            grad = 1 - grad

    return start + grad * (end - start)


# ===================================================================
# Blend Modes
# ===================================================================

def rgb_to_hsl(img_array):
    """Convert RGB [0,255] to HSL. Returns float64 array (H,W,3).
    H: [0,360], S: [0,1], L: [0,1]
    """
    img = img_array.astype(np.float64) / 255.0
    cmax = np.max(img, axis=2)
    cmin = np.min(img, axis=2)
    delta = cmax - cmin

    # Lightness
    L = (cmax + cmin) / 2.0

    # Saturation
    S = np.where(delta == 0, 0, delta / (1 - np.abs(2 * L - 1) + 1e-10))
    S = np.clip(S, 0, 1)

    # Hue
    r, g, b = img[:,:,0], img[:,:,1], img[:,:,2]
    H = np.zeros_like(delta)
    mask_r = (cmax == r) & (delta > 0)
    mask_g = (cmax == g) & (delta > 0) & ~mask_r
    mask_b = (delta > 0) & ~mask_r & ~mask_g

    H = np.where(mask_r, 60 * (((g - b) / np.maximum(delta, 1e-10)) % 6), H)
    H = np.where(mask_g, 60 * ((b - r) / np.maximum(delta, 1e-10) + 2), H)
    H = np.where(mask_b, 60 * ((r - g) / np.maximum(delta, 1e-10) + 4), H)
    H = H % 360

    return np.stack([H, S, L], axis=2)


def hsl_to_rgb(hsl_array):
    """Convert HSL to RGB [0,255] uint8."""
    H = hsl_array[:,:,0]
    S = hsl_array[:,:,1]
    L = hsl_array[:,:,2]

    C = (1 - np.abs(2 * L - 1)) * S
    X = C * (1 - np.abs((H / 60) % 2 - 1))
    m = L - C / 2

    h_sector = (H / 60).astype(int) % 6

    r = np.zeros_like(H)
    g = np.zeros_like(H)
    b = np.zeros_like(H)

    for sector, (rc, gc, bc) in enumerate([
        (lambda: C, lambda: X, lambda: np.zeros_like(C)),  # 0
        (lambda: X, lambda: C, lambda: np.zeros_like(C)),  # 1
        (lambda: np.zeros_like(C), lambda: C, lambda: X),  # 2
        (lambda: np.zeros_like(C), lambda: X, lambda: C),  # 3
        (lambda: X, lambda: np.zeros_like(C), lambda: C),  # 4
        (lambda: C, lambda: np.zeros_like(C), lambda: X),  # 5
    ]):
        mask = h_sector == sector
        r = np.where(mask, rc(), r)
        g = np.where(mask, gc(), g)
        b = np.where(mask, bc(), b)

    rgb = np.stack([r + m, g + m, b + m], axis=2)
    return np.clip(rgb * 255, 0, 255).astype(np.uint8)


def blend(base, overlay, mode="normal", opacity=1.0, mask=None):
    """Photoshop-standard blend modes.

    Args:
        base: (H,W,3) uint8 or float64 — background layer
        overlay: (H,W,3) uint8 or float64 — top layer
        mode: blend mode name
        opacity: 0-1
        mask: optional (H,W) float64 [0,1] mask

    Returns:
        uint8 (H,W,3) result
    """
    a = base.astype(np.float64) / 255.0
    b = overlay.astype(np.float64) / 255.0

    if mode == "normal":
        result = b

    # Darken modes
    elif mode == "multiply":
        result = a * b
    elif mode == "color_burn":
        result = np.where(b > 0, 1.0 - np.minimum(1.0, (1.0 - a) / np.maximum(b, 1e-10)), 0)
    elif mode == "linear_burn":
        result = np.clip(a + b - 1.0, 0, 1)

    # Lighten modes
    elif mode == "screen":
        result = 1.0 - (1.0 - a) * (1.0 - b)
    elif mode == "color_dodge":
        result = np.where(b < 1, np.minimum(1.0, a / np.maximum(1.0 - b, 1e-10)), 1.0)
    elif mode == "linear_dodge":
        result = np.clip(a + b, 0, 1)

    # Contrast modes
    elif mode == "overlay":
        result = np.where(a < 0.5, 2 * a * b, 1.0 - 2 * (1.0 - a) * (1.0 - b))
    elif mode == "soft_light":
        # Pegtop formula
        result = (1.0 - 2 * b) * a * a + 2 * b * a
    elif mode == "hard_light":
        result = np.where(b < 0.5, 2 * a * b, 1.0 - 2 * (1.0 - a) * (1.0 - b))
    elif mode == "vivid_light":
        result = np.where(b <= 0.5,
                          np.where(b > 0, 1.0 - (1.0 - a) / np.maximum(2 * b, 1e-10), 0),
                          np.where(b < 1, a / np.maximum(2 * (1.0 - b), 1e-10), 1.0))
        result = np.clip(result, 0, 1)
    elif mode == "linear_light":
        result = np.clip(a + 2 * b - 1.0, 0, 1)

    # Component modes (HSL-based)
    elif mode == "hue":
        hsl_a = rgb_to_hsl((a * 255).astype(np.uint8)).astype(np.float64)
        hsl_b = rgb_to_hsl((b * 255).astype(np.uint8)).astype(np.float64)
        hsl_a[:,:,0] = hsl_b[:,:,0]  # Take hue from overlay
        result = hsl_to_rgb(hsl_a).astype(np.float64) / 255.0
    elif mode == "saturation":
        hsl_a = rgb_to_hsl((a * 255).astype(np.uint8)).astype(np.float64)
        hsl_b = rgb_to_hsl((b * 255).astype(np.uint8)).astype(np.float64)
        hsl_a[:,:,1] = hsl_b[:,:,1]  # Take saturation from overlay
        result = hsl_to_rgb(hsl_a).astype(np.float64) / 255.0
    elif mode == "color":
        hsl_a = rgb_to_hsl((a * 255).astype(np.uint8)).astype(np.float64)
        hsl_b = rgb_to_hsl((b * 255).astype(np.uint8)).astype(np.float64)
        hsl_a[:,:,0] = hsl_b[:,:,0]  # Take hue from overlay
        hsl_a[:,:,1] = hsl_b[:,:,1]  # Take saturation from overlay
        result = hsl_to_rgb(hsl_a).astype(np.float64) / 255.0
    elif mode == "luminosity":
        hsl_a = rgb_to_hsl((a * 255).astype(np.uint8)).astype(np.float64)
        hsl_b = rgb_to_hsl((b * 255).astype(np.uint8)).astype(np.float64)
        hsl_a[:,:,2] = hsl_b[:,:,2]  # Take luminosity from overlay
        result = hsl_to_rgb(hsl_a).astype(np.float64) / 255.0

    else:
        result = b  # fallback to normal

    result = np.clip(result, 0, 1)

    # Apply opacity and mask
    effective_opacity = opacity
    if mask is not None:
        effective_opacity = opacity * mask[:,:,np.newaxis]

    final = a * (1.0 - effective_opacity) + result * effective_opacity
    return np.clip(final * 255, 0, 255).astype(np.uint8)


# ===================================================================
# Film Grain
# ===================================================================

def generate_organic_noise(shape, scale=64.0, octaves=4, persistence=0.5, seed=None):
    """Generate organic multi-octave noise for film grain simulation.

    Uses stacked Gaussian-filtered random fields at different scales.

    Args:
        shape: (H, W)
        scale: base noise scale (higher = larger clumps)
        octaves: number of fractal layers
        persistence: amplitude decay per octave (0.5 = halve)
        seed: random seed

    Returns:
        float64 array (H,W), normalized to roughly [-1, 1]
    """
    if seed is not None:
        rng = np.random.RandomState(seed)
    else:
        rng = np.random

    noise = np.zeros(shape, dtype=np.float64)
    amplitude = 1.0
    total_amplitude = 0.0

    for i in range(octaves):
        # Generate random field
        raw = rng.randn(*shape)
        # Apply Gaussian filter at decreasing sigma (increasing frequency)
        sigma = scale / (2 ** i)
        if sigma >= 1.0:
            filtered = gaussian_filter(raw, sigma=sigma)
        else:
            filtered = raw

        noise += filtered * amplitude
        total_amplitude += amplitude
        amplitude *= persistence

    # Normalize to [-1, 1]
    if total_amplitude > 0:
        noise /= total_amplitude

    # Normalize to standard deviation of ~1
    std = np.std(noise)
    if std > 0:
        noise /= std

    return noise


# ISO profile presets: (amount, size, roughness)
ISO_PROFILES = {
    "iso100":  (3,  0.8, 0.3),
    "iso200":  (6,  1.0, 0.4),
    "iso400":  (10, 1.5, 0.5),
    "iso800":  (16, 2.0, 0.6),
    "iso1600": (22, 2.5, 0.7),
    "iso3200": (30, 3.0, 0.8),
}


def apply_film_grain(img_array, amount=12, size=1.5, roughness=0.5,
                     color_grain=False, r_amount=None, g_amount=None,
                     b_amount=None, luminance_aware=True, iso_profile=None):
    """Professional film grain simulation with organic structure.

    Args:
        amount: overall grain intensity (std dev in pixel values)
        size: grain clump size (0.8=fine, 3.0=coarse). Maps to noise scale.
        roughness: fractal roughness (0=smooth, 1=sharp). Controls octave count.
        color_grain: independent grain per channel (color neg) vs same pattern (B&W)
        r/g/b_amount: per-channel grain override
        luminance_aware: more grain in midtones, less in shadows/highlights
        iso_profile: "iso100" through "iso3200" auto-sets amount/size/roughness
    """
    if iso_profile and iso_profile in ISO_PROFILES:
        amount, size, roughness = ISO_PROFILES[iso_profile]

    if amount <= 0:
        return img_array

    h, w = img_array.shape[:2]
    img = img_array.astype(np.float64)

    scale = max(2, size * 32)  # Map size to Gaussian scale
    octaves = max(1, int(1 + roughness * 5))  # 1-6 octaves

    # Luminance-aware mask
    if luminance_aware:
        lum = compute_luminance(img_array) / 255.0
        # Bell curve: peak at midtones
        grain_mask = np.exp(-4.0 * (lum - 0.5) ** 2)
        grain_mask = np.clip(grain_mask * 0.7 + 0.3, 0, 1)  # Floor at 30%
    else:
        grain_mask = np.ones((h, w))

    if color_grain:
        # Independent grain per channel (color negative film)
        amounts = [
            r_amount if r_amount is not None else amount,
            g_amount if g_amount is not None else amount,
            b_amount if b_amount is not None else amount
        ]
        for c in range(3):
            if amounts[c] > 0:
                noise = generate_organic_noise((h, w), scale=scale, octaves=octaves)
                img[:,:,c] += noise * amounts[c] * grain_mask
    else:
        # Same grain pattern for all channels (B&W film)
        noise = generate_organic_noise((h, w), scale=scale, octaves=octaves)
        for c in range(3):
            ch_amount = [r_amount, g_amount, b_amount][c]
            ch_amount = ch_amount if ch_amount is not None else amount
            img[:,:,c] += noise * ch_amount * grain_mask

    return np.clip(img, 0, 255).astype(np.uint8)


# ===================================================================
# Additional Processing Utilities (kept from v1, enhanced where needed)
# ===================================================================

def apply_monochrome(img_array, weights=None):
    """Convert to B&W with custom channel weights."""
    if weights is None:
        weights = [0.299, 0.587, 0.114]
    img = img_array.astype(np.float64)
    gray = weights[0] * img[:,:,0] + weights[1] * img[:,:,1] + weights[2] * img[:,:,2]
    gray = np.clip(gray, 0, 255)
    return np.stack([gray, gray, gray], axis=2).astype(np.uint8)


def s_curve_contrast(img_array, strength=0.15):
    """Apply S-curve contrast on luminance."""
    if strength <= 0:
        return img_array
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]
    lum_norm = lum / 255.0
    lum_curved = lum_norm + strength * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    scale = np.where(lum > 0, (lum_curved * 255) / np.maximum(lum, 1), 1.0)
    for c in range(3):
        img[:,:,c] = np.clip(img[:,:,c] * scale, 0, 255)
    return np.clip(img, 0, 255).astype(np.uint8)


def double_s_curve_contrast(img_array, strength=0.38):
    """Double S-curve for extreme contrast (Moriyama, Delta 3200)."""
    img = img_array.astype(np.float64)
    lum = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]
    lum_norm = lum / 255.0
    s1 = strength
    lum_curved = lum_norm + s1 * np.sin(2 * np.pi * lum_norm) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    s2 = strength * 0.47
    lum_curved = lum_curved + s2 * np.sin(2 * np.pi * lum_curved) / (2 * np.pi)
    lum_curved = np.clip(lum_curved, 0, 1)
    scale = np.where(lum > 0, (lum_curved * 255) / np.maximum(lum, 1), 1.0)
    for c in range(3):
        img[:,:,c] = np.clip(img[:,:,c] * scale, 0, 255)
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_contrast(img_array, strength=0.15, contrast_type="s_curve", blend_mode=None):
    """Apply contrast with optional blend mode (e.g., 'luminosity' to prevent color shifts)."""
    if contrast_type == "double_s_curve":
        contrasted = double_s_curve_contrast(img_array, strength=strength)
    else:
        contrasted = s_curve_contrast(img_array, strength=strength)

    if blend_mode and blend_mode != "normal":
        return blend(img_array, contrasted, mode=blend_mode)
    return contrasted


def add_vignette(img_array, strength=0.3):
    """Apply vignette darkening from edges."""
    if strength <= 0:
        return img_array
    h, w = img_array.shape[:2]
    mask = radial_mask((h, w), center=(0.5, 0.5), inner_radius=0.45, outer_radius=1.0)
    vignette_factor = 1.0 - strength * (1.0 - mask)
    vignette_factor = np.clip(vignette_factor, 0, 1)
    out = img_array.astype(np.float64)
    for c in range(3):
        out[:,:,c] *= vignette_factor
    return np.clip(out, 0, 255).astype(np.uint8)


def adjust_saturation(img_array, factor):
    """Adjust saturation. factor=0 is grayscale, 1 is unchanged."""
    if factor == 1.0:
        return img_array
    img = img_array.astype(np.float64)
    gray = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]
    for c in range(3):
        img[:,:,c] = gray + factor * (img[:,:,c] - gray)
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


def color_tint(img_array, r_shift=0, g_shift=0, b_shift=0):
    """Apply global RGB shifts."""
    if r_shift == 0 and g_shift == 0 and b_shift == 0:
        return img_array
    img = img_array.astype(np.float64)
    img[:,:,0] += r_shift
    img[:,:,1] += g_shift
    img[:,:,2] += b_shift
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_split_tone(img_array, shadow_zone="shadows", highlight_zone="highlights",
                     feather=30, shadows=None, highlights=None,
                     blend_mode=None, opacity=1.0):
    """Split tone with feathered luminosity masks.

    Args:
        shadow_zone: luminosity zone name for shadows
        highlight_zone: luminosity zone name for highlights
        feather: mask edge softness
        shadows: {"r": shift, "g": shift, "b": shift}
        highlights: {"r": shift, "g": shift, "b": shift}
        blend_mode: optional blend mode (e.g., "color")
        opacity: layer opacity
    """
    shadows = shadows or {}
    highlights = highlights or {}

    img = img_array.copy().astype(np.float64)

    # Shadow tinting with feathered mask
    if any(shadows.get(k, 0) != 0 for k in ["r", "g", "b"]):
        s_mask = luminosity_mask(img_array, zone=shadow_zone, feather=feather)
        tinted = img.copy()
        for c_idx, c_key in enumerate(["r", "g", "b"]):
            shift = shadows.get(c_key, 0)
            if shift != 0:
                tinted[:,:,c_idx] += shift
        tinted = np.clip(tinted, 0, 255)
        # Blend with mask
        for c in range(3):
            img[:,:,c] = img[:,:,c] * (1 - s_mask) + tinted[:,:,c] * s_mask

    # Highlight tinting with feathered mask
    if any(highlights.get(k, 0) != 0 for k in ["r", "g", "b"]):
        h_mask = luminosity_mask(img_array, zone=highlight_zone, feather=feather)
        tinted = img.copy()
        for c_idx, c_key in enumerate(["r", "g", "b"]):
            shift = highlights.get(c_key, 0)
            if shift != 0:
                tinted[:,:,c_idx] += shift
        tinted = np.clip(tinted, 0, 255)
        for c in range(3):
            img[:,:,c] = img[:,:,c] * (1 - h_mask) + tinted[:,:,c] * h_mask

    result = np.clip(img, 0, 255).astype(np.uint8)

    if blend_mode and blend_mode != "normal":
        result = blend(img_array, result, mode=blend_mode, opacity=opacity)
    elif opacity < 1.0:
        result = blend(img_array, result, mode="normal", opacity=opacity)

    return result


def apply_shadow_crush(img_array, threshold=60, factor=0.65, feather=20):
    """Crush shadows with feathered mask (no banding)."""
    img = img_array.astype(np.float64)
    mask = luminosity_mask(img_array, custom_range=(0, threshold), feather=feather)

    crushed = img.copy()
    for c in range(3):
        crushed[:,:,c] *= factor

    for c in range(3):
        img[:,:,c] = img[:,:,c] * (1 - mask) + crushed[:,:,c] * mask

    return np.clip(img, 0, 255).astype(np.uint8)


def apply_highlight_blow(img_array, threshold=200, factor=1.15, feather=20):
    """Blow highlights with feathered mask."""
    img = img_array.astype(np.float64)
    mask = luminosity_mask(img_array, custom_range=(threshold, 255), feather=feather)

    blown = img.copy()
    for c in range(3):
        blown[:,:,c] *= factor

    for c in range(3):
        img[:,:,c] = img[:,:,c] * (1 - mask) + np.minimum(blown[:,:,c], 255) * mask

    return np.clip(img, 0, 255).astype(np.uint8)


def apply_halation(img_array, strength=0.15, radius=None):
    """Halation — red bloom around bright areas (CineStill 800T effect)."""
    if strength <= 0:
        return img_array
    img = img_array.astype(np.float64)
    lum = compute_luminance(img_array)

    # Smooth bright mask
    bright_mask = luminosity_mask(img_array, zone="whites", feather=20)

    red_glow = img[:,:,0] * bright_mask
    glow_img = Image.fromarray(np.clip(red_glow, 0, 255).astype(np.uint8))
    blur_radius = radius or max(5, min(img_array.shape[0], img_array.shape[1]) // 80)
    glow_blurred = np.array(glow_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))).astype(np.float64)

    img[:,:,0] = np.clip(img[:,:,0] + glow_blurred * strength, 0, 255)
    img[:,:,1] = np.clip(img[:,:,1] + glow_blurred * strength * 0.3, 0, 255)

    return np.clip(img, 0, 255).astype(np.uint8)


def apply_warm_boost(img_array, threshold=15, saturation_factor=1.12):
    """Boost saturation in warm-toned areas."""
    img = img_array.astype(np.float64)
    warm_mask = (img[:,:,0] > img[:,:,2] + threshold) & (img[:,:,0] > 100)
    gray = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]
    for c in range(3):
        img[:,:,c] = np.where(warm_mask,
                              np.clip(gray + saturation_factor * (img[:,:,c] - gray), 0, 255),
                              img[:,:,c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_flatten_contrast(img_array, midpoint=135, amount=0.15):
    """Compress dynamic range toward midpoint."""
    if amount <= 0:
        return img_array
    img = img_array.astype(np.float64)
    img = midpoint + (img - midpoint) * (1 - amount)
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_desaturate_blend(img_array, blend_amount=0.65):
    """Blend with grayscale version."""
    img = img_array.astype(np.float64)
    gray = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]
    for c in range(3):
        img[:,:,c] = img[:,:,c] * blend_amount + gray * (1 - blend_amount)
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_haze_highlights(img_array, threshold=180, factor=0.92, add=20):
    """Compress and lift highlights for dreamy look."""
    img = img_array.astype(np.float64)
    mask = luminosity_mask(img_array, custom_range=(threshold, 255), feather=25)
    for c in range(3):
        hazed = img[:,:,c] * factor + add
        img[:,:,c] = img[:,:,c] * (1 - mask) + hazed * mask
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_selective_boost(img_array, channel="r", threshold=10, factor=1.2):
    """Boost saturation where specific channel dominates."""
    ch_map = {"r": 0, "g": 1, "b": 2}
    ch_idx = ch_map.get(channel, 0)
    img = img_array.astype(np.float64)
    others = [i for i in range(3) if i != ch_idx]
    dominant = (img[:,:,ch_idx] > img[:,:,others[0]] + threshold) & \
               (img[:,:,ch_idx] > img[:,:,others[1]] + threshold)
    gray = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]
    for c in range(3):
        img[:,:,c] = np.where(dominant, np.clip(gray + factor * (img[:,:,c] - gray), 0, 255), img[:,:,c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_green_to_teal(img_array, blue_add_factor=0.15, green_reduce=0.92):
    """Convert green-dominant areas toward teal."""
    img = img_array.astype(np.float64)
    green_dominant = (img[:,:,1] > img[:,:,0] + 10) & (img[:,:,1] > img[:,:,2])
    img[:,:,2] = np.where(green_dominant, np.clip(img[:,:,2] + img[:,:,1] * blue_add_factor, 0, 255), img[:,:,2])
    img[:,:,1] = np.where(green_dominant, np.clip(img[:,:,1] * green_reduce, 0, 255), img[:,:,1])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_teal_boost(img_array, factor=1.18):
    """Boost teal/blue-dominant areas."""
    img = img_array.astype(np.float64)
    teal = ((img[:,:,2] > img[:,:,0] + 12) & (img[:,:,2] > img[:,:,1])) | \
           ((img[:,:,1] > img[:,:,0]) & (img[:,:,2] > img[:,:,0] + 8))
    for c in [1, 2]:
        img[:,:,c] = np.where(teal, np.clip(img[:,:,c] * factor, 0, 255), img[:,:,c])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_green_boost(img_array, factor=1.10, warm_shift=6):
    """Boost green-dominant areas."""
    img = img_array.astype(np.float64)
    green_dominant = (img[:,:,1] > img[:,:,0]) & (img[:,:,1] > img[:,:,2])
    img[:,:,1] = np.where(green_dominant, np.clip(img[:,:,1] * factor, 0, 255), img[:,:,1])
    if warm_shift > 0:
        img[:,:,0] = np.where(green_dominant, np.clip(img[:,:,0] + warm_shift, 0, 255), img[:,:,0])
    return np.clip(img, 0, 255).astype(np.uint8)


def apply_sky_boost(img_array, blue_factor=1.08, green_add=4):
    """Boost sky blue areas gently."""
    img = img_array.astype(np.float64)
    blue_sky = (img[:,:,2] > img[:,:,0] + 20) & (img[:,:,2] > img[:,:,1])
    img[:,:,2] = np.where(blue_sky, np.clip(img[:,:,2] * blue_factor, 0, 255), img[:,:,2])
    if green_add > 0:
        img[:,:,1] = np.where(blue_sky, np.clip(img[:,:,1] + green_add, 0, 255), img[:,:,1])
    return np.clip(img, 0, 255).astype(np.uint8)


# ===================================================================
# Layer Compositor
# ===================================================================

def _create_solid_color_layer(shape, color):
    """Create a solid color layer."""
    layer = np.zeros((*shape[:2], 3), dtype=np.uint8)
    layer[:,:,0] = color[0]
    layer[:,:,1] = color[1]
    layer[:,:,2] = color[2]
    return layer


def _apply_effect(img_array, effect, params):
    """Apply a named effect with parameters. Returns modified image."""
    if effect == "curves":
        return apply_curves(img_array, params)
    elif effect == "lab_adjust":
        return adjust_lab(img_array, **params)
    elif effect == "solid_color":
        return _create_solid_color_layer(img_array.shape, params.get("color", [128,128,128]))
    elif effect == "contrast":
        return apply_contrast(img_array,
                              strength=params.get("strength", 0.15),
                              contrast_type=params.get("type", "s_curve"))
    elif effect == "saturation":
        return adjust_saturation(img_array, params.get("factor", 1.0))
    elif effect == "grain":
        return apply_film_grain(img_array, **params)
    elif effect == "vignette":
        return add_vignette(img_array, strength=params.get("strength", 0.3))
    elif effect == "halation":
        return apply_halation(img_array, **params)
    elif effect == "color_tint":
        return color_tint(img_array, **params)
    elif effect == "split_tone":
        return apply_split_tone(img_array, **params)
    elif effect == "monochrome":
        return apply_monochrome(img_array, params.get("weights"))
    elif effect == "shadow_crush":
        return apply_shadow_crush(img_array, **params)
    elif effect == "highlight_blow":
        return apply_highlight_blow(img_array, **params)
    elif effect == "black_lift":
        return lift_blacks(img_array, amount=params.get("amount", 15))
    elif effect == "highlight_fade":
        return fade_highlights(img_array, amount=params.get("amount", 8))
    elif effect == "warm_boost":
        return apply_warm_boost(img_array, **params)
    elif effect == "flatten_contrast":
        return apply_flatten_contrast(img_array, **params)
    elif effect == "desaturate_blend":
        return apply_desaturate_blend(img_array, blend_amount=params.get("blend", 0.65))
    elif effect == "haze_highlights":
        return apply_haze_highlights(img_array, **params)
    elif effect == "selective_boost":
        return apply_selective_boost(img_array, **params)
    elif effect == "green_to_teal":
        return apply_green_to_teal(img_array, **params)
    elif effect == "teal_boost":
        return apply_teal_boost(img_array, **params)
    elif effect == "green_boost":
        return apply_green_boost(img_array, **params)
    elif effect == "sky_boost":
        return apply_sky_boost(img_array, **params)
    else:
        return img_array


def _build_mask(img_array, mask_spec):
    """Build a mask from specification."""
    mask_type = mask_spec.get("type", "luminosity")

    if mask_type == "luminosity":
        return luminosity_mask(
            img_array,
            zone=mask_spec.get("zone", "midtones"),
            feather=mask_spec.get("feather", 30),
            custom_range=mask_spec.get("custom_range")
        )
    elif mask_type == "color_range":
        return color_range_mask(
            img_array,
            target_hue=mask_spec.get("target_hue", 0),
            hue_range=mask_spec.get("hue_range", 30),
            saturation_min=mask_spec.get("saturation_min", 0.15),
            feather=mask_spec.get("feather", 15)
        )
    elif mask_type == "radial":
        return radial_mask(
            img_array.shape[:2],
            center=tuple(mask_spec.get("center", [0.5, 0.5])),
            inner_radius=mask_spec.get("inner_radius", 0.3),
            outer_radius=mask_spec.get("outer_radius", 0.8)
        )
    elif mask_type == "gradient":
        return gradient_mask(
            img_array.shape[:2],
            direction=mask_spec.get("direction", "top_to_bottom"),
            start=mask_spec.get("start", 0),
            end=mask_spec.get("end", 1)
        )
    else:
        return np.ones(img_array.shape[:2])


def apply_layer_stack(img_array, layers):
    """Apply ordered stack of adjustment layers.

    Each layer: {
        "effect": str,
        "params": dict,
        "blend_mode": str (default "normal"),
        "opacity": float (default 1.0),
        "mask": { "type": "luminosity", "zone": "shadows", "feather": 30 }
    }
    """
    base = img_array.copy()

    for layer in layers:
        effect = layer.get("effect", "")
        params = layer.get("params", {})
        blend_mode = layer.get("blend_mode", "normal")
        opacity = layer.get("opacity", 1.0)
        mask_spec = layer.get("mask")

        if not effect:
            continue

        # Apply effect
        adjusted = _apply_effect(base, effect, params)

        # Build mask if specified
        mask = None
        if mask_spec:
            mask = _build_mask(base, mask_spec)

        # Composite
        base = blend(base, adjusted, mode=blend_mode, opacity=opacity, mask=mask)

    return base

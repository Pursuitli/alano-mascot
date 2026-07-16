#!/usr/bin/env python3
"""SAMPLE — cut Alano stills out of their flat AI-generated backgrounds.

Works for any near-solid background color (warm cream, white, green, …):
samples the border's median color and flood-fills everything border-connected
within a color tolerance, so the background goes transparent while similar
tones *inside* the character survive. A second, looser pass confined to the
bottom band removes the soft ground shadow without eating into the body.
Writes RGBA WebPs ready for compositing over any page background.

Requires: pip install numpy pillow

Usage: python3 scripts/cutout_alano.py output/stills/wave.png [more.png ...]
Output: <input-dir>/<name>-cutout.webp
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TOLERANCE = 26  # max per-channel distance from the border color (higher leaks into pale fur)
SHADOW_TOLERANCE = 60  # looser pass for the soft ground shadow, confined to the bottom band
SHADOW_BAND = 0.22  # bottom fraction of the image where the shadow pass may expand
MAX_DIMENSION = 1024


def flood(close: np.ndarray, seeds) -> np.ndarray:
    height, width = close.shape
    visited = np.zeros((height, width), dtype=bool)
    queue = deque()
    for y, x in seeds:
        if close[y, x] and not visited[y, x]:
            visited[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < height and 0 <= nx < width and close[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))
    return visited


def background_mask(rgb: np.ndarray) -> np.ndarray:
    height, width, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg_color = np.median(border, axis=0)
    dist = np.abs(rgb.astype(int) - bg_color).max(axis=2)

    border_seeds = [(y, x) for x in range(width) for y in (0, height - 1)] + [
        (y, x) for y in range(height) for x in (0, width - 1)
    ]

    # Strict pass keeps the character intact.
    mask = flood(dist <= TOLERANCE, border_seeds)

    # Looser pass eats the soft ground shadow, but may only expand inside the
    # bottom band so it can never climb into the character's body.
    band_start = int(height * (1 - SHADOW_BAND))
    close_shadow = dist <= SHADOW_TOLERANCE
    close_shadow[:band_start, :] = False
    shadow_seeds = [(y, x) for x in range(width) for y in (band_start, height - 1)] + [
        (y, x) for y in range(band_start, height) for x in (0, width - 1)
    ]
    # Also seed from already-cleared background inside the band.
    ys, xs = np.where(mask[band_start:, :])
    shadow_seeds += list(zip((ys + band_start).tolist(), xs.tolist()))
    mask |= flood(close_shadow, shadow_seeds)
    return mask


def greenness(rgb: np.ndarray) -> np.ndarray:
    """How much the green channel dominates: G - max(R, B), signed."""
    r = rgb[..., 0].astype(int)
    g = rgb[..., 1].astype(int)
    b = rgb[..., 2].astype(int)
    return g - np.maximum(r, b)


GREEN_THRESHOLD = 60  # bg if G exceeds max(R,B) by this much (mint fur sits ~30)


def chroma_background_mask(rgb: np.ndarray) -> np.ndarray:
    """Green-screen mode: a global greenness mask instead of border flood-fill.

    Flood-fill can't reach green pockets enclosed by the character (e.g.
    between a raised arm and the head), and green is saturated enough to
    classify per-pixel without eating the character's mint fur. The mask is
    then dilated 2px to swallow the green fringe left by soft edges.

    Two criteria: strong green dominance catches the flat backdrop, and the
    low-blue test catches darker green shadows (bg green has almost no blue;
    the character's mint fur is blue-rich, so it never matches).
    """
    r = rgb[..., 0].astype(int)
    g = rgb[..., 1].astype(int)
    b = rgb[..., 2].astype(int)
    mask = (greenness(rgb) > GREEN_THRESHOLD) | ((g - b > 55) & (g - r > 20))
    dilated = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    return np.asarray(dilated) > 0


def despill(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Clamp green spill on semi-transparent edge pixels: G := max(R, B)."""
    out = rgb.copy()
    edge = (alpha > 0) & (alpha < 255)
    spill = greenness(rgb) > 0
    fix = edge & spill
    out[..., 1][fix] = np.maximum(out[..., 0], out[..., 2])[fix]
    return out


def cutout(src: Path) -> None:
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img)

    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg_color = np.median(border, axis=0)
    chroma = bg_color[1] - max(bg_color[0], bg_color[2]) > GREEN_THRESHOLD

    mask = chroma_background_mask(rgb) if chroma else background_mask(rgb)

    alpha = Image.fromarray(np.where(mask, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))

    if chroma:
        rgb = despill(rgb, np.asarray(alpha))
        img = Image.fromarray(rgb)

    rgba = img.convert("RGBA")
    rgba.putalpha(alpha)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    rgba.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    dest = src.with_name(f"{src.stem}-cutout.webp")
    rgba.save(dest, "WEBP", quality=88)
    print(f"✔ {src.name} → {dest} ({rgba.size[0]}x{rgba.size[1]})")


if __name__ == "__main__":
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        sys.exit("usage: cutout_alano.py <still.png> [more.png ...]")
    for p in paths:
        if not p.exists():
            sys.exit(f"not found: {p}")
        cutout(p)

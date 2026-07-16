---
name: alano-cutout
description: Remove the flat background from a generated Alano still to get a transparent RGBA cutout — the generate-on-flat-background-then-remove-it technique (works for cream, white, or green backgrounds), including ground-shadow removal. Use when an Alano image needs to sit on an arbitrary page background.
---

# Cutting Alano out of a flat background

Image models can't reliably output transparency, so we generate on a **known
flat background** and remove it locally. The house recipe:

1. **Generate with a solid, even backdrop** and force it to the edges — the
   STYLE string's "the warm cream background color extends continuously to all
   four edges of the image, seamless studio backdrop" clause exists for this.
   Cream is the house default; **use a chroma-green backdrop when the pose
   contains cream/skin tones near the silhouette** (see failure example below).
   For green, also prompt: "one single uniform solid bright chroma-key green
   color, no gradient, no vignette, no shadow on the background, crisp clean
   edges with no white outline or halo around the character". The script
   samples the border and picks the right removal mode automatically.
2. **Run the cutout script:**

```bash
python3 scripts/cutout_alano.py output/stills/wave.png
# → output/stills/wave-cutout.webp (RGBA, trimmed, max 1024px)
```

Shipped examples: `assets/cutouts/wave-cutout.webp`,
`assets/cutouts/celebrating-cutout.webp` (from `assets/stills/` sources).

## How it works — two modes, auto-detected from the border color

**Cream/white mode** (border color not strongly green):

- Samples the **median border color** and flood-fills only pixels
  **connected to the border** within `TOLERANCE` (26/channel), so background
  tones *inside* the character (belly, eyes, highlights) survive.
- A second pass with looser `SHADOW_TOLERANCE` (60), confined to the bottom
  `SHADOW_BAND` (22%) of the image, eats the soft ground shadow without being
  able to climb into the body.

**Chroma-green mode** (border greenness `G - max(R,B) > 60`) — flood-fill is
the wrong tool here, learned the hard way:

- Flood-fill can't reach green pockets **enclosed by the character** (between
  a raised arm and the head), and soft render edges leave a **green fringe**.
- So instead: a **global per-pixel mask** — background if greenness > 60, OR
  `G-B > 55 and G-R > 20` (catches dark green *shadows*, which have almost no
  blue; the character's mint fur is blue-rich, so it never matches).
- The mask is **dilated 2px** to swallow the edge fringe, and remaining
  semi-transparent edge pixels are **despilled** (`G := max(R,B)`).

Both modes end the same way: alpha feathered (Gaussian blur 1.2), bbox-trim,
capped at 1024px.

## Tuning

- Background halo left around the fur → raise `TOLERANCE` a little (too high
  leaks into pale fur).
- Ground shadow remnants → raise `SHADOW_TOLERANCE` or `SHADOW_BAND`.
- Character partially erased → the background color is too close to the fur;
  regenerate on a more distinct backdrop (this is when a green backdrop earns
  its keep) rather than fighting the tolerance. Known example:
  `assets/stills/idle.png` fails this way — its cream face tones connect to
  the cream backdrop, and the flood-fill eats holes in the face. Poses like
  wave/celebrating/proud cut cleanly.

## Video cutouts

Don't chroma-key video — quality is poor with soft 3D renders. Instead render
clips **on the page's own background color** and play them as plain rectangles
(this is what the products do), or use a still cutout + CSS animation.

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

Shipped example: `assets/cutouts/wave-cutout.webp` (from `assets/stills/alano-wave.png`).
The cleanest reference for what a good cutout looks like is
`assets/root/alano-root.png` itself — chroma-green pipeline, no edge halo.

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

### Known issue: the global mask bites mint fur

The global mask trades one failure for another: because it classifies *any*
green-dominant pixel as background regardless of position, it also eats real
character pixels wherever Alano's mint fur/ears/tail render saturated enough
to cross the same threshold — visible as small bites near the jaw/cheek on
some generations, even with the dilate+despill pass. It's not rare enough to
ignore at batch scale (seen on multiple independently generated variants).

## The better key: backdrop *chromaticity*, not greenness

Every "greenness" rule — global mask or border flood-fill — eventually fails,
because greenness confuses two physically different things:

- **Backdrop in shadow** (the band under the feet, and any pocket it seals off)
  is the backdrop colour scaled *down*. That's multiplicative. Raw greenness
  collapses and the shadow reads as character.
- **Spill** — the faint bounce-light a physically based render correctly casts
  from the backdrop onto nearby pale concave surfaces (inner thighs, underarms,
  under the chin) — is the backdrop hue blended *into* a bright pastel base, so
  red and blue stay high. Raw greenness can clear the threshold and the spill
  reads as background, bridging a real pocket into the limb.

**Chromaticity separates both.** Normalise each pixel by its own intensity
(`rgb / (r+g+b)`) and measure distance to the backdrop's chromaticity:

- Shading is multiplicative, so normalising cancels it *exactly* — shadowed
  backdrop stays recognisable as backdrop.
- Spill only moves chromaticity partway toward the backdrop, so it stays
  clearly separated from it.

Measured on a 20-render batch: backdrop noise floor ~0.02–0.06, character
0.26–0.37 — roughly a 5–15x margin, versus the coin-flip that raw greenness
gives on mint legs.

Two practical consequences:

1. **Threshold relative to the image's own border, not a constant.** Backdrop
   purity varies a lot between renders. Take the 99th percentile of chromaticity
   distance around the border as a noise floor and propagate within ~3x of it.
2. **It works for any backdrop hue**, because it's defined against the *sampled*
   backdrop rather than a green-channel rule. That's what makes the colour
   choice below a free parameter instead of a rewrite.

### Erosion: much less than you'd think, and it has a cost

With a chromaticity key, erosion only has to sever the few stray pixels that
still clear the threshold — not whole spill regions. `max(1, round(width/1024))`
(~2 passes at 2048px) is enough. **This supersedes the earlier `width/256`
guidance**, which was compensating for a weak discriminator.

Use as little as works, because **erosion severs thin *legitimate* connections
just as readily as spill bridges.** Where the backdrop reaches into a narrow
enclosed pocket — armpit gaps, the wedge under the chin, between the legs, the
notch where the tail meets the shirt — erosion cuts the pocket off from the
border, the flood can never reach it, and raw backdrop survives in the output.
On one 2048px render that was 36 pockets totalling ~1200px.

**So reclaim sealed pockets afterwards.** For each leftover region, ask whether
its *core* is genuinely the backdrop colour. Component **mean** colour is
useless here — small pockets are mostly anti-aliased fringe, which drags the
mean far off. The **fraction of pixels within ~60 RGB of the sampled backdrop**
separates cleanly: true pockets score 0.31–1.00, spill and edge fringe score
exactly 0.00. Spill can approach the backdrop's hue but never its actual colour,
because it is that hue multiplied into a pastel base.

### Despill has to generalise too

`G := max(R, B)` is a green-only rule. For an arbitrary backdrop, clamp whichever
channels the backdrop is *strong* in down to the strongest channel it is *weak*
in — for green that reduces to exactly the original rule. Apply it only where the
rim is genuinely contaminated, or it will grey out legitimately saturated edges
such as Alano's pink paws.

## Before blaming the cutout: check the raw render for a floor

The single largest cause of keying failure found so far was not the algorithm
and not the backdrop colour — it was the model quietly rendering a **3D floor
with a horizon line** instead of a flat backdrop, with the character standing on
a receding plane.

That costs twice:

- the floor bounces its colour up onto whatever is nearest it, which is his
  **paws** — the worst case, because they're his most saturated feature;
- it leaves **contact-shadow puddles** that key out as ragged blobs at the feet.

Symptom: a bitten-off paw, or magenta/green blobs pooled under him, on renders
whose upper body keys perfectly. Fix it in the prompt, not the mask:

> The background is one completely flat uniform field of color with no floor,
> no ground plane, no horizon line, no wall-to-floor corner and no perspective —
> the character floats against it. No contact shadow, no cast shadow, no
> reflection and no darkened pool beneath his feet.

Adding this took a 20-render batch from 7 flagged to 0.

## Choosing the backdrop colour: favour the *fixable* risk

Alano's palette collides with more keys than you'd expect, and the choice is not
about which colour is furthest away on average:

| Backdrop | Collides with | Measured margin |
|---|---|---|
| Green | mint legs | 4.7x |
| Magenta | **pink paws** | 11x, but fails hard when it fails |
| Orange | cream torso | 4x |
| Violet | mint legs | fails — legs indistinguishable from backdrop |

Magenta measures best and is still the wrong answer. **Green wins because the
two risks are not equally fixable.** Mint is a gradient the model chooses, so
prompt wording ("his legs are pale desaturated mint-teal and must never take on
the backdrop colour") moves it. The pink paws are fixed character design and no
prompt can move them — magenta stays permanently one bad render away from eating
his feet.

Generalise: when picking a key colour, ask which character colour it endangers
and whether that colour is something you can *prompt away*. Prefer the collision
you control. Measure it as chromaticity distance from the character's colours to
the backdrop, in multiples of the backdrop's own border noise — anything under
~3x is unkeyable.

## Batch QA: score, don't eyeball

At batch scale nobody inspects every image, and these defects hide at thumbnail
size. Score every cutout and review only the worst:

- **separation** — character-vs-backdrop chromaticity distance on the **raw**
  render, in noise-floor units. Run this *before* keying: it's the only check
  that distinguishes "the cutout failed" (retry the mask, free) from "this render
  was never keyable" (regenerate, costs a generation).
- **holes** — transparent regions fully enclosed by the character. Always a
  defect: a real gap between the legs or arms reaches the image border.
- **residual** — surviving pixels whose chromaticity still matches the backdrop.
- **clipped** — opaque pixels on the image border, i.e. a limb ran out of frame.
- **coverage** — opaque fraction; a normal full-body Alano sits near 0.6.

Rank worst-first and regenerate the flagged ids. Validated against a batch with
7 known-bad images: the score flagged exactly those 7, and ranked the
unkeyable one top.

## Tuning

- Background halo left around the fur → raise `TOLERANCE` a little (too high
  leaks into pale fur).
- Ground shadow remnants → raise `SHADOW_TOLERANCE` or `SHADOW_BAND`.
- Character partially erased → the background color is too close to the fur;
  regenerate on a more distinct backdrop (this is when a green backdrop earns
  its keep) rather than fighting the tolerance. Known example:
  `assets/stills/idle.png` fails this way — its cream face tones connect to
  the cream backdrop, and the flood-fill eats holes in the face.
- A whole limb chewed back, or a paw missing → measure separation on the raw
  render first. If it's under ~3x the border noise floor, the character and
  backdrop really are the same colour there and **no mask setting will fix
  it** — regenerate. Tuning thresholds against an unkeyable render just trades
  a bitten limb for leftover backdrop.
- Cream-mode cutouts can still leave a faint gray/white fringe on
  high-contrast, soft-rendered edges (raised paws, tail, floating confetti)
  even when the character isn't erased — this is why the root reference was
  redone on chroma-green (see above) rather than patched with tolerance
  tuning. If a still has a lot of outstretched limbs or fine detail near the
  edge, generate it on chroma-green from the start instead of cream.

## Video cutouts

Don't chroma-key video — quality is poor with soft 3D renders. Instead render
clips **on the page's own background color** and play them as plain rectangles
(this is what the products do), or use a still cutout + CSS animation.

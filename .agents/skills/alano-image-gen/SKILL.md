---
name: alano-image-gen
description: Generate on-brand Alano mascot stills, badges, and icons with Seedream (BytePlus Ark) image-to-image. Use when asked to create a new Alano pose, mood, costume, badge, or illustration. Covers the API call, reference-image attachment, sizes, and the no-text rule.
---

# Generating Alano stills (Seedream image-to-image)

Read `alano-brand` first for the character rules and STYLE string.
Working sample: `scripts/generate-alano-images.mjs` — copy a line in its
`STILLS` array, change the pose description, run it.

## API

```
POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations
Authorization: Bearer $SEEDANCE_API_KEY   # runtime-injected, NEVER committed
```

Model: `seedream-4-5-251128`

```json
{
  "model": "seedream-4-5-251128",
  "prompt": "<STYLE>. <pose description>",
  "image": "data:image/png;base64,<assets/root/alano-think.png>",
  "sequential_image_generation": "disabled",
  "response_format": "url",
  "size": "2048x2048",
  "stream": false,
  "watermark": false
}
```

- `image` is **required for brand consistency** — base64 data URI of
  `assets/root/alano-think.png` (or `badge-ref.png` for badges). Accepts up
  to 10 references in an array.
- `size`: `"2K"`, `"4K"`, or explicit `WIDTHxHEIGHT` (explicit sizes must be
  ≥ 3,686,400 px — e.g. for a 1200×630 OG image generate at 3200×1680 and
  downscale).
- `response_format: "url"` links expire in ~24h — download immediately.
- Build the request JSON with a script, not inline shell — the base64 payload
  is too large to quote safely.

## Run the sample

```bash
SEEDANCE_API_KEY="<key>" node scripts/generate-alano-images.mjs
# regenerate specific ids:
SEEDREAM_ONLY=wave,thinking SEEDANCE_API_KEY="<key>" node scripts/generate-alano-images.mjs
```

Output lands in `output/stills/` (badges in `output/badges/`).

## Batch variety: orientation needs to be explicit

When generating many poses in one batch, the attached reference image
conditions the model toward a similar default body orientation almost every
time — without an explicit instruction, most results drift toward facing the
same direction regardless of pose. If a batch needs genuine visual variety,
add an explicit, randomized orientation clause per prompt (e.g. "facing
directly toward the viewer" / "body turned to face the left side of the
frame" / "in a three-quarter turn facing toward the right") rather than
assuming pose variation alone will produce it.

## Generating for cutout: demand a flat backdrop, explicitly

If the still is destined for `alano-cutout`, "solid background color to all four
edges" is **not enough**. The model will happily read that as a studio *set* —
a floor with a horizon line, the character standing on a receding plane — which
is technically a solid colour everywhere and still ruins the key: the floor
bounces its colour onto his paws, and contact shadows pool into ragged blobs.

Add this to the prompt whenever the output will be keyed:

> The background is one completely flat uniform field of color with no floor,
> no ground plane, no horizon line, no wall-to-floor corner and no perspective —
> the character floats against it. No contact shadow, no cast shadow, no
> reflection and no darkened pool beneath his feet.

Pair it with an explicit anti-blend clause, since the model otherwise drifts his
mint toward whatever the backdrop is:

> Alano's own colors must stay soft and pastel — his legs, arms, ears and tail
> are pale desaturated mint-teal and cream, and must never take on the color of
> the backdrop, never be tinted by it, and never blend into it; keep an
> unambiguous, clearly visible edge between his silhouette and the background
> everywhere, especially around the legs, feet, ears, jaw and tail.

Together these took a 20-render batch from 7 unusable cutouts to 0. Without
them, roughly half of a batch came back with legs the same colour as the
backdrop — unrecoverable at the cutout stage, see `alano-cutout`.

## Batch consistency: cascade from a reference set, not a single reference

Attaching `alano-think.png` to every call holds the *character* but not the
*expression* — it has one fixed face, so asking it for "sad" fights the
conditioning, and emotion fidelity across a batch stays weak.

For any batch large enough to care, generate in two tiers:

1. **Tier 1 — a small reference library.** Generate one image per emotion
   (or per costume, per whatever axis needs to hold), all in an identical
   **pose-neutral** setup: same stance, front-facing, arms at sides, no props,
   no costume, no particles. Only the face varies. Review these by hand — a
   set of 20 is cheap to eyeball and it is the highest-leverage gate in the
   pipeline.
2. **Tier 2 — the batch**, each image conditioned on the Tier 1 member matching
   its emotion. The model is handed the expression as a *picture* rather than a
   word.

Pose-neutrality in Tier 1 is the part that's easy to get wrong: a reference
encodes posture as strongly as it encodes expression, so a slumped "sad"
reference drags every downstream scenario toward slumping. Let ears, tail and a
slight head tilt carry the emotion — they read clearly on a cat without
disturbing the stance.

## Batch variety: compose scenarios, don't permute axes

Sampling `occupation x pose x weather x mood` and concatenating the fragments
produces prompts that read like coordinates, and output that feels mechanical —
the same costume in twelve poses rather than twelve different ideas. It also
generates incoherent combinations ("sad" + "playing football joyfully") that the
model renders as a muddle because the prompt fights itself.

Prefer **authored scenarios** as the atomic unit — a written moment that already
bundles action, props and context ("tossing a disc of pizza dough into the air, a
small puff of flour around his paws") — with emotion and orientation as light
modifiers on top. Give each scenario an explicit list of emotions it's
compatible with, so variants sample only from combinations that make sense.

## Optional: a less-fluffy material finish

The default STYLE string's "plush" and "fur" language reliably renders as
soft plush-toy fuzz. If a project wants Alano to read as smooth
vinyl/rubber-toy instead — same colors, proportions, and outfit, different
surface material — swap those two words out and add explicit no-fur-strand
language:

- `"cute plush cat mascot"` → `"cute cat mascot character"`
- `"pink-and-mint gradient fur"` → `"pink-and-mint gradient smooth surface"`
- add: `"smooth matte vinyl-toy finish, soft rounded blended gradient
  shading, no visible fur strands or fuzzy texture, clean smooth surface
  like a soft rubber/vinyl figure"`

This is a real material/identity change, not a rendering nuance — it changes
what Alano *is*, not just how the render looks. Treat it as a deliberate
per-project decision (documented here so it doesn't need re-deriving), not a
default worth silently baking into the canonical STYLE string in
`alano-brand`.

## Badges (medallion coins)

Use `assets/root/badge-ref.png` as the reference and the `BADGE_STYLE` string
in the sample script — coin face, rim, and Alano bust then match across all
products. One embossed pastel motif per badge, plain white outside the coin.

## Text on images: never trust the model

Seedream mangles text — especially Traditional Chinese (it produced duplicated
chars, simplified variants, hybrid glyphs; stricter prompts made it worse).
Recipe that works: generate the art with "absolutely no text", then erase the
text region and typeset real text locally with ImageMagick (`-annotate` with a
real font file). Always zoom-crop the text region and inspect it afterwards.

## Using a different model

Alano is tuned and proven on Seedream, but the reference-image + STYLE
string method isn't Seedream-specific. Two alternatives worth knowing:

- **OpenAI `gpt-image-1`** (Images API `edits` endpoint) takes multiple
  input images as reference and can output a native transparent background
  (`background: "transparent"`) — potentially skipping `cutout_alano.py`
  entirely for that model. Its text rendering is also generally better than
  Seedream's, so don't assume the "never trust the model for text" failure
  mode below carries over uncritically — test first. (No `gpt-image-2`
  exists yet; don't hardcode that model id.)
- **Google Gemini 2.5 Flash Image ("Nano Banana")** is built specifically
  for cross-turn subject consistency via conversational/multi-image context,
  which is exactly the problem this skill solves manually with a re-attached
  reference image every call — worth a side-by-side test to see if it holds
  Alano on-model with a lighter prompt.

Swapping providers means changing the request shape in
`scripts/generate-alano-images.mjs` to match — the character-consistency
rules in `alano-brand` still apply regardless of which model renders the
pixels.

## After generating

1. Inspect the result at full size (the character must match the reference —
   face, fur gradient, t-shirt rainbow).
2. If it's a transparent-background use case, run
   `python3 scripts/cutout_alano.py output/stills/<name>.png` (see `alano-cutout`).
3. Compress for shipping: `magick out.png -quality 85 out.webp` (masters stay
   PNG, shipped copies WebP).

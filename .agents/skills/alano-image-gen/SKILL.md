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

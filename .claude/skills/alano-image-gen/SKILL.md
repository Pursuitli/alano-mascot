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

## After generating

1. Inspect the result at full size (the character must match the reference —
   face, fur gradient, t-shirt rainbow).
2. If it's a transparent-background use case, run
   `python3 scripts/cutout_alano.py output/stills/<name>.png` (see `alano-cutout`).
3. Compress for shipping: `magick out.png -quality 85 out.webp` (masters stay
   PNG, shipped copies WebP).

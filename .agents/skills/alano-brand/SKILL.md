---
name: alano-brand
description: The canonical Alano mascot brand definition — who Alano is, the exact style prompt string, the root reference images, and the rules every generation must follow. Read this FIRST before generating any Alano image, video, icon, or badge.
---

# Alano — the character and the brand rules

Alano is a cute plush **cat mascot**: pink-and-mint gradient fur, teal ears,
rosy cheeks, black t-shirt with a small pastel rainbow on the chest, mint legs
with pink feet, fluffy mint-and-blue tail. Soft 3D render, premium pastel
palette (candy pink, mint green, soft lavender, warm peach, sky blue).

## Root reference images (the anchors — never regenerate these)

| File | Use |
|---|---|
| `assets/root/alano-root.png` | THE root Alano (1334×1564 RGBA, transparent, waving). Master of the whole character — generated on chroma green and cut out, so edges are clean with no white halo. |
| `assets/root/alano-root-green.png` | The green-backdrop Seedream source of the root. Regenerate the root cutout from this (see `alano-cutout`). |
| `assets/root/alano-think.png` | The canonical image-to-image reference. **Attach this to every Seedream/Seedance request.** Scripts must abort rather than generate without it. |
| `assets/root/badge-ref.png` | Style reference for medallion coin badges — attach instead of alano-think.png when generating badges. |

## The canonical STYLE string

Prepend this to every image prompt (video variant differs slightly — see
`alano-video-gen`):

> Soft 3D render matching the reference character exactly: the cute plush cat
> mascot Alano with pink-and-mint gradient fur, teal ears, rosy cheeks, black
> t-shirt with a small pastel rainbow. Warm cream background, premium pastel
> palette of candy pink, mint green, soft lavender, warm peach and sky blue,
> soft studio lighting, centered balanced composition, the warm cream
> background color extends continuously to all four edges of the image,
> seamless studio backdrop photograph style, absolutely no text, no letters,
> no numbers, no symbols, no watermarks

Then append the pose/action: `${STYLE}. Alano waving hello warmly with one
raised paw, bright welcoming smile, other paw relaxed at his side`.

## Hard rules

1. **Always attach a root reference image** (image-to-image / reference_image).
   Prompt-only generation drifts off-model — front-end devs cannot fix that.
2. **Alano stays pastel.** Accent/brand colors (e.g. a red frame) belong to the
   layout, never to the cat itself.
3. **No text in generated art** — image models mangle text, especially CJK.
   Composite real text locally afterwards (ImageMagick).
4. **Flat background on purpose.** Generate on a solid, even background
   (warm cream is the house default) extended to all four edges, so
   `scripts/cutout_alano.py` can remove it cleanly. See `alano-cutout`.
5. **Costumes and regional variants are welcome** (hat, scarf, cape, kimono…)
   as long as the face, fur gradient and proportions match the reference.
6. **API keys are never committed.** Scripts read `SEEDANCE_API_KEY` from the
   environment and exit if it's missing. Keep it that way.

## Proven variant catalogue (poses that already exist in production)

Moods: idle, talking, thinking, proud, shocked, judging, laughing, confused,
celebrating, sleeping, wave. Costumes: hat, scarf, cape, kimono. Props:
trophy, cloud, flame companions (streak-7/30/100), golden medal. Scenes:
desk-work, coffee, lunch, movie, workout, morning-stretch, bedtime.
Personality-type variants: Ally, Anchor, Architect, Builder, Challenger,
Dreamer, Observer, Sentinel, Spark, Wanderer.

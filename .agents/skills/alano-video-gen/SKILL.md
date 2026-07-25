---
name: alano-video-gen
description: Generate loopable Alano mascot video clips with Seedance (BytePlus Ark) using the canonical reference image. Use when asked to create an Alano animation, mood clip, ambient loop, or cinematic scene. Covers the tasks API, the loop-prompt suffix, and model fallbacks.
---

# Generating Alano video clips (Seedance)

Read `alano-brand` first. Working sample: `scripts/generate-alano-videos.mjs`
— copy a line in its `CLIPS` array, change the motion description, run it.
Sample outputs to compare against: `assets/video/raw/idle.mp4` (raw API
output) and `assets/video/idle.mp4` (finished loop).

## API (async tasks)

```
POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks
Authorization: Bearer $SEEDANCE_API_KEY   # runtime-injected, NEVER committed
```

Seedance **2.0** (`dreamina-seedance-2-0-260128`) — supports reference images,
params as top-level fields:

```json
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "<prompt>" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,…" }, "role": "reference_image" }
  ],
  "ratio": "1:1", "resolution": "720p", "duration": 5,
  "watermark": false, "generate_audio": false
}
```

Seedance **1.0** fallback (`seedance-1-0-pro-250528`) — no reference images;
params go in-text: `<prompt> --ratio 1:1 --resolution 720p --duration 5
--watermark false`. Only the prompt carries the look, so expect drift.

Then poll `GET …/tasks/<id>` every ~10s until `status: "succeeded"` and
download `content.video_url` immediately. The sample script probes two API
bases (ap-southeast, cn-beijing) × three model ids and uses the first that
accepts a task.

## The loop rule — most important part

Avatar clips loop in a `<video loop>`. Append this to EVERY clip prompt:

> the character stays centered, camera locked static, the motion is gentle and
> continuous, ends in exactly the same pose it started in, seamless loop

Defaults that work: 1:1, 720p, 5s, no audio. Cinematic marketing scenes are
the exception: 16:9, moving camera allowed, no loop suffix.

## Run the sample

```bash
SEEDANCE_API_KEY="<key>" node scripts/generate-alano-videos.mjs
# then finish them (crop, palindrome loop, poster, manifest):
node scripts/postprocess-alano-clips.mjs
```

Raw clips land in `output/video/raw/` — they are NOT shippable yet. Always
run the postprocess step (see `alano-video-postprocess`).

## Regional / costume variants

Same pipeline, different wardrobe in the prompt — e.g. the Japan product uses
"Alano wearing a cozy kimono peeking from behind a shoji screen"
(`assets/video/kimono-peek.mp4`). Face, fur gradient, and proportions must
still match the reference image.

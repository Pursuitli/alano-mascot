---
name: alano-video-postprocess
description: Turn raw Seedance clips into shippable, seamlessly-looping web/app video — square crop, palindrome loop trick, poster frames, size budget, and ffmpeg encoding rules (including keyframe-dense encodes for scroll-scrubbed video). Use whenever a generated Alano clip flickers at the loop point, is too big, or needs to ship.
---

# Finishing Alano clips for shipping

Working sample: `scripts/postprocess-alano-clips.mjs` (requires ffmpeg).
Compare `assets/video/raw/idle.mp4` (raw, 1.6 MB) with `assets/video/idle.mp4`
(finished, 176 KB, seamless loop).

## The palindrome loop trick

`<video loop>` restarts at frame 0; if the last frame ≠ first frame you get a
visible snap. Fix: concatenate the clip with its own reverse, so last frame ==
first frame by construction:

```bash
ffmpeg -y -i raw.mp4 \
  -filter_complex "[0:v]crop='min(iw,ih)':'min(iw,ih)',scale=480:480,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" \
  -map "[v]" -c:v libx264 -profile:v main -crf 26 -pix_fmt yuv420p \
  -movflags +faststart -an out.mp4
```

**Exception:** motion with a directional arc (a jump-and-settle, a laugh
building up) reads wrong in reverse. For those moods skip the palindrome
(`NO_PALINDROME` set in the script — e.g. shocked, celebrating) and instead
regenerate the raw clip until its natural start/end poses match.
`assets/video/celebrating.mp4` is a shipped no-palindrome example.

For **native iOS** looping (AVPlayer), the palindrome file works as-is; if you
need a non-palindrome native loop without the restart flash, see the
`ios-seamless-video-loop` technique (AVMutableComposition repeat — AVPlayerLooper
cannot do it flashlessly).

## Shipping rules

- Square 480×480 for avatar clips, `-crf 26`, **budget <600 KB per clip**.
- Always `-an` (no audio) and `-movflags +faststart`.
- Extract a first-frame poster: `ffmpeg -y -i out.mp4 -vframes 1 -vf scale=480:480 poster.webp`
  — the `<video poster>` hides the load gap.
- Write a `clips.json` manifest (`{mood: {src, poster}}`) so the front end
  discovers clips by mood instead of hardcoding paths.

## Scroll-scrubbed video (setting video.currentTime on scroll)

Different rules: every seek decodes from the previous keyframe, so a default
long-GOP encode feels frozen in Chrome (Safari hides it — **always test in
Chrome**). Encode with a keyframe every 4 frames:

```bash
ffmpeg -y -i in.mp4 -c:v libx264 -preset slow -crf 20 -g 4 -pix_fmt yuv420p \
  -an -movflags +faststart out.mp4
```

WebM must be remuxed so the header carries duration (`ffmpeg -i in.webm -c copy
out.webm`), else Chrome can report `duration=Infinity` and break scrub math.

Verify keyframe density: `ffprobe -v error -select_streams v -skip_frame nokey
-show_entries frame=pts_time -of csv=p=0 file.mp4 | wc -l` → expect ~frames/4,
not 1.

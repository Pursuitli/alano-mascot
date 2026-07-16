#!/usr/bin/env node
/**
 * SAMPLE — finish raw Seedance mood clips into shippable avatar assets:
 *
 *   output/video/raw/<mood>.mp4
 *     → output/video/<mood>.mp4   (square 480px, loop-safe, <~600KB, no audio)
 *     → output/video/<mood>.webp  (first-frame poster)
 *     → output/video/clips.json   (manifest for the front end)
 *
 * Loop strategy: <video loop> in a browser/WebView restarts at the first
 * frame. A palindrome (forward + reversed) makes the file's last frame
 * identical to its first, so the wrap is visually seamless without any
 * native player tricks. Moods whose motion reads wrong when reversed are
 * listed in NO_PALINDROME — for those, regenerate the raw clip until its
 * natural start/end poses match instead.
 *
 * Requires ffmpeg on PATH. Usage:
 *   node scripts/postprocess-alano-clips.mjs [mood ...]
 */

import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RAW_DIR = path.join(ROOT, "output", "video", "raw");
const OUT_DIR = path.join(ROOT, "output", "video");

// Moods whose motion looks wrong played backwards (a jump/settle arc, a laugh
// building up): ship these without the palindrome and rely on matched
// start/end poses from generation.
const NO_PALINDROME = new Set(["shocked", "celebrating"]);

const SIZE = 480;
const CRF = 26;

async function finishClip(mood) {
  const src = path.join(RAW_DIR, `${mood}.mp4`);
  const destMp4 = path.join(OUT_DIR, `${mood}.mp4`);
  const destPoster = path.join(OUT_DIR, `${mood}.webp`);

  const square = `crop='min(iw,ih)':'min(iw,ih)',scale=${SIZE}:${SIZE}`;
  const filter = NO_PALINDROME.has(mood)
    ? `[0:v]${square}[v]`
    : `[0:v]${square},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]`;

  await run("ffmpeg", [
    "-y", "-i", src,
    "-filter_complex", filter, "-map", "[v]",
    "-c:v", "libx264", "-profile:v", "main", "-crf", String(CRF),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    destMp4,
  ]);

  await run("ffmpeg", ["-y", "-i", destMp4, "-vframes", "1", "-vf", `scale=${SIZE}:${SIZE}`, destPoster]);

  const { size } = await stat(destMp4);
  const kb = Math.round(size / 1024);
  console.log(`✔ ${mood}: ${kb} KB${kb > 600 ? "  ⚠ over 600KB budget" : ""}${NO_PALINDROME.has(mood) ? " (no palindrome)" : ""}`);
  return { mood, src: `/alano/${mood}.mp4`, poster: `/alano/${mood}.webp`, bytes: size, palindrome: !NO_PALINDROME.has(mood) };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const requested = process.argv.slice(2);
  const available = (await readdir(RAW_DIR).catch(() => []))
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => f.replace(/\.mp4$/, ""));
  const moods = requested.length ? requested : available;
  if (!moods.length) {
    console.error(`No raw clips found in ${RAW_DIR}. Run scripts/generate-alano-videos.mjs first.`);
    process.exit(1);
  }

  const entries = [];
  for (const mood of moods) {
    if (!existsSync(path.join(RAW_DIR, `${mood}.mp4`))) {
      console.error(`✗ ${mood}: no raw clip`);
      continue;
    }
    entries.push(await finishClip(mood));
  }

  const manifest = Object.fromEntries(entries.map((e) => [e.mood, { src: e.src, poster: e.poster }]));
  await writeFile(path.join(OUT_DIR, "clips.json"), JSON.stringify(manifest, null, 2));
  const total = entries.reduce((s, e) => s + e.bytes, 0);
  console.log(`\n${entries.length} clips, total ${(total / 1024 / 1024).toFixed(2)} MB → output/video/clips.json`);
}

main().catch((err) => {
  console.error(err.stderr ?? err.message ?? err);
  process.exit(1);
});

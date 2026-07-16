#!/usr/bin/env node
/**
 * SAMPLE — generate on-brand Alano stills with Seedream (BytePlus Ark).
 *
 * Character consistency: every request attaches the canonical Alano PNG
 * (assets/root/alano-think.png) as an image-to-image reference — the script
 * aborts rather than generate off-model art without it.
 *
 * The API key is NEVER stored in the repo — inject it at runtime:
 *
 *   SEEDANCE_API_KEY="<key>" node scripts/generate-alano-images.mjs
 *
 * Optional env:
 *   SEEDREAM_MODEL   Model id (default seedream-4-5-251128)
 *   SEEDREAM_ONLY    Comma-separated still ids to (re)generate
 *   SEEDREAM_SIZE    Image size (default 2048x2048)
 *
 * Output: output/stills/<id>.png
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "output", "stills");
const REF_IMAGE = path.join(ROOT, "assets", "root", "alano-think.png");

const API_KEY = process.env.SEEDANCE_API_KEY;
if (!API_KEY) {
  console.error("SEEDANCE_API_KEY is required (runtime-injected; never committed).");
  process.exit(1);
}

const API_BASE = process.env.SEEDREAM_API_BASE ?? "https://ark.ap-southeast.bytepluses.com/api/v3";
const MODEL = process.env.SEEDREAM_MODEL ?? "seedream-4-5-251128";
const SIZE = process.env.SEEDREAM_SIZE ?? "2048x2048";

// Canonical Alano brand string — keeps the character on-model across every
// generation. See .claude/skills/alano-brand/SKILL.md before editing.
const STYLE =
  "Soft 3D render matching the reference character exactly: the cute plush cat mascot Alano " +
  "with pink-and-mint gradient fur, teal ears, rosy cheeks, black t-shirt with a small pastel rainbow. " +
  "Warm cream background, premium pastel palette of candy pink, mint green, soft lavender, warm peach and sky blue, " +
  "soft studio lighting, centered balanced composition, " +
  "the warm cream background color extends continuously to all four edges of the image, " +
  "seamless studio backdrop photograph style, " +
  "absolutely no text, no letters, no numbers, no symbols, no watermarks";

// Medallion badges attach assets/root/badge-ref.png instead, so coin, rim
// and character read identically across products.
const BADGE_STYLE =
  "Round embossed medallion coin badge in exactly the style of the reference image: soft 3D render, warm peach coin face, " +
  "smooth raised cream rim, the cute plush cat mascot Alano from the reference shown as a bust inside the coin, " +
  "pink-and-mint gradient fur, teal ears, rosy cheeks, black t-shirt with a small pastel rainbow, " +
  "one small embossed pastel motif on the coin face beside him, soft studio lighting, " +
  "plain white background outside the coin, absolutely no text, no letters, no numbers, no watermarks";

// Sample pose catalogue — copy a line, change the pose description, done.
const STILLS = [
  { id: "idle", prompt: `${STYLE}. Alano standing relaxed and content, arms at his sides, tail curled gently, calm friendly smile, eyes open` },
  { id: "wave", prompt: `${STYLE}. Alano waving hello warmly with one raised paw, bright welcoming smile, other paw relaxed at his side` },
  { id: "thinking", prompt: `${STYLE}. Alano thinking hard, one paw on his chin, eyes looking up and to the side, curious pondering expression` },
  { id: "celebrating", prompt: `${STYLE}. Alano celebrating joyfully, both paws thrown up in the air, huge happy open-mouth smile, jumping pose, pastel confetti pieces floating around him` },
  { id: "sleeping", prompt: `${STYLE}. Alano fast asleep, curled up peacefully, eyes closed, gentle content smile, tail wrapped around his body` },
];

const BADGES = [
  { id: "badge-streak", dir: "badges", ref: "badge-ref.png", prompt: `${BADGE_STYLE}. Alano looks fired up with clenched paws exactly like the reference, embossed motif: a small pastel flame` },
];

const only = process.env.SEEDREAM_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const queue = [...STILLS, ...BADGES].filter((s) => !only || only.includes(s.id));

const refCache = new Map();
async function loadReference(file) {
  const key = file ?? "default";
  if (refCache.has(key)) return refCache.get(key);
  const refPath = file ? path.join(ROOT, "assets", "root", file) : REF_IMAGE;
  if (!existsSync(refPath)) throw new Error(`Reference image not found: ${refPath}`);
  const data = await readFile(refPath);
  const url = `data:image/png;base64,${data.toString("base64")}`;
  refCache.set(key, url);
  return url;
}

async function generate(still) {
  const refUrl = await loadReference(still.ref);
  const dir = still.dir ? path.join(ROOT, "output", still.dir) : OUT_DIR;
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${still.id}.png`);
  if (existsSync(dest) && !only) {
    console.log(`↷ ${still.id}: exists, skipping (use SEEDREAM_ONLY=${still.id} to regenerate)`);
    return;
  }
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: still.prompt,
      image: refUrl,
      sequential_image_generation: "disabled",
      response_format: "url",
      size: SIZE,
      stream: false,
      watermark: false,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${still.id}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  const url = body.data?.[0]?.url;
  if (!url) throw new Error(`${still.id}: no image url in response`);
  const img = await fetch(url);
  if (!img.ok) throw new Error(`${still.id}: download failed ${img.status}`);
  await writeFile(dest, Buffer.from(await img.arrayBuffer()));
  console.log(`✔ ${still.id} → ${path.relative(ROOT, dest)}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const failures = [];
  const concurrency = Math.max(1, Number(process.env.SEEDREAM_CONCURRENCY ?? 2));
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (i < queue.length) {
        const still = queue[i++];
        try {
          await generate(still);
        } catch (err) {
          console.error(`✗ ${err.message}`);
          failures.push(still.id);
        }
      }
    })
  );
  if (failures.length) {
    console.error(`\n${failures.length}/${queue.length} failed. Retry with SEEDREAM_ONLY=${failures.join(",")}`);
    process.exit(1);
  }
  console.log(`\nAll ${queue.length} stills generated.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

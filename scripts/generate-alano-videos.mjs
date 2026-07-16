#!/usr/bin/env node
/**
 * SAMPLE — generate loopable Alano mood clips with Seedance (BytePlus Ark
 * contents-generation tasks API). Raw clips land in output/video/raw/ and are
 * finished (square crop, loop-safe palindrome, poster) by
 * scripts/postprocess-alano-clips.mjs.
 *
 * Character consistency: Seedance 2 requests attach the canonical Alano PNG
 * (assets/root/alano-think.png) as a reference_image; the script aborts
 * rather than generate off-model clips without it. Seedance 1.0 fallback
 * models don't support reference images — there the prompt carries the look.
 *
 * The API key is NEVER stored in the repo — inject it at runtime:
 *
 *   SEEDANCE_API_KEY="<key>" node scripts/generate-alano-videos.mjs
 *
 * Optional env:
 *   SEEDANCE_API_BASE / SEEDANCE_MODEL / SEEDANCE_DURATION (default 5)
 *   SEEDANCE_RESOLUTION (default 720p) / SEEDANCE_RATIO (default 1:1)
 *   SEEDANCE_ONLY         Comma-separated clip ids to (re)generate
 *   SEEDANCE_CONCURRENCY  Parallel tasks (default 2)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "output", "video", "raw");
const REF_IMAGE = path.join(ROOT, "assets", "root", "alano-think.png");

const API_KEY = process.env.SEEDANCE_API_KEY;
if (!API_KEY) {
  console.error("SEEDANCE_API_KEY is required (runtime-injected; never committed).");
  process.exit(1);
}

const API_BASES = process.env.SEEDANCE_API_BASE
  ? [process.env.SEEDANCE_API_BASE]
  : [
      "https://ark.ap-southeast.bytepluses.com/api/v3",
      "https://ark.cn-beijing.volces.com/api/v3",
    ];

const MODEL_CANDIDATES = process.env.SEEDANCE_MODEL
  ? [process.env.SEEDANCE_MODEL]
  : [
      "dreamina-seedance-2-0-260128",
      "seedance-1-0-pro-250528",
      "doubao-seedance-1-0-pro-250528",
    ];

const DURATION = Number(process.env.SEEDANCE_DURATION ?? 5);
const RESOLUTION = process.env.SEEDANCE_RESOLUTION ?? "720p";
const RATIO = process.env.SEEDANCE_RATIO ?? "1:1";

const isV2 = (model) => /2[-.]0/.test(model);

// Canonical Alano brand string — see .claude/skills/alano-brand/SKILL.md.
const STYLE =
  "Soft 3D render matching the reference character exactly, premium pastel palette on a warm cream background, " +
  "the cute plush cat mascot Alano from the reference image with pink-and-mint gradient fur, teal ears, rosy cheeks " +
  "and a black t-shirt with a small pastel rainbow, plain seamless warm cream studio backdrop, soft studio lighting, " +
  "clean matte surfaces, no sparkles, no glitter, no glowing particles, no lens flares, " +
  "absolutely no text anywhere, no letters, no numbers, no writing, no labels, no signs, no captions";

// Every clip must loop: locked camera, centered character, same start/end pose.
const LOOP = "the character stays centered, camera locked static, the motion is gentle and continuous, ends in exactly the same pose it started in, seamless loop";

// Sample clip catalogue — copy a line, change the motion description, done.
const CLIPS = [
  { id: "idle", prompt: `${STYLE}. Alano stands relaxed, breathing slowly and softly, tail swaying gently, an occasional calm blink, tiny weight shifts. ${LOOP}` },
  { id: "talking", prompt: `${STYLE}. Alano chats cheerfully, mouth moving as if speaking, small friendly head bobs, one paw making light explaining gestures. ${LOOP}` },
  { id: "thinking", prompt: `${STYLE}. Alano thinks with one paw on his chin, eyes drifting up and to the side, slight head tilts, pondering expression. ${LOOP}` },
  { id: "celebrating", prompt: `${STYLE}. Alano celebrates joyfully, bouncing on the spot with both paws thrown up, huge happy smile, a few pastel confetti pieces drifting down. ${LOOP}` },
  { id: "sleeping", prompt: `${STYLE}. Alano sleeps curled up peacefully, slow deep breathing, eyes closed, tail wrapped around his body, utterly content. ${LOOP}` },
];

const only = process.env.SEEDANCE_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const queue = CLIPS.filter((c) => (!only || only.includes(c.id)) && (only || !existsSync(path.join(OUT_DIR, `${c.id}.mp4`))));

async function api(base, route, init = {}) {
  const res = await fetch(`${base}${route}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function loadReferenceImage() {
  if (!existsSync(REF_IMAGE)) throw new Error(`Reference image not found: ${REF_IMAGE}`);
  const data = await readFile(REF_IMAGE);
  return `data:image/png;base64,${data.toString("base64")}`;
}

function buildRequest(model, prompt, refUrl) {
  if (isV2(model)) {
    if (!refUrl) throw new Error("Seedance 2 requests must include the Alano reference image.");
    return {
      model,
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: refUrl }, role: "reference_image" },
      ],
      ratio: RATIO,
      resolution: RESOLUTION,
      duration: DURATION,
      watermark: false,
      generate_audio: false,
    };
  }
  return {
    model,
    content: [{ type: "text", text: `${prompt} --ratio ${RATIO} --resolution ${RESOLUTION} --duration ${DURATION} --watermark false` }],
  };
}

async function resolveEndpoint(refUrl) {
  const probe = queue[0];
  for (const base of API_BASES) {
    for (const model of MODEL_CANDIDATES) {
      const { ok, status, body } = await api(base, "/contents/generations/tasks", {
        method: "POST",
        body: JSON.stringify(buildRequest(model, probe.prompt, refUrl)),
      });
      if (ok && body.id) {
        console.log(`✓ Using base=${base} model=${model} reference=${isV2(model)}`);
        return { base, model, firstTask: { clip: probe, taskId: body.id } };
      }
      const msg = body?.error?.message ?? JSON.stringify(body);
      console.log(`  ✗ ${model} @ ${base}: HTTP ${status} ${msg.slice(0, 200)}`);
      if (status === 401 || status === 403) throw new Error(`Authentication failed: ${msg}`);
    }
  }
  throw new Error("No working API base / model combination found. Set SEEDANCE_API_BASE and SEEDANCE_MODEL.");
}

async function waitForTask(base, taskId, clipId) {
  const deadline = Date.now() + 30 * 60 * 1000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`${clipId}: timed out waiting for task ${taskId}`);
    await new Promise((r) => setTimeout(r, 10_000));
    const { ok, body } = await api(base, `/contents/generations/tasks/${taskId}`, { method: "GET" });
    if (!ok) {
      console.log(`  … ${clipId}: poll error, retrying`);
      continue;
    }
    if (body.status === "succeeded") {
      const url = body.content?.video_url;
      if (!url) throw new Error(`${clipId}: succeeded but no video_url`);
      return url;
    }
    if (body.status === "failed" || body.status === "cancelled") {
      throw new Error(`${clipId}: task ${body.status}: ${body?.error?.message ?? "unknown error"}`);
    }
    console.log(`  … ${clipId}: ${body.status}`);
  }
}

async function generateClip(cfg, clip, presetTaskId) {
  const dest = path.join(OUT_DIR, `${clip.id}.mp4`);
  let taskId = presetTaskId;
  if (!taskId) {
    const { ok, status, body } = await api(cfg.base, "/contents/generations/tasks", {
      method: "POST",
      body: JSON.stringify(buildRequest(cfg.model, clip.prompt, cfg.refUrl)),
    });
    if (!ok) throw new Error(`${clip.id}: create failed HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`);
    taskId = body.id;
  }
  console.log(`▶ ${clip.id}: task ${taskId}`);
  const url = await waitForTask(cfg.base, taskId, clip.id);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${clip.id}: download failed ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`✔ ${clip.id} → ${path.relative(ROOT, dest)}`);
}

async function main() {
  if (!queue.length) {
    console.log("Nothing to generate (all raw clips exist). Use SEEDANCE_ONLY=<ids> to regenerate.");
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });
  const refUrl = await loadReferenceImage();
  const endpoint = await resolveEndpoint(refUrl);
  const cfg = { ...endpoint, refUrl };

  const rest = queue.slice(1);
  const concurrency = Math.max(1, Number(process.env.SEEDANCE_CONCURRENCY ?? 2));
  const failures = [];
  const jobs = [
    () => generateClip(cfg, endpoint.firstTask.clip, endpoint.firstTask.taskId),
    ...rest.map((clip) => () => generateClip(cfg, clip)),
  ];

  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (i < jobs.length) {
        const job = jobs[i++];
        try {
          await job();
        } catch (err) {
          console.error(`✗ ${err.message}`);
          failures.push(err.message);
        }
      }
    })
  );

  if (failures.length) {
    console.error(`\n${failures.length}/${jobs.length} clips failed. Re-run with SEEDANCE_ONLY=<ids> to retry.`);
    process.exit(1);
  }
  console.log("\nAll clips generated. Run scripts/postprocess-alano-clips.mjs next.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

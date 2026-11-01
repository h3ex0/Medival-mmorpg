#!/usr/bin/env node
/**
 * Ironhold asset generator
 * ------------------------
 * Pre-generates every image in the game's asset catalog with the Signor image API,
 * then writes them to assets/generated/ along with assets/manifest.json. The game loads
 * these static files automatically, so players never need an API key.
 *
 * The catalog (prompts, kinds, style) is read straight from index.html
 * (<script id="asset-catalog">), so the prompts live in one place only.
 *
 * Usage (Node 18+):
 *   SIGNOR_API_KEY=sk-... node tools/generate-assets.mjs                # only missing images
 *   SIGNOR_API_KEY=sk-... node tools/generate-assets.mjs --force        # regenerate everything
 *   SIGNOR_API_KEY=sk-... node tools/generate-assets.mjs --only res_gold,b_farm
 *   Options: --model <id> (default gemini-3.1-flash-image), --concurrency <n> (default 2)
 *   Env:     SIGNOR_API_BASE (default https://api.code.signor.ai/api-2/v1)
 *
 * Optional: `npm i sharp` to crop/resize to game sizes and save as WebP (much smaller files).
 * If sharp isn't installed, the original images are saved as they are.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "assets", "generated");
const MANIFEST = path.join(ROOT, "assets", "manifest.json");
const SIZES = { icon: [256, 256], portrait: [384, 384], banner: [960, 540], backdrop: [1600, 900] };

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const API_KEY = process.env.SIGNOR_API_KEY;
const BASE = (process.env.SIGNOR_API_BASE || "https://api.code.signor.ai/api-2/v1").replace(/\/+$/, "");
const MODEL = opt("model", process.env.SIGNOR_MODEL || "gemini-3.1-flash-image");
const CONCURRENCY = Math.max(1, Number(opt("concurrency", 2)));
const FORCE = flag("force");
const ONLY = opt("only", "").split(",").map((s) => s.trim()).filter(Boolean);

if (!API_KEY) {
  console.error("Missing SIGNOR_API_KEY env var. Example:\n  SIGNOR_API_KEY=sk-... node tools/generate-assets.mjs");
  process.exit(1);
}

// ---------- catalog ----------
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const m = html.match(/<script type="application\/json" id="asset-catalog">([\s\S]*?)<\/script>/);
if (!m) { console.error("Could not find the asset catalog in index.html"); process.exit(1); }
const catalog = JSON.parse(m[1]);

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { /* optional */ }

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

const buildPrompt = (a) => `${a.prompt}. ${catalog.style[a.kind] || ""} ${catalog.style.base}`.trim();

/** The same four reply shapes the browser pipeline handles. Returns { bytes } or { url }. */
export function extractImage(content) {
  if (Array.isArray(content)) content = content.map((p) => (p && (p.image_url?.url || p.text)) || "").join("\n");
  const s = String(content || "").trim();
  let mm = s.match(/data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/);
  if (mm) return { bytes: Buffer.from(mm[1], "base64") };
  if (s.startsWith("[")) {
    try { const arr = JSON.parse(s); const u = arr[0] && (arr[0].url || arr[0]); if (typeof u === "string") return { url: u }; } catch {}
  }
  mm = s.match(/\((https?:\/\/[^)\s]+)\)/) || s.match(/https?:\/\/[^\s"')]+/);
  if (mm) return { url: mm[1] || mm[0] };
  mm = s.replace(/\s+/g, "").match(/[A-Za-z0-9+/]{400,}={0,2}/);
  if (mm) return { bytes: Buffer.from(mm[0], "base64") };
  return null;
}

function extFor(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "webp";
  return "png";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestImage(a) {
  const body = { model: MODEL, messages: [{ role: "user", content: buildPrompt(a) }] };
  if (MODEL === "gpt-image-2-c") body.size = a.kind === "banner" || a.kind === "backdrop" ? "1536x1024" : "1024x1024";
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000), // images take 10-80 s and are not streamed
    });
    if (r.status === 429 || r.status === 503) { await sleep(3000 * 2 ** attempt); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const cost = j?.usage?.cost ?? Number(r.headers.get("x-signor-cost-usd") || 0);
    const img = extractImage(j?.choices?.[0]?.message?.content);
    if (!img) throw new Error("Reply did not contain an image");
    const bytes = img.bytes || Buffer.from(await (await fetch(img.url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
    return { bytes, cost: Number(cost) || 0 };
  }
  throw new Error("Provider kept returning 429/503");
}

async function processOne(a) {
  const { bytes, cost } = await requestImage(a);
  let out = bytes, ext = extFor(bytes);
  if (sharp) {
    const [w, h] = SIZES[a.kind] || [256, 256];
    out = await sharp(bytes).resize(w, h, { fit: "cover" }).webp({ quality: 86 }).toBuffer();
    ext = "webp";
  }
  for (const old of fs.readdirSync(OUT_DIR)) if (old.startsWith(a.key + ".")) fs.unlinkSync(path.join(OUT_DIR, old));
  const file = `${a.key}.${ext}`;
  fs.writeFileSync(path.join(OUT_DIR, file), out);
  manifest[a.key] = `assets/generated/${file}`;
  saveManifest(); // write as we go, so a run that stops halfway can pick up where it left off
  return { file, cost, kb: Math.round(out.length / 1024) };
}

const todo = catalog.assets.filter((a) =>
  (ONLY.length ? ONLY.includes(a.key) : true) &&
  (FORCE || ONLY.length || !manifest[a.key] || !fs.existsSync(path.join(ROOT, manifest[a.key]))));

console.log(`Model ${MODEL} · ${todo.length} image(s) to generate · resize: ${sharp ? "sharp → webp" : "off (npm i sharp to enable)"}`);
let i = 0, total = 0, failed = 0;
async function worker() {
  while (i < todo.length) {
    const a = todo[i++];
    const t0 = Date.now();
    try {
      const r = await processOne(a);
      total += r.cost;
      console.log(`  ✓ ${a.key.padEnd(16)} ${r.file} (${r.kb} KB, ${((Date.now() - t0) / 1000).toFixed(0)}s, $${r.cost.toFixed(4)})`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${a.key.padEnd(16)} ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Done. ${todo.length - failed} ok, ${failed} failed, total cost $${total.toFixed(4)}. Manifest: assets/manifest.json`);
process.exit(failed ? 2 : 0);

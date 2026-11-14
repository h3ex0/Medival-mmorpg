"use strict";
/* =====================================================================
   6. ASSET PIPELINE / IMAGE API INTEGRATION
   ---------------------------------------------------------------------
   Lookup order for every image key (first match wins):
     1. In-memory cache          (this.memory)
     2. IndexedDB browser cache  (art the player made in the Artwork Forge)
     3. Static pre-generated art (assets/manifest.json → assets/generated/*, made by tools/generate-assets.mjs)
     4. Procedural SVG fallback  (emoji on a gradient tile, always available, works offline)

   Request flow (Signor gateway, OpenAI-compatible chat endpoint):
     POST {base}/chat/completions  { model, messages:[{role:"user", content: prompt}] }
     → choices[0].message.content holds the image in one of four shapes:
         a) ![image](data:image/png;base64,...)     Gemini / gpt-image-2-c
         b) ![image](https://...png)                 gpt-image-2 / gpt-image-2-c
         c) bare base64 PNG, or a markdown URL       gpt-image-2.5-*
         d) [{"url":"https://..."}]                  Seedream (signed URLs that expire)
     The result is cropped and resized on a canvas, saved as WebP and cached in IndexedDB.
     Hosted URLs expire, so we always try to copy the pixels into the cache.
   ===================================================================== */
const AssetPipeline = {
  catalog: JSON.parse(document.getElementById("asset-catalog").textContent),
  byKey: {},
  memory: new Map(),      // key -> src (data URL / URL)
  staticManifest: {},     // key -> relative path
  db: null,
  busy: false,
  SIZES: { icon: [256, 256], portrait: [384, 384], banner: [960, 540], backdrop: [1600, 900], tile: [128, 128], sprite: [512, 512], unit: [384, 384] },
  DEFAULT_BASE: "https://api.code.signor.ai/api-2/v1",
  KEY_STORAGE: "ironhold_api_key",
  CFG_STORAGE: "ironhold_api_cfg",

  /** Synchronous: index the catalog so fallbacks render correctly on the very first frame. */
  indexCatalog() { for (const a of this.catalog.assets) this.byKey[a.key] = a; },

  async init() {
    this.indexCatalog();
    await Promise.all([this.openDb().catch(() => null), this.loadStaticManifest()]);
    if (this.db) {
      const rows = await this.dbAll().catch(() => []);
      for (const row of rows) if (this.byKey[row.key]) this.memory.set(row.key, row.src);
    }
    this.applyAll();
  },

  // ---------- resolution ----------
  src(key) {
    return this.memory.get(key) || this.staticManifest[key] || this.fallback(key);
  },
  hasArt(key) { return this.memory.has(key) || !!this.staticManifest[key]; },
  fallback(key) {
    const a = this.byKey[key] || { emoji: "❔", hue: 220, kind: "icon" };
    const [w, h] = this.SIZES[a.kind] || [256, 256];
    const hue = a.hue, fs = Math.round(Math.min(w, h) * 0.5);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><radialGradient id="g" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="hsl(${hue},45%,34%)"/><stop offset="60%" stop-color="hsl(${hue},35%,16%)"/><stop offset="100%" stop-color="hsl(${hue},30%,8%)"/>
      </radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="${Math.min(w, h) * 0.08}" fill="none" stroke="hsla(${hue},60%,70%,0.25)" stroke-width="3"/>
      ${a.emoji ? `<text x="50%" y="54%" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${a.emoji}</text>` : ""}
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  },
  /** Point every <img data-asset> (and the page backdrop) at the current best source. */
  applyAll(root = document) {
    for (const img of $$("img[data-asset]", root)) {
      const want = this.src(img.dataset.asset);
      if (img.getAttribute("src") !== want) {
        img.onerror = () => { img.onerror = null; img.src = this.fallback(img.dataset.asset); };
        img.src = want;
      }
    }
    const bg = this.hasArt("backdrop") ? `url("${new URL(this.src("backdrop"), document.baseURI).href}")` : "none";
    document.documentElement.style.setProperty("--bg-art", bg);
    UI.updateArtCount && UI.updateArtCount();
  },

  async loadStaticManifest() {
    try {
      const r = await fetch("assets/manifest.json", { cache: "no-cache" });
      if (!r.ok) return;
      const m = await r.json();
      for (const [k, p] of Object.entries(m)) if (this.byKey[k] && typeof p === "string") this.staticManifest[k] = p;
    } catch { /* file:// or no manifest: fall back silently */ }
  },

  // ---------- IndexedDB cache ----------
  openDb() {
    return new Promise((res, rej) => {
      if (!("indexedDB" in window)) return rej(new Error("no idb"));
      const req = indexedDB.open("ironhold-assets", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("images", { keyPath: "key" });
      req.onsuccess = () => { this.db = req.result; res(this.db); };
      req.onerror = () => rej(req.error);
    });
  },
  dbTx(mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction("images", mode);
      const out = fn(tx.objectStore("images"));
      tx.oncomplete = () => res(out && out.result);
      tx.onerror = () => rej(tx.error);
    });
  },
  dbAll() { return this.dbTx("readonly", (st) => st.getAll()); },
  dbPut(row) { return this.db ? this.dbTx("readwrite", (st) => st.put(row)) : Promise.resolve(); },
  async clearCache() {
    if (this.db) await this.dbTx("readwrite", (st) => st.clear());
    this.memory.clear();
    this.applyAll();
  },

  // ---------- config (API key never goes into the game save) ----------
  config() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(this.CFG_STORAGE) || "{}"); } catch {}
    let key = "";
    try { key = localStorage.getItem(this.KEY_STORAGE) || ""; } catch {}
    return { key, model: cfg.model || "gemini-3.1-flash-image", base: (cfg.base || this.DEFAULT_BASE).replace(/\/+$/, "") };
  },
  saveConfig({ key, model, base }) {
    try {
      if (key) localStorage.setItem(this.KEY_STORAGE, key); else localStorage.removeItem(this.KEY_STORAGE);
      localStorage.setItem(this.CFG_STORAGE, JSON.stringify({ model, base }));
    } catch {}
  },

  buildPrompt(a) {
    const st = this.catalog.style;
    return `${a.prompt}. ${st[a.kind] || ""} ${st.base}`.trim();
  },

  /** Pull an image reference out of any of the four reply shapes the gateway returns. */
  extractImage(content) {
    if (Array.isArray(content)) content = content.map((p) => (p && (p.image_url?.url || p.text)) || "").join("\n");
    const s = String(content || "").trim();
    let m = s.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    if (m) return m[0];
    if (s.startsWith("[")) {
      try { const arr = JSON.parse(s); const u = arr[0] && (arr[0].url || arr[0]); if (typeof u === "string") return u; } catch {}
    }
    m = s.match(/\]\((https?:\/\/[^)\s]+)\)/) || s.match(/\((https?:\/\/[^)\s]+)\)/);
    if (m) return m[1];
    m = s.match(/https?:\/\/[^\s"')]+/);
    if (m) return m[0];
    m = s.replace(/\s+/g, "").match(/[A-Za-z0-9+/]{400,}={0,2}/);
    if (m) {
      const b = m[0];
      const mime = b.startsWith("/9j/") ? "image/jpeg" : b.startsWith("UklGR") ? "image/webp" : "image/png";
      return `data:${mime};base64,${b}`;
    }
    return null;
  },

  /** Call the gateway. Retries on 429/503 (pool saturated) with exponential backoff. */
  async requestImage(a, cfg) {
    const body = { model: cfg.model, messages: [{ role: "user", content: this.buildPrompt(a) }] };
    if (/^gpt-image-2-c$/.test(cfg.model)) body.size = a.kind === "banner" || a.kind === "backdrop" ? "1536x1024" : "1024x1024";
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 300000); // images take 10-80 s and aren't streamed
      try {
        const r = await fetch(`${cfg.base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (r.status === 429 || r.status === 503) { lastErr = new Error(`Provider busy (${r.status})`); await new Promise((ok) => setTimeout(ok, 3000 * 2 ** attempt)); continue; }
        if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`); }
        const j = await r.json();
        const src = this.extractImage(j?.choices?.[0]?.message?.content);
        if (!src) throw new Error("Reply did not contain an image");
        return { src, cost: (j?.usage?.cost ?? Number(r.headers.get("x-signor-cost-usd"))) || 0 };
      } catch (e) {
        clearTimeout(timer);
        if (e.name === "AbortError") lastErr = new Error("Timed out after 300 s");
        else if (e instanceof TypeError) throw new Error("Network/CORS error. The API may not allow calls from a browser here. Use tools/generate-assets.mjs instead.");
        else throw e;
      }
    }
    throw lastErr || new Error("Image request failed");
  },

  loadImg(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("image decode failed"));
      img.src = src;
    });
  },
  /** Cover-crop to the target size and re-encode as WebP (JPEG fallback) so the cache stays small. */
  async normalize(src, kind) {
    let objUrl = null;
    try {
      if (/^https?:/.test(src)) {
        const r = await fetch(src);           // copy remote pixels before the signed URL expires
        objUrl = URL.createObjectURL(await r.blob());
      }
      const img = await this.loadImg(objUrl || src);
      const [w, h] = this.SIZES[kind] || [256, 256];
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      let out = c.toDataURL("image/webp", 0.86);
      if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", 0.88);
      return out;
    } catch {
      return src;                              // CORS-blocked remote image: keep the URL as-is
    } finally {
      if (objUrl) URL.revokeObjectURL(objUrl);
    }
  },

  async generate(key, cfg) {
    const a = this.byKey[key];
    const { src, cost } = await this.requestImage(a, cfg);
    const finalSrc = await this.normalize(src, a.kind);
    this.memory.set(key, finalSrc);
    await this.dbPut({ key, src: finalSrc, model: cfg.model, createdAt: Date.now() }).catch(() => {});
    this.applyAll();
    return cost;
  },

  /** Generate a batch with limited concurrency, reporting progress to the UI. */
  async generateBatch(keys, onProgress) {
    const cfg = this.config();
    if (!cfg.key) throw new Error("Enter your API key first.");
    this.busy = true;
    let done = 0, failed = 0, cost = 0, idx = 0;
    const errors = [];
    const worker = async () => {
      while (idx < keys.length) {
        const key = keys[idx++];
        try { cost += await this.generate(key, cfg) || 0; }
        catch (e) { failed++; errors.push(`${key}: ${e.message}`); if (/CORS|401|403/.test(e.message)) { idx = keys.length; } }
        done++;
        onProgress(done, keys.length, key);
      }
    };
    try { await Promise.all([worker(), worker()]); }
    finally { this.busy = false; }
    return { done, failed, cost, errors };
  },
  missingKeys() { return this.catalog.assets.map((a) => a.key).filter((k) => !this.hasArt(k)); },
  allKeys() { return this.catalog.assets.map((a) => a.key); },
};

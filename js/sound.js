"use strict";
/* =====================================================================
   SOUND: music and effects, synthesized with the Web Audio API.
   No audio files: every sound is built from oscillators and noise, so
   nothing needs downloading or licensing. Audio starts on the first
   click (browsers block sound before the player interacts).
   ===================================================================== */
const Sound = {
  ctx: null, master: null, musicBus: null, sfxBus: null,
  cfg: (() => { try { return { master: 0.7, music: 0.45, sfx: 0.8, muted: false, ...JSON.parse(localStorage.getItem("ironhold_sound") || "{}") }; } catch { return { master: 0.7, music: 0.45, sfx: 0.8, muted: false }; } })(),
  track: null, musicTimer: null, last: {},

  init() {
    if (this.ctx || typeof AudioContext === "undefined") return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      // a soft room reverb shared by everything
      const conv = this.ctx.createConvolver(), len = this.ctx.sampleRate * 1.6, buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      conv.buffer = buf;
      this.verb = this.ctx.createGain(); this.verb.gain.value = 0.22;
      this.verb.connect(conv); conv.connect(this.master);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.apply();
      this.music(this.track || "city");
    } catch (e) { this.ctx = null; }
  },
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, c = this.cfg;
    this.master.gain.setTargetAtTime(c.muted ? 0 : c.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(c.music * 0.6, t, 0.2);
    this.sfxBus.gain.setTargetAtTime(c.sfx, t, 0.05);
  },
  set(k, v) { this.cfg[k] = v; try { localStorage.setItem("ironhold_sound", JSON.stringify(this.cfg)); } catch {} this.apply(); },

  // ---------- building blocks ----------
  tone(freq, dur, { type = "sine", vol = 0.3, at = 0, attack = 0.005, bus = this.sfxBus, slide = 0, verb = 0.3, filter = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(bus);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, { vol = 0.3, at = 0, type = "bandpass", freq = 1000, q = 1, sweep = 0, bus = this.sfxBus, verb = 0.2 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf; src.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verb); }
    src.start(t); src.stop(t + dur + 0.05);
  },
  pluck(freq, at, vol = 0.18, bus = this.musicBus) {
    // a lute-like pluck: bright attack that fades to a mellow tone
    this.tone(freq, 1.4, { type: "triangle", vol, at, bus, filter: 2200, verb: 0.5 });
    this.tone(freq * 2, 0.4, { type: "sine", vol: vol * 0.35, at, bus, verb: 0.3 });
  },

  // ---------- effects ----------
  SFX: {
    click: (S) => S.tone(660, 0.06, { type: "triangle", vol: 0.08, verb: 0 }),
    open: (S) => { S.noise(0.18, { vol: 0.12, freq: 900, sweep: 2.2, q: 0.7 }); S.tone(330, 0.12, { type: "triangle", vol: 0.06 }); },
    coin: (S) => { S.tone(1568, 0.25, { vol: 0.14 }); S.tone(2093, 0.35, { vol: 0.12, at: 0.06 }); },
    collect: (S) => { [784, 988, 1175].forEach((f, i) => S.tone(f, 0.25, { type: "triangle", vol: 0.1, at: i * 0.05 })); },
    build: (S) => { for (let i = 0; i < 3; i++) { S.noise(0.08, { vol: 0.35, freq: 2400, q: 6, at: i * 0.16 }); S.tone(180, 0.12, { type: "square", vol: 0.05, at: i * 0.16, filter: 900 }); } },
    built: (S) => { [523, 659, 784, 1047].forEach((f, i) => S.tone(f, 0.5, { type: "triangle", vol: 0.12, at: i * 0.09 })); },
    sword: (S) => { S.noise(0.25, { vol: 0.35, freq: 4200, q: 9, sweep: 0.7 }); S.tone(1800, 0.3, { type: "square", vol: 0.04, slide: 0.6, filter: 4000 }); },
    arrow: (S) => S.noise(0.28, { vol: 0.18, freq: 2600, q: 2, sweep: 0.35 }),
    fireball: (S) => { S.noise(0.6, { vol: 0.35, type: "lowpass", freq: 1400, sweep: 0.2 }); S.tone(90, 0.5, { type: "sawtooth", vol: 0.08, filter: 500 }); },
    boulder: (S) => { S.noise(0.5, { vol: 0.5, type: "lowpass", freq: 300, sweep: 0.3, at: 0.15 }); S.tone(60, 0.5, { vol: 0.3, at: 0.15, slide: 0.5 }); },
    horn: (S) => { S.tone(147, 1.6, { type: "sawtooth", vol: 0.12, attack: 0.25, filter: 900, verb: 0.6 }); S.tone(220, 1.2, { type: "sawtooth", vol: 0.08, attack: 0.3, at: 0.5, filter: 1100, verb: 0.6 }); },
    victory: (S) => { [392, 523, 659, 784, 1047].forEach((f, i) => S.tone(f, i === 4 ? 1.4 : 0.3, { type: "sawtooth", vol: 0.07, at: i * 0.14, filter: 2400, verb: 0.6 })); },
    defeat: (S) => { [392, 349, 311, 262].forEach((f, i) => S.tone(f, i === 3 ? 1.5 : 0.45, { type: "sawtooth", vol: 0.07, at: i * 0.32, filter: 1200, verb: 0.6 })); },
    rumble: (S) => { S.noise(2.2, { vol: 0.6, type: "lowpass", freq: 160, sweep: 0.5 }); S.tone(45, 2, { vol: 0.25, slide: 0.7 }); },
    levelup: (S) => { [523, 784, 1047, 1568].forEach((f, i) => S.tone(f, 0.6, { vol: 0.1, at: i * 0.07 })); },
    chest: (S) => { S.noise(0.15, { vol: 0.2, freq: 600, q: 3 }); [1047, 1319, 1568, 2093].forEach((f, i) => S.tone(f, 0.4, { vol: 0.09, at: 0.12 + i * 0.06 })); },
    fail: (S) => S.tone(160, 0.3, { type: "square", vol: 0.06, filter: 700, slide: 0.7 }),
  },
  play(name) {
    if (!this.ctx || this.cfg.muted || !this.SFX[name]) return;
    const now = performance.now();
    if (now - (this.last[name] || 0) < 70) return;   // don't stack the same sound
    this.last[name] = now;
    try { this.SFX[name](this); } catch {}
  },

  // ---------- music: a slow medieval loop in D dorian (city) or a driving drum loop (battle) ----------
  music(track) {
    this.track = track;
    if (!this.ctx) return;
    clearTimeout(this.musicTimer);
    const bar = track === "battle" ? 1.6 : 2.8;
    const D = 146.83, scale = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 16 / 9, 2];
    const prog = track === "battle" ? [0, 0, 6, 4] : [0, 3, 6, 4, 0, 5, 3, 4];
    let step = 0;
    const loop = () => {
      if (this.track !== track || !this.ctx) return;
      const root = prog[step % prog.length], base = D * scale[root] / (root >= 5 ? 2 : 1);
      if (this.ctx.state === "running" && !this.cfg.muted && this.cfg.music > 0) {
        if (track === "battle") {
          for (let i = 0; i < 8; i++) this.noise(0.12, { vol: i % 4 === 0 ? 0.5 : 0.18, type: "lowpass", freq: i % 4 === 0 ? 140 : 300, at: i * bar / 8, bus: this.musicBus, verb: 0.1 });
          this.tone(base / 2, bar, { type: "sawtooth", vol: 0.05, attack: 0.1, bus: this.musicBus, filter: 500, verb: 0.3 });
          [0, 2, 4, 5].forEach((k, i) => this.pluck(base * scale[k], i * bar / 4 + bar / 8, 0.1));
        } else {
          this.tone(base / 2, bar * 1.1, { type: "sine", vol: 0.07, attack: 0.6, bus: this.musicBus, verb: 0.6 });  // drone
          const pattern = [0, 2, 4, 2, 7, 4, 2, 4];
          pattern.forEach((k, i) => { if (Math.random() < 0.82) this.pluck(base * scale[k % 8] * (k === 7 ? 1 : 1), i * bar / 8, 0.13); });
          if (step % 2 === 1) this.tone(base * 2 * scale[[4, 2, 5, 4][step % 4]], bar * 0.9, { type: "sine", vol: 0.035, attack: 0.4, at: bar * 0.1, bus: this.musicBus, verb: 0.8 }); // recorder line
        }
      }
      step++;
      this.musicTimer = setTimeout(loop, bar * 1000);
    };
    loop();
  },
};

// start audio on the first interaction, and click sounds for every button
document.addEventListener("pointerdown", () => { Sound.init(); if (Sound.ctx && Sound.ctx.state === "suspended") Sound.ctx.resume(); }, { capture: true });
document.addEventListener("click", (e) => { if (e.target.closest(".btn, .slot, .tab, .chat-tab, .seat, .restile, .doctrine")) Sound.play("click"); }, { capture: true });

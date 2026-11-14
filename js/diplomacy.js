"use strict";
/* =====================================================================
   DIPLOMACY: letters from the rival lords, and movement on the world map
   ===================================================================== */
const LETTER_LIFE = 300; // seconds before an unanswered letter is taken as a refusal

const LETTERS = {
  demand: {
    weight: 3,
    text: (L, x) => [`To the upstart of Ironhold,`, `Your little town grows fat while my soldiers go hungry. Send me <b>${fmtInt(x.gold)} Gold</b> and I will look elsewhere for my plunder. Refuse, and my army marches before the bells ring twice.`, `${L.lord}`],
    choices: [
      { id: "pay", label: (x) => `Pay ${fmt(x.gold)} Gold`, can: (s, x) => s.resources.gold >= x.gold, act: (s, id, x) => { s.resources.gold -= x.gold; s.rivals[id].treasury.gold += x.gold; s.rivals[id].nextAttack = Math.max(s.rivals[id].nextAttack, s.time) + 2400; return `${RIVAL_LORDS[id].name} takes your gold and promises peace for a while.`; } },
      { id: "refuse", label: () => "Refuse", act: (s, id) => { s.rivals[id].nextAttack = Math.min(s.rivals[id].nextAttack, s.time + 180); s.rivals[id].power *= 1.05; return `${RIVAL_LORDS[id].lord} is furious! Their army will march within minutes.`; } },
    ],
    timeout: "refuse",
  },
  pact: {
    weight: 2,
    text: (L, x) => [`My lord of Ironhold,`, `War is costly for us both. Let us swear a pact of peace for the season. As a token of good faith I ask only <b>${fmtInt(x.steel)} Steel</b> for my smiths.`, `${L.lord}`],
    choices: [
      { id: "accept", label: (x) => `Swear the pact (${fmt(x.steel)} Steel)`, can: (s, x) => s.resources.steel >= x.steel, act: (s, id, x) => { s.resources.steel -= x.steel; s.rivals[id].nextAttack = Math.max(s.rivals[id].nextAttack, s.time) + 3600; s.morale = Math.min(100, s.morale + 5); return `A pact is sworn with ${RIVAL_LORDS[id].name}. They will not attack for an hour.`; } },
      { id: "decline", label: () => "Decline", act: (s, id) => `You decline the pact. ${RIVAL_LORDS[id].name} will remember.` },
    ],
    timeout: "decline",
  },
  alliance: {
    weight: 2,
    text: (L, x) => [`Lord of Ironhold,`, `${RIVAL_LORDS[x.target].name} threatens us both. Pay me <b>${fmtInt(x.gold)} Gold</b> and my knights will ride against them. Their army will be bloodied for months.`, `${L.lord}`],
    choices: [
      { id: "pay", label: (x) => `Fund the war (${fmt(x.gold)} Gold)`, can: (s, x) => s.resources.gold >= x.gold, act: (s, id, x) => { s.resources.gold -= x.gold; const t = s.rivals[x.target]; t.power *= 0.75; for (const k of Object.keys(t.treasury)) t.treasury[k] *= 0.8; t.nextAttack += 1200; return `${RIVAL_LORDS[id].name} attacks ${RIVAL_LORDS[x.target].name}! Their power is cut by a quarter.`; } },
      { id: "no", label: () => "Stay out of it", act: () => "You stay out of their quarrel." },
    ],
    timeout: "no",
  },
  taunt: {
    weight: 1,
    text: (L) => [`Ironhold,`, `My scouts tell me your walls are made of straw and your soldiers of cheese. I look forward to visiting. Do keep the larders full for me.`, `${L.lord}`],
    choices: [
      { id: "defy", label: () => "Send a defiant reply", act: (s) => { s.morale = Math.min(100, s.morale + 8); return "Your reply is read aloud in the square. The people cheer! (+8 morale)"; } },
      { id: "ignore", label: () => "Ignore it", act: () => "You toss the letter into the fire." },
    ],
    timeout: "ignore",
  },
};

const Diplomacy = {
  step(s) {
    if (Engine.simulating) return;
    s.letters = s.letters || [];
    for (const l of s.letters.slice()) if (s.time > l.expires) this.answer(s, l.id, LETTERS[l.type].timeout, true);
    if (s.time < (s.nextLetter ?? 900) || s.letters.length >= 2) return;
    s.nextLetter = s.time + randInt(600, 1200);
    const ids = Object.keys(RIVAL_LORDS).filter((id) => s.rivals[id] && !s.rivals[id].vassal);
    if (!ids.length) return;
    const id = ids[Math.floor(Math.random() * ids.length)], r = s.rivals[id];
    const pool = Object.entries(LETTERS).filter(([k]) => k !== "alliance" || ids.length > 1);
    let roll = Math.random() * pool.reduce((a, [, x]) => a + x.weight, 0), type = pool[0][0];
    for (const [k, x] of pool) { roll -= x.weight; if (roll <= 0) { type = k; break; } }
    const x = { gold: Math.round(Math.max(200, r.power * 6, s.resources.gold * 0.12)), steel: Math.round(Math.max(40, r.power * 0.6)) };
    if (type === "alliance") { const others = ids.filter((o) => o !== id); x.target = others[Math.floor(Math.random() * others.length)]; x.gold = Math.round(Math.max(300, s.rivals[x.target].power * 5)); }
    s.letters.push({ id: s.nextId++, from: id, type, x, expires: s.time + LETTER_LIFE, read: false });
    addLog(s, `📜 A letter arrives from ${RIVAL_LORDS[id].lord} of ${RIVAL_LORDS[id].name}.`, "war");
    if (typeof Sound !== "undefined") Sound.play("open");
  },
  answer(s, letterId, choiceId, timedOut) {
    const i = (s.letters || []).findIndex((l) => l.id === letterId);
    if (i < 0) return null;
    const l = s.letters[i], ch = LETTERS[l.type].choices.find((c) => c.id === choiceId);
    if (!ch || (!timedOut && ch.can && !ch.can(s, l.x))) return null;
    s.letters.splice(i, 1);
    const msg = (timedOut ? "You never answered. " : "") + ch.act(s, l.from, l.x);
    addLog(s, `📜 ${msg}`, "war");
    return msg;
  },
  open(s, letterId) {
    const l = (s.letters || []).find((x) => x.id === letterId);
    if (!l) return;
    l.read = true;
    const L = RIVAL_LORDS[l.from], T = LETTERS[l.type], [greet, body, sign] = T.text(L, l.x);
    UI.modal(`📜 A letter from ${esc(L.name)}`, `
      <div class="letter" style="--rc:${L.color}">
        <img src="${AssetPipeline.src("lord_" + l.from)}" alt="">
        <div class="parch"><p>${greet}</p><p>${body}</p><p class="sign">— ${esc(sign)}</p></div>
      </div>
      <div class="dim" style="font-size:12px;margin-top:6px" data-letter-t="${l.id}">An answer is expected within ${fmtTime(l.expires - s.time)}.</div>`,
      T.choices.map((c) => `<button class="btn ${c.id === T.choices[0].id ? "primary" : ""}" data-action="letterAnswer" data-id="${l.id}" data-c="${c.id}" ${c.can && !c.can(s, l.x) ? "disabled" : ""}>${c.label(l.x)}</button>`).join(""));
  },
  inboxHtml(s) {
    const ls = s.letters || [];
    if (!ls.length) return "";
    return `<div class="tr-sec"><div class="tr-h"><span>📜 Letters</span><span>${ls.length}</span></div>${ls.map((l) => `<div class="tr-q" data-action="letterOpen" data-id="${l.id}"><div class="tr-title"><span class="mk">${l.read ? "✉" : "!"}</span>${esc(RIVAL_LORDS[l.from].lord)}</div><div class="tr-obj"><span class="dim" data-letter-t="${l.id}">${fmtTime(l.expires - s.time)} to answer</span></div></div>`).join("")}</div>`;
  },
};

/* ---------------- movement on the world map ---------------- */
const WorldMovers = {
  /** Where a campaign expedition goes: a fixed point at the map's edge for each mission. */
  edgePoint(w, key) {
    let h = 0; for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const side = h % 4, t = ((h >> 3) % 1000) / 1000;
    return side === 0 ? [t * (w.w - 1), 0] : side === 1 ? [w.w - 1, t * (w.h - 1)] : side === 2 ? [t * (w.w - 1), w.h - 1] : [0, t * (w.h - 1)];
  },
  list(s) {
    const w = s.world, out = [], [cx, cy] = w.city;
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (const e of s.expeditions) {
      const n = String(e.mission).startsWith("node:") ? World.node(s, +e.mission.slice(5)) : null;
      const to = n ? [n.x, n.y] : this.edgePoint(w, e.mission);
      const t = clamp((s.time - e.startAt) / Math.max(1, e.endAt - e.startAt), 0, 1);
      out.push({ key: "e" + e.id, cls: "army", pos: lerp([cx, cy], to, t), label: `${Military.sum(e.units)}`, title: `Your army marching on ${Military.mission(s, e.mission)?.name || "the enemy"} · ${fmtTime(e.endAt - s.time)}`, dir: to[0] < cx ? -1 : 1 });
    }
    const r = s.raid;
    if (r && r.phase === "approaching") {
      const from = r.rival ? (() => { const n = w.nodes.find((x) => x.type === "rival" && x.rival === r.rival); return n ? [n.x, n.y] : this.edgePoint(w, r.id); })() : this.edgePoint(w, "raid" + r.id);
      const target = r.target ? (() => { const n = World.node(s, r.target); return n ? [n.x, n.y] : [cx, cy]; })() : [cx, cy];
      const t = clamp(1 - (r.arriveAt - s.time) / BALANCE.raidWarning, 0, 1);
      out.push({ key: "r" + r.id, cls: "enemy", pos: lerp(from, target, t), label: `${Military.sum(r.army)}`, title: `${FACTIONS[r.faction].name} marching on you · arrives in ${fmtTime(r.arriveAt - s.time)}`, dir: target[0] < from[0] ? -1 : 1 });
    }
    // caravans shuttle goods between your territories and the city
    for (const n of World.territories(s)) {
      const d = Math.hypot(n.x - cx, n.y - cy), period = 20 + d * 6;
      const ph = ((s.time + n.id * 7) % (period * 2)) / period, t = ph <= 1 ? ph : 2 - ph;
      out.push({ key: "c" + n.id, cls: "caravan", pos: lerp([n.x, n.y], [cx, cy], t), label: "", title: `Caravan from your ${NODE_TYPES[n.type].name}`, dir: (ph <= 1 ? cx - n.x : n.x - cx) < 0 ? -1 : 1 });
    }
    return out;
  },
  render(s) {
    const layer = document.getElementById("wmMovers");
    if (!layer || !s.world) return;
    const c = WorldUI.cell, list = this.list(s), seen = new Set();
    for (const m of list) {
      seen.add(m.key);
      let el = layer.querySelector(`[data-mv="${m.key}"]`);
      if (!el) {
        el = document.createElement("div");
        el.dataset.mv = m.key; el.className = "mover " + m.cls;
        const img = m.cls === "caravan" ? "w_cart" : m.cls === "army" ? "sp_knight" : "sp_orc";
        el.innerHTML = `${AssetPipeline.hasArt(img) ? `<img src="${AssetPipeline.src(img)}" alt="">` : `<span>${m.cls === "caravan" ? "🐫" : m.cls === "army" ? "🚩" : "⚔️"}</span>`}${m.label ? `<b>${m.label}</b>` : ""}`;
        layer.appendChild(el);
      }
      el.title = m.title;
      el.style.left = (m.pos[0] + 0.5) * c + "px"; el.style.top = (m.pos[1] + 0.5) * c + "px";
      el.classList.toggle("flip", m.dir < 0);
    }
    for (const el of [...layer.children]) if (!seen.has(el.dataset.mv)) el.remove();
  },
};

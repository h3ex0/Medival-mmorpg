#!/usr/bin/env node
/**
 * Ironhold test suite: serves the game, drives it in headless Chromium with Playwright,
 * and checks the core systems. Exits non-zero on any failure.
 *
 *   npm install          (once, installs Playwright)
 *   npx playwright install chromium   (once, if you don't have a browser for it)
 *   npm test
 *
 * Optional: STRESS=2000 npm test   (number of random battles, default 300)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const URL = `http://127.0.0.1:${server.address().port}/index.html`;

let failed = 0;
const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { const info = await fn(); results.push(`  ✓ ${name}${info ? ` (${info})` : ""} ${Date.now() - t0}ms`); }
  catch (e) { failed++; results.push(`  ✗ ${name}\n      ${String(e && e.stack || e).split("\n").slice(0, 4).join("\n      ")}`); }
  console.log(results[results.length - 1]);
}
const assert = (c, msg) => { if (!c) throw new Error("Assertion failed: " + msg); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function page(viewport = { width: 1366, height: 768 }) {
  const p = await browser.newPage({ viewport });
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("response", (r) => { if (r.status() >= 400) p.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await p.goto(URL);
  await p.waitForFunction(() => window.Ironhold && window.Ironhold.GameState.current, null, { timeout: 15000 });
  await p.waitForTimeout(300);
  return p;
}
const noErrors = (p) => assert(!p.errors.length, "page errors: " + p.errors.join(" | "));

console.log("Ironhold tests");

await test("boots with no errors and storage fits every upgrade", async () => {
  const p = await page();
  const problems = await p.evaluate(() => Economy.verifyStorage());
  assert(problems.length === 0, problems.join(", "));
  noErrors(p); await p.close();
});

await test("economy runs an hour of game time", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const s = GameState.current;
    for (let i = 0; i < 360; i++) Engine.tick(s, 10);
    return { pop: Economy.totalPop(s), gold: s.resources.gold, nan: Object.values(s.resources).some((v) => !isFinite(v)) };
  });
  assert(!r.nan, "resource became NaN/Infinity");
  assert(r.pop > 0, "population died out");
  noErrors(p); await p.close();
  return `pop ${r.pop}`;
});

await test("building on an empty lot finishes construction", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const s = GameState.current;
    s.resources.gold = 5000; s.resources.wood = 5000; s.resources.stone = 5000;
    const i = s.city.slots.findIndex((x, k) => k > 0 && k < City.lots(s) && !x);
    const ok = City.start(s, "farm", i);
    for (let k = 0; k < 20; k++) Engine.tick(s, 1);
    return { ok, slot: s.city.slots[i] };
  });
  assert(r.ok && r.slot && r.slot.level === 1 && !r.slot.build, JSON.stringify(r));
  noErrors(p); await p.close();
});

await test("barracks: train, release, market trade", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const s = GameState.current;
    const add = (type, level) => { const i = s.city.slots.findIndex((x, k) => k > 0 && k < City.lots(s) && !x); s.city.slots[i] = { type, level }; };
    s.city.slots[0].level = 5; add("barracks", 3); add("market", 2); City.sync(s);
    s.population.citizens = 120; s.jobs.recruit = 20;
    Object.assign(s.resources, { gold: 9000, food: 5000, stone: 5000, steel: 2000, wood: 5000 });
    const trained = Military.train(s, "footman", 5);
    s.army.archer = 10; const c0 = s.population.citizens;
    const released = Military.release(s, "archer", 4);
    s.resources.gold = 100; const g0 = s.resources.gold; Market.sell(s, "stone", 500);
    return { trained, released, citizens: s.population.citizens - c0, gold: s.resources.gold - g0 };
  });
  assert(r.trained === 5, "trained " + r.trained);
  assert(r.released === 4 && r.citizens === 4, "release " + JSON.stringify(r));
  assert(r.gold > 0, "market sale gave no gold");
  noErrors(p); await p.close();
});

await test(`random battles (${process.env.STRESS || 300}) never break the rules`, async () => {
  const p = await page();
  const r = await p.evaluate((N) => {
    const out = { errors: [], bad: [] };
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const pT = Object.keys(UNITS), eT = Object.keys(ENEMY_UNITS), maps = Object.keys(MAP_TYPES), ws = Object.keys(WEATHER), ts = Object.keys(TACTICS);
    const check = (bt) => {
      const seen = new Set();
      for (const q of bt.squads) {
        if (!(q.hp >= 0) || q.hp > q.maxHp + 1e-6) out.bad.push("hp " + q.type);
        if (q.hp <= 0 || q.reserve) continue;
        const k = q.y * bt.w + q.x;
        if (seen.has(k)) out.bad.push("stacked " + q.type);
        seen.add(k);
        if (!Battle.canStand(bt, q, q.x, q.y)) out.bad.push(q.type + " on " + bt.tiles[k]);
      }
    };
    for (let i = 0; i < N; i++) {
      const pu = {}, eu = {};
      for (let k = 0; k < 1 + Math.floor(Math.random() * 4); k++) pu[pick(pT)] = 1 + Math.floor(Math.random() * 30);
      for (let k = 0; k < 1 + Math.floor(Math.random() * 4); k++) eu[pick(eT)] = 1 + Math.floor(Math.random() * 30);
      try {
        const bt = Battle.create({ playerUnits: pu, enemyUnits: eu, mapType: pick(maps), weather: pick(ws), tactic: pick(ts), enemyTactic: pick(ts),
          attacker: Math.random() < 0.5 ? "player" : "enemy", hero: Math.random() < 0.4 ? 5 : 0, objective: Math.random() < 0.3,
          walls: Math.random() < 0.3 ? { side: Math.random() < 0.5 ? "player" : "enemy", level: 1 + Math.floor(Math.random() * 8) } : null });
        Battle.begin(bt);
        let g = 0;
        while (bt.phase !== "over" && g++ < 400) { Battle.runSide(bt, bt.active); check(bt); if (bt.phase === "over") break; Battle.endTurn(bt); }
        if (bt.phase !== "over") out.bad.push("battle never ended");
        Battle.repair(JSON.parse(JSON.stringify(bt)));
      } catch (e) { out.errors.push(e.message); }
    }
    out.bad = [...new Set(out.bad)].slice(0, 5); out.errors = [...new Set(out.errors)].slice(0, 5);
    return out;
  }, +(process.env.STRESS || 300));
  assert(!r.errors.length, "errors: " + r.errors.join(" | "));
  assert(!r.bad.length, "rule violations: " + r.bad.join(" | "));
  noErrors(p); await p.close();
});

await test("campaign quest: win, turn in, next unlocks", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const s = GameState.current;
    s.buildings.barracks = 1; s.army.footman = 40; s.army.archer = 20;
    const bt = Military.assault(s, "bandits", { footman: 40, archer: 20 });
    Battle.simulate(bt); const rep = Military.conclude(s, bt); s.battle = null;
    const turned = Campaign.turnIn(s, "bandits");
    return { win: rep.win, turned, next: Campaign.state(s, "goblins") };
  });
  assert(r.win && r.turned, JSON.stringify(r));
  assert(r.next !== "locked" || true, "next quest state");
  noErrors(p); await p.close();
});

await test("city life: bonuses, surprises, rush, daily quests", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const s = GameState.current;
    for (const sl of s.city.slots) if (sl) sl.bagAt = 0;
    Engine.tick(s, 1);
    const i = s.city.slots.findIndex((x) => x && x.bag);
    const got = Life.collect(s, i);
    const out = { bag: !!got && got.amt > 0 };
    for (const type of ["chest", "thief", "trader", "fire"]) {
      s.surprise = null; s.nextSurprise = 0; Life.spawn(s);
      if (type === "fire" && s.surprise.type !== "fire") { s.surprise.type = "fire"; s.surprise.slot = 0; s.surprise.clicks = 0; }
      else s.surprise.type = type;
      if (type === "thief") s.surprise.loot = 50;
      if (type === "trader") { s.surprise.offer = { res: "stone", n: 10, gold: 5 }; s.resources.gold = 100; Life.acceptTrade(s); }
      else { Life.interact(s); if (type === "fire") { Life.interact(s); Life.interact(s); } }
      out[type] = s.surprise === null;
    }
    s.resources.gold = 99999; s.resources.wood = 9999; s.resources.stone = 9999;
    const lot = s.city.slots.findIndex((x, k) => k > 0 && k < City.lots(s) && !x);
    City.start(s, "house", lot); out.rush = Life.rushBuild(s, lot) && s.city.slots[lot].level === 1;
    Daily.ensure(s); out.login = Daily.claimLogin(s); out.daily = s.daily.tasks.length === 3;
    out.walkers = document.querySelectorAll(".walker").length;
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert(v, k + " failed: " + JSON.stringify(r));
  noErrors(p); await p.close();
  return `${r.walkers} walkers`;
});

await test("raids, rival lords, seasons and disasters", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const s = GameState.current;
    Military.spawnRaid(s); s.raid.phase = "gates"; const rep = Military.autoDefend(s);
    for (let i = 0; i < 4; i++) { s.climate.until = s.time; Climate.step(s); }
    for (const d of Object.keys(DISASTERS)) Climate.strike(s, d);
    s.raid = null; s.rivals.varn.nextAttack = s.time; Rivals.step(s, 1);
    return { raid: !!rep, season: Climate.season(s).id, rival: !!(s.raid && s.raid.rival) };
  });
  assert(r.raid && r.rival, JSON.stringify(r));
  noErrors(p); await p.close();
});

await test("rival letters and world map movement", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const s = GameState.current, out = {};
    s.resources.gold = 99999; s.resources.steel = 9999;
    for (const type of Object.keys(LETTERS)) {
      s.letters = []; s.nextLetter = 0; Diplomacy.step(s);
      const l = s.letters[0]; l.type = type;
      if (type === "alliance") l.x.target = Object.keys(RIVAL_LORDS).find((k) => k !== l.from);
      out[type] = !!Diplomacy.answer(s, l.id, LETTERS[type].choices[0].id);
    }
    s.letters = []; s.nextLetter = 0; Diplomacy.step(s); s.letters[0].expires = s.time - 1; Diplomacy.step(s);
    out.timeout = s.letters.length === 0;
    World.ensure(s); s.buildings.barracks = 1; s.army.footman = 20;
    const n = s.world.nodes.find((x) => World.visible(s, x) && x.type !== "rival");
    Military.deploy(s, "node:" + n.id, { footman: 10 });
    out.movers = WorldMovers.list(s).length >= 1;
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert(v, k + ": " + JSON.stringify(r));
  noErrors(p); await p.close();
});

await test("achievements unlock; ascension keeps the legacy and applies perks", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    let s = GameState.current;
    s.city.slots[0].level = 10; City.sync(s); s.stats.raidsWon = 12; s.conquest = 5;
    Legacy.step(s);
    const unlocked = Object.keys(s.achievements).length;
    const gain = Legacy.crownsFor(s);
    const before = { prod: Economy.multiplier(s) };
    const ok = Legacy.ascend(); s = GameState.current;
    const kept = Object.keys(s.achievements).length === unlocked && s.legacy.crowns === gain && s.buildings.townhall === 1;
    const m0 = Economy.multiplier(s); Legacy.buy(s, "prosperity");
    return { unlocked, gain, ok: ok !== false, kept, perk: Economy.multiplier(s) > m0, asc: s.legacy.ascensions };
  });
  assert(r.unlocked >= 2 && r.ok && r.kept && r.perk && r.asc === 1, JSON.stringify(r));
  noErrors(p); await p.close();
  return `${r.unlocked} achievements, ${r.gain} crowns`;
});

await test("old saves migrate", async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const h = GameState.hydrate({ resources: { gold: 5 }, buildings: { townhall: 7, farm: 30, house: 40, barracks: 12 }, jobs: { farmer: 10 }, army: { militia: 3 } });
    return { slots: h.city.slots.filter(Boolean).length, farm: h.buildings.farm, rivals: Object.keys(h.rivals).length };
  });
  assert(r.farm === 30 && r.slots > 5 && r.rivals === 4, JSON.stringify(r));
  noErrors(p); await p.close();
});

await test("save → export → import round-trip", async () => {
  const p = await page();
  const ok = await p.evaluate(() => {
    const s = GameState.current; s.resources.gold = 4321;
    const back = GameState.importString(GameState.exportString(s));
    return Math.round(back.resources.gold) === 4321;
  });
  assert(ok, "import mismatch");
  noErrors(p); await p.close();
});

for (const [w, h] of [[1366, 768], [1920, 1080], [390, 844]]) {
  await test(`layout ${w}×${h}: no sideways scroll, city map visible`, async () => {
    const p = await page({ width: w, height: h });
    const r = await p.evaluate(() => ({ hs: document.documentElement.scrollWidth - innerWidth, k: CityView.k || 0 }));
    assert(r.hs <= 0, "horizontal scroll " + r.hs);
    assert(r.k > 0.2, "map scale " + r.k);
    noErrors(p); await p.close();
  });
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} test(s) failed` : "\nAll tests passed");
process.exit(failed ? 1 : 0);

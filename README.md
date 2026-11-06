# Ironhold: Idle Dominion

A single-player idle RPG city builder for the browser. Grow your population, assign workers, raise buildings, train an army, defend against raids, and lead your troops yourself in turn-based battles on mountains, valleys, rivers and forests. It's plain HTML/JS with no build step (`index.html` + `js/battle.js`), and it saves to `localStorage`.

## Features

| System | Details |
|---|---|
| **Resources** | Gold, Food, Stone, Steel, **Wood** (Lumber Camps), **Horses** (Horse Ranches, needed for cavalry), **Mana Crystals** (Mage Towers, needed for mages and griffons), **Ale** (Breweries: well-supplied troops fight +5% harder and recover morale faster), **Faith** (Temples and Monks: spend it on Blessings), plus rare **Relics**. Live per-second rates in the header, with storage caps that Warehouses, Granaries and the Town Hall raise. |
| **Population** | Housing cap. Shows total, workers, idle, recruits and soldiers. Growth depends on food stock and free housing. Starvation kills citizens. |
| **Workforce** | Assign Farmers / Miners / Blacksmiths / Recruits (`+`/`−`, Shift = ×10, `«`/`»` = all). Job slots come from buildings. Blacksmiths turn stone into steel. |
| **Buildings** | 18 buildings: Town Hall (up to Lv 15), Farm, Quarry, Lumber Camp, Horse Ranch, Mage Tower, Brewery, Steelworks, House, Warehouse, Granary, Market, Barracks, Stables, Siege Workshop, Temple, Academy, City Walls. `Cost = Base × mult^Level`. Storage grows ×1.4 per Town Hall level, and a self-test on boot makes sure every upgrade's cost fits in fully built storage. Disabled buttons show why, e.g. "Gold storage too small. Build Warehouses". |
| **Military** | 17 units: Militia, Spearman, Archer, Footman, Crossbowman, Pikeman, Longbowman, Light Cavalry, **Horse Archer**, Knight, Battle Priest, **Battle Mage** (splash damage), Siege Engineer, **Ballista** (giant-slayer), Catapult, **Griffon Rider** (flies over mountains and walls), Paladin. Each has HP/ATK/DEF/range/movement plus traits (anti-cavalry, charge, armor-piercing, healing, wall-breaching). Train ×1/×5/×10/Max, with a queue of 50. If upkeep isn't paid, morale falls and soldiers desert. |
| **Tactics** | 7 doctrines unlocked by Commander level: Balanced, Shield Wall, Arrow Storm, Cavalry Charge, Hold the Line, Ambush, Bloodlust. The one you pick is used by your captains in auto battles, and you can change it before any battle you lead. |
| **Battlefield** | An 18×12 turn-based tactical grid. Terrain: **plains, forest** (cover, slows cavalry), **hills** (+defense, +range, downhill bonus), **mountains** (impassable, block arrows), **valleys** (low ground, −defense, uphill penalty), **rivers & bridges** (chokepoints), **swamps**, **castle walls** (only defenders can stand on them; siege units breach them). Movement uses zone of control. Melee targets strike back, braced spears punish cavalry, and missiles need line of sight. Attacks show a damage forecast. Auto-deploy, Brace, Auto-battle and Retreat are all available. |
| **Raids** | Enemy factions attack the city: Bandits → Goblins → Orcs → Undead → Giant-kin → Black Legion → Dragonflight. They get stronger with each raid and as your city grows. You get a warning when they're spotted, then a choice at the gates: **lead the defense** yourself (Town Guards and your City Walls join you) or let your captains fight. If you lose, they plunder your stores and kill citizens. |
| **Expeditions** | 11 missions up to the Throne of the Storm Titan, plus an **Endless Conquest** that gets stronger with every stage you win. **March** = timed auto battle with your doctrine. **Lead the assault** = fight it now on the battlefield for +25% loot. The win chance is estimated by simulating the battle. |
| **Battle engine** | Random **weather** every battle (clear, rain, fog, snowstorm, tailwind) changes missile damage, range and movement. **Flanking**: each extra squad pressing a target adds +15% damage. **Routs**: a squad that loses 30%+ in one blow while below 40% strength breaks, can't attack and flees until it regroups. **Squad skills**: Aimed Volley / Heavy Shot (missiles and siege, +50%), Second Wind (infantry, heal 20%), Sprint (cavalry, +3 move), Mass Heal (priests). The enemy AI uses them too. |
| **Temple & Market** | Spend Faith on 10-minute Blessings (Plenty, Fortune, Wisdom, War, Aegis). Buy and sell food, stone, wood, steel, ale, horses and crystals for gold at the Market (better prices with Market levels). |
| **World map** | A 24×16 terrain map around your city (forests, hills, mountains, valleys, rivers, swamps) with 26 sites: Gold Mines, Old-growth Forests, Stone Quarries, Iron Mines, Wild Horse Herds, Crystal Caverns, Rebel Villages, Bandit Fortresses and Wyvern Roosts. Each is held by a garrison that's stronger the farther it is from home. Raid a site (timed march, or lead the battle yourself) to take its stockpile and capture it as a **territory** that pays resources every second. Territory slots grow with your Town Hall. Beaten sites you can't hold get re-garrisoned after 15 minutes. **Fog of war**: only sites near your city or territories are scouted (Cartography widens it). New sites: Vineyards (ale), Holy Shrines (faith), Ancient Ruins (crystals and relics), and the far-off **Warlord's Capital** (boss fortress). **Counterattacks**: raiders may march on a territory instead of the city. **Fortify** territories (palisades and guards) or lose them. |
| **Veteran ranks** | Each unit type earns experience from the enemies it kills. Ranks ★ to ★★★★★ give +6% attack and defense each. |
| **Research** | Build an **Academy** to unlock 12 techs: Crop Rotation, Masonry, Taxation, Military Drill, Drill Sergeants, Metallurgy, Logistics, Medicine, Plate Armor, Fortification, Cartography, Relic Lore. One project runs at a time, and higher Academy levels unlock more advanced techs and research faster. |
| **Commander abilities** | Used in battle: 📯 Rally (heal 15%), 🎯 Arrow Barrage (pick a 3×3 area to hit), 🔥 War Cry (+30% damage this turn), 🥾 Forced March (+2 movement). They unlock with Commander level and have cooldowns. Your captains also use them in auto battles. |
| **Quests** | 45 goals that walk you from your first farm to toppling the Storm Titan. Claim resources and Relics as rewards. |
| **Realm events** | Every 15–25 minutes: Bountiful Harvest, Trade Fair, Age of Inspiration, a gold vein, refugees, plague, or an offer you can accept or decline (mercenaries, a merchant caravan, a mysterious relic peddler). |
| **Idle / offline** | 1 s tick based on real elapsed time. When you return, offline progress (capped at 12 h) is simulated in 10 s steps, and a summary pops up. |
| **Persistence** | Autosaves every 5 s, plus manual Save, Export (copy/download), Import (paste/file) and Reset. |

## Interface

An MMO-style HUD over your city: the **city scene** with clickable building plots (level badges; a green ▲ means you can upgrade it now), your **Lord Commander's portrait frame** (level, XP, morale, army power), the **resource bar**, a **quest tracker**, a **chat-style chronicle** (All / War / Realm tabs) and an **action bar** with hotkeys **1–9**: Kingdom, Citizens, Research, Army, Campaign, Quests, World Map, Realm, Settings. Esc closes windows.

## Campaign

Expeditions are now a **story campaign**: 11 quests in 4 chapters (The Borderlands, The Orc War, Shadows Rising, The End of Days). Each has a quest giver with dialogue, an objective, a **bonus objective** (win while leading in person), a one-time quest reward you collect by **turning the quest in**, and battle spoils on every victory. Quests unlock in order. Completed ones can be replayed as bounties. The Endless Conquest and world map raids are side quests.

## Battlefield extras

When you lead a battle in person, your **Lord Commander rides onto the field** as a hero unit (stats grow with his level, +10% aura to adjacent allies; if he falls, your army loses heart). Enemy armies bring **generals** (Bandit Chief, Goblin King, Orc Warlord, Lich, Giant Jarl, Dark Lord): kill one and its whole army routs. **Panic** spreads to battered squads next to a destroyed one, **fireballs set forests ablaze** (they burn into scorched earth), you can **undo** your last move, and the enemy turn plays at 1×/2×/4× speed.

**Army morale**: each side has a morale bar that drops as it takes losses (and sharply when a general or your hero falls). At 0 the army flees the field, so most battles end in a rout rather than a massacre. Undead are partly fearless, and armies led by a boss monster never break. **Reserves & reinforcements**: during deployment you can hold squads in reserve and call them onto the field later. Large enemy armies hold back a second wave that arrives on turn 3–4. **Parting blows**: pulling a squad out of melee contact gives each adjacent enemy melee squad a free strike, and a move that cost blood can't be undone. **Smarter AI**: it focuses fire on wounded squads, hunts generals, heroes, healers and siege, keeps fragile units out of danger zones, holds its general behind the line until the fight comes to it, sends badly hurt squads back to its healers, and uses reserves and abilities when you let your captains fight. Every battle ends with a summary: turns, damage dealt and taken, final morale and your MVP unit. The engine has been stress-tested with 2,000 random battles (all maps, weathers, tactics, walls, heroes and generals) with no errors and no rule violations.

## Battlefield visuals & design (latest)

- **AI-painted terrain textures** for every tile type, with elevation shading (raised hills and mountains, sunken valleys and rivers), and **AI portraits for the six enemy generals**.
- **Animated attacks**: arrows and ballista bolts fly, fireballs streak and glow, catapult boulders arc, and melee hits flash a sword slash. Damage numbers wait for the projectile to land.
- **Weather you can see**: rain streaks, drifting fog, falling snow, gusts of wind. **Battle banners** for the opening, each turn, and victory or defeat.
- **Fog of war**: you only see what your squads can see (4 tiles, +1 on hills, cavalry +1, flyers +2, −2 in fog weather). Mountains block sight, and enemies hidden in forests are only spotted within 2 tiles. Unscouted enemies can't be targeted.
- **Squad stances**: Normal, Aggressive (+15% attack, −15% defense) or Defensive (+20% defense, −15% attack, stronger counterattacks). The enemy picks stances by role.
- **Objective battles**: world-map site raids, the Endless Conquest and territory defenses have a 🚩 banner. The attacker wins by holding it for 3 turns in a row. The AI marches on it or guards it.
- **Range preview** when you select a missile unit.

## City building

Your city is a map of **building lots** around the Town Hall: 12 at the start and 2 more per Town Hall level (40 in total). Click an **empty lot** to choose what to build. Click a **building** to open its form. Farms, quarries, lumber camps, houses, warehouses, granaries, steelworks, ranches and breweries can be built **many times** (each copy goes up to level 5 + Town Hall level). The other buildings are unique. Construction takes **builders** (1, +1 every 3 Town Hall levels) and **time**: scaffolding and a progress ring show on the lot. You can demolish extra copies to free a lot. Working buildings show their worker count, a green ▲ when an upgrade is ready, and floating production numbers.

**Building forms:**
- **Farm / Quarry / Lumber Camp / Steelworks / Ranch / Brewery:** production readout plus a worker seat for every job. Click an empty seat to hire, or a worker to send them home.
- **Barracks:** recruit seats, training cards with portraits, stats, costs and a quantity slider, the training queue, and **Release soldiers** (they go home as idle citizens).
- **Stables / Siege Workshop / Mage Tower / Temple:** train their own units. The Temple also has blessing cards and monk seats.
- **Market:** a trading desk. Pick a resource tile, switch between Sell and Buy, drag the slider and see the gold total before you deal.
- **Warehouse / Granary:** storage gauges. **House:** population gauges. **Academy:** current research. **Town Hall:** lots, builders and every construction in progress.

## Armory (hotkey 0)

Gear for your Lord Commander in 5 slots (weapon, armor, helm, banner, relic) and 4 rarities (Common, Rare, Epic, Legendary). Items roll bonuses to hero attack and health, army attack and defense, starting morale, battle loot and commander XP. Gear drops from victories: every campaign quest guarantees a drop the first time you win it (Epic from chapter III on), and world raids, the Endless Conquest and repelled raids can drop gear, with better odds when you lead in person or slay a general. Compare items before equipping them, and salvage spares for gold (Legendary gear also gives a Relic).

## Code layout (inside `index.html`)

1. **`GameState`**: save schema, hydrate/migrate, load/save/export/import
2. **`Engine`**: tick loop, chunked offline simulation, autosave
3. **`Economy`**: rates, caps, building costs, workforce, growth/starvation
4. **`Military`**, plus **`Research`**, **`Quests`**, **`Events`**: training queue, upkeep/desertion, raids, expeditions, battle setup/conclusion, XP
   - **`js/world.js`**: world map generation, sites, garrisons, territories and income, plus the world map screen
   - **`js/battle.js`**: terrain, enemy units, tactics, factions, map generator, the `Battle` engine (movement, combat, AI, simulation) and `BattleUI` (the battlefield screen)
5. **`AssetPipeline`**: image API integration + caching (below)
6. **`UI`**: builds the DOM once, updates it every tick, click actions handled in one delegated listener

## AI artwork pipeline

All image prompts live in one place: the `<script id="asset-catalog">` JSON block in `index.html` (102 assets: resource icons, buildings, workers, your units, enemy units, mission banners, commander portrait, page backdrop).

For each image, the game uses the first source available:

1. **IndexedDB cache**: art you made in the in-game **Artwork Forge**
2. **Static files**: `assets/manifest.json` → `assets/generated/*`
3. **Built-in fallback**: an emoji-on-gradient SVG, so the game always looks complete, even offline

### Option A: pre-generate the art (recommended for a public site)

Your API key stays on your machine, and players get the art with no key needed.

```bash
# Node 18+. Optional but recommended: crop/resize + WebP (small files)
npm i sharp

SIGNOR_API_KEY=sk-your-key node tools/generate-assets.mjs            # only missing images (default model gemini-nano-banana-2.1, ~$0.027 each)
# behind a corporate / cloud HTTPS proxy, add NODE_USE_ENV_PROXY=1 (Node >= 22.21)
SIGNOR_API_KEY=sk-your-key node tools/generate-assets.mjs --force    # regenerate everything
SIGNOR_API_KEY=sk-your-key node tools/generate-assets.mjs --only res_gold,b_farm --model gpt-image-2-c
```

The script calls `POST /v1/chat/completions` on the Signor gateway. It reads any of the four reply shapes (data URL, markdown URL, bare base64, Seedream JSON URL list) and retries on 429/503. It writes `assets/generated/<key>.(webp|png)` and updates `assets/manifest.json` as it goes, so you can stop and resume. Commit those files and deploy.

### Option B: generate in the browser

Open **Artwork Forge** in the right-hand panel, paste your key, pick a model, and press **Generate missing art**. Images are cropped, saved as WebP, and cached in IndexedDB in that browser only. The key is stored in `localStorage` under its own entry. It's never part of the save file or exports. If the gateway blocks browser requests (CORS), use Option A.

> ⚠️ **Never commit your API key** or put it in the HTML. Anything shipped to a static site can be read by every visitor.

> The repository already ships a full set of generated art in `assets/generated/` (made with `gemini-nano-banana-2.1`, about $3 for every image in the catalog). Re-run the script after adding catalog entries; it only makes images that are missing.

## Run locally

Opening `index.html` directly works (fallback art only, because browsers block `fetch` of the manifest on `file://`). To also load the pre-generated art, serve the folder:

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Deploy for free

The game is fully static. Deploy the repository root, with no build command.

### GitHub Pages
1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Pick your branch (e.g. `main`) and folder `/ (root)`, then **Save**.
4. After about a minute the game is live at `https://<user>.github.io/<repo>/`.

### Netlify
- **Drag & drop:** go to <https://app.netlify.com/drop> and drop the project folder.
- **Or from Git:** *Add new site → Import from Git →* pick the repo. Build command: *(empty)*. Publish directory: `.`
- **Or CLI:** `npm i -g netlify-cli && netlify deploy --prod --dir .`

### Vercel
- **Dashboard:** *Add New → Project →* import the repo. Framework preset: **Other**. Build command: *(empty)*. Output directory: `.`
- **Or CLI:** `npm i -g vercel && vercel --prod` (accept the defaults).

### Cloudflare Pages (alternative)
*Workers & Pages → Create → Pages → Connect to Git*, with no build command and output directory `/`.

## Tips for new players
1. Fill the Farmer and Miner slots first (Workforce tab). Idle citizens only pay a little tax.
2. Build Houses to grow, and Granaries and Warehouses so production doesn't stop at the cap.
3. Steelworks (needs 10 population), then Barracks (12 population). Assign Recruits, then train units.
4. Raiders start showing up after about 25 minutes. Build **City Walls** and keep an army at home. When they reach the gates, lead the defense: put archers on the walls and hold the gaps with spearmen.
5. Send your first army to the **Bandit Camp**. Commander levels unlock harder expeditions and new tactics. Relics raise all production by +2% each (up to +200%).
6. On the battlefield: archers on hills get +1 range, cavalry should charge 3+ tiles into enemy archers, spears should brace against cavalry, mountains block arrows, and enemies in rivers and valleys are easy prey. Fortified enemies need Siege Engineers or Catapults to breach their walls.
7. Keep food and gold income positive. Hungry, unpaid soldiers desert.

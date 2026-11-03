# Ironhold: Idle Dominion

A single-player idle RPG city builder for the browser. Grow your population, assign workers, raise buildings, train an army, defend against raids, and lead your troops yourself in turn-based battles on mountains, valleys, rivers and forests. It's plain HTML/JS with no build step (`index.html` + `js/battle.js`), and it saves to `localStorage`.

## Features

| System | Details |
|---|---|
| **Resources** | Gold, Food, Stone, Steel (+ rare **Relics**). Live per-second rates in the header, with storage caps that Warehouses, Granaries and the Town Hall raise. |
| **Population** | Housing cap. Shows total, workers, idle, recruits and soldiers. Growth depends on food stock and free housing. Starvation kills citizens. |
| **Workforce** | Assign Farmers / Miners / Blacksmiths / Recruits (`+`/`−`, Shift = ×10, `«`/`»` = all). Job slots come from buildings. Blacksmiths turn stone into steel. |
| **Buildings** | 14 buildings: Town Hall (up to Lv 15), Farm, Quarry, Steelworks, House, Warehouse, Granary, Market, Barracks, Stables, Siege Workshop, Temple, Academy, City Walls. `Cost = Base × mult^Level`. Storage grows ×1.4 per Town Hall level, and a self-test on boot makes sure every upgrade's cost fits in fully built storage. Disabled buttons show why, e.g. "Gold storage too small. Build Warehouses". |
| **Military** | 13 units: Militia, Spearman, Archer, Footman, Crossbowman, Pikeman, Longbowman, Light Cavalry, Knight, Battle Priest, Siege Engineer, Catapult, Paladin. Each has HP/ATK/DEF/range/movement plus traits (anti-cavalry, charge, armor-piercing, healing, wall-breaching). Train ×1/×5/×10/Max, with a queue of 50. If upkeep isn't paid, morale falls and soldiers desert. |
| **Tactics** | 7 doctrines unlocked by Commander level: Balanced, Shield Wall, Arrow Storm, Cavalry Charge, Hold the Line, Ambush, Bloodlust. The one you pick is used by your captains in auto battles, and you can change it before any battle you lead. |
| **Battlefield** | An 18×12 turn-based tactical grid. Terrain: **plains, forest** (cover, slows cavalry), **hills** (+defense, +range, downhill bonus), **mountains** (impassable, block arrows), **valleys** (low ground, −defense, uphill penalty), **rivers & bridges** (chokepoints), **swamps**, **castle walls** (only defenders can stand on them; siege units breach them). Movement uses zone of control. Melee targets strike back, braced spears punish cavalry, and missiles need line of sight. Attacks show a damage forecast. Auto-deploy, Brace, Auto-battle and Retreat are all available. |
| **Raids** | Enemy factions attack the city: Bandits → Goblins → Orcs → Undead → Giant-kin → Black Legion → Dragonflight. They get stronger with each raid and as your city grows. You get a warning when they're spotted, then a choice at the gates: **lead the defense** yourself (Town Guards and your City Walls join you) or let your captains fight. If you lose, they plunder your stores and kill citizens. |
| **Expeditions** | 11 missions up to the Throne of the Storm Titan, plus an **Endless Conquest** that gets stronger with every stage you win. **March** = timed auto battle with your doctrine. **Lead the assault** = fight it now on the battlefield for +25% loot. The win chance is estimated by simulating the battle. |
| **Research** | Build an **Academy** to unlock 12 techs: Crop Rotation, Masonry, Taxation, Military Drill, Drill Sergeants, Metallurgy, Logistics, Medicine, Plate Armor, Fortification, Cartography, Relic Lore. One project runs at a time, and higher Academy levels unlock more advanced techs and research faster. |
| **Commander abilities** | Used in battle: 📯 Rally (heal 15%), 🎯 Arrow Barrage (pick a 3×3 area to hit), 🔥 War Cry (+30% damage this turn), 🥾 Forced March (+2 movement). They unlock with Commander level and have cooldowns. Your captains also use them in auto battles. |
| **Quests** | 32 goals that walk you from your first farm to toppling the Storm Titan. Claim resources and Relics as rewards. |
| **Realm events** | Every 15–25 minutes: Bountiful Harvest, Trade Fair, Age of Inspiration, a gold vein, refugees, plague, or an offer you can accept or decline (mercenaries, a merchant caravan, a mysterious relic peddler). |
| **Idle / offline** | 1 s tick based on real elapsed time. When you return, offline progress (capped at 12 h) is simulated in 10 s steps, and a summary pops up. |
| **Persistence** | Autosaves every 5 s, plus manual Save, Export (copy/download), Import (paste/file) and Reset. |

## Code layout (inside `index.html`)

1. **`GameState`**: save schema, hydrate/migrate, load/save/export/import
2. **`Engine`**: tick loop, chunked offline simulation, autosave
3. **`Economy`**: rates, caps, building costs, workforce, growth/starvation
4. **`Military`**, plus **`Research`**, **`Quests`**, **`Events`**: training queue, upkeep/desertion, raids, expeditions, battle setup/conclusion, XP
   - **`js/battle.js`**: terrain, enemy units, tactics, factions, map generator, the `Battle` engine (movement, combat, AI, simulation) and `BattleUI` (the battlefield screen)
5. **`AssetPipeline`**: image API integration + caching (below)
6. **`UI`**: builds the DOM once, updates it every tick, click actions handled in one delegated listener

## AI artwork pipeline

All image prompts live in one place: the `<script id="asset-catalog">` JSON block in `index.html` (71 assets: resource icons, buildings, workers, your units, enemy units, mission banners, commander portrait, page backdrop).

For each image, the game uses the first source available:

1. **IndexedDB cache**: art you made in the in-game **Artwork Forge**
2. **Static files**: `assets/manifest.json` → `assets/generated/*`
3. **Built-in fallback**: an emoji-on-gradient SVG, so the game always looks complete, even offline

### Option A: pre-generate the art (recommended for a public site)

Your API key stays on your machine, and players get the art with no key needed.

```bash
# Node 18+. Optional but recommended: crop/resize + WebP (small files)
npm i sharp

SIGNOR_API_KEY=sk-your-key node tools/generate-assets.mjs            # only missing images
SIGNOR_API_KEY=sk-your-key node tools/generate-assets.mjs --force    # regenerate everything
SIGNOR_API_KEY=sk-your-key node tools/generate-assets.mjs --only res_gold,b_farm --model gpt-image-2-c
```

The script calls `POST /v1/chat/completions` on the Signor gateway. It reads any of the four reply shapes (data URL, markdown URL, bare base64, Seedream JSON URL list) and retries on 429/503. It writes `assets/generated/<key>.(webp|png)` and updates `assets/manifest.json` as it goes, so you can stop and resume. Commit those files and deploy.

### Option B: generate in the browser

Open **Artwork Forge** in the right-hand panel, paste your key, pick a model, and press **Generate missing art**. Images are cropped, saved as WebP, and cached in IndexedDB in that browser only. The key is stored in `localStorage` under its own entry. It's never part of the save file or exports. If the gateway blocks browser requests (CORS), use Option A.

> ⚠️ **Never commit your API key** or put it in the HTML. Anything shipped to a static site can be read by every visitor.

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

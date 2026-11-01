# Ironhold: Idle Dominion

A single-player idle RPG city builder for the browser. Grow your population, assign workers, raise buildings, train an army, and send it on expeditions that come back on their own with loot. It's all one `index.html` (Vanilla JS, no build step) and it saves to `localStorage`.

## Features

| System | Details |
|---|---|
| **Resources** | Gold, Food, Stone, Steel (+ rare **Relics**). Live per-second rates in the header, with storage caps that Warehouses, Granaries and the Town Hall raise. |
| **Population** | Housing cap. Shows total, workers, idle, recruits and soldiers. Growth depends on food stock and free housing. Starvation kills citizens. |
| **Workforce** | Assign Farmers / Miners / Blacksmiths / Recruits (`+`/`−`, Shift = ×10, `«`/`»` = all). Job slots come from buildings. Blacksmiths turn stone into steel. |
| **Buildings** | Town Hall, Farm, Quarry, Steelworks, House, Warehouse, Granary, Barracks. `Cost = Base × mult^Level`. A button is disabled (with the reason shown) when you lack resources or population, or hit the Town Hall level limit. |
| **Military** | Militia, Archer, Footman, Siege Engineer, Knight. Each unit uses a Recruit plus gold/steel/food, and trains in a queue. Upkeep is food + gold per second. If upkeep isn't paid, morale falls and soldiers desert. |
| **Expeditions** | 6 missions (some fortified: bring siege engineers). They resolve on a timer: success chance comes from power vs. threat, then casualties, loot, relics and Commander XP. |
| **Idle / offline** | 1 s tick based on real elapsed time. When you return, offline progress (capped at 12 h) is simulated in 10 s steps, and a summary pops up. |
| **Persistence** | Autosaves every 5 s, plus manual Save, Export (copy/download), Import (paste/file) and Reset. |

## Code layout (inside `index.html`)

1. **`GameState`**: save schema, hydrate/migrate, load/save/export/import
2. **`Engine`**: tick loop, chunked offline simulation, autosave
3. **`Economy`**: rates, caps, building costs, workforce, growth/starvation
4. **`Military`**: training queue, upkeep/desertion, power, expedition resolution, XP
5. **`AssetPipeline`**: image API integration + caching (below)
6. **`UI`**: builds the DOM once, updates it every tick, click actions handled in one delegated listener

## AI artwork pipeline

All image prompts live in one place: the `<script id="asset-catalog">` JSON block in `index.html` (32 assets: resource icons, buildings, workers, units, mission banners, commander portrait, page backdrop).

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
4. Send your first army to the **Bandit Camp**. Commander levels unlock harder expeditions. Relics raise all production by +2% each (up to +200%).
5. Keep food and gold income positive. Hungry, unpaid soldiers desert.

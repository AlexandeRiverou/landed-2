# Landed ✈️

A casual low-poly flying game with a procedurally generated world and an **extremely needy objective system**.
If you ignore an objective, the game starts persuading you, and it gets more and more desperate.
Every time you complete one, the world mutates.

## Running

It's plain ES modules with no build step. Three.js loads from a CDN via an import map, so you only need a static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.)

## Test preview

A playable preview lives at https://claude.ai/artifact/6vvTmbwBznvxiT49uftkHL (private to the repo owner). Agents update it after
every change (see `CLAUDE.md`). `npm run preview` stamps the build and prints the files to publish, and the title card shows
which build you're playing.

## The agent team

Work on this repo can be driven by a team of Claude Code agents: run `/orchestrate <request>` and the Orchestrator
plans it, delegates to the Developer, DevOps, Security and Documenter agents, and opens the PR. See
[`docs/agents.md`](docs/agents.md).

## Building, testing and releasing

```bash
npm ci            # three.js + Playwright
npm run check     # syntax check every module
npm run build     # offline-ready copy in dist/ (three.js vendored, no CDN needed)
npx playwright install chromium   # once
npm test          # boots dist/ in headless Chromium and plays through objectives, persuasion,
                  # world mutations, every objective, every boss, relax mode and
                  # the developer menu and the secrets;
                  # fails on any error
```

The **Build & Release** workflow (`.github/workflows/build-release.yml`) runs the same steps:

- **On every pull request into `main`:** check, build and smoke test, with the zipped build attached to the run.
  Nothing is published.
- **On every merge into `main`:** the same, then a new **GitHub Release** is published with
  `landed-vX.Y.Z.zip` attached. Each merge bumps the patch number (`v1.0.0` → `v1.0.1` → …). For a minor or
  major release, raise `"version"` in `package.json` (e.g. to `1.1.0`) in your PR, and the merge releases exactly that
  (logic in `scripts/next-version.mjs`). Re-running the workflow on an already released commit doesn't publish twice.
- **Pushing a `v*` tag by hand** releases that tag.
- **Every merge into `main` also goes live on GitHub Pages:** the smoke-tested `dist/` is deployed to
  **https://alexanderiverou.github.io/landed-2/**. "Run workflow" from the Actions tab on `main` redeploys it.
  Hand-pushed tags and pull requests never deploy.

To play the latest release, just open the GitHub Pages link above. To install one locally, download the zip from the
Releases page, unzip it, and serve the folder with any static server.

**One-time setup for GitHub Pages** (repo admin): Settings → Pages → Build and deployment → Source: **GitHub
Actions**. Until then the Pages deploy job fails, but the release still publishes. Then check Settings →
Environments → `github-pages` allows deployments from `main` only.

## Controls

| Action | Keys |
| --- | --- |
| Climb / dive | `W` `S` or `↑` `↓` (`I` inverts) |
| Bank & turn | `A` `D` or `←` `→` |
| Rudder | `Q` `E` |
| Boost | `Shift` |
| Shoot | `Space`, `J` or left click |
| Pause / music / mute all | `P` (or `Esc`) / `N` / `M` |
| Relax Mode | `R` or the ☁️ Relax Mode button at the top |
| Stunts | double-tap `↑`/`W`: **Immelmann** (half loop + roll, you turn back and climb) · `↓`/`S`: **Split-S** (roll + pull through, you turn back and dive; needs 45 m below you) · `←`/`A` or `→`/`D`: **barrel roll** that slides you sideways, and nothing can hit you mid-roll |
| Touch | drag on the left to steer; BOOST / FIRE buttons on the right; flick the stick twice the same way (or swipe twice) for the same stunts |

## What's in it

**Procedural world** (`src/world.js`, `src/terrain.js`): an infinite, chunked terrain built from seeded simplex noise. It has
ridged mountain ranges, mesas with sheer cliff walls, stepped terraces, river canyons, rock pinnacles, open sea with
islands, and beaches, deserts, forests and snow caps. In Hollow Peaks, big tunnels are bored clean through the
mountains. In Metropolis, the land is cut into a street grid of skyscrapers (`src/city.js` draws them). Chunks build
nearest-first and stream in as you fly.

**Assets** (`src/models.js`): 80+ low-poly props built from primitives and drawn with one `InstancedMesh` per type per chunk.
They include pines, round trees, birches, palms, dead trees, cacti, bushes, rocks, houses, windmills, lighthouses, castle
towers, moai heads, pyramids, boats, buoys, floating islands, hot-air balloons, plus the themed ones: mushrooms,
crystals, lollipops, donuts, gnomes, traffic cones and giant rubber ducks. Farms bring apple trees, flowers, hay bales,
sheep, cows, scarecrows, wells and barns. Elsewhere there are logs and tents, tumbleweeds and totem poles, snowmen and
igloos, beach parasols and sandcastles, icebergs, whales and sailboats. The countryside gets picnic tables and
tractors, the desert camper vans, the snow ski lifts. Landmarks include ferris wheels, stone circles, ruins, radio
towers and the odd lonely gas station. The city brings its own: cars, taxis and buses that stay in their lanes,
street lamps, traffic lights, park trees, benches, fountains and statues, and on the roofs water towers, billboards,
antennas, helipads, spires on the tallest towers and cranes on building sites.

**Enemies** (`src/enemies.js`): angry drones, spiky balloon mines, a seagull gang, bee swarms, orb-spitting UFOs, ad
blimps that drop "special offers", zapping sky jellyfish, grumpy ground cannons, Rival Pilot Gary (strafing runs), grumpy
storm clouds, and evil top-hat pigeons. Harder types unlock as your score grows. Enemies spawn in a narrow cone straight
ahead of you and carry a small red marker, so you see them coming.

**The journey** (`src/zones.js`): every 3 completed objectives you fly on into a new zone with its own landscape,
colours, props, sky, weather and music mood. There are 28, in order:

- Meadowlands → Autumn Woods (falling leaves) → Canyon Country → Dune Sea (blowing dust) → Frozen Peaks
- **Hollow Peaks:** huge mountains and deep canyons, with tunnels clean through the rock. They're 56–90 m wide,
  up to 68 m tall and open at both ends, so you can fly in one side and out the other. The roof is solid: hit it
  and you crash. Your altitude readout measures to the tunnel floor while you're inside.
- **Crystal Caverns:** a real cave. A rock roof with stalactites hangs over everything, the lakes glow, and glowing
  mushrooms and stalagmites grow on the floor. Hit the roof and you crash.
- Volcano Land (lava seas, falling ash) → Tropical Archipelago
- **Metropolis:** a city at golden hour. Wide avenues every few blocks, narrower streets and alleys between them,
  towers up to about 330 m downtown, parks, plazas, and a harbour. The buildings are solid: fly into a wall and you
  crash, and your altitude readout measures to the roof under you. Ghost Mode puts you on the roof instead. No stone
  arch objective here (it doesn't fit down a street), but crop dusting down an avenue is fair game.
- **Sunken Reef:** you fly underwater. Coral, kelp, fish schools and shipwrecks on a colourful seabed; boats and
  whales float on the glowing surface above. The surface is the ceiling: it holds you a few metres under it instead
  of crashing you.
- **Giant's Garden** (everything is 3× bigger) → Mushroom Forest
- **Neon Grid:** synthwave. Pointy black mountains, glowing magenta-to-cyan grid lines, and a striped retro sun on
  the horizon.
- **Princess Kingdom:** pink fairy-tale castles, heart-shaped trees, unicorns, pumpkin carriages and falling petals.
- Candy Kingdom → **Blockland** (the ground is made of 24 m blocks, the trees are cubes) → **Salt Mirror** (a nearly
  flat salt plain under a sheet of shallow water, pastel sky)
- Sky Islands → Stratosphere (above a sea of clouds) → Low Orbit (Earth below, black sky) → Meteor Belt
  (asteroids you can shoot apart)
- **Gas Giant:** no ground at all. Stripy cloud decks scroll far below, and a huge ringed planet hangs in a hazy
  orange sky.
- The Moon (craters, Earthrise) → **Mars** (red canyons, dust, two tiny moons)
- **Planet Pebble:** a planet so small the ground visibly curves away toward a close horizon (`src/curve.js` bends
  every vertex down by its squared distance from the camera; gameplay stays flat).
- **Ringworld:** you live on the inside of a ring. The ground curves **up** on both sides across one axis and stays
  flat along it, and the far side of the ring arches overhead.
- Alien World. Then it loops for lap 2.

The current zone and how many objectives until the next show under your rank. Random world changes still happen inside
a zone, but can't break its identity. To add or change a zone, see [`docs/zones.md`](docs/zones.md).

**Power-ups** (`src/powerups.js`): a spinning gift floats into view ahead of you about once a minute (the first after
40 s; never more than one waiting), and every boss drops one. Most last about half a minute (Time Freeze 14 s, Double
Points and Objective Radar 45 s), shown with a countdown in the bottom-left: Bubble Shield, Rapid Fire, Triple Shot, Homing Bullets, Turbo, Slow-Mo, Time Freeze, Double Points,
Repair Kit, Ghost Mode (can't crash into the ground), Mega Plane, Tiny Plane and Objective Radar.

**Progression** (`src/progression.js`): your score is XP. Each level promotes you to a new rank (Cadet Who Means Well
→ Sky Intern → … → Supreme Commander Of Up) and grants a permanent perk for the flight: more hull, faster boost
recharge, higher fire rate, longer and more frequent power-ups, harder-hitting bullets... The XP bar is under your
score, and your best run is remembered on the title screen.

**Bosses** (`src/enemies.js`, `src/objectives.js`): a crowned boss shows up after every 4 to 7 completed objectives
(a fresh random gap each time). There are 15, drawn from a shuffled deck so you meet them all before any repeats:

- King Drone the Unpleasant (summons minions)
- Her Royal Honkness the Goose Queen (golden eggs)
- The Mothership (orb shotguns)
- Thunderclaus (lightning up close, hail from afar)
- Baron von Blimpenstein (carpet-bombs your flight path, drops "special offer" mines)
- Empress Wobblina (rings of goo with a safe hole in the middle, zaps up close)
- Gary Prime, Gary's dad (strafing runs and rapid bursts)
- Queen Bee-atrice (stinger fans, calls in the swarm)
- Don Pigeone the Godfeather (sends "associates", air mail from above)
- Steven the Seagull Overlord (dive-bombs; a hit steals your boost)
- The Mother of All Spiky Balloons (spike novas, mines in your path)
- Fort Grumpington (a ground boss: mortars and flak; never in space)
- Admiral Inkworth the Sky Octopus (a lead boss: ink blobs, orb spirals from its arms; every tentacle shot off means
  fewer orbs)
- Captain Clawdia the Sky Crab (a lead boss: bubble streams, pincer shots from each claw; snap the claws off)
- Sir Puffington the Pufferfish (a lead boss: water jets, then puffs up so bullets bounce off, then pops a spike nova)

From the third boss on, they can roll a modifier (Jumbo, Turbo, Furious But Fragile, Shiny for double points). From the
fourth on, they can show up as twins that share one health bar. Most bosses circle you; lead bosses fly ahead of you,
facing back and weaving side to side, so they're always in your sights. Bosses taunt you, and get ENRAGED below half
health. Shooting off parts weakens them (the crown makes them take more damage, Gary Prime's propeller slows him, the
fort's barrel cuts its mortars, the octopus's tentacles and the crab's claws thin out their attacks). Each boss adds HP. Defeating one pays 400+ points and reshapes the world like any
other win.

**38 objective types** (`src/objectives.js`, `src/challenges.js`, `src/quests.js`):

- *Hoops:* hoop, tiny precision hoop, timed speed hoop, a hoop that wanders around, a hoop that shrinks until it's gone.
- *Ring chains:* slalom, corkscrew, climbing staircase, downhill dive, and a time trial.
- *Collecting:* stars, balloons to fly into, a long wiggly star trail, a shooting gallery of balloons you have to shoot.
- *Chases:* catching the golden goose, following Larry (Gary's nice cousin) or Professor Honk in formation.
- *Stunts:* loop-de-loop (detected from your pitch rotation), flying upside down, going really fast, crop dusting (low
  flying), climbing to an altitude.
- *Places:* buzzing a giant landmark, a three-stop sightseeing tour, flying under a stone arch, shooting a bullseye
  painted on the ground.
- *Fights:* the pigeon hunt, pest control (shoot down any 5 enemies), and Hold The Line (survive 40 s while enemies
  arrive twice as fast).
- *Quests* (new verbs, `src/quests.js`):
  - **Pizza Delivery:** fly into the pizza box, then take it to the drop-off pad under the light beam (over a void or
    in space it's a floating mailbox). It cools 2.4% a second once you have it. At 0% the customer eats cereal and
    you fail.
  - **Barrel Roll:** do 2 or 3 full rolls with the double-tap left/right stunt. Ordinary banking doesn't count.
  - **Rival Race:** Gary, in a purple plane, races you through 5 or 6 rings. The white one is the finish. If he gets
    there first, you lose.
  - **Constellation:** 6 to 8 numbered stars make a heart, the Big Dipper, a lightning bolt or a snake. Fly through
    them in order and the guide lines light up. Out-of-order stars don't count.
  - **Sneak Past The Searchlight:** fly through the green hoop while a beam sweeps around it (a lamp on a tower, or a
    floating eye where there's no ground). About 1.5 s in the beam and you're spotted; the third time, you fail.
  - **Hot Potato:** carry a birthday cake with a 12 s fuse. Each ring adds 7 s (16 s max). Six rings and it pops into
    confetti. Let the fuse run out and your windscreen gets frosted.
  - **Balloon Herding:** push 3 balloons into the green pen. Your plane shoves the air: fly through a balloon toward
    the pen.
  - **Sky Melody:** fly through numbered notes in order to play Twinkle Twinkle Little Star, Ode To Joy, Mary Had A
    Little Lamb or Frère Jacques. A wrong note starts the tune over. It never fails, it just judges you.
  - **Catch The Falling Stars:** catch 5 shooting stars before they hit the ground. Not offered in zones without
    ground (Stratosphere, Low Orbit, Meteor Belt, Gas Giant), Crystal Caverns or Sunken Reef.
  - **Photo Safari:** keep the shy sky whale centred on your nose, within 180 m, for 3 s to take a photo. It needs 3
    photos and bolts after every flash.

Adding a type: write a maker that returns `objective({...})` (in `src/challenges.js` or `src/quests.js`), then add
`['name', weight, maker]` to `TYPES` in `src/objectives.js`. The developer menu and the smoke test's start/complete
loop pick it up on their own. If it needs ground, add it to `GROUND_OBJECTIVES` in `src/zones.js`; to keep it out of
one zone, list it in that zone's `noObjectives`.

**Relax Mode** (`src/main.js`): press `R` or the ☁️ Relax Mode button to take a break. Objectives and enemies leave,
no new power-ups spawn, the HUD fades, cinema bars slide in and the music turns dreamy. The world stops changing, so
if you like where you are, stay a while. Press it again ("Back to the action") to return. A boss you left behind comes
back first.

**Persuasion engine** (`src/persuasion.js`): a "neglect" meter fills while you're not making progress. It fills faster
when you fly away and barely moves while you close in. Each time it fills, the game escalates through 27 tactics
in three tiers:

- *Mild:* nagging, guilt trips, pro tips, GPS distance, an on-screen edge arrow, sonar beeps panned toward the target,
  and a 900 m light beam.
- *Pushy:* the hoop gets **bigger**, giant "HERE!!!" text, a 3D arrow on your nose, breadcrumb orbs, a balloon-held sky
  billboard, fireworks at the target, the **sun moved behind the objective**, fog cleared,
  enemies bribed into a coffee break, sad rain, lowered requirements, and magnet mode.
- *Desperate:* the objective **walks over to you**, a steering tailwind, a **rainbow road**, a tunnel of practice rings,
  the mountains are told to sit down (the terrain flattens), free unlimited boost, the objective teleported right in front
  of you... and finally a **participation trophy**.

**World mutations** (`src/mutations.js`): every success applies 3–6 random changes from 24 kinds, and the count grows the
better you do. They include time of day (night, sunset, alien lime sky, eclipse...), weather (rain, snow, confetti,
bubbles, leaves, glitter), terrain palette (11 palettes), mountain height, sea level, cliffs and terraces, canyons, spikes,
mesas, prop theme ("The Duckening", gnome invasion, candy forest...), prop size and density, floating islands, continental
drift (a whole new map), your plane's paint job, an engine upgrade, cloud styles, planets and moons, fog, and party hats
for every enemy. The terrain morphs chunk by chunk around you, and if a mountain grows under you, you get relocated
upward for free.

**Secrets** (`src/secrets.js`): there are 10 Easter eggs hidden in the game. Some you type, some you fly, some only
show up on certain days. The title card counts how many you've found and drops a cryptic hint for one you haven't, and
found secrets are remembered between flights. The full spoiler list is in [`docs/secrets.md`](docs/secrets.md).

## Debugging

`window.G` holds the whole game state. `G.step(dt)` advances the simulation without rendering, which is handy for
scripted tests in a headless browser.

**Secret developer menu** (`src/devmenu.js`): during a flight, hold `1` and `0` together (top row or numpad) for 3
seconds. On a touch screen, hold one finger in each top corner of the screen instead (each corner is a square 15% of
the screen width, 60–120 px). A small "Developer menu… 3s" pill counts down while you hold; let go early, or slide a
finger out of its corner, and nothing happens. The menu pauses the game, silences the engine and ducks the music.
Close it with `Esc`, the ✕ button, or the same 3 s hold. It's a testing aid, so it's deliberately left off the title
card.

- **Zones:** jump straight to any of the 28 zones (the next zone change is a full zone's worth of objectives away).
- **Bosses:** start any of the 15, with an optional modifier and the Twins checkbox. Fort Grumpington needs flat land;
  where there is none, King Drone comes instead and you get a notice. The fort never comes as twins.
- **Objectives:** start any of the 38 types. Types the current zone doesn't offer are greyed out.
- **Power-ups:** grab any of the 13.
- **Cheats & tools:** God mode (no damage, and you skim the ground, sea, cave roof and tunnel roofs like Ghost Mode), Relax Mode
  on/off, Complete objective, Level up, Clear enemies (bosses and objective targets stay).
- **Secrets:** trigger any of the 10 (it plays the effect and counts as found; hover a button for its hint), and
  **Forget found secrets** to start the hunt over.

Starting a boss or objective replaces the current one and turns Relax Mode off. While the menu is open, gameplay keys
don't reach the game (`G.input.lock`), so `Space` won't fire behind it.

From the console: `G.devmenu.open()` / `G.devmenu.close()`, `G.player.god = true`, and
`G.objectives.startType('stars')` to start one objective type right now (unknown types are ignored; it doesn't check
whether the zone allows it, and it doesn't clear the current objective, the menu does that first).
`G.secrets.list()`, `G.secrets.trigger('konami')` and `G.secrets.reset()` work on the secrets, and
`G.secrets.checkDate(new Date(2026, 9, 31))` pretends it's Halloween. The whole `G.secrets` API, and how to add a
secret, is in [`docs/secrets.md`](docs/secrets.md) (spoilers).

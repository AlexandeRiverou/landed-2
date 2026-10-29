# Loop-de-Whoops ✈️

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

## Building, testing and releasing

```bash
npm ci            # three.js + Playwright
npm run check     # syntax check every module
npm run build     # offline-ready copy in dist/ (three.js vendored, no CDN needed)
npx playwright install chromium   # once
npm test          # boots dist/ in headless Chromium and plays through objectives, persuasion,
                  # world mutations, every objective, every boss and relax mode;
                  # fails on any error
```

The **Build & Release** workflow (`.github/workflows/build-release.yml`) runs the same steps:

- **On every pull request into `main`:** check, build and smoke test, with the zipped build attached to the run.
  Nothing is published.
- **On every merge into `main`:** the same, then a new **GitHub Release** is published with
  `loop-de-whoops-vX.Y.Z.zip` attached. Each merge bumps the patch number (`v1.0.0` → `v1.0.1` → …). For a minor or
  major release, raise `"version"` in `package.json` (e.g. to `1.1.0`) in your PR, and the merge releases exactly that
  (logic in `scripts/next-version.mjs`). Re-running the workflow on an already released commit doesn't publish twice.
- **Pushing a `v*` tag by hand** releases that tag.

To install a release, download the zip from the Releases page, unzip it, and serve the folder with any static
server.

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
| Touch | drag on the left to steer; BOOST / FIRE buttons on the right |

## What's in it

**Procedural world** (`src/world.js`, `src/terrain.js`): an infinite, chunked terrain built from seeded simplex noise. It has
ridged mountain ranges, mesas with sheer cliff walls, stepped terraces, river canyons, rock pinnacles, open sea with
islands, and beaches, deserts, forests and snow caps. Chunks build nearest-first and stream in as you fly.

**Assets** (`src/models.js`): 30+ low-poly props built from primitives and drawn with one `InstancedMesh` per type per chunk.
They include pines, round trees, birches, palms, dead trees, cacti, bushes, rocks, houses, windmills, lighthouses, castle
towers, moai heads, pyramids, boats, buoys, floating islands, hot-air balloons, plus the themed ones: mushrooms,
crystals, lollipops, donuts, gnomes, traffic cones and giant rubber ducks. Farms bring apple trees, flowers, hay bales,
sheep, cows, scarecrows, wells and barns. Elsewhere there are logs and tents, tumbleweeds and totem poles, snowmen and
igloos, beach parasols and sandcastles, icebergs, whales and sailboats. Landmarks include ferris wheels, stone circles,
ruins and radio towers.

**Enemies** (`src/enemies.js`): angry drones, spiky balloon mines, a seagull gang, bee swarms, orb-spitting UFOs, ad
blimps that drop "special offers", zapping sky jellyfish, grumpy ground cannons, Rival Pilot Gary (strafing runs), grumpy
storm clouds, and evil top-hat pigeons. Harder types unlock as your score grows. Enemies spawn in a narrow cone straight
ahead of you and carry a small red marker, so you see them coming.

**The journey** (`src/zones.js`): every 3 completed objectives you fly on into a new zone with its own landscape,
colours, props, sky, weather and music mood. In order: Meadowlands → Canyon Country → Frozen Peaks → Volcano Land
(lava seas, falling ash) → Tropical Archipelago → Mushroom Forest → Candy Kingdom → Sky Islands → Stratosphere (above
a sea of clouds) → Low Orbit (Earth below, black sky) → Meteor Belt (asteroids you can shoot apart) → The Moon
(craters, Earthrise) → Alien World. Then it loops for lap 2. The current zone and how many objectives until the next
show under your rank. Random world changes still happen inside a zone, but can't break its identity.

**Power-ups** (`src/powerups.js`): a spinning gift floats into view ahead of you about once a minute (the first after
40 s; never more than one waiting), and every boss drops one. Most last about half a minute (Time Freeze 14 s, Double
Points and Objective Radar 45 s), shown with a countdown in the bottom-left: Bubble Shield, Rapid Fire, Triple Shot, Homing Bullets, Turbo, Slow-Mo, Time Freeze, Double Points,
Repair Kit, Ghost Mode (can't crash into the ground), Mega Plane, Tiny Plane and Objective Radar.

**Progression** (`src/progression.js`): your score is XP. Each level promotes you to a new rank (Cadet Who Means Well
→ Sky Intern → … → Supreme Commander Of Up) and grants a permanent perk for the flight: more hull, faster boost
recharge, higher fire rate, longer and more frequent power-ups, harder-hitting bullets... The XP bar is under your
score, and your best run is remembered on the title screen.

**Bosses** (`src/enemies.js`, `src/objectives.js`): a crowned boss shows up after every 4 to 7 completed objectives
(a fresh random gap each time). There are 12, drawn from a shuffled deck so you meet them all before any repeats:

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

From the third boss on, they can roll a modifier (Jumbo, Turbo, Furious But Fragile, Shiny for double points). From the
fourth on, they can show up as twins that share one health bar. Bosses circle you, taunt you, and get ENRAGED below
half health. Shooting off parts weakens them (the crown makes them take more damage, Gary Prime's propeller slows him,
the fort's barrel cuts its mortars). Each boss adds HP. Defeating one pays 400+ points and reshapes the world like any
other win.

**28 objective types** (`src/objectives.js`, `src/challenges.js`):

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

## Debugging

`window.G` holds the whole game state. `G.step(dt)` advances the simulation without rendering, which is handy for
scripted tests in a headless browser.

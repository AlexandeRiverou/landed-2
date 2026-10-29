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

## Controls

| Action | Keys |
| --- | --- |
| Climb / dive | `W` `S` or `↑` `↓` (`I` inverts) |
| Bank & turn | `A` `D` or `←` `→` |
| Rudder | `Q` `E` |
| Boost | `Shift` |
| Shoot | `Space`, `J` or left click |
| Pause / mute | `P` (or `Esc`) / `M` |
| Touch | drag on the left to steer; BOOST / FIRE buttons on the right |

## What's in it

**Procedural world** (`src/world.js`, `src/terrain.js`): an infinite, chunked terrain built from seeded simplex noise. It has
ridged mountain ranges, mesas with sheer cliff walls, stepped terraces, river canyons, rock pinnacles, open sea with
islands, and beaches, deserts, forests and snow caps. Chunks build nearest-first and stream in as you fly.

**Assets** (`src/models.js`): 30+ low-poly props built from primitives and drawn with one `InstancedMesh` per type per chunk.
They include pines, round trees, birches, palms, dead trees, cacti, bushes, rocks, houses, windmills, lighthouses, castle
towers, moai heads, pyramids, boats, buoys, floating islands, hot-air balloons, plus the themed ones: mushrooms,
crystals, lollipops, donuts, gnomes, traffic cones and giant rubber ducks.

**Enemies** (`src/enemies.js`): angry drones, spiky balloon mines, a seagull gang, orb-spitting UFOs, grumpy storm
clouds that zap you, and evil top-hat pigeons. Harder types unlock as your score grows.

**13 objective types** (`src/objectives.js`): hoop, ring chain, tiny precision hoop, timed speed hoop, star collection,
balloon popping, catching the golden goose, loop-de-loop (a real maneuver, detected from your pitch rotation), crop
dusting (low flying), climbing to an altitude, buzzing a giant landmark, the pigeon hunt, and flying under a stone arch.

**Persuasion engine** (`src/persuasion.js`): a "neglect" meter fills while you're not making progress. It fills faster
when you fly away and barely moves while you close in. Each time it fills, the game escalates through 27 tactics
in three tiers:

- *Mild:* nagging, guilt trips, pro tips, GPS distance, an on-screen edge arrow, sonar beeps panned toward the target,
  and a 900 m light beam.
- *Pushy:* the hoop gets **bigger**, giant "HERE!!!" text, a 3D arrow on your nose, breadcrumb orbs, a balloon-held sky
  billboard, fireworks at the target, a guide flock of birds, the **sun moved behind the objective**, fog cleared,
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

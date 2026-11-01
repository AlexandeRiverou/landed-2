# Zones: how they work and how to add one

A zone is one entry in the `ZONES` array in `src/zones.js`. The journey plays them in array order and loops. The
developer menu and the smoke test pick up new entries on their own, so adding a zone is mostly data.

## A zone entry

| Field | What it does |
| --- | --- |
| `name`, `blurb` | Shown on the zone card and in the developer menu. |
| `world` | World params for this zone (see below). Anything you leave out resets to `WORLD_DEFAULTS`. `palette` is a key of `ZONE_PALETTES` or the name of a mutation palette in `PALETTES`. |
| `sky` | A preset name from `TOD` in `src/sky.js`. |
| `weather` | A weather name (`clear`, `leaves`, `dust`, `bubbles`, ...). |
| `clouds` | `[colour, amount, height]`. Height defaults to 440; negative puts the clouds below you. |
| `fog` | Fog distance scale (default 1; smaller is thicker). |
| `mood` | Music mood (`day`, `dusk`, `dream`, `space`, ...). |
| `decor` | Big set pieces that follow the camera like the sky dome: `earthBelow`, `retroSun`, `gasGiant`, `ringArch`. Built in `Zones.buildDecor()`, which disposes the old decor first. |
| `sunAzimuth` | Fixes the sky's sun direction (radians), so the lighting lines up with a sun in the decor (Neon Grid uses `Math.PI` for its retro sun). Zones without it get a fresh random sun direction. |
| `asteroids`, `comets` | Asteroid count and comets (space zones). |
| `noGround` | No ground: ground objectives, ground enemies and ground bosses are skipped. |
| `noObjectives` | Objective types this zone doesn't offer (e.g. `altitude` and `stairs` under a roof, `gate` in the city). |
| `lock` | Mutation groups that can't fire here, so random world changes don't break the zone's look. Start from `LOCK`, `SHAPE_LOCK` or `SPACE_LOCK`. Add `'decor'` when the zone has its own decor, so the random planet mutation stays out of it. |

## World params (`world` in `src/world.js`)

Most params are the ones random mutations also change (`amp`, `seaLevel`, `propTheme`...). These are the special
ones, all off by default:

- **`cave: 1`:** a rock roof over everything (Crystal Caverns). `Terrain.ceilingHeight()` returns it.
- **`underwater: 1`:** you fly under the sea (Sunken Reef). The surface becomes the roof:
  `Terrain.ceilingHeight()` returns `seaLevel - 4`, and the player is held 7 m under the surface with a notice
  instead of crashing. The seabed is capped 60 m (`REEF_GAP`) under the surface and gets the land biomes, boats and
  whales float on the surface, and fish schools replace hot-air balloons. The water draws both sides and glows.
- **`grid: n`:** neon grid lines every `n` metres over dark ground, magenta low down to cyan up high (Neon Grid).
- **`voxel: n`:** the ground is built from `n`-metre blocks with steps a third of a block tall, one biome per block
  (Blockland).
- **`hillBase`:** scales the broad rise every mountain range sits on. `1` is normal; Salt Mirror uses `0.05` to stay
  flat.
- **`ranges`:** added to the mountain selector noise, so ranges spread over more of the land. `0` is normal; Hollow
  Peaks uses `0.55`.
- **`tunnels`:** `0..1`, the chance each 720 m square (`TUNNEL_CELL`) gets a tunnel bored through its mountain
  (Hollow Peaks uses `1`). A tunnel is a gently curving bore, 56–90 m wide, 42–68 m tall and 340–540 m long, with a
  flat floor and an arched roof. Both ends open at or above the ground, its floor never dips into the sea, and it
  never leaves its square. Squares where no heading runs deep enough inside a mountain get none. Tunnels are planned
  lazily per square and cached; `reseed()`, `Terrain.rebuildAll()` and zone changes clear the cache
  (`clearTunnels()`), so lock the shape mutations (`SHAPE_LOCK`) in a tunnel zone or the bores move under the
  player. `heightAt()` returns the tunnel floor inside a bore; `tunnelColumn()` gives the floor, the roof underside
  and the mountain top over it. Only chunks that touch a tunnel build the extra overhang mesh (`buildOverhang()`).
  For tests and debugging: `tunnelsNear(x, z, r)` lists the tunnels around a point, `tunnelPoint(T, t)` walks
  one's centre line.
- **`city: n`:** a street grid with solid buildings, one city block every `n` metres (Metropolis uses `112`). Each
  cell has its road along its low-x and low-z edges: 24 m streets (`CITY_STREET`), every 4th line a 40 m avenue
  (`CITY_AVENUE`), and 6 m sidewalks (`CITY_WALK`) around the block. A block becomes a park, a plaza (downtown
  only) or 1 to 4 lots split by 4 m alleys. Roofs sit on whole 3.6 m floors (`CITY_FLOOR`). How tall a lot grows
  depends on `cityDensity()`: downtown towers run 70–330 m, often a podium, a shaft and a narrower crown; the
  outskirts stay 9–60 m; about 6% of low-rise lots are building sites with a crane on top. The ground is clamped to
  a flat quay along the water, nothing is built in the harbour, and the sea gets no islands. Blocks are planned
  lazily from the seed and cached (capped at 8,000); `reseed()`, `Terrain.rebuildAll()` and zone changes clear
  the cache (`clearCity()`), so lock the shape and sea mutations (`SHAPE_LOCK`, `'sea'`, `'islands'`, `'scale'`) in
  a city zone or the buildings move under the player. `src/city.js` draws one mesh per chunk for all its buildings
  (one shared window texture) and places the street, park and rooftop props. For tests and debugging:
  `cityBlock(bx, bz)` gives a block's plan, `cityRoofAt(x, z)` the rooftop (or `-Infinity` off a building),
  `cityGround(x, z)` street level.
- **`curve`:** tiny-planet bend: everything is drawn lower by `curve · d²` (Planet Pebble).
- **`axisCurve` / `curveAxis`:** the same bend measured along one world axis only (`'x'` or `'z'`). Negative bends
  the ground **up**, like the inside of a ring (Ringworld uses `-1 / 2000` across `x`).

### The water line

Use `waterLine()` from `src/world.js`, not `world.seaLevel`, whenever you ask "where does the plane stop going
down?". It returns the sea level normally, and `-Infinity` underwater, where the seabed is the ground. The player,
camera, objectives (`groundAt()`), enemies and the HUD altitude all use it. Only pass it to `Math.max()` and
comparisons; never use it as a position.

### Ground with buildings on it (the city)

In a city zone, `heightAt()` returns the **rooftop** over a building and street level everywhere else, so building
walls are as solid as the ground: hit one and you crash (reason `'ground'`), Ghost Mode skims you onto the roof, and
the HUD altitude measures to the roof under you. `Terrain.surfaceHeight()` includes the roofs too. Use
`groundHeight()` when you need the ground **without** buildings (the terrain mesh is built from it); outside the
city it's the same as `heightAt()`. Anything placed with `groundAt()` (objective targets, for one) lands on the
roof when it's over a building.

### Flattened ground (runways)

The Land On The Runway objective (`src/runway.js`) flattens a rectangle of ground with `Terrain.flatten(x, z, yaw,
hw, hl, y, blend)`, which returns an id for `Terrain.unflatten(id)`. Underneath, `addPad()` / `removePad()` /
`clearPads()` in `src/world.js` feed `heightAt()`, so the mesh, collisions and props all see the flat strip, and
`padAt(x, z)` says how flattened a spot is (props don't stand on it). Zone changes clear every pad, and flattened
ground under a runway is cleaned up later. `landing` is a ground objective (`GROUND_OBJECTIVES`), so no-ground zones
skip it. If a new zone has tunnels or buildings, or no dry land worth landing on, list `'landing'` in its
`noObjectives` like Hollow Peaks, Metropolis and Sunken Reef do.

### Asking at an altitude (tunnels)

Over a tunnel, one spot has two grounds: the tunnel floor and the mountain top. `Terrain.surfaceHeight(x, z, y)`,
`Terrain.ceilingHeight(x, z, y)` and `groundAt(G, x, z, y)` take an optional `y` to pick one:

- `y` below the middle of the rock overhead: you're in the tunnel. Ground is its floor, ceiling is its roof.
- `y` above that, or no `y`: you're over the mountain. Ground is the mountain top, ceiling is `Infinity`.

**Pass `y` for anything that flies** (player collisions, stunt room checks, bullets, HUD altitude, the camera,
flying enemies, power-up spawns, the low-fly objective). **Leave it out to put something on the surface** (ground
enemies, objective targets that stand on the ground), so it lands on top of the mountain, not inside it. Outside tunnel zones `y`
changes nothing. In tunnel zones the camera is also held 3 m under a tunnel roof.

## Curvature (`src/curve.js`)

Both bends are visual only: heights, collisions and positions stay flat, so gameplay code never has to know about
them. A shader patch moves every vertex down by `CURVE · d²` (d = horizontal distance from the camera) plus
`AXIS_CURVE · a²` (a = distance along `CURVE_AXIS`). `Zones.update()` eases both values toward the zone's `curve` and
`axisCurve`, so the world bends in and back out over a few seconds. Sky things (dome, planets, decor) opt out with
`noCurve(material)`. `curveDrop()` gives the same offset on the CPU, for lining up HTML overlays.

## Checklist for a new zone

1. Add the entry to `ZONES` where it fits the journey.
2. New palette? Add it to `ZONE_PALETTES`. New sky? Add a preset to `TOD`. New props? `def()` them in
   `src/models.js` and map existing types to them with a theme in `THEMES` (`src/terrain.js`).
3. New decor? Add a branch to `Zones.buildDecor()` and lock `'decor'`. Use `noCurve()` on its materials.
4. New world param? Add it to `world` with a comment, defaulting to off, so every other zone is unaffected.
5. Run `npm test`. "every zone loads" counts the zones; raise its minimum when you add some. If the zone breaks a
   rule another check relies on (like "only the cave has a roof"), give it its own check rather than loosening the
   old one.
6. Look at it: open the developer menu (hold `1` + `0` for 3 s) and jump to the zone.

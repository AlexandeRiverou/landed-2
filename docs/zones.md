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
| `noObjectives` | Objective types this zone doesn't offer (e.g. `altitude` and `stairs` under a roof). |
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
- **`curve`:** tiny-planet bend: everything is drawn lower by `curve · d²` (Planet Pebble).
- **`axisCurve` / `curveAxis`:** the same bend measured along one world axis only (`'x'` or `'z'`). Negative bends
  the ground **up**, like the inside of a ring (Ringworld uses `-1 / 2000` across `x`).

### The water line

Use `waterLine()` from `src/world.js`, not `world.seaLevel`, whenever you ask "where does the plane stop going
down?". It returns the sea level normally, and `-Infinity` underwater, where the seabed is the ground. The player,
camera, objectives (`groundAt()`), enemies and the HUD altitude all use it. Only pass it to `Math.max()` and
comparisons; never use it as a position.

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

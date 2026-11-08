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
plans it, delegates to the Game Designer, Developer, DevOps, Security and
Documenter agents, and opens the PR. See
[`docs/agents.md`](docs/agents.md).

## Building, testing and releasing

```bash
npm ci            # three.js + Playwright
npm run check     # syntax check every module
npm run build     # offline-ready copy in dist/ (three.js vendored, no CDN needed)
npx playwright install chromium   # once
npm test          # boots dist/ in headless Chromium and plays through objectives, persuasion,
                  # world mutations, every objective, every boss, landing, taxiing
                  # and take-off, relax mode, lives, Game Over and Continue, the
                  # pull-up warning, par times, saved settings, the developer
                  # menu and the secrets;
                  # fails on any error
```

The **Build & Release** workflow (`.github/workflows/build-release.yml`) runs the same steps:

- **On every pull request into `main`:** check, build and smoke test, with the zipped build attached to the run.
  Then the **desktop** job packages the same `dist/` with Electron on Windows, Linux and macOS, boot-tests each
  package, and attaches `landed-<version>-{windows-x64,linux-x64,macos-universal}.zip` too. Nothing is published.
- **On every merge into `main`:** the same, then a new **GitHub Release** is published with
  `landed-vX.Y.Z.zip` (the web build) and the three desktop zips attached. The release waits for all three desktop
  builds, so a desktop failure blocks it (GitHub Pages still deploys). Each merge bumps the patch number (`v1.0.0` → `v1.0.1` → …). For a minor or
  major release, raise `"version"` in `package.json` (e.g. to `1.1.0`) in your PR, and the merge releases exactly that
  (logic in `scripts/next-version.mjs`). Re-running the workflow on an already released commit doesn't publish twice.
- **Pushing a `v*` tag by hand** releases that tag.
- **Every merge into `main` also goes live on GitHub Pages:** the smoke-tested `dist/` is deployed to
  **https://alexanderiverou.github.io/landed-2/**. "Run workflow" from the Actions tab on `main` redeploys it.
  Hand-pushed tags and pull requests never deploy.

To play the latest release, just open the GitHub Pages link above. To install one locally, download the zip from the
Releases page, unzip it, and serve the folder with any static server. Or grab the desktop zip for your OS, unzip it
and run `Landed.exe`, `landed` or `Landed.app` (see [Desktop / Steam build](#desktop--steam-build)).

**One-time setup for GitHub Pages** (repo admin): Settings → Pages → Build and deployment → Source: **GitHub
Actions**. Until then the Pages deploy job fails, but the release still publishes. Then check Settings →
Environments → `github-pages` allows deployments from `main` only.

## Desktop / Steam build

Landed also comes as a desktop app (Electron), ready to package for Steam. The web build stays exactly as it is: the
desktop build wraps the same `dist/` in a small shell that lives in `electron/`, a separate npm package, so the root
`npm ci` never downloads Electron.

```bash
npm run desktop:install   # once: Electron + electron-builder (npm ci --prefix electron)
npm run desktop:build     # web build, then package for the OS you're on -> export/desktop/
npm run desktop:start     # run it unpackaged in a window
npm run desktop:smoke     # boot-test the packaged app
```

It starts fullscreen (`F11` toggles it; `--windowed` starts in a window), runs fully offline, and adds FULLSCREEN and
QUIT buttons to the title and pause cards (`src/desktop.js`; browsers never see them). Building, testing, Steamworks
setup, the SteamPipe templates in `electron/steam/` and the release checklist are all in
[`docs/steam.md`](docs/steam.md).

## Controls

| Action | Keys |
| --- | --- |
| Climb / dive | `W` `S` or `↑` `↓` (`I` inverts, and it's remembered) |
| Bank & turn | `A` `D` or `←` `→` |
| Rudder | `Q` `E` |
| Boost | `Shift` (also on the ground) |
| Land | come in slow, wings level, gentle sink, onto flat dry ground |
| Taxi | on the ground: `A` `D`, `←` `→` or `Q` `E` steer; `Shift` boosts |
| Take off | on the ground: pull up (`W` / `↑`, or the touch stick up) |
| Shoot | `Space`, `J` or left click |
| Pause / music / mute all | `P` (or `Esc`) / `N` / `M` (music and mute are remembered too) |
| Relax Mode | `R` or the ☁️ Relax Mode button at the top |
| Fly again | on the Game Over card: the FLY AGAIN button, or `Enter` / `Space` (after 1 s, so a stray shot can't skip the card) |
| Continue | on the Game Over card, once you got past the first zone: the CONTINUE FROM *ZONE* button, or `C` (same 1 s lock) |
| Stunts | quick double-tap (two short taps, not a hold) `↑`/`W`: **Immelmann** (half loop + roll, you turn back and climb) · `↓`/`S`: **Split-S** (roll + pull through, you turn back and dive; needs 45 m below you) · `←`/`A` or `→`/`D`: **barrel roll** that slides you sideways, and nothing can hit you mid-roll. Holding a key to steer and pressing it again won't trigger a stunt |
| Touch | drag a finger anywhere to steer; BOOST / FIRE buttons on the right; flick twice the same way for the same stunts (a flick is a quick push: 80 px within 220 ms, so a slow wide steer never triggers one); on the ground the stick steers, and pushing it up takes off |

## What's in it

**Landing** (`src/player.js`): it's in the name. Touch down gently on flat dry ground and you land instead of
crashing: sink under 7 m/s, wings within about 25° of level, nose not pointed steeply down, and not mid-stunt. Come
in too hard, too steep or too banked, or hit water or a wall, and it's still a crash. Every touchdown kicks up dust
and gets a grade: **BUTTER!** (150 pts), **Nice landing!** (80), **Firm landing.** (40) or **That counts.
Technically.** (10). Points only pay after 15 s in the air since your last touchdown or respawn, so no hopping for
cash. On the ground you roll out to taxi speed; steer with roll or yaw, `Shift` boosts, shooting still works, and
pitch down and stunts do nothing. **Pull up to take off**: the plane speeds up and lifts off at about 31 m/s. Roll
off an edge and you're flying again; roll into a steep slope, a building or the sea and you crash. Metropolis roofs
and streets are fair game, and landing works in Relax Mode, so you can park somewhere nice and enjoy the view.
Ghost Mode skims the ground instead of landing. The first time you're low, slow and level over good ground (or nearly
land but crash), the game gives you a one-time tip.

**Pull-up warning** (`src/pullup.js`): the game looks 0.5–2 s ahead along your straight flight path. If the ground or
the sea is less than 1.5 s away, a soft red glow lights the bottom edge of the screen and a quiet beep sounds (faster
and a little higher under 0.8 s). No text, no flashing: the glow starts faint and grows to full strength as impact
gets to 0.5 s away. It stays quiet while you glide in to land on ground you could land on (the same flat, dry rule
the landing uses), but a slope, a wall or the sea behind that strip still warns. Level flight into a hillside and
a glide onto the sea warn too. It's off on the ground, while dead, in god mode and Ghost Mode, for the 3 s after a
respawn, and for the grace moment after the world changes (the terrain lifts you then anyway). Pull out with
less than 8 m under you and it's a **Close shave! +25** (at most once every 15 s; in Relax Mode it's bragging rights
only). It doesn't see cave roofs, and because it looks straight ahead,
weaving low over hills can warn late.

**Flying feel:** boost lasts 4 s from full and refills in 5 s, and pressing it goes *whoosh*. The wind gets louder
the faster you go. Your bullets hitting an enemy make a bright *tick*, getting hit still makes the crunch, and
kills and shot-off parts pop a floating "+N" where they happened. The camera jolts when you take damage and shakes
harder when you crash.

**Procedural world** (`src/world.js`, `src/terrain.js`): an infinite, chunked terrain built from seeded simplex noise. It has
ridged mountain ranges, mesas with sheer cliff walls, stepped terraces, river canyons, rock pinnacles, open sea with
islands, and beaches, deserts, forests and snow caps. In Hollow Peaks, big tunnels are bored clean through the
mountains. In Metropolis, the land is cut into a street grid of skyscrapers (`src/city.js` draws them). Chunks build
nearest-first and stream in as you fly.

**Shoot the ground, dig a hole** (`src/world.js`, `src/terrain.js`): every bullet that hits the ground blasts a crater
13 m wide and 4 m deep, with a fountain of dirt and a thump. Keep firing at the same spot and the pit grows fast (about
20 hits for a 38 m deep hole, up to 45 m deep and 45 m wide). Strafe across the ground and you plough a trench. Pits
are scorched brown, trees and props in them get blown away, and a pit dug below sea level fills with water. In Crystal
Caverns the roof stays where it is, however deep you dig.

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
ahead of you and carry a small red marker, so you see them coming. Five of them have their own trick:

- **Umbrella Goon:** bullets bounce off its umbrella. Circle round and shoot it in the back.
- **Grudge Rock:** a mossy boulder off a floating island, with a flower on top and a very cross face. It takes 4 hits,
  then breaks into 3 small, fast Grudge Pebbles that dive straight at you. They don't break any further.
- **Sniper Owl:** a red line means it's aiming. 1.5 s later it fires where you'll be. A stunt or a sharp turn
  (35° or more) breaks the lock. Never more than 2 at once.
- **Kite Twins:** two kites joined by a long string, and the string hurts. Go over or under it, or shoot one kite
  to snap the string.
- **Clingy Moth:** it latches onto your wing and drains your boost and hull. Any stunt shakes it off.

**The journey** (`src/zones.js`): every 3 completed objectives you fly on into a new zone with its own landscape,
colours, props, sky, weather and music mood. There are 30, in order:

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
- Sky Islands
- **Cloud Kingdom:** a soft white cloud sea below, and floating islands with cloud skirts, more of them than in Sky
  Islands. Each island carries a centrepiece: a castle, a gold-domed temple, a golden gate, a giant harp, a rainbow arch,
  a sky lighthouse, a winged statue or a balloon dock. Floating lanterns and sleepy cloud whales drift past, and it
  snows feathers. Every objective type works here.
- Stratosphere (above a sea of clouds) → Low Orbit (Earth below, black sky) → Meteor Belt (asteroids you can shoot
  apart)
- **Gas Giant:** no ground at all. Stripy cloud decks scroll far below, and a huge ringed planet hangs in a hazy
  orange sky.
- **Grumbleglobe:** a small, grumpy planet hangs in black space, and the whole planet is the boss. You meet it the
  moment you arrive (see "The world boss" under Bosses).
- The Moon (craters, Earthrise) → **Mars** (red canyons, dust, two tiny moons)
- **Planet Pebble:** a planet so small the ground visibly curves away toward a close horizon (`src/curve.js` bends
  every vertex down by its squared distance from the camera; gameplay stays flat).
- **Ringworld:** you live on the inside of a ring. The ground curves **up** on both sides across one axis and stays
  flat along it, and the far side of the ring arches overhead.
- Alien World. Then it loops for lap 2.

The current zone and how many objectives until the next show under your rank. Random world changes still happen inside
a zone, but can't break its identity. To add or change a zone, see [`docs/zones.md`](docs/zones.md).

**Music** (`src/music.js`): a calm soundtrack synthesised live in WebAudio, no audio files. There are 9 moods:
`day`, `dusk`, `dream` and `space`, plus `frost` (Frozen Peaks), `deep` (Crystal Caverns, Sunken Reef), `ember`
(Volcano Land, Grumbleglobe), `retro` (Neon Grid) and `wonder` (Mushroom Forest, Candy Kingdom, Alien World). Each mood starts on
its signature sound, then the music moves in sections of 4 chords. Every section picks a new chord progression (each
mood has 3–4), a new top layer (plucks, a soft arpeggio, a little call-and-answer melody, a pulsing bass, or just
pads), a new pad colour and a slightly different brightness. Now and then it steps to a nearby key, and the next
section usually steps back home. So it doesn't loop, but it stays the same mood. `N` toggles the music, and the game remembers your choice.

**Power-ups** (`src/powerups.js`): a spinning gift floats into view ahead of you about once a minute (the first after
40 s; never more than one waiting), and every boss drops one. Most last about half a minute (Time Freeze 14 s, Double
Points and Objective Radar 45 s), shown with a countdown in the bottom-left: Bubble Shield, Rapid Fire, Triple Shot, Homing Bullets, Turbo, Slow-Mo, Time Freeze, Double Points,
Repair Kit, Ghost Mode (can't crash into the ground), Mega Plane, Tiny Plane and Objective Radar.

**Progression** (`src/progression.js`): your score is XP. Each level promotes you to a new rank (Cadet Who Means Well
→ Sky Intern → … → Supreme Commander Of Up) and grants a permanent perk for the flight: more hull, faster boost
recharge, higher fire rate, longer and more frequent power-ups, harder-hitting bullets... The XP bar is under your
score, and your best run is remembered on the title screen. Every promotion also fully repairs your hull ("Hull
repaired!").

**Lives and Game Over** (`src/player.js`, `src/main.js`): you get three planes per run, shown as hearts (❤️❤️🖤)
above HULL and BOOST in the bottom-left. Every crash costs one, whether it's an enemy, the ground or the water, and
you respawn with a full hull and a note telling you how many are left ("2 lives left…", "Last life!"). Crashes in
Relax Mode are free. The hull doesn't patch itself quickly: it only starts mending after 10 s without a hit, at 1 hp
a second (the "Hull repairs twice as fast" perk doubles that). Breaking away from a boss mends it sooner and faster
(see Bosses). The real fixes are levelling up and the Repair Kit. Beating a boss earns a spare plane (+1 ❤️, up to 5;
after that the banner just says "Hangar full").
Lose the last plane and, once the explosion clears, the **Game Over** card shows your score, level and rank,
objectives and kills, and your best run (or "New best run!"). The game is paused behind it. Hit FLY AGAIN (or `Enter`
/ `Space`) for a fresh run right away, no reload: score 0, Level 1 with no perks, three lives, no power-ups, back to
the first zone on a new landscape. Found secrets stay found.

Got past the first zone (or onto lap 2)? Then the card also offers **CONTINUE FROM** *ZONE* (or `C`): the same fresh
run, but in the zone (and lap) you reached, on a new landscape. Score, level and perks still start over. That run's
Game Over card says "Continued from *zone*". The title card remembers the furthest zone you've ever reached ("🗺
Furthest: Dune Sea (zone 4 of 30)", plus the lap after lap 1). Only flying on into a zone counts: a developer-menu jump
doesn't by itself, but flying on from where it put you does.

**Bosses** (`src/enemies.js`, `src/bossmoves.js`, `src/objectives.js`): a crowned boss shows up after every 4 to 7 completed objectives
(a fresh random gap each time). There are 15, drawn from a shuffled deck so you meet them all before any repeats:

- King Drone the Unpleasant: hops from throne to throne behind a ring of minion bodyguards, and sometimes yells
  CHARGE and sends them at you.
- Her Royal Honkness the Goose Queen: head-on jousts, dropping golden eggs as she passes.
- The Mothership: blinks to a new spot (a green disc marks it first), fires orb shotguns, and once ENRAGED, a tractor beam.
- Thunderclaus: looms high up ahead of you and calls down lightning where you're going. Each strike is marked first by
  a yellow ring under the cloud, a yellow ring where the bolt lands and a thin pale line between them. Don't fly
  between the rings.
- Baron von Blimpenstein: bombing runs across your path. Don't fly under him. Shoot the gondola.
- Empress Wobblina: swims in pulses, leaves stingers floating behind her, and fires rings of goo with a safe hole in
  the middle.
- Gary Prime, Gary's dad: flies alongside you as your mirror. Hold the trigger 1.5 s and he rolls out of the way, so
  use short bursts. Shoot the propeller.
- Queen Bee-atrice: darts around inside a shell of bodyguard bees. Pop the shell and she's exposed.
- Don Pigeone the Godfeather: sits on a perch, sends "associates" and air mail rings, and moves house when you hit
  him too often (or you wander off).
- Steven the Seagull Overlord: circles high, then dive-bombs (a shadow ring warns you). Dodge and he faceplants. A hit
  steals your boost.
- The Mother of All Spiky Balloons: guarded by a spinning ring of mines. Find the gap. Mind the spike nova.
- Fort Grumpington (a ground boss; never in space): pops up to fire mortars at marked rings, then ducks. Shoot it
  while it's up, and aim for the barrel.
- Admiral Inkworth the Sky Octopus (a lead boss): jets away and back behind ink clouds, lobbing ink and orb spirals.
  Every tentacle shot off means fewer orbs.
- Captain Clawdia the Sky Crab (a lead boss): snaps sideways between lanes in front of you. Bubble streams, pincer
  shots. Snap the claws off.
- Sir Puffington the Pufferfish (a lead boss): water jets, then puffs up (bullets bounce off) and drifts at you, then
  pops a spike nova and is dazed for a moment. Shoot him while he's small.

Every area attack shows up first as a translucent disc, ring or column, at least 1 s before it hits. Dodge a big move
(a dive, a joust, the tractor beam) without getting hurt and you get "+25 Dodge!" and the boss is dazed for 1.5 s.
A dazed boss has yellow stars over its head and takes 1.5× damage.

From the third boss on, they can roll a modifier (Jumbo, Turbo, Furious But Fragile, Shiny for double points). From the
fourth on, they can show up as twins that share one health bar. Most bosses circle you; lead bosses fly ahead of you,
facing back and weaving side to side, so they're always in your sights. Lead bosses won't ram you while swinging back
in front, and hold their fire while they're behind you.

**Breaking away:** once a flying boss has been on you for 4 s, fly away and it lets you go ("Clean getaway! The Goose
Queen is sulking."). A circling boss can't keep up while you fly off from it: past half its orbit it goes at most 70%
of your speed and gives up any charge it was making, and after 3 s of that out past its orbit it lets you go. Gary
Prime and Steven never start a strafing run or a dive from behind a plane that's flying away. While it's lost you
the boss hovers near the spot where it lost you and doesn't attack at all: no shots, summons, dashes, bombs, mines,
dives or signature moves (its marked attacks and bodyguards go too). Its minions back off too and spawns pause for 3 s. The boss bar dims and says "(lost you)". Shoot it while it
sulks and it fights back at once. While every boss in the fight has lost you or is coming back, your hull starts
mending after 3 s instead of 10, at three times the rate. The break lasts up to 8 s of flying away, and ends early once
you're 650 m out. Then it comes back, closing at most 30 m/s faster than you fly away, and stops about 150 m further
out than it fights from. There it waits ("The Goose Queen is waiting for you. Your move."), and the boss bar says
"(your move)". Keep flying off and it keeps pace without attacking (and your hull mends at the normal rate). Round two
starts when you fly back in to about 60 m beyond its fight distance, shoot it, or spend 4 s not flying away. Its
first attack comes a couple of seconds later (sooner if your shot woke it), and it's never a strafing run or a dive.
Run off again without hurting it and the next break is shorter (6 s, then 4.5 s, never under 4 s); land a hit and
you get the full 8 s again. Fort Grumpington sits on the ground and never loses you.

Bosses taunt you (never while they've lost you), and get ENRAGED below half
health. Shooting off parts weakens them (the crown makes them take more damage, Gary Prime's propeller slows him, the
fort's barrel cuts its mortars, the octopus's tentacles and the crab's claws thin out their attacks). Each boss adds HP. Defeating one pays 400+ points, gives you a spare plane
(see Lives) and reshapes the world like any other win.

**The world boss** (`src/planetboss.js`): in the Grumbleglobe zone (zone 25, after Gas Giant) the first objective is
the planet itself: **Grumbleglobe, the Planet With Opinions**. It takes that stretch's boss slot, but it's not one of
the 15: it's never in the deck, never rolls a modifier and never comes as twins. A planet with a 160 m radius grows in
760 m ahead of you. It never moves. It spins.

The planet is solid. Fly into it and you lose a life ("You hugged the planet. It did not hug back."), then come back
450 m out, facing it. Bullets and orbs stop at its surface, and the pull-up warning sees it. Bare rock takes no
damage ("That's just rock. Shoot the gadgets!"). The gadgets do, and every hit on one drains the boss bar (gold
sparkle):

- **6 red turrets** (3 HP): aimed orbs. They only fire within 450 m, and only when you're above their horizon, so the
  far side never shoots through the planet. The barrel tip glows first.
- **3 cyan shield generators** (6 HP): while any stands, a bubble guards the eye. Red markers show them.
- **4 orange magma vents** (3 HP): a column warning along the surface, then an eruption. Shots bounce off a vent
  while it erupts.
- **2 yellow sweepers** (6 HP): a 120 m bar spinning over the surface. A barrel roll passes through it.
- **The eye** (14 HP): almost a third of the bar, and breaking it ends the fight. Once the shield is down the planet
  stops spinning. When the eye is due, it grinds round to turn its face toward you; the rest of the time it holds
  still, so you can always reach a gadget. The eye opens for 5 s every 9 s, once the face is within about 40° of you
  (after 6 s it opens anyway).
- **The crown** on the north pole (optional): knock it off and every gadget takes 30% more damage.

At 66% it's properly awake: 3 drones come out of its pores, it spins faster, and the turrets fire in pairs. At 33% it
cracks ("MELTDOWN!"): the eye stays open 6 s, Grudge Rocks come out, the vents erupt more often, and each time the eye
opens it glares. A thin magenta sight line points at where you'll be in 1 s, then a short, steady beam fires along it
(no flicker, and it never fills the screen). If it comes from behind you, "Grumbleglobe is glaring at your back.
Swerve!" warns you.

Fly more than 500 m out to patch up faster; the planet never chases you. Relax Mode puts it to sleep, and it wakes up
where you left it, broken gadgets still broken. Slow-Mo and Time Freeze work on it, and Homing Bullets curve to the
nearest gadget you can hurt right now. On lap 2 the gadgets have 1.4× HP. When it goes, its gadgets pop one by one and
it splits into 8 rubble asteroids (shoot them if they bother you; they can't hurt you for the first 3 s). It pays 1.5×
a regular boss and a spare plane, and its par is 110 s.

**39 objective types** (`src/objectives.js`, `src/challenges.js`, `src/quests.js`):

- *Hoops:* hoop, tiny precision hoop, timed speed hoop, a hoop that wanders around, a hoop that shrinks until it's gone.
- *Ring chains:* slalom, corkscrew, climbing staircase, downhill dive, and a time trial.
- *Collecting:* stars, balloons to fly into, a long wiggly star trail, a shooting gallery of balloons you have to shoot.
- *Chases:* catching the golden goose, following Larry (Gary's nice cousin) or Professor Honk in formation.
- *Stunts:* loop-de-loop (detected from your pitch rotation), flying upside down, going really fast, crop dusting (low
  flying), climbing to an altitude. In Crystal Caverns a loop is tighter while you keep pulling (boosting doesn't make
  it bigger), it tucks harder near the roof, and "Roof! Pull harder!" warns you. Loops and upside-down objectives
  there point you to a glowing crystal dome with a "LOOP HERE ↺" sign, over a tall chamber. Loops anywhere still count.
- *Places:* buzzing a giant landmark, a three-stop sightseeing tour, flying under a stone arch, shooting a bullseye
  painted on the ground, and **Land On The Runway** (`src/runway.js`): a 24 × 180 m strip with lights and piano
  keys, flattened into the ground 520–820 m ahead. Touch down on it, then roll along it for 2 s or slow below
  12 m/s. If there's no dry land nearby, it makes you a little runway island. Not offered in Hollow Peaks, Metropolis,
  Sunken Reef or the zones with no ground.
- *Fights:* the pigeon hunt, pest control (shoot down any 5 enemies), and Hold The Line: survive 40 s of 4 waves
  ("WAVE 2/4"), each bigger than the last. Later waves come at you from the sides and (in open sky) from above, and
  the final wave opens with three groups at once. Every kill mends 3 hull. Getting shot down knocks 15 s off the
  clock instead of starting over, and after the second time the enemies ease off on their own. "THE LINE HELD!"
  pops whatever's left. Worth 250.
- *Quests* (new verbs, `src/quests.js`):
  - **Pizza Delivery:** fly into the pizza box, then take it to the drop-off pad under the light beam (over a void or
    in space it's a floating mailbox). It cools 2.4% a second once you have it. At 0% the customer eats cereal and
    you fail.
  - **Barrel Roll:** do 2 or 3 full rolls with the double-tap left/right stunt. Ordinary banking doesn't count.
  - **Rival Race:** Gary, in a purple plane, races you through 5 or 6 rings. The white one is the finish. If he gets
    there first, you lose.
  - **Constellation:** 6 to 8 numbered stars make a heart, the Big Dipper, a lightning bolt or a snake. Fly through
    them in order and the guide lines light up. Out-of-order stars don't count.
  - **Sneak Past The Searchlights:** fly through the green hoop while two lamps, one each side of it, sweep their
    beams opposite ways (on towers, or floating eyes where there's no ground). The beams cross the hoop in turn and
    tilt toward your height, so flying low won't save you. 0.6 s in a beam and you're spotted; the second time, you
    fail. Tip: wait out of reach, then boost in right behind a beam.
  - **Hot Potato:** carry a birthday cake with a 12 s fuse. Each ring adds 7 s (16 s max). Six rings and it pops into
    confetti. Let the fuse run out and your windscreen gets frosted.
  - **X Marks The Spot:** a glowing red X with an orange light beam sits on dry ground 400–550 m ahead. You have no
    shovel. You have guns. Shoot the X until the hole is 10 m deep and a treasure chest pops out. Not offered in the
    zones without ground or in the Sunken Reef.
  - **Sky Melody:** fly through numbered notes in order to play Twinkle Twinkle Little Star, Ode To Joy, Mary Had A
    Little Lamb or Frère Jacques. A wrong note starts the tune over. It never fails, it just judges you.
  - **Catch The Falling Stars:** catch 5 shooting stars before they hit the ground. Not offered in zones without
    ground (Stratosphere, Low Orbit, Meteor Belt, Gas Giant), Crystal Caverns or Sunken Reef.
  - **Photo Safari:** keep the shy sky whale centred on your nose, within 180 m, for 3 s to take a photo. It needs 3
    photos and bolts after every flash.

**Par times and rewards:** a run's first hoop sits nearly straight ahead (within about 20°), 300–450 m out, so it's
on screen from the start. Each objective card shows a par time ("⏱ Par 12 s · beat it for +60") until the clock passes
it; finish under par for a +60 speed bonus. Par is 12 s for a hoop or an altitude climb, 14 s for the tiny and
shrinking hoops, 15 s for the wandering hoop, 18 s for the searchlights, 25 s for the slalom chain, 10 s for a loop,
8 s for a barrel roll or a bullseye, 30 s for the tour or a photo safari, 40 s for a pizza delivery or a hot potato,
and 50 s for stars. The speed hoop gets 60% of its clock (17 s); Hold The Line has no par (it always takes its full
clock); everything else, regular bosses included, gets 25 s (Grumbleglobe gets 110 s). Hints
cost points (the "hint fee", 12 per persuasion tactic, never below 20 points left), except on the first 3 objectives of a run: "Hints on the
house". The success banner keeps it short, at most 4 lines for 3.5 s: the points, one detail line (speed bonus, hint
fee, spare plane), the headline world change and "+K more world changes. Look around!". When a win takes you into a
new zone, it shows the points and "New zone: X!" and lets the zone card do the rest.

Adding a type: write a maker that returns `objective({...})` (in `src/challenges.js` or `src/quests.js`), then add
`['name', weight, maker]` to `TYPES` in `src/objectives.js`. The developer menu and the smoke test's start/complete
loop pick it up on their own. If it needs ground, add it to `GROUND_OBJECTIVES` in `src/zones.js`; to keep it out of
one zone, list it in that zone's `noObjectives`.

**Relax Mode** (`src/main.js`): press `R` or the ☁️ Relax Mode button to take a break. Objectives and enemies leave,
no new power-ups spawn, the HUD fades, cinema bars slide in and the music turns dreamy (spacey in space) until you leave. The world stops changing, and
crashing doesn't cost a life, so if you like where you are, stay a while. Press it again ("Back to the action") to return. A boss you left behind comes
back first. Grumbleglobe doesn't leave: it dozes (eye shut, no attacks, no damage) and wakes up when you're back.

**Persuasion engine** (`src/persuasion.js`): a "neglect" meter fills while you're not making progress. It fills faster
when you fly away and barely moves while you close in. The first tactic comes after 20 s of neglect, then one every
14 s of neglect, and never two within 15 real seconds of each other, so even flying the wrong way gets you some peace.
The "wrong way" nag comes at most every 25 s, and never during a fight with a flying boss (circling round for a pass
is a tactic). In a fight with a flying boss, flying off doesn't speed up neglect, and while every boss has lost you or is
coming back there's no "getting warmer" note. A persuasion tactic that pulls the boss closer never moves one that's
on a break, and never pulls one closer than where it would wait for you. The game escalates through 37 tactics in three tiers:

- *Mild:* nagging, guilt trips, pro tips, GPS distance, a promotion for the edge arrow (from the start, a small faint
  white arrow points at any objective that's off screen; the first promotion makes it a normal one, the second big,
  pink and "THIS WAY!!!"), sonar beeps panned toward the target,
  a 900 m light beam, reverse psychology ("Whatever you do, do NOT go to..."), a petition begging you to go (the
  signatures pile up over the next few seconds), and **hot & cold**: for 35 s the objective card tells you how warm
  you are, from ❄️ FREEZING to 🔥 ON FIRE.
- *Pushy:* the hoop gets **bigger**, giant "HERE!!!" text, a 3D arrow on your nose, breadcrumb orbs, a balloon-held sky
  billboard, fireworks at the target, the **sun moved behind the objective**, fog cleared, enemies bribed into a coffee
  break, sad rain, lowered requirements, magnet mode, a **cheer squad** (confetti and applause every time you turn to
  face the target), a floating **red carpet** lined with torches, a **limited-time offer** (+100 if you finish within
  60 s, with a countdown on the card), **skywriting** ahead of you (TURN LEFT, TURN RIGHT, STRAIGHT ON or U-TURN, in
  cloud letters), and a **cinematic look**: the camera swings to the target for 2.6 s and back. It never touches your
  controls.
- *Desperate:* the objective **walks over to you**, a steering tailwind, a **rainbow road**, a tunnel of practice rings,
  a **paper-plane escort** (a V of 5 that leads the way and waits for you), a **trail of gold coins** (+10 each), an
  **ultimatum** (30 s, counted down in notifications), the mountains are told to sit down (the terrain flattens; not in zones without ground), free
  unlimited boost, the objective teleported right in front of you... and finally, after about 3 minutes of ignoring
  it, a **participation trophy**.

The pacing knobs (`FIRST_NEGLECT`, `NEGLECT_STEP`, `MIN_GAP`, `WRONG_WAY_GAP`, `TROPHY_STAGE`) sit at the top of
`src/persuasion.js`. A tactic that needs to turn the camera sets `G.camPeek = { at: Vector3, w: 0..1 }` (`w` is how far
the view turns toward `at`); `Persuasion.clear()` resets it.

**World mutations** (`src/mutations.js`): every success applies 3–6 random changes from 24 kinds, and the count grows the
better you do. They include time of day (night, sunset, alien lime sky, eclipse...), weather (rain, snow, confetti,
bubbles, leaves, glitter), terrain palette (11 palettes), mountain height, sea level, cliffs and terraces, canyons, spikes,
mesas, prop theme ("The Duckening", gnome invasion, candy forest, the Cloud Kingdom annexing the place...), prop size
and density, floating islands, continental drift (a whole new map), your plane's paint job, an engine upgrade, cloud styles, planets and moons, fog, and party hats
for every enemy. The terrain morphs chunk by chunk around you, and if a mountain grows under you, you get relocated
upward for free.

**Secrets** (`src/secrets.js`): there are 10 Easter eggs hidden in the game. Some you type, some you fly, some only
show up on certain days. The title card counts how many you've found and drops a cryptic hint for one you haven't, and
found secrets are remembered between flights. The full spoiler list is in [`docs/secrets.md`](docs/secrets.md).

**Settings and comfort** (`src/main.js`): pitch invert (`I`), music (`N`) and mute (`M`) are saved in the browser
(`localStorage['landed-settings']`), and take-off reminds you of any that aren't the default ("Remembered: pitch
inverted, music off. (I / N / M to change)"). If your system asks for reduced motion, the game drops the camera shake
and the persuasion engine's cinematic camera turn, stops the HUD marker and the big edge arrow from
throbbing, and halves every screen flash. The crash flash is softer for everyone.

**Phones and tablets** (`style.css`, `src/main.js`): in portrait the camera widens its view (up to 95° vertical), so
about as much of the world fits across as on a landscape screen. The score and the objective card sit side by side at
the top, the boss bar and the success banner get a full-width strip under them, and messages go below that. On a touch
screen (a coarse pointer) the title card shows touch controls instead of keys, and the Game Over card leaves out "C to
continue.".

## Debugging

`window.G` holds the whole game state. `G.step(dt)` advances the simulation without rendering, which is handy for
scripted tests in a headless browser.
`G.audio.music.section` shows what the music is playing right now (mood, progression, texture, pad colour, key
shift, section number).

**Secret developer menu** (`src/devmenu.js`): during a flight, hold `1` and `0` together (top row or numpad) for 3
seconds. On a touch screen, hold one finger in each top corner of the screen instead (each corner is a square 15% of
the screen width, 60–120 px). A small "Developer menu… 3s" pill counts down while you hold; let go early, or slide a
finger out of its corner, and nothing happens. The menu pauses the game, silences the engine and ducks the music.
Close it with `Esc`, the ✕ button, or the same 3 s hold. It's a testing aid, so it's deliberately left off the title
card.

- **Zones:** jump straight to any of the 30 zones (the next zone change is a full zone's worth of objectives away).
- **Bosses:** start any of the 15, with an optional modifier and the Twins checkbox. Fort Grumpington needs flat land;
  where there is none, King Drone comes instead and you get a notice. The fort never comes as twins. The
  **Grumbleglobe** button jumps to its zone and starts the planet fight (it ignores the modifier and Twins).
- **Objectives:** start any of the 39 types. Types the current zone doesn't offer are greyed out.
- **Power-ups:** grab any of the 13.
- **Cheats & tools:** God mode (no damage, and you skim the ground, sea, cave roof and tunnel roofs like Ghost Mode;
  any crash that still happens costs no life), Relax Mode on/off, Complete objective, Level up (a real promotion: a
  perk and a full hull), Lose a life (crashes on the spot and costs a life even in god mode, so you can reach the Game
  Over card fast; in Relax Mode it crashes you for free), Clear enemies (bosses and objective
  targets stay).
- **Secrets:** trigger any of the 10 (it plays the effect and counts as found; hover a button for its hint), and
  **Forget found secrets** to start the hunt over.

Starting a boss or objective replaces the current one and turns Relax Mode off. While the menu is open, gameplay keys
don't reach the game (`G.input.lock`), so `Space` won't fire behind it.

From the console: `G.devmenu.open()` / `G.devmenu.close()`, `G.player.god = true`, and
`G.objectives.startType('stars')` to start one objective type right now (unknown types are ignored; it doesn't check
whether the zone allows it, and it doesn't clear the current objective, the menu does that first).
`G.secrets.list()`, `G.secrets.trigger('konami')` and `G.secrets.reset()` work on the secrets, and
`G.secrets.checkDate(new Date(2026, 9, 31))` pretends it's Halloween. `G.player.landed` is set while you're on the
ground, `G.player.lastLanding` holds the latest touchdown (`{ grade, title, sink, bank, points, x, z }`), and the
player pushes a `'landed'` event on each one. `G.player.lives` is the lives left (set it high, e.g. `1e6`, for a
script that crashes on purpose; the HUD then shows `❤️ ×N`), `G.gameOver` is true while the Game Over card is up,
`G.endRun()` shows that card right now, and `G.flyAgain()` starts a fresh run from it (`G.flyAgain(true)` continues
from the current zone, without checking that you got past zone 1). `G.progress.furthest` is the furthest zone reached
(`{ index, lap }` or `null`, saved in `localStorage['landed-furthest']` and checked on load); `G.progress.reachZone(index,
lap)` records one if it's further. `LIVES`, `MAX_LIVES`, `REGEN_DELAY`, `BREATHER_DELAY`, `BREATHER_REGEN` and the
boost tank (`BOOST_DRAIN`, `BOOST_REGEN`) sit at the top of `src/player.js`, which also exports `LAND` (the landing
limits) and `Player.landableAt(x, z, y, ground)`, the "could you land here" test the landing and the pull-up warning
share. `PAR` (par times per type) and `FREE_HINTS` sit above `TYPES` in `src/objectives.js`; each objective gets
`par` when it starts, unless its maker set its own (`par` in `objective({...})`, like Grumbleglobe's 110 s).

`G.pullup` is the pull-up warning: `on`, `tti` (seconds to impact, `Infinity` when clear), `shows` (warnings so
far) and `glow` (the bottom-edge element; its inline `style.opacity`, 0.35–1, shows the urgency); the look-ahead (`PROBE`, `WARN`, `URGENT`) and the close-shave rule (`SHAVE`) sit at the top of
`src/pullup.js`. `G.shake(amp, dur)` jolts the camera (metres, seconds; a bigger jolt already running wins) and
`G.camShake` holds the running one. `G.comfort.reducedMotion` mirrors the system setting; set it by hand to turn off the shake,
the camera peek and the strong flashes (the CSS animations follow only the system setting).
`G.fx.popText(pos, text)` floats a score number up from a world position (at most 6 at once).
`G.audio.tick()` (your hit), `whoosh()` (boost) and `pullUp(urgent)` are the feedback sounds, and `G.audio.setEngine(ratio, on, wind01)` takes
the wind level (0 at cruise, 1 at full boost). Touch flicks are tuned by `FLICK_OUT` and `FLICK_MS` in
`src/input.js`. The render loop clamps each frame's `dt` to 0–0.05 s, so a clock that jumps
backwards never runs time in reverse. Boss breakaway tuning sits at the top of `src/enemies.js`: when it lets
you go (`ENGAGED_T`, `PURSUIT`, `BEHIND_T`), how long the break lasts (`LEASH`, `LOOSE_T`, `LOOSE_SHRINK`,
`LOOSE_MIN`), the loose hover (`LOOSE_SPEED`, `LOOSE_BRAKE`, `LOOSE_BRAKE_T`), the return and the wait (`RETURN_GAIN`,
`STANDOFF`, `STANDOFF_HOLD`, `WAIT_NEAR`, `WAIT_T`, `WAIT_DRIFT`) and the attack holds (`CHASE_HOLD`, `REENGAGE_CD`,
`REENGAGE_HIT_CD`). A per-boss `leash` overrides `LEASH`, and `bossStandoff(def)` (exported) gives the distance a boss
waits at. `G.enemies.breather` is true while every boss alive is `'loose'` or `'catch'` (not while waiting); each boss
has `chase` (`null` when engaged, `'loose'`, `'catch'` coming back, or `'wait'` at the standoff), `chaseT` (s in that
state), `home` (where it lost you), `waitT` (s you've spent not fleeing while it waits), `fresh` (its next attack is
the first after a break: no charge), `looseMax` (this break's length), `breaks` (breakaways in a row without damage),
`behind` and `behindT` (s you've been flying off from it while engaged). An engaged boss is never sent back for
being far away (a fresh one can spawn past the leash).

Boss signature moves live in `src/bossmoves.js` (`MOVES`). Each boss def in `BOSSES` names its `move`; `orbit` and
`lead` are still its fight distance (breakaway, standoff). A move keeps its state in `e.mv`, which a breakaway or the
boss's death clears, along with its hazards and bodyguards (enemies whose `e.guard` is `{ boss, kind, slot }`; not the same thing as the `guard` TYPES flag below). `G.enemies.warn(pos, r, color,
t, onFire, { shape, owner, h, dir })` puts down a telegraphed area attack (`shape` is `'disc'`, `'ring'`, `'column'` or
`'sphere'`; `t` is at least 1 s; `dir` stands a column along a unit vector instead of straight up, like a planet's
surface normal), then calls `onFire`. New enemy `TYPES` flags: `guard` (front hits bounce off),
`split: [type, n]` (breaks into n of another type), `max` (at most this many alive), `pair` (spawns as two joined by a
string), `latch` (clings to the plane) and `quiet` (no intro). `CEILING` (exported, 18) caps regular enemies alive
at once, whatever spawns them; boss bodyguards don't check it. `G.enemies.frenzy` is `null`, or during Hold The Line
`{ wave, easier, burst, score }`; `WAVES` (exported) has each wave's spawn interval, cap, and flank/overhead chances,
and gulls, bees and Grudge Pebbles count a third each toward a wave's cap. In caves, `loopDome(G)` (exported from
`src/objectives.js`) finds and marks the loop chamber (or returns `null`), and the loop tuck is `TUCK` (exported from
`src/player.js`, 1.5×) with `G.player.loopTuck` the current value (the loop's `easier()` raises it by 0.25, up to
2.2, and it resets when the objective ends).

The world boss lives in `src/planetboss.js`. Its tuning sits at the top: `GLOBE` (size, spawn, spin, face turn,
respawn, breather, phases, lap and reward), `KINDS` (each gadget's HP, its `worth` on the 100-point bar, score and
line), `LAYOUT` (where each gadget sits), and `TURRET`, `VENT`, `SWEEP` and `EYE`. A zone with `siege: 'grumbleglobe'`
starts it as its first objective (`G.objectives.startSiege()`, which the dev-menu button calls). The planet is one
entry in `G.enemies.list` with `e.planet` set (the `Globe`), which runs its own update; `G.enemies.planet()` returns it
while it's awake. Each gadget is a boss part with `counted: true` and `mult = worth / hp`, so every hit drains its
share of the bar. In Relax Mode it waits in `G.objectives.held`; leaving its zone ends the fight
(`G.objectives.endSiege()`).

The whole `G.secrets` API, and how to add a
secret, is in [`docs/secrets.md`](docs/secrets.md) (spoilers).

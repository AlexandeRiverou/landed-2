# Secrets: the full list, and how to add one

> **Spoiler warning.** This page lists every secret in Landed and exactly how to trigger it. If you'd rather find
> them yourself, stop here: the title card counts what you've found and drops a cryptic hint for one you haven't.

All of it lives in `src/secrets.js`. There are 10 secrets.

## The secrets

| Secret | Kind | How to find it | What happens |
| --- | --- | --- | --- |
| **Thirty Lives (Not Included)** | keys | Mid-flight, type the Konami code: `↑ ↑ ↓ ↓ ← → ← → B A` | Rainbow plane (and a rainbow trail) for 30 s. Entering it again replays it. |
| **The Duckening** | keys | Mid-flight, type `QUACK` | A quack, and every prop turns into ducks. In zones with props of their own (city, reef, cave, candy, ...) you get a "dress code" line instead and nothing changes. |
| **Say His Name** | keys | Mid-flight, type `BOGEY` | "Bogey? That's just Gary." Gary flies across your nose for 7 s, waves, and leaves. He's scenery: he can't hurt you and you can't hit him. |
| **Golden Honk** | keys | Mid-flight, type `GOOSE` | Professor Honk honks twice, golden feathers, and +50 points. Pays once per flight; after that he just honks. |
| **Spooky Season** | date | Play on October 31 | The `halloween` sky, `spooky` weather (embers and bats) and spooky props (dead trees, castle towers). |
| **Snow Day** | date | Play on December 24, 25 or 26 | Snow. |
| **Upside-Down Day** | date | Play on April 1 | The title reads "Crashed", the button says FALL UPWARDS, the HUD says POINTZ / HULK / ZOOM, and every rank name is wrong. |
| **Edge Of Space** | feat | Climb above 1100 m in a zone with ground (not space, not a cave, not the reef) | "There's nothing up here. Go back down." Re-arms once you drop back below 950 m. |
| **Lawnmower** | feat | Fly upside down less than 5 m above the ground or sea for 3 s in a row | Grass clippings everywhere. |
| **Title Tinkerer** | title | Click or tap the "Landed" title 7 times, each within 1.5 s of the last | The title does a barrel roll. |

A few details:

- **Typed words and the Konami code only count mid-flight.** They're ignored on the title card, while paused and
  while the developer menu is open. Other keys in between (`Space`, `Shift`, arrows) don't break a word.
- **Date secrets are checked once, at boot.** Their world look only applies in an ordinary zone (at boot that's the
  start zone), so caves, the reef, the city and space keep theirs. Flying on to the next zone puts that zone's own
  look back. The title card shows a holiday line, and the "Secret found" toast waits until you take off.
- **Re-triggering** a found secret plays its effect again but doesn't show a new toast.

## Found secrets

The first time you find one, a gold toast pops up ("🥚 Secret found: Name (n/10)") with a sparkle sound. Found ids
are saved in `localStorage['landed.secrets']`, so they survive reloads. The title card shows
"🥚 Secrets: n/10 · Hint: ..." with a hint for a random secret you're still missing.

To forget them all: the developer menu's **Forget found secrets** button, or `G.secrets.reset()`.

## Adding a secret

1. Add a row to `SECRETS` in `src/secrets.js`: `{ id, name, kind, line, hint }`. `name` shows in the toast, `line`
   under it, and `hint` on the title card (keep it cryptic).
2. Add an `fx_<id>()` method to the `Secrets` class. It plays the effect. `trigger(id)` calls it and records the find,
   so the developer menu and tests get it for free.
3. Hook up the detector:
   - **A typed word:** add `WORD: 'id'` to `WORDS`. Nothing else needed.
   - **A date:** add `{ id, on: (m, d) => ... }` to `DATES`. `m` is 0-based, like `Date.getMonth()`.
   - **Anything else** (a flight feat, a click): detect it yourself, in `update(dt)` or an event listener, and call
     `this.trigger('id')`. Arm it so it doesn't fire every frame (see `edgeArmed` and `mowArmed`).
4. Add a check to `scripts/smoke-test.mjs` that finds it through its real path where practical, and bump the counts
   in the existing "all 10 found" checks.

**Secret words must never contain `R`, `N`, `M`, `P` or `I`.** Those are toggle keys (Relax Mode, music, mute, pause,
invert), so typing the word would flip them. `src/secrets.js` throws at load if a word breaks this rule, and the smoke
test checks it too.

The developer menu builds its Secrets section from `SECRETS`, so a new row shows up there on its own.

## Console API (`G.secrets`)

| Call | What it does |
| --- | --- |
| `G.secrets.list()` | Every secret as `{ id, name, kind, found }`. |
| `G.secrets.found` | A `Set` of found ids. |
| `G.secrets.trigger(id)` | Plays a secret's effect and records it as found. Returns `false` for an unknown id. |
| `G.secrets.reset()` | Forgets every found secret (and clears `localStorage`). |
| `G.secrets.feed(code)` | Feeds one key code (e.g. `'KeyQ'`, `'ArrowUp'`) to the word and Konami detectors, as if it was pressed. Same mid-flight-only rules. |
| `G.secrets.checkDate(date)` | Runs the date check for any `Date`. Returns the secret's id, or `null` on an ordinary day. |
| `G.secrets.today` | Set a `Date` here to make the next `checkDate()` pretend it's that day. |
| `G.secrets.holiday` | Id of today's date secret, if any. |

`G.progress.ranks` holds the rank names in use; April 1 swaps in sillier ones. New sounds for secrets live in
`src/audio.js`: `quack()`, `sparkle()` and `honk(pitch, delay)`.

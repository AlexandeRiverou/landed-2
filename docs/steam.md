# Desktop build and Steam

Landed also ships as a desktop app, built with Electron, so it can go on Steam. The web build doesn't change: the
desktop build takes the same smoke-tested `dist/` and wraps it in a small Electron shell. This guide covers building
it, testing it, and getting it onto Steam.

What the desktop build does today:

- Runs the game fully offline, in its own window, **fullscreen by default**.
- Adds **FULLSCREEN** and **QUIT** buttons under TAKE OFF on the title card and under RESUME on the pause card
  (`P` / `Esc`). In a browser they stay hidden.
- Applies the GPU switches the Steam overlay needs, but only when Steam launches the game.

What it doesn't do yet: Steamworks (achievements, cloud saves, the Steamworks API), gamepad support, an app icon,
or a signed and notarized macOS app. See [Follow-ups](#follow-ups).

## Where things live

| Path | What it is |
| --- | --- |
| `electron/` | A separate npm package (its own `package.json` and lockfile). Electron and electron-builder are pinned here, so the root `npm ci` never downloads them. |
| `electron/main.js` | The main process: window, `app://` file server, CSP, offline lock, fullscreen keys, boot test. |
| `electron/preload.js` | The bridge: exposes `window.landedDesktop` (`isDesktop`, `platform`, `quit()`, `toggleFullscreen()`) and nothing else. |
| `electron/electron-builder.json` | Packaging: unpacked folders for Windows x64, Linux x64 and macOS universal. |
| `electron/steam/` | SteamPipe templates: `app_build.vdf` and `depot_build_{windows,linux,macos}.vdf`. |
| `scripts/desktop.mjs` | `build`, `start` and `smoke` subcommands, run through the npm scripts below. |
| `src/desktop.js` | The only game module that knows about the bridge. It shows the desktop buttons when the bridge exists. |

`electron/app/` (the staged copy of `dist/`) and `export/` (the build output) are generated and gitignored.

## Build it locally

```bash
npm ci                    # root dependencies, as usual
npm run desktop:install   # once: Electron + electron-builder (npm ci --prefix electron)
npm run desktop:build     # web build, then package for THIS OS
```

`desktop:build` runs `npm run build`, copies `dist/` into `electron/app/`, and runs electron-builder for the OS you're
on. There are no cross-builds: build the Windows package on Windows, the Mac one on a Mac, the Linux one on Linux. (CI
does all three for you, see below.)

While staging, the build strips the Google Fonts `<link>` tags from the desktop copy of `index.html`, and drops the
web zip's `README.txt`. So the desktop build uses the fallback font instead of Fredoka for now.

Output goes to `export/desktop/`:

| OS | Folder | Executable inside it |
| --- | --- | --- |
| Windows x64 | `export/desktop/win-unpacked/` | `Landed.exe` |
| Linux x64 | `export/desktop/linux-unpacked/` | `landed` |
| macOS universal | `export/desktop/mac-universal/` | `Landed.app` (binary: `Landed.app/Contents/MacOS/Landed`) |

These are plain folders, not installers. Steam installs them for the player.

**Version.** The app's version is `RELEASE_VERSION` if that is a semver (a leading `v` is dropped), otherwise
`"version"` from the root `package.json`.

**Icon.** There is no icon yet, so you get Electron's default. Drop a square 1024 px `icon.png` into
`electron/build-resources/` (create the folder) and the next build picks it up.

## Get it from CI or a release

The **Build & Release** workflow has a `desktop` job that runs on Ubuntu, Windows and macOS after the web build
passes. Each one builds the app, zips it as `landed-<version>-<platform>.zip` (`linux-x64`, `windows-x64`,
`macos-universal`), boot-tests the packaged app, and attaches the zip to the run.

- **Pull requests:** download the zips from the run's artifacts. `<version>` is the short commit hash there.
- **Releases:** every GitHub Release gets the three desktop zips next to the web zip, e.g.
  `landed-v1.0.1-windows-x64.zip`. The release waits for all three desktop builds, so a desktop failure blocks the
  release. GitHub Pages still deploys the web build.

Each zip holds one folder (`landed-<version>-<platform>/`) with the same contents as the matching
`export/desktop/` folder.

Tip: unzip the Linux and macOS zips on Linux or macOS. Unzipping them on Windows can lose the executable bit and the
`.app`'s symlinks.

## Run and test it

```bash
npm run desktop:start          # web build, then run unpackaged in a 1280x720 window (DevTools work here)
npm run desktop:smoke          # boot-test the packaged app from export/desktop/ for this OS
npm run desktop:smoke -- <exe> # boot-test another executable, e.g. one from an unzipped CI build
```

Or just run the executable from the table above.

- **Fullscreen** is the default. Pass `--windowed` for a 1280x720 window.
- **Toggle fullscreen:** `F11`; `Alt+Enter` on Windows and Linux; `Ctrl+Cmd+F` on macOS. Or the FULLSCREEN button.
- **Quit:** the QUIT button, or close the window (on macOS too). `Cmd+Q` works on macOS.
- **One copy at a time:** starting the game again focuses the window that's already open.
- **DevTools** only work unpackaged (`desktop:start`). The packaged app has them off.

**The boot test** (`desktop:smoke`) starts the app with `LANDED_SMOKE=1`. It uses software WebGL, waits for
`window.G` and the first terrain chunks, checks the bridge, and exits 0. It fails on any console error, a failed
load, a crashed renderer, a missing bridge, or 60 s without a ready game. On a headless Linux box it runs under
`xvfb-run` (install `xvfb`). A pass looks like:

```text
[smoke] PASS: window.G=true chunks=69 bridge=true platform=linux webgl2=true
```

The browser smoke test (`npm test`) also covers the desktop buttons with a fake bridge: hidden in a browser, shown
and working on the title and pause cards when the bridge exists.

**Running as root** (e.g. in a container): Chromium won't start with its sandbox on, so `desktop:start` and
`desktop:smoke` add `--no-sandbox` for that run and print a warning. Players never run as root.

### Rules the desktop build enforces

- **Offline only.** Everything is served from `app://landed/`, straight out of the packaged game folder. Any other
  request (http, https, file) is cancelled. Don't add remote assets: vendor them into the build.
- **Strict CSP.** Scripts load only from the app itself. The one inline script allowed is the import map, by hash
  (computed at startup, so editing the map is fine). A new inline `<script>` or a remote URL is blocked, and the
  error fails the desktop boot test.
- **Locked-down window.** Context isolation, sandbox, no Node in the page. Navigation away from `app://landed/` and
  popups are blocked. The only permission granted is fullscreen.

## Put it on Steam

### 1. Steamworks account and app

1. Join the Steamworks partner program at <https://partner.steamgames.com/> (identity, tax and bank details).
2. Pay the Steam Direct fee for the app (US$100 per app at the time of writing; check the partner site). You get an
   **App ID**.
3. In the app's admin pages, go to **SteamPipe → Depots** and set up one depot per OS: Windows, Linux and macOS.
   Write down the three **depot IDs**, and set each depot's operating system to match.

### 2. Fill in the vdf templates

The files in `electron/steam/` contain `REPLACE_WITH_..._ID` placeholders on purpose: steamcmd rejects them, so
nothing gets uploaded by accident. Replace them with your real IDs:

- `app_build.vdf`: `REPLACE_WITH_APP_ID`, and the three depot IDs in the `Depots` block.
- `depot_build_windows.vdf`, `depot_build_linux.vdf`, `depot_build_macos.vdf`: each one's `DepotID`.

Also set `"Desc"` in `app_build.vdf` to the version you're uploading (e.g. `Landed v1.0.1`).

What the templates already do:

- `ContentRoot` is `export/desktop/` (paths are relative to the vdf file). Each depot uploads the *contents* of its
  folder (`win-unpacked/`, `linux-unpacked/`, `mac-universal/`) to the depot root.
- `BuildOutput` is `export/steam-output/` (logs and cache, gitignored).
- `"Preview" "0"` uploads for real. Set it to `"1"` for a dry run that only computes the manifest.
- `"SetLive" ""` leaves the build unassigned. You can set a beta branch name (e.g. `"beta"`). Don't set `default`
  from the script: make the build live in the partner site instead.
- Every depot excludes `steam_appid.txt` and `*.pdb`.

Don't commit your real IDs if you'd rather keep them private. **Never** commit Steam credentials or `config.vdf`.

### 3. Launch options

In the partner site (**Installation → General**), add one launch option per OS. The depot puts the folder's contents
at the install root, so the executable sits right there:

| OS | Executable | Arguments |
| --- | --- | --- |
| Windows | `Landed.exe` | none (optional: `--windowed`) |
| Linux / SteamOS | `landed` | none (never `--no-sandbox` by default, see [Steam Deck and Linux](#steam-deck-and-linux)) |
| macOS | `Landed.app` | none |

You can add a second launch option with `--windowed` if you want players to pick "Play in a window".

### 4. Put the builds in place

`export/desktop/` must hold all three folders before you upload. Either build each one on its own OS with
`npm run desktop:build`, or download the three zips from a GitHub Release and unzip them so that you get:

```text
export/desktop/win-unpacked/
export/desktop/linux-unpacked/
export/desktop/mac-universal/
```

(The zips unpack to `landed-<version>-<platform>/`: rename each one to the folder name above.)

On macOS, sign and notarize `mac-universal/Landed.app` before you upload it (see [macOS](#macos)).

### 5. Upload

Use a Steam account with build permissions for the app (a dedicated builder account is a good idea). Install
`steamcmd` from the Steamworks SDK or Valve's download, then:

```bash
steamcmd +login <builder-account> +run_app_build "/absolute/path/to/landed-2/electron/steam/app_build.vdf" +quit
```

steamcmd asks for the password and Steam Guard code the first time. When it's done, the build shows up under
**SteamPipe → Builds** in the partner site. Set it live on a branch there, then install it through the Steam client
and play it.

### Testing outside Steam

The game doesn't use Steamworks yet, so it runs fine without Steam. Once Steamworks is added, a `steam_appid.txt` next
to the executable (holding only the numeric App ID) lets Steamworks start when you launch the game by hand. It's for
local testing only: the depots exclude it, and Steam provides the App ID at launch.

**Steam overlay.** The overlay draws into the GPU process, so the app applies two Chromium switches
(`in-process-gpu`, plus `disable-direct-composition` on Windows) when Steam launched it (Steam sets `SteamGameId` /
`SteamAppId`). To try them outside Steam, set `LANDED_STEAM_OVERLAY=1`. The overlay itself needs Steamworks to be
wired up before it shows in-game (see [Follow-ups](#follow-ups)).

## Steam Deck and Linux

- The Linux build is the one the Deck runs. It's x64, starts fullscreen, and fits the Deck's 1280x800 screen.
- **Chromium's sandbox.** On Linux, Electron's sandbox needs unprivileged user namespaces, or a setuid-root
  `chrome-sandbox` helper. A Steam depot can't ship a setuid file. CI makes the helper setuid only on its throwaway
  test copy, never in the zip. **Test the Linux build under the Steam Linux Runtime and on a Deck before release.**
- **`--no-sandbox` is a last resort.** It turns off Chromium's OS sandbox for every player who uses that launch
  option. Never make it the default launch option. If testing shows the game can't start any other way, add it only
  after you've tested it, and document why.
- **Controls.** The game has keyboard, mouse and touch controls, but no gamepad support yet. On the Deck, the touch
  screen works, and players can map the controls to keys with Steam Input. Setting up a recommended Steam Input
  layout (or adding gamepad support) is worth doing before you apply for Deck Verified.

## macOS

The build is only **ad-hoc signed**. That's fine for testing on your own Mac, but players' Macs will refuse to open
it. Before you ship the macOS depot:

1. Get an Apple Developer account and a **Developer ID Application** certificate.
2. Sign `Landed.app` with it, with the hardened runtime on. (In `electron-builder.json` this means a real `identity`,
   `"hardenedRuntime": true`, and the entitlements Electron needs.)
3. **Notarize** it with Apple and staple the ticket.
4. Then upload `mac-universal/`.

None of this is set up in CI yet.

## Store checklist

Things Steam asks for before you can release. Check the partner site for the full, current list.

- [ ] App ID, three depots, the vdf templates filled in.
- [ ] Launch options for Windows, Linux and macOS.
- [ ] A build uploaded, set live on a branch, installed and played through the Steam client on each OS.
- [ ] Linux build tested on the Steam Linux Runtime / Steam Deck (sandbox, see above).
- [ ] macOS build signed and notarized (or drop the macOS depot for launch).
- [ ] An app icon (`electron/build-resources/icon.png`).
- [ ] Store page: description, capsule images, screenshots, trailer, tags, system requirements, content survey,
      price.
- [ ] Store page and build review by Valve, and the "coming soon" period before release.

## Follow-ups

Not done yet, in rough priority order:

- **Vendor the Fredoka font** into the build so the desktop app keeps the web look (right now it falls back, because
  remote fonts are blocked).
- **App icon.**
- **macOS signing and notarization** in CI. Turn on electron-builder's asar integrity fuse at the same time as real
  signing.
- **Steamworks** (achievements, overlay, the Steam API) through steamworks.js. The plan is written up at the
  `STEAMWORKS HOOK` comment in `electron/main.js`: a pinned native module kept out of `app.asar`, initialised in the
  main process, and exposed to the page only through narrow, fixed IPC channels in `preload.js`. Before adding them,
  make the IPC sender check in `main.js` also verify the message comes from the main frame.
- **Gamepad support** for the Steam Deck and controllers.

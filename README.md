# Leeward

A focus timer where every focused minute sails you one nautical mile.

Choose how long to focus and Leeward plots a passage to a real harbour that far away by sea. Cast
off, and the boat crosses the chart while you work. Make port, collect the harbour's stamp, and
write a line in the logbook. Distracting apps and sites stay *below deck* until you're done.

Leeward is the Windows (and browser) take on the FocusFlight ritual described in
*FocusFlight — PC Version Breakdown*, with the flight vocabulary carried over to the sea, following
the **Leeward for Windows** design canvas:

| FocusFlight      | Leeward                                   |
| ---------------- | ----------------------------------------- |
| Flight           | Watch (one focus session)                 |
| Origin airport   | Home port, or wherever the boat is moored |
| Destination      | A harbour as far away as the watch is long |
| Seat             | Purpose flag (Work, Study, Reading, …)     |
| Airplane Mode    | Batten down (block apps and sites)         |
| Hold to give up  | Hold to drop anchor                        |
| Landing          | Making port                               |
| FlightLog        | Logbook                                   |
| Flight miles     | Nautical miles sailed                     |

## The voyage goes on

The boat stays where your last watch left it: moored in the harbour you reached, or anchored at sea
partway through a passage. The next watch starts from there, so you keep sailing further. The
**Voyage** page keeps the whole trip:

- **Your wake**: every passage you've sailed on one chart, from your home port to where you are now.
- **Time at sea**: total hours, days at sea, current and best streak, and how far you've got from home.
- **Days at sea**: a calendar of the last 26 weeks, darker for longer at sea.
- **Achievements** (30): distance (Century, Thousand-mile mariner, Around the world at 21,600 nm),
  ports and countries, long passages, the old line-crossing traditions (Shellback for the Equator,
  Bluenose for the Arctic Circle, Golden Dragon for the 180th meridian), time at sea and streaks,
  the ship's watches (Middle, Morning, Dog), and Batten down discipline. They are worked out from
  the logbook, so watches you sailed before an achievement existed still count. New ones appear on
  the *Made port* card and in the landing notification.

The planner also offers one far harbour, about four watches away, under *Longer passages*.

## Run it in a browser (for testing)

Needs [Node.js 22](https://nodejs.org).

```sh
npm install
npm run dev        # http://localhost:5173
```

`npm run build` writes a static site to `dist/` that any web host can serve (the **Web app**
workflow publishes it to GitHub Pages from the default branch once Pages is enabled with
*Source: GitHub Actions*).

In the browser everything works except what needs Windows itself: blocking apps and sites, the tray
icon and taskbar progress. The mini window opens as a picture-in-picture window in Chrome and Edge.

## Get the Windows app

Every push runs the **Windows app** workflow on a Windows machine. Open the run under the repo's
**Actions** tab and download the **Leeward-Windows** artifact. It contains:

- `Leeward_0.1.0_x64-setup.exe`: the installer (installs for the current user, no admin needed)
- `Leeward_0.1.0_x64_en-US.msi`: the same as an MSI, for managed installs
- `Leeward-portable.exe`: runs without installing (needs the WebView2 runtime, which Windows 10 and 11 already have)
- `Leeward-browser-helper.zip`: the extension that blocks websites

Push a tag such as `v0.1.0` and the same files are attached to a draft GitHub release.

The builds are not code-signed yet, so Windows SmartScreen shows "Windows protected your PC" the
first time; choose *More info → Run anyway*. Signing needs a code-signing certificate (see *Next steps*).

### Build it yourself on Windows

Install [Node.js 22](https://nodejs.org), [Rust](https://rustup.rs) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) (Microsoft C++ Build Tools; WebView2
is already on Windows 10/11), then:

```sh
npm install
npm run desktop:dev     # run with live reload
npm run desktop:build   # installers in src-tauri/target/release/bundle/
```

## What the Windows app adds

- **Batten down, apps.** While a battened watch is under way, Leeward watches which window comes
  to the front (`SetWinEventHook`, no admin rights). If it belongs to a blocked program, a shield
  covers that screen: "Discord is below deck — 24 min until you make port in Ystad." *Back to the
  chart* minimises the app; in **Steady** mode you can hold for 3 seconds to open it anyway (the
  logbook notes it). **Storm** mode has no way through. Nothing is ever closed or killed.
- **Batten down, sites.** The browser helper (Chrome, Edge, Brave, Opera, Firefox) redirects blocked
  sites to a calm "below deck" page. It asks Leeward for the list on `127.0.0.1`, so when Leeward
  isn't running nothing is blocked. Install it from *Batten → Browser helpers → Install helper*
  (opens the bundled folder; use *Load unpacked*), or from the zip.
- **Awareness.** Tray icon with minutes left and a flyout (left click), taskbar progress bar,
  always-on-top mini window, a toast when you make port, `Ctrl+Alt+L` to bring Leeward forward.
- **Keeps running.** Closing the window keeps the watch going in the tray. Start with Windows is
  optional (starts hidden in the tray). An optional *Still on board?* check asks after a stretch with
  no mouse or keyboard input, and can drop anchor at the moment you left.
- **Do Not Disturb.** Windows has no public API for apps to turn it on, so Leeward reminds you at
  cast off with a button to the notification settings.

## How it works

- **The watch** is stored as its start time and planned distance (1 nm per minute). Time left,
  position and progress are recomputed from the clock, so a watch survives reloads, closing the app,
  sleep and reboots; a watch whose end passed while Leeward was closed lands on the next launch. If
  the clock jumps backwards the watch doesn't lose time.
- **Passages and watches.** A passage longer than one watch (plus 25% leeway) takes several; the boat
  anchors at sea between them and picks up from the same spot. Dropping anchor early keeps the miles
  sailed.
- **Sea routes.** Distances are measured by sea, not as the crow flies: the coastline is rasterised
  onto a local grid, a shortest path is searched over water (with a small cost for hugging the
  shore), then pulled tight into straight legs. Copenhagen to Ystad goes around Falsterbo: about 58 nm,
  where the great circle across Skåne is 44 nm. It runs in a web worker (`src/lib/routing`).
- **Suggestions.** For a watch of *W* minutes Leeward offers three harbours reachable in one watch
  (preferring real ports and spreading them around the compass) and two longer passages.
- **The chart** is MapLibre GL drawing Natural Earth coastlines in the design's chart style: the
  1:50m coastline when zoomed out and 1:10m detail clipped to the region in view.
- **Sound** is generated with the Web Audio API (swell and rigging, rain on deck, wind, ship's bell),
  so there are no recordings to license.
- **Data** stays on the device (localStorage; in the desktop app, the WebView2 profile under
  `%LOCALAPPDATA%\com.leeward.desktop`). Settings → *Back up* / *Restore* moves it between computers;
  the logbook exports to CSV.

```
src/                    the app (React + TypeScript), shared by browser and desktop
  lib/voyage.ts         watch engine (pure functions, unit-tested)
  lib/routing/          sea routing worker (unit-tested against the real coastline)
  lib/platform.ts       browser vs Windows differences behind one interface
  lib/achievements.ts   achievements and lifetime stats, derived from the logbook (unit-tested)
  screens/              plan / under way / made port, logbook, voyage, batten down, settings
src-tauri/              Windows shell (Rust, Tauri 2)
  src/blocker.rs        foreground-window watcher and shield
  src/helper.rs         127.0.0.1 endpoint for the browser helper
  src/ui.rs             tray flyout, mini window, shield window
extension/              browser helper (Manifest V3, Chromium and Firefox builds)
scripts/build-data.mjs  builds public/data from Natural Earth and UN/LOCODE
```

## Development

```sh
npm test            # watch engine and sea routing tests
npm run typecheck
npm run data        # rebuild public/data (downloads the sources into .cache/)
npm run extension   # rebuild extension/dist
```

## Data and licences

- Coastlines and ports: [Natural Earth](https://www.naturalearthdata.com) (public domain).
- Harbour names and regions: [UN/LOCODE](https://unece.org/trade/uncefact/unlocode), filtered to
  places on the coast, plus a short list of hand-checked harbours.
- Fonts: Archivo, IBM Plex Mono and Newsreader (SIL Open Font License), bundled.
- The chart is for planning focus sessions, not for navigation.

## Next steps

Following the breakdown's build plan, phases 1 (core loop) and 2 (Batten down) are in place. Still open:

- **Accounts, sync and the paywall (phase 3).** Sign-in, a shared entitlement with iOS (RevenueCat),
  web checkout, and logbook sync need a backend and decisions on billing; the app is ready for it
  (watches and passages already use UUIDs and derive miles from the log).
- **Code signing** for the installer, and optionally a Microsoft Store listing.
- **Store listings** for the browser helper (Chrome Web Store, Edge Add-ons, Mozilla) so it installs
  in one click instead of *Load unpacked*.
- From the feature list: Random Route, the window view (WebGL cabin scene), localisation.

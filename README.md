<p align="center">
  <img src="docs/screenshots/intro-logo.jpg" alt="KYPZER intro — the logo assembled from 1,440 minute-particles" width="100%">
</p>

<h1 align="center">KYPZER — Time Engine</h1>

<p align="center"><b>Your day has 1,440 minutes. Type it like a text message — get a plan that actually fits.</b></p>

<p align="center">
  English + Hinglish natural-language planner · clash detection & one-click fixes · energy-aware auto-scheduling ·
  Focus mode · calendar (.ics), image, link & QR export · week timetables · offline PWA · cinematic 3D intro
</p>

<p align="center"><code>dev : yashraj ghemud</code> · remaster of <b>kypzer-table</b> v1 (preserved in <code>kypzer-time-table-main.zip</code>)</p>

---

## What changed from v1

v1 was a single HTML file: type `3:45pm : come to room, 3:50 to 5 pm : work, 5:00 to 7 pm : call to wife`, get a
timeline and a PNG. v2 keeps that idea — **type your day like you'd text it** — and builds a real product around it.
The full analysis, product thinking and the intro "screenplay" are in **[PLAN.md](PLAN.md)**.

| Real-world problem | What KYPZER does |
|---|---|
| Calendar apps are slow to fill | Live natural-language parsing in **English and Hinglish** (`subah 7 baje gym`, `sadhe 3 se 5 baje tak padhai`, `lunch at 1 for 45 min`, `report 1h before 6pm !`), with syntax highlighting of exactly what was understood |
| Plans are unrealistic | **Day Score** (Focus · Recovery · Balance) + insights: clashes, 4-hour marathons, no lunch, short sleep, deep work in an energy dip — most with a **one-click fix** |
| "When do I do my tasks?" | **Auto-scheduler** fits flexible tasks (`study 2h`) into free time, respecting deadlines, priority and your **chronotype** energy curve |
| Plans don't survive reality | **Focus mode**: live countdown, up next, done/skip, **+5 min** that pushes what follows, **running late** shifts the rest of the day, notifications, screen wake-lock, synthesized ambience |
| Students retype their class timetable | **Week mode** (`mon-fri 9 to 10am : maths`, `somvar 5pm tuition`) → weekly grid, auto-merged into every day, exported as **recurring calendar events** |
| Getting the plan anywhere | **.ics** for Google/Apple/Outlook, story/square/wide **image cards** (drawn natively, no screenshots), **share links** that carry the whole plan, **QR** to move it to your phone, WhatsApp text, print |
| Privacy & bad networks | **Local-first PWA**: no account, no server, works offline, backup/restore |

## Screenshots

| | |
|---|---|
| ![Landing hero with the live 3D engine](docs/screenshots/landing.jpg) | ![Planner: editor, timeline, insights](docs/screenshots/planner.jpg) |
| ![Drag-and-drop day grid](docs/screenshots/grid.jpg) | ![Dial 3D view](docs/screenshots/dial.jpg) |
| ![Focus mode](docs/screenshots/focus.jpg) | ![Share & export: story card](docs/screenshots/export.jpg) |

## The intro film

A ~17-second real-time film (Three.js, custom shaders, procedural WebAudio — no video or audio files):
**chaos → order → engine → you.** 1,440 glowing motes (one per minute) drift with words from a messy day,
get pulled into a 24-hour ring, the watch movement comes alive while the hand sweeps a whole day, the camera
dives through the ring, the motes stream past and assemble **KYPZER**, and the film ends synced to your real clock:
*"It's 3:47 PM. You have 493 minutes left today."* — then it becomes the website without a cut.

![The engine mid-film](docs/screenshots/intro-engine.jpg)

First visit only (a gate unlocks sound), skippable with <kbd>Esc</kbd>, replayable from the footer,
and replaced by a short fade under `prefers-reduced-motion`.

## Run it

No build step — static files and native ES modules (three.js is vendored, so it works offline).

```bash
npx serve .                 # or: python -m http.server 5173
# open http://localhost:5173
```

Opening `index.html` directly from disk won't work (browsers block ES modules on `file://`; the page tells you so).
Deploying = uploading the folder (GitHub Pages works as-is).

```bash
npm test                    # 22 engine unit tests (node:test) — parser, resolver, scheduler, analyzer, ICS, share, QR decode
npm run e2e                 # Playwright smoke test of the real UI (needs playwright installed)
```

Debug helpers: `?fx=low` forces the low-quality 3D path, `?introAt=12` freezes the film at a given second.

## Grammar cheatsheet

```
3:45pm : come to room          point (ends when the next thing starts)
3:50 to 5 pm : work            range — "5 pm" tells the engine 3:50 is PM too
gym 6-7am  |  17:00–19:00 gym  task-first, 24h, dashes
lunch at 1 for 45 min          start + duration
study 2h   |  padhai 2 ghante  flexible → auto-placed at a good time
report 1h before 6pm !         deadline + priority (! / !! / urgent)
then coding 90m                right after the previous block
work till 5                    from the previous block until 5
subah / dopahar / shaam / raat, sadhe · paune · sava · dedh · dhai, baje, se … tak
mon-fri 9 to 10am : maths      week mode (also: weekdays, daily, somvar … ravivar)
```

Guessed AM/PM is marked with **?** — tap to flip. Every visual edit (drag, resize, fixes, running late) rewrites
the exact line in your text, so the text stays the single source of truth and <kbd>Ctrl</kbd>+<kbd>Z</kbd> works.

## Keyboard

<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> command palette · <kbd>/</kbd> edit · <kbd>F</kbd> focus mode ·
<kbd>T</kbd>/<kbd>G</kbd>/<kbd>D</kbd> timeline / grid / dial · <kbd>D</kbd> in focus = done · <kbd>Esc</kbd> back

## Architecture

```
index.html            shell: gate, intro overlay, landing, planner, focus, shared views
css/                  base · components · intro · landing · app · focus · print
src/engine/           pure logic (runs in Node too): lexicon, parser, resolver, scheduler,
                      analyzer, energy, week, format, plan pipeline, ics, share, qr
src/core/             store (localStorage), router (clock-wipe transitions), sound (WebAudio synth), dom
src/ui/               editor, timeline, day grid, week grid, dial view, insights, focus, export,
                      card renderer, palette, settings, history, shared view
src/three/            engine object (GPU particle morphs, watch movement, plan arcs) + stage (post FX)
src/intro/            the film director
src/landing/          scroll choreography, live demos, cursor
vendor/three/         three.js r170 (MIT)
sw.js, manifest       offline PWA
tests/, scripts/      unit tests, e2e, asset renderer
```

Pipeline on every keystroke: `text → parse → resolve (AM/PM) → + weekly routine → schedule → analyze → render`.

## Accessibility & performance

Keyboard reachable everywhere, focus-trapped dialogs, labelled controls, `prefers-reduced-motion` respected
(and a manual override), no information conveyed by colour alone. The 3D stage pauses off-screen, caps pixel
ratio and degrades quality within seconds on slow GPUs; the planner never depends on WebGL.

## Credits

Design & development: **yashraj ghemud** · powered by the kypzer engine · three.js (MIT) · fonts: Orbitron, Inter,
JetBrains Mono, Space Grotesk (Google Fonts). The energy curve is a typical pattern, not medical advice.

# KYPZER — Time Engine · Master Plan

> Remaster of **kypzer-table** (v1, single-file timetable generator) into a full product:
> a natural-language **time engine** that turns a messy day into a realistic plan, with a
> cinematic 3D intro, an animated website and real features people can use every day.

---

## 0. TL;DR

| | v1 (kypzer-table) | v2 (KYPZER Time Engine) |
|---|---|---|
| Input | One textarea, strict-ish regex | Live NLP parser: English **and Hinglish** (`subah 7 baje gym`, `sadhe 3 se 5 tak padhai`) with syntax highlighting |
| Output | List timeline + 4 stats + bars | Timeline, drag-and-drop day grid, **3D day dial**, week timetable |
| Brain | none | Conflict detection, auto-scheduler for flexible tasks, energy-aware planning, **Day Score** + one-click fixes |
| Execution | none | **Focus mode**: live countdown, "running late" shift, notifications, wake-lock, ambient sound |
| Sharing | html2canvas PNG (with 1.2s delay hack) | Native canvas cards (story/square/wide), **.ics calendar export**, share links, **QR code**, WhatsApp text, print |
| Memory | none (lost on refresh) | Local-first history, completion heatmap, streaks, JSON backup — no account, no server |
| Intro | 1.5s CSS fade of a logo | ~15s real-time **3D cinematic** with procedural sound, skippable, ends synced to *your* real clock |
| Platform | one HTML file | Installable **PWA**, works offline, keyboard command palette, accessible, tested |

---

## 1. Analysis of v1

### What it is
`index.html` (~950 lines): a dark, glassy page. You type a schedule like
`3:45pm : come to room , 3:50 to 5 pm : work , 5:00 to 7 pm : call to wife` and it renders
a vertical timeline, four stats (span, busy, free, tasks), per-task bars, and a PNG export via html2canvas.

### Strengths worth keeping (the DNA)
- **The core idea is great:** *type your day like a text message → get a timetable.* No forms, no date pickers.
- A strong visual identity: `#06080f` night background, cyan `#00e5ff`, violet `#7c3aed`, rose `#f43f5e`,
  Orbitron display type, JetBrains Mono data type, glass panels, pulse dots, the timeline motif.
- Hinglish personality ("Format flexible hai", "Kuch samajh nahi aaya") — it speaks to its audience.
- The brand line *"powered by kypzer engine"* — v2 makes that engine real.
- The dev credit **"dev : yashraj ghemud"** stays, prominently.

### Weaknesses / bugs found
1. **Self-XSS:** task text is injected with `innerHTML` unescaped (`<img onerror=…>` in the textarea runs).
2. **Parser gaps:** no 24h times (`17:00`), no task-first order (`gym 5-7pm`), no durations (`lunch 45 min`),
   no `noon/midnight`, no Hindi time words. First entry without am/pm is *always* forced to PM
   (`7 to 9 gym` → 7 PM). Out-of-order or overlapping entries silently jump to the next day.
3. **No conflict handling** — overlaps are invisible.
4. **Export is fragile:** clones the DOM, bakes computed styles, waits 1.2s, relies on a CDN script without SRI.
5. **Nothing persists** — refresh = data gone.
6. **Accessibility:** no `prefers-reduced-motion`, inline `onclick`, emoji-only icons, no keyboard flow.
7. **Perf:** particle canvas runs O(n²) line checks every frame even when nothing changes; no DPR handling.
8. The plan is only *displayed* — nothing helps you *follow* it.

---

## 2. The real-world problems v2 solves

| # | Problem people actually have | v2 answer |
|---|---|---|
| P1 | Calendar apps are slow to enter (forms per event). People plan in WhatsApp notes. | **Type-it-like-you-text-it** parser, English + Hinglish, voice input |
| P2 | Plans are unrealistic: overlaps, no breaks, no meals, 4h sleep, 11h of work | **Engine analysis** + **Day Score** + one-click **fixes** |
| P3 | "I have tasks but don't know *when* to do them" | **Auto-scheduler** fits flexible tasks (`study 2h`, `report before 6pm 1h !`) into free slots, energy-aware |
| P4 | Deep work lands in the post-lunch slump | **Energy curve** by chronotype (early bird / balanced / night owl) |
| P5 | Plans don't survive contact with reality — you run late | **Focus mode** + **"Running late"**: shift the rest of the day in one tap |
| P6 | Students re-type the same class timetable every week | **Week mode** (`mon-fri 9-10am maths`) → weekly grid → **recurring calendar events** |
| P7 | Getting the plan into Google/Apple Calendar, or to family/classmates | **.ics export**, share link, **QR "send to phone"**, story-size image for WhatsApp status, print |
| P8 | Privacy + bad connectivity | **Local-first PWA**: no login, no server, offline, JSON backup/restore |
| P9 | No feedback loop | **History**: check-offs, completion heatmap, streaks, weekly category totals |

Principle: **every animation must explain something** (time filling, blocks snapping into free slots,
the ring depleting). No decoration that fights the data.

---

## 3. Identity

- **Name:** KYPZER — *Time Engine* (repo/product lineage: kypzer-table v2)
- **Tagline:** *Your day, engineered.*
- **Hero line:** *Your day has 1,440 minutes.*
- **Voice:** confident, warm, a little Hinglish. Error: *"Kuch samajh nahi aaya — try `3 to 5 pm : work`."*
- **Palette (kept):** bg `#06080f`, panel `#0d1117/#111827`, line `#1e293b`, text `#e8edf5`, muted `#64748b`,
  cyan `#00e5ff`, violet `#7c3aed`, rose `#f43f5e` + category hues (below).
- **Type (kept):** Orbitron (display), Space Grotesk (headings), Inter (UI), JetBrains Mono (data/time).
- **Signature motif:** the **clock-wipe** — a conic sweep like a clock hand — used for page transitions,
  loaders and focus rings.

### Category system (color = meaning, consistent everywhere)

| id | color | energy type | examples (EN / Hinglish) |
|---|---|---|---|
| work | `#00e5ff` | deep | work, office, kaam, project, report |
| code | `#5ac8fa` | deep | coding, dev, debug, leetcode, dsa |
| study | `#9b6bff` | deep | study, padhai, class, revision, exam, tuition |
| meeting | `#f0a840` | light | meeting, standup, interview, zoom |
| call | `#e06cd6` | light | call, video call, wife, mom call |
| fitness | `#3ecf8e` | active | gym, run, walk, yoga, cricket, kasrat |
| food | `#ffd166` | light | breakfast, lunch, dinner, khana, nashta, chai |
| sleep | `#6c7cff` | sleep | sleep, nap, so jaana, neend |
| break | `#2dd4bf` | rest | break, rest, aaram, chill |
| commute | `#fb8c3c` | light | commute, travel, metro, come to room, ghar jaana |
| social | `#f43f5e` | light | friends, family, party, dost, shaadi |
| chores | `#94a3b8` | light | laundry, groceries, cleaning, safai, sabzi |
| mind | `#c4a7ff` | rest | meditate, pray, puja, namaz, journal, read |
| fun | `#ff5fa2` | rest | gaming, movie, netflix, music, guitar |
| routine | `#a3e635` | light | wake up, shower, nahana, get ready |
| *other* | hashed from v1 palette | light | anything else |

---

## 4. The Kypzer Engine (pure logic, unit-tested)

### 4.1 Grammar the parser understands
```
3:45pm : come to room            → point (ends at next start, capped by category)
3:50 to 5 pm : work              → range  (start inherits pm → 3:50 PM)
gym 5-7pm   |  17:00–19:00 gym   → task-first order, 24h, en-dash
lunch at 1 for 45 min            → point + duration → 1:00–1:45 PM
11 to 1pm                        → 11 AM – 1 PM (minimal positive duration rule)
noon, midnight, 12am, 5p, 7.30   → special words, short periods, dot minutes
study 2h  |  padhai 2 ghante     → FLEXIBLE task → auto-scheduled
report 1h before 6pm !           → flexible + deadline + priority
then coding 90m                  → sequential after the previous block
subah 7 baje gym                 → daypart hint (subah/dopahar/shaam/raat)
sadhe 3 se 5 baje tak padhai     → sadhe=+30, paune=-15, sava=+15, dedh=1:30, dhai=2:30
raat 2 baje so jaana             → 2 AM (next day)
aadha ghanta walk                → Hindi durations (aadha/dedh/dhai ghanta)
mon-fri 9 to 10am : maths        → WEEK mode day tokens (also somvar, weekdays, daily)
```
Separators: newline, `,`, `;`, bullets `- • *`, numbering `1.`, and ` then ` / ` phir `.

Every token keeps its character span → the editor highlights time (cyan), duration (violet),
dayparts (amber), days (green), priority (rose), title (white).

### 4.2 AM/PM resolution (the hard part)
Candidates = {am, pm} × {day 0, day +1}. Score each:
`score = forwardDistanceFromCursor + categoryPenalty + daypartPenalty`
- explicit `am/pm`, 24h (`17:00`, `07:30`) and dayparts are hard constraints
- range with one explicit side → the other side takes the **minimal positive duration**
- first entry uses a *typical day* prior (7–11 → AM, 12–6 → PM) + category (breakfast→AM, dinner/sleep→PM)
- cursor allows **3h backtracking** so intentional overlaps stay same-day (and get flagged), instead of v1's silent jump to tomorrow
- every guess is marked `guessed:true` → UI shows a `?` chip you can tap to flip AM/PM

### 4.3 Auto-scheduler
1. Planning window = settings day window (default 07:00–23:00), clipped to *now* when planning today,
   widened to include fixed blocks.
2. Free intervals = window − fixed blocks − 5 min buffers.
3. Order flexible tasks: sequential anchors → priority ↓ → deadline ↑ → duration ↓.
4. For each task, scan starts in 5-min steps inside free intervals where it fits; hard constraints: `after`, `before`.
   Soft score: energy fit (deep ↔ high energy, rest ↔ low), daypart match, slight earliness preference,
   **best-fit** (prefer gaps that leave no useless crumbs).
5. Unfittable tasks go to an **Unplaced** tray with a human reason.
Deterministic → testable.

### 4.4 Analyzer rules → insights (+ fixes)
| rule | level | fix |
|---|---|---|
| overlap | critical | shift later block to after the earlier one |
| deep-work marathon > 120 min | warn | split with a 10-min break |
| busy > 4h with no gap ≥ 10 min | warn | — |
| sleep < 7h / plan past midnight with no sleep | warn | — |
| no lunch/dinner while span covers meal windows | tip | insert meal into the best free gap |
| work+study > 10h | warn | — |
| deep work in energy dip | tip | — |
| deep work after 11 PM | tip | — |
| 4+ blocks back-to-back | tip | — |
| free > 2h | good/tip | — |
| nothing wrong | good | — |

### 4.5 Day Score (0–100) — three rings in the brand colors
- **Focus** (cyan): share of deep minutes at good energy, penalty for marathons.
- **Recovery** (violet): breaks per busy hour, sleep adequacy, meals.
- **Balance** (rose): category diversity, work share of span, movement/social presence.
- **Total** = mean of rings × realism factor (conflicts / overload reduce it).

### 4.6 Energy curve
Sum of gaussians (morning peak, post-lunch dip, second wind, night decline) shifted by chronotype
(lark −90 min, owl +150 min). Labelled as a *typical pattern*, not medical advice.

### 4.7 Other engine modules
- `format.js` — canonical line writer (`3:50 PM to 5:00 PM : work`) used by drag/drop, fixes, running-late.
  **Text is the source of truth**: every visual edit rewrites the exact source span, so the editor
  and the visuals never disagree (and Ctrl+Z still works).
- `week.js` — day tokens (EN + Hindi weekday names), expansion to 7 day-plans, RRULE data.
- `ics.js` — RFC 5545: CRLF, 75-octet folding, escaping, floating local time, optional VALARM, weekly RRULE.
- `share.js` — `{v,d,t,w}` JSON → deflate-raw (CompressionStream) → base64url; plain fallback.
- `qr.js` — QR encoder (byte mode, versions 1–40, Reed–Solomon, 8 masks + penalty scoring).

---

## 5. Intro cinematic — screenplay

Runtime ~15s. Real-time Three.js + custom shaders + procedural WebAudio. Skippable (`Esc`, `Space`, button).
First visit only; returning users get a 1.2s boot. `prefers-reduced-motion` → 1s fade.
A **gate** screen ("Enter with sound / Enter silently") unlocks audio (browser autoplay rules)
and hides font/shader warm-up.

The story: **chaos → order → engine → you.** Every day is 1,440 minutes; left alone they scatter;
the engine gives them shape; the film ends on *your* real clock.

| t (s) | Shot | Visual | Camera | Sound | Text |
|---|---|---|---|---|---|
| 0.0 | **BOOT** | Black. One cyan pixel breathes. | locked | sub thump like a heartbeat | `KYPZER ENGINE // BOOT` types in mono |
| 1.2 | **1,440** | 1,440 glowing motes (one per minute) + dust drift in chaos; words from a messy day float past with depth blur: *work? · gym · call wife · 3:45 · deadline · padhai · sleep · khana* | slow dolly-in with handheld drift, slight roll | sparse pentatonic twinkles | "Every day, you get" → odometer rolls to **1,440 minutes.** |
| 4.5 | **PULL** | Core ignites. Motes caught in a vortex, spiral in and **snap onto a perfect ring**, minute by minute; words are sucked in and dissolve | fast pull-back + rise to a 3/4 reveal | riser + thousands of ticks fusing into a whoosh | "Most of them slip away." |
| 7.5 | **ENGINE** | Watch-movement comes alive: inner rings counter-rotate, beads orbit, hour ticks and numerals light up; the hand sweeps a whole day in one second — color cycles dawn cyan → noon gold → dusk rose → night violet — leaving a light trail | 90° orbit, then **dive through the ring** (motes streak past, chromatic aberration) | escapement tick-tock accelerating, doppler whoosh | "Unless you engineer them." |
| 10.5 | **REVEAL** | Streaming motes assemble **KYPZER** letters ahead (spring overshoot), light sweep across the glyphs, **shockwave** ring distorts the screen | slow push-in | bass drop + shimmer reverb + warm pad chord | *Your day, engineered.* + underline draws (v1 homage) + `dev : yashraj ghemud` chip |
| 13.0 | **SYNC** (the ending) | The logo dissolves back into time: motes fly home to the ring. The hand **springs to the real current time**. The day-so-far arc fills. | swinging arc around the ring into the hero framing | soft tick, then silence | "It's **3:47 PM**. You have **493 minutes** left today." |
| 15.0 | **HANDOFF** | The film *becomes* the website: nav slides in, headline words rise, the command bar draws itself from a line. The ring stays alive as the hero, ticking in real time. | settles, mouse parallax on | ambient bed fades | "Make them count →" |

Implementation: one `Points` object (~6k particles) carries three target layouts as attributes
(`aChaos`, `aRing`, `aLogo`); the GPU morphs between them with per-particle stagger and a swirl term,
so the whole vortex costs one draw call. A `Director` runs keyframed tracks (camera CatmullRom paths,
FOV, bloom, aberration, flash, text cues, audio cues) on one clock, so skipping = seeking to the end.

---

## 6. Website (landing, `#/`)

Scroll storytelling with a persistent 3D engine in the background that reacts to each section.

1. **Hero** — ring (live clock), *Your day has 1,440 minutes.*, live "minutes left today" counter,
   quick command bar (type → Enter → you're in the planner with your day).
2. **Type it like you text it** — sticky, **scroll-scrubbed** demo: scrolling types a Hinglish/English plan
   with live token highlighting while blocks materialise in a mini timeline. Scroll back = untype.
3. **The engine thinks** — tilt cards with animated illustrations: conflicts collide & resolve,
   a marathon splits with a break, blocks slide to the energy peak.
4. **Rings that mean something** — Focus / Recovery / Balance rings fill on scroll.
5. **Live mode** — focus ring counting down; "Running late? One tap shifts the rest of your day" demo.
6. **Takes it everywhere** — story card, calendar, QR, WhatsApp text fan out in 3D.
7. **Week mode** — class timetable grid assembles cell by cell.
8. **Private by design** — no account, no server, offline.
9. **Final CTA** + footer credits (dev: yashraj ghemud · powered by kypzer engine) + *Replay intro*.

Motion system: expo-out `cubic-bezier(.16,1,.3,1)` for reveals, quint in-out for camera,
springs for interactive things; masked line reveals, magnetic buttons, tilt + glare cards,
custom cursor with a fading "time trail", grain + vignette. All disabled/simplified under reduced motion.
Route changes use the **clock-wipe** transition.

---

## 7. App (`#/app`)

```
┌ topbar: logo · ◀ date ▶ · Day | Week · ⌘K · Focus ▶ · Share · ⚙ ────────────────┐
│ EDITOR                │ VIEW: Timeline | Grid | Dial 3D   │ INSIGHTS              │
│ highlighted textarea  │                                   │ Day Score rings       │
│ "understood as" chips │                                   │ insights + Fix buttons│
│ templates · voice     │                                   │ stats · breakdown     │
│ unplaced tray         │                                   │ energy curve          │
└───────────────────────┴───────────────────────────────────┴───────────────────────┘
```
- Live: every keystroke re-parses (debounced), blocks animate with FLIP.
- **Grid**: drag to move, drag edge to resize (5-min snap), double-click to create → rewrites text.
- **Dial 3D**: the same ring as the intro, now holding your blocks as glass arcs; hover/click sync with the list.
- **Week**: separate text, 7-column timetable, routine can auto-merge into each day.
- **Focus** (`#/focus`): big ring, now/next, ✓ done, +5 min, skip, running late, pomodoro, ambient
  (rain / brown noise / deep space / clock — all synthesised), notifications, wake lock, title countdown.
- **Share** (`#/s/<payload>`): read-only view + "Import into my planner".
- **Export**: image (story / square / wide × midnight / aurora / paper), .ics, link + QR, WhatsApp text, print.
- **History**: 16-week heatmap, streak, category totals.
- **Command palette** (Ctrl/⌘+K), shortcuts (`/` edit, `F` focus, `G` grid, `?` help).
- **Settings**: 12/24h, chronotype, day window, Hinglish/English tone, sound, motion, notifications,
  reminders in .ics, backup/restore, reset.

---

## 8. Architecture

No build step (like v1): static files, native ES modules, three.js **vendored** (no CDN at runtime,
works offline, no supply-chain risk). Hosting: GitHub Pages / any static server.

```
index.html              shell, gate, intro overlay, routes' containers
manifest.webmanifest    PWA
sw.js                   offline cache (app shell cache-first, fonts stale-while-revalidate)
css/                    tokens · base · components · intro · landing · app · focus · print
src/
  main.js               boot, router wiring, global shortcuts
  core/                 store (state+persistence+pub/sub) · router · dom helpers · motion · sound · storage
  engine/               lexicon · parser · resolver · scheduler · analyzer · energy · week · format · ics · share · qr · plan (pipeline)
  ui/                   editor · timeline · daygrid · weekgrid · dial-view · insights · focus · history · export · palette · settings · toast · modal · icons
  three/                stage (renderer+post) · postfx · dial (shared ring) · particles · intro director · focus scene
  landing/              sections, scroll scrub demo, cursor, reveals
vendor/three/           three.module.min.js + needed addons
tests/                  node:test unit tests for every engine module
scripts/                e2e (Playwright smoke + screenshots), icon generation
```

**Data (localStorage `kypzer.v2`)**
```js
{ settings:{clock, chronotype, dayStart, dayEnd, tone, sound, motion, notify, reminders, routine},
  days:{ 'YYYY-MM-DD': { text, done:{blockKey:'done'|'skipped'}, updatedAt } },
  week:{ text }, meta:{ seenIntro, installs } }
```
**Pipeline:** `text → parse → resolve → (+routine) → schedule → analyze → view models`.
Pure and synchronous (< 2 ms for typical plans), so it runs on every keystroke.

### Robustness
- User text only ever enters the DOM through `textContent` / escaped templates.
- Storage wrapped in try/catch (private mode safe).
- No WebGL → 2D canvas dial and a CSS intro; nothing essential depends on 3D.
- Reduced motion respected everywhere; DPR capped; render loop pauses when hidden/off-route; adaptive quality.

---

## 9. Testing
- `npm test` → `node --test` over engine modules: parser (EN + Hinglish), resolver edge cases,
  scheduler constraints, analyzer rules, ics format, share round-trip, QR decode check.
- `npm run e2e` → Playwright: gate → intro skip → landing → planner → type → views → export (download events)
  → share route → focus; fails on any console error; screenshots for visual review.

## 10. Milestones
1. Plan (this file) ✅
2. Engine + tests
3. App shell + workspace
4. 3D stage, dial, intro, audio
5. Landing site
6. Focus, export, share/QR, week, history, PWA
7. Iterate: E2E, screenshots, polish, perf, a11y, mobile, docs

## 11. Later ideas
Google Calendar two-way sync (needs OAuth/backend), multi-device sync via end-to-end encrypted link,
shared family/class plans, on-device LLM for free-form parsing, widgets.

---

## 12. Status (v2.0 as shipped)

**Done:** everything in sections 4–9 except the items below — NLP parser (EN + Hinglish), resolver, auto-scheduler,
analyzer + Day Score + fixes, energy curves, week mode + routine merge, text-as-truth editing (drag/resize/create,
fixes, flip AM/PM, running late, +5 min), timeline / grid / Dial 3D / week views, Focus mode (countdown, done/skip,
ambient synth, notifications, wake lock), exports (PNG cards ×3 formats ×3 themes, .ics day + recurring week,
share link, QR, WhatsApp text, print), history heatmap + streak, command palette, settings, backup/restore,
PWA (offline verified), the 17-second intro film with procedural audio, the 9-section landing site,
reduced-motion + no-WebGL fallbacks, axe-clean accessibility on landing / planner / focus.

**Verified by:** 22 unit tests (`npm test`, including QR codes decoded by jsQR), a 13-step Playwright E2E
(`npm run e2e`), frame-by-frame screenshots of the film (`?introAt=`), offline reload test, axe-core audit.

**Deferred:** Pomodoro sub-cycles inside Focus mode; the "Later ideas" in section 11.

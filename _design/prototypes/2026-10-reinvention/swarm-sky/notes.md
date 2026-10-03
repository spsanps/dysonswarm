# Concept 2: the swarm, built in real time, kept as glass plates

A working sample for a reinvented dysonswarm.com homepage. One sky, in which a
Dyson swarm goes up around the Sun on a clock. Every day's sky is a new glass
plate in a stack, like an observatory's plate archive, and a dated log records
what was added. The two worlds (Another Sky and the original swarm) are marked
on the plate in ink and can be clicked.

Style for the register: **Astronomical glass-plate negative: dark stars on pale
lit glass, solarized Sun, emulsion grain and halation, India ink and red grease
pencil by the plate readers, kraft sleeves with a letterpress form.**

## How to view

From the site root (`/home/san/Projects/dysonswarm/site`):

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/_design/prototypes/2026-10-reinvention/swarm-sky/`.
Opening `index.html` as a file also works, but the `/swarm/` and `/another-sky/`
links only resolve over HTTP. Folders starting with `_` are excluded from
GitHub Pages, so this sample is not published.

- `?date=2026-12-24` shows any day (a date alone means noon Pacific;
  `2026-12-24T18:30` is Pacific time; a `Z` or offset is respected).
- `?t=5` freezes the page 5 seconds after the start (clock and blink both),
  then sets `window.__ready`. Pass `date` too if you want the same frame every run.
- Arrow keys, the ‹ › buttons and the slider step through the stack.
  "Back to today" returns to the live plate.

Files: `index.html` (page and type), `clock.js` (the growth rule and the log),
`plate.js` (all drawing), `main.js` (clock, stepping, blink, live updates).
About 2,300 lines. No libraries, no images; fonts come from Google Fonts.

## The clock

- **Epoch:** midnight Pacific on Sunday 6 September 2026, the day the
  collection launched on dysonswarm.com (commit `e578079`). The page says so,
  and says plainly that it is pretend and runs on the real clock.
- **One ring a day.** Ring 1 went up on 6 September, ring 28 on 3 October.
  Days are Pacific calendar days (DST handled).
- **Launchers on Mercury** place 10 collectors an hour each, one at a time,
  spread evenly through the day. One launcher on day 1, and a new one starts
  every Sunday. So ring *k* holds 240 × launchers collectors. Today (day 28)
  there are 4 launchers, 960 collectors per ring, and 16,413 collectors at 14:20.
  A year in: about 2.3 million. Ten years: about 230 million.
- **Where the rings go.** Rings are laid in courses of 30, like growth rings:
  each day's ring sits about 5% further out than the day before, so you can
  count the days. When a course is full, the next starts near the Sun again in
  a new orbital plane, so over months the courses weave into a shell. Course
  planes are chosen so the plate camera never sees one edge-on.
- **Mercury** moves on its real 88-day period; **Another Sky** goes round once
  a year. A new collector lands every 1.5 minutes today, and the page redraws
  when one is due, so the open ring's tip creeps forward while you watch.
- **Log:** one row per hour for the chosen day ("14:00, Ring 28: 13 placed so
  far, ring 59% round"), plus events: ring closed, a new launcher on Sundays,
  and on plate 1 the start of construction, Another Sky, and the January 2026
  swarm sketch. Before the epoch the page shows a bare plate and says when
  construction starts.

## The style, and how the process is simulated

The page is the plate room's paperwork: warm paper, Old Standard TT (the
late-19th-century type of scientific journals) and Spectral, a ledger for
the log. The plate is the one living thing in the frame.

The plate is made the way a real one was, in `plate.js`:

1. **Exposure.** Light lands in a floating-point buffer. Stars get a Gaussian
   core plus emulsion scattering wings, so brighter stars print bigger, and the
   brightest get a halation ring. Collectors moved during the 20-minute
   exposure, so they print as short trails along their orbits (stars stay
   points). Collectors behind the Sun are hidden; ones crossing its disc block it.
2. **Characteristic curve.** Toe, shoulder and **solarization**: the Sun is so
   overexposed that its disc reverses to grey inside a black rim, as early
   plates did. Fine coronal rays, a halation ring, scattered sky fog and lens
   vignetting add the rest.
3. **Development.** The adjacency (Eberhard) effect sharpens edges the way
   fresh developer does. Silver grain is strongest in the mid-tones, there are
   uneven-coating mottles and pale streaks of tired developer below the Sun.
4. **The holder and the darkroom.** The holder's rebate leaves a clear frame
   and quarter-circles at the corner springs, and prints its number along the
   edge ("DS · HOLDER 1 · 20 MIN · No. 28"). Each plate has its own seeded
   damage: chipped glass with conchoidal ripples, hairline scratches, pinholes,
   dust and fibres on the glass, sometimes a drying ring, a faint fingerprint,
   or a light leak. Each plate is registered a little differently.
5. **Plate readers' hands.** Ink on glass doesn't soak in, so it dries with a
   darker rim and beads; red grease pencil skips over the glass and breaks
   up; ink on the paper label and the sleeve feathers into the fibres.
   Annotations: plate number on a gummed label, date and exposure, Mercury and
   Another Sky circled and named (both clickable), the newest ring's tip
   arrowed and circled in red with the time, the running count Σ, numbered
   comparison stars ticked Eddington-style, and "blinked v. 27 ✓". Labels
   search for clean sky and avoid crossing each other's leaders.
6. **Sleeves.** Kraft envelope with seams, toning, foxing and a thumb notch,
   a letterpress form filled in with a fountain pen, and a violet "PLATE FILED"
   stamp. Older plates' sleeves are stacked behind with their numbers.

**What moves.** The page is static first. One cheap living thing: a **blink
comparator**. Astronomers flicked between two plates of the same sky to see
what had changed (that's how Pluto was found). Here the newest ring flickers
off for about 1.5 s every 7 s. It is a pure CSS opacity animation between two
pre-rendered canvases, so it costs nothing per frame. A toggle turns it off. On
first load the plate fades up like a print in the developer tray. Reduced
motion gets a still plate with no blink or fade. Timers stop when the tab is
hidden.

**Cost.** Measured in headless Chromium with software rendering: about 110 ms
for a warm redraw at 2× on a 1440×900 desktop, and about 300 ms on first load
including one-time tables. A phone at 2× takes about 190 ms. The blink's
"yesterday" copy is built after first paint. On large screens the emulsion
renders at 1.5× (it's a photograph) while the ink stays at full resolution.
No horizontal scroll at 1440×900, 1024×768, 768×1024 or 390×844.

## Weaknesses

- **The blink is subtle.** On days when the newest ring is the outermost of a
  dense course, the flicker is a thin arc at the edge. It's clear when you
  watch for it, easy to miss otherwise. The red grease arrow helps.
- **Rings near the Sun merge.** Inside about 4 solar radii the first few rings
  of each course sit in the glare and read as a dark disc, not separate rings.
- **After a year it becomes a woven grey cloud.** That's honest to the idea
  (the Sun gets enclosed), but the tree-ring legibility of the first month
  doesn't last. Each dash stands for several collectors once rings get big.
- **The red label can land inside the cloud** in later courses, where there
  is no clean sky left near the newest ring's tip.
- **The plate scale is fiction.** Orbits are compressed so the swarm and
  Mercury fit on one plate, and the camera's 30° viewpoint is chosen for looks.
- **Fonts.** Four Google Fonts families. Production should self-host and
  subset them. If they fail to load, the plate falls back to system cursive,
  which works but looks worse.
- **Phone lettering.** The ink is drawn at a readable size on phones, so
  sub-labels ("being taken apart") are dropped there. The HTML list carries them.
- **Fixed sizes.** The plate renders for the stage size and re-renders on
  resize. No zoom or loupe yet, so the finest detail (trails, grain) only
  shows on large or high-density screens.

## Questions for San

1. Is a pretend clock the right fiction for the homepage? Or should the count
   tie to something real, such as the number of visits, or days since you
   started each world?
2. Should the swarm follow the plate pace (one ring a day, quiet growth), or
   be faster so a single visit shows visible change?
3. Is the blink comparator the right living element, or would you rather
   have the plate still, with life coming only from the date changing daily?
4. Copy: "I'm building a Dyson swarm here, one ring a day." and "It's
   pretend, but it runs on the real clock…" Close enough to how you'd say it?
5. Should every future world get a marked object on the plate, so the plate
   becomes the collection's index?
6. "Measured by S.K." on the sleeve: keep your initials there, or leave it blank?

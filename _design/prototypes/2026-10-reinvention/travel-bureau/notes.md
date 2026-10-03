# Concept 1 · A travel bureau for places that don't exist yet

A working sample for a reinvented dysonswarm.com landing page. Prototype only: nothing
here is published, and the live site is untouched.

**Style for the register:** 1970s airbrush and frisket (space-colony travel posters):
sprayed gradients that break into stipple where the coat is thin, knife-cut hard masks,
toothbrush-spattered stars, brushed gouache sparkles, Cooper-style lettering.

## The idea

The page is a bureau's front window. A strict, quiet grid holds five travel posters,
each a destination. The first cell is the bureau's own notice: one heading, two plain
lines from San, and a small board with today's date and local time (from the visitor's
clock), what is open and what isn't. Two posters are open and link to the real
experiences. Three are ideas, and say so plainly on the poster ("NOT YET OPEN", an empty
service lamp) and under it ("Not open yet").

Each poster has one slow living thing. Everything else on the page stays still.

## The style, and how the process is simulated

One style across all five posters. The subjects and times of day change: daylight inside
the cylinder, solar glare, deep space, Venus noon, dawn at sea. The board, window,
lettering band, ink palette and process marks stay the same.

`js/paint.js` paints each poster pass by pass on float buffers, the way an illustrator
built up an airbrush painting:

- **Frisket:** every shape is a hard, antialiased mask: projected geometry, ray-traced
  map fields, ray-marched solids, or lettering. `ridge()` adds the faint build-up of paint
  against the cut edge.
- **Spray:** coverage turns into paint through a droplet-grain field that is slightly
  clumped and then re-equalized. Thin coats break into visible stipple, and heavy coats
  close up smooth. The board's tooth catches thin spray. A low-pressure "spit" throws a
  few larger droplets. A glaze mode works like transparent dye for shadows.
- **Soft masks and loose shields:** gradients are built from many coats (sky glare, haze
  veils, billow shading), never one canvas gradient.
- **Gouache:** opaque, grain-free paint for highlights, with an optional dry-brush drag
  that only marks the tooth's peaks. `glint()` is the classic airbrush sparkle: a sprayed
  bloom, fine brushed rays and a hard core.
- **Toothbrush spatter** for stars, and stippled far-off towns.
- **Lettering:** the title is cut as a frisket and sprayed with a two-colour gradient and
  a light band, over a soft offset overspray shadow, with a gouache catch-light on the
  upper-left edges. Titles use Caprasimo (a Cooper Black cousin). The caps use Krona One
  and the page uses Instrument Sans. None of these fonts appears elsewhere in the register.
- The board itself has tooth relief and warm cream paper.

## Destinations

| No. | Poster | Status | What it shows | Living thing |
| --- | --- | --- | --- | --- |
| 01 | Another Sky | Open → `/another-sky/` | The view from Firstlight Overlook down the cylinder to the far end wall. A traveller on the hill looks up. | Transit cars run around the three rings ahead at the explorer's own speeds (105–170 m/s), so they creep across the sky in real time, with a short running-light trail. |
| 02 | The Swarm | Open → `/swarm/` | The Sun's glare, a shell of collectors on nested orbits, and Mercury in the foreground with a stepped quarry cut out of its sunlit limb. | Packets of Mercury leave the quarry, climb the long arc and flare as they join the swarm. |
| 03 | The Wheel | Not open yet | A Stanford torus seen from above, with six spokes, the land showing through its inner windows, a ferry coming in, and Earth and Moon far off. | The wheel turns at the real one turn a minute, keyed to the visitor's clock (a spoke comes back to the same place at the top of every minute). The spokes, hull hoops and the land in the windows move. |
| 04 | Over Venus | Not open yet | A domed city floating above a sea of yellow cloud, with a second city on the horizon. | Three cloud layers stream past at three speeds underneath, and the city rides gently on the air. |
| 05 | The Tether | Not open yet | A space elevator at dawn: an ocean platform, a ribbon straight up, dusk below and sunlight above. | A climber rides up out of the Earth's shadow and catches the Sun when it crosses into the light. Its beacon blinks. |

### What is real and what is speculative

- **Another Sky** is painted from `another-sky/explorer.js` itself: radius 12 km (24 km
  across, which the poster states), length 56 km, the `LAKES` and `CITY` tables, the
  `lakeField`/`urban` functions, transit rings at `RING_Z`, end-wall seams, spokes, gold
  rims and the sun hub, the axial daylight spine with its lamp collars, the train speeds,
  the low-poly trees, the bench and the sand path. Each pixel of the window is ray-traced
  into the cylinder, so the lakes and towns overhead sit where they really are when you
  stand on Firstlight Overlook and look toward the −z end. Liberties: rings, spine and
  buildings are drawn thicker than true scale. The cloud puffs are positioned like the
  explorer's but don't match them one for one. The traveller is not in the explorer.
- **The Swarm** follows `swarm/simulation.js`: a golden Sun inside a shell of collectors,
  with Mercury being taken apart for material. The quarry and mass-driver rail are an
  illustration of "taking Mercury apart". The simulation shows debris, not a rail.
- **The Wheel:** the 1.8 km diameter and one turn a minute come from the 1975 NASA Ames /
  Stanford study. The tube is drawn about 1.3× thick so the windows read. The study's big
  stationary mirror (and its shield) is left out because it hid the wheel. The poster
  claims nothing about it.
- **Over Venus:** at about 50 km up, the pressure is close to Earth's at sea level, and
  breathable air is a lifting gas in Venus's CO₂. Both are widely cited. The upper cloud
  deck circles the planet in about four Earth days, which motivates the drifting clouds
  (the drift speed itself isn't to scale). The city's design is invented.
- **The Tether:** a generic space elevator (an equatorial ocean anchor, a ribbon past
  geostationary orbit). The climb speed is not to scale.
- No poster or caption promises that the three ideas will be built, or when.

## Use

- Serve the site root over HTTP so the poster links resolve (`python -m http.server`), then open
  `/_design/prototypes/2026-10-reinvention/travel-bureau/`. Opening the file directly also
  works, but the poster links go nowhere.
- `?t=<seconds>` paints every poster at that moment, freezes, and sets `window.__ready`.
- `?poster=<id>` shows one poster large (`another-sky`, `swarm`, `wheel`, `venus`, `tether`).
- `?debug` logs build times and exposes `window.__bureau`.
- `prefers-reduced-motion` shows each poster at a chosen still moment, with no loop. The loop
  stops when the tab is hidden, and only posters on screen redraw, each at its own low frame
  rate (12–24 fps). The device pixel ratio is capped at 2.
- No libraries, no images, no renderer: Canvas 2D only. Google Fonts load from a stylesheet.

## Files

- `index.html`: the page, styles and copy.
- `js/paint.js`: the airbrush/frisket engine.
- `js/kit.js`: the shared poster layout, lettering band and service lamp.
- `js/bureau.js`: the runtime (build order, freeze, reduced motion, visibility, the board's clock).
- `js/posters/*.js`: one file per destination.
- Thumbnails (in the sankala.me gallery): `previews/thumbs/dyson-travel-bureau.jpg` and `-phone.jpg`.

## Weaknesses

- **First paint costs main-thread time.** Each poster is painted once, visible ones first,
  one per frame. In headless Chromium with software canvas, all five take about 1.2 s at
  DPR 1 and about 3.9 s at DPR 2. Another Sky is the slowest, at about 1.5 s of that at DPR 2.
  Until a poster is done its sheet shows plain board, and the page text is usable at once.
  A production version should paint in a worker (OffscreenCanvas) or ship pre-painted base
  images, with only the living layer running live. That would also suit the collection's
  "fast and static" rule better.
- The Wheel's live overlay recomputes the turning band per pixel (about 4 ms a frame at
  DPR 2, 15 fps). It's fine on a laptop. On low-end phones it could drop to a crossfade
  between pre-painted frames.
- The small caps on the posters are texture rather than reading text at phone width. Every
  fact also appears in the HTML caption.
- Another Sky's trains move at true speed, so you have to look for them. That's honest but
  subtle.
- The idea of retro travel posters for space destinations has precedents (JPL's "Visions
  of the Future" series is the best known, in a flat mid-century screenprint look). The
  airbrush process, the open/not-yet honesty and the living details make this different,
  but the overlap exists. The sankala.me covers also have an Another Sky poster
  (art-deco railway lithograph) and a Dyson Swarm cover (space-age screenprint), with a
  different style and a different living mechanism. Collectors transiting the Sun are not
  reused here.

## Questions for San

1. Are these the right three "not yet" places? Other candidates: a Bernal sphere, the lunar
   south pole (the Sun walks around the horizon once a month), a Mars greenhouse.
   Or should only real, open destinations be shown?
2. Is it all right to state a short fact on each idea poster (1.8 km, 50 km up)? Or should
   those posters carry only their names until you build them?
3. Should the dated board stay (date, time, open and not yet), or is one line enough?
4. Should the Wheel keep turning on the visitor's real clock (one turn a minute, synced to
   :00), or is a free-running loop clearer?
5. The traveller on the Another Sky hill is the only person on the page. Keep them, or let the
   world be empty?
6. If this direction is chosen, should the posters also become the share cards and the
   world-preview images, replacing the screenshots? The repo currently asks for real
   screenshots there.

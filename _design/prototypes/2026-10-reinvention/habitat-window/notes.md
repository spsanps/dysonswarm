# Concept 3: a window in the habitat

A sample for a reinvented dysonswarm.com homepage. The page is one window in a house
inside Another Sky, painted in watercolour over a pencil underdrawing. The light follows
the visitor's clock. Beside or below it are two short lines and plain links to walk in
Another Sky, see the swarm, sankala.me and Paper Robots.

Open `index.html` in a browser (from the repo root over http, or straight from disk).

| Query | What it does |
| --- | --- |
| `?hour=<0-24>` | Starts the clock at that hour; it then runs in real time |
| `?t=<seconds>` | Freezes that moment (with `hour`, default 15.25), draws it once and sets `window.__ready` |
| `?layer=<name>` | Review aid: shows one wash in grey (`water`, `town`, `cool`…) |
| `?nopencil` | Review aid: hides the underdrawing |
| `?pitch= &yaw= &fov= &s= &z= &above=` | Review aid: moves the camera |

## The idea

What you see from the window is the view that makes an O'Neill cylinder strange: the lake
below the house climbs the left wall and goes over the top, fields and towns hang
overhead, and the far end wall stands at the end of the valley like a pale disc with the
light spine running out of its centre. The room is only pencil (casing, sill, latch).
All the colour is in the view. One quiet frame around one living thing.

The window bars are bare paper. The painter taped them before painting, and a little
paint crept under the tape in places. When the page loads, the pencil drawing appears
first. Then the sheet is washed in the order it was painted: the air, the end wall, the
land, the lake, towns and shadows, and finally trees and the hour. The trees stay white
paper until their turn, the way a painter reserves them.

## How the view matches the explorer

- `js/world.js` copies Another Sky's geometry from `/another-sky/explorer.js` unchanged:
  R = 12 km, L = 56 km, `terrain`, `lakeField`, `urban`, the greenery channel, the 280 × 370 m
  field grid, the three bridges, the five transit rings 1,060 m up (and their ground hoops
  and ties), the six luminaire lines at 125 m, the axial spine and lamp collars, the end
  wall's rings, seams, rims, hub and spokes, and the trail from Firstlight Overlook. The
  only change is a fast path in `lakeField` that skips lakes more than three radii away;
  it gives identical land and water.
- The view is ray-cast from that terrain into a low-resolution buffer (`js/view.js`), so
  the shoreline, the hill's brow, the far lakes overhead and the end-wall disc fall where
  they do in the explorer. Pencil shorelines are contour lines from the same buffer.
- The house is imagined: a top-floor window 14 m up, on the brow of the hill about 400 m
  down the trail from Firstlight Overlook (s = 1560, z = 3880). It looks down the axis with
  the explorer's first-view yaw (−0.24), pitched up 27° to show the land overhead. The
  explorer starts you a few hundred metres behind this window, facing the same way.
- Buildings, trees and boats follow the explorer's placement rules (the 160 m city cells,
  the overlook grove, the sparse woods, sailboats on the lakes). They use a seed per cell
  rather than the explorer's single random sequence, so they're in the right places and
  densities but aren't the same individual buildings. Clouds use the explorer's heights
  and sizes but are my own seeded set, and here they drift along the axis.
- Another Sky has no mirrors or land and window strips. It is lit by the spine along the
  axis. So "mirror-day" here is spine-day. Stars are never shown, because there aren't any.

## The time rule

**The visitor's local clock.** It gets dark in the window when it gets dark where you are.
The caption under the window says the time and what's happening ("9:18 pm where you are.
Night. The lamps on the far side are on.").

- The spine comes up from about 5:30, is full from 8, warms after 4:30 pm, goes amber,
  and is dark by about 8:40 pm.
- In the morning the light leans from the far end wall, so the view is against the light.
  In the evening it comes from behind the house. The terrain's shadow glazes follow this.
- Lamps each have their own hour. Windows come on between 6:30 and 8:30 pm, earlier in
  the dense middle, and most go off between 10 pm and 2 am. Street, bridge and trail lamps
  stay on. The luminaire lines, the transit rings' running lights and the end wall's gold
  rim and hub glow at night.
- Trains run the transit rings at the explorer's speeds (105–170 m/s), positioned by the
  clock. A shower wanders the left wall and rains for about 45 minutes in every 100.

The hour never filters the picture. Each wash's pigment and strength are chosen for the
hour (`js/light.js`), and the same brush marks are re-washed. The sheet is re-composited
when the light has changed enough (every few minutes, more often at dusk) and crossfades
over 1.6 s. A re-wash costs about 15–35 ms, done in slices.

## The style, and how the process is simulated

**Plein-air watercolour over a graphite underdrawing.** Warm palette: aureolin, raw
sienna, rose, cerulean, cobalt, ultramarine, sap and Hooker's greens, burnt sienna,
indigo and gamboge.

- **Pigment, not colour.** Every wash is a density map (20 layers). The sheet is
  composited as transparent glazes (Beer–Lambert): paper × exp(−Σ density × absorption).
  Overlaps darken, and only paper is white.
- **Paper.** Cold-pressed tooth (rounded cellular bumps plus felt noise) and a slow cockle
  that pools pigment and catches a raking light.
- **Granulation and flocculation.** Pigment settles in the valleys of the tooth, strongly
  for the blues, earths and shadow violets, barely for the transparent yellows and greens.
  Ultramarine-like washes also clump.
- **Edges.** Hard dried edges with pooled pigment (edge darkening) on the lake shore,
  groves, trees and each field. Soft wet-in-wet blending in the air. Hairlines of paper
  between some fields. Backruns (cauliflower blooms) in the air wash and the lake.
- **Dry brush.** The near meadow, groves and the light on the lake skip the paper's
  valleys, so the reflection of the end wall is broken white sparkle.
- **Reserves.** The spine, roofs, the bridge deck, sails, luminaires and the rings' lit
  sides are left as paper. At night they are covered by the indigo glaze, and the lamps are
  reserved and touched with yellow.
- **Misregistration.** The washes are slightly out of register with the pencil, as they
  are by hand.
- **Pencil.** Ruled construction (eye line, vanishing point, rays, a ghost circle of the
  tube), one circle drawn too small and rubbed out, then the drawing: shores, the hill's
  brow, the bridge, the rings, a few building lines, scribbled tree canopies, then the
  ruled window. Lines overshoot corners, are restated, wobble with tremor and pressure,
  and graphite only sits on the paper's peaks.
- **Clouds.** Lifted with a damp tissue (soft paper-coloured shapes) with a cool belly
  glaze. Each is lit on the side facing the spine and shaded on the side facing its own
  ground, so overhead ones show bright tops and near ones grey bellies. They turn peach and
  rose at dusk. The shower's rain runs toward its own ground.

## Living things, and cost

Clouds drift (4–8 m/s), trains go round, the shower comes and goes, lamps come on one by
one, and the light is re-washed through the day. The overlay layers redraw at about
12 fps and cost about 0.5 ms a frame. The loop stops when the tab is hidden. With reduced
motion the page shows a still, re-washed every 10 minutes.

The first paint is computed in the browser, sliced so the page stays responsive. On this
machine (headless Chromium, desktop CPU) the pencil appears after about 0.3 s and the
painting is finished at about 1.2 s for a 1440 × 900 screen, 1.6 s at 2× density and 0.9 s
at phone size. Washes stop at 1.3× density; the pencil uses the full density (capped at 2).
The text is static HTML and isn't blocked, and the font loads without blocking render.

## Weaknesses

- I haven't tried it on a real phone or in Safari. Phones will probably take 2–3 s to
  finish the painting. Moving the build into a worker would free the main thread, but it
  wouldn't make the painting appear sooner.
- It needs CSS `mix-blend-mode: multiply` for the pencil and glaze layers (all current
  browsers have it).
- The far towns at night still bunch into soft ovals; up close they can read a little like
  star clusters.
- Trains are only a few pixels long, and the shower is subtle. Both are easy to miss.
- Trees keep some of the explorer's lollipop proportions. The Meridian buildings are pale
  and slightly ghostly.
- The pencil around the end wall (its rings plus three transit rings) is busy.
- The near meadow is the plainest part of the painting.
- The weather is a fixed 100-minute cycle, not tied to the date.
- At 1440 × 900 the footer sits just below the fold.
- Links are relative to this folder (`../../../../another-sky/`). At `/` they become
  `/another-sky/` and `/swarm/`.

## Questions for San

1. Should it follow the visitor's local clock (what this does) or San Jose time, so
   everyone sees the same moment as you?
2. Is the wash-by-wash reveal on load welcome, or should the painting just appear?
3. Should the pencil construction stay visible (the vanishing point, the rubbed-out
   circle), or should it be quieter?
4. Copy: "This is the view from a house inside Another Sky. The light follows your clock.
   You can go and walk around in it." Is that close to how you'd say it?
5. A suggestion only, not on the page: once "Nobody Owes Anything Now" is published on
   sankala.me, the night caption could quote it ("At night there are no stars above me,
   / only the lamps of the far shore") with a link to the poem. The current captions
   are my own words. I left out "the rain falls up, towards its own ground", which the
   midday caption first echoed.

## For the style register

Plein-air watercolour over a graphite underdrawing, taped window bars left as paper,
re-washed live by the visitor's clock.

## Files

- `index.html`: page, copy and layout
- `js/world.js`: Another Sky's geometry (from the explorer)
- `js/view.js`: the window's camera and the ray buffer
- `js/features.js`: spine, end wall, rings, luminaires, bridges, buildings, trees, trail,
  boats and lamps, projected
- `js/shapes.js`: those shapes rasterized into density maps
- `js/paper.js`: paper, noise and blur
- `js/paint.js`: the washes and watercolour effects
- `js/light.js`: the hour, the pigments and the compositor
- `js/pencil.js`: the underdrawing and the ruled window
- `js/live.js`: clouds, shower, trains and lamps
- `js/main.js`: lifecycle, the reveal, re-washing and the controls above

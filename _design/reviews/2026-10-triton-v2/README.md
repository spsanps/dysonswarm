# A Moon That Thinks: Triton, version 2 (October 2026)

The rebuild of `/triton/` after San rejected the clay diorama ("I don't get it… Clay? What?").
Built on the branch `triton-v2`; not pushed, not merged. The rejected version is kept
unpublished in `_archive/triton-clay/` (site and share card), and its review stays in
`../2026-10-triton/`.

## The idea

**Fly to Neptune's moon and watch it become a mind.** Triton at true scale (2,707 km across),
turned into a computer over six centuries, in one continuous world:

- **From orbit:** Triton half lit, Neptune and its rings behind. The visitor grows the mind with a
  year slider (it plays once on arrival): trunk lines run from a dish near the south pole to hubs,
  dendrites branch off them like frost, radiator fields spread as garnet jewels. On the night side
  the network glows and pulses run home along it. Imagined numbers update as it grows: radiator
  area, heat shed (= power), multiples of all human power, operations a second, share of the surface.
- **On the ground:** click anywhere to descend (about 8 s, log altitude, a glide slope at the end).
  Walk (0.78 m/s² gravity, bounding, jumping) or fly. Radiator panels 390 m tall stand in rows to
  the horizon (2.3 km away at eye height), halls with lit windows line the avenue, two people and a
  rover give scale, a nitrogen geyser rises 8 km and bends downwind, Neptune hangs 30° up and
  never moves, and the trunk line runs overhead on pylons carrying pulses home.
- **Gold wire means mind.** In daylight every form has its wire, as on the cloisonné cover. At night
  the other forms sink into deep blue glass with thin dark cloisons, and only the network keeps
  bright gold. Pulses in the wire on the fin-top manifolds and trunks are results heading home.

## Style (for the register; the register itself is not edited)

**Cloisonné enamel in 3D, rendered live**: every cell, material change and silhouette becomes raised
gold wire, found each frame by a jump-flood distance field over a G-buffer of cell ids; glossy
jewel fills (lapis and turquoise Neptune, rose-white cap, celadon cantaloupe, garnet halls and
fields, pearl panels), frit, pinholes, a meniscus at the wire, a short wire shadow; the geysers in
wireless (musen) enamel; gilt four-point stars and a gilt Sun. The ground's cloisons are Voronoi
cells at eight sizes from 150 km down to 2 m, each cell shown only when it is big enough on screen,
so the plaque re-divides itself as you descend. It extends the Compute on Triton cover's cloisonné
(same piece, same style), and differs from Venus (mid-century painted space art) and the orbital
ring (1960s Ektachrome). Type: Cinzel 700 (from the cover) and the system sans.

## What is real and what is imagined

Real: Triton's size, gravity, 38 K surface, thin nitrogen air, the south polar cap, its dark
streaks, the cantaloupe terrain (cells at their real 30 km size at one level), the blue collar,
the geysers (8 km columns, 100+ km trails); the Sun and Neptune in Triton's sky for the actual
date (Neptune's phase, its pole and ring tilt turning with Triton's orbit), light time to Earth.
Voyager 2 saw about 40% of Triton well; the rest follows the same patterns and the notes say so.

Imagined: the whole machine and its numbers (panels 390 m tall, rows 250 m apart, ~250 W/m² at
300 K, 10¹⁴ operations per joule). At full size it sheds ~800 times the sunlight Triton absorbs;
the notes say a real one would warm its own ice.

Liberties, stated in the notes: Neptune's rings are drawn far more visible than they are; from
orbit the enamel cells and trunk lines are enlarged; the glow and pulses are drawn (real cables
don't glow) and slowed enormously (a real signal crosses Triton in ~21 ms). The opening view uses
the next moment within six days when the Sun lights Triton from the side; the HUD's "Sky" line
says when that is and switches to today's sky.

## How it is built

`triton/`: `index.html`, `styles.css`, `js/`, `fonts/` (Cinzel 700 subset, OFL), `images/`.
The intro loads only `intro.js` + `astro.js` (≈3 KB gzipped) and a still from the renderer
(≈280 KB total). Enter imports the app (all JS ≈47 KB gzipped). No libraries, no textures beyond
what is computed at load.

- `astro.js` — light time (JPL elements, checked against Horizons) and Triton's sky (kept from v1).
- `world.js` — true-scale constants, hash/noise/Voronoi (GLSL twins), cube-sphere, height field.
- `machine.js` — the network (hubs, a spanning tree of trunks, space-colonisation dendrites),
  radiator fields, the field map, the lattice, the numbers.
- `worker.js` — two module workers build terrain chunks and the 3D things near the camera.
- `terrain.js` — cube-sphere quadtree (33² chunks with skirts, horizon and frustum culling,
  parent kept until all children arrive), down to ~2 m vertex spacing.
- `render.js`, `shaders.js` — camera-relative rendering with log depth; G-buffer of light and
  cell ids; analytic panel shadows; ray-traced Neptune and rings; ray-marched geysers; the
  enamel passes (base colour, wire seeds, jump flood, glow, finish).
- `app.js` — boot, orbit camera, descent and ascent, walk/fly, touch pad, atlas, notes, HUD.

The style study that chose enamel is `_design/prototypes/2026-10-triton-styles/` (pastel and
paperback removed after San's pick).

## Controls

Orbit: drag to turn, scroll/pinch to zoom, click Triton to land; arrows/WASD turn, +/− zoom.
Ground: click to look with the mouse (or drag), WASD, Shift to bound, Space to jump, F to fly,
Space/Q to climb and sink, scroll for flight speed, O for orbit. Anywhere: G grows the mind,
M atlas (click the map to land; shortcuts to the landing, the dish, a geyser, a night field),
P photo, H hide the interface, ? notes. Phones: left pad to move, drag to look, ↑/↓ buttons.

Care: boot screen with progress; WebGL2 failure and context loss explained, with a way to the
notes; reduced motion (year shown grown, no autoplay, still pulses, fades instead of flights);
paused when hidden; quality setting (auto steps the resolution down when frames are slow).

Test hooks: `?enter=1`, `&t=<s>` (freeze), `&year=`, `&view=surface`, `&lat=&lon=&yaw=&pitch=&alt=`,
`&night=1` (a field where it is night), `&descend=0..1` (freeze the descent), `&olat=&olon=&od=`,
`&hours=` (sky offset), `&q=`, `&ui=0`, `&nogl=1`, `&bench=N`; `window.__ready`, `window.__bench`.

## Checks (headless Chromium, SwiftShader software GL)

No console errors entering orbit or the surface at 1440×900 and 390×844; no horizontal overflow at
390 px; the intro loads no renderer; notes and atlas open and close; the no-WebGL2 path shows the
message and the notes button; reduced motion boots grown and still. All scripts pass `node --check`.

| View | Size | Median frame (software GL) |
| --- | --- | --- |
| Orbit, year 560 | 1440×900 | 667 ms |
| Orbit, year 560 | 390×844 | 417 ms |
| Surface, landing | 1440×900 | 4,200 ms (q=low: 2,470 ms) |
| Surface, landing | 390×844 | 1,300 ms |

Software GL is many times slower than any GPU; the old clay version measured 1,095 ms at
1440×900 medium on the same setup. The surface is the heavy view (terrain Voronoi at several
levels, analytic panel shadows, ~5,800 instances). Real-device timings are still unmeasured.

## Images

| File | What |
| --- | --- |
| `01-intro-desktop.jpg` | Intro over a still from the renderer |
| `02-orbit-year-560-desktop.jpg` | Orbit at the terminator, full growth, interface |
| `03-orbit-year-140-desktop.jpg` | The same view early on: first trunks, a few fields |
| `04-descent-desktop.jpg` | Mid-descent: the plaque re-dividing, fields as dark jewels, a geyser trail |
| `05-surface-day-desktop.jpg` | The landing: panels, halls, people, the geyser, Neptune 30° up |
| `06-surface-night-desktop.jpg` | A field at night: only the network keeps its gold |
| `07-intro-phone.jpg`, `08-orbit-phone.jpg`, `09-surface-phone.jpg` | 390×844 |

## Weaknesses and open questions

- The surface is heavy in software GL; on weak phones auto quality will drop resolution a lot.
- Panels far away become dense stacks of wire; the horizon band can look busy.
- The landing ground is mostly in lavender shade at the opening sky time; a lit-ground start
  would show the rose ice better.
- Mid-descent, distant fields read as dark blots until the 3D panels appear.
- No "send a message" layer (kept out; the HUD states the light time instead).

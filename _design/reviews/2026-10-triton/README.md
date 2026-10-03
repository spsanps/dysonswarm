# Four Hours Out: computing on Triton (October 2026)

A new interactive for the collection at `/triton/`. San suggested it ("maybe compute
clusters in Neptune's moons"). Built on the branch `triton`; not pushed, not merged, and
not yet linked from the homepage (its poster is being drawn separately).

## The idea

A small computing campus on Triton, Neptune's largest moon, as a clay model you can turn
in your hands. It runs only work that can wait, because everything is four light-hours
from home. Time is made visible by light delay:

- A board says when a message sent from Earth now arrives, and when the answer gets home
  (real Earth–Neptune distance for today's date, in the visitor's own time zone).
- A strip between Earth and Triton shows the halls' checkpoints that are on their way
  home right now, creeping across over four hours. "Send a hello" adds your own message
  and, eight hours later, a reply describing Triton's sky when it arrived.
- Each hall runs a long job (training runs, a climate ensemble, robot practice, the
  archive's nightly copy) with a start date, progress and checkpoints, all derived from
  the real clock, so everyone visiting at the same moment sees the same thing.
- "As Earth sees it" shows Triton as the light now reaching Earth shows it: four hours old.
- Neptune's phase and the Sun follow Triton's real 5.88-day cycle. Neptune never moves in
  the sky (Triton is tidally locked); the Sun rises in the west (Triton spins backwards).
  At sunset Neptune is a thin crescent next to the Sun; by sunrise it is nearly full.
- One person: a caretaker who walks the rounds, looks in at the halls, checks the dish
  and the reactor, then sits on a bench facing Neptune.

## Style (for the register)

**Plasticine stop-motion diorama**: a round core sample of Triton with a cut, layered side;
thumb-pressed clay buildings with lit windows you can look into; cotton-wool geyser; salt
glitter on the frost; one hard little sun; tilt-shift focus. The world moves on twos
(12 steps a second, like stop-motion) while the camera stays smooth. Type: Fredoka
(headings) and Nunito (text), both new to the register. Not Townscaper's or Tiny Glade's
look, and not Another Sky's, the Venus experience's or the ring ride's.

## What is real and what is imagined

Real: Triton's sky (Sun and Neptune positions, Neptune's phase, Neptune's 8° size),
light delay, sunlight 1/900 of Earth's, 38 K surface, 14-microbar air, geysers and dark
streaks like Voyager 2's, cantaloupe terrain, Neptune's pale colour (Irwin et al. 2024),
the physics in the notes (Landauer limit, σT⁴ radiators, superconductors).

Imagined, and said so on the page: the campus, the jobs, the caretaker, the reactor and
the relay. The geyser is drawn far smaller than real (8 km). The model is held in front
of the sky like a painted backdrop, so Neptune shows behind it; from the ground it would
sit 8° above the horizon in the same direction (the notes say this).

Numbers: Earth–Neptune from JPL's approximate Keplerian elements, checked against JPL
Horizons (within about a second of light time for 2026–27). Triton's cycle (5.87638 days,
anchored to Neptune's minimum phase seen from Triton on 2026-10-06 19:30 UT, checked
against the minima of 2028-01-02 and 2029-06-02) and the subsolar latitude (2020–2040
table) are fitted to Horizons. The site is imagined at 15° S, 82° W of the sub-Neptune
point. Sources are listed in the page's Notes.

## How it is built

`triton/` follows `another-sky/`: `index.html`, `styles.css`, `js/`, `fonts/`, `images/`.
The intro page loads only `intro.js`, `astro.js` and `dialog.js` (about 5 KB gzipped)
plus a still rendered by the real renderer. Enter loads the renderer (all JS about 48 KB
gzipped). No libraries, no textures beyond a baked 384² ground map and a 32³ noise
texture made at load.

- `astro.js`: light delay, Triton's sky, time formatting.
- `jobs.js`: the deterministic job schedule and the messages in flight.
- `world.js`: layout, terrain, every modelled object, the caretaker's day, the geyser.
- `meshes.js`: rounded boxes, shapes pressed out of distance functions, lathe, capsules.
- `shaders.js`, `render.js`: shadow map, clay shading, window interiors (racks you can
  look into), the backdrop with Neptune, shallow focus at half resolution, glow.
- `app.js`, `ui.js`: boot, camera, picking, time-lapse, Earth view, the board and cards.

Care items: boot screen, graceful WebGL2 failure (with a way to the notes), context-loss
message, mouse/touch orbit and pinch zoom, keyboard, reduced motion (the world holds
still), pause when hidden, 12 fps redraws when idle, DPR cap and quality setting
(auto/high/medium/low; phones start on low; auto steps down if frames are slow), photo.

Test hooks: `?enter=1`, `&date=ISO`, `&t=seconds` (freezes animation), `&cam=yaw,pitch,dist`,
`&target=x,y,z`, `&q=`, `&ui=0`, `&focus=0..3`, `&select=id`, `&earth=1`, `&board=1`,
`&notes=1`, `&nogl=1`, `&bench=N`; `window.__ready`, `window.__bench`.

## Controls

Drag to turn, scroll or pinch to zoom, click or tap a building (halls, reactor, dish,
cabin, geyser, the caretaker). Keys: arrows/WASD turn, + and − zoom, 1–4 halls,
T time-lapse (2 hours a second), E as Earth sees it, P photo, H hide interface, R reset,
N notes, Esc close.

## Performance (headless Chromium, SwiftShader software GL)

| Size | Quality | Median frame |
| --- | --- | --- |
| 1440×900 | medium (MSAA 4, 2048 shadows, 24-tap focus) | 1095 ms |
| 1440×900 | low | 415 ms |
| 390×844 | low (phones start here) | 128 ms |

Software rendering is far slower than any real GPU; these are relative numbers. Real
device timings still need checking, especially mid-range phones. When idle the page
redraws at 12 fps (the stop-motion step), not 60.

## Verification

Playwright (Chromium, SwiftShader): intro loads no renderer and weighs about 250 KB;
notes open and close; Enter builds the world with no console errors; clicking a hall
opens its card; keys 1–4, time-lapse, Earth view and Send a hello work; the no-WebGL2
path shows a message and a way to the notes; reduced motion on a phone emulator boots
and shows the board; no horizontal overflow at 390 px. All scripts pass `node --check`.

## Images

| File | What |
| --- | --- |
| `01-intro-desktop.jpg` | Intro page at 1440×900 over a still from the renderer |
| `02-sunset-board-desktop.jpg` | Just before sunset: crescent Neptune, long shadows, the board |
| `03-low-angle-desktop.jpg` | Low camera: halls under a crescent Neptune |
| `04-hall-card-night-desktop.jpg` | Night: Le Verrier's job card |
| `05-caretaker-close.jpg` | The caretaker on her bench, facing Neptune |
| `06-sunrise-desktop.jpg` | Sunrise: nearly full Neptune, pink frost, the caretaker on her rounds |
| `07-intro-phone.jpg` | Intro on a phone |
| `08-night-board-phone.jpg` | Night on a phone, board open |

The share card source is `../../social-cards/triton.html` (frame: `triton-frame.jpg`).

## Weaknesses

- The geyser reads a little like smoke from a chimney, despite sitting on open ice
  away from the buildings. The card explains it, but a viewer may first think pollution.
- Radiator fins look like card more than clay at close range.
- The model is a floating core; the "backdrop" staging of the sky is a deliberate cheat.
- Shadow edges stair-step at very low sun; the night view is mostly one big shadow
  (correct for Neptune 8° up, but less legible than daytime).
- Performance on real phones is unmeasured.

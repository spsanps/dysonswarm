# Collection homepage v3: a trip out from the Sun (October 2026)

Branch `home-v3`; not merged or published. San liked the v3 look; this round follows his notes:
start directly at the Swarm, make "fifty years out" a statement, fill the empty stretches, fix
the overlaps.

## What the page does

- **First screen = the Swarm.** The Sun, Mercury quarried by a mass driver, collectors on tilted
  orbits, under "DYSON SWARM" in the poster's lettering, with the Swarm's line and "Open the
  Swarm". The top bar lists the five places. Words sit in clear space; nothing overlaps the art.
- **Second beat: "Starting in the 2050s."** The camera turns from the Sun into the dark; the
  statement (draft copy for San to approve), a printed timeline from now to 2080 (most futures
  bracketed at 10 to 20 years, these places a solid bar from 2050 on) and the tagline.
- **The trip.** Venus under its shade, the Earth with the Orbital Ring (true coastlines), Another
  Sky cut open to show the land inside, then out past Mars, the asteroid belt, Jupiter, Saturn and
  Uranus to Neptune and Triton in cloisonné. Each place holds while its card is up.
- **Between places:** a solar sail and a comet near the Sun, an asteroid under tow and freighters
  past Venus, traffic from the Moon to the cylinder, labelled planets, the Kuiper belt, and a
  readout of the distance from the Sun with the age of the sunlight ("0.72 AU from the Sun ·
  sunlight 6 min").
- Card copy matches the experiences now: Triton is "A moon grown into a computer, from 2050 to
  2090, powered by fusion."

## Images

| File | What it shows |
| --- | --- |
| `first-screen-1440.jpg` | The first screen at 1440 × 900. |
| `statement-2050s-1440.jpg` | The 2050s beat. |
| `journey-strip-1440.jpg` | One frame per place, plus the 2050s beat. |
| `between-places-1440.jpg` | Three moments between places (sail and comet, tug and freighters, the planets passed). |
| `phone-390.jpg` | A 390 × 844 phone: first screen, 2050s, Venus, Triton. |
| `first-screen-2560-scaled.jpg` | The first screen at 2560 × 1440, scaled down. |
| `detail-sun-2560-actual-pixels.jpg`, `detail-mercury-2560-actual-pixels.jpg` | Close-ups at 2560 at actual pixels: granulation, spot filaments, prominences, collectors with cells; Mercury's terraced quarry, mass driver and rubble. |
| `windows-chrome-1440.jpg` | The same page in real Windows Chrome (first screen, Triton). |

## Checks

- Headless Chromium at 1440 × 900, 2560 × 1440, 390 × 844 and 360 × 780; real Windows Chrome
  (RTX 4090, D3D11) at 1440, 2560 and 390 (phone emulation), each scrolled through the whole trip.
- No horizontal scroll at 1440, 390 and 360; no console errors or failed requests.
- Stills layout (no JavaScript, reduced motion, `?still`): every section shows its still and the
  same words.

## Weight and timing (Windows Chrome)

- First view: about 530 KB (HTML, CSS, two fonts, the Swarm's still, the trip's JavaScript).
  The whole trip adds about 180 KB (the posters in the cards, the land mask).
- Largest contentful paint 60 ms (216 ms with the CPU slowed 4×); live in about 170 ms.
- Scrolling the whole trip: 16.7 ms median frame, 17.8 ms at the 95th percentile at 1440
  (18.7 ms with the CPU slowed 4×); no long tasks while scrolling. The page's own drawing costs
  about 0.5 ms a frame (sky 0.2, live layer 0.3).
- Plates print in a worker, 20 to 110 ms each at 2560, only for places near the camera.

# The Orbital Ring: review frames (October 3, 2026)

A new experience at `/orbital-ring/`: ride a car up a cable from a platform on the equator
(the Equatorial Channel, Maldives) to a station on an orbital ring 300 km up, after Paul
Birch's 1982 papers. At the top, step into an observation pod, travel along the ring past
24 stations (one every 15° of longitude), and ride any cable down that lands on water.
Not published; branch `orbital-ring`, for San's review.

**One line:** a ring circles the Earth 300 km up, and cables hang from it to the sea; ride one up.

**Look (for the register):** 1960s Ektachrome through a capsule window: slide-film
characteristic curve, warm dye cross-talk, grain in density, red halation, lens ghosts,
a black window frame. A second look, `?style=poster` (or L), prints the same world as a
three-ink op-art screenprint after the poster: sky bands concentric with the limb, flat
turquoise sea with paper rings, cerise ring with paper tracks, one black cable line, out of
register on warm paper.

## Frames

All rendered by the experience itself (headless Chromium, SwiftShader), dawn on October 3.

| File | Moment |
| --- | --- |
| `01-platform-dawn-desktop.jpg` | On the platform before dawn, with the interface. The ring rises from the horizon as a thin sunlit line. |
| `02-looking-up-the-cable.jpg` | The opening tilt: through the glass roof, the ring crosses the whole sky and the cable rises to meet it. |
| `03-five-km.jpg` | Above the trade-wind cumulus; the horizon glow. |
| `04-fifty-km-sunrise.jpg` | Sunrise at about 35-50 km: the car climbs into it while the sea is still dark. |
| `05-under-the-station.jpg` | The last minutes, looking up: the station, the ring and the cable converging. |
| `06-along-the-ring.jpg` | The pod: the ring runs down to the limb toward the sunrise. |
| `07-travelling-midday.jpg` | Travelling east at 4 km/s near 106°E (station 2), midday. |
| `08-screenprint-clouds.jpg` | The second look at 2.4 km. |
| `09-phone-platform.jpg`, `10-phone-space.jpg`, `11-phone-gallery.jpg` | 390 × 844. |

Style comparison pairs (same moments, both looks) are in the sankala.me gallery folder
`design/prototypes/2026-10-code-drawn-art/previews/thumbs/ring-styles/`.

## Checked

- Intro page loads no renderer; Enter imports `ride.js`, builds the sky tables (transmittance,
  multiple scattering, irradiance), noise and clouds, then rides. No console errors.
- Ride timing: 1 m/s² up to 670 m/s, braking at 3 m/s² for the last 75 km, 14 min 54 s;
  ×1, ×5 (default), ×20; pause; jump to any height (Stills, the rail).
- Free look (drag, arrows, pinch, wheel); the view eases back on R. Opening and gallery
  establishing moves run in real time and stop as soon as you take over.
- Travel along the ring (A/D, buttons), stop (S), glide to the next station (N), ride a cable
  down at a water station (tested at station 1, 88.3°E; local time shifts by an hour per station).
- Departures: dawn, midday, dusk, night, now (the real hour at the platform).
- The roll of twelve square photographs and the contact sheet download.
- WebGL2 missing or context lost: a plain message and the ride in seven stills.
- Reduced motion: the car waits; stills; static grain.

## Performance (honest)

Measured only in SwiftShader (software rendering on the CPU), one frame, 1440 × 900:
platform 3.6 s, 5 km 2.8 s, 50 km and the gallery 0.75 s. A real GPU is typically a few
hundred times faster, so expect roughly 10-30 ms near the clouds on a laptop GPU and much
less above them. "Auto" quality lowers the internal resolution to keep about 40 fps; "Light"
renders at 0.75× device pixels. Needs measuring on a real phone before launch.

## Known weaknesses

- Clouds are rounded domes with noise; good from the car, plainer from orbit than real
  trade-wind cumulus. No cumulonimbus close by (kept far from the platform on purpose).
- The station and platform are simple shapes; the station is not designed in detail.
- The far ring line is drawn slightly wider than physical (stated in About), and beacons on
  it are an addition.
- The ring is mostly in shade at dawn, so from the pod it shows as a line only where it is lit.

# Collection homepage v3: a trip out from the Sun (October 2026)

Branch `home-v3`. The first version of this trip went live; San then asked for one reduction:
start on place 01 with its poster, laid out like every other place, and move the explanation to the
end. This record describes the page after that change.

## What the page does

- **First screen = place 01, the Swarm,** with the same card as every place: the Dyson Swarm
  poster, "01 · The Swarm · Mercury · 0.39 AU · sunlight 3 min", THE SWARM, its line and "Open the
  Swarm". No title lettering on the art; the site's name is the small wordmark in the top bar. A
  small scroll hint in the distance readout's style sits at the foot.
- **The trip.** Venus under its shade and the Earth with the Orbital Ring (both arriving soon),
  Another Sky cut open to show the land inside, then out past Mars, the asteroid belt, Jupiter,
  Saturn and Uranus to Neptune and Triton in cloisonné. Each place holds while its card is up.
- **Between places:** a solar sail and a comet near the Sun, an asteroid under tow and freighters
  past Venus, traffic from the Moon to the cylinder, labelled planets, and a readout of the
  distance from the Sun with the age of the sunlight.
- **The end, past Neptune by the Kuiper belt: "Starting in the 2050s."** with the printed timeline
  (most futures bracketed at 10 to 20 years, these places a solid bar from 2050 on) and the tagline.
  It stays up as the footer comes into view; the distance readout steps aside.
- Card type and posters scale with the screen up to 4K (unchanged at 1440).

## Images

| File | What it shows |
| --- | --- |
| `first-screen-1440.jpg` | The first screen (place 01) at 1440 × 900. |
| `end-statement-1440.jpg` | The end of the trip: "Starting in the 2050s." |
| `journey-strip-1440.jpg` | One frame per place, then the end. |
| `between-places-1440.jpg` | Three moments between places (sail and comet, tug and freighters, the planets passed). |
| `phone-390.jpg` | A 390 × 844 phone: first screen, Venus, Triton, the end. |
| `first-screen-2560-scaled.jpg` | The first screen at 2560 × 1440, scaled down. |
| `detail-sun-2560-actual-pixels.jpg`, `detail-mercury-2560-actual-pixels.jpg` | Close-ups at 2560 at actual pixels: granulation, spot filaments, prominences, collectors with cells; Mercury's terraced quarry, mass driver and rubble. |
| `windows-chrome-1440.jpg` | The same page in real Windows Chrome (first screen, the end). |

## Checks

- Headless Chromium at 1440 × 900, 2560 × 1440, 390 × 844 and 360 × 780; real Windows Chrome
  (RTX 4090, D3D11) at 1440, 2560 and 390 (phone emulation), each scrolled through the whole trip.
  (My Chrome ran on debugging port 9345: 9334 was taken by another session's broker.)
- No horizontal scroll at 1440, 390 and 360; no console errors or failed requests.
- Stills layout (no JavaScript, reduced motion, `?still`): every section shows its still and the
  same words.

## Weight and timing (Windows Chrome)

- First view: about 530 KB (HTML, CSS, two fonts, the Swarm's still, the trip's JavaScript).
  The whole trip adds about 180 KB (the posters in the cards, the land mask).
- Largest contentful paint 60 ms (216 ms with the CPU slowed 4×); live in about 170 ms.
- Scrolling the whole trip: 16.7 ms median frame; 95th percentile 18.0 ms at 1440, 17.9 ms at
  2560, 17.6 ms on a 390 phone (18.7 ms at 1440 with the CPU slowed 4×); no long tasks while
  scrolling. Peak memory about 340 MB in the GPU process, 265 MB in the page. The page's own drawing costs
  about 0.5 ms a frame (sky 0.2, live layer 0.3).
- Plates print in a worker, 20 to 110 ms each at 2560, only for places near the camera.

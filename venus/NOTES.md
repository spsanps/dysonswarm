# Terraforming Venus — notes

`/venus/` lets a visitor terraform Venus themselves, following Paul Birch's
"Terraforming Venus Quickly" (J. Brit. Interplanet. Soc. 44, 157–167, 1991): put up a
sunshade, let the air rain and snow out, pave over the frozen carbon dioxide by hand,
spread soil, drop an ice moon, plant. Painted live in WebGL2, from one real headland or
from orbit. The visitor-facing version of these notes is the "Notes" sheet in the page.

## What happens, and whose idea it is

| Year | Stage | Source |
| --- | --- | --- |
| 0 | Venus today: ~92 bar, 464 °C at the old sea level, orange haze; heat pipes and a floating colony already working | Birch §3.3, §8, §11 |
| 5–8.5 | The shade unfolds a quarter of the way to L1, about 1.27 Venus diameters across | Birch §9 |
| 8–15 | Acid clouds rain out, the sky clears | Birch Table 1 (stage 1) |
| 20–90 | CO2 condenses below 31 °C along its vapour-pressure curve; seas fill the lowlands | Birch Table 1 (stages 2–3) |
| 90–109 | Seas freeze at the triple point (216.6 K, 5.18 bar); the rest falls as snow | Birch stages 4–5 |
| 110–125 | Hexagonal cover disks lowered onto the frozen seas by floaters; the visitor can lay them by hand | Birch §8, §11 |
| 113–125 | The land is covered with plastic sheet, strip by strip | **San's addition** |
| 124.5 | A soletta in a 24-hour polar orbit gives Venus a day | Birch §10 |
| 126–136 | Soil laid on top of the covers; the visitor can spread it by hand | **San's addition** |
| 136–150 | An ice moon (Birch suggests Enceladus) broken up and dropped in | Birch §11 |
| 139–200 | Tents, plants, oxygen; colonies settle onto the sea as islands; a town | Birch §11; the town is invented |

All stages and timescales are an imagined plan, not a validated one. Birch's paper is an
engineering sketch; nothing here claims feasibility.

## What is real

- Terrain at large scale: NASA/JPL/USGS Magellan global topography, 4641 m/px, public
  domain (`Venus_Magellan_Topography_Global_4641m_v02.tif`). `data/ishtar-magellan.png`
  is a 1280 km tile around 61.75° N, 5.25° W (south-west of Maxwell Montes, the southern
  edge of Lakshmi Planum); `data/venus-globe.png` is the whole planet at 1024×512 for the
  orbit view (loaded only when someone goes to orbit). Both are built by the scripts in
  `_design/venus/terrain/`; elevations are encoded as described there.
- The CO2 sea level against the fraction condensed comes from Magellan's hypsometry
  (a full CO2 ocean of ~3.65×10^17 m³ reaches about 1,500 m above the 6,051 km sphere).
- CO2 phase data: triple point 216.6 K / 5.18 bar; critical point 304.1 K / 73.8 bar.
- Rayleigh optical depth scales with the gas column (CO2 ~2.4× air per molecule), so the
  sky only turns blue when the CO2 is gone.

## What is invented or painted

- Everything smaller than Magellan's 4.6 km pixels: the headland, its ledge and rocks,
  ridges, gullies, faults, shields, hexagons, machines, the colony, the town.
- Heights are drawn 1.8× taller (as space painters always did).
- Today's air is drawn about fifteen times clearer than it is, so the bay shows; really
  you would see a few kilometres.
- The century-long night is lit as if by moonlight so the land reads.

## The look

- **Painting** (the only look): realist light and atmosphere, repainted with an anisotropic
  Kuwahara filter and oriented brush strokes on a gessoed board (Bonestell lineage). A
  four-ink poster look existed briefly in October 2026; it is in git history.
- The dark centuries under the shade are lit as if by moonlight (`MOON`, `NIGHT_EXPOSURE` in
  `js/world.js`), a little brighter and less blue since October 2026, with thinner night air
  and less dimming from the acid deck, so the rain, sea and snow years read clearly. Today's
  orange air is drawn a little clearer too.

## Speed on Windows

Chrome and Edge on Windows compile WebGL shaders with Direct3D's compiler, which inlines every
function call, so the scene shader is written so its expensive functions have one call site each:
one loop marches the terrain, reads the surface where the ray ends and the four neighbours for
the fine normal (one copy of `surfaceH`); the sky and the cloud layer are read once per ray (the
view and the sea's reflection); the cloud densities in one loop; the hit point's hexagon is found
once and shared by the ice, the paving and the land; the objects shader lights and fogs once.
Loop bounds use `uZero` (an always-zero uniform) so the compiler can't unroll them, and the debug
views are compiled only with `?debug=`. Programs compile in the background (`settle()` and
`isReady()` in `js/gl.js`, KHR_parallel_shader_compile); the page never asks for a status early.

The scene comes in three tiers (`SCENE_FS(debug, tier)`): EARLY (before the CO2 rains: no seas,
ice, cloud layer, paving or soil), MID (seas, freezing and snow, before the paving), FULL. The
tier for the opening year compiles first; the others compile behind it, and a more complete one
takes over on a still frame. Jumping ahead before a tier is ready holds the frame with a note.

Measured in real Chrome on Windows (RTX 4090, 2560×1440), first visit (cold shader cache): Begin
to the first picture 2.4–2.9 s; the middle years ready about 7 s after Begin, all years about 13 s;
60 fps while dragging. Repeat visits (Chrome keeps compiled shaders): first picture 0.6 s, all
years 0.9 s. Six cold and six warm reloads in a row: no lost context, no GPU-process crash.

## Files

- `index.html`, `styles.css`, `js/boot.js` — the intro; nothing heavy loads until Begin.
- `js/app.js` — lifecycle, cameras (stand, fly, orbit), render loop, auto quality.
- `js/glsl.js` — terrain bake, raymarched terrain/sea/sky, objects, light sprites.
- `js/terrain.js`, `js/plan.js`, `js/timeline.js`, `js/world.js` — heights, the hexagon
  plan, the years, light and air.
- `js/objects.js`, `js/dynamic.js`, `js/meshes.js` — rocks, life, machines, colony.
- `js/paint.js` — the painting. `js/orbit.js` — Venus from space.
- `js/weather.js`, `js/ui.js`, `js/gl.js`, `js/noise.js`.

URL hooks for captures: `?enter=1&year=&hour=&view=0|1|2&mode=orbit|fly&preset=shade&shot=1&noui=1&quality=high`.

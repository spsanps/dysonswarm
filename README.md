# Dyson Swarm

Space interactives by San Kala: [dysonswarm.com](https://dysonswarm.com/).
The collection connects to [sankala.me](https://sankala.me) for essays and projects,
and [Paper Robots](https://www.youtube.com/@paperrobotsfilms) for films.

## Find your way around

| Folder / file | What belongs here |
| --- | --- |
| `index.html` | Collection homepage. No JavaScript or renderer loads here. |
| `home/` | Homepage styles, icon, and share image. |
| `another-sky/` | O’Neill-cylinder explorer: page, styles, renderer, preview images. Its front door, the painted window, is in `another-sky/window/`. |
| `swarm/` | Original pixel swarm: page, styles, simulation, preview image. |
| `triton/` | Four Hours Out, a clay-model computing campus on Triton: page, styles, renderer (`js/`), fonts, preview images. |
| `og-image.png` | Original swarm share image; existing public URL preserved. |
| `worlds/` | Alias that takes visitors to the collection homepage. |
| `_archive/another-sky/` | Exact original HTML supplied for the September 2026 launch. |
| `_design/social-cards/` | Browser-rendered sources for share cards (collection, Triton). |
| `_design/reviews/` | Release notes and verification records. |
| `_social/another-sky/` | Reveal-clip exports, clean capture, editable titles/camera source, and post drafts. |
| `CNAME`, `robots.txt`, `sitemap.xml` | Domain and search discovery. |

Folders beginning with `_` are source/reference material excluded from the
published site by GitHub Pages’ Jekyll build. The original standalone explorer
is preserved byte for byte; the published version separates markup, styles, and
JavaScript. Its world geometry and renderer are retained.

## Another Sky’s front door

`/another-sky/` opens on a window in a house on the hill inside the cylinder,
painted in watercolour in the browser (2D canvas, no WebGL) from the explorer’s
own geometry. The light follows the visitor’s clock; clouds, trains, a passing
shower and the lamps move with it. At night the caption quotes San’s poem
[Nobody Owes Anything Now](https://www.sankala.me/notes/nobody-owes-anything-now).

- `window/front.js` runs the page. It draws the pencil and lays the washes, then
  tells `explorer.js` to start building the world (`window.SkyFront.bootWhen`).
  While the sheet is washed stage by stage, the explorer reports its progress
  under the window (“Building the world outside… 64%”). It builds geometry and
  uploads it, draws one frame to warm its shaders, and runs no render loop.
- “Step outside” (or the aerial tour) calls `window.AnotherSky.stepOutside()`:
  the render loop starts and the page zooms through the window so the painted end
  wall lands on the real one. If the window shows night, the explorer starts at
  nightfall. The help panel has a “Back to the window” button, which stops the
  render loop again.
- Without WebGL2 the window still paints, and the status line says plainly that
  the 3D world can’t open in this browser. With reduced motion the finished
  painting appears at once and nothing moves.
- `window/world.js` copies the explorer’s world constants and land functions;
  keep them in step if the explorer’s geometry changes. The other files are the
  camera and ray buffer (`view.js`), the shapes (`features.js`, `shapes.js`), the
  paper, washes and light (`paper.js`, `paint.js`, `light.js`), the underdrawing
  (`pencil.js`) and the moving things (`live.js`).
- Review aids: `?hour=<0-24>` sets the clock (it then runs on); `?t=<seconds>`
  freezes a moment and sets `window.__ready`; `?nopencil` and `?layer=<name>`
  show the washes alone or one wash in grey.

The approved sample it grew from is `_design/prototypes/2026-10-reinvention/habitat-window/`.
Review images and notes are in `_design/reviews/2026-10-another-sky-window/`.

## Work locally

No install or build step is needed:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/`. Use HTTP rather than opening the homepage as a
file, because navigation and collection assets use paths relative to the domain.
The explorer needs WebGL2; a desktop browser with hardware acceleration gives the
best experience. Its touch controls also work on mobile browsers with WebGL2.

Preview images come from the actual simulations. Capture the canvas alone for
`world-preview.jpg`. Another Sky’s social preview is its front door captured at
1200 × 630 (`/another-sky/?t=0&hour=16.2`, status line hidden); the painting is
drawn from the explorer’s own geometry. The homepage share card is `_design/social-cards/collection.html` at
1200 × 630. Export JPEGs, keeping them below 1 MB. Avoid generated illustrations
that show a different world from the one visitors can explore.

## Publish

GitHub Pages deploys the **root of `main`** in `spsanps/dysonswarm` to
`dysonswarm.com`. Changes pushed to `main` publish automatically. Check the Pages
build and live routes after pushing. Keep `CNAME` intact.

The September 2026 launch introduces `/another-sky/` and moves the existing
swarm experience to `/swarm/`; `/` is now the collection. The original root URL
still leads directly to a visible link to the swarm.

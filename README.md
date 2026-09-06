# Dyson Swarm

Space interactives by San Kala: [dysonswarm.com](https://dysonswarm.com/).
The collection connects to [sankala.me](https://sankala.me) for essays and projects,
and [Paper Robots](https://www.youtube.com/@paperrobotsfilms) for films.

## Find your way around

| Folder / file | What belongs here |
| --- | --- |
| `index.html` | Collection homepage. No JavaScript or renderer loads here. |
| `home/` | Homepage styles, icon, and share image. |
| `another-sky/` | O’Neill-cylinder explorer: page, styles, renderer, preview images. |
| `swarm/` | Original pixel swarm: page, styles, simulation, preview image. |
| `og-image.png` | Original swarm share image; existing public URL preserved. |
| `worlds/` | Alias that takes visitors to the collection homepage. |
| `_archive/another-sky/` | Exact original HTML supplied for the September 2026 launch. |
| `_design/social-cards/` | Browser-rendered source for the collection’s share card. |
| `_design/reviews/` | Release notes and verification records. |
| `_social/another-sky/` | Reveal-clip exports, clean capture, editable titles/camera source, and post drafts. |
| `CNAME`, `robots.txt`, `sitemap.xml` | Domain and search discovery. |

Folders beginning with `_` are source/reference material excluded from the
published site by GitHub Pages’ Jekyll build. The original standalone explorer
is preserved byte for byte; the published version separates markup, styles, and
JavaScript. Its world geometry and renderer are retained.

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
`world-preview.jpg`, and capture the explorer page at 1200 × 630 for its social
preview. The homepage share card is `_design/social-cards/collection.html` at
1200 × 630. Export JPEGs, keeping them below 1 MB. Avoid generated illustrations
that show a different world from the one visitors can explore.

## Publish

GitHub Pages deploys the **root of `main`** in `spsanps/dysonswarm` to
`dysonswarm.com`. Changes pushed to `main` publish automatically. Check the Pages
build and live routes after pushing. Keep `CNAME` intact.

The September 2026 launch introduces `/another-sky/` and moves the existing
swarm experience to `/swarm/`; `/` is now the collection. The original root URL
still leads directly to a visible link to the swarm.

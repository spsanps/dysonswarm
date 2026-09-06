# September 6, 2026 launch

San authorized publishing his Another Sky explorer, and then asked for creative
ownership of Dyson Swarm’s landing page, appearance, usability, and efficiency.
The initial idea of keeping the swarm at the root was superseded by the collection
homepage. The original simulation now has its own `/swarm/` route.

## What changed

- Static collection homepage with actual views from both interactives, a personal
  note explaining the O’Neill-cylinder interest, and links to San and Paper Robots.
- Another Sky at `/another-sky/`: preserve the world/renderer, separate source by
  purpose, add social metadata and a favicon, author links, no-JavaScript fallback,
  keyboard focus fixes, and keyboard activation for the tour’s stop button.
- Original swarm: readable controls, labelled slider with live percentage,
  pause/play, reduced-motion default, mobile layout, and navigation to Another Sky.
  Pausing skips unchanged canvas redraws; the slider can still update a paused view.
- Social previews from the real renderings; homepage share-card source in
  `../../social-cards/collection.html`. No image-generation artwork added.
- Original explorer retained byte for byte. SHA-256:
  `223d8efba6edb947facabb3de315d8f4ab55ad05e7d8c5b3a1cb3b371b93684d`.

## Verification before publication

See `browser-checks.json` and the adjacent desktop/mobile screenshots. Tested
with Playwright Chromium, including software WebGL2 rendering and touch emulation:

- Homepage/swarm at 1440, 390 and 320 pixels; links, images, no horizontal overflow.
- Swarm pause freezes canvas content; slider redraws it; play resumes animation;
  reduced-motion begins paused.
- Explorer world generation with no renderer/script errors; all six atlas places;
  flight/landing, tour start/stop, quality selection, actual PNG photo download.
- Keyboard Tab navigation and focus restoration when closing dialogs.
- Mobile entry, displayed joystick, flight and help controls.
- No-JavaScript fallback, deliberately unavailable WebGL2, all canonical URLs and
  social-preview asset responses.
- Both extracted JavaScript files pass `node --check`.

Touch emulation is not a real-device performance test. The explorer’s existing
high-detail world remains demanding; the homepage itself has no JavaScript,
external fonts, or rendering engine. Production URLs and the Pages build are
checked separately after pushing.

# Another Sky: the window as the front door (October 2026)

San approved making the "window in the habitat" watercolour the front door of
Another Sky. `/another-sky/` now opens on that window. The old intro over the live
world ("A world above you.", Enter the cylinder, Aerial tour) and the boot screen
("Growing another world.") are folded into it.

## How it works

1. The page paints the view from a house on the hill inside the cylinder: pencil
   first, then washes, from the explorer's own geometry (`another-sky/window/`).
2. Once the heavy part of the painting is computed (about 1 s on a desktop), the
   explorer starts building the world behind it. Its progress shows as one quiet
   line under the buttons ("Building the world outside… 64%"). It builds and
   uploads geometry, draws one frame to warm its shaders, and runs no render loop.
3. "Step outside" starts the render loop and zooms through the window. The zoom
   is worked out so the painted end wall lands on the real one, then the painting
   dissolves into the 3D view. If the window shows night, the explorer starts at
   nightfall. The aerial tour works the same way.
4. The help panel has "Back to the window", which stops the render loop again.

The window is 2D canvas and doesn't need WebGL. Without WebGL2 the window still
paints, and the status line says that the 3D world can't open in this browser.
With reduced motion the finished painting appears at once and nothing moves.

Captions: "3:06 pm where you are. Afternoon. Rain on the far side." By day the
caption also mentions a train when one is in view. At night it quotes the poem:
"At night there are no stars above me, / only the lamps of the far shore, / and
someone under them / looking up at mine." with a link to Nobody Owes Anything Now.
The poem stays linked in the intro copy and the help panel too.

## Changes from the sample

- **Light spine.** The vertical window bar used to sit right on top of the spine.
  It now goes on whichever side leaves the end wall and the spine in one clear
  pane. Here that's 30% across, so the window has a narrow side light and a wide
  casement. The spine is a wider strip of bare paper with a warmer glow.
- **Easier to read.** Haze and the cool air wash are lighter, and lakes are
  deeper, so the lakes overhead read against the land. The end wall is a paler
  disc with a darker band inside its rim and a pooled edge. Far fields no longer
  get a tone each, which made a pixel mosaic. There are fewer blooms and fewer
  white specks of distant cloud.
- **Less pencil.** The construction rays, ghost circle, rubbed-out circle, most of
  the end wall's rings, seams and spokes, the ring ties and hoops, and the
  luminaire rulings are gone. Far shorelines are lighter. What's left is the eye
  line and vanishing point, the rim and hub, the near rings, shores, the brow,
  the bridge, buildings, trees and the window.
- **Night.** The far towns are now lamps strung along their streets on the
  explorer's 160 m grid, joined by faint lines of light, at least a couple of
  pixels apart. Far away, only every fourth street is lit. They read as street
  grids converging with the land, not star clusters. Lakes stay darker than the
  land, and towns warm the air over them.
- **Trains and shower.** Trains are drawn twice their length (umber with a lit
  roof and a short wake), and the caption mentions them. The shower is placed
  where its rain runs sideways across the sheet, with a darker cell and clearer
  streaks.
- **Paint-in.** The stages are a little quicker, and the world builds alongside.

## Timings

These are from headless Chromium on this machine (desktop CPU, an RTX 4090 used
through WSL's D3D12 layer), at 1440 × 900, over three runs:

| | Front door | Old page |
| --- | --- | --- |
| Pencil visible | 0.5–0.6 s | — |
| First wash | 1.05–1.2 s | — |
| World ready, "Step outside" goes straight in | 3.1–3.35 s | 2.05–2.1 s (behind the boot screen) |
| Painting finished | 3.55–3.7 s | — |

Clicking "Step outside" before the world is ready queues it ("Opening the door…")
and goes in as soon as the world is ready. With software GL (SwiftShader) the
world takes 5–6 s, mostly because shader compiling stalls. That isn't
representative of real GPUs.

## Images

- `window-day-desktop-1440.jpg`, `window-night-desktop-1440.jpg`: the front door at 3 pm and 9:30 pm
- `window-day-phone-390.jpg`, `window-night-phone-390.jpg`: phone, 2× density
- `paint-in-desktop-1440.jpg`: the first 4.5 s (pencil, air, land and lake, towns, trees, finished)
- `step-outside-desktop-1440.jpg`: the hand-over at 0.2, 0.45, 0.7 and 0.95 s (the CSS transition was paused for each frame)
- `step-outside-night-and-phone.jpg`: the same at night, and on a phone
- `outside-day-desktop-1440.jpg`, `outside-night-desktop-1440.jpg`, `outside-phone-390.jpg`: the explorer after stepping outside
- `no-webgl-phone-390.jpg`: a browser without WebGL
- `before-after-sample.jpg`: the approved sample and the front door at 3 pm and 9:30 pm

These were checked at 1920, 1440, 1280, 768, 390 and 360 px wide, by day and by
night. There was no horizontal scroll and no console errors. The caption and
"Step outside" fit on the first screen at every size.

## Weaknesses

- Not yet tried on a real phone, or in Safari or Firefox. On a phone the painting
  will probably take 2–3 s, and the world builds after that.
- "Step outside" becomes ready about 1 s later than "Enter the cylinder" did,
  because the painting's heavy step goes first. In exchange, there's a picture
  from half a second.
- Only the end wall lines up in the zoom. The window is 400 m down the trail and
  looks higher, with a wider lens, so the rest of the painting crossfades over a
  different view for about a third of a second.
- The night street grids are regular. Up close they can look a little like nets.
- Trains are still small, even at twice their length. The shower lands on the
  narrow left pane at desktop sizes.
- The weather is still a fixed 100-minute cycle, and the light follows the
  visitor's clock, not San's.
- "Back to the window" is only in the help panel.

## Questions for San

1. The lede is mine: "This is the view from a window in a house on the hill. The
   light outside follows your clock." Is it close to how you'd say it?
2. At night the caption quotes all four lines. Keep all four, or only the last two?
3. If the window shows night, stepping outside starts the explorer at nightfall.
   Do you want that, or always daylight?
4. The explorer's nightfall message says "The cities become constellations."
   There are no stars in the cylinder. Keep it, or change it?
5. Is the narrow side light, which keeps the spine clear, all right?

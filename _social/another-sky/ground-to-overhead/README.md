# Another Sky: ground-to-overhead reveal

An 18-second landscape clip for sharing the explorer on X. One continuous,
slow camera move begins on a street at Meridian Waterfront and tilts upward to
reveal the inhabited surface of the cylinder. The last few seconds hold the view
and show the link. Silent by design; no narration or music is needed to follow it.

## Upload this

`exports/another-sky-ground-to-overhead-v1-1080p.mp4`

- 1920 × 1080, 16:9, 30 frames per second, H.264 MP4; 11,307,079 bytes.
- Small title, “Look up.” cue, then `dysonswarm.com/another-sky`.
- Captured from the actual interactive world. No image-generation or AI-video
  footage, screen UI, pointer, loading screen, or fake gameplay.
- `post-draft.txt` is optional copy to accompany the upload. No post has been sent.

Open `previews/watch.html` for a local player and download links.

Verification: all 540 frames decode successfully, exact 18-second duration,
BT.709 color metadata and fast-start MP4. Opening/reveal/ending frames and the
contact sheet were visually inspected. See `previews/verification.json`.

## Edit or regenerate

| Folder / file | Purpose |
| --- | --- |
| `exports/` | Finished upload file. |
| `previews/` | Poster, contact sheet and verification record. |
| `source/another-sky-ground-to-overhead-v1-clean.mp4` | Clean capture for editing without titles. |
| `source/camera-path.json` | Camera position, angles, field of view, timing and frame rate. |
| `source/titles.ass` | Editable text, fonts, positions and fades. |
| `source/render-clip.mjs` | Deterministic browser capture and FFmpeg encoding. |
| `source/render-manifest.json` | Renderer revision, checksum, GPU and capture record. |
| `source/verify-clip.py` | Full decode/format checks and review-image extraction. |

From `source/`:

```sh
npm ci
npx playwright install chromium
npm run render
```

FFmpeg with libx264 and libass must be installed. On this WSL machine the capture
uses ANGLE/OpenGL backed by the RTX 4090. For a software-only machine:

```sh
CAPTURE_SOFTWARE=1 npm run render
```

To change the title text/timing without capturing the world again:

```sh
npm run render -- --compose-only
```

The capture controls are injected into a local browser response. The published
explorer source and website behavior are not modified. Each video frame advances
the world to its exact timestamp, so capture speed does not affect playback speed.
The source world revision is recorded in the render manifest.

This project lives under `_social/` so GitHub Pages excludes the production files
from the website. Keep future versions alongside v1 rather than overwriting a
version that has already been shared.

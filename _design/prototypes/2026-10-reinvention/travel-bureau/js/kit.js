/* The bureau's house layout: every poster shares one board, one window and one lettering
   band, so the grid stays strict while the subjects change. Units: 1000 x 1500 per poster. */
(function (G) {
'use strict';
const { clamp, lerp, hex, css, TAU } = G.Paint;

const ART = { x0: 52, y0: 52, x1: 948, y1: 1150 };           // the frisket-cut picture window
ART.w = ART.x1 - ART.x0; ART.h = ART.y1 - ART.y0;
ART.cx = (ART.x0 + ART.x1) / 2; ART.cy = (ART.y0 + ART.y1) / 2;

const INK = {
  board: '#f2e8d5', plum: '#3b2333', umber: '#3a2a20', brick: '#b8492c', tangerine: '#e9823b',
  gold: '#f0bd57', cream: '#f8efd9', ivory: '#fff8e6', rose: '#e6a490', teal: '#3f7d78',
  green: '#5d8a55', sage: '#93a98a', dusk: '#6b4a63'
};

const FONT_TITLE = 'Caprasimo', FONT_CAPS = 'Krona One';

// window frisket: a hard, knife-cut rectangle with slightly eased corners
function windowMask(b, r = 10) {
  return b.raster((c) => { c.beginPath(); c.roundRect(ART.x0, ART.y0, ART.w, ART.h, r); c.fill(); });
}

// letter a word as a frisket and spray it: soft shadow, a gradient fill, a brushed highlight
function title(b, text, o) {
  const size0 = o.size || 132, x = o.x ?? ART.x0 + 2, base = o.y ?? 1296, maxW = o.maxW ?? ART.w - 4;
  b.cx.font = `${size0}px "${FONT_TITLE}"`;
  b.cx.setTransform(1, 0, 0, 1, 0, 0);
  const meas = b.cx.measureText(text).width;            // measured in units (no transform)
  const size = Math.min(size0, size0 * maxW / meas);
  const draw = (dx = 0, dy = 0) => (c) => {
    c.font = `${size}px "${FONT_TITLE}"`; c.textBaseline = 'alphabetic';
    if (c.letterSpacing !== undefined) c.letterSpacing = `${o.track ?? -1}px`;
    c.fillText(text, x + dx, base + dy);
  };
  const F = b.raster(draw());
  const top = base - size * 0.78, bot = base + size * 0.04;
  // soft sprayed shadow, offset down and right
  const S = b.blur(b.raster(draw(5, 7)), 3.6);
  b.spray(o.shadow || INK.plum, S, { op: 0.32, grain: 0.3 });
  // gradient fill: top colour sprayed first, the second colour builds from the bottom
  b.spray(o.top, F, { op: 1, grain: 0.05 });
  b.spray(o.bottom, b.mulF(F, (u, v) => clamp((v - top) / (bot - top)) ** 1.25), { grain: 0.22 });
  if (o.band) b.spray(o.band, b.mulF(F, (u, v) => Math.exp(-(((v - lerp(top, bot, 0.4)) / (size * 0.1)) ** 2)) * 0.85), { grain: 0.25 });
  b.spray(o.bottom, b.ridge(F, 0.8), { op: 0.3, grain: 0.1 });
  // gouache catch-light along the upper-left edges of each letter
  const H = b.sub(F, b.shift(F, 1.6, 2.2));
  b.gouache(o.light || INK.ivory, b.mul(H, b.field((u, v) => clamp(1 - (v - top) / (bot - top) * 0.9))), { op: 0.75, dry: 0.35 });
  return { size, top, base };
}

function caps(b, text, x, y, size, col, o = {}) {
  let track = o.track ?? size * 0.18;
  if (o.maxW) { // shrink to fit: first the tracking, then the size
    b.cx.setTransform(1, 0, 0, 1, 0, 0); b.cx.font = `${size}px "${FONT_CAPS}"`;
    if (b.cx.letterSpacing !== undefined) b.cx.letterSpacing = '0px';
    const w0 = b.cx.measureText(text).width, n = text.length - 1;
    if (w0 + track * n > o.maxW) {
      track = Math.max(size * 0.06, (o.maxW - w0) / n);
      if (w0 + track * n > o.maxW) { const f = o.maxW / (w0 + track * n); size *= f; track *= f; }
    }
  }
  const M = b.raster((c) => {
    c.font = `${size}px "${FONT_CAPS}"`; c.textBaseline = 'alphabetic';
    if (c.letterSpacing !== undefined) c.letterSpacing = `${track}px`;
    c.textAlign = o.align || 'left';
    c.fillText(text, x, y);
  });
  b.gouache(col, M, { op: o.op ?? 0.92, dry: o.dry ?? 0.12 });
  return M;
}

// the band beneath the window: title, one plain line, bureau number and service status
function band(b, o) {
  const t = title(b, o.title, o.titleStyle);
  caps(b, o.line, ART.x0 + 4, 1364, 21, o.lineCol || INK.umber, { track: 3.2, maxW: ART.w - 8 });
  // a thin brushed rule
  const rule = b.strokeMask([[[ART.x0 + 2, 1398, 2.4], [ART.x1 - 2, 1398, 2.1]]]);
  b.gouache(o.ruleCol || INK.umber, rule, { op: 0.55, dry: 0.4 });
  caps(b, `NO. ${o.no}`, ART.x0 + 4, 1440, 19, o.lineCol || INK.umber, { track: 2.2, op: 0.85, dry: 0 });
  // service lamp: a sprayed disc, lit for open destinations, empty for later ones
  const lx = ART.x1 - 14, ly = 1434;
  caps(b, o.open ? 'OPEN NOW' : 'NOT YET OPEN', lx - 24, 1440, 19, o.lineCol || INK.umber, { track: 2.2, align: 'right', op: 0.9, dry: 0 });
  const disc = b.field((u, v) => clamp(10.5 - Math.hypot(u - lx, v - ly + 5)), [lx - 16, ly - 22, lx + 16, ly + 12]);
  if (o.open) {
    b.spray(o.lampCol || INK.tangerine, disc, { grain: 0.3 });
    b.spray(INK.gold, b.field((u, v) => Math.exp(-((u - lx + 2.5) ** 2 + (v - ly + 7.5) ** 2) / 14), [lx - 14, ly - 20, lx + 14, ly + 10]), { grain: 0.2 });
  } else {
    const ring = b.field((u, v) => clamp(1.9 - Math.abs(Math.hypot(u - lx, v - ly + 5) - 8.5)), [lx - 16, ly - 22, lx + 16, ly + 12]);
    b.gouache(o.lineCol || INK.umber, ring, { op: 0.7 });
  }
  return t;
}

// project helpers shared by the scenes
function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

// a wrapped draw context for living details: units -> device pixels
function unitCtx(ctx, k) { ctx.setTransform(k, 0, 0, k, 0, 0); return ctx; }

G.Kit = { ART, INK, windowMask, title, caps, band, rot, unitCtx, FONT_TITLE, FONT_CAPS };
})(window);

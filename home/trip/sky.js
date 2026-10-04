// Behind the plates: the night (two star fields at parallax depth), the planets' orbits drawn
// with depth (heavier on the near side), the swarm's far side and the asteroid belt. Redrawn on
// one canvas whenever the camera moves; cheap enough for every frame.
import { TAU, mulberry32 } from './math.js';
import { INK } from './world.js';
import { makeCanvas } from './tone.js';
import { ellipse, strokeDepth } from './ink.js';

const { NAVY, CREAM, YELLOW } = INK;
export const DEPTHS = [.12, .3];   // how far each star field moves for each unit the camera moves

// A star tile, `size` units square, printed at k device px per unit; seamless.
function starTile(size, k, seed, density, big) {
  const S = Math.max(64, Math.round(size * k)), c = makeCanvas(S, S), g = c.getContext('2d');
  const r = mulberry32(seed), n = Math.round(size * size * density);
  g.scale(S / size, S / size);
  const put = (x, y, rr, a, col) => {
    g.globalAlpha = a; g.fillStyle = col;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      const px = x + dx, py = y + dy; if (px < -4 || py < -4 || px > size + 4 || py > size + 4) continue;
      g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
    }
  };
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size, m = Math.pow(r(), big ? 2.2 : 3.2);
    put(x, y, Math.max(.32 / k, (big ? .55 : .35) + m * (big ? 1.25 : .6)), big ? .55 + .45 * m : .32 + .5 * m, m > .85 ? '#fff4d8' : CREAM);
    if (big && m > .82) {   // a few with a four-point glint
      const L = 3.2 + m * 5, w = Math.max(.35, .5 / k);
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        const px = x + dx, py = y + dy; if (px < -12 || py < -12 || px > size + 12 || py > size + 12) continue;
        g.globalAlpha = .75; g.fillStyle = CREAM; g.beginPath();
        g.moveTo(px - L, py); g.lineTo(px, py - w); g.lineTo(px + L, py); g.lineTo(px, py + w); g.closePath();
        g.moveTo(px, py - L); g.lineTo(px + w, py); g.lineTo(px, py + L); g.lineTo(px - w, py); g.closePath(); g.fill();
      }
    }
  }
  g.globalAlpha = 1;
  return { c, size, S };
}

export function makeSky(w, k) {
  return { k, tiles: [starTile(733, k, 7, 1 / 2300, false), starTile(1171, k, 19, 1 / 7600, true)], belt: beltDots(w).concat(beltDots(w, w.KUIPER, 700, 505, 1.2)) };
}

// a band of rocks across the strip: the asteroid belt, and the Kuiper belt past Neptune
function beltDots(w, range = w.BELT, n = 1400, seed = 404, big = 1.6) {
  const r = mulberry32(seed), out = [], [b0, b1] = range, land = w.mode === 'landscape';
  for (let i = 0; i < n; i++) {
    const u = b0 + (b1 - b0) * (r() + r() + r()) / 3, v = -40 + r() * ((land ? w.FH : w.FW) + 80);
    out.push(land ? [u, v, .4 + Math.pow(r(), 3) * big] : [v, u, .4 + Math.pow(r(), 3) * big]);
  }
  return out;
}

// ctx: the sky canvas (device pixels, transform reset). cam: view top-left in world units;
// view: [x0, y0, x1, y1]; k: device px per unit.
export function drawSky(ctx, w, sky, cam, view, k) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  sky.tiles.forEach((t, i) => {
    const f = DEPTHS[i], pat = ctx.createPattern(t.c, 'repeat');
    const s = t.S / t.size;   // tile px per unit (≈ k)
    const ox = Math.round(-cam[0] * f * k) % t.S, oy = Math.round(-cam[1] * f * k) % t.S;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(k / s, k / s);
    ctx.fillStyle = pat; ctx.fillRect(-ox * s / k, -oy * s / k, W * s / k, H * s / k);
    ctx.restore();
  });
  ctx.setTransform(k, 0, 0, k, -cam[0] * k, -cam[1] * k);
  // stars fade out near the Sun, where the corona is printed
  const { SUN, SR } = w;
  if (view[0] < SUN[0] + SR * 3 && view[2] > SUN[0] - SR * 3) {
    const g = ctx.createRadialGradient(SUN[0], SUN[1], SR * .9, SUN[0], SUN[1], SR * 2.4);
    g.addColorStop(0, NAVY); g.addColorStop(1, 'rgba(21,27,50,0)');
    ctx.fillStyle = g; ctx.fillRect(SUN[0] - SR * 2.5, SUN[1] - SR * 2.5, SR * 5, SR * 5);
  }
  // the planets' orbits: hairlines, heavier on the near side
  for (const o of w.orbits) {
    if (o.name === 'mercury') continue;   // among the swarm's own orbits it would only add noise
    const el = o.el || (o.el = ellipse(SUN, o.r, o.r * w.q, 0));
    strokeDepth(ctx, el, { color: CREAM, w: [1.15, .55].map(v => Math.max(v, .75 / k)), a: [.36, .14], n: Math.min(2400, Math.round(o.r / 4)) }, view);
  }
  // the asteroid belt
  {
    ctx.fillStyle = CREAM; ctx.globalAlpha = .55; ctx.beginPath();
    for (const [x, y, r] of sky.belt) { if (x < view[0] - 4 || x > view[2] + 4 || y < view[1] - 4 || y > view[3] + 4) continue; const rr = Math.max(r, .5 / k); ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
    ctx.fill(); ctx.globalAlpha = 1;
  }
  void YELLOW;
}

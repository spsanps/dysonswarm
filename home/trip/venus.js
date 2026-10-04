// Stop 2, Venus under its shade. A sunshade twice as wide as the planet stands between Venus and
// the Sun, mostly mirror, held in a red truss (the Venus poster's red, gold and black). Sunlight
// arrives as fine gold rays and stops at the shade; Venus sits in the dark behind it, its clouds
// cooling, lit only at the rim where light slips past.
import { TAU, PI, clamp, smooth, mulberry32, fbm, vnoise } from './math.js';
import { INK } from './world.js';
import { spark } from './ink.js';

const { NAVY, CREAM, YELLOW, RED, GOLD, BLACK, SLATE } = INK;

export function venusGeo(w) {
  const V = w.VENUS, R = w.VR, l = w.light(V), n = [-l[1], l[0]];
  const S = [V[0] + l[0] * R * 2.05, V[1] + l[1] * R * 2.05], RS = R * 2, th = .26;   // shade centre, radius, how open we see it
  // a point on the shade disc at polar (r, a) in its own plane → screen
  const onShade = (r, a) => [S[0] + n[0] * Math.cos(a) * r + l[0] * Math.sin(a) * r * th, S[1] + n[1] * Math.cos(a) * r + l[1] * Math.sin(a) * r * th];
  return { V, R, l, n, S, RS, th, onShade };
}

export function drawVenus(I, w) {
  const g = venusGeo(w), { ctx } = I, { V, R, l, n, S, RS, onShade } = g;
  const pl = w.plates.find(p => p.id === 'venus').box;

  // ── sunlight: a gold halftone field streaming from the Sun's side, with the shade's shadow cut
  //    clean out of it, so Venus sits in a band of night ──
  {
    const [x0, y0, x1, y1] = pl, span = Math.max(x1 - x0, y1 - y0);
    const along = (x, y) => (x - S[0]) * l[0] + (y - S[1]) * l[1];      // + toward the Sun
    const side = (x, y) => (x - S[0]) * n[0] + (y - S[1]) * n[1];
    const edgeFade = (x, y) => smooth(0, R * .7, Math.min(x - x0, x1 - x, y - y0, y1 - y));
    // glare: fine gold dots crowding the sunlit face and rim, falling away fast
    I.halftone(pl, (x, y) => {
      const a = along(x, y), d = side(x, y), ad = Math.abs(d);
      const hit = Math.sqrt(Math.max(0, 1 - (Math.min(ad, RS) / RS) ** 2)) * RS * g.th;
      if (ad < RS && a < hit) return 0;
      const dist = ad < RS ? a - hit : Math.hypot(ad - RS, Math.max(0, a) * .6);
      const t = Math.exp(-dist / (R * .3)) * (a > 0 ? 1 : smooth(-R * .9, 0, a)) * (.7 + .3 * fbm(d * .06, a * .02, 12, 2));
      return .62 * t * edgeFade(x, y);
    }, { cell: 3.4, angle: .26, color: GOLD, max: .85 });
    // a few long rays of sunlight: some end on the mirror, the rest run on past Venus
    ctx.save(); ctx.lineCap = 'round';
    const rays = [-1.32, -1.18, -1.07, -.84, -.55, -.2, .12, .43, .71, .93, 1.1, 1.24];
    rays.forEach((f, i) => {
      const d = f * RS, ad = Math.abs(d), blocked = ad < RS;
      const hit = blocked ? Math.sqrt(1 - (d / RS) ** 2) * RS * g.th : 0;
      const a0 = R * (.95 + .6 * vnoise(i * 1.7, 2, 3)), a1 = blocked ? hit : -R * (2 + 1.2 * vnoise(i, 5, 3));
      const p0 = [S[0] + n[0] * d + l[0] * a0, S[1] + n[1] * d + l[1] * a0], p1 = [S[0] + n[0] * d + l[0] * a1, S[1] + n[1] * d + l[1] * a1];
      const gr = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]), al = .35 + .3 * vnoise(i * 3.1, 1, 9);
      gr.addColorStop(0, 'rgba(246,196,68,0)'); gr.addColorStop(blocked ? .6 : .35, `rgba(246,196,68,${al})`); gr.addColorStop(1, blocked ? `rgba(246,196,68,${al})` : 'rgba(246,196,68,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = I.lw(R * (.006 + .006 * vnoise(i, 7, 1)));
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    });
    ctx.restore();
    void span;
  }

  // ── Venus, in the dark ──
  const body = c => c.arc(V[0], V[1], R, 0, TAU);
  I.disc(V, R, BLACK);
  I.within(body, () => {
    // cloud deck: a deep red screen in the planet's chevron bands, fading toward the far side
    const tilt = .35, ct = Math.cos(tilt), st = Math.sin(tilt);
    const box = [V[0] - R, V[1] - R, V[0] + R, V[1] + R];
    const cloud = (x, y) => {
      const X = (x - V[0]) / R, Y = (y - V[1]) / R, rr = X * X + Y * Y; if (rr >= 1) return 0;
      const z = Math.sqrt(1 - rr), u = X * ct + Y * st, v = -X * st + Y * ct;
      const lat = Math.asin(clamp(v, -1, 1)), lon = Math.atan2(u, z);
      const chevron = lon * 1.6 - Math.abs(lat) * 2.4;
      return fbm(chevron * 1.4 + 4, lat * 5.5, 7, 4);
    };
    const sun = (x, y) => ((x - V[0]) * l[0] + (y - V[1]) * l[1]) / R;   // +1 toward the shade
    I.halftone(box, (x, y) => {
      const c = cloud(x, y), r = Math.hypot(x - V[0], y - V[1]) / R;
      return (smooth(.3, .75, c) * .32 + .05) * (1 - .4 * smooth(.8, 1, r));
    }, { cell: 2.6, angle: .45, color: RED, max: .6 });
    I.halftone(box, (x, y) => {
      const c = cloud(x, y), s = sun(x, y), r = Math.hypot(x - V[0], y - V[1]) / R;
      // dim cloud tops everywhere; brighter where light slips round the shade onto the limb
      return smooth(.42, .8, c) * (.2 + .6 * smooth(.2, .98, s) * smooth(.55, 1, r)) * (1 - .3 * smooth(.9, 1, r) * (1 - s));
    }, { cell: 2.3, angle: 1.1, color: GOLD, max: .85 });
  });
  // the rim where light slips past: a fine gold crescent, widest on the shade's side
  ctx.save();
  ctx.beginPath(); body(ctx); ctx.clip();
  const sa = Math.atan2(l[1], l[0]);
  for (const [w0, al, col] of [[R * .05, .32, GOLD], [R * .022, .7, GOLD], [R * .008, .95, YELLOW]]) {
    ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = I.lw(w0);
    ctx.beginPath(); ctx.arc(V[0], V[1], R - w0 / 2, sa - 1.25, sa + 1.25); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
  I.ring(V, R, GOLD, .7, .45);

  // ── the shade ──
  const ring = (r, steps = 96) => { const p = []; for (let i = 0; i <= steps; i++) p.push(onShade(r, i / steps * TAU)); return p; };
  const path = (pts, close = true) => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); };
  const sides = 24;   // a polygonal truss, like the poster's
  const poly = r => { const p = []; for (let i = 0; i <= sides; i++) p.push(onShade(r, i / sides * TAU + .07)); return p; };
  // the face toward Venus: black, ribbed by the radiators behind the mirror
  ctx.fillStyle = BLACK; ctx.beginPath(); path(poly(RS)); ctx.fill();
  I.within(c => path(poly(RS * .99)), () => {
    I.halftone([S[0] - RS, S[1] - RS, S[0] + RS, S[1] + RS], (x, y) => {
      const d = ((x - S[0]) * n[0] + (y - S[1]) * n[1]) / RS;
      return .14 + .2 * smooth(.2, 1, Math.abs(d)) * (d < 0 ? 1 : .6);
    }, { cell: 2.4, angle: .8, color: RED, max: .5 });
  });
  // the truss: two polygon chords with zig-zag bracing, spokes, a hub
  ctx.strokeStyle = RED; ctx.lineJoin = 'miter';
  const outer = poly(RS), inner = poly(RS * .935);
  ctx.lineWidth = I.lw(R * .022); ctx.beginPath(); path(outer); ctx.stroke();
  ctx.lineWidth = I.lw(R * .014); ctx.beginPath(); path(inner); ctx.stroke();
  ctx.lineWidth = I.lw(R * .009); ctx.beginPath();
  for (let i = 0; i < sides * 3; i++) {
    const a0 = i / (sides * 3) * TAU + .07, a1 = (i + .5) / (sides * 3) * TAU + .07;
    ctx.moveTo(...onShade(RS, a0)); ctx.lineTo(...onShade(RS * .935, a1)); ctx.lineTo(...onShade(RS, a1 + .5 / (sides * 3) * TAU));
  }
  ctx.stroke();
  ctx.lineWidth = I.lw(R * .008); ctx.globalAlpha = .85; ctx.beginPath();
  for (let i = 0; i < sides; i += 2) { const a = i / sides * TAU + .07; ctx.moveTo(...onShade(RS * .09, a)); ctx.lineTo(...onShade(RS * .935, a)); }
  for (const rr of [.35, .62]) path(poly(RS * rr));
  ctx.stroke(); ctx.globalAlpha = 1;
  // hub
  ctx.fillStyle = RED; ctx.beginPath(); path(ring(RS * .09, 32)); ctx.fill();
  ctx.fillStyle = GOLD; ctx.beginPath(); path(ring(RS * .045, 24)); ctx.fill();
  // the sunlit rim: the edge of the disc that faces the Sun catches the light
  ctx.save(); ctx.lineCap = 'round';
  const rimPts = [];
  for (let i = 0; i <= 80; i++) { const a = PI / 2 + (i / 80 - .5) * PI * 1.1; rimPts.push(onShade(RS * 1.004, a)); }
  ctx.strokeStyle = YELLOW; ctx.lineWidth = I.lw(R * .012); ctx.globalAlpha = .9; ctx.beginPath(); path(rimPts, false); ctx.stroke();
  ctx.restore(); ctx.globalAlpha = 1;
  // station-keeping thrusters on the rim
  ctx.fillStyle = CREAM;
  for (let i = 0; i < sides; i += 3) { const p = onShade(RS * 1.02, i / sides * TAU + .07); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(R * .011, .8 * I.px), 0, TAU); ctx.fill(); }
  void pl; void NAVY;
}

// what moves: glints running round the shade's rim, and a ferry between the shade and Venus
export function drawVenusLive(ctx, w, t, k) {
  const g = venusGeo(w), { RS, onShade, R } = g;
  for (let i = 0; i < 3; i++) {
    const a = (t * .045 + i / 3) * TAU, p = onShade(RS * 1.003, a);
    const face = .5 + .5 * Math.sin(a);   // brightest on the near edge
    spark(ctx, p[0], p[1], R * (.05 + .05 * face), .35 + .6 * face);
  }
  // light flickering on the mirror as the facets trim their angle
  for (let i = 0; i < 5; i++) {
    const ph = (t / (7 + i * 1.9) + i * .31) % 1, gl = Math.pow(Math.max(0, Math.sin(ph * PI)), 14);
    if (gl < .05) continue;
    const p = onShade(RS * (.35 + .12 * i), -1 + i * .55);
    spark(ctx, p[0], p[1], R * .08 * gl, gl * .9);
  }
  void k; void clamp;
}

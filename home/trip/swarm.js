// Stop 1, the Swarm: the Sun ringed by collectors on many tilted orbits, Mercury being quarried,
// its pieces climbing a stream from a mass driver to the orbits, where each becomes a collector.
// Geometry and timing come from the v2 hero (the swarm thickens while you watch); the drawing is
// new: crisp inks, real halftone, a granulated photosphere, prominences, terraced quarry walls.
import { TAU, PI, clamp, smooth, mulberry32, vnoise, fbm, worley, bez, at, norm, polar } from './math.js';
import { INK } from './world.js';
import { ellipse, strokeDepth, spark } from './ink.js';
import { toneMap } from './tone.js';

const { NAVY, CREAM, YELLOW, ORANGE } = INK;

// Orbits as multiples of the Sun's radius. Band 0 is the poster's own family (and the one the
// stream feeds); 1 and 2 are other planes of the swarm; 3 is a near orbit of big collectors.
const RINGS = [
  // (tilted so their far ends rise to the left, leaving the lower left clear for words)
  { rx: 1.34, q: .25, tilt: .17, n0: 34, nMax: 76, band: 0 },
  { rx: 1.68, q: .26, tilt: .17, n0: 42, nMax: 94, band: 0 },
  { rx: 2.04, q: .26, tilt: .17, n0: 52, nMax: 116, band: 0 },
  { rx: 2.44, q: .27, tilt: .17, n0: 60, nMax: 134, band: 0 },
  { rx: 1.9, q: .36, tilt: -.42, n0: 30, nMax: 30, band: 1 },
  { rx: 2.85, q: .3, tilt: -.22, n0: 40, nMax: 40, band: 1 },
  { rx: 1.78, q: .2, tilt: .8, n0: 22, nMax: 22, band: 2 },
  { rx: 3.4, q: .24, tilt: .13, n0: 9, nMax: 9, band: 3 },
];
const P0 = 70, FILL = 300;   // inner orbit's period (s); time for band 0 to fill (s)

const cache = new Map();
export function swarmScene(w) {
  if (cache.has(w.mode)) return cache.get(w.mode);
  const { SUN, SR, MERCURY: MER, MR } = w;
  const land = w.mode === 'landscape';
  const ins = land ? 2.5 : 2.8, dir = land ? -1 : 1, seed = 61;
  const rng = mulberry32(seed * 7919 + 3);
  const rings = RINGS.map((d, ri) => {
    const el = ellipse(SUN, d.rx * SR, d.rx * SR * d.q, d.tilt);
    const wv = (2 * PI) / (P0 * Math.pow(d.rx / RINGS[0].rx, 1.5)) * (d.band === 1 ? -dir : dir);
    const slots = [], late = [];
    for (let j = 0; j < d.nMax; j++) {
      const base = (j + (rng() - .5) * .7) / d.nMax * TAU + ri * .9;
      const first = Math.floor(j * d.n0 / d.nMax) !== Math.floor((j + 1) * d.n0 / d.nMax) || d.n0 === d.nMax;
      const slot = { base, born: first ? -Infinity : 0, spin: rng() * TAU, glint: rng() < .5 ? rng() * TAU : null, size: .85 + rng() * .3, kind: rng() };
      slots.push(slot); if (!first) late.push(slot);
    }
    for (let i = late.length - 1; i > 0; i--) { const q = (rng() * (i + 1)) | 0; [late[i], late[q]] = [late[q], late[i]]; }
    late.forEach((sl, i) => { sl.born = (i + rng() * .8) / late.length * FILL; });
    return { ...d, el, w: wv, slots };
  });

  // Mercury: the quarry faces the Sun; a mass driver runs along the rim beside it.
  const bd = norm([SUN[0] - MER[0], SUN[1] - MER[1]]), phi = Math.atan2(bd[1], bd[0]);
  const biteC = [MER[0] + bd[0] * MR * .97, MER[1] + bd[1] * MR * .97];
  const biteR = a => MR * (.5 + .2 * vnoise(Math.cos(a) * 2.2 + 3, Math.sin(a) * 2.2, 4));
  // terraced outline: the radius steps down in benches, so the cut reads as an open pit
  const step = MR * .034;
  const terrace = f => {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const a = i / 160 * TAU, r0 = biteR(a) * f, r = Math.round(r0 / step) * step;
      pts.push([biteC[0] + Math.cos(a) * r, biteC[1] + Math.sin(a) * r]);
    }
    return pts;
  };
  const bitePts = terrace(1);
  const railA = polar(MER, MR * .7, phi - 2.3), railB = polar(MER, MR * 1.0, phi - 1.12);
  const launch = norm([railB[0] - railA[0], railB[1] - railA[1]]);
  const muzzle = [railB[0] + launch[0] * MR * .1, railB[1] + launch[1] * MR * .1];
  const paths = rings.map(rg => {
    if (rg.band !== 0) return null;
    const end = rg.el.pt(ins), ta = rg.el.tan(ins) + (rg.w < 0 ? PI : 0);
    const d = Math.hypot(end[0] - muzzle[0], end[1] - muzzle[1]);
    const p = bez(muzzle, [muzzle[0] + launch[0] * d * .42, muzzle[1] + launch[1] * d * .42], [end[0] - Math.cos(ta) * d * .34, end[1] - Math.sin(ta) * d * .34], end, 240);
    return { pts: p, travel: 8 + d / 46 };
  });
  // the far swarm: a fine stipple of collectors too small to see one by one
  const hr = mulberry32(seed * 17 + 5), haze = [];
  for (const rg of rings) if (rg.band === 0) for (let i = 0; i < rg.el.rx * 3.4; i++) {
    const a = hr() * TAU, g = (hr() + hr() + hr() - 1.5) / 1.5, f = 1 + g * .05;
    const x = rg.el.rx * f * Math.cos(a), y = rg.el.ry * f * Math.sin(a) + g * 3, cr = Math.cos(rg.tilt), sr = Math.sin(rg.tilt);
    haze.push([SUN[0] + x * cr - y * sr, SUN[1] + x * sr + y * cr, Math.sin(a) > 0, .42 + hr() * .55]);
  }
  const sc = { w, SUN, SR, MER, MR, ins, dir, seed, rings, bd, phi, biteC, bitePts, terrace, railA, railB, launch, muzzle, paths, haze };
  cache.set(w.mode, sc);
  return sc;
}

// First time at or after `born` that a slot passes the stream's end of its orbit.
function arrival(rg, sl, ins) {
  if (sl.born === -Infinity) return -Infinity;
  const w = rg.w, off = ins - sl.base;
  const m = w > 0 ? Math.ceil((w * sl.born - off) / TAU) : Math.ceil((off - w * sl.born) / TAU);
  return (off + (w > 0 ? m : -m) * TAU) / w;
}

/* ───────────────────────── the Sun's plate ───────────────────────── */
export function drawSun(I, w) {
  const sc = swarmScene(w), { ctx } = I, { SUN, SR } = sc;
  const cx = SUN[0], cy = SUN[1];
  const cR = SR + 285, box = [cx - cR, cy - cR, cx + cR, cy + cR];
  const ang = (x, y) => Math.atan2(y - cy, x - cx);
  // angular noise for streamers, continuous around the circle
  const stream = a => fbm(Math.cos(a) * 2.6 + 9, Math.sin(a) * 2.6 + 4, 31, 3);

  // the swarm's shadow on the glow: soft bands where band 0's near side crosses it
  const shadow = toneMap(box, .5, g => {
    g.lineCap = 'round';
    for (const rg of sc.rings) if (rg.band === 0) {
      for (const [lw, al] of [[30, .16], [18, .2], [9, .26]]) { g.lineWidth = lw; g.globalAlpha = al; g.beginPath(); front(g, rg.el); g.stroke(); }
    }
  });

  // 1. the corona: a coarse orange screen that breaks into streamers, fading to nothing well inside
  //    the plate so no edge shows
  const edge = cR / SR;
  I.halftone(box, (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / SR; if (d < .96) return 0;
    const s = stream(ang(x, y)), reach = .5 + .62 * s * s;
    const t = Math.pow(clamp(1 - (d - 1) / reach), 2) * (.62 + .5 * s) * smooth(edge - .04, edge - .3, d);
    return t * (1 - .75 * shadow(x, y));
  }, { cell: 7.2, angle: .26, color: ORANGE, max: .95 });
  // 2. a fine yellow screen hugging the limb, so the light is hottest at the Sun
  I.halftone(box, (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / SR; if (d < .98) return 0;
    return Math.pow(clamp(1 - (d - 1) / .14), 1.6) * .62 * (1 - .6 * shadow(x, y));
  }, { cell: 3.6, angle: 1.05, color: YELLOW, max: .8 });

  // 3. prominences: loops of plasma standing on the limb (drawn before the disc covers their feet)
  const prom = [
    { a: -2.36, span: .26, h: .27, w: .026 }, { a: -2.18, span: .12, h: .15, w: .018 }, { a: -2.5, span: .08, h: .1, w: .014 },
    { a: .5, span: .16, h: .15, w: .02 }, { a: .62, span: .07, h: .08, w: .013 },
    { a: 2.6, span: .2, h: .19, w: .022 }, { a: -.95, span: .08, h: .09, w: .014 }, { a: 1.35, span: .1, h: .07, w: .014 },
  ];
  for (const p of prom) loop(I, SUN, SR, p);
  // a hedgerow and a detached plume
  hedge(I, SUN, SR, 1.72, .2, .075);
  hedge(I, SUN, SR, -.35, .1, .05);
  plume(I, SUN, SR, -1.6, .2);

  // 4. spicules: a fringe of short strokes all round the limb
  {
    const r = mulberry32(5); ctx.strokeStyle = ORANGE; ctx.lineWidth = I.lw(.9); ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU, l = SR * (.008 + .022 * r() * r()), tilt = (r() - .5) * .5;
      const p0 = polar(SUN, SR * .995, a), p1 = [p0[0] + Math.cos(a + tilt) * l, p0[1] + Math.sin(a + tilt) * l];
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
    }
    ctx.stroke();
  }

  // 5. the disc: orange; the yellow photosphere a hair off register, its edge dissolving into
  //    the orange in a fine screen both ways (limb darkening as print)
  I.disc(SUN, SR, ORANGE);
  const off = [.9, -.7], YR = SR * .84, Y = [cx + off[0], cy + off[1]];
  I.within(c => { c.arc(cx, cy, SR - .5, 0, TAU); }, () => {
    I.halftone([cx - SR, cy - SR, cx + SR, cy + SR], (x, y) => {
      const d = Math.hypot(x - Y[0], y - Y[1]) / YR; if (d < 1) return 0;
      return Math.pow(clamp(1 - (d - 1) / .15), 1.4) * .8;
    }, { cell: 2.9, angle: .62, color: YELLOW });
  });
  I.disc(Y, YR, YELLOW);
  const detail = smooth(.95, 1.7, I.k);   // granulation only where the screen can resolve it
  const spots = [
    { lon: .47, lat: -.4, r: .06, um: .44 }, { lon: .57, lat: -.35, r: .034, um: .4 }, { lon: .52, lat: -.47, r: .022, um: .38 },
    { lon: -.6, lat: .3, r: .042, um: .44 }, { lon: -.52, lat: .35, r: .02, um: .4 },
  ];
  I.within(c => c.arc(Y[0], Y[1], YR, 0, TAU), () => {
    I.halftone([Y[0] - YR, Y[1] - YR, Y[0] + YR, Y[1] + YR], (x, y) => {
      const X = (x - Y[0]) / YR, Yy = (y - Y[1]) / YR, rr = X * X + Yy * Yy;
      if (rr >= 1) return .6;
      const z = Math.sqrt(1 - rr), r = Math.sqrt(rr);
      const lon = Math.atan2(X, z), lat = Math.asin(clamp(Yy, -1, 1));
      const [f1, f2] = worley(lon * 30 + 40, lat * 30 + 40, 11);
      const lane = 1 - smooth(.03, .26, f2 - f1);
      return Math.pow(smooth(.8, 1, r), 1.6) * .55 + lane * .11 * detail * (1 - .5 * r);
    }, { cell: 2.3, angle: .62, color: ORANGE, max: 1 });
    for (const sp of spots) sunspot(I, Y, YR, sp);
  });
}

function front(g, el) { let on = false; for (let a = 0; a <= TAU + .002; a += .02) { const p = el.pt(a); if (Math.sin(a) > 0) { on ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); on = true; } else on = false; } }

// a prominence loop: a tapered arch of orange with fine yellow strands
function loop(I, SUN, SR, p) {
  const { ctx } = I, a0 = p.a - p.span / 2, a1 = p.a + p.span / 2;
  const foot = (a, r) => polar(SUN, SR * r, a);
  const arch = (t, lift) => {   // point along the arch at t in 0..1
    const a = a0 + (a1 - a0) * t, h = Math.sin(t * PI) * p.h * lift;
    return foot(a, .99 + h);
  };
  ctx.fillStyle = ORANGE; ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const q = arch(i / 40, 1 + p.w * 6); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
  for (let i = 40; i >= 0; i--) { const q = arch(i / 40, .55); ctx.lineTo(q[0], q[1]); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = YELLOW; ctx.lineCap = 'round';
  for (const [lift, lw, al] of [[.95, 1.1, .95], [.82, .8, .8], [.7, .6, .7], [1.08, .55, .6]]) {
    ctx.lineWidth = I.lw(lw); ctx.globalAlpha = al; ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const q = arch(i / 40, lift); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function hedge(I, SUN, SR, a, span, h) {
  const { ctx } = I, r = mulberry32(77);
  ctx.strokeStyle = ORANGE; ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const t = i / 45, aa = a - span / 2 + span * t, hh = h * (.35 + .65 * Math.sin(t * PI)) * (.6 + .5 * r());
    const p0 = polar(SUN, SR * .99, aa), lean = (r() - .5) * .25, p1 = polar(SUN, SR * (1 + hh), aa + lean * hh);
    ctx.lineWidth = I.lw(1 + r() * 1.6); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]);
    ctx.quadraticCurveTo(...polar(SUN, SR * (1 + hh * .6), aa + lean * hh * 1.6), p1[0], p1[1]); ctx.stroke();
  }
  ctx.strokeStyle = YELLOW; ctx.globalAlpha = .7;
  for (let i = 0; i < 16; i++) { const aa = a - span * .4 + span * .8 * r(), hh = h * (.3 + .4 * r()); const p0 = polar(SUN, SR, aa), p1 = polar(SUN, SR * (1 + hh), aa); ctx.lineWidth = I.lw(.6); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function plume(I, SUN, SR, a, h) {
  const { ctx } = I, r = mulberry32(91);
  ctx.fillStyle = ORANGE;
  for (let i = 0; i < 30; i++) {
    const t = r(), rr = SR * (1.05 + h * t), aa = a + (r() - .5) * .07 * (1 + t), s = SR * (.004 + .008 * (1 - t) * r());
    const p = polar(SUN, rr, aa); ctx.beginPath(); ctx.ellipse(p[0], p[1], s * 2.2, s, aa + PI / 2, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = YELLOW; ctx.lineWidth = I.lw(.7); ctx.globalAlpha = .75; ctx.beginPath();
  const p0 = polar(SUN, SR, a - .02), p1 = polar(SUN, SR * (1 + h * .8), a + .015); ctx.moveTo(p0[0], p0[1]);
  ctx.bezierCurveTo(...polar(SUN, SR * (1 + h * .3), a - .04), ...polar(SUN, SR * (1 + h * .55), a + .03), p1[0], p1[1]); ctx.stroke(); ctx.globalAlpha = 1;
}
function sunspot(I, Y, YR, sp) {
  const { ctx } = I;
  // position on the visible disc and foreshortening toward the limb
  const X = Math.sin(sp.lon) * Math.cos(sp.lat), Yy = Math.sin(sp.lat), z = Math.cos(sp.lon) * Math.cos(sp.lat);
  const c = [Y[0] + X * YR, Y[1] + Yy * YR], rr = Math.hypot(X, Yy), rot = Math.atan2(Yy, X);
  const r = sp.r * YR, squash = Math.max(.25, z);
  ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(rot); ctx.scale(squash, 1);
  // penumbra
  ctx.fillStyle = ORANGE; ctx.beginPath();
  for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, q = r * (1 + .12 * Math.sin(a * 3 + sp.lon * 9) + .06 * Math.sin(a * 7)); i ? ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q) : ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); }
  ctx.closePath(); ctx.fill();
  // filaments
  ctx.strokeStyle = NAVY; ctx.globalAlpha = .45; ctx.lineWidth = I.lw(Math.max(.35, r * .022));
  ctx.beginPath();
  for (let i = 0; i < 42; i++) { const a = i / 42 * TAU + (i % 3) * .03, q0 = r * sp.um * 1.05, q1 = r * (.82 + .14 * ((i * 7) % 5) / 5); ctx.moveTo(Math.cos(a) * q0, Math.sin(a) * q0); ctx.lineTo(Math.cos(a) * q1, Math.sin(a) * q1); }
  ctx.stroke(); ctx.globalAlpha = 1;
  // umbra
  ctx.fillStyle = NAVY; ctx.beginPath();
  for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU, q = r * sp.um * (1 + .1 * Math.sin(a * 2 + 1)); i ? ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q) : ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); }
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // pores
  const pr = mulberry32(Math.round(sp.lon * 1000));
  ctx.fillStyle = NAVY; ctx.globalAlpha = .8;
  for (let i = 0; i < 6; i++) { const a = pr() * TAU, d = r * (1.4 + pr() * 1.6), s = r * (.05 + pr() * .07); ctx.beginPath(); ctx.ellipse(c[0] + Math.cos(a) * d * squash, c[1] + Math.sin(a) * d, s * squash, s, rot, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  void rr;
}

/* ───────────────────────── Mercury's plate ───────────────────────── */
export function drawMercury(I, w) {
  const sc = swarmScene(w), { ctx } = I, { MER, MR, bd } = sc;
  const box = [MER[0] - MR - 6, MER[1] - MR - 6, MER[0] + MR + 6, MER[1] + MR + 6];
  const bite = c => { const p = sc.bitePts; c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); c.closePath(); };
  const body = c => c.arc(MER[0], MER[1], MR, 0, TAU);
  const lit = (x, y) => ((x - MER[0]) * bd[0] + (y - MER[1]) * bd[1]) / MR;   // +1 facing the Sun

  const less = () => { ctx.beginPath(); body(ctx); ctx.clip(); ctx.beginPath(); ctx.rect(box[0] - 50, box[1] - 50, box[2] - box[0] + 100, box[3] - box[1] + 100); bite(ctx); ctx.clip('evenodd'); };
  ctx.save();
  // the planet less the pit
  less();
  I.disc(MER, MR, CREAM);
  // terraces: benches stepping down into the pit, darker the deeper they go
  const levels = [1.07, 1.15, 1.24, 1.34, 1.46, 1.6];
  const ter = levels.map(f => sc.terrace(f));
  for (let i = levels.length - 1; i >= 0; i--) {
    const pts = ter[i];
    I.within(c => { c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]); c.closePath(); }, () => {
      I.halftone(box, () => .1 + (levels.length - 1 - i) * .055, { cell: 2.2, angle: .8, color: NAVY });
    });
  }
  // the dark side: a navy screen past the terminator, craters, and ray streaks
  const craters = [];
  { const r = mulberry32(13); for (let i = 0; i < 26; i++) { const a = r() * TAU, d = Math.sqrt(r()) * .92, s = MR * (.025 + .11 * Math.pow(r(), 2.4)); craters.push([MER[0] + Math.cos(a) * d * MR, MER[1] + Math.sin(a) * d * MR, s]); } }
  I.halftone(box, (x, y) => {
    const l = lit(x, y); let t = clamp((.25 - l) * .95);
    t = t * t * (3 - 2 * t) * .92;
    for (const [qx, qy, s] of craters) {   // crater shadow: the wall nearest the light
      const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy) / s;
      if (d < 1) { const side = (dx * bd[0] + dy * bd[1]) / s; t += .55 * smooth(-.2, .7, side) * smooth(1, .6, d); }
    }
    return t;
  }, { cell: 2.4, angle: .8, color: NAVY, max: 1 });
  // crater rims
  ctx.strokeStyle = NAVY;
  for (const [qx, qy, s] of craters) { ctx.globalAlpha = .55; ctx.lineWidth = I.lw(Math.max(.4, s * .07)); ctx.beginPath(); ctx.arc(qx, qy, s, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // bench edges, crisp: a navy wall line with a lit lip just outside it
  for (const pts of ter) {
    const lip = pts.map(p => [p[0] + bd[0] * .9, p[1] + bd[1] * .9]);
    ctx.strokeStyle = CREAM; ctx.lineWidth = I.lw(.6); ctx.globalAlpha = .9; ctx.beginPath(); ctx.moveTo(lip[0][0], lip[0][1]); for (const p of lip) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = NAVY; ctx.lineWidth = I.lw(.75); ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.stroke();
  }
  // machines on the benches: tiny cream blocks with navy shadows
  { const r = mulberry32(29); for (let i = 0; i < 22; i++) { const L = levels[(r() * levels.length) | 0], pts = sc.terrace(L - .035), p = pts[(r() * pts.length) | 0]; const s = MR * (.012 + r() * .014); ctx.fillStyle = NAVY; ctx.fillRect(p[0] - s, p[1] - s * .4, s * 2.4, s * 1.2); ctx.fillStyle = CREAM; ctx.fillRect(p[0] - s * 1.1, p[1] - s * .9, s * 2, s * .9); } }
  // the mass driver: twin rails with coil rings, a breech, and the muzzle at the limb
  const [a, b] = [sc.railA, sc.railB], n = [-sc.launch[1], sc.launch[0]], hw = MR * .028;
  ctx.strokeStyle = NAVY; ctx.lineWidth = I.lw(MR * .011); ctx.beginPath();
  for (const s of [-hw, hw]) { ctx.moveTo(a[0] + n[0] * s, a[1] + n[1] * s); ctx.lineTo(b[0] + n[0] * s, b[1] + n[1] * s); }
  ctx.stroke();
  ctx.fillStyle = NAVY;
  for (let i = 0; i <= 26; i++) { const t = i / 26, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.atan2(sc.launch[1], sc.launch[0])); ctx.fillRect(-MR * .006, -hw * 1.9, MR * .012, hw * 3.8); ctx.restore(); }
  ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(Math.atan2(sc.launch[1], sc.launch[0])); ctx.fillRect(-MR * .06, -hw * 2.6, MR * .07, hw * 5.2); ctx.fillStyle = CREAM; ctx.fillRect(-MR * .05, -hw * 1.6, MR * .045, hw * 3.2); ctx.restore();
  // a mirror field on the bright side (rows of tiny dishes)
  ctx.fillStyle = NAVY; ctx.globalAlpha = .7;
  for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) { const p = polar(MER, MR * (.36 + row * .055), sc.phi + 2.05 + i * .055 + row * .02); ctx.fillRect(p[0] - .6, p[1] - .6, 1.6, 1.2); }
  ctx.globalAlpha = 1;
  ctx.restore();
  // the pit's rim, a hair of navy
  ctx.save(); less();
  ctx.strokeStyle = NAVY; ctx.lineWidth = I.lw(.8); ctx.globalAlpha = .5; ctx.beginPath(); bite(ctx); ctx.stroke(); ctx.restore();
  // muzzle: a braced tower at the limb where the pieces leave
  { const m = sc.muzzle, ang = Math.atan2(sc.launch[1], sc.launch[0]); ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(ang);
    ctx.fillStyle = CREAM; ctx.fillRect(-MR * .12, -hw * 1.5, MR * .12, hw * 3); ctx.strokeStyle = CREAM; ctx.lineWidth = I.lw(.6);
    ctx.beginPath(); ctx.moveTo(-MR * .12, -hw * 1.5); ctx.lineTo(-MR * .02, hw * 3.5); ctx.moveTo(-MR * .02, -hw * 1.5); ctx.lineTo(-MR * .12, hw * 3.5); ctx.stroke();
    ctx.fillStyle = YELLOW; ctx.fillRect(-MR * .015, -hw * 1.2, MR * .03, hw * 2.4); ctx.restore(); }
  // loose rubble drifting off the quarry: blocks lit on the Sun side
  const r = mulberry32(sc.seed + 23), trunk = sc.paths.find(Boolean).pts;
  for (let i = 0; i < 22; i++) {
    const f = Math.pow(r(), 1.7) * .22, q = at(trunk, f), s = (1.3 + r() * 2.2) * sc.SR / 250, j = 24 * (1 - f / .22);
    const p = [q[0] + (r() - .5) * j, q[1] + (r() - .5) * j];
    if (Math.hypot(p[0] - MER[0], p[1] - MER[1]) < MR + 2) continue;
    rock(ctx, p, s, r() * PI, bd);
  }
}
function rock(ctx, p, s, rot, l) {
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(rot); ctx.scale(s, s);
  const pts = [[-2, -1.5], [2.4, -1.1], [1.7, 1.9], [-1.9, 1.4]];
  ctx.fillStyle = CREAM; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill();
  // shadow on the side away from the Sun
  const c = Math.cos(-rot), sn = Math.sin(-rot), lx = l[0] * c - l[1] * sn, ly = l[0] * sn + l[1] * c;
  ctx.fillStyle = NAVY; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(-lx * 2.6 - ly * 2.4, -ly * 2.6 + lx * 2.4); ctx.lineTo(-lx * 2.6 + ly * 2.4, -ly * 2.6 - lx * 2.4); ctx.lineTo(-lx * .3 + ly * 2.4, -ly * .3 - lx * 2.4); ctx.lineTo(-lx * .3 - ly * 2.4, -ly * .3 + lx * 2.4); ctx.closePath();
  ctx.save(); ctx.clip(); ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.restore();
}

/* ───────────────── the swarm's linework: behind the Sun, and in front of it ───────────────── */
// Orbit lines and the far swarm's stipple hold still, so they are plates: the far halves behind
// the Sun's plate, the near halves (cream across the night, navy across the Sun) in front of it.
export function drawSwarmBack(I, w) {
  const sc = swarmScene(w), { ctx, k } = I;
  for (const rg of sc.rings) strokeDepth(ctx, rg.el, { color: CREAM, w: [1.3, .7].map(v => Math.max(v, .8 / k)), a: [.6, .3].map(v => v * (rg.band === 0 ? 1 : .7)) }, null, 'back');
  ctx.fillStyle = CREAM; ctx.globalAlpha = .4; ctx.beginPath();
  for (const [x, y, f, r] of sc.haze) if (!f) { const rr = Math.max(r * .85, .5 / k); ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
  ctx.fill(); ctx.globalAlpha = 1;
}
export function drawSwarmFront(I, w) {
  const sc = swarmScene(w), { ctx, k } = I, { SUN, SR } = sc, unit = SR / 250;
  ctx.save();
  ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); ctx.moveTo(SUN[0] + SR, SUN[1]); ctx.arc(SUN[0], SUN[1], SR, 0, TAU); ctx.clip('evenodd');
  for (const rg of sc.rings) strokeDepth(ctx, rg.el, { color: CREAM, w: [1.5, .8].map(v => Math.max(v * unit, .8 / k)), a: [.85, .45].map(v => v * (rg.band === 0 ? 1 : rg.band === 3 ? .5 : .7)) }, null, 'front');
  ctx.fillStyle = CREAM; ctx.globalAlpha = .62; ctx.beginPath();
  for (const [x, y, f, r] of sc.haze) if (f) { const rr = Math.max(r, .5 / k); ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
  ctx.fill();
  // the stream's dotted trails
  ctx.globalAlpha = .8; ctx.beginPath();
  for (const p of sc.paths) if (p) { let acc = 0; for (let i = 1; i < p.pts.length; i++) { const a = p.pts[i - 1], q = p.pts[i]; acc += Math.hypot(q[0] - a[0], q[1] - a[1]); if (acc >= 6.5 * unit) { acc = 0; const rr = Math.max(1.05 * unit, .6 / k); ctx.moveTo(q[0] + rr, q[1]); ctx.arc(q[0], q[1], rr, 0, TAU); } } }
  ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(SUN[0], SUN[1], SR - .5, 0, TAU); ctx.clip();
  for (const rg of sc.rings) strokeDepth(ctx, rg.el, { color: NAVY, w: [1.1, .6].map(v => Math.max(v * unit, .7 / k)), a: [.45, .2] }, null, 'front');
  ctx.fillStyle = NAVY; ctx.globalAlpha = .55; ctx.beginPath();
  for (const [x, y, f, r] of sc.haze) if (f) { const rr = Math.max(r * .9, .5 / k); ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
  ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();
}

/* ───────────────────────── what moves ───────────────────────── */
export const launchTime = (sc, ri) => sc.paths[ri].travel * .6;
export function drawSwarmLive(ctx, w, t, k, extras = []) {
  const sc = swarmScene(w), { SUN, SR, MER, MR, rings, ins } = sc;
  const unit = SR / 250;

  // collectors
  const front = [], back = [];
  const add = (rg, a, sl, size, fresh) => {
    const p = rg.el.pt(a), sa = Math.sin(a), depth = .17 * rg.el.rx / SR;
    const it = { p, ta: rg.el.tan(a), s: size * (1 + depth * sa) * (sa > 0 ? 1 : .86), face: .28 + .72 * Math.abs(Math.sin(a + sl.spin * .3)), sl, rg, a, fresh };
    (sa > 0 ? front : back).push(it);
  };
  for (const ex of extras) {
    const rg = rings[ex.ri], arr = ex.t0 + launchTime(sc, ex.ri);
    if (t >= arr) add(rg, ins + rg.w * (t - arr), { glint: null, spin: ex.spin, kind: .5 }, SR * ex.size, t - arr);
  }
  for (const rg of rings) {
    const sz = SR * (rg.band === 0 ? 1 : rg.band === 3 ? 1.8 : .82);
    for (const sl of rg.slots) {
      const arr = sl.arr ?? (sl.arr = arrival(rg, sl, ins));
      if (t < arr) continue;
      add(rg, sl.base + rg.w * t, sl, sz * sl.size, t - arr);
    }
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); ctx.moveTo(SUN[0] + SR - .6, SUN[1]); ctx.arc(SUN[0], SUN[1], SR - .6, 0, TAU); ctx.moveTo(MER[0] + MR, MER[1]); ctx.arc(MER[0], MER[1], MR, 0, TAU); ctx.clip('evenodd');
  for (const it of back) collector(ctx, it, k, false, .6);
  for (const it of front) if (it.rg.band !== 3) collector(ctx, it, k, false, 1);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); ctx.moveTo(SUN[0] + SR - .6, SUN[1]); ctx.arc(SUN[0], SUN[1], SR - .6, 0, TAU); ctx.clip('evenodd');
  for (const it of front) if (it.rg.band === 3) collector(ctx, it, k, false, 1);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(SUN[0], SUN[1], SR - .6, 0, TAU); ctx.clip();
  for (const it of front) collector(ctx, it, k, true, 1);
  ctx.restore();

  // glints: a panel turning to the light, and each new arrival
  for (const it of front.concat(back)) {
    let g = 0;
    if (it.sl.glint !== null) { const d = Math.atan2(Math.sin(it.a - it.sl.glint), Math.cos(it.a - it.sl.glint)); g = Math.exp(-d * d * 520); }
    if (it.fresh < 1.2) g = Math.max(g, 1 - it.fresh / 1.2);
    if (g < .04) continue;
    const dx = it.p[0] - SUN[0], dy = it.p[1] - SUN[1];
    if (dx * dx + dy * dy < SR * SR && Math.sin(it.a) <= 0) continue;
    if (Math.hypot(it.p[0] - MER[0], it.p[1] - MER[1]) < MR) continue;
    spark(ctx, it.p[0], it.p[1], (4 + 9 * g) * unit, g);
  }

  // the stream: pieces ride from the mass driver to their orbits, squaring up into panels
  for (let ri = 0; ri < rings.length; ri++) {
    const rg = rings[ri], path = sc.paths[ri]; if (!path) continue;
    for (const sl of rg.slots) {
      const arr = sl.arr ?? (sl.arr = arrival(rg, sl, ins));
      if (arr === -Infinity || t >= arr || t < arr - path.travel) continue;
      const u = 1 - (arr - t) / path.travel, f = 1 - Math.pow(1 - u, 1.7);
      const q = at(path.pts, f), q2 = at(path.pts, Math.min(1, f + .01)), ang = Math.atan2(q2[1] - q[1], q2[0] - q[0]);
      chunk(ctx, q[0], q[1], ang, sl.spin + t * (1.6 - f * 1.4), smooth(.55, .95, f), unit * (1.45 - .35 * f), sl.size, sc.bd);
      if (u < .04) spark(ctx, sc.muzzle[0], sc.muzzle[1], 9 * unit, 1 - u / .04);
    }
  }
  for (const ex of extras) {
    const path = sc.paths[ex.ri], tr = launchTime(sc, ex.ri), u = (t - ex.t0) / tr;
    if (u < 0 || u >= 1) continue;
    const f = 1 - Math.pow(1 - u, 1.7), q = at(path.pts, f), q2 = at(path.pts, Math.min(1, f + .01));
    chunk(ctx, q[0], q[1], Math.atan2(q2[1] - q[1], q2[0] - q[0]), ex.spin + t * (1.6 - f * 1.4), smooth(.55, .95, f), unit * (1.45 - .35 * f), ex.size, sc.bd);
    if (u < .06) spark(ctx, sc.muzzle[0], sc.muzzle[1], 12 * unit, 1 - u / .06);
  }
  // gravel riding the stream between the big pieces
  const ps = sc.paths.filter(Boolean);
  ctx.fillStyle = CREAM;
  for (let i = 0; i < 52; i++) {
    const path = ps[i % ps.length].pts, f = (t / 16 + i / 52 + (i * .618) % .05) % 1, q = at(path, f), a = smooth(0, .05, f) * (1 - smooth(.8, 1, f));
    if (a <= 0) continue;
    const s = (1.1 + (i % 4) * .55) * unit, j = (1 - f) * 7;
    ctx.globalAlpha = a * .9; ctx.fillRect(q[0] - s / 2 + Math.sin(i * 7.1) * j, q[1] - s / 2 + Math.cos(i * 3.3) * j, s, s);
  }
  ctx.globalAlpha = 1;
}

// A collector: two panel wings on a boom with a hub. Detail grows with size on screen: a sliver
// far away; wings, boom and hub up close; cells, a truss and radiator fins on the near orbit.
// Against the Sun it is a navy silhouette with light between its cells.
function collector(ctx, it, k, sil, alpha) {
  const L = it.s * .062, Wd = Math.max(it.s * .024 * it.face, .6 / k), px = L * k;
  ctx.save(); ctx.translate(it.p[0], it.p[1]); ctx.rotate(it.ta); ctx.globalAlpha = alpha;
  const body = sil ? NAVY : CREAM;
  if (px < 9) {
    ctx.fillStyle = body; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
    if (!sil) { ctx.fillStyle = YELLOW; ctx.fillRect(-L * .08, -Wd / 2 - .25 / k, L * .16, Wd + .5 / k); }
    ctx.restore(); return;
  }
  const g = L * .085, wl = L / 2 - g, lw = Math.max(.45 / k, L * .012);
  // boom
  ctx.fillStyle = body; ctx.fillRect(-g - lw, -lw / 2, 2 * g + 2 * lw, lw);
  if (sil) {
    const cols = px > 40 ? 5 : 3, gap = Math.max(.5 / k, wl * .025);
    for (const x0 of [-L / 2, g]) for (let i = 0; i < cols; i++) ctx.fillRect(x0 + i * wl / cols, -Wd / 2, wl / cols - gap, Wd);
    ctx.fillRect(-g * .6, -Wd * .28, g * 1.2, Wd * .56);
    ctx.restore(); return;
  }
  ctx.fillRect(-L / 2, -Wd / 2, wl, Wd); ctx.fillRect(g, -Wd / 2, wl, Wd);
  // cells
  const cols = px > 40 ? 5 : 3;
  ctx.fillStyle = NAVY; ctx.globalAlpha = alpha * .5;
  for (const x0 of [-L / 2, g]) {
    for (let i = 1; i < cols; i++) ctx.fillRect(x0 + wl * i / cols - lw / 2, -Wd / 2, lw, Wd);
    if (Wd * k > 4) ctx.fillRect(x0, -lw / 2, wl, lw);
  }
  ctx.globalAlpha = alpha;
  // hub, and on the near orbit a truss and fins
  ctx.fillStyle = YELLOW; ctx.fillRect(-g * .55, -Wd * .36, g * 1.1, Wd * .72);
  if (px > 34) {
    ctx.strokeStyle = CREAM; ctx.lineWidth = lw * .8; ctx.beginPath();
    for (let i = 0; i < 4; i++) { const x = -g + i * g / 2; ctx.moveTo(x, -Wd * .7); ctx.lineTo(x + g / 2, Wd * .7); }
    ctx.moveTo(-g, -Wd * .7); ctx.lineTo(g, -Wd * .7); ctx.moveTo(-g, Wd * .7); ctx.lineTo(g, Wd * .7); ctx.stroke();
    ctx.fillStyle = CREAM; ctx.fillRect(-lw * .6, -Wd * 1.25, lw * 1.2, Wd * .5); ctx.fillRect(-lw * .6, Wd * .75, lw * 1.2, Wd * .5);
  }
  ctx.restore();
}
// a tumbling rock that squares up into a panel as it nears its orbit (m: 0 rock → 1 panel)
function chunk(ctx, x, y, ang, spin, m, s, size, l) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin * (1 - m) + ang * m); ctx.scale(s * size, s * size);
  const rock = [[-4.2, -3], [3.6, -3.4], [4.6, 1.2], [1.2, 3.6], [-3.8, 2.6]];
  const pan = [[-6.4, -2.4], [6.4, -2.4], [6.4, 2.4], [-6.4, 2.4], [-6.4, 0]];
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const px = rock[i][0] + (pan[i][0] - rock[i][0]) * m, py = rock[i][1] + (pan[i][1] - rock[i][1]) * m; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fillStyle = CREAM; ctx.fill();
  if (m < .6) { ctx.save(); ctx.clip(); ctx.globalAlpha = .5 * (1 - m / .6); ctx.fillStyle = NAVY; const a = -(spin * (1 - m) + ang * m) + Math.atan2(l[1], l[0]) + PI; ctx.rotate(a); ctx.fillRect(0, -8, 8, 16); ctx.restore(); }
  if (m > .5) { ctx.globalAlpha = (m - .5) * 2; ctx.fillStyle = NAVY; ctx.fillRect(-6.4, -.25, 12.8, .5); for (const xx of [-3.2, 3.2]) ctx.fillRect(xx - .2, -2.4, .4, 4.8); ctx.fillStyle = YELLOW; ctx.fillRect(-1, -2.6, 2, 5.2); }
  ctx.restore();
}

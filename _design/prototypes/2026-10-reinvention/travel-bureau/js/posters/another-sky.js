/* No. 01 · Another Sky. The view from Firstlight Overlook, looking down the cylinder to the
   far end wall, painted from the explorer's own world: the same 12 km radius, 56 km length,
   lake ellipses, city centres, transit rings, end-wall spokes and axial daylight spine
   (copied from another-sky/explorer.js). Living thing: the transit cars, which run around
   the rings at the explorer's speeds (105-170 m/s), so they creep across the sky in real time. */
(function () {
'use strict';
const { clamp, lerp, smooth, fbm, vnoise, rng, TAU, hex } = Paint;
const { ART, INK } = Kit;

// ---- the world, as defined in another-sky/explorer.js ----
const R = 12000, LENGTH = 56000, HALF = LENGTH / 2, CIRC = TAU * R;
const wrap = (s) => ((s + CIRC / 2) % CIRC + CIRC) % CIRC - CIRC / 2;
const deltaS = (a, b) => wrap(a - b);
const LAKES = [[-1900, -2100, 4250, 6600], [11900, -6500, 3750, 8200], [-17300, -2200, 4600, 8600], [29200, 7300, 3900, 10200], [-30700, -19500, 5200, 5300], [5600, 18300, 4300, 7200], [-11500, 19000, 5000, 5900], [23000, -22100, 3450, 4600]];
const CITY = [[3450, 1250, 2400], [5900, -13600, 2800], [-8400, -11600, 2900], [-7150, 4100, 2450], [17800, -8300, 3200], [15500, 14600, 2700], [-19800, -16600, 2700], [-25300, 5000, 3400], [-36500, -6100, 3700], [29200, -12900, 3050], [23800, 20800, 2600], [-4200, 23200, 2900], [2100, -24500, 2650], [-32200, 21100, 2900], [-18300, 9800, 2800], [19000, 3500, 2400], [6200, 6200, 2700], [-5000, -20700, 2500], [-28000, -6000, 3000], [34500, 13500, 2350], [35600, -20000, 3100], [-23600, 23900, 2350], [10400, -23300, 2400], [-4000, 11600, 2250]];
const RING_Z = [-25300, -15500, -4300, 8200, 21600];
function lakeField(s, z) {
  let d = 9;
  for (let i = 0; i < LAKES.length; i++) {
    const l = LAKES[i], sx = deltaS(s, l[0]), zz = z - l[1];
    const e = Math.sqrt((sx / l[2]) ** 2 + (zz / l[3]) ** 2);
    const wiggle = 0.049 * Math.sin(sx / 670 + zz / 920) + 0.029 * Math.sin(zz / 390 - sx / 860);
    d = Math.min(d, e - 1 + wiggle);
  }
  return d;
}
function urban(s, z) {
  let u = 0;
  for (let i = 0; i < CITY.length; i++) {
    const c = CITY[i], x = deltaS(s, c[0]) / c[2], y = (z - c[1]) / c[2], d = x * x + y * y;
    if (d < 8) u = Math.max(u, Math.exp(-d * 0.8));
  }
  return u;
}

// ---- camera: standing on Firstlight Overlook (s 1515, z 4290), looking toward the -z end ----
const S0 = 1515, Z0 = 4290, EYE = 205;
const CAM = { yaw: -0.035, pitch: 0.555, f: 470, cx: ART.cx, cy: ART.cy + 4 };
function basis() {
  const { yaw, pitch } = CAM;
  const fw = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const rt = [Math.cos(yaw), 0, Math.sin(yaw)];
  const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  return { fw, rt, up };
}
const BAS = basis();
const V = [0, -R + EYE, Z0];
// world point for the cylinder surface at arc s, axial z, height h (s measured from the viewer)
function wpt(s, z, h = 0) { const t = (s - S0) / R, r = R - h; return [Math.sin(t) * r, -Math.cos(t) * r, z]; }
function project(P) {
  const d = [P[0] - V[0], P[1] - V[1], P[2] - V[2]];
  const zc = d[0] * BAS.fw[0] + d[1] * BAS.fw[1] + d[2] * BAS.fw[2];
  if (zc < 40) return null;
  const xc = d[0] * BAS.rt[0] + d[1] * BAS.rt[1] + d[2] * BAS.rt[2];
  const yc = d[0] * BAS.up[0] + d[1] * BAS.up[1] + d[2] * BAS.up[2];
  return [CAM.cx + CAM.f * xc / zc, CAM.cy - CAM.f * yc / zc, zc];
}
// a ring around the axis at z with radius r, as screen polylines broken where it passes behind us
function ringPolys(z, r, n = 720, s0 = 0, s1 = TAU) {
  const polys = []; let cur = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(s0, s1, i / n), p = project([Math.sin(a) * r, -Math.cos(a) * r, z]);
    if (!p) { if (cur.length > 1) polys.push(cur); cur = []; continue; }
    cur.push(p);
  }
  if (cur.length > 1) polys.push(cur);
  return polys;
}

const PAL = {
  meadow: '#b4c383', green: '#7e9a5c', wood: '#4d7346', deep: '#2f5338',
  lake: '#3c7f7b', lakeDeep: '#245a60', shallow: '#78ad98', shine: '#d9ead8',
  city: ['#f3ead0', '#e6dcc0', '#d8d2b6', '#c9cdb6', '#eadfc6'], cityShade: '#8f907a', haze: '#f1e4c4',
  wall: '#d9dcc4', wallLight: '#fbf3dc', wallBlue: '#b9cfc6',
  hoop: '#f8f0da', gold: '#e8bf72', spine: '#fffcef', glow: '#ffe9b4', sand: '#dccb9a', trunk: '#6b4b38', figure: '#33212c'
};

function traceScene(b) {
  const { w, k } = b, N = b.N;
  const S = new Float32Array(N), Zh = new Float32Array(N), D = new Float32Array(N), CLD = new Float32Array(N);
  const x0 = Math.floor(ART.x0 * k), x1 = Math.ceil(ART.x1 * k), y0 = Math.floor(ART.y0 * k), y1 = Math.ceil(ART.y1 * k);
  const { fw, rt, up } = BAS, Rc = R - 2150;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const X = (x + 0.5) / k, Y = (y + 0.5) / k, a = (X - CAM.cx) / CAM.f, c = -(Y - CAM.cy) / CAM.f;
    const dx = fw[0] + a * rt[0] + c * up[0], dy = fw[1] + a * rt[1] + c * up[1], dz = fw[2] + a * rt[2] + c * up[2];
    const A = dx * dx + dy * dy, B = 2 * (V[0] * dx + V[1] * dy), C = V[0] * V[0] + V[1] * V[1] - R * R;
    const t = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
    const i = y * w + x;
    const hx = V[0] + t * dx, hy = V[1] + t * dy;
    S[i] = S0 + Math.atan2(hx, -hy) * R; Zh[i] = V[2] + t * dz; D[i] = t * Math.hypot(dx, dy, dz);
  }
  return { S, Zh, D, CLD, box: [x0, y0, x1, y1] };
}

// buildings from the explorer's city centres, stood up toward the axis, projected and
// brushed in far to near: a gouache face, a sprayed shadow rising from the base, a lit cap
function cityLayer(b) {
  const r = rng(4242), list = [], dots = [];
  for (const c of CITY) {
    const [cs, cz, rad] = c;
    const g = 150;
    for (let ds = -rad * 1.7; ds <= rad * 1.7; ds += g) for (let dz = -rad * 1.7; dz <= rad * 1.7; dz += g) {
      const s = cs + ds + (r() - 0.5) * g * 0.7, z = cz + dz + (r() - 0.5) * g * 0.7;
      const x = deltaS(s, cs) / rad, y = (z - cz) / rad, u = Math.exp(-(x * x + y * y) * 0.8);
      const keep = r(), tone = r(), hr = r(), wr = r();
      if (u < 0.3 || keep > 0.5 + u * 0.45) continue;
      if (z < -HALF + 400 || z > HALF - 400 || lakeField(s, z) < 0.06) continue;
      const base = project(wpt(s, z, 0));
      if (!base || base[2] > 32000 || base[2] < 2600 || base[1] > 1004) continue;
      if (base[0] < ART.x0 - 30 || base[0] > ART.x1 + 30 || base[1] < ART.y0 - 30 || base[1] > ART.y1 + 30) continue;
      const ht = 20 + u * u * (50 + hr * hr * 260), wd = 28 + wr * 40;
      const scale = CAM.f / base[2];
      if (wd * scale < 1.1) { dots.push([base[0], base[1], Math.max(0.3, wd * scale * 0.55), (tone * 5) | 0]); continue; }
      list.push({ s, z, ht, wd, d: base[2], tone: (tone * 5) | 0 });
    }
  }
  list.sort((p, q) => q.d - p.d);
  const L = b.layer(), c = L.c;
  for (const d of dots) { c.fillStyle = PAL.city[d[3]]; c.globalAlpha = 0.75; c.beginPath(); c.arc(d[0], d[1], d[2], 0, TAU); c.fill(); }
  c.globalAlpha = 1;
  for (const B of list) {
    const P = (sx, hh) => project(wpt(B.s + sx, B.z, hh));
    const a = P(-B.wd / 2, 0), bb = P(B.wd / 2, 0), cc = P(B.wd / 2, B.ht), dd = P(-B.wd / 2, B.ht);
    const e = P(B.wd / 2 + B.wd * 0.4, -2), f = P(B.wd / 2 + B.wd * 0.4, B.ht * 0.96);
    if (!a || !bb || !cc || !dd) continue;
    const quad = (q, fill) => { c.fillStyle = fill; c.beginPath(); c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]); c.closePath(); c.fill(); };
    if (e && f) quad([bb, e, f, cc], '#8d8b74');
    quad([a, bb, cc, dd], PAL.city[B.tone]);
    // the airbrushed shadow, strongest at the foot of the building
    const m0 = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2], m1 = [(cc[0] + dd[0]) / 2, (cc[1] + dd[1]) / 2];
    const gr = c.createLinearGradient(m0[0], m0[1], m1[0], m1[1]);
    gr.addColorStop(0, 'rgba(96,98,78,.55)'); gr.addColorStop(0.55, 'rgba(96,98,78,.12)'); gr.addColorStop(1, 'rgba(96,98,78,0)');
    quad([a, bb, cc, dd], gr);
    // window bands on the nearest towers
    if (B.d < 9000 && B.ht > 90) {
      c.strokeStyle = 'rgba(120,128,112,.35)'; c.lineWidth = Math.max(0.25, 2.2 * CAM.f / B.d);
      for (let hh = 14; hh < B.ht - 8; hh += 14) { const l = P(-B.wd / 2 + 4, hh), rr = P(B.wd / 2 - 4, hh); if (l && rr) { c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(rr[0], rr[1]); c.stroke(); } }
    }
    c.strokeStyle = 'rgba(255,250,232,.85)'; c.lineWidth = Math.max(0.3, 3 * CAM.f / B.d);
    c.beginPath(); c.moveTo(dd[0], dd[1]); c.lineTo(cc[0], cc[1]); c.stroke();
  }
  return L.cv;
}

function build(b) {
  const { w, k } = b, N = b.N;
  const W = Kit.windowMask(b);
  const { S, Zh, D, CLD, box } = traceScene(b);
  const [x0, y0, x1, y1] = box;

  // ---- the far end wall: a hard frisket from the projected rim ----
  const rim = ringPolys(-HALF, R, 720)[0];
  const WALL = b.mul(b.raster((c) => { c.beginPath(); rim.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); }), W);
  const LAND = b.sub(W, WALL);
  const lf = new Float32Array(N);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; lf[i] = lakeField(S[i], Math.max(-HALF, Zh[i])) + 0.02; }
  const LAKE = b.mul(b.aa(lf), LAND);
  const DRY = b.sub(LAND, LAKE);
  const nearF = (i) => clamp(1 - D[i] / 19000);
  const C0 = project([0, 0, -HALF]);

  // ---- land: one even coat, then meadows and woods sprayed loosely, quieter with distance ----
  b.spray(PAL.green, LAND, { grain: 0.1 });
  const meadow = b.zero(), woods = b.zero(), slopes = b.zero(), light = b.zero();
  for (let i = 0; i < N; i++) {
    if (!LAND[i]) continue;
    const s = S[i], z = Zh[i], nd = nearF(i) ** 0.6;
    const nf = clamp(1 - D[i] / 30000) ** 0.8;
    meadow[i] = LAND[i] * lerp(0.4, 0.1 + 0.9 * smooth(0.42, 0.62, fbm(s / 2400, z / 2800, 5, 3)), nf);
    woods[i] = LAND[i] * nf * smooth(0.56, 0.7, fbm(s / 1300 + 7, z / 1700, 13, 3)) * 0.85;
    const ridge = 0.5 + 0.5 * Math.sin(s / 1750 + 0.9 * Math.sin(z / 3300));
    slopes[i] = LAND[i] * nd * smooth(0.6, 1, ridge) * 0.5;
  }
  b.spray(PAL.meadow, meadow, { grain: 0.35, spit: 0.15 });
  b.spray(PAL.wood, woods, { grain: 0.4 });
  b.spray('#56704a', slopes, { grain: 0.4, mode: 'glaze', op: 0.45 });

  // ---- lakes: frisket-cut, sprayed deeper toward the middle, lighter along the shore ----
  b.spray(PAL.lake, LAKE, { grain: 0.08 });
  const deep = b.zero(), shore = b.zero();
  for (let i = 0; i < N; i++) { if (!LAKE[i]) continue; deep[i] = LAKE[i] * smooth(0, 0.5, -lf[i]) * 0.9; shore[i] = LAKE[i] * smooth(-0.06, 0, lf[i]) * 0.6; }
  b.spray(PAL.lakeDeep, deep, { grain: 0.3 });
  b.spray(PAL.shallow, shore, { grain: 0.45 });
  b.spray('#1f4a4a', b.ridge(LAKE, 0.6), { op: 0.3, grain: 0.2 });

  // ---- towns: buildings stood up toward the axis; far ones are just a brushed stipple ----
  const town = b.zero();
  for (let i = 0; i < N; i++) { if (!DRY[i]) continue; const u = urban(S[i], Math.max(-HALF, Zh[i])); town[i] = DRY[i] * smooth(0.35, 0.85, u) * 0.55; }
  b.spray('#e3dcc0', b.scale(town, 0.9), { grain: 0.15, soft: 0.5 });
  // far towns: a stipple of tiny brushed blocks rather than a wash
  b.spatter('#f4ecd4', [ART.x0, ART.y0, ART.x1, ART.y1], 26000, 0.35, 1.1, { accept: (u, v) => { const x = Math.floor(u * k), y = Math.floor(v * k); const i = y * w + x; return i >= 0 && i < N ? town[i] * 1.3 : 0; }, aMin: 0.6, aMax: 1, pow: 2, colors: ['#f6efd8', '#ece3c6', '#cfcab0', '#a9a68c'] });
  b.paste(cityLayer(b));
  // lift the window frisket edge back clean where buildings ran over it
  b.spray(Kit.INK.board, b.inv(W), { grain: 0, op: 1 });

  // ---- clouds: ~140 clusters 1.5-2.9 km up, as in the explorer, each sprayed as soft lobes ----
  const cr = rng(1255), lobes = [];
  for (let j = 0; j < 150; j++) {
    if (j % 5 === 1 || j % 5 === 3) { cr(); cr(); cr(); cr(); cr(); continue; }
    const s = cr() * CIRC, z = lerp(-HALF + 2500, HALF - 2500, cr()), hh = lerp(1550, 2900, cr()), sc = lerp(125, 285, cr()), n = 3 + ((cr() * 3) | 0);
    for (let q = 0; q < n; q++) {
      const ls = s + (q - n / 2) * sc * 0.9, lz = z + (cr() - 0.5) * sc * 0.8, lh = hh + (cr() - 0.3) * sc * 0.3, wd = sc * lerp(0.8, 1.6, cr());
      const p = project(wpt(ls, lz, lh));
      if (!p || p[2] < 7000) continue;
      const rad = wd * CAM.f / p[2] * 0.75;
      if (p[0] < ART.x0 - rad || p[0] > ART.x1 + rad || p[1] < ART.y0 - rad || p[1] > ART.y1) continue;
      lobes.push([p[0], p[1], rad]);
    }
  }
  const CL = b.mul(b.raster((c) => {
    for (const [x, y, rad] of lobes) {
      const g = c.createRadialGradient(x, y, 0, x, y, rad * 1.25);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rad * 1.25, rad * 1.0, 0, 0, TAU); c.fill();
    }
  }), LAND);
  b.spray('#6f8466', b.shift(b.blur(CL, 2), 2, 3), { op: 0.22, grain: 0.3 });
  b.spray('#fffaf0', b.scale(CL, 1.25), { grain: 0.25, op: 0.95 });

  // ---- distance: a veil of warm haze, and the spine's glow on the land overhead ----
  const haze = b.zero(), veil = b.zero();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x; if (!LAND[i]) continue;
    haze[i] = LAND[i] * (1 - Math.exp(-D[i] / 24000)) ** 1.5 * 0.85;
    const v = (y + 0.5) / k, u = (x + 0.5) / k;
    veil[i] = LAND[i] * Math.exp(-(((u - C0[0]) / 170) ** 2)) * smooth(C0[1] + 40, C0[1] - 380, v) * 0.32;
  }
  b.spray(PAL.haze, haze, { grain: 0.2, soft: 0.5 });
  b.spray(PAL.glow, veil, { grain: 0.25, soft: 0.5 });

  // ---- the end wall: warm pale disc, concentric seams, spokes, gold rim and hub ----
  const rimR = Math.max(...rim.map((p) => Math.hypot(p[0] - C0[0], p[1] - C0[1])));
  b.spray(PAL.wall, WALL, { grain: 0.08 });
  b.spray(PAL.wallBlue, b.mulF(WALL, (u, v) => 0.5 * smooth(0.35, 1, Math.hypot(u - C0[0], v - C0[1]) / rimR)), { grain: 0.25 });
  b.spray(PAL.wallLight, b.mulF(WALL, (u, v) => Math.exp(-((Math.hypot(u - C0[0], v - C0[1]) / (rimR * 0.6)) ** 2))), { grain: 0.2 });
  const seams = [];
  for (const f of [0.2, 0.33, 0.46, 0.59, 0.72, 0.85]) for (const p of ringPolys(-HALF + 5, R * f, 360)) seams.push(p.map((q) => [q[0], q[1], 0.9]));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13, pa = project([Math.sin(a) * 700, -Math.cos(a) * 700, -HALF + 25]), pb = project([Math.sin(a) * (R - 380), -Math.cos(a) * (R - 380), -HALF + 25]);
    seams.push([[pa[0], pa[1], 0.7], [pb[0], pb[1], 1.6]]);
  }
  const SEAM = b.mul(b.strokeMask(seams), WALL);
  b.spray('#9fb0a2', b.shift(SEAM, 0.8, 0.8), { op: 0.4, grain: 0.2 });
  b.gouache('#fffbec', SEAM, { op: 0.7, dry: 0.2 });
  const rims = [];
  for (const [off, wd] of [[60, 3.4], [370, 1.5]]) for (const p of ringPolys(-HALF + 60, R - off, 720)) rims.push(p.map((q) => [q[0], q[1], wd]));
  b.gouache(PAL.hoop, b.mul(b.strokeMask(rims), W), { op: 0.9 });
  const goldRim = []; for (const p of ringPolys(-HALF + 60, R - 185, 720)) goldRim.push(p.map((q) => [q[0], q[1], 1.7]));
  b.gouache(PAL.gold, b.mul(b.strokeMask(goldRim), W), { op: 0.9 });

  // ---- transit rings and hoops ahead of us, drawn as fine brushed arcs ----
  const arcs = [], gold = [], hoops = [];
  for (const z of RING_Z) {
    if (z > Z0 - 500) continue;
    for (const p of ringPolys(z, R - 1060, 900)) arcs.push(p.map((q) => [q[0], q[1], clamp(2.8 * 22 * CAM.f / q[2], 1.1, 5)]));
    for (const p of ringPolys(z + 34, R - 1060, 900)) gold.push(p.map((q) => [q[0], q[1], clamp(5 * CAM.f / q[2] + 0.5, 0.6, 1.7)]));
    for (const p of ringPolys(z, R - 85, 900)) hoops.push(p.map((q) => [q[0], q[1], clamp(1.4 * 17 * CAM.f / q[2], 0.6, 2.6)]));
    for (let i = 0; i < 18; i++) {
      const s = S0 + (i / 18) * CIRC, a = project(wpt(s, z, 110)), c = project(wpt(s, z, 1048));
      if (a && c) arcs.push([[a[0], a[1], clamp(1.4 * 9 * CAM.f / a[2], 0.6, 2.2)], [c[0], c[1], clamp(1.4 * 9 * CAM.f / c[2], 0.6, 2.2)]]);
    }
  }
  const ARCS = b.mul(b.strokeMask(arcs), W);
  b.spray('#5f6f58', b.shift(b.blur(ARCS, 1.6), 1.2, 2), { op: 0.3, grain: 0.3 });
  b.gouache(PAL.hoop, ARCS, { op: 0.92 });
  b.gouache(PAL.gold, b.mul(b.strokeMask(gold), W), { op: 0.85 });
  b.gouache('#eef0dc', b.mul(b.strokeMask(hoops), W), { op: 0.5, dry: 0.2 });

  // ---- the axial daylight spine: a sprayed glow with a brushed white core ----
  const spine = [];
  for (let z = -HALF + 100; z < Z0 - 700; z += 120) { const p = project([0, 0, z]); if (p) spine.push([p[0], p[1], clamp(2.2 * 46 * CAM.f / p[2], 1, 7)]); }
  const SP = b.mul(b.strokeMask([spine]), W);
  b.spray(PAL.glow, b.scale(b.blur(SP, 22), 3), { grain: 0.25, op: 0.55 });
  b.spray(PAL.glow, b.scale(b.blur(SP, 6), 2), { grain: 0.2, op: 0.85 });
  b.spray('#fff6dc', b.scale(b.blur(SP, 2), 1.5), { grain: 0.1 });
  b.gouache(PAL.spine, SP, { op: 1 });
  for (const z of [-25000, -12000, 1000]) { const p = project([0, 0, z]); if (p && p[1] > ART.y0 + 10) b.glint(p[0], p[1], clamp(5200 / p[2] * 2.2, 4, 11), '#fff6dc', { bloom: 0.55, rays: 4, rot: 0.785, width: 0.05 }); }
  b.spray('#fff3cf', b.field((u, v) => 0.9 * Math.exp(-(((u - C0[0]) ** 2 + (v - C0[1]) ** 2) / 500)), [C0[0] - 90, C0[1] - 90, C0[0] + 90, C0[1] + 90]), { grain: 0.2 });
  b.glint(C0[0], C0[1], 19, '#fffdf3', { bloom: 0.9, rays: 8, short: 0.42, width: 0.055, rot: 0.2 });
  const hub = []; for (const p of ringPolys(-HALF + 45, 500, 120)) hub.push(p.map((q) => [q[0], q[1], 1.3]));
  b.gouache(PAL.gold, b.strokeMask(hub), { op: 0.9 });

  // ---- foreground: the hilltop at Firstlight Overlook ----
  const FG = foreground(b, W);

  Kit.band(b, {
    no: '01', open: true, title: 'Another Sky',
    titleStyle: { top: '#3c8079', bottom: '#2a4a38', band: '#8cbf96', shadow: INK.plum },
    line: "WALK INSIDE AN O'NEILL CYLINDER · 24 KM ACROSS",
  });

  // ---- living thing: transit cars on the three rings ahead ----
  const r = rng(7301), trains = [];
  for (const z of RING_Z) {
    if (z > Z0 - 500) continue;
    for (let i = 0; i < 3; i++) trains.push({ z, a0: (i / 3) * TAU + r() * 0.33, w: (lerp(105, 170, r()) * (i % 2 ? -1 : 1)) / (R - 1060) });
  }
  return { fg: FG, trains, glint: glintSprite(b) };
}

function foreground(b, W) {
  const { k } = b;
  // the near slope falling away to the lake (lighter), then the crest we stand on (darker)
  const slope = b.mul(b.raster((c) => {
    c.beginPath(); c.moveTo(ART.x0, 1012);
    c.bezierCurveTo(250, 998, 380, 1010, 520, 1020); c.bezierCurveTo(690, 1030, 820, 1008, ART.x1, 1000);
    c.lineTo(ART.x1, ART.y1); c.lineTo(ART.x0, ART.y1); c.closePath(); c.fill();
  }), W);
  b.spray('#5a7f4a', slope, { grain: 0.1 });
  b.spray('#a3b977', b.mulF(slope, (u, v) => clamp(1 - (v - 1000) / 60) * 0.75), { grain: 0.4 });
  b.spray('#3e6440', b.mulF(slope, (u, v) => smooth(1010, 1070, v) * 0.6), { grain: 0.4 });
  const crest = b.mul(b.raster((c) => {
    c.beginPath(); c.moveTo(ART.x0, 1062);
    c.bezierCurveTo(170, 1040, 330, 1046, 470, 1056); c.bezierCurveTo(600, 1064, 760, 1078, ART.x1, 1070);
    c.lineTo(ART.x1, ART.y1); c.lineTo(ART.x0, ART.y1); c.closePath(); c.fill();
  }), W);
  b.spray('#3f643c', crest, { grain: 0.1 });
  b.spray('#26402d', b.mulF(crest, (u, v) => clamp((v - 1056) / 95) ** 1.2 * 0.75), { grain: 0.4, spit: 0.2 });
  b.gouache('#d3d58f', b.mul(b.ridge(crest, 1.8), b.field((u, v) => clamp(1.2 - (v - 1040) / 40))), { op: 0.7, dry: 0.45 });
  // the path, sand-coloured, curving off over the crest
  const path = b.mul(b.raster((c) => {
    c.beginPath(); c.moveTo(585, 1062); c.bezierCurveTo(640, 1080, 700, 1110, 760, ART.y1 + 2); c.lineTo(905, ART.y1 + 2);
    c.bezierCurveTo(800, 1110, 690, 1078, 602, 1061); c.closePath(); c.fill();
  }), W);
  b.spray(PAL.sand, path, { grain: 0.1 });
  b.spray('#9c8762', b.mulF(path, (u, v) => clamp((v - 1066) / 85) * 0.7), { grain: 0.45 });
  b.gouache('#f6ebc6', b.mul(b.ridge(path, 1), b.field((u, v) => clamp(1 - (v - 1060) / 30))), { op: 0.5 });
  // a bench (as in the explorer), a lamp post, low-poly trees
  const dark = b.raster((c) => {
    // bench
    c.fillRect(392, 1040, 44, 3.2); c.fillRect(392, 1031, 44, 2.6); c.fillRect(395, 1043, 2.4, 9); c.fillRect(431, 1043, 2.4, 9);
    // lamp post
    c.fillRect(812, 990, 2.6, 82); c.fillRect(806, 988, 14, 3);
  });
  b.gouache('#2e4440', dark, { op: 0.95 });
  b.glint(813, 993, 5, '#ffe9b0', { bloom: 0.6, rays: 4, rot: 0.785, width: 0.06 });
  tree(b, 150, 1050, 1.25, 1); tree(b, 258, 1046, 0.72, 2); tree(b, 905, 1075, 0.95, 3); tree(b, 700, 1068, 0.5, 4);
  // the traveller: one person on the crest, looking up
  figure(b, 532, 1059, 1.32);
  // everything in the foreground hides the trains as they come down to the ground
  return b.raster((c) => {
    c.beginPath(); c.moveTo(ART.x0, 1062); c.bezierCurveTo(170, 1040, 330, 1046, 470, 1056); c.bezierCurveTo(600, 1064, 760, 1078, ART.x1, 1070);
    c.lineTo(ART.x1, ART.y1); c.lineTo(ART.x0, ART.y1); c.closePath(); c.fill();
    c.beginPath(); c.arc(150, 975, 70, 0, TAU); c.arc(905, 1015, 60, 0, TAU); c.fill();
  });
}

// a low-poly broadleaf tree: faceted canopy, each facet sprayed through its own frisket
function tree(b, x, yGround, s, seed) {
  const r = rng(seed * 77 + 5);
  const trunk = b.raster((c) => { c.beginPath(); c.moveTo(x - 6 * s, yGround); c.lineTo(x - 3.5 * s, yGround - 62 * s); c.lineTo(x + 3.5 * s, yGround - 62 * s); c.lineTo(x + 6 * s, yGround); c.closePath(); c.fill(); });
  b.spray(PAL.trunk, trunk, { grain: 0.3 });
  b.spray('#3e2a22', b.mulF(trunk, (u) => clamp((u - x + 2 * s) / (6 * s))), { grain: 0.5 });
  const cx = x, cy = yGround - 98 * s, R1 = 52 * s;
  // an irregular icosahedron silhouette split into facets
  const ring = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU - Math.PI / 2 + r() * 0.3; ring.push([cx + Math.cos(a) * R1 * (0.85 + r() * 0.25), cy + Math.sin(a) * R1 * 0.82 * (0.85 + r() * 0.2)]); }
  const mid = [cx - 6 * s + r() * 12 * s, cy - 8 * s + r() * 10 * s];
  const tones = ['#7f9d58', '#5f8247', '#4a6e3e', '#3c5c36', '#6b8f4e', '#55773f', '#86a35f'];
  for (let i = 0; i < 7; i++) {
    const a = ring[i], c2 = ring[(i + 1) % 7];
    const F = b.raster((c) => { c.beginPath(); c.moveTo(mid[0], mid[1]); c.lineTo(a[0], a[1]); c.lineTo(c2[0], c2[1]); c.closePath(); c.fill(); });
    // light comes from the spine overhead: upper facets light, lower facets deep
    const up = ((a[1] + c2[1]) / 2 - cy) / R1;
    const tone = up < -0.4 ? '#9bb56a' : up < 0 ? tones[(i + seed) % 3] : up < 0.45 ? '#4f7340' : '#36553a';
    b.spray(tone, F, { grain: 0.35 });
    b.spray('#2b4532', b.mulF(F, (u, v) => clamp((v - cy) / R1) * 0.55), { grain: 0.6 });
  }
  b.gouache('#cfdc9c', b.mul(b.ridge(b.raster((c) => { c.beginPath(); ring.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); }), 1.1), b.field((u, v) => clamp((cy - v) / R1 + 0.2))), { op: 0.55, dry: 0.4 });
}

function figure(b, x, y, s) {
  // a small traveller seen from behind, head tipped back to look at the land overhead
  const M = b.raster((c) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(-4.5, -26); c.lineTo(-1, -26); c.lineTo(-1.2, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(1.2, 0); c.lineTo(1, -26); c.lineTo(4.6, -26); c.lineTo(6, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-7.5, -24); c.bezierCurveTo(-9, -36, -8, -48, -5, -52); c.lineTo(5, -52); c.bezierCurveTo(8, -48, 9, -36, 7.5, -24); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-6.5, -50); c.lineTo(-10, -30); c.lineTo(-8, -29.5); c.lineTo(-4.8, -46); c.fill();
    c.beginPath(); c.moveTo(6.5, -50); c.lineTo(10, -30); c.lineTo(8, -29.5); c.lineTo(4.8, -46); c.fill();
    c.beginPath(); c.ellipse(0.4, -58.5, 4.6, 5.4, -0.25, 0, TAU); c.fill();
    c.restore();
  });
  b.spray(PAL.figure, M, { grain: 0.05 });
  b.gouache('#f3dfb4', b.mul(b.ridge(M, 0.9), b.field((u, v) => clamp((y - 40 * s - v) / (25 * s)))), { op: 0.8 });
}

// a small transparent board for the moving glints, painted with the same process
function glintSprite(b) {
  const size = Math.max(24, Math.round(34 * b.k * 2)) | 0;
  const g = new Paint.Board(size, size, { transparent: true, unit: 100, seed: 5, grainScale: b.gs });
  g.spray('#fff1c8', g.field((u, v) => 0.75 * Math.exp(-((u - 50) ** 2 + (v - 50) ** 2) / 190)), { grain: 0.4 });
  g.glint(50, 50, 30, '#fffbea', { bloom: 0, rays: 4, rot: 0.785, width: 0.07, core: 0.16 });
  return g.toCanvas();
}

function frame(ctx, t, k, L) {
  ctx.save();
  ctx.beginPath(); ctx.rect(ART.x0 * k, ART.y0 * k, ART.w * k, ART.h * k); ctx.clip();
  const fg = L.fgSample, r = R - 1060;
  const at = (a, z) => project([Math.sin(a) * r, -Math.cos(a) * r, z]);
  for (const tr of L.trains) {
    const a = tr.a0 + tr.w * t, p = at(a, tr.z);
    if (!p) continue;
    const vis = 1 - fg(p[0], p[1]);
    if (vis <= 0.02) continue;
    const scale = clamp(10000 / p[2], 0.45, 1.3);
    // the running light: a short fading trail along the ring behind the cars
    const dir = Math.sign(tr.w);
    ctx.lineCap = 'round';
    let prev = p;
    for (let j = 1; j <= 10; j++) {
      const q = at(a - dir * j * 0.0045, tr.z); if (!q) break;
      ctx.strokeStyle = `rgba(255,236,186,${(0.55 * (1 - j / 11) * vis).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.8, (2.6 - j * 0.16) * scale * k);
      ctx.beginPath(); ctx.moveTo(prev[0] * k, prev[1] * k); ctx.lineTo(q[0] * k, q[1] * k); ctx.stroke();
      prev = q;
    }
    // the cars themselves, catching the spine's light
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.1 + tr.a0 * 5);
    const sz = 46 * scale * pulse * k;
    ctx.globalAlpha = vis;
    ctx.drawImage(L.glint, p[0] * k - sz / 2, p[1] * k - sz / 2, sz, sz);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

Bureau.define({
  id: 'another-sky', seed: 101, still: 40, fps: 12,
  build(b) {
    const L = build(b);
    const fgM = L.fg, w = b.w, h = b.h, k = b.k;
    L.fgSample = (xu, yu) => { const x = Math.round(xu * k), y = Math.round(yu * k); if (x < 0 || y < 0 || x >= w || y >= h) return 1; return fgM[y * w + x]; };
    delete L.fg;
    return L;
  },
  frame,
});
})();

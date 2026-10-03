/*
 * The washes. Each layer is a map of pigment density on the sheet, painted the
 * way a plein-air watercolour is made, in order:
 *
 *   1  a warm then a cool underwash for the air, wet-in-wet, graded away from
 *      the light spine, with backruns where water crept back into it
 *   2  the far end wall, laid ring by ring so each band dried with an edge
 *   3  fields (one small wash per field of the explorer's 280 x 370 m grid),
 *      groves in dry brush, the lake with granulating blue and a hard shore
 *   4  towns as a granular stipple, nearer buildings as shapes with the roofs
 *      left as paper, the bridge, rings and luminaires reserved white
 *   5  shadow glazes for two light directions, a haze glaze for distance
 *   6  trees and dark accents last; a night glaze that the clock lays on top
 *
 * Effects are simulated, not filtered: pigment pools at the edge of a drying
 * wash (edge darkening), settles in the paper's tooth (granulation), skips the
 * valleys under a dry brush, and blooms where wet met damp. The washes are
 * slightly out of register with the pencil, as they are by hand.
 * Colour is not decided here: light.js picks pigments for the hour.
 */
(function (G) {
'use strict';
const { clamp, smoothstep, sampleTile, noiseTile, paperTile, blur, hash2, rng } = G.Paper;
const Wd = G.World;
const LAYERS = ['halo', 'warm', 'cool', 'cap', 'ochre', 'green', 'woods', 'water', 'town', 'front', 'side', 'shadeA', 'shadeB', 'haze', 'dark', 'tree', 'treeDark', 'sand', 'sienna', 'glow', 'night'];

function edgeDarken(D, w, h, r, k, tmp) {
  const b = Float32Array.from(D); blur(b, w, h, r, tmp);
  for (let i = 0; i < D.length; i++) { const e = D[i] - b[i]; if (e > 0) D[i] += k * e; }
}

async function build(ctx) {
  const { cam, B, F, W, H, scale, frame, yieldFn } = ctx;
  const N = W * H, S = scale;
  let last = performance.now();
  const T0 = performance.now(), mark = {}, lap = k => { mark[k] = Math.round(performance.now() - T0); };
  const maybeYield = async () => { if (yieldFn && performance.now() - last > 34) { await yieldFn(); last = performance.now(); } };

  // ── Tiles ────────────────────────────────────────────────────────────────
  const paper = ctx.paper || paperTile(512, Math.max(5, Math.round(6.5 * S)), 31);
  const nBig = noiseTile(256, 96, 4, 3), nMid = noiseTile(256, 28, 4, 5), nFine = noiseTile(128, 5, 2, 9), nWorld = noiseTile(256, 32, 4, 21);
  await maybeYield();
  const P = new Float32Array(N), Nb = new Float32Array(N), Nm = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    P[i] = paper.data[((y & 511) << 9) | (x & 511)];
    Nb[i] = sampleTile(nBig, x * 0.55 / S + 31, y * 0.55 / S + 7);
    Nm[i] = sampleTile(nMid, x * 0.8 / S, y * 0.8 / S);
  }
  await maybeYield();

  lap('tiles');
  // ── Window opening: panes between the taped bars ──────────────────────────
  const pane = new Float32Array(N);
  {
    const bars = frame.bars.map(b => ({ x0: b.x0 * S, x1: b.x1 * S, y0: b.y0 * S, y1: b.y1 * S }));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let m = 1;
      // Tape edges are straight but the paper fibres let a little paint creep under.
      const creep = (sampleTile(nFine, x * .7, y * .7) - .5) * 1.1 * S + (sampleTile(nMid, x * 3, y * 3) > .86 ? 1.6 * S : 0);
      for (const b of bars) {
        const dx = Math.max(b.x0 - x, x - b.x1), dy = Math.max(b.y0 - y, y - b.y1), d = Math.max(dx, dy);
        m = Math.min(m, clamp(d + creep + .5, 0, 1));
      }
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      m = Math.min(m, clamp(edge + .5 + creep * .5, 0, 1));
      pane[y * W + x] = m;
    }
  }
  await maybeYield();

  // ── Upsample the ray buffer, out of register with the pencil ─────────────
  const gw = B.gw, gh = B.gh;
  const A = { lake: new Float32Array(N), cap: new Float32Array(N), wat: new Float32Array(N), lt: new Float32Array(N), s: new Float32Array(N), z: new Float32Array(N), urb: new Float32Array(N), green: new Float32Array(N), h: new Float32Array(N), ns: new Float32Array(N), nz: new Float32Array(N), capR: new Float32Array(N) };
  const CIRC = Wd.CIRC;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = x + (Nb[i] - .5) * 3.2 * S, wy = y + (Nm[i] - .5) * 2.4 * S;
      let gx = (wx + .5) / W * gw - .5, gy = (wy + .5) / H * gh - .5;
      gx = clamp(gx, 0, gw - 1.001); gy = clamp(gy, 0, gh - 1.001);
      const ix = gx | 0, iy = gy | 0, u = gx - ix, v = gy - iy;
      const k00 = iy * gw + ix, k10 = k00 + 1, k01 = k00 + gw, k11 = k01 + 1;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      const kd = B.kind;
      A.cap[i] = (kd[k00] === 2) * w00 + (kd[k10] === 2) * w10 + (kd[k01] === 2) * w01 + (kd[k11] === 2) * w11;
      A.wat[i] = (kd[k00] === 1) * w00 + (kd[k10] === 1) * w10 + (kd[k01] === 1) * w01 + (kd[k11] === 1) * w11;
      const t00 = B.t[k00], t10 = B.t[k10], t01 = B.t[k01], t11 = B.t[k11];
      A.lt[i] = Math.log(t00) * w00 + Math.log(t10) * w10 + Math.log(t01) * w01 + Math.log(t11) * w11;
      const tmax = Math.max(t00, t10, t01, t11), tmin = Math.min(t00, t10, t01, t11);
      const same = kd[k00] === kd[k10] && kd[k00] === kd[k01] && kd[k00] === kd[k11];
      let s00 = B.s[k00], s10 = B.s[k10], s01 = B.s[k01], s11 = B.s[k11];
      if (Math.max(s00, s10, s01, s11) - Math.min(s00, s10, s01, s11) > CIRC / 2) { if (s00 < 0) s00 += CIRC; if (s10 < 0) s10 += CIRC; if (s01 < 0) s01 += CIRC; if (s11 < 0) s11 += CIRC; }
      if (same && tmax / tmin < 1.35) {
        A.s[i] = s00 * w00 + s10 * w10 + s01 * w01 + s11 * w11;
        A.z[i] = B.z[k00] * w00 + B.z[k10] * w10 + B.z[k01] * w01 + B.z[k11] * w11;
      } else {
        const kk = (u < .5 ? (v < .5 ? k00 : k01) : (v < .5 ? k10 : k11));
        A.s[i] = B.s[kk]; A.z[i] = B.z[kk];
      }
      A.urb[i] = B.urb[k00] * w00 + B.urb[k10] * w10 + B.urb[k01] * w01 + B.urb[k11] * w11;
      A.green[i] = B.green[k00] * w00 + B.green[k10] * w10 + B.green[k01] * w01 + B.green[k11] * w11;
      A.h[i] = B.h[k00] * w00 + B.h[k10] * w10 + B.h[k01] * w01 + B.h[k11] * w11;
      A.ns[i] = B.ns[k00] * w00 + B.ns[k10] * w10 + B.ns[k01] * w01 + B.ns[k11] * w11;
      A.nz[i] = B.nz[k00] * w00 + B.nz[k10] * w10 + B.nz[k01] * w01 + B.nz[k11] * w11;
      A.capR[i] = B.capR[k00] * w00 + B.capR[k10] * w10 + B.capR[k01] * w01 + B.capR[k11] * w11;
      A.lake[i] = Math.min(9, B.lake[k00]) * w00 + Math.min(9, B.lake[k10]) * w10 + Math.min(9, B.lake[k01]) * w01 + Math.min(9, B.lake[k11]) * w11;
    }
    await maybeYield();
  }

  lap('upsample');
  // ── Shapes: buildings, bridge, rings, luminaires, trees, trail, boats ─────
  const shapes = G.Shapes.rasterize(ctx, W, H, S);
  await maybeYield();

  lap('shapes');
  // ── Light geometry on the sheet ──────────────────────────────────────────
  const spine = F.lines.spine.flat(), capC = F.cap.center;
  let sp0 = spine[0], sp1 = spine[spine.length - 1];
  const spA = [sp0[0] * S, sp0[1] * S], spB = [sp1[0] * S, sp1[1] * S];
  const capCx = capC[0] * S, capCy = capC[1] * S;
  // Approximate radius of the end-wall disc on the sheet.
  let capRad = 0; for (const run of F.cap.rim) for (const p of run) capRad = Math.max(capRad, Math.hypot(p[0] * S - capCx, p[1] * S - capCy));
  capRad = Math.min(capRad, H);
  const distSeg = (px, py, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1; let t = ((px - a[0]) * vx + (py - a[1]) * vy) / l2; t = clamp(t, 0, 1); return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t); };
  const vpx = cam.vp[0] * S, vpy = cam.vp[1] * S;

  // Blooms (backruns): where water crept back into a drying wash.
  const r = rng(77), blooms = [];
  const lobes = k => { const rr = rng(500 + k), out = []; for (let f = 2; f <= 13; f++) out.push([f, rr() * 6.283, (.5 + rr()) / f]); return out; };
  for (let k = 0; k < 7; k++) blooms.push({ x: W * (.08 + r() * .84), y: H * (.04 + r() * .42), r: H * (.035 + r() * .07), seed: k, layer: 'cool' });
  for (let k = 0; k < 2; k++) blooms.push({ x: W * (.15 + r() * .7), y: H * (.1 + r() * .5), r: H * (.08 + r() * .06), seed: 20 + k, layer: 'night', soft: true });
  blooms.push({ x: vpx - W * .22, y: vpy + H * .02, r: H * .045, seed: 40, layer: 'water' });
  // Each backrun is painted once into its layer's map, over its own box only.
  const bloomMap = {};
  for (const b of blooms) {
    const M = bloomMap[b.layer] || (bloomMap[b.layer] = new Float32Array(N).fill(1));
    const lb = lobes(b.seed), lut = new Float32Array(720); for (let k = 0; k < 720; k++) { const a = k / 720 * 6.283185; for (const [fr, ph, am] of lb) lut[k] += Math.sin(a * fr + ph) * am; }
    const kIn = b.soft ? .86 : .58, kEdge = b.soft ? .25 : 1.0, ext = b.r * 1.7;
    const x0 = Math.max(0, Math.floor(b.x - ext)), x1 = Math.min(W - 1, Math.ceil(b.x + ext)), y0 = Math.max(0, Math.floor(b.y - ext)), y1 = Math.min(H - 1, Math.ceil(b.y + ext));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy); if (d > ext) continue;
      const ai = ((Math.atan2(dy, dx) / 6.283185 + 1) * 720 | 0) % 720, wob = lut[ai];
      const rr = b.r * (1 + .32 * wob + .1 * (sampleTile(nFine, x * 1.3 / S + b.seed * 9, y * 1.3 / S) - .5) * 2 + .06 * (sampleTile(nMid, x * 4, y * 4) - .5));
      const q = d / rr, i = y * W + x;
      if (q < 1) M[i] *= kIn + (1 - kIn) * q * q * q + kEdge * Math.exp(-(((1 - q) * rr / (1.4 * S)) ** 2));
      else M[i] *= 1 + kEdge * .5 * Math.exp(-(((q - 1) * rr / (1.1 * S)) ** 2));
    }
  }
  const bloomAt = (layer, i) => { const M = bloomMap[layer]; return M ? M[i] : 1; };

  // ── Per-pixel washes ─────────────────────────────────────────────────────
  const L = {}; for (const name of LAYERS) L[name] = new Float32Array(N);
  const reserveAll = new Float32Array(N), glowM = new Float32Array(N);
  const sAbs0 = cam.s0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, pm = pane[i];
      if (pm <= 0) continue;
      const t = Math.exp(A.lt[i]), fog = 1 - Math.exp(-Math.pow(t / 17000, 1.15)), p = P[i], nb = Nb[i], nm = Nm[i];
      const nf = sampleTile(nFine, x * .9 / S, y * .9 / S);
      // Crisp, slightly ragged masks from the soft buffer.
      const capM = smoothstep(.42, .58, A.cap[i] + (nf - .5) * .18);
      const watM = (1 - capM) * smoothstep(.40, .60, A.wat[i] + (nf - .5) * .22 + (nm - .5) * .1);
      const landM = (1 - capM) * (1 - watM);
      const dSp = distSeg(x, y, spA, spB) / H, dCap = Math.hypot(x - capCx, y - capCy) / H;
      const dL = Math.min(dSp * 1.15, dCap * .75);

      // 1. The air: warm near the light, cooling away from it.
      const warm = (.04 + .22 * smoothstep(.012, .2, dL)) * (1 - .5 * smoothstep(.3, .9, dL)) * (.78 + .44 * nb);
      const cool = (.08 + .5 * smoothstep(.12, .75, dL)) * (.72 + .56 * Nb[(i + 9137) % N]) * (.35 + .65 * Math.max(fog, capM)) * bloomAt('cool', i);
      L.warm[i] = warm; L.cool[i] = cool;
      // The spine and its core glow stay paper.
      const core = Math.max(0, 1 - dSp * H / (1.5 * S + Math.min(2.2 * S, dCap * H * .004)));
      reserveAll[i] = clamp(core * 1.4, 0, 1);
      // The air around the spine and the end wall's hub glows: the painter leaves it light.
      const dHub = Math.hypot(x - capCx, y - capCy) / H;
      const capRH = capRad / H, disc = Math.exp(-((dHub / (capRH * .95)) ** 2)), spn = .6 * Math.exp(-((dSp / .012) ** 2)) + .22 * Math.exp(-((dSp / .07) ** 2));
      const gRaw = clamp(Math.max(disc * .85 + .35 * Math.exp(-((dHub / .04) ** 2)), spn), 0, 1) * (.85 + .3 * nb);
      glowM[i] = clamp(gRaw * (.35 + .65 * Math.max(fog, capM)), 0, 1);
      L.halo[i] = clamp(Math.max(disc * .9 + .3 * Math.exp(-((dHub / .04) ** 2)), spn * .55), 0, 1) * (.7 + .3 * Nm[i]);

      // 2. End wall, ring by ring.
      if (capM > 0) {
        const cr = A.capR[i], band = Math.floor(cr * 12), fr = cr * 12 - band;
        const ringEdge = Math.exp(-(((1 - fr) * capRad / 12 / (1.1 * S)) ** 2));
        const hub = smoothstep(.01, .16, cr);
        L.cap[i] = capM * (.12 + .3 * Math.pow(cr, 1.5) + (band % 2) * .035) * hub * (1 + .5 * ringEdge) * (.85 + .3 * nm);
      }

      // 3. Land: one wash per field, groves, the lake.
      if (landM > 0 || watM > 0) {
        const s = A.s[i] + sAbs0, z = A.z[i];
        const ww = sampleTile(nWorld, s / 140, z / 140) - .5;
        const su = (s + ww * 70) / 280, zu = (z + ww * 90) / 370;
        const ci = Math.floor(su), cj = Math.floor(zu);
        const ft = Wd.fract(Math.sin(ci * 127.1 + cj * 311.7) * 43758.5453), h1 = hash2(ci, cj, 3), h2 = hash2(ci, cj, 8);
        const gr = A.green[i], u = A.urb[i], near = 1 - smoothstep(150, 1800, t);
        // How big a field is on the sheet, and how far this pixel is from its edge.
        const xr = Math.min(x + 1, W - 1), yd = Math.min(y + 1, H - 1);
        const gsu = Math.hypot(((A.s[y * W + xr] - A.s[i]) / 280), ((A.s[yd * W + x] - A.s[i]) / 280)) + 1e-6;
        const gzu = Math.hypot(((A.z[y * W + xr] - A.z[i]) / 370), ((A.z[yd * W + x] - A.z[i]) / 370)) + 1e-6;
        const fs = su - ci, fz = zu - cj, dpx = Math.min(Math.min(fs, 1 - fs) / gsu, Math.min(fz, 1 - fz) / gzu);
        const cellPx = 1 / Math.max(gsu, gzu);
        const edgeOn = smoothstep(5 * S, 16 * S, cellPx);
        let edgeF = 1 + .7 * Math.exp(-dpx / (1.25 * S)) * edgeOn;
        if (h1 < .38) edgeF *= 1 - (1 - smoothstep(.15 * S, .95 * S, dpx)) * edgeOn;   // a hairline of paper between fields
        const aerial = 1 - .88 * Math.pow(fog, .9), nearer = 1 - smoothstep(50, 520, t), nb2 = Nb[(i * 7 + 3311) % N];
        const harvested = h2 > .8 && h2 <= .93, tilled = h2 > .93;
        let och = (.12 + .36 * ft + (harvested ? .32 : 0) + nearer * (.3 * (nb2 - .35) + .1)) * aerial;
        let grn = (.26 + .26 * h1 + .38 * (.52 - gr) * (1 - .75 * fog) + (harvested ? -.2 : tilled ? -.24 : 0) + nearer * (.25 * (.62 - nb2) + .16)) * aerial;
        // Dry brush near the house: paint catches only the tops of the tooth.
        const dry = near * .55;
        const dryMask = 1 - dry + dry * smoothstep(.22, .4, p * .55 + sampleTile(nMid, x * .35 / S + 17, y * 2.6 / S) * .6);
        const mott = 1 + (nm - .5) * .36 * (1 - .65 * fog);
        const fore = 1 - smoothstep(25, 260, t);
        grn += fore * .28; och += fore * .06;
        L.ochre[i] = landM * Math.max(0, och) * edgeF * dryMask * mott;
        L.green[i] = landM * Math.max(0, grn) * edgeF * dryMask * mott;
        if (tilled) L.sienna[i] += landM * .3 * aerial * edgeF * mott * (1 - smoothstep(.3, .5, u));
        // Groves where the explorer's greenery runs dark, broken at the edge.
        const wv = sampleTile(nWorld, s / 420 + 50, z / 420) - .5;
        const woods = smoothstep(.43, .33, gr + wv * .16) * (1 - smoothstep(.35, .5, u)) * smoothstep(8, 20, A.h[i]);
        if (woods > 0) {
          const dab = smoothstep(.30, .62, p * .6 + sampleTile(nFine, x * .6 / S + 9, y * .6 / S) * .6 + nm * .2);
          L.woods[i] = landM * woods * (.38 + .5 * dab) * Math.pow(1 - fog, 2);
        }
        // Towns far away: a granular stipple of roofs (paper) and walls (grey).
        const town = smoothstep(.3, .62, u + (sampleTile(nWorld, s / 700 + 20, z / 700 + 40) - .5) * .4) * landM;
        if (town > 0) {
          const bx = Math.floor(s / 64), bz = Math.floor(z / 80), hb = hash2(bx, bz, 17);
          const cell64 = 64 / Math.max(1e-3, Math.abs(A.s[y * W + xr] - A.s[i]) + Math.abs(A.s[yd * W + x] - A.s[i]));
          const resolved = smoothstep(1.2 * S, 3.5 * S, cell64);
          const built = hb < .35 + .5 * u ? 1 : 0;
          const grain = resolved * (built ? (.62 + .3 * p) : .08) + (1 - resolved) * (.25 + .55 * smoothstep(.25, .75, p * .7 + nf * .5));
          const fade = smoothstep(5500, 8500, t);
          L.town[i] = town * grain * (1 - .8 * Math.pow(fog, .9)) * fade + town * (1 - fade) * .1;
          L.ochre[i] *= 1 - .6 * town; L.green[i] *= 1 - .8 * town; L.woods[i] *= 1 - town;
        }
        // The lake: granulating blue, darker in the deep, a hard pooled shore.
        if (watM > 0) {
          const depth = smoothstep(-.02, -.55, A.lake[i]);
          const wind = smoothstep(.58, .86, sampleTile(nMid, x * .045 / S + 40, y * .9 / S));
          let wd = (.4 + .45 * depth + .14 * (nm - .5) - .2 * wind * (1 - fog)) * (1 - .74 * Math.pow(fog, .9)) * bloomAt('water', i);
          // The end wall and spine reflected straight ahead: broken dry-brush light.
          const below = y > vpy ? 1 : 0;
          const refl = below * Math.exp(-(((x - capCx) / (capRad * .62)) ** 2)) * Math.exp(-(((y - vpy) / (H * .09)) ** 2));
          const streak = sampleTile(nFine, x * .12 / S, y * 3.5 / S);
          const sparkle = smoothstep(.62, .8, p * .45 + streak * .7);
          wd *= 1 - refl * (.45 + .5 * sparkle);
          if (refl * sparkle > .62) reserveAll[i] = Math.max(reserveAll[i], clamp((refl * sparkle - .62) * 5, 0, 1));
          L.water[i] = watM * Math.max(0, wd);
        }
        // Terrain modelling for two light directions (morning from the far end,
        // evening from behind the house), relief exaggerated as a painter would.
        const ex = 3.2, nx = -A.ns[i] * ex, nzz = -A.nz[i] * ex, nl = Math.hypot(nx, nzz, 1);
        const ce = Math.cos(.62), se = Math.sin(.62);
        const dotA = (-nzz * ce + se) / nl, dotB = (nzz * ce + se) / nl;
        const flat = se;
        const relief = Math.pow(1 - fog, 1.2);
        L.shadeA[i] = landM * clamp((flat - dotA) * 2.2, 0, .9) * relief * (.8 + .4 * nm);
        L.shadeB[i] = landM * clamp((flat - dotB) * 2.2, 0, .9) * relief * (.8 + .4 * nm);
        const foreS = (1 - smoothstep(20, 200, t)) * landM * (.7 + .5 * nm); L.shadeA[i] += foreS * .55; L.shadeB[i] += foreS * .55;
        // Haze: distance turns the land blue-grey.
        L.haze[i] = (landM + watM) * Math.pow(fog, 1.2) * .42 * (.85 + .3 * nb);
        // City glow for the night: the far shore's lamps light their own air.
        L.glow[i] = smoothstep(.3, .85, u + (sampleTile(nWorld, s / 700 + 20, z / 700 + 40) - .5) * .5) * smoothstep(5000, 14000, t) * (landM + watM * .3) * .55;
      }
      L.haze[i] += capM * .12;
      // Night: one dark glaze, laid evenly but never perfectly.
      L.night[i] = (.9 + .25 * nb + .08 * (nm - .5)) * bloomAt('night', i) * (1 - .3 * L.glow[i]);
    }
    await maybeYield();
  }

  lap('washes');
  // ── Shapes into the washes ───────────────────────────────────────────────
  {
    const { res, sand, lum, front, side, dark, canopy, canopyDark, trunk, mGreen, mOchre, mSienna } = shapes;
    for (let i = 0; i < N; i++) {
      const rl = Math.max(res[i], lum[i]);
      if (rl > 0) { const k = 1 - rl; L.ochre[i] *= k; L.green[i] *= k; L.woods[i] *= k; L.water[i] *= k; L.town[i] *= k; L.shadeA[i] *= k; L.shadeB[i] *= k; L.haze[i] *= 1 - rl * .55; L.cool[i] *= 1 - rl * .5; }
      const solid = Math.max(front[i], side[i], sand[i]);
      if (solid > 0) { const k = 1 - solid; L.ochre[i] *= k; L.green[i] *= k; L.woods[i] *= k; L.water[i] *= k; L.town[i] *= k; }
      L.front[i] = front[i] * .8; L.side[i] = side[i] * .85;
      if (front[i] + side[i] > .05) { L.haze[i] *= .4; L.cool[i] *= .6; }
      L.sand[i] = sand[i] * .32;
      L.dark[i] = dark[i] + trunk[i] * .9;
      // Meadow strokes, only on the near ground.
      if (mGreen[i] + mOchre[i] + mSienna[i] > 0) {
        const nearM = (1 - smoothstep(500, 1300, Math.exp(A.lt[i]))) * (1 - A.wat[i]) * (1 - A.cap[i]);
        const dryB = .45 + .55 * smoothstep(.3, .55, P[i] + (Nm[i] - .5) * .4);
        L.green[i] += mGreen[i] * nearM * .9 * dryB; L.ochre[i] += mOchre[i] * nearM * .8 * dryB; L.sienna[i] += mSienna[i] * nearM * .7 * dryB;
      }
      L.tree[i] = canopy[i];
      L.treeDark[i] = canopyDark[i];
      if (canopy[i] > 0) { const k = 1 - Math.min(1, canopy[i] * 1.6); L.ochre[i] *= .4 + .6 * k; L.green[i] *= .5 + .5 * k; L.sienna[i] *= k; L.water[i] *= k; L.town[i] *= k; L.front[i] *= k; L.side[i] *= k; L.haze[i] *= k; L.cool[i] *= .4 + .6 * k; }
    }
  }
  await maybeYield();

  // ── Edges, granulation, unevenness ───────────────────────────────────────
  const tmp = new Float32Array(N);
  edgeDarken(L.water, W, H, 2.2 * S, .9, tmp); await maybeYield();
  edgeDarken(L.woods, W, H, 1.6 * S, .7, tmp); await maybeYield();
  edgeDarken(L.tree, W, H, 1.8 * S, .8, tmp); await maybeYield();
  blur(L.treeDark, W, H, 2.6 * S, tmp); for (let i = 0; i < N; i++) L.treeDark[i] *= smoothstep(.02, .25, L.tree[i]); await maybeYield();
  edgeDarken(L.front, W, H, 1.0 * S, .5, tmp);
  edgeDarken(L.cool, W, H, 2.5 * S, .5, tmp); await maybeYield();
  // Wet-in-wet softness for the air.
  blur(L.warm, W, H, 6 * S, tmp); blur(L.glow, W, H, 7 * S, tmp); blur(L.halo, W, H, 3 * S, tmp); await maybeYield();
  const gran = { halo: .05, sienna: .3, warm: .04, cool: .14, cap: .22, ochre: .16, green: .08, woods: .2, water: .24, town: .45, front: .25, side: .25, shadeA: .42, shadeB: .42, haze: .14, dark: .15, tree: .12, treeDark: .2, sand: .25, glow: .05, night: .22 };
  // Ultramarine-like pigments also flocculate into small clumps.
  const floc = { water: .14, cool: .12, night: .18, haze: .1, shadeA: .12, shadeB: .12, cap: .1 };
  const nFloc = noiseTile(128, 3, 2, 41);
  for (const name of LAYERS) {
    const D = L[name], g = gran[name] || 0, fl = floc[name] || 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let d = D[i]; if (d <= 0) { D[i] = 0; continue; }
      d *= 1 + g * (.5 - P[i]) * 2;
      if (fl) d *= 1 + fl * (sampleTile(nFloc, x * .8, y * .8) - .5) * 2;
      D[i] = d * pane[i];
    }
    await maybeYield();
  }
  for (let i = 0; i < N; i++) reserveAll[i] *= pane[i];

  lap('effects');
  // ── Quantize ─────────────────────────────────────────────────────────────
  const Q = {};
  for (const name of LAYERS) { const D = L[name], q = new Uint8Array(N); for (let i = 0; i < N; i++) { const v = D[i] * 100; q[i] = v > 255 ? 255 : v < 0 ? 0 : v; } Q[name] = q; }
  const keep = new Uint8Array(N); for (let i = 0; i < N; i++) keep[i] = Math.round((1 - reserveAll[i]) * 255);
  // Cockle: the sheet buckled where it was wettest; raking light shows it.
  const cockle = new Float32Array(N), paneQ = new Uint8Array(N);
  { const nC = noiseTile(64, 22, 2, 61); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, u = x / W * 3.1, v = y / H * 3.6; const c0 = sampleTile(nC, u * 4, v * 4), c1 = sampleTile(nC, u * 4 + .25, v * 4), c2 = sampleTile(nC, u * 4, v * 4 + .25); cockle[i] = 1 + ((c1 - c0) * -1.0 + (c2 - c0) * -.7) * .9 + (P[i] - .5) * .035; paneQ[i] = pane[i] * 255; } }

  const glowQ = new Uint8Array(N); for (let i = 0; i < N; i++) glowQ[i] = clamp(glowM[i], 0, 1) * 255;
  lap('done'); G.__paintMarks = mark;
  return { W, H, S, layers: Q, names: LAYERS, keep, glow: glowQ, cockle, pane: paneQ, paper, capCenter: [capCx, capCy], capRad, vp: [vpx, vpy] };
}

G.Paint = { build, LAYERS };
})(typeof window !== 'undefined' ? window : globalThis);

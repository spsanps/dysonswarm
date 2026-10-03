/* No. 03 · The Wheel (not open yet). A Stanford torus, after the 1975 NASA Ames / Stanford
   summer study: a ring 1.8 km across that turns once a minute for about one g, with a big
   stationary mirror above the hub. Living thing: the wheel turns at that real rate, keyed to
   the visitor's clock, so a spoke comes round to the same place at the top of every minute.
   The torus, hub and mirror are ray-marched once into masks and sprayed coat by coat; each
   frame only re-lays the moving parts (spokes, hull ribs, the land seen through the windows). */
(function () {
'use strict';
const { clamp, lerp, smooth, fbm, vnoise, rng, TAU, hex, mixc } = Paint;
const { ART, INK } = Kit;

const RM = 900, RT = 92;                       // ring radius and (slightly fattened) tube radius, metres
const HUB_R = 120, HUB_H = 170;
const MIR = { c: [0, 820, 0], r: 700, tilt: 0.62, th: 6 };
const OMEGA = TAU / 60;                        // one turn a minute
const WITH_MIRROR = false;                     // the 1975 design's big mirror hid the wheel; left out
const CAMD = 4700, ELEV = 0.52, AZ = 0.38, TARGET = [0, 0, 0], F = 2020;
const CX = ART.cx + 26, CY = 610;
const SUN = (() => { const v = [-0.62, 0.52, 0.58]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const EYE = [TARGET[0] + CAMD * Math.cos(ELEV) * Math.sin(AZ), TARGET[1] + CAMD * Math.sin(ELEV), TARGET[2] + CAMD * Math.cos(ELEV) * Math.cos(AZ)];
const FW = norm3(sub3(TARGET, EYE)), RT3 = norm3(cross3(FW, [0, 1, 0])), UP = cross3(RT3, FW);
function project(P) {
  const d = sub3(P, EYE), z = dot3(d, FW);
  return [CX + F * dot3(d, RT3) / z, CY - F * dot3(d, UP) / z, z];
}
// mirror frame: tilted about the x axis
const MN = norm3([0, Math.cos(MIR.tilt), Math.sin(MIR.tilt)]);
const MU = norm3(cross3(MN, [1, 0, 0])), MV = cross3(MN, MU);

// ---- signed distances ----
function sdTorus(p) { const q = Math.hypot(p[0], p[2]) - RM; return Math.hypot(q, p[1]) - RT; }
function sdHub(p) {
  const dr = Math.hypot(p[0], p[2]) - HUB_R, dy = Math.abs(p[1]) - HUB_H;
  return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
}
function sdMast(p) {
  const dr = Math.hypot(p[0], p[2]) - 26, dy = Math.abs(p[1] - (HUB_H + MIR.c[1]) / 2) - (MIR.c[1] - HUB_H) / 2;
  return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
}
function sdMirror(p) {
  const d = sub3(p, MIR.c), n = dot3(d, MN), pu = dot3(d, MU), pv = dot3(d, MV);
  const dr = Math.hypot(pu, pv) - MIR.r, dn = Math.abs(n) - MIR.th;
  return Math.min(Math.max(dr, dn), 0) + Math.hypot(Math.max(dr, 0), Math.max(dn, 0));
}
function scene(p) {
  let d = sdTorus(p), id = 1;
  const h = sdHub(p); if (h < d) { d = h; id = 2; }
  if (WITH_MIRROR) {
    const m = sdMast(p); if (m < d) { d = m; id = 3; }
    const r = sdMirror(p); if (r < d) { d = r; id = 4; }
  }
  return [d, id];
}
function normalAt(p) {
  const e = 1.5;
  const dx = scene([p[0] + e, p[1], p[2]])[0] - scene([p[0] - e, p[1], p[2]])[0];
  const dy = scene([p[0], p[1] + e, p[2]])[0] - scene([p[0], p[1] - e, p[2]])[0];
  const dz = scene([p[0], p[1], p[2] + e])[0] - scene([p[0], p[1], p[2] - e])[0];
  return norm3([dx, dy, dz]);
}

function march(b) {
  const { w, h, k, N } = b;
  const ID = new Uint8Array(N), COV = new Float32Array(N), LAM = new Float32Array(N), SPEC = new Float32Array(N), PHI = new Float32Array(N), PSI = new Float32Array(N),
    REFL = new Float32Array(N), OCC = new Float32Array(N), NY = new Float32Array(N);
  const x0 = Math.floor(ART.x0 * k), x1 = Math.ceil(ART.x1 * k), y0 = Math.floor(ART.y0 * k), y1 = Math.ceil(ART.y1 * k);
  const pix = 1 / (F * k); // ray spread per pixel
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const a = ((x + 0.5) / k - CX) / F, c = -((y + 0.5) / k - CY) / F;
    const dir = norm3([FW[0] + a * RT3[0] + c * UP[0], FW[1] + a * RT3[1] + c * UP[1], FW[2] + a * RT3[2] + c * UP[2]]);
    // quick reject against the bounding sphere
    const oc = sub3(EYE, [0, 0, 0]), bq = dot3(oc, dir), cq = dot3(oc, oc) - 1100 * 1100;
    if (bq * bq - cq < 0) continue;
    let t = Math.max(0, -bq - Math.sqrt(bq * bq - cq)), minr = 1e9, hit = 0, id = 0;
    for (let s = 0; s < 140; s++) {
      const p = [EYE[0] + dir[0] * t, EYE[1] + dir[1] * t, EYE[2] + dir[2] * t];
      const [d, i] = scene(p);
      const r = d / (t * pix);
      if (r < minr) { minr = r; id = i; }
      if (d < 0.25) { hit = 1; break; }
      t += Math.max(d * 0.9, 0.5);
      if (t > CAMD + 2500) break;
    }
    const cov = hit ? 1 : clamp(0.5 - minr * 0.5);
    if (cov <= 0) continue;
    const i = y * w + x;
    COV[i] = cov; ID[i] = id;
    const p = [EYE[0] + dir[0] * t, EYE[1] + dir[1] * t, EYE[2] + dir[2] * t];
    const n = normalAt(p);
    LAM[i] = dot3(n, SUN);
    const hv = norm3([SUN[0] - dir[0], SUN[1] - dir[1], SUN[2] - dir[2]]);
    SPEC[i] = Math.pow(clamp(dot3(n, hv)), 40);
    NY[i] = n[1];
    if (id === 1) {
      PHI[i] = Math.atan2(p[2], p[0]);
      PSI[i] = Math.atan2(p[1], Math.hypot(p[0], p[2]) - RM);
    }
    if (id === 4) { const rf = sub3(dir, n.map((v) => v * 2 * dot3(dir, n))); REFL[i] = rf[1]; }
    // does this surface hide things lying in the wheel's plane (y = 0)?
    if (dir[1] !== 0) { const tp = (0 - EYE[1]) / dir[1]; OCC[i] = tp > 0 && t < tp ? cov : 0; }
  }
  return { ID, COV, LAM, SPEC, PHI, PSI, REFL, OCC, NY, box: [x0, y0, x1, y1] };
}

// the land seen through the window band, as a strip around the ring
function interiorStrip(n) {
  const r = rng(303), out = new Array(n);
  const greens = ['#7c9b55', '#94ad60', '#5f8048', '#a9b86a'], water = '#4f8f8a', town = '#ece2c8';
  let i = 0;
  while (i < n) {
    const len = 10 + ((r() * 40) | 0), roll = r();
    const col = roll < 0.16 ? water : roll < 0.34 ? town : greens[(r() * greens.length) | 0];
    for (let j = 0; j < len && i < n; j++, i++) out[i] = hex(col);
  }
  return out;
}

function build(b) {
  const { w, k, N } = b;
  const W = Kit.windowMask(b);
  const bx = [ART.x0, ART.y0, ART.x1, ART.y1];
  // ---- space: warm plum, a faint rose glow where the sunlight comes from ----
  b.spray('#2a1a2a', W, { grain: 0.06 });
  b.spray('#4a2840', b.mulF(W, (u, v) => smooth(ART.y0, ART.y1, v) * 0.8), { grain: 0.1 });
  b.spray('#8a4a55', b.mulF(W, (u, v) => 0.55 * Math.exp(-(((u - 60) / 520) ** 2 + ((v - 160) / 520) ** 2))), { grain: 0.12 });
  b.spray('#d3866a', b.mulF(W, (u, v) => 0.35 * Math.exp(-(((u - 40) / 300) ** 2 + ((v - 120) / 300) ** 2))), { grain: 0.15 });
  b.spatter('#fff3dc', bx, 520, 0.8, 2.6, { accept: (u, v) => 0.4 + 0.6 * smooth(200, 900, Math.hypot(u - 60, v - 140)), aMin: 0.5, aMax: 1, pow: 3.5 });
  for (const [x, y, s] of [[836, 178, 9], [128, 760, 7], [900, 1010, 6], [690, 92, 5]]) b.glint(x, y, s, '#fff6e2', { bloom: 0.4, rays: 4, rot: 0.785, width: 0.06 });

  // ---- Earth and Moon, far off: small crescents lit from the same Sun ----
  planet(b, W, 214, 1046, 34, ['#1f2c40', '#4f7ea0', '#d6eef0'], true);
  planet(b, W, 830, 196, 11, ['#3a2e34', '#9a8c84', '#efe4d2'], false);

  // ---- the wheel, the hub, the mirror: ray-marched into masks ----
  const S = march(b);
  const { ID, COV, LAM, SPEC, PHI, PSI, REFL, NY } = S;
  const mk = (fn) => { const M = b.zero(); for (let i = 0; i < N; i++) if (COV[i]) M[i] = COV[i] * fn(i); return M; };
  const HULL = mk((i) => (ID[i] === 1 || ID[i] === 2 || ID[i] === 3 ? 1 : 0));
  const MIRR = mk((i) => (ID[i] === 4 ? 1 : 0));
  const BAND = mk((i) => (ID[i] === 1 ? smooth(2.25, 2.55, Math.abs(PSI[i])) : 0));
  // hull: shadow coat, then light built up with the Lambert term, then a sprayed specular
  b.spray('#3b2a39', HULL, { grain: 0.06 });
  b.spray('#7b5f66', b.mul(HULL, mk((i) => smooth(-0.15, 0.3, LAM[i]))), { grain: 0.2 });
  b.spray('#c8b29c', b.mul(HULL, mk((i) => smooth(0.15, 0.65, LAM[i]))), { grain: 0.2 });
  b.spray('#f6e7cb', b.mul(HULL, mk((i) => smooth(0.55, 0.95, LAM[i]) * 0.9)), { grain: 0.2 });
  b.spray('#a85a5c', b.mul(HULL, mk((i) => smooth(0.1, -0.6, LAM[i]) * smooth(-0.2, -0.9, NY[i]) * 0.55)), { grain: 0.3 });
  b.spray('#fff8e8', b.mul(HULL, mk((i) => SPEC[i])), { grain: 0.15 });
  // the window band on the inside of the ring: deep glass, lit later by the moving land
  b.spray('#2c3a3a', BAND, { grain: 0.1 });
  b.spray('#5d7f66', b.mul(BAND, mk((i) => 0.5 + 0.5 * smooth(-0.3, 0.6, LAM[i]))), { grain: 0.25, op: 0.6 });
  // the mirror: airbrushed chrome, a dark sky above a hard horizon and a bright band below
  b.spray('#2e2232', MIRR, { grain: 0.06 });
  b.spray('#7c4f68', b.mul(MIRR, mk((i) => smooth(0.9, -0.1, REFL[i]))), { grain: 0.2 });
  b.spray('#f2b98a', b.mul(MIRR, mk((i) => smooth(0.12, -0.02, REFL[i]))), { grain: 0.15 });
  b.spray('#fff4dc', b.mul(MIRR, mk((i) => smooth(0.02, -0.06, REFL[i]) * smooth(-0.35, -0.08, REFL[i]))), { grain: 0.1 });
  b.spray('#3a2533', b.mul(MIRR, mk((i) => smooth(-0.3, -0.7, REFL[i]) * 0.8)), { grain: 0.2 });
  b.gouache('#fff6e3', b.ridge(MIRR, 1.0), { op: 0.7 });
  // the gouache catch-light along the sunward edge of the hull
  b.gouache('#fff3da', b.mul(b.ridge(HULL, 1.2), mk((i) => smooth(0.45, 0.85, LAM[i]))), { op: 0.75, dry: 0.25 });
  // hub detail: dark seams round the drum
  const seams = [];
  for (const yy of [-HUB_H * 0.55, 0, HUB_H * 0.55]) { const pts = []; for (let i = 0; i <= 60; i++) { const a = (i / 60) * TAU; const p = project([Math.cos(a) * (HUB_R + 1), yy, Math.sin(a) * (HUB_R + 1)]); const nz = Math.cos(a) * FW[0] + Math.sin(a) * FW[2]; pts.push([p[0], p[1], nz < 0 ? 1.4 : 0]); } seams.push(pts); }
  b.gouache('#3b2a39', b.mul(b.strokeMask(seams), HULL), { op: 0.55 });
  // docking lights on the hub
  const H0 = project([0, -HUB_H, 0]);
  b.glint(H0[0], H0[1] + 2, 7, '#ffe3b0', { bloom: 0.6, rays: 4, rot: 0.785, width: 0.06 });
  // a ferry on its way in along the axis, below the hub
  const fP = project([-330, -HUB_H - 420, 260]);
  ferry(b, fP[0], fP[1]);

  Kit.band(b, {
    no: '03', open: false, title: 'The Wheel',
    titleStyle: { top: '#c56f73', bottom: '#4a2a44', band: '#f2b08e', shadow: INK.plum },
    line: 'A STANFORD TORUS · 1.8 KM ACROSS · ONE TURN A MINUTE',
  });

  // ---- data for the living frame ----
  const list = [];
  for (let i = 0; i < N; i++) if (ID[i] === 1 && COV[i] > 0.02) list.push(i);
  const n = list.length, idx = new Int32Array(list), phi = new Float32Array(n), band = new Float32Array(n), shade = new Float32Array(n), cov = new Float32Array(n), occ = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const i = list[j]; phi[j] = PHI[i]; band[j] = smooth(2.3, 2.6, Math.abs(PSI[i])) * COV[i];
    shade[j] = 0.55 + 0.45 * smooth(-0.4, 0.7, LAM[i]); cov[j] = COV[i];
  }
  let bx0 = w, by0 = b.h, bx1 = 0, by1 = 0;
  for (const i of list) { const x = i % w, y = (i / w) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  // occluders for the spokes: anything nearer than the wheel's plane
  const occCv = document.createElement('canvas'); occCv.width = w; occCv.height = b.h;
  { const c = occCv.getContext('2d'), img = c.createImageData(w, b.h); for (let i = 0; i < N; i++) img.data[i * 4 + 3] = Math.round(S.OCC[i] * 255); c.putImageData(img, 0, 0); }
  const grain = b.grain;
  return { idx, phi, band, shade, cov, n, box: [bx0, by0, bx1 + 1, by1 + 1], strip: interiorStrip(720), occCv, grain, tmp: null, w };
}

function planet(b, W, x, y, r, cols, atmo) {
  const bxp = [x - r - 12, y - r - 12, x + r + 12, y + r + 12];
  const D = b.mul(b.field((u, v) => clamp(r - Math.hypot(u - x, v - y) + 0.5), bxp), W);
  const lit = (u, v) => { const nx = (u - x) / r, ny = (v - y) / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); return -nx * 0.78 - ny * 0.42 - nz * 0.3 + 0.1; };
  b.spray(cols[0], D, { grain: 0.05 });
  b.spray(cols[1], b.mulF(D, (u, v) => smooth(-0.1, 0.35, lit(u, v))), { grain: 0.15 });
  b.spray(cols[2], b.mulF(D, (u, v) => smooth(0.3, 0.75, lit(u, v))), { grain: 0.15 });
  if (atmo) {
    b.spray('#f0f6ee', b.mulF(D, (u, v) => smooth(0.55, 0.75, fbm(u / 6, v / 4, 17, 3)) * smooth(0.25, 0.6, lit(u, v)) * 0.8), { grain: 0.2 });
    b.spray('#e8a07a', b.mulF(D, (u, v) => Math.exp(-(((lit(u, v) - 0.18) / 0.09) ** 2)) * 0.5), { grain: 0.25 });
    b.spray('#9fd0e0', b.mul(b.blur(b.mulF(b.ridge(D, 1.4), (u, v) => smooth(0.05, 0.5, lit(u, v))), 1.6), W), { op: 0.8, grain: 0.2 });
  }
}

function ferry(b, x, y) {
  const M = b.raster((c) => { c.beginPath(); c.ellipse(x, y, 8, 19, 0.35, 0, TAU); c.fill(); c.save(); c.translate(x, y); c.rotate(0.35); c.fillRect(-14, 8, 28, 3.5); c.restore(); }, [x - 22, y - 26, x + 22, y + 26]);
  b.spray('#4a3442', M, { grain: 0.05 });
  b.spray('#e8d6bc', b.mulF(M, (u) => smooth(x + 4, x - 4, u)), { grain: 0.15 });
  b.glint(x - 1, y - 14, 6, '#fff3d2', { bloom: 0.5, rays: 4, rot: 0.785, width: 0.06 });
  // a soft exhaust plume below, sprayed through a loose shield
  b.spray('#ffd8a8', b.field((u, v) => { const du = u - x + (v - y) * 0.36; return 0.6 * Math.exp(-((du / 5) ** 2)) * smooth(y + 80, y + 18, v) * smooth(y + 10, y + 20, v); }, [x - 40, y + 6, x + 20, y + 90]), { grain: 0.5 });
}

function frame(ctx, t, k, L) {
  const [x0, y0, x1, y1] = L.box, bw = x1 - x0, bh = y1 - y0;
  if (!L.img || L.img.width !== bw) { L.img = new ImageData(bw, bh); L.ovl = document.createElement('canvas'); L.ovl.width = bw; L.ovl.height = bh; L.octx = L.ovl.getContext('2d'); }
  const d = L.img.data; d.fill(0);
  const ang = (OMEGA * t) % TAU, ns = L.strip.length, gd = L.grain.data, gsz = L.grain.size, gm = gsz - 1;
  const RIBS = 24;
  for (let j = 0; j < L.n; j++) {
    const i = L.idx[j], x = i % L.w, y = (i / L.w) | 0, o = ((y - y0) * bw + (x - x0)) * 4;
    let ph = L.phi[j] - ang; ph = ((ph % TAU) + TAU) % TAU;
    const g = gd[(y & gm) * gsz + (x & gm)];
    // ribs: the hull's structural hoops, every 10 degrees
    const rf = ph / TAU * RIBS, rd = Math.abs(rf - Math.round(rf));
    const rib = smooth(0.05, 0.015, rd) * L.cov[j];
    let r = 0, gg = 0, bb = 0, a = 0;
    const bnd = L.band[j];
    if (bnd > 0.01) {
      const c = L.strip[Math.floor(ph / TAU * ns) % ns], s = L.shade[j] * (0.92 + 0.16 * g);
      r = c[0] * s; gg = c[1] * s; bb = c[2] * s; a = bnd * 0.92;
    }
    if (rib > 0.01) { // straight-alpha "over": the dark hoop on top of the band
      const ra = rib * (0.42 + 0.2 * g), na = ra + a * (1 - ra);
      r = (0.17 * ra + r * a * (1 - ra)) / na; gg = (0.11 * ra + gg * a * (1 - ra)) / na; bb = (0.15 * ra + bb * a * (1 - ra)) / na; a = na;
    }
    if (a <= 0) continue;
    d[o] = r * 255; d[o + 1] = gg * 255; d[o + 2] = bb * 255;
    d[o + 3] = a * 255;
  }
  L.octx.putImageData(L.img, 0, 0);
  ctx.drawImage(L.ovl, x0, y0);
  // spokes: six tubes from the hub to the ring, behind whatever is nearer than the wheel's plane
  if (!L.sp) { L.sp = document.createElement('canvas'); L.sp.width = ctx.canvas.width; L.sp.height = ctx.canvas.height; L.spc = L.sp.getContext('2d'); }
  const c = L.spc; c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(x0 - 4, y0 - 4, bw + 8, bh + 8);
  c.setTransform(k, 0, 0, k, 0, 0); c.lineCap = 'butt';
  for (let s = 0; s < 6; s++) {
    const a = ang + s * TAU / 6;
    const pa = project([Math.cos(a) * HUB_R, 0, Math.sin(a) * HUB_R]), pb = project([Math.cos(a) * (RM - RT * 0.8), 0, Math.sin(a) * (RM - RT * 0.8)]);
    const lit = clamp(0.5 + 0.5 * (-Math.sin(a) * SUN[0] + Math.cos(a) * SUN[2]) * 0.6 + 0.25);
    const wd = 30 * F / ((pa[2] + pb[2]) / 2);
    c.strokeStyle = Paint.css(mixc('#4a3442', '#cdb9a2', lit), 1); c.lineWidth = wd;
    c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]); c.stroke();
    c.strokeStyle = Paint.css(mixc('#8a7276', '#f3e4cb', lit), 1); c.lineWidth = wd * 0.55;
    c.beginPath(); c.moveTo(pa[0], pa[1] - wd * 0.18); c.lineTo(pb[0], pb[1] - wd * 0.18); c.stroke();
    c.strokeStyle = Paint.css('#fff6e2', 0.7 * lit); c.lineWidth = wd * 0.16;
    c.beginPath(); c.moveTo(pa[0], pa[1] - wd * 0.3); c.lineTo(pb[0], pb[1] - wd * 0.3); c.stroke();
  }
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out';
  c.drawImage(L.occCv, x0, y0, bw, bh, x0, y0, bw, bh);
  c.globalCompositeOperation = 'source-over';
  ctx.drawImage(L.sp, x0, y0, bw, bh, x0, y0, bw, bh);
}

Bureau.define({ id: 'wheel', seed: 303, still: 7, fps: 15, build, frame });
})();

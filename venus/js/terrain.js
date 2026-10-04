// Terrain: NASA Magellan topography for the big shapes, procedural relief for the rest.
// Heights are true metres relative to the CO2 sea level (1500 m above Magellan's
// 6051 km sphere); the shader draws them `EXAGGERATION` times taller.
//
// Three nested levels, all centred on the standpoint's frame (x east, z south, metres):
//   L0  1024², 36 m spacing   – the headland and the near coast
//   L1  1024², 144 m spacing  – the bay and the escarpment
//   L2  320²,  4 km spacing   – Magellan itself, out past the horizon

import { gnoise, vnoise, clamp, smoothstep, lerp, fineDetail, nearField, slabs } from './noise.js';

export const EXAGGERATION = 1.8;
export const SEA_DATUM = 1500;          // metres above 6051 km: the liquid CO2 sea level
export const VENUS_R = 6051800;

// The Magellan tile (see _design/venus/terrain) is centred 61.75°N, 5.25°W at 4 km/px.
// Our standpoint sits 12 km east and 42 km south of that centre.
const TILE_N = 320, TILE_KM = 4.0;
export const STAND_IN_TILE = [12000, 42000];

export const LEVELS = [
  { n: 1024, spacing: 36, center: [-9000, 1500] },
  { n: 1024, spacing: 144, center: [-48000, 4000] },
  { n: TILE_N, spacing: TILE_KM * 1000, center: [-STAND_IN_TILE[0], -STAND_IN_TILE[1]] },
];
for (const L of LEVELS) { L.size = L.n * L.spacing; L.origin = [L.center[0] - L.size / 2, L.center[1] - L.size / 2]; }

let magellan = null; // Float32Array of true heights (m above 6051 km)
export function setMagellan(a) { magellan = a; }
export function getMagellan() { return magellan; }

export async function loadMagellan(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load the terrain (' + res.status + ').');
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  magellan = new Float32Array(TILE_N * TILE_N);
  for (let i = 0; i < magellan.length; i++) magellan[i] = px[i * 4] * 256 + px[i * 4 + 1] - 4000;
}

// Catmull-Rom bicubic sample of the Magellan tile at standpoint-frame metres.
function magellanAt(x, z) {
  const gx = (x + STAND_IN_TILE[0]) / (TILE_KM * 1000) + TILE_N / 2 - 0.5;
  const gz = (z + STAND_IN_TILE[1]) / (TILE_KM * 1000) + TILE_N / 2 - 0.5;
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const w = t => [((-t + 2) * t - 1) * t / 2, ((3 * t - 5) * t * t + 2) / 2, ((-3 * t + 4) * t + 1) * t / 2, (t - 1) * t * t / 2];
  const wx = w(fx), wz = w(fz);
  let s = 0;
  for (let j = 0; j < 4; j++) {
    const zz = clamp(iz - 1 + j, 0, TILE_N - 1);
    let row = 0;
    for (let i = 0; i < 4; i++) row += magellan[zz * TILE_N + clamp(ix - 1 + i, 0, TILE_N - 1)] * wx[i];
    s += row * wz[j];
  }
  return s;
}

const ridged = v => 1 - Math.abs(v);

// Shield volcanoes and other hand-placed features on the plains (true metres, frame metres).
export const SHIELDS = [];
{
  let s = 91;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) SHIELDS.push([(r() - 0.75) * 260000, (r() - 0.2) * 220000, 1500 + r() * 5000, 40 + r() * 180]);
}

// The full-resolution height function used by the bake (true metres relative to SEA_DATUM).
// `detail` is the smallest wavelength (m) the level can hold.
export function bakeHeight(x, z, detail) {
  const base = magellanAt(x, z) - SEA_DATUM;
  // where we are on the escarpment: 0 on the plains, 1 mid-slope, 0 on the plateau
  const slopeBand = smoothstep(-40, 600, base) * (1 - smoothstep(2600, 3400, base));
  const plateau = smoothstep(2500, 3200, base);
  const plains = 1 - smoothstep(-200, 500, base);

  // Domain warp keeps the ridges from looking ruled.
  const wx = gnoise(x / 23000 + 3.1, z / 23000) * 5200;
  const wz = gnoise(x / 23000 - 7.7, z / 23000 + 1.3) * 5200;
  const X = x + wx, Z = z + wz;

  let h = base;
  // Fold ridges of the mountain belt: long crests running east-west along the edge.
  let fold = 0, a = 1;
  for (let o = 0; o < 3; o++) {
    fold += (Math.pow(ridged(gnoise(X / (16000 / (o + 1) ** 1.6) + o * 13.1, Z / (5200 / (o + 1) ** 1.6) - o * 4.7)), 2) - 0.45) * a;
    a *= 0.5;
  }
  h += fold * (90 + 380 * slopeBand + 140 * plateau);
  // Gullies cut down the slope (running north-south), deepest mid-slope.
  if (detail < 900) {
    const g = Math.pow(ridged(gnoise(X / 2600 + 5.0, Z / 7800 - 1.0)), 3) - 0.3;
    const g2 = Math.pow(ridged(gnoise(X / 1100 - 2.0, Z / 3600 + 4.0)), 3) - 0.3;
    h -= (g * 150 + g2 * 60) * slopeBand;
  }
  // Wrinkle ridges on the lava plains and the plateau.
  const wr = Math.pow(ridged(gnoise(X / 9000 + 11.0, Z / 26000)), 6);
  h += wr * (60 * plateau + 45 * plains);
  // Small shields on the plains (now the sea floor).
  for (const [sx, sz, rad, ht] of SHIELDS) {
    const d2 = ((x - sx) ** 2 + (z - sz) ** 2) / (rad * rad);
    if (d2 < 9) h += ht * Math.exp(-d2) * plains;
  }
  // Ridged multifractal relief: crisp crests, smoother hollows.
  const rough = 0.06 * plains + 1.0 * slopeBand + 0.45 * plateau + 0.12;
  let f = 1 / 9000, amp = 1, wgt = 1, rmf = 0;
  for (let i = 0; i < 12; i++) {
    if (1 / f <= detail * 1.6) break;
    let n = 1 - Math.abs(gnoise(X * f + 31.7 + i * 7.1, Z * f - 12.9));
    n *= n; n *= wgt; wgt = clamp(n * 1.8, 0, 1);
    rmf += (n - 0.32) * amp;
    f *= 2.03; amp *= 0.52;
  }
  h += rmf * 330 * rough;
  // Fault scarps: Venus is cut by long straight fractures.
  for (let i = 0; i < 4; i++) {
    const a = 0.62 + i * 0.37 + Math.sin(i * 3.1) * 0.2;
    const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
    const ox = -30000 + i * 9000, oz = -18000 + Math.sin(i * 1.7) * 14000;
    const sd = (x - ox) * nx + (z - oz) * nz, al = (x - ox) * dx + (z - oz) * dz;
    const mask = smoothstep(26000, 9000, Math.abs(al)) * (0.4 + 0.6 * slopeBand + 0.5 * plains);
    h += (smoothstep(-90, 90, sd + gnoise(x / 2500, z / 2500) * 120) - 0.5) * 80 * mask * (1 - plains * 0.8) * (i % 2 === 0 ? 1 : -1);
  }
  const hl = headland(x, z);
  h = lerp(h, Math.max(h, hl.spur + (h - base) * 0.5), smoothstep(0, 60, hl.spur));
  const bayFloor = -300 + 60 * gnoise(x / 9000, z / 9000) + 25 * gnoise(x / 2500, z / 2500);
  return lerp(h, Math.min(h, bayFloor + (h - base) * 0.15), hl.bayW);
}

// The headland we stand on (mirrors glsl.js). Magellan shows a spur here, but at
// 4.6 km per pixel it can't say more; the crest, the point and its cliffs are invented.
function headland(x, z) {
  const ax = 9500, az = -15000, bx = 0, bz = 0;
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const t = ((x - ax) * vx + (z - az) * vz) / L2;
  const tc = clamp(t, 0, 1);
  const d = Math.hypot(x - (ax + vx * tc), z - (az + vz * tc));
  const crestH = lerp(1500, 660, smoothstep(0, 1, tc));
  const width = lerp(3400, 1500, tc);
  const beyond = Math.max(t - 1, 0) * Math.sqrt(L2);
  const r = Math.sqrt(d * d + beyond * beyond * 2.2);
  const flank = Math.pow(clamp(1 - r / width, 0, 1), 1.25);
  const kd = Math.hypot(x - bx, z - bz);
  const spur = crestH * flank + 50 * Math.exp(-(kd * kd) / (240 * 240));
  const bd = Math.hypot((x + 7000) * 0.8, z - 6500);
  const bayW = smoothstep(11000, 5500, bd) * (1 - smoothstep(0, 0.25, flank));
  return { spur, bayW };
}

// Bake one level: heights (true m rel. sea) and normals/AO packed for the shader.
export async function bakeLevel(L, onProgress) {
  const n = L.n, H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = L.origin[1] + (j + 0.5) * L.spacing;
    for (let i = 0; i < n; i++) {
      const x = L.origin[0] + (i + 0.5) * L.spacing;
      H[j * n + i] = bakeHeight(x, z, L.spacing * 2);
    }
    if ((j & 63) === 63 && onProgress) await onProgress(j / n);
  }
  // Fade L0's extra detail into L1 near its border so the levels meet.
  L.heights = H;
  return H;
}

// Smooth L0 toward L1 at the border (both baked).
export function blendBorder(L0, L1) {
  const n = L0.n, band = 48;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const e = Math.min(i, j, n - 1 - i, n - 1 - j);
    if (e >= band) continue;
    const w = smoothstep(0, band, e);
    const x = L0.origin[0] + (i + 0.5) * L0.spacing, z = L0.origin[1] + (j + 0.5) * L0.spacing;
    L0.heights[j * n + i] = lerp(sampleLevel(L1, x, z), L0.heights[j * n + i], w);
  }
}

export function bakeFar(L) {
  const n = L.n, H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = L.origin[0] + (i + 0.5) * L.spacing, z = L.origin[1] + (j + 0.5) * L.spacing;
    H[j * n + i] = bakeHeight(x, z, L.spacing * 2);
  }
  L.heights = H;
}

export function sampleLevel(L, x, z) {
  const gx = (x - L.origin[0]) / L.spacing - 0.5, gz = (z - L.origin[1]) / L.spacing - 0.5;
  const n = L.n;
  const ix = clamp(Math.floor(gx), 0, n - 2), iz = clamp(Math.floor(gz), 0, n - 2);
  const fx = clamp(gx - ix, 0, 1), fz = clamp(gz - iz, 0, 1);
  const H = L.heights;
  const a = H[iz * n + ix], b = H[iz * n + ix + 1], c = H[(iz + 1) * n + ix], d = H[(iz + 1) * n + ix + 1];
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

function inside(L, x, z, margin) {
  return x > L.origin[0] + margin && x < L.origin[0] + L.size - margin && z > L.origin[1] + margin && z < L.origin[1] + L.size - margin;
}

// Cubic B-spline sample (matches the shader's bicubicTex near the eye).
export function sampleLevelBSpline(L, x, z) {
  const gx = (x - L.origin[0]) / L.spacing - 0.5, gz = (z - L.origin[1]) / L.spacing - 0.5;
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const w = f => [(1 - f) ** 3 / 6, (4 - 6 * f * f + 3 * f ** 3) / 6, (1 + 3 * f + 3 * f * f - 3 * f ** 3) / 6, f ** 3 / 6];
  const wx = w(fx), wz = w(fz), n = L.n, H = L.heights;
  let s = 0;
  for (let j = 0; j < 4; j++) {
    const zz = clamp(iz - 1 + j, 0, n - 1);
    let row = 0;
    for (let i = 0; i < 4; i++) row += H[zz * n + clamp(ix - 1 + i, 0, n - 1)] * wx[i];
    s += row * wz[j];
  }
  return s;
}

// True metres relative to the sea, from the finest level that covers (x, z).
export function heightTrue(x, z) {
  for (const L of LEVELS) if (inside(L, x, z, L.spacing * 2)) return sampleLevel(L, x, z);
  return sampleLevel(LEVELS[2], x, z);
}

// Render-space height (exaggerated, with the shader's fine relief, before curvature).
export function heightRender(x, z, fine = 1) {
  return blendStand(x, z, terrainRender(x, z, fine)) + slabs(x, z) * fine;
}
// The terrain without the standpoint's platform or the slab texture.
export function terrainRender(x, z, fine = 1) {
  const L0 = LEVELS[0];
  const base = inside(L0, x, z, L0.spacing * 2) ? sampleLevelBSpline(L0, x, z) : heightTrue(x, z);
  return base * EXAGGERATION + fineDetail(x, z) * fine;
}
export let STAND_H = 0;
export function setStandHeight() { STAND_H = terrainRender(0, 0, 1); return STAND_H; }
export function blendStand(x, z, h) {
  const r = Math.hypot(x, z);
  if (r >= 230) return h;
  return lerp(STAND_H + nearField(x, z), h, smoothstep(70, 230, r));
}

// Pack heights (R16F, render metres) and normals+AO (RGBA8) for the GPU.
export function packLevel(L) {
  const n = L.n, H = L.heights, E = EXAGGERATION;
  const height = new Float32Array(n * n);
  const nrm = new Uint8Array(n * n * 4);
  // coarse blur for an ambient-occlusion-like concavity term
  const blur = boxBlur(H, n, Math.max(2, Math.round(600 / L.spacing)));
  const blur2 = boxBlur(H, n, Math.max(3, Math.round(2400 / L.spacing)));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    height[k] = H[k] * E;
    const l = H[j * n + Math.max(0, i - 1)], r = H[j * n + Math.min(n - 1, i + 1)];
    const u = H[Math.max(0, j - 1) * n + i], d = H[Math.min(n - 1, j + 1) * n + i];
    let nx = (l - r) * E, nz = (u - d) * E, ny = 2 * L.spacing;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    nrm[k * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    nrm[k * 4 + 1] = Math.round((nz * 0.5 + 0.5) * 255);
    const cav = clamp(0.5 + (H[k] - blur[k]) * E / 160 + (H[k] - blur2[k]) * E / 900, 0, 1);
    nrm[k * 4 + 2] = Math.round(cav * 255);
    nrm[k * 4 + 3] = 255;
  }
  return { height, nrm };
}

function boxBlur(src, n, r) {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    let s = 0, c = 0;
    for (let i = -r; i <= r; i++) { const ii = clamp(i, 0, n - 1); s += src[j * n + ii]; c++; }
    for (let i = 0; i < n; i++) {
      tmp[j * n + i] = s / c;
      const add = clamp(i + r + 1, 0, n - 1), rem = clamp(i - r, 0, n - 1);
      s += src[j * n + add] - src[j * n + rem];
    }
  }
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = -r; j <= r; j++) { const jj = clamp(j, 0, n - 1); s += tmp[jj * n + i]; c++; }
    for (let j = 0; j < n; j++) {
      out[j * n + i] = s / c;
      const add = clamp(j + r + 1, 0, n - 1), rem = clamp(j - r, 0, n - 1);
      s += tmp[add * n + i] - tmp[rem * n + i];
    }
  }
  return out;
}

// Triton at true scale, shared by the main thread and the terrain worker.
// Units: metres. Body frame: x towards Neptune (Triton keeps that face to it), z = IAU north.
// Every function here has a GLSL twin in shaders.js; keep them in step.

export const R = 1353400;          // Triton's mean radius (2,707 km across)
export const GRAV = 0.779;          // surface gravity, m/s²
export const NEP_DIST = 354759e3;   // Triton's orbit radius
export const NEP_R = 24764e3;       // Neptune's equatorial radius
export const D2R = Math.PI / 180;

// Cloison sizes (the enamel cells), coarse to fine. The second is the real size of the
// cantaloupe terrain's dimples (Voyager 2 saw cells 25–35 km across).
export const CELL = [150000, 30000, 6000, 1200, 240, 48, 10, 2];

// Radiator fields: rows of tall panels across an avenue that carries the trunk line home.
export const FIN = { rowGap: 250, len: 500, gap: 80, height: 390, leg: 30, thick: 3, avenue: 240, conduit: 470 };
// Fusion plants: domed reactor halls in clearings beside each field's avenue, 900 m in from its
// mouth. Small fields have one (on the +u side), hubs and the big fields two. GLSL twin: inPlant.
export const PLANT = { u: 620, v: -900, dia: 460, height: 190, clear: 290 };
export function plantSites(kind) { return kind > 0.5 ? [PLANT.u, -PLANT.u] : [PLANT.u]; }
/** Is the panel centred at along-row position uc on the row at v inside a plant's clearing? */
export function inPlant(kind, uc, v) {
  if (Math.abs(v - PLANT.v) > PLANT.clear) return false;
  const lim = PLANT.clear + FIN.len / 2;
  return Math.abs(uc - PLANT.u) < lim || (kind > 0.5 && Math.abs(uc + PLANT.u) < lim);
}

// ---------------------------------------------------------------------------
// Integer hash and noise (GLSL twins: ihash3, vnoise3, fbm3, voronoi3).
// Coordinates are offset by 2²¹ so they stay positive (GLSL's int→uint cast is only safe then).
export function ihash3(x, y, z) {
  let h = Math.imul((x + 2097152) | 0, 0x5F356495) ^ Math.imul((y + 2097152) | 0, 0x2A3B5C27) ^ Math.imul((z + 2097152) | 0, 0x68E31DA4);
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  return (h ^ (h >>> 16)) >>> 0;
}
const U = 1 / 4294967296;
export const hash01 = (x, y, z) => ihash3(x, y, z) * U;
export function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = hash01(ix, iy, iz), b = hash01(ix + 1, iy, iz), c = hash01(ix, iy + 1, iz), d = hash01(ix + 1, iy + 1, iz);
  const e = hash01(ix, iy, iz + 1), f = hash01(ix + 1, iy, iz + 1), g = hash01(ix, iy + 1, iz + 1), h = hash01(ix + 1, iy + 1, iz + 1);
  const x1 = a + (b - a) * ux, x2 = c + (d - c) * ux, x3 = e + (f - e) * ux, x4 = g + (h - g) * ux;
  const y1 = x1 + (x2 - x1) * uy, y2 = x3 + (x4 - x3) * uy;
  return y1 + (y2 - y1) * uz;
}
export function fbm3(x, y, z, oct = 5) {
  let s = 0, a = .5;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x, y, z); x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; z = z * 2.03 + 3.1; a *= .5; }
  return s;
}
/** Voronoi on a 3D lattice: [F1, F2, cell hash]. Feature points jittered inside each cell. */
export function voronoi3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let d1 = 9, d2 = 9, id = 0;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, cz = iz + k, h = ihash3(cx, cy, cz);
    const px = cx + .15 + .7 * ((h & 1023) / 1023), py = cy + .15 + .7 * (((h >>> 10) & 1023) / 1023), pz = cz + .15 + .7 * (((h >>> 20) & 1023) / 1023);
    const dd = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
    if (dd < d1) { d2 = d1; d1 = dd; id = h; } else if (dd < d2) d2 = dd;
  }
  return [Math.sqrt(d1), Math.sqrt(d2), id];
}

// ---------------------------------------------------------------------------
// Cube-sphere: six faces, (u, v) in [−1, 1], tangent-warped for even cells.
const FACES = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
  [[0, 1, 0], [-1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
export function cubeDir(f, u, v) {
  const [N, A, B] = FACES[f], a = Math.tan(u * Math.PI / 4), b = Math.tan(v * Math.PI / 4);
  const x = N[0] + a * A[0] + b * B[0], y = N[1] + a * A[1] + b * B[1], z = N[2] + a * A[2] + b * B[2];
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// ---------------------------------------------------------------------------
// The region map (cap, cantaloupe, streaks, collar) is baked on the GPU from the GLSL noise
// and read back once, so the CPU and the shaders agree exactly about where cantaloupe is.
let regionMap = null, RM_W = 0, RM_H = 0;
export function setRegionMap(data, w, h) { regionMap = data; RM_W = w; RM_H = h; }
export function regionAt(d, ch) {
  if (!regionMap) return 0;
  const lon = Math.atan2(d[1], d[0]), lat = Math.asin(Math.max(-1, Math.min(1, d[2])));
  const x = (lon / (2 * Math.PI) + .5) * RM_W - .5, y = (lat / Math.PI + .5) * RM_H - .5;
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(RM_H - 2, Math.floor(y))), fx = x - x0, fy = Math.max(0, Math.min(1, y - y0));
  const s = (xx, yy) => regionMap[((yy * RM_W) + ((xx % RM_W) + RM_W) % RM_W) * 4 + ch] / 255;
  return (s(x0, y0) * (1 - fx) + s(x0 + 1, y0) * fx) * (1 - fy) + (s(x0, y0 + 1) * (1 - fx) + s(x0 + 1, y0 + 1) * fx) * fy;
}

/** Height above the mean radius, metres. Triton's relief is low: about a kilometre at most. */
export function heightAt(d) {
  const [x, y, z] = d;
  let h = 420 * (fbm3(x * 3.1, y * 3.1, z * 3.1, 4) - .5) + 150 * (fbm3(x * 14 + 5, y * 14 + 5, z * 14 + 5, 4) - .5);
  const cant = regionAt(d, 1);
  if (cant > .02) {
    const s = R / CELL[1], [f1, f2] = voronoi3(x * s, y * s, z * s);
    const wall = 1 - smooth(0, .2, f2 - f1);
    h += cant * (240 * wall - 200 * (1 - f1 * f1));
  }
  // rougher detail down to a couple of metres
  const sc = [2000, 480, 120, 30, 8, 2.2], am = [26, 9, 3.2, 1, .35, .12];
  for (let i = 0; i < sc.length; i++) { const k = R / sc[i]; h += am[i] * (vnoise3(x * k, y * k, z * k) - .5) * 2; }
  return h;
}
export function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------------------
// Field layout, shared by the instance builder (worker) and the shaders' analytic shadows.
/** Ragged edge of a field (frost-like), as a factor on its radius. */
export function wobble(theta, seed) { return .9 + .06 * Math.sin(7 * theta + seed * 6.283) + .04 * Math.sin(13 * theta + seed * 17.0); }
/** Growth: the share of a field's radius built by `year`. */
export function grown(year, birth, years) { return year <= birth ? 0 : Math.min(1, Math.sqrt((year - birth) / years)); }
/** The year a point at fraction `f` of the radius is built. */
export function builtYear(f, birth, years) { return birth + years * f * f; }
/** Row k's along-row offset and fin i's height factor (GLSL twins: rowOffset, finScale). */
export function rowOffset(field, k) { return ihash3(field, k, 7) * U * (FIN.len + FIN.gap); }
export function finScale(field, k, i) { return .9 + .16 * ihash3(field, k, i + 101) * U; }

// Small vector helpers.
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
export function latLonDir(lat, lon) { return [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)]; }
/** Local east and north at a unit direction. */
export function tangentFrame(d) {
  let east = V.cross([0, 0, 1], d);
  if (V.len(east) < 1e-6) east = [0, 1, 0];
  east = V.norm(east);
  return { east, north: V.cross(d, east), up: d };
}
export function rng(seed) {
  let s = seed | 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

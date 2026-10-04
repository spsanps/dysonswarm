// The campus: a round plug of Triton about 300 m across, cut out like a core sample,
// with four halls, a reactor, a dish, a cabin, a geyser and one person.
// Everything here is modelled in code at load time. Units: 1 ≈ 10 m (toy scale for
// people and doors, so you can see them).
import { Mesh, roundedBox, sdfMesh, lathe, icosphere, cylinder, capsuleBetween, sd, vnoise } from './meshes.js';
import { m4 } from './gl.js';

export const R_TOP = 14;        // radius of the flat top
const RIM = 0.8;               // radius of the rounded rim
export const DEPTH = 3.6;      // how deep the core goes

// ---- materials and palette ---------------------------------------------------
export const MAT = { TOP: 0, SIDE: 1, CLAY: 2, FIN: 3, GLASS: 4, GLOSS: 5, BULB: 6, PUFF: 7, HALL: 8, CABLE: 9 };
const hex = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
// Index 0 means "use the instance colour".
export const PALETTE = [
  [1, 1, 1], hex(0xdcd0bc), hex(0x8f837b), hex(0xc8674a), hex(0xe9dcc6), hex(0x6f5246), // 1 cream fins, 2 stone, 3 terracotta, 4 bone, 5 brown
  hex(0xe2b45c), hex(0xa7b39b), hex(0xf2d38f), hex(0x9a6a48), hex(0x5b6d78), hex(0xd9cfc0), // 6 ochre, 7 sage, 8 butter, 9 wood, 10 slate, 11 pale stone
  hex(0xb85a3e), hex(0xf4efe5), hex(0xe8a33c), hex(0x2b303c), hex(0xc6cdd2), hex(0xbfb4a8), // 12 brick, 13 dish white, 14 suit, 15 visor, 16 ice block, 17 crate
  hex(0xffcf7a), hex(0x9cb0bd), hex(0x4f4542), hex(0xd8c3a5), // 18 lamp glow, 19 blue-grey, 20 dark, 21 tan
];
export const HALL_COLOURS = [hex(0xdb8b70), hex(0xe4ba68), hex(0xa2b993), hex(0xb3a3cb)];

// ---- layout -------------------------------------------------------------------
const D = Math.PI / 180;
// Halls: centre x, z, rotation (long axis along local z), length, width.
export const HALLS = [
  { x: -4.6, z: -3.3, rot: 78 * D, L: 7.6, W: 2.8, fins: 9 },
  { x: 4.4, z: -4.9, rot: 112 * D, L: 6.6, W: 2.7, fins: 8 },
  { x: 2.4, z: 2.4, rot: 84 * D, L: 6.8, W: 2.8, fins: 8 },
  { x: -6.5, z: 3.5, rot: 58 * D, L: 4.4, W: 2.5, fins: 3 },
];
export const HW = 1.25; // wall height of the halls
export const REACTOR = { x: 10.5, z: -1.4 };
export const DISH = { x: 9.4, z: -6.6 };
export const CABIN = { x: 8.6, z: 6.0, rot: Math.PI - 0.35 };
export const BENCH = { x: 5.5, z: 7.6, rot: -6 * D };
export const VENT = { x: -6.6, z: 9.3 };
export const WIND = (() => { const a = [-0.86, -0.5]; const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; })();
export const LAMPS = [[-0.6, 0.1], [6.2, 0.4], [-6.6, 0.9], [7.0, -3.2]];

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const local = (h, x, z) => { const dx = x - h.x, dz = z - h.z, c = Math.cos(h.rot), s = Math.sin(h.rot); return [c * dx - s * dz, s * dx + c * dz]; };
// Rotation about y by `rot` maps local (lx, lz) to world: x = c lx + s lz, z = −s lx + c lz.
const toWorld = (h, lx, lz) => { const c = Math.cos(h.rot), s = Math.sin(h.rot); return [h.x + c * lx + s * lz, h.z - s * lx + c * lz]; };
function rrect(px, pz, hx, hz, r) { const qx = Math.abs(px) - hx + r, qz = Math.abs(pz) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r; }

// Footprints used to level the ground and to bake contact shadows.
export const FOOTPRINTS = [];
HALLS.forEach((h, i) => FOOTPRINTS.push({ kind: 'hall', i, x: h.x, z: h.z, rot: h.rot, hx: h.W / 2 + 0.25, hz: h.L / 2 + 0.25, height: HW + h.W / 2 }));
FOOTPRINTS.push({ kind: 'reactor', x: REACTOR.x, z: REACTOR.z, rot: 0, hx: 1.7, hz: 1.7, r: 1.7, height: 2.6 });
FOOTPRINTS.push({ kind: 'dish', x: DISH.x, z: DISH.z, rot: 0, hx: 0.7, hz: 0.7, r: 0.7, height: 2.5 });
FOOTPRINTS.push({ kind: 'cabin', x: CABIN.x, z: CABIN.z, rot: CABIN.rot, hx: 1.12, hz: 0.86, height: 1.7 });

// ---- paths (trodden tracks, and the caretaker's rounds) -------------------------
function catmull(pts, n) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const hallEnd = (i, side, out = 0.9) => toWorld(HALLS[i], 0, side * (HALLS[i].L / 2 + out));
const hallSide = (i, side, along = 0, out = 0.9) => toWorld(HALLS[i], side * (HALLS[i].W / 2 + out), along);
const CABIN_DOOR = toWorld({ x: CABIN.x, z: CABIN.z, rot: CABIN.rot }, -0.2, -1.6);
export const PATHS = [
  catmull([CABIN_DOOR, [6.4, 6.4], [6.2, 4.4], hallEnd(2, 1, 1.1), [3.6, -0.4], [-0.6, -0.6], hallEnd(0, 1, 0.9)], 10),
  catmull([[3.6, -0.4], [5.6, -1.6], hallEnd(1, -1, 1.0), [6.6, -5.8], [8.4, -6.0]], 10),
  catmull([hallEnd(2, 1, 1.1), [7.6, 1.0], [8.9, -0.5]], 10),
  catmull([[-0.6, -0.6], [-1.6, 2.4], [-3.6, 5.0]], 10),
  catmull([[-1.6, 2.4], [-3.0, 6.4], [-5.0, 8.2]], 8),
  catmull([[6.2, 4.4], [5.4, 6.4], [BENCH.x, BENCH.z + 0.7]], 6),
];
// The caretaker's day: walk, stop, look, sit. Times in seconds of a 24-minute loop.
const WAY = [CABIN_DOOR, [6.4, 6.4], [6.2, 4.4], hallEnd(2, 1, 1.1), [7.6, 1.0], [8.9, -0.5], [8.4, -3.6], [8.2, -5.5], [6.6, -5.8],
  hallEnd(1, -1, 1.0), [3.6, -0.4], [-0.6, -0.6], hallEnd(0, 1, 0.9), [-0.6, -0.6], [-1.6, 2.4], [-3.4, 4.9], [-1.0, 4.8], [2.6, 5.6], [4.6, 7.2],
  [BENCH.x - 0.5, BENCH.z + 0.7], [BENCH.x, BENCH.z + 0.62]];
const SEG = 12;
const ROUNDS = catmull(WAY, SEG);
function pathLengths(p) { const L = [0]; for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return L; }
const ROUNDS_L = pathLengths(ROUNDS);
function along(path, lens, d) {
  d = Math.max(0, Math.min(lens[lens.length - 1], d));
  let i = 1; while (i < lens.length - 1 && lens[i] < d) i++;
  const t = (d - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
  const a = path[i - 1], b = path[i];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dir: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
// Stops along the rounds: [waypoint, seconds to stand there, what she faces]
const total = ROUNDS_L[ROUNDS_L.length - 1];
const STOPS = [[3, 35, 'galle'], [5, 45, 'reactor'], [7, 55, 'dish'], [9, 35, 'adams'], [12, 40, 'leverrier'], [15, 35, 'lassell']]
  .map(([k, dur, face]) => [ROUNDS_L[k * SEG], dur, face]);
const FACE = { galle: () => toWorld(HALLS[2], 0, HALLS[2].L / 2), adams: () => toWorld(HALLS[1], 0, -HALLS[1].L / 2), leverrier: () => toWorld(HALLS[0], 0, HALLS[0].L / 2),
  lassell: () => toWorld(HALLS[3], 0, 0), reactor: () => [REACTOR.x, REACTOR.z], dish: () => [DISH.x, DISH.z] };
const SPEED = 0.42; // units per second
/** Where the caretaker is at loop time `t` (seconds). */
export function caretakerAt(tSec) {
  const LOOP = 24 * 60;
  let t = ((tSec % LOOP) + LOOP) % LOOP;
  // 0–90 s: inside the cabin (door opens and closes).
  if (t < 90) return { visible: false, inside: true };
  t -= 90;
  // walking with stops
  let d = 0;
  for (const [sd0, dur, face] of STOPS) {
    const walk = (sd0 - d) / SPEED;
    if (t < walk) { const p = along(ROUNDS, ROUNDS_L, d + t * SPEED); return { visible: true, ...p, walking: true, phase: (d + t * SPEED) * 2.2 }; }
    t -= walk; d = sd0;
    if (t < dur) {
      const p = along(ROUNDS, ROUNDS_L, d);
      const f = FACE[face]();
      const dir = Math.atan2(f[0] - p.x, f[1] - p.z);
      return { visible: true, ...p, dir, walking: false, phase: 0, looking: true };
    }
    t -= dur;
  }
  const walk = (total - d) / SPEED;
  if (t < walk) { const p = along(ROUNDS, ROUNDS_L, d + t * SPEED); return { visible: true, ...p, walking: true, phase: (d + t * SPEED) * 2.2 }; }
  t -= walk;
  // The rest of the loop: sitting on the bench, looking at Neptune.
  return { visible: true, x: BENCH.x, z: BENCH.z + 0.08, dir: Math.PI + BENCH.rot, walking: false, sitting: true, phase: 0, breathe: t };
}

// ---- ground height --------------------------------------------------------------
function worley(x, z, cell) {
  const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  let f1 = 1e9, f2 = 1e9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cz = gz + j;
    const hx = (vnoise(cx * 7.13, cz * 3.71, 1.3) * 0.5 + 0.5), hz = (vnoise(cx * 2.91, cz * 8.17, 4.7) * 0.5 + 0.5);
    const px = (cx + 0.15 + 0.7 * hx) * cell, pz = (cz + 0.15 + 0.7 * hz) * cell;
    const d = Math.hypot(x - px, z - pz);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}
/** 0 on the smooth frost cap, 1 on the dimpled cantaloupe terrain. */
export function cantaloupe(x, z) {
  const s = (x * 0.62 - z * 0.78) + 1.6 * Math.sin(z * 0.35 + 1.0) + 0.9 * Math.sin(x * 0.5 - 0.4);
  return smooth(5.5, 8.0, s);
}
function footprintDist(f, x, z) {
  const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot);
  const lx = c * dx - s * dz, lz = s * dx + c * dz;
  if (f.r) return Math.hypot(dx, dz) - f.r;
  return rrect(lx, lz, f.hx, f.hz, 0.4);
}
export function height(x, z) {
  const r = Math.hypot(x, z);
  let h = 0.16 * vnoise(x * 0.11, z * 0.11, 0.5) + 0.07 * vnoise(x * 0.31, z * 0.31, 2.5);
  // Frost cap: wind ripples (sastrugi) across the plume's wind.
  const along = x * WIND[0] + z * WIND[1], across = -x * WIND[1] + z * WIND[0];
  h += 0.035 * Math.sin(across * 2.4 + 1.4 * vnoise(x * 0.4, z * 0.4, 9)) * (0.6 + 0.4 * vnoise(along * 0.3, 1, 3));
  // Cantaloupe terrain: dimples with ridged rims.
  const c = cantaloupe(x, z);
  if (c > 0) {
    const [f1, f2] = worley(x, z, 2.3);
    const ridge = f2 - f1;
    h += c * (-0.24 * smooth(0.0, 1.1, ridge) + 0.1 * (1 - smooth(0.0, 0.25, ridge)) + 0.08);
  }
  // Ice berm around the reactor (shielding).
  const rd = Math.hypot(x - REACTOR.x, z - REACTOR.z);
  { const cx = -REACTOR.x, cz = -REACTOR.z, cl = Math.hypot(cx, cz), face = ((x - REACTOR.x) * cx + (z - REACTOR.z) * cz) / (cl * Math.max(rd, 0.01));
    h += 0.6 * Math.exp(-((rd - 2.7) ** 2) / 0.32) * smooth(-0.35, 0.35, face); }
  // Geyser vent: a low cone with a pit.
  const vd = Math.hypot(x - VENT.x, z - VENT.z);
  h += 0.32 * Math.exp(-((vd - 0.62) ** 2) / 0.07) + 0.12 * Math.exp(-vd * vd / 2.5) - 0.42 * Math.exp(-vd * vd / 0.09);
  // Level pads under buildings.
  let pad = 0;
  for (const f of FOOTPRINTS) pad = Math.max(pad, 1 - smooth(0, 1.4, footprintDist(f, x, z)));
  h = h * (1 - pad) + 0.0 * pad;
  // Calm the very edge so the rim reads cleanly.
  h *= 1 - 0.55 * smooth(R_TOP - 1.6, R_TOP, r);
  return h;
}

// ---- terrain mesh ------------------------------------------------------------------
// One grid: rings across the top, round over the rim, down the cut side, round under
// the foot, closed at the bottom. ext = [material, occlusion, zone (0 top → 1 side), 0].
export function terrainMesh() {
  const m = new Mesh();
  const NS = 300, NR = 96, SIDE = 26, FOOT = 0.8;
  const bottomY = -DEPTH;
  const rows = [];
  for (let i = 0; i <= NR; i++) rows.push({ kind: 'top', r: R_TOP * Math.pow(i / NR, 0.92) });
  for (let i = 1; i <= 8; i++) rows.push({ kind: 'rim', a: (i / 8) * Math.PI / 2 });
  for (let i = 1; i <= SIDE; i++) rows.push({ kind: 'side', t: i / SIDE });
  for (let i = 1; i <= 6; i++) rows.push({ kind: 'foot', a: (i / 6) * Math.PI / 2 });
  rows.push({ kind: 'bottom' });
  const edge = [];
  for (let j = 0; j < NS; j++) { const th = (j / NS) * Math.PI * 2; edge.push(height(Math.cos(th) * R_TOP, Math.sin(th) * R_TOP)); }
  const sideR = (t, th) => R_TOP + RIM - 0.9 * t * t + 0.14 * Math.sqrt(t) * vnoise(Math.cos(th) * 4, t * 6, Math.sin(th) * 4);
  const P = [], Z = [];
  for (const row of rows) {
    const line = [], zl = [];
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      let rr, y, zone = 1;
      if (row.kind === 'top') { rr = row.r; y = height(c * rr, s * rr); zone = 0; }
      else if (row.kind === 'rim') { rr = R_TOP + RIM * Math.sin(row.a); y = edge[j] - RIM * (1 - Math.cos(row.a)); zone = smooth(0.35, 1.25, row.a); }
      else if (row.kind === 'side') { const y0 = edge[j] - RIM; rr = sideR(row.t, th); y = y0 + (bottomY + FOOT - y0) * row.t; }
      else if (row.kind === 'foot') { rr = sideR(1, th) - FOOT + FOOT * Math.cos(row.a); y = bottomY + FOOT - FOOT * Math.sin(row.a); }
      else { rr = 0; y = bottomY; }
      line.push([c * rr, y, s * rr]); zl.push(zone);
    }
    P.push(line); Z.push(zl);
  }
  const NRows = P.length;
  for (let i = 0; i < NRows; i++) for (let j = 0; j < NS; j++) {
    const a = P[Math.min(NRows - 1, i + 1)][j], b = P[Math.max(0, i - 1)][j];
    const c = P[i][(j + 1) % NS], d = P[i][(j - 1 + NS) % NS];
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let n = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]];
    if (i === 0) n = [0, 1, 0];
    if (i === NRows - 1) n = [0, -1, 0];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    m.vert(P[i][j], [n[0] / l, n[1] / l, n[2] / l], [MAT.TOP, 1, Z[i][j], 0]);
  }
  for (let i = 0; i < NRows - 1; i++) for (let j = 0; j < NS; j++) {
    const A = i * NS + j, B = i * NS + (j + 1) % NS, C = (i + 1) * NS + j, Dd = (i + 1) * NS + (j + 1) % NS;
    m.tri(A, C, Dd); m.tri(A, Dd, B);
  }
  return m;
}

// ---- objects -------------------------------------------------------------------
// ext: [material, occlusion, palette index, object id]
function paint(mesh, mat, pal, id, aoFn) {
  for (let k = 0; k < mesh.p.length / 3; k++) {
    const y = mesh.p[k * 3 + 1];
    mesh.e[k * 4] = mat; mesh.e[k * 4 + 1] = aoFn ? aoFn(y) : 1; mesh.e[k * 4 + 2] = pal; mesh.e[k * 4 + 3] = id;
  }
  return mesh;
}
const groundAO = (base = 0.45, reach = 0.7) => y => base + (1 - base) * smooth(0, reach, y);
const ball = r => { const s = icosphere(1); for (let k = 0; k < s.p.length; k++) s.p[k] *= r; return s; };

export const IDS = { HALL0: 1, REACTOR: 5, DISH: 6, CABIN: 7, GEYSER: 8, PERSON: 9 };

/** Build static props (one merged mesh) and the per-hall shells. */
export function buildObjects() {
  const props = new Mesh();
  const put = (mesh, mat) => props.add(mesh, mat);
  const halls = [];

  HALLS.forEach((h, i) => {
    const id = IDS.HALL0 + i, R = h.W / 2;
    const seed = i * 13.7;
    const f = p => {
      const box = sd.box([p[0], p[1] - (HW - 0.2) / 2, p[2]], [h.W / 2, (HW + 0.2) / 2, h.L / 2], 0.16);
      const vault = sd.cyl([p[0], p[1] - HW, p[2]], 'z', R, h.L / 2, 0.16);
      let d = sd.smin(box, vault, 0.12);
      d = Math.max(d, -p[1] - 0.02);
      return d + 0.014 * vnoise(p[0] * 1.9 + seed, p[1] * 1.9, p[2] * 1.9);
    };
    const top = HW + R;
    const shell = sdfMesh(f, h.W / 2 + 0.1, top / 2 + 0.1, h.L / 2 + 0.1, { step: 0.11, centre: [0, top / 2, 0] });
    paint(shell, MAT.HALL, 0, id, groundAO(0.55, 0.5));
    halls.push({ mesh: shell, model: m4.trs([h.x, 0, h.z], h.rot), colour: [...HALL_COLOURS[i], 1], params: [id, i, h.L, h.W], hall: h });

    const M = m4.trs([h.x, 0, h.z], h.rot);
    // Foundation skirt
    put(paint(roundedBox(h.W + 0.36, 0.32, h.L + 0.36, 0.12, { step: 0.5, k: 3, wobble: 0.01, seed }), MAT.CLAY, 2, id, groundAO(0.5, 0.2)), m4.mul(M, m4.trs([0, 0.1, 0])));
    // Roof radiator fins and their manifold
    const n = h.fins;
    const span = n === 3 ? h.L * 0.35 : h.L * 0.78;
    for (let k = 0; k < n; k++) {
      const z = n === 1 ? 0 : -span / 2 + span * k / (n - 1);
      const wide = n === 3 ? 1.2 : 1.8, tall = n === 3 ? 0.85 : 1.45;
      const fin = roundedBox(wide, tall, 0.13, 0.06, { step: 0.4, k: 2, wobble: 0.016, seed: seed + k * 3.1 });
      paint(fin, MAT.FIN, 1, id, y => 0.62 + 0.38 * smooth(-tall / 2, tall / 2 - 0.2, y));
      put(fin, m4.mul(M, m4.trs([0, HW + R - 0.22 + tall / 2, z], 0, 1, 0, (vnoise(k, i, 3) * 1.6) * D)));
    }
    put(paint(capsuleBetween([0, HW + R + 0.02, -span / 2 - 0.25], [0, HW + R + 0.02, span / 2 + 0.25], 0.13, 10), MAT.CLAY, 4, id), M);
    // Coolant pipe down the gable end
    put(paint(capsuleBetween([0.55, 0.15, -h.L / 2 - 0.12], [0.55, HW + R - 0.35, -h.L / 2 - 0.12], 0.08, 8), MAT.CLAY, 4, id), M);
    // Door canopy lamp at the back end
    put(paint(ball(0.07), MAT.BULB, 18, id), m4.mul(M, m4.trs([0, 1.08, -h.L / 2 - 0.08])));
  });

  // ---- the reactor: a squat drum, a dome, and a ring of radiator petals
  {
    const id = IDS.REACTOR, M = m4.trs([REACTOR.x, 0, REACTOR.z], 0.3);
    put(paint(cylinder(1.5, -0.1, 1.15, 40, 0.14), MAT.CLAY, 11, id, groundAO(0.5, 0.5)), M);
    put(paint(cylinder(1.56, 0.62, 0.86, 40, 0.06), MAT.CLAY, 3, id), M);
    const dome = [];
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; dome.push([1.32 * Math.cos(a) + 0.0001, 1.1 + 1.0 * Math.sin(a)]); }
    dome[dome.length - 1][0] = 0;
    put(paint(lathe([[0, 1.1], ...dome], 40), MAT.CLAY, 8, id), M);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.26;
      const petal = roundedBox(0.08, 1.15, 1.7, 0.035, { step: 0.4, k: 2, wobble: 0.01, seed: k * 5 });
      paint(petal, MAT.FIN, 1, id, groundAO(0.55, 0.6));
      put(petal, m4.mul(M, m4.trs([Math.sin(a) * 2.3, 0.75, Math.cos(a) * 2.3], a)));
      put(paint(capsuleBetween([Math.sin(a) * 1.45, 0.5, Math.cos(a) * 1.45], [Math.sin(a) * 1.6, 0.5, Math.cos(a) * 1.6], 0.07, 6), MAT.CLAY, 2, id), M);
    }
    put(paint(ball(0.11), MAT.BULB, 18, id), m4.mul(M, m4.trs([0, 2.14, 0])));
    put(paint(capsuleBetween([0, 1.95, 0], [0, 2.06, 0], 0.04, 6), MAT.CLAY, 2, id), M);
  }

  // ---- the dish pedestal (the head moves)
  {
    const id = IDS.DISH, M = m4.trs([DISH.x, 0, DISH.z], 0);
    put(paint(cylinder(0.75, -0.1, 0.35, 28, 0.1), MAT.CLAY, 2, id, groundAO(0.5, 0.3)), M);
    put(paint(cylinder(0.32, 0.3, 1.55, 20, 0.06), MAT.CLAY, 11, id, groundAO(0.6, 0.6)), M);
  }

  // ---- the cabin, its bench and lamp
  {
    const id = IDS.CABIN, M = m4.trs([CABIN.x, 0, CABIN.z], CABIN.rot);
    const f = p => {
      const box = sd.box([p[0], p[1] - 0.47, p[2]], [1.05, 0.63, 0.8], 0.14);
      const roof = sd.cyl([p[0], p[1] - 0.95, p[2]], 'x', 0.92, 1.18, 0.1);
      return Math.max(sd.smin(box, Math.max(roof, -(p[1] - 0.95)), 0.06), -p[1] - 0.02) + 0.012 * vnoise(p[0] * 2.3, p[1] * 2.3, p[2] * 2.3 + 4);
    };
    const body = sdfMesh(f, 1.25, 0.95, 0.95, { step: 0.1, centre: [0, 0.93, 0] });
    paint(body, MAT.CLAY, 21, id, groundAO(0.55, 0.4));
    // the roof part reads brick red
    for (let k = 0; k < body.p.length / 3; k++) if (body.p[k * 3 + 1] > 1.02) body.e[k * 4 + 2] = 12;
    put(body, M);
    // porthole window (front, facing −z) and door
    put(paint(cylinder(0.27, 0, 0.06, 24, 0.02), MAT.CLAY, 5, id), m4.mul(M, m4.trs([0.42, 0.68, -0.8], 0, 1, Math.PI / 2)));
    put(paint(cylinder(0.2, 0, 0.08, 24, 0.02), MAT.GLASS, 18, id), m4.mul(M, m4.trs([0.42, 0.68, -0.8], 0, 1, Math.PI / 2)));
    put(paint(roundedBox(0.46, 0.8, 0.1, 0.05, { step: 0.3, k: 2 }), MAT.CLAY, 5, id), m4.mul(M, m4.trs([-0.38, 0.42, -0.8])));
    put(paint(ball(0.06), MAT.BULB, 18, id), m4.mul(M, m4.trs([-0.38, 0.95, -0.86])));
    // vent pipe and aerial
    put(paint(capsuleBetween([0.7, 1.4, 0.3], [0.7, 2.0, 0.3], 0.07, 8), MAT.CLAY, 2, id), M);
    put(paint(capsuleBetween([-0.75, 1.3, 0.4], [-0.75, 2.6, 0.4], 0.025, 6), MAT.CLAY, 2, id), M);
    put(paint(ball(0.05), MAT.BULB, 18, id), m4.mul(M, m4.trs([-0.75, 2.64, 0.4])));
    // bench, facing Neptune
    const B = m4.trs([BENCH.x, 0, BENCH.z], BENCH.rot);
    put(paint(roundedBox(1.0, 0.07, 0.32, 0.03, { step: 0.4, k: 2 }), MAT.CLAY, 9, id), m4.mul(B, m4.trs([0, 0.3, 0])));
    for (const sx of [-0.4, 0.4]) put(paint(roundedBox(0.07, 0.3, 0.28, 0.02, { step: 0.4, k: 2 }), MAT.CLAY, 5, id, groundAO(0.5, 0.2)), m4.mul(B, m4.trs([sx, 0.14, 0])));
    // a small crate and a flask on it
    put(paint(roundedBox(0.4, 0.34, 0.4, 0.05, { step: 0.4, k: 2, wobble: 0.01 }), MAT.CLAY, 17, id, groundAO(0.5, 0.3)), m4.mul(B, m4.trs([0.85, 0.17, 0.05], 0.3)));
    put(paint(cylinder(0.07, 0.34, 0.52, 12, 0.03), MAT.CLAY, 3, id), m4.mul(B, m4.trs([0.85, 0, 0.05])));
  }

  // ---- a little rover, parked
  {
    const id = IDS.CABIN, M = m4.trs([6.9, 0, 9.6], -0.5);
    put(paint(roundedBox(0.95, 0.42, 1.5, 0.16, { step: 0.3, k: 3, wobble: 0.01, seed: 7 }), MAT.CLAY, 4, id, groundAO(0.6, 0.3)), m4.mul(M, m4.trs([0, 0.42, 0])));
    put(paint(roundedBox(0.8, 0.36, 0.62, 0.14, { step: 0.3, k: 3, wobble: 0.01, seed: 8 }), MAT.CLAY, 3, id), m4.mul(M, m4.trs([0, 0.76, -0.28])));
    put(paint(roundedBox(0.62, 0.2, 0.06, 0.05, { step: 0.3, k: 2 }), MAT.GLASS, 18, id), m4.mul(M, m4.trs([0, 0.8, -0.6])));
    for (const [wx, wz] of [[-0.52, -0.5], [0.52, -0.5], [-0.52, 0.5], [0.52, 0.5]]) put(paint(cylinder(0.24, -0.1, 0.1, 18, 0.06), MAT.CLAY, 20, id, groundAO(0.7, 0.2)), m4.mul(M, m4.trs([wx, 0.24, wz], 0, 1, 0, Math.PI / 2)));
    put(paint(capsuleBetween([0.3, 0.9, 0.5], [0.3, 1.5, 0.5], 0.02, 6), MAT.CLAY, 2, id), M);
  }

  // ---- lamp posts
  for (const [x, z] of LAMPS) {
    put(paint(capsuleBetween([x, 0, z], [x, 1.25, z], 0.05, 8), MAT.CLAY, 2, 0, groundAO(0.6, 0.3)), null);
    put(paint(capsuleBetween([x, 1.25, z], [x + 0.25, 1.32, z], 0.04, 6), MAT.CLAY, 2, 0), null);
    put(paint(ball(0.09), MAT.BULB, 18, 0), m4.trs([x + 0.3, 1.24, z]));
  }

  // ---- the power line: a fat superconducting cable on little stands, reactor to halls
  {
const route = catmull([[REACTOR.x - 1.3, REACTOR.z - 1.1], [8.8, -4.4], toWorld(HALLS[1], 0, HALLS[1].L / 2 + 0.25)], 6);
    const route2 = catmull([[REACTOR.x - 1.6, REACTOR.z + 0.6], [7.8, 1.4], toWorld(HALLS[2], 0, HALLS[2].L / 2 + 0.25)], 6);
    const route3 = catmull([toWorld(HALLS[2], 0, -HALLS[2].L / 2 - 0.25), [-0.9, 0.2], toWorld(HALLS[0], 0, HALLS[0].L / 2 + 0.25)], 6);
    const route4 = catmull([toWorld(HALLS[2], 0, -HALLS[2].L / 2 - 0.25), [-2.8, 2.6], toWorld(HALLS[3], 0, HALLS[3].L / 2 + 0.25)], 6);
    for (const r of [route, route2, route3, route4]) {
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1];
        const ya = height(a[0], a[1]) + 0.32, yb = height(b[0], b[1]) + 0.32;
        put(paint(capsuleBetween([a[0], ya, a[1]], [b[0], yb, b[1]], 0.09, 8), MAT.CABLE, 13, 0), null);
        if (i % 2 === 0) put(paint(roundedBox(0.12, 0.34, 0.3, 0.04, { step: 0.4, k: 2 }), MAT.CLAY, 2, 0, groundAO(0.5, 0.2)), m4.trs([a[0], height(a[0], a[1]) + 0.16, a[1]], Math.atan2(b[0] - a[0], b[1] - a[1])));
      }
    }
  }

  // ---- ice blocks on the cantaloupe ground, and marker poles at the rim
  const rocks = [[12.0, 2.6, 0.42], [6.2, -9.8, 0.55], [2.2, -10.8, 0.34], [-1.8, -11.3, 0.42], [11.6, -5.4, 0.3], [8.4, -9.4, 0.3], [12.4, 0.2, 0.26]];
  rocks.forEach(([x, z, s], k) => {
    const f = p => sd.box(p, [s, s * 0.6, s * 0.8], s * 0.45) + 0.08 * s * vnoise(p[0] * 3 / s + k, p[1] * 3 / s, p[2] * 3 / s);
    const rock = sdfMesh(f, s * 1.1, s * 0.75, s * 0.95, { step: s * 0.22 });
    paint(rock, MAT.CLAY, 16, 0, y => 0.6 + 0.4 * smooth(-s * 0.5, s * 0.4, y));
    put(rock, m4.trs([x, height(x, z) + s * 0.25, z], k * 1.3, 1, 0.1, 0.05 * k));
  });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.4, r = R_TOP - 0.7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = height(x, z);
    put(paint(capsuleBetween([x, y - 0.05, z], [x, y + 0.7, z], 0.035, 6), MAT.CLAY, 11, 0), null);
    put(paint(capsuleBetween([x, y + 0.55, z], [x, y + 0.72, z], 0.045, 6), MAT.CLAY, 3, 0), null);
  }
  return { props, halls };
}

/** The dish head (bowl, feed and struts), pivoting about the elevation axis at the origin. */
export function dishHeadMesh() {
  const m = new Mesh();
  const prof = [];
  const R = 1.55, F = 1.1;
  // outer back surface, rim, then the inner bowl (walked with the solid on the left)
  for (let i = 0; i <= 12; i++) { const r = R * i / 12; prof.push([r, (r * r) / (4 * F) - 0.07]); }
  prof.push([R + 0.04, R * R / (4 * F) - 0.02]);
  prof.push([R + 0.02, R * R / (4 * F) + 0.04]);
  for (let i = 12; i >= 0; i--) { const r = R * i / 12; prof.push([r, (r * r) / (4 * F)]); }
  m.add(paint(lathe(prof, 48), MAT.CLAY, 13, IDS.DISH));
  // hub
  m.add(paint(cylinder(0.32, -0.32, 0.02, 20, 0.06), MAT.CLAY, 11, IDS.DISH));
  // feed on three struts
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2;
    const base = [Math.cos(a) * 1.3, 1.3 * 1.3 / (4 * F), Math.sin(a) * 1.3];
    m.add(paint(capsuleBetween(base, [0, F - 0.12, 0], 0.03, 6), MAT.CLAY, 2, IDS.DISH));
  }
  m.add(paint(cylinder(0.13, F - 0.2, F + 0.08, 14, 0.04), MAT.CLAY, 3, IDS.DISH));
  // yoke arms (stay with the head for simplicity)
  return m;
}

// ---- the caretaker -----------------------------------------------------------------
export function personParts() {
  const id = IDS.PERSON;
  const ball = (r, pal, mat = MAT.CLAY) => { const s = icosphere(2); for (let k = 0; k < s.p.length; k++) s.p[k] *= r; return paint(s, mat, pal, id); };
  const parts = {};
  // torso: a puffy rounded box
  parts.torso = paint(roundedBox(0.3, 0.34, 0.22, 0.1, { step: 0.2, k: 3 }), MAT.CLAY, 14, id);
  parts.helmet = ball(0.17, 13);
  const visor = icosphere(2);
  for (let k = 0; k < visor.p.length / 3; k++) { visor.p[k * 3] *= 0.13; visor.p[k * 3 + 1] *= 0.1; visor.p[k * 3 + 2] *= 0.08; }
  parts.visor = paint(visor, MAT.GLOSS, 15, id);
  parts.pack = paint(roundedBox(0.24, 0.28, 0.12, 0.05, { step: 0.2, k: 2 }), MAT.CLAY, 12, id);
  parts.arm = paint(capsuleBetween([0, 0, 0], [0, -0.24, 0], 0.055, 8), MAT.CLAY, 14, id);
  parts.leg = paint(capsuleBetween([0, 0, 0], [0, -0.22, 0], 0.065, 8), MAT.CLAY, 14, id);
  parts.boot = paint(roundedBox(0.11, 0.07, 0.16, 0.03, { step: 0.2, k: 2 }), MAT.CLAY, 20, id);
  return parts;
}

// ---- puffs (the geyser) ---------------------------------------------------------------
export const PUFF_COUNT = 190;
/**
 * The plume as cotton-wool puffs: up the column, over at the top, then away downwind.
 * Real plumes on Triton rise about 8 km and trail 100+ km; this one is shown small.
 */
export function puffAt(i, t) {
  const r = k => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const life = 64 + 26 * r(1);                 // seconds for one puff's journey
  const a = (((t / life + r(2)) % 1) + 1) % 1;
  const big = r(3) > 0.88 ? 1.4 : 1;
  const top = 8.0 + 1.0 * r(4);
  const colT = 0.42;
  let x, y, z, size, dark, opacity = 1;
  if (a < colT) {
    const u = a / colT;                         // rising, slowing gently
    y = 0.05 + top * (0.55 * u + 0.45 * (1 - (1 - u) * (1 - u)));
    const sway = 0.06 + 0.32 * u * u;
    const lean = 1.1 * u * u * u;
    const ang = r(6) * 6.283 + u * 2.6;
    x = VENT.x + Math.cos(ang) * sway * r(7) + WIND[0] * lean;
    z = VENT.z + Math.sin(ang) * sway * r(7) + WIND[1] * lean;
    size = (0.17 + 0.22 * u) * (0.8 + 0.4 * r(8)) * big;
    dark = 0.5 + 0.45 * r(14);
  } else {
    const u = (a - colT) / (1 - colT);          // a long thin tail downwind, sinking a little
    const d = 1.2 + u * 21 * (0.85 + 0.3 * r(9));
    const spread = (0.2 + 1.5 * u) * (r(10) * 2 - 1);
    y = top + 0.3 + 0.6 * (r(11) * 2 - 1) * (0.3 + 1.2 * u) - u * u * 2.2;
    x = VENT.x + WIND[0] * d - WIND[1] * spread;
    z = VENT.z + WIND[1] * d + WIND[0] * spread;
    size = (0.34 + 0.3 * u) * (0.7 + 0.6 * r(12)) * big;
    dark = 0.4 + 0.35 * r(13);
    opacity = 1 - 0.92 * Math.pow(u, 0.65);
  }
  const fade = Math.min(1, a / 0.02) * (1 - Math.max(0, (a - 0.85) / 0.15));
  return { x, y, z, size: size * fade, dark, opacity, a };
}

// ---- the ground map (baked once) -----------------------------------------------------
// R: open-sky occlusion near buildings, G: trodden paths, B: plume deposits, A: cantaloupe.
export function bakeGround(N = 512) {
  const data = new Uint8Array(N * N * 4);
  const S = R_TOP + 1;
  // path segments
  const segs = [];
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) segs.push([p[i], p[i + 1]]);
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ((i + 0.5) / N * 2 - 1) * S, z = ((j + 0.5) / N * 2 - 1) * S;
    // occlusion
    let ao = 1;
    for (const f of FOOTPRINTS) {
      const d = footprintDist(f, x, z) + (f.kind === 'hall' ? 0.25 : 0);
      if (d < 4) ao *= 1 - 0.62 * Math.exp(-Math.max(d, 0) / (0.28 + 0.16 * f.height));
    }
    // lamp posts, poles: tiny
    for (const [lx, lz] of LAMPS) { const d = Math.hypot(x - lx, z - lz); ao *= 1 - 0.35 * Math.exp(-d * d / 0.05); }
    // paths
    let path = 0;
    for (const [a, b] of segs) {
      if (x < Math.min(a[0], b[0]) - 0.8 || x > Math.max(a[0], b[0]) + 0.8 || z < Math.min(a[1], b[1]) - 0.8 || z > Math.max(a[1], b[1]) + 0.8) continue;
      const d = segDist(x, z, a, b);
      if (d < 0.8) path = Math.max(path, 1 - smooth(0.16, 0.55, d));
    }
    // texture the path: footprints and two worn ruts
    path *= 0.75 + 0.25 * vnoise(x * 6, z * 6, 1);
    // plume deposits: dark streaks fanning downwind from the vent
    const vx = x - VENT.x, vz = z - VENT.z;
    const u = vx * WIND[0] + vz * WIND[1], v = -vx * WIND[1] + vz * WIND[0];
    let dep = 0;
    if (u > -0.6) {
      const spread = 0.35 + 0.22 * Math.max(u, 0);
      for (let s = 0; s < 4; s++) {
        const ang = (s - 1.5) * 0.11 + 0.03 * Math.sin(s * 5.1);
        const vv = v - u * ang;
        const w = spread * (0.5 + 0.3 * Math.sin(s * 3.3 + 1));
        dep += Math.exp(-(vv * vv) / (w * w)) * (0.55 + 0.45 * vnoise(u * 0.8 + s * 7, vv * 3, 2)) * (1 - smooth(4 + s * 2.4, 10 + s * 2, u));
      }
      dep *= smooth(-0.6, 0.6, u);
      dep = Math.min(1, dep * 0.75) * (0.7 + 0.3 * vnoise(x * 2.2, z * 2.2, 5));
    }
    const vd = Math.hypot(vx, vz);
    dep = Math.max(dep, 0.85 * Math.exp(-vd * vd / 0.6));
    const k = (j * N + i) * 4;
    data[k] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
    data[k + 1] = Math.round(Math.max(0, Math.min(1, path)) * 255);
    data[k + 2] = Math.round(Math.max(0, Math.min(1, dep)) * 255);
    data[k + 3] = Math.round(cantaloupe(x, z) * 255);
  }
  return { data, N, S };
}

/** Pick targets: oriented boxes in world space. */
export function pickTargets() {
  const t = [];
  HALLS.forEach((h, i) => t.push({ id: IDS.HALL0 + i, kind: 'hall', i, c: [h.x, (HW + h.W / 2 + 1.4) / 2, h.z], rot: h.rot, half: [h.W / 2 + 0.2, (HW + h.W / 2 + 1.6) / 2, h.L / 2 + 0.2] }));
  t.push({ id: IDS.REACTOR, kind: 'reactor', c: [REACTOR.x, 1.1, REACTOR.z], rot: 0, half: [2.6, 1.2, 2.6] });
  t.push({ id: IDS.DISH, kind: 'dish', c: [DISH.x, 1.6, DISH.z], rot: 0, half: [1.6, 1.6, 1.6] });
  t.push({ id: IDS.CABIN, kind: 'cabin', c: [CABIN.x, 0.9, CABIN.z], rot: CABIN.rot, half: [1.4, 1.1, 1.2] });
  t.push({ id: IDS.GEYSER, kind: 'geyser', c: [VENT.x, 4.5, VENT.z], rot: 0, half: [0.9, 4.6, 0.9] });
  return t;
}

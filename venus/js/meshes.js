// Procedural meshes. Everything is flat-shaded: crisp planes take light the way a
// painter blocks in a form.

import { mulberry } from './noise.js';

function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// Triangles (array of [a,b,c] points) -> flat-shaded buffers.
export function flat(tris) {
  const positions = [], normals = [], indices = [];
  for (const [a, b, c] of tris) {
    const n = normalize(cross(sub(b, a), sub(c, a)));
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c);
    normals.push(...n, ...n, ...n);
    indices.push(i, i + 1, i + 2);
  }
  return { positions, normals, indices };
}

export function merge(...parts) {
  const out = { positions: [], normals: [], indices: [] };
  for (const p of parts) {
    const base = out.positions.length / 3;
    out.positions.push(...p.positions); out.normals.push(...p.normals);
    for (const i of p.indices) out.indices.push(i + base);
  }
  return out;
}

export function transform(m, { t = [0, 0, 0], s = [1, 1, 1], ry = 0 }) {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const P = [], N = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    let x = m.positions[i] * s[0], y = m.positions[i + 1] * s[1], z = m.positions[i + 2] * s[2];
    P.push(x * c - z * sn + t[0], y + t[1], x * sn + z * c + t[2]);
    let nx = m.normals[i] / s[0], ny = m.normals[i + 1] / s[1], nz = m.normals[i + 2] / s[2];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    N.push(nx * c - nz * sn, ny, nx * sn + nz * c);
  }
  return { positions: P, normals: N, indices: m.indices.slice() };
}

export function icosphere(sub = 2) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(normalize);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (!cache.has(k)) { const p = normalize([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]); cache.set(k, v.length); v.push(p); }
      return cache.get(k);
    };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return { v, f };
}

// A faceted stone: the intersection of random half-spaces, sampled on an icosphere.
// `flatness` squashes it into a slab like the platy basalt at the Venera sites.
export function rock(seed, flatness = 0.5) {
  const r = mulberry(seed);
  const planes = [];
  const n = 11 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    planes.push({ n: [s * Math.cos(a), u, s * Math.sin(a)], d: 0.62 + r() * 0.38 });
  }
  // slabs: a flat top and a cut base
  planes.push({ n: [r() * 0.15, 1, r() * 0.15], d: 0.42 + 0.4 * (1 - flatness) });
  planes.push({ n: [0, -1, 0], d: 0.55 });
  for (const p of planes) p.n = normalize(p.n);
  const { v, f } = icosphere(3);
  const pts = v.map(dir => {
    let rad = 1.35;
    for (const p of planes) { const c = dir[0] * p.n[0] + dir[1] * p.n[1] + dir[2] * p.n[2]; if (c > 0.02) rad = Math.min(rad, p.d / c); }
    return [dir[0] * rad, dir[1] * rad * (1 - flatness * 0.35), dir[2] * rad];
  });
  // normalise: unit width (about 1 across), resting on y = 0 at its lowest point
  let mx = 0, minY = 1e9;
  for (const p of pts) { mx = Math.max(mx, Math.hypot(p[0], p[2])); minY = Math.min(minY, p[1]); }
  const k = 0.5 / mx;
  const P = pts.map(p => [p[0] * k, (p[1] - minY) * k, p[2] * k]);
  return flat(f.map(([a, b, c]) => [P[a], P[b], P[c]]));
}

export function box(w = 1, h = 1, d = 1, y0 = 0) {
  const x = w / 2, z = d / 2, y1 = y0 + h;
  const P = [[-x, y0, -z], [x, y0, -z], [x, y1, -z], [-x, y1, -z], [-x, y0, z], [x, y0, z], [x, y1, z], [-x, y1, z]];
  const q = (a, b, c, d) => [[P[a], P[b], P[c]], [P[a], P[c], P[d]]];
  return flat([...q(0, 3, 2, 1), ...q(4, 5, 6, 7), ...q(0, 4, 7, 3), ...q(1, 2, 6, 5), ...q(3, 7, 6, 2), ...q(0, 1, 5, 4)]);
}

export function cylinder(sides = 8, r0 = 0.5, r1 = 0.5, h = 1, y0 = 0, caps = true) {
  const tris = [];
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2, b = (i + 1) / sides * Math.PI * 2;
    const p0 = [Math.cos(a) * r0, y0, Math.sin(a) * r0], p1 = [Math.cos(b) * r0, y0, Math.sin(b) * r0];
    const q0 = [Math.cos(a) * r1, y0 + h, Math.sin(a) * r1], q1 = [Math.cos(b) * r1, y0 + h, Math.sin(b) * r1];
    tris.push([p0, q0, q1], [p0, q1, p1]);
    if (caps) { tris.push([[0, y0 + h, 0], q1, q0]); tris.push([[0, y0, 0], p0, p1]); }
  }
  return flat(tris);
}

// A low hexagonal prism (Birch's unit hexagon): circumradius 1, height h.
export function hexPrism(h = 1, bevel = 0.0) {
  const tris = [];
  const pt = (i, r, y) => { const a = Math.PI / 6 + i * Math.PI / 3; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  for (let i = 0; i < 6; i++) {
    const a0 = pt(i, 1, 0), a1 = pt(i + 1, 1, 0), b0 = pt(i, 1 - bevel, h), b1 = pt(i + 1, 1 - bevel, h);
    tris.push([a0, b0, b1], [a0, b1, a1]);
    tris.push([[0, h, 0], b1, b0]);
    tris.push([[0, 0, 0], a0, a1]);
  }
  return flat(tris);
}

// A house: walls and a pitched roof, footprint 1 x 1, wall height 1, roof rises 0.5.
export function house() {
  const walls = box(1, 1, 1, 0);
  const r = 0.56;
  const A = [-r, 1, -0.6], B = [r, 1, -0.6], C = [r, 1, 0.6], D = [-r, 1, 0.6], E = [0, 1.5, -0.6], F = [0, 1.5, 0.6];
  const roof = flat([[A, E, F], [A, F, D], [B, C, F], [B, F, E], [A, B, E], [D, F, C]]);
  return { walls, roof };
}

// Stacked cone conifer and a lumpy broadleaf crown (unit height).
export function conifer() {
  return merge(cylinder(5, 0.06, 0.05, 0.25, 0, false), cylinder(7, 0.42, 0.0, 0.5, 0.18), cylinder(7, 0.33, 0.0, 0.42, 0.42), cylinder(7, 0.22, 0.0, 0.34, 0.66));
}
export function broadleaf(seed) {
  const r = mulberry(seed);
  const trunk = cylinder(5, 0.07, 0.05, 0.45, 0, false);
  const { v, f } = icosphere(1);
  const pts = v.map(d => { const k = 0.85 + r() * 0.3; return [d[0] * 0.45 * k, 0.72 + d[1] * 0.36 * k, d[2] * 0.45 * k]; });
  return merge(trunk, flat(f.map(([a, b, c]) => [pts[a], pts[b], pts[c]])));
}

// A tent over a hexagon: low membrane with a ridge, circumradius 1.
export function tent() {
  const tris = [];
  const pt = (i, r, y) => { const a = Math.PI / 6 + i * Math.PI / 3; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  for (let i = 0; i < 6; i++) {
    const a0 = pt(i, 1, 0), a1 = pt(i + 1, 1, 0), m0 = pt(i, 0.62, 0.7), m1 = pt(i + 1, 0.62, 0.7);
    tris.push([a0, m0, m1], [a0, m1, a1], [m0, [0, 1, 0], m1]);
  }
  return flat(tris);
}

// Tilt a mesh about the x axis then the z axis (radians): for slabs lying askew.
export function tilt(m, ax, az) {
  const ca = Math.cos(ax), sa = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az);
  const rot = (x, y, z) => { const y1 = y * ca - z * sa, z1 = y * sa + z * ca; return [x * cz - y1 * sz, x * sz + y1 * cz, z1]; };
  const P = [], N = [];
  let minY = 1e9;
  for (let i = 0; i < m.positions.length; i += 3) { const p = rot(m.positions[i], m.positions[i + 1], m.positions[i + 2]); P.push(...p); minY = Math.min(minY, p[1]); N.push(...rot(m.normals[i], m.normals[i + 1], m.normals[i + 2])); }
  for (let i = 1; i < P.length; i += 3) P[i] -= minY;
  return { positions: P, normals: N, indices: m.indices.slice() };
}

// A tuft of grass: thin blades fanning up from a point (unit height).
export function tuft(seed, blades = 7) {
  const r = mulberry(seed);
  const tris = [];
  for (let i = 0; i < blades; i++) {
    const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.35, h = 0.6 + r() * 0.4, w = 0.035 + r() * 0.03;
    const ox = Math.cos(a) * 0.08, oz = Math.sin(a) * 0.08;
    const px = Math.cos(a + Math.PI / 2) * w, pz = Math.sin(a + Math.PI / 2) * w;
    const tip = [ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean];
    tris.push([[ox - px, 0, oz - pz], [ox + px, 0, oz + pz], tip]);
  }
  return flat(tris);
}
// A bench: a plank seat on two blocks, with a back (about 2 m long).
export function bench() {
  return merge(
    box(1.9, 0.07, 0.42, 0.42),
    transform(box(0.12, 0.42, 0.4, 0), { t: [-0.75, 0, 0] }),
    transform(box(0.12, 0.42, 0.4, 0), { t: [0.75, 0, 0] }),
    transform(box(1.9, 0.32, 0.05, 0.62), { t: [0, 0, -0.19] }),
  );
}

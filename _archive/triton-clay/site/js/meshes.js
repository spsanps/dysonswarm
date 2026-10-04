// Mesh builders. Everything is "modelled" the way you'd model clay: rounded boxes,
// shapes pressed out of signed distance functions, things turned on a lathe.
// Every builder returns {pos, nrm, ext, idx}; ext carries per-vertex extras
// (x: zone/material blend, y: baked occlusion, z, w: free).

export class Mesh {
  constructor() { this.p = []; this.n = []; this.e = []; this.i = []; }
  vert(p, n, e) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.e.push(...(e || [0, 1, 0, 0])); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  /** Append another mesh, transformed by a 4×4 column-major matrix (rotation + uniform scale + translation). */
  add(m, mat, ext) {
    const base = this.p.length / 3;
    for (let k = 0; k < m.p.length; k += 3) {
      let x = m.p[k], y = m.p[k + 1], z = m.p[k + 2], nx = m.n[k], ny = m.n[k + 1], nz = m.n[k + 2];
      if (mat) {
        const px = mat[0] * x + mat[4] * y + mat[8] * z + mat[12], py = mat[1] * x + mat[5] * y + mat[9] * z + mat[13], pz = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
        const qx = mat[0] * nx + mat[4] * ny + mat[8] * nz, qy = mat[1] * nx + mat[5] * ny + mat[9] * nz, qz = mat[2] * nx + mat[6] * ny + mat[10] * nz;
        const l = Math.hypot(qx, qy, qz) || 1;
        x = px; y = py; z = pz; nx = qx / l; ny = qy / l; nz = qz / l;
      }
      this.p.push(x, y, z); this.n.push(nx, ny, nz);
      const j = (k / 3) * 4;
      this.e.push(...(ext || [m.e[j], m.e[j + 1], m.e[j + 2], m.e[j + 3]]));
    }
    for (const idx of m.i) this.i.push(idx + base);
    return this;
  }
  done() { return { pos: new Float32Array(this.p), nrm: new Float32Array(this.n), ext: new Float32Array(this.e), idx: this.i }; }
}

// ---- noise for hand-made unevenness ------------------------------------------
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
}

// Axis samples for a box side of half-length e with rounding r: dense in the rounding.
function axisSamples(e, r, maxStep, k) {
  const out = [];
  const inner = Math.max(0, e - r);
  for (let i = 0; i < k; i++) out.push(-e + (r * i) / k);
  const m = Math.max(1, Math.ceil((2 * inner) / maxStep));
  for (let i = 0; i < m; i++) out.push(-inner + (2 * inner * i) / m);
  for (let i = 0; i <= k; i++) out.push(inner + (r * i) / k);
  return out;
}

/** A rounded box (half extents ex, ey, ez; corner radius r), optional wobble. */
export function roundedBox(w, h, d, r, opt = {}) {
  const e = [w / 2, h / 2, d / 2];
  r = Math.min(r, e[0], e[1], e[2]);
  const inner = e.map(v => v - r);
  const step = opt.step || 0.35, k = opt.k || 4;
  const S = e.map(v => axisSamples(v, r, step, k));
  const m = new Mesh();
  const wob = opt.wobble || 0, seed = opt.seed || 0;
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const su = S[u], sv = S[v], base = m.p.length / 3;
    for (let j = 0; j < sv.length; j++) for (let i = 0; i < su.length; i++) {
      const P = [0, 0, 0];
      P[a] = s * e[a]; P[u] = su[i]; P[v] = sv[j];
      const q = P.map((x, c) => Math.max(-inner[c], Math.min(inner[c], x)));
      let n = [P[0] - q[0], P[1] - q[1], P[2] - q[2]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = n.map(x => x / l);
      let p = [q[0] + n[0] * r, q[1] + n[1] * r, q[2] + n[2] * r];
      if (wob) {
        const o = wob * vnoise(p[0] * 1.7 + seed, p[1] * 1.7, p[2] * 1.7);
        p = [p[0] + n[0] * o, p[1] + n[1] * o, p[2] + n[2] * o];
      }
      m.vert(p, n);
    }
    const nu = su.length;
    for (let j = 0; j < sv.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const A = base + j * nu + i, B = A + 1, C = A + nu, D = C + 1;
      if (s > 0) { m.tri(A, B, D); m.tri(A, D, C); } else { m.tri(A, D, B); m.tri(A, C, D); }
    }
  }
  return m;
}

/**
 * Press a mesh out of a signed distance function: start on the faces of a box that
 * contains the shape and slide every vertex down the distance gradient onto the surface.
 * Works for convex-ish shapes with rounded edges (halls, domes, cabins, rocks).
 */
export function sdfMesh(f, ex, ey, ez, opt = {}) {
  const step = opt.step || 0.3;
  const S = [ex, ey, ez].map(v => {
    const n = Math.max(2, Math.ceil(2 * v / step));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(-v + 2 * v * i / n);
    return out;
  });
  const e = [ex, ey, ez];
  const m = new Mesh();
  const eps = 1e-3;
  const grad = p => {
    const gx = f([p[0] + eps, p[1], p[2]]) - f([p[0] - eps, p[1], p[2]]);
    const gy = f([p[0], p[1] + eps, p[2]]) - f([p[0], p[1] - eps, p[2]]);
    const gz = f([p[0], p[1], p[2] + eps]) - f([p[0], p[1], p[2] - eps]);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  const centre = opt.centre || [0, 0, 0];
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const su = S[u], sv = S[v], base = m.p.length / 3;
    for (let j = 0; j < sv.length; j++) for (let i = 0; i < su.length; i++) {
      let p = [0, 0, 0];
      p[a] = s * e[a]; p[u] = su[i]; p[v] = sv[j];
      p = [p[0] + centre[0], p[1] + centre[1], p[2] + centre[2]];
      // Slide down the distance gradient onto the surface.
      for (let it = 0; it < 24; it++) {
        const d = f(p);
        if (Math.abs(d) < 1e-4) break;
        const g = grad(p);
        p = [p[0] - g[0] * d, p[1] - g[1] * d, p[2] - g[2] * d];
      }
      m.vert(p, grad(p));
    }
    const nu = su.length;
    for (let j = 0; j < sv.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const A = base + j * nu + i, B = A + 1, C = A + nu, D = C + 1;
      if (s > 0) { m.tri(A, B, D); m.tri(A, D, C); } else { m.tri(A, D, B); m.tri(A, C, D); }
    }
  }
  return m;
}

/**
 * Turn a profile on a lathe. `prof` is a list of [r, y] points walked with the solid
 * on the left, so normals face right of the direction of travel.
 */
export function lathe(prof, segs, opt = {}) {
  const m = new Mesh();
  const n = prof.length;
  const norms2 = prof.map((p, i) => {
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l];
  });
  const sharp = opt.sharp || new Set();
  // Duplicate vertices at sharp corners so the shading creases there.
  const rows = [];
  prof.forEach((p, i) => {
    if (sharp.has(i) && i > 0 && i < n - 1) {
      const a = prof[i - 1], b = prof[i + 1];
      const t1 = [p[0] - a[0], p[1] - a[1]], t2 = [b[0] - p[0], b[1] - p[1]];
      const l1 = Math.hypot(...t1) || 1, l2 = Math.hypot(...t2) || 1;
      rows.push([p, [t1[1] / l1, -t1[0] / l1], true]);
      rows.push([p, [t2[1] / l2, -t2[0] / l2], false]);
    } else rows.push([p, norms2[i], false]);
  });
  const arc = opt.arc || Math.PI * 2;
  for (let j = 0; j <= segs; j++) {
    const t = (j / segs) * arc, c = Math.cos(t), s = Math.sin(t);
    for (const [p, nn] of rows) m.vert([p[0] * c, p[1], p[0] * s], [nn[0] * c, nn[1], nn[0] * s], [0, 1, j / segs, 0]);
  }
  const R = rows.length;
  for (let j = 0; j < segs; j++) for (let i = 0; i < R - 1; i++) {
    if (rows[i][2]) continue; // gap between duplicated crease rows
    const A = j * R + i, B = A + 1, C = A + R, D = C + 1;
    m.tri(A, B, D); m.tri(A, D, C);
  }
  return m;
}

/** Unit icosphere. */
export function icosphere(sub) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(x => x / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (cache.has(key)) return cache.get(key);
      const p = v[a].map((x, i) => (x + v[b][i]) / 2), l = Math.hypot(...p);
      v.push(p.map(x => x / l));
      cache.set(key, v.length - 1);
      return v.length - 1;
    };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  const m = new Mesh();
  for (const p of v) m.vert(p, p);
  for (const [a, b, c] of f) m.tri(a, b, c);
  return m;
}

/** Cylinder between y0 and y1 (rounded rims), along y. */
export function cylinder(r, y0, y1, segs, round = 0.05) {
  const rr = Math.min(round, r * 0.5, (y1 - y0) * 0.5);
  const prof = [[0, y0]];
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; prof.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } };
  arc(r - rr, y0 + rr, -Math.PI / 2, 0);
  arc(r - rr, y1 - rr, 0, Math.PI / 2);
  prof.push([0, y1]);
  return lathe(prof, segs);
}

/** A capsule from a to b with radius r (for limbs, struts, pipes). */
export function capsuleBetween(a, b, r, segs = 10) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const prof = [];
  for (let i = 0; i <= 5; i++) { const t = -Math.PI / 2 + (Math.PI / 2) * i / 5; prof.push([r * Math.cos(t), r * Math.sin(t)]); }
  for (let i = 0; i <= 5; i++) { const t = (Math.PI / 2) * i / 5; prof.push([r * Math.cos(t), L + r * Math.sin(t)]); }
  prof[0][0] = 0; prof[prof.length - 1][0] = 0;
  const m = lathe(prof, segs);
  // Orient y along a→b.
  const y = [dx / L, dy / L, dz / L];
  const ref = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let x = [y[1] * ref[2] - y[2] * ref[1], y[2] * ref[0] - y[0] * ref[2], y[0] * ref[1] - y[1] * ref[0]];
  const lx = Math.hypot(...x); x = x.map(v => v / lx);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const mat = new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, a[0], a[1], a[2], 1]);
  return new Mesh().add(m, mat);
}

// ---- SDF primitives (for sdfMesh) ---------------------------------------------
export const sd = {
  box: (p, b, r = 0) => {
    const q = [Math.abs(p[0]) - b[0] + r, Math.abs(p[1]) - b[1] + r, Math.abs(p[2]) - b[2] + r];
    return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - r;
  },
  // Cylinder along an axis: 'x' | 'y' | 'z', radius ra, half-length h, rounding r.
  cyl: (p, axis, ra, h, r = 0) => {
    const [a, b, c] = axis === 'x' ? [p[1], p[2], p[0]] : axis === 'y' ? [p[0], p[2], p[1]] : [p[0], p[1], p[2]];
    const dx = Math.hypot(a, b) - ra + r, dy = Math.abs(c) - h + r;
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
  },
  sphere: (p, r) => Math.hypot(p[0], p[1], p[2]) - r,
  smin: (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; },
  smax: (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; },
};

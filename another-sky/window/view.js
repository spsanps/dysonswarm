/*
 * The window's camera and a low-resolution "what is out there" buffer.
 *
 * The house is imagined: a top-floor window (14 m up) on the brow of the hill
 * 400 m down the trail from Firstlight Overlook, where Another Sky starts you. It looks down the axis over
 * the big lake, the same way the explorer's first view does (yaw about -0.24).
 * Each buffer cell holds what a ray through that part of the window hits:
 * land, water or the far end wall, with its habitat coordinates and distance.
 */
(function (G) {
'use strict';
const { R, HALF, CIRC, clamp, wrap, deltaS, terrain, terrainParts, lakeField, urban, greenery, pos, upAt, tangentAt } = G.World;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

const HOUSE = { s: 1560, z: 3880, above: 14 };

function makeCamera(w, h, opts = {}) {
  const s0 = opts.s ?? HOUSE.s, z0 = opts.z ?? HOUSE.z, h0 = terrain(s0, z0) + (opts.above ?? HOUSE.above);
  const yaw = opts.yaw ?? -0.24, pitch = opts.pitch ?? 0.47, vfov = opts.vfov ?? 92 * Math.PI / 180;
  const up = upAt(s0), tan = tangentAt(s0), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fwd = norm([tan[0] * Math.sin(yaw) * cp + up[0] * sp, tan[1] * Math.sin(yaw) * cp + up[1] * sp, -Math.cos(yaw) * cp]);
  const right = norm(cross(fwd, up)), camUp = cross(right, fwd);
  const f = (h / 2) / Math.tan(vfov / 2);
  const cam = { s0, z0, h0, eye: pos(s0, z0, h0), up, fwd, right, camUp, f, w, h, cx: w / 2, cy: h / 2, yaw, pitch };
  // World point -> screen [x, y, depth]; depth <= 0 means behind the eye.
  cam.project = (p) => { const d = sub(p, cam.eye), zc = dot(d, fwd); return [cam.cx + f * dot(d, right) / zc, cam.cy - f * dot(d, camUp) / zc, zc]; };
  cam.projectHab = (s, z, hh) => cam.project(pos(s, z, hh));
  cam.ray = (x, y) => norm(add(add(fwd, mul(right, (x - cam.cx) / f)), mul(camUp, (cam.cy - y) / f)));
  cam.dist = (p) => Math.hypot(p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]);
  // Vanishing point of everything parallel to the axis (looking toward -z).
  const vp = cam.project(add(cam.eye, [0, 0, -1e7]));
  cam.vp = [vp[0], vp[1]];
  return cam;
}

// Local height map around the house for robust grazing rays near the hill.
function localHeights(cam) {
  const step = 20, s0 = cam.s0 - 2600, z0 = cam.z0 - 4400, nx = Math.round(5200 / step) + 1, nz = Math.round(4800 / step) + 1;
  const hm = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) hm[j * nx + i] = Math.max(.35, terrain(s0 + i * step, z0 + j * step));
  return (s, z) => {
    const x = (s - s0) / step, y = (z - z0) / step;
    if (x < 0 || y < 0 || x >= nx - 1 || y >= nz - 1) return Math.max(.35, terrain(s, z));
    const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy, k = iy * nx + ix;
    return (hm[k] * (1 - u) + hm[k + 1] * u) * (1 - v) + (hm[k + nx] * (1 - u) + hm[k + nx + 1] * u) * v;
  };
}

function cylT(e, d, rr) { const a = d[0] * d[0] + d[1] * d[1], b = 2 * (e[0] * d[0] + e[1] * d[1]), c = e[0] * e[0] + e[1] * e[1] - rr * rr; const disc = b * b - 4 * a * c; if (a < 1e-12 || disc < 0) return Infinity; return (-b + Math.sqrt(disc)) / (2 * a); }

/*
 * Cast one ray. Returns kind (0 land, 1 water, 2 end wall), distance t,
 * habitat s (relative to the house), z, ground height and, for the end wall,
 * its radius fraction and angle.
 */
function castRay(cam, d, hLocal, out) {
  const e = cam.eye, el = dot(d, cam.up);
  let t = Infinity;
  if (el < 0.26) {
    // March near the hill and lake, then bisect.
    let tp = 0, tt = 0.6;
    const limit = 5200, ex = e[0], ey = e[1], ez = e[2], dx = d[0], dy = d[1], dz = d[2];
    const below = m => { const px = ex + dx * m, py = ey + dy * m; return R - Math.sqrt(px * px + py * py) - hLocal(Math.atan2(px, -py) * R, ez + dz * m); };
    while (tt < limit) {
      const px = ex + dx * tt, py = ey + dy * tt, hp = R - Math.sqrt(px * px + py * py), g = hLocal(Math.atan2(px, -py) * R, ez + dz * tt);
      if (hp <= g) { let a = tp, b = tt; for (let i = 0; i < 9; i++) { const m = (a + b) / 2; if (below(m) <= 0) b = m; else a = m; } t = b; break; }
      tp = tt; tt += Math.max(1.2, Math.min(tt * 0.05, (hp - g) * 0.8), tt * 0.012);
    }
  }
  if (t === Infinity) {
    let hh = 60;
    for (let i = 0; i < 4; i++) { t = cylT(e, d, R - hh); const p = add(e, mul(d, t)); const s = Math.atan2(p[0], -p[1]) * R; hh = Math.max(.35, terrain(s, p[2])); }
    t = cylT(e, d, R - hh);
  }
  let p = add(e, mul(d, t));
  if (Math.abs(p[2]) > HALF) {
    const zc = Math.sign(p[2]) * HALF, tc = (zc - e[2]) / d[2];
    p = add(e, mul(d, tc));
    out.kind = 2; out.t = tc; out.z = zc; out.capR = Math.hypot(p[0], p[1]) / R; out.capA = Math.atan2(p[0], -p[1]);
    out.s = deltaS(Math.atan2(p[0], -p[1]) * R, cam.s0); out.h = R - Math.hypot(p[0], p[1]);
    return out;
  }
  const sAbs = wrap(Math.atan2(p[0], -p[1]) * R), z = p[2];
  const tp = terrainParts(sAbs, z);
  out.t = t; out.s = deltaS(sAbs, cam.s0); out.sAbs = sAbs; out.z = z; out.h = tp.h; out.lake = tp.field;
  out.kind = tp.h < 0.35 ? 1 : 0; out.capR = 0; out.capA = 0;
  return out;
}

/*
 * The buffer: gw x gh cells over the window. Channels are Float32Arrays.
 * Built in time slices so the page never stalls; resolves when done.
 */
async function buildBuffer(cam, gw, gh, yieldFn) {
  const n = gw * gh;
  const B = { gw, gh, kind: new Uint8Array(n), t: new Float32Array(n), s: new Float32Array(n), z: new Float32Array(n), h: new Float32Array(n), lake: new Float32Array(n), urb: new Float32Array(n), green: new Float32Array(n), ns: new Float32Array(n), nz: new Float32Array(n), capR: new Float32Array(n), capA: new Float32Array(n), el: new Float32Array(n) };
  const hLocal = localHeights(cam);
  const o = {};
  const sx = cam.w / gw, sy = cam.h / gh;
  let last = performance.now();
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i, d = cam.ray((i + .5) * sx, (j + .5) * sy);
      castRay(cam, d, hLocal, o);
      B.kind[k] = o.kind; B.t[k] = o.t; B.s[k] = o.s; B.z[k] = o.z; B.h[k] = o.h; B.el[k] = dot(d, cam.up);
      if (o.kind === 2) { B.capR[k] = o.capR; B.capA[k] = o.capA; B.lake[k] = 9; }
      else {
        B.lake[k] = o.lake; B.urb[k] = urban(o.sAbs, o.z); B.green[k] = greenery(o.sAbs, o.z);

      }
    }
    if (yieldFn && performance.now() - last > 34) { await yieldFn(); last = performance.now(); }
  }
  // Slopes from neighbouring cells (skipping silhouettes), for the shadow glazes.
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i; if (B.kind[k] === 2) continue;
    const kr = i < gw - 1 ? k + 1 : k - 1, kd = j < gh - 1 ? k + gw : k - gw;
    let ns = 0, nz = 0;
    const ok = q => B.kind[q] !== 2 && Math.abs(B.t[q] - B.t[k]) < B.t[k] * .2;
    if (ok(kr) && ok(kd)) {
      const ds1 = B.s[kr] - B.s[k], dz1 = B.z[kr] - B.z[k], dh1 = B.h[kr] - B.h[k], ds2 = B.s[kd] - B.s[k], dz2 = B.z[kd] - B.z[k], dh2 = B.h[kd] - B.h[k];
      const det = ds1 * dz2 - ds2 * dz1;
      if (Math.abs(det) > 1e-6) { ns = (dh1 * dz2 - dh2 * dz1) / det; nz = (ds1 * dh2 - ds2 * dh1) / det; }
    }
    B.ns[k] = Math.max(-1, Math.min(1, ns)); B.nz[k] = Math.max(-1, Math.min(1, nz));
  }
  return B;
}

G.View = { HOUSE, makeCamera, buildBuffer, castRay, localHeights, vec: { sub, add, mul, dot, cross, norm } };
})(window.SkyWindow = window.SkyWindow || {});

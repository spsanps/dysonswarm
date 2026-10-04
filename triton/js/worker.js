// Off the main thread: terrain chunks, the grown machine, and the 3D things near the camera.
import { R, FIN, PLANT, V, cubeDir, heightAt, setRegionMap, tangentFrame, wobble, builtYear, rowOffset, finScale, ihash3, plantSites, inPlant } from './world.js';
import { growNetwork, makeFields, fieldMap, fieldData, lattice, LANDING, offset } from './machine.js';

const N = 33;            // vertices per chunk side
let fields = null, spans = null;

function chunk(f, L, x, y) {
  const n = N + 2, size = 2 / 2 ** L, u0 = -1 + x * size, v0 = -1 + y * size;
  const P = new Float64Array(n * n * 3), Dd = new Float64Array(n * n * 3);
  let hmin = 1e9, hmax = -1e9;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = cubeDir(f, u0 + (i - 1) / (N - 1) * size, v0 + (j - 1) / (N - 1) * size);
    const h = heightAt(d), o = (j * n + i) * 3;
    if (i > 0 && j > 0 && i <= N && j <= N) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    P[o] = d[0] * (R + h); P[o + 1] = d[1] * (R + h); P[o + 2] = d[2] * (R + h);
    Dd[o] = d[0]; Dd[o + 1] = d[1]; Dd[o + 2] = d[2];
  }
  const m = (N - 1) / 2 + 1, co = (m * n + m) * 3;
  const center = [P[co], P[co + 1], P[co + 2]];
  const nv = N * N + 4 * N, pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
  const skirt = 2125e3 * size * .02 + 15;
  let rad = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = ((j + 1) * n + i + 1) * 3, k = (j * N + i) * 3;
    pos[k] = P[o] - center[0]; pos[k + 1] = P[o + 1] - center[1]; pos[k + 2] = P[o + 2] - center[2];
    rad = Math.max(rad, Math.hypot(pos[k], pos[k + 1], pos[k + 2]));
    const ax = (j + 1) * n + i + 2, bx = (j + 1) * n + i, ay = (j + 2) * n + i + 1, by = j * n + i + 1;
    const du = [P[ax * 3] - P[bx * 3], P[ax * 3 + 1] - P[bx * 3 + 1], P[ax * 3 + 2] - P[bx * 3 + 2]];
    const dv = [P[ay * 3] - P[by * 3], P[ay * 3 + 1] - P[by * 3 + 1], P[ay * 3 + 2] - P[by * 3 + 2]];
    const nn = V.norm(V.cross(du, dv));
    nrm[k] = nn[0]; nrm[k + 1] = nn[1]; nrm[k + 2] = nn[2];
  }
  // skirts hang below the four edges to hide cracks between levels
  const edge = [[0, 1, 0, 0], [0, 1, N - 1, 0], [0, 0, 0, 1], [N - 1, 0, 0, 1]];
  let s = N * N;
  for (const [i0, di, j0, dj] of edge) for (let t = 0; t < N; t++) {
    const i = i0 + di * t, j = j0 + dj * t, src = (j * N + i) * 3, o = ((j + 1) * n + i + 1) * 3, k = s * 3;
    pos[k] = pos[src] - Dd[o] * skirt; pos[k + 1] = pos[src + 1] - Dd[o + 1] * skirt; pos[k + 2] = pos[src + 2] - Dd[o + 2] * skirt;
    nrm[k] = nrm[src]; nrm[k + 1] = nrm[src + 1]; nrm[k + 2] = nrm[src + 2];
    s++;
  }
  return { pos, nrm, center, rad, hmin, hmax };
}

// ---------------------------------------------------------------------------
// Instances near the camera: 16 floats each, positions relative to `origin`.
//   pos xyz, up xyz, along xyz, size (along, height, across), kind, seed, birth, extra
// kinds: 2 radiator panel (its top band is the manifold), 3 hall, 6 suit, 7 rover, 9 leg/pylon
function instances(cam) {
  const out = [], plants = [];
  const origin = cam, camDir = V.norm(cam);
  const push = (p, up, along, sx, sy, sz, kind, seed, birth, extra) =>
    out.push(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2], up[0], up[1], up[2], along[0], along[1], along[2], sx, sy, sz, kind, seed, birth, extra);
  const FAR = 30000, NEAR = 7000, P = FIN.len + FIN.gap;
  const ground = d => R + heightAt(d);
  fields.forEach((f, fi) => {
    const dc = Math.acos(Math.min(1, V.dot(camDir, f.c))) * R;
    if (dc > f.r + FAR) return;
    const c = f.c, a = f.a, b = V.cross(a, c);
    const t = V.sub(V.mul(camDir, 1 / V.dot(camDir, c)), c);
    const uc = V.dot(t, b) * R, vc = V.dot(t, a) * R;
    const at = (u, v) => V.norm(V.add(c, V.mul(V.add(V.mul(b, u), V.mul(a, v)), 1 / R)));
    // halls along the avenue
    if (dc < f.r + 40000 && Math.hypot(uc, vc + 1000) < 40000) {
      for (const [hu, hv, len, hh] of [[-192, -1300, 760, 46], [196, -1360, 520, 38], [-188, -480, 520, 40], [192, -600, 640, 44]]) {
        const d = at(hu, hv), al = V.norm(V.sub(a, V.mul(d, V.dot(a, d))));
        push(V.mul(d, ground(d) - 2), d, al, len, hh + 2, 60, 3, ihash3(fi, hu, hv) / 4294967296, f.birth, fi);
      }
    }
    // fusion plants in their clearings
    if (dc < f.r + FAR) for (const pu of plantSites(f.kind)) {
      const d = at(pu, PLANT.v), al = V.norm(V.sub(a, V.mul(d, V.dot(a, d))));
      const p = V.mul(d, ground(d) - 4);
      plants.push(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2], d[0], d[1], d[2], al[0], al[1], al[2], PLANT.dia, PLANT.height + 4, PLANT.dia, 10, ihash3(fi, pu, 3) / 4294967296, f.birth, fi);
    }
    const k0 = Math.ceil(Math.max(-f.r, vc - FAR) / FIN.rowGap), k1 = Math.floor(Math.min(f.r, vc + FAR) / FIN.rowGap);
    for (let k = k0; k <= k1; k++) {
      const v = k * FIN.rowGap, dv = v - vc, reach = Math.sqrt(Math.max(0, FAR * FAR - dv * dv));
      const half = Math.sqrt(Math.max(0, f.r * f.r - v * v));
      const umin = Math.max(-half, uc - reach), umax = Math.min(half, uc + reach);
      if (umin >= umax) continue;
      const o = rowOffset(fi, k);
      for (let i = Math.floor((umin - o) / P); i <= Math.ceil((umax - o) / P); i++) {
        const u = o + i * P + FIN.len / 2;
        if (Math.abs(u) - FIN.len / 2 < FIN.avenue || inPlant(f.kind, u, v)) continue;
        const rr = Math.hypot(u, v), th = Math.atan2(v, u), lim = f.r * wobble(th, f.seed);
        if (rr > lim) continue;
        const dist = Math.hypot(u - uc, v - vc);
        if (dist > FAR) continue;
        const d = at(u, v), al = V.norm(V.sub(b, V.mul(d, V.dot(b, d))));
        const birth = builtYear(rr / lim, f.birth, f.years), g = ground(d);
        const hgt = FIN.height * finScale(fi, k, i);
        push(V.mul(d, g + FIN.leg), d, al, FIN.len, hgt, FIN.thick, 2, ihash3(fi, k, i) / 4294967296, birth, fi);
        if (dist < NEAR) for (const s of [-1, 1]) {
          const dl = at(u + s * (FIN.len / 2 - 8), v);
          push(V.mul(dl, ground(dl) - 6), dl, al, 5, FIN.leg + 6, 8, 9, 0, birth, fi);
        }
      }
    }
  });
  // pylons under the trunk lines
  for (let s = 0; s < spans.length; s += 11) {
    const A = [spans[s], spans[s + 1], spans[s + 2]], B = [spans[s + 3], spans[s + 4], spans[s + 5]];
    const mid = V.norm(V.add(A, B));
    if (Math.acos(Math.min(1, V.dot(mid, camDir))) * R > FAR + 4000) continue;
    const L = V.len(V.sub(B, A)), n = Math.max(1, Math.round(L / 1500));
    for (let j = 0; j < n; j++) {
      const C = V.add(A, V.mul(V.sub(B, A), (j + .5) / n)), d = V.norm(C), g = ground(d) - 8;
      const al = V.norm(V.sub(V.sub(B, A), V.mul(d, V.dot(V.sub(B, A), d))));
      push(V.mul(d, g), d, al, 10, V.len(C) - g, 10, 9, .5, spans[s + 7], -1);
    }
  }
  // people and a rover, at the landing site, for scale
  const S = offset(LANDING, 90, 30), fr = tangentFrame(S);
  const local = (e, nn) => V.norm(V.add(S, V.mul(V.add(V.mul(fr.east, e), V.mul(fr.north, nn)), 1 / R)));
  const person = (e, nn, yaw, seed) => {
    const d = local(e, nn), up = d, f2 = tangentFrame(d);
    const fw = V.add(V.mul(f2.north, Math.cos(yaw)), V.mul(f2.east, Math.sin(yaw))), side = V.cross(fw, up);
    const g = ground(d), base = V.mul(d, g);
    const P2 = (dx, dz, dy) => V.add(V.add(base, V.mul(side, dx)), V.add(V.mul(fw, dz), V.mul(up, dy)));
    for (const sx of [-.11, .11]) push(P2(sx, 0, 0), up, side, .17, .86, .22, 6, seed, 0, 1);
    push(P2(0, 0, .84), up, side, .5, .62, .34, 6, seed, 0, 2);
    push(P2(0, -.26, .88), up, side, .44, .56, .2, 6, seed, 0, 3);
    for (const sx of [-.31, .31]) push(P2(sx, 0, .82), up, side, .13, .6, .15, 6, seed, 0, 4);
    push(P2(0, 0, 1.36), up, side, .34, .34, .34, 6, seed, 0, 5);
  };
  person(6, 36, .3, .2); person(8.6, 39, -.4, .7); person(-90, 150, 1.2, .5);
  {
    const d = local(-28, 96), f2 = tangentFrame(d), g = ground(d), up = d;
    const fw = V.add(V.mul(f2.north, Math.cos(-.12)), V.mul(f2.east, Math.sin(-.12))), side = V.cross(fw, up);
    const base = V.mul(d, g), P2 = (dx, dz, dy) => V.add(V.add(base, V.mul(side, dx)), V.add(V.mul(fw, dz), V.mul(up, dy)));
    push(P2(0, 0, .45), up, fw, 7.2, 1.9, 3.1, 7, .3, 0, 1);
    push(P2(0, 2.2, 2.3), up, fw, 2.4, 1.1, 2.6, 7, .3, 0, 2);
    for (const dz of [-2.6, 0, 2.6]) for (const dx of [-1.75, 1.75]) push(P2(dx, dz, 0), up, fw, 1.1, 1.1, .5, 7, .3, 0, 3);
  }
  return { data: new Float32Array(out), plants: new Float32Array(plants) };
}

let ready = false;
const queue = [];
function handle(msg) {
  if (msg.type === 'chunk') {
    const c = chunk(msg.f, msg.L, msg.x, msg.y);
    postMessage({ type: 'chunk', key: msg.key, ...c }, [c.pos.buffer, c.nrm.buffer]);
  } else if (msg.type === 'inst') {
    const { data, plants } = instances(msg.cam);
    postMessage({ type: 'inst', id: msg.id, origin: msg.cam, data, plants }, [data.buffer, plants.buffer]);
  }
}
onmessage = e => {
  const msg = e.data;
  if (msg.type === 'init') {
    setRegionMap(msg.region, msg.rw, msg.rh);
    if (msg.machine) {
      const t0 = performance.now();
      const net = growNetwork();
      fields = makeFields(net);
      spans = lattice(net);
      const fm = fieldMap(fields), fd = fieldData(fields);
      const nodes = new Float32Array(net.nodes.length * 6);
      net.nodes.forEach((n, i) => nodes.set([n.p[0], n.p[1], n.p[2], n.parent, n.year, n.leaves], i * 6));
      const flist = fields.map(f => ({ c: f.c, r: f.r, a: f.a, birth: f.birth, years: f.years, kind: f.kind, seed: f.seed }));
      const sp = spans.slice();
      postMessage({ type: 'machine', fields: flist, fieldMap: fm.map, fmW: fm.W, fmH: fm.H, fieldData: fd, spans: sp, nodes,
        ms: performance.now() - t0 }, [fm.map.buffer, fd.buffer, sp.buffer, nodes.buffer]);
    }
    ready = true;
    while (queue.length) handle(queue.shift());
    return;
  }
  if (!ready) { queue.push(msg); return; }
  handle(msg);
};

// Triton's surface as a cube-sphere quadtree: big chunks seen from orbit, metre-scale chunks
// underfoot. Chunks are built by the workers and cached; a parent is drawn until all four
// children have arrived, so nothing ever has a hole.
import { R, cubeDir, V } from './world.js';

export const N = 33, MAX_L = 15;
const FACE_ARC = R * Math.PI / 2;

export class Terrain {
  constructor(gl, workers) {
    this.gl = gl; this.workers = workers;
    this.cache = new Map(); this.pending = new Map();
    this.frame = 0; this.inflight = workers.map(() => 0);
    this.split = 1.7; this.queue = [];
    // shared index buffer: the grid plus four skirts
    const I = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i; I.push(a, a + 1, a + N, a + 1, a + N + 1, a + N); }
    const edges = [t => t, t => (N - 1) * N + t, t => t * N, t => t * N + N - 1];
    edges.forEach((g, e) => { for (let t = 0; t < N - 1; t++) { const a = g(t), b = g(t + 1), c = N * N + e * N + t, d = c + 1; I.push(a, b, c, b, d, c); } });
    this.count = I.length;
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
    workers.forEach((w, wi) => w.addEventListener('message', e => { if (e.data.type === 'chunk') this.receive(e.data, wi); }));
  }
  receive(m, wi) {
    this.inflight[wi]--;
    this.pending.delete(m.key);
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [m.pos, m.nrm].map((data, loc) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); return b;
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
    this.cache.set(m.key, { vao, bufs, center: m.center, rad: m.rad, hmin: m.hmin, hmax: m.hmax, used: this.frame });
  }
  request(key, f, L, x, y, prio) { if (!this.cache.has(key) && !this.pending.has(key)) this.queue.push({ key, f, L, x, y, prio }); }
  /** Pick the chunks to draw for a camera at `cam` (body frame, metres) with frustum planes. */
  select(cam, planes, quality = 1) {
    this.frame++;
    const out = [], camLen = V.len(cam), camN = V.mul(cam, 1 / camLen);
    const Rmin = R - 1500;
    const horizonCam = Math.acos(Math.min(1, Rmin / Math.max(camLen, Rmin)));
    this.queue = [];
    const k = this.split * quality;
    const visit = (f, L, x, y) => {
      const key = f + '/' + L + '/' + x + '/' + y;
      const c = this.cache.get(key);
      const size = 2 / 2 ** L, uc = -1 + (x + .5) * size, vc = -1 + (y + .5) * size;
      const s = FACE_ARC / 2 ** L;
      let center, rad;
      if (c) { center = c.center; rad = c.rad + 50; } else { center = V.mul(cubeDir(f, uc, vc), R); rad = s * .8 + 1500; }
      // behind the horizon?
      const cn = V.norm(center), ang = Math.acos(Math.max(-1, Math.min(1, V.dot(cn, camN))));
      const top = R + (c ? c.hmax : 1500);
      if (ang > horizonCam + Math.acos(Math.min(1, Rmin / top)) + rad / R) return;
      // outside the view?
      const rel = V.sub(center, cam);
      for (const p of planes) if (p[0] * rel[0] + p[1] * rel[1] + p[2] * rel[2] + p[3] < -rad) return;
      const dist = Math.max(1, V.len(rel) - rad);
      if (L < MAX_L && dist < k * s) {
        let all = true;
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const kk = f + '/' + (L + 1) + '/' + (2 * x + i) + '/' + (2 * y + j);
          if (!this.cache.has(kk)) { all = false; this.request(kk, f, L + 1, 2 * x + i, 2 * y + j, L + 1 + dist / (k * s)); }
        }
        if (all) { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) visit(f, L + 1, 2 * x + i, 2 * y + j); return; }
      }
      if (c) { c.used = this.frame; out.push(c); } else this.request(key, f, L, x, y, L);
    };
    for (let f = 0; f < 6; f++) visit(f, 0, 0, 0);
    // send the most urgent requests (coarse first, then nearest)
    this.queue.sort((a, b) => a.prio - b.prio);
    for (const q of this.queue) {
      let wi = -1, best = 1e9;
      this.inflight.forEach((n, i) => { if (n < best) { best = n; wi = i; } });
      if (best >= 10) break;
      this.inflight[wi]++;
      this.pending.set(q.key, true);
      this.workers[wi].postMessage({ type: 'chunk', key: q.key, f: q.f, L: q.L, x: q.x, y: q.y });
    }
    // forget chunks not drawn for a while
    if (this.cache.size > 1100) {
      for (const [key, c] of this.cache) if (this.frame - c.used > 120) {
        this.gl.deleteVertexArray(c.vao); c.bufs.forEach(b => this.gl.deleteBuffer(b)); this.cache.delete(key);
        if (this.cache.size < 800) break;
      }
    }
    this.busy = this.queue.length + this.pending.size;
    return out;
  }
}

/** Frustum planes (camera-relative) from a projection*view matrix with the camera at the origin. */
export function frustumPlanes(m) {
  const row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0), r1 = row(1), r3 = row(3);
  const planes = [[r3[0] + r0[0], r3[1] + r0[1], r3[2] + r0[2], r3[3] + r0[3]], [r3[0] - r0[0], r3[1] - r0[1], r3[2] - r0[2], r3[3] - r0[3]],
    [r3[0] + r1[0], r3[1] + r1[1], r3[2] + r1[2], r3[3] + r1[3]], [r3[0] - r1[0], r3[1] - r1[1], r3[2] - r1[2], r3[3] - r1[3]]];
  return planes.map(p => { const l = Math.hypot(p[0], p[1], p[2]); return p.map(v => v / l); });
}

/* Airbrush and frisket, simulated.
   A poster here is painted the way a 1970s illustrator painted a space-colony picture:
   cut a frisket (a hard, knife-cut mask), spray thin coats through it, let the gradient
   build up, lift the frisket, spray the next shape, then pick out the highlights with
   opaque gouache and a fine brush. Stars are flicked from a toothbrush.

   Every pass lands on float buffers, so coats stack like paint does:
   - spray(): a coverage mask becomes paint through droplet grain. Thin coverage breaks
     into visible stipple; heavy coverage closes up into a smooth, solid coat. The board's
     tooth catches thin spray, and a low-pressure "spit" throws a few larger droplets.
   - gouache(): opaque, grain-free paint with an optional dry-brush drag.
   - frisket edges are antialiased hard cuts; ridge() adds the faint build-up of paint
     that collects against the cut edge.
   Nothing in this file touches the screen; toCanvas() hands back a finished board. */
(function (G) {
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(ix, iy, seed) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, seed = 0, oct = 4, lac = 2.03, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x, y, seed + o * 131);
    norm += amp; amp *= gain; x *= lac; y *= lac;
  }
  return sum / norm;
}
function hex(h) {
  if (Array.isArray(h)) return h;
  const v = parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
function mixc(a, b, t) { a = hex(a); b = hex(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function css(c, a = 1) { c = hex(c); return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`; }
function erf(x) { // Abramowitz-Stegun 7.1.26
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

// ---------- separable box blur (3 passes approximate a gaussian) ----------
function boxH(src, dst, w, h, r, y0, y1, x0, x1) {
  const inv = 1 / (r + r + 1);
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    const first = src[row + x0], last = src[row + x1 - 1];
    let acc = first * (r + 1);
    for (let j = 0; j < r; j++) acc += src[row + Math.min(x0 + j, x1 - 1)];
    for (let x = x0; x < x1; x++) {
      const ia = x + r, ib = x - r - 1;
      acc += (ia < x1 ? src[row + ia] : last) - (ib >= x0 ? src[row + ib] : first);
      dst[row + x] = acc * inv;
    }
  }
}
function boxV(src, dst, w, h, r, y0, y1, x0, x1) {
  const inv = 1 / (r + r + 1);
  for (let x = x0; x < x1; x++) {
    const first = src[y0 * w + x], last = src[(y1 - 1) * w + x];
    let acc = first * (r + 1);
    for (let j = 0; j < r; j++) acc += src[Math.min(y0 + j, y1 - 1) * w + x];
    for (let y = y0; y < y1; y++) {
      const ia = y + r, ib = y - r - 1;
      acc += (ia < y1 ? src[ia * w + x] : last) - (ib >= y0 ? src[ib * w + x] : first);
      dst[y * w + x] = acc * inv;
    }
  }
}
function blurArray(M, w, h, sigma, bb) {
  const out = new Float32Array(M);
  if (sigma < 0.35) return out;
  let x0 = 0, y0 = 0, x1 = w, y1 = h;
  if (bb) {
    const pad = Math.ceil(sigma * 3.2) + 2;
    x0 = Math.max(0, bb[0] - pad); y0 = Math.max(0, bb[1] - pad); x1 = Math.min(w, bb[2] + pad); y1 = Math.min(h, bb[3] + pad);
  }
  const tmp = new Float32Array(M.length);
  const r = Math.max(1, Math.round((-1 + Math.sqrt(1 + 4 * sigma * sigma)) / 2));
  for (let p = 0; p < 3; p++) { boxH(out, tmp, w, h, r, y0, y1, x0, x1); boxV(tmp, out, w, h, r, y0, y1, x0, x1); }
  if (bb) out.bb = [x0, y0, x1, y1];
  return out;
}

// ---------- droplet grain: white noise, slightly clumped, re-equalized to uniform ----------
const grainCache = new Map();
function grainTile(scale) {
  const key = Math.round(scale * 4) / 4;
  if (grainCache.has(key)) return grainCache.get(key);
  const size = 512, N = size * size, r = rng(9187 + key * 40);
  let a = new Float32Array(N);
  for (let i = 0; i < N; i++) a[i] = r();
  // clump droplets to roughly one device pixel per css pixel; wraps around for tiling
  const sigma = 0.42 * key;
  if (sigma > 0.35) {
    const big = new Float32Array(N); big.set(a);
    const tmp = new Float32Array(N);
    const rr = Math.max(1, Math.round((-1 + Math.sqrt(1 + 4 * sigma * sigma)) / 2));
    // wrap-around box blur
    const pass = (src, dst, horiz) => {
      const inv = 1 / (2 * rr + 1);
      for (let l = 0; l < size; l++) {
        let acc = 0;
        for (let j = -rr; j <= rr; j++) { const q = (j + size) % size; acc += horiz ? src[l * size + q] : src[q * size + l]; }
        for (let m = 0; m < size; m++) {
          if (horiz) dst[l * size + m] = acc * inv; else dst[m * size + l] = acc * inv;
          const add = (m + rr + 1) % size, sub = (m - rr + size) % size;
          acc += horiz ? src[l * size + add] - src[l * size + sub] : src[add * size + l] - src[sub * size + l];
        }
      }
    };
    pass(big, tmp, true); pass(tmp, big, false);
    a = big;
  }
  let mu = 0; for (let i = 0; i < N; i++) mu += a[i]; mu /= N;
  let v = 0; for (let i = 0; i < N; i++) v += (a[i] - mu) ** 2; const sd = Math.sqrt(v / N) || 1;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = 0.5 * (1 + erf((a[i] - mu) / (sd * Math.SQRT2)));
  const tile = { size, data: out };
  grainCache.set(key, tile);
  return tile;
}

// illustration-board tooth: a fine, slightly fibrous relief (0..1)
function toothField(w, h, gs, seed) {
  const T = new Float32Array(w * h);
  const f1 = 1 / (1.6 * gs), f2 = 1 / (5.5 * gs);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n1 = vnoise(x * f1, y * f1 * 1.15, seed + 3);
    const n2 = vnoise(x * f2 * 0.6, y * f2 * 2.2, seed + 7);
    const n3 = hash(x, y, seed + 11);
    T[y * w + x] = clamp(0.55 * n1 + 0.25 * n2 + 0.2 * n3);
  }
  return T;
}

const BOARD = hex('#f2e8d5');

class Board {
  constructor(w, h, opt = {}) {
    this.w = w | 0; this.h = h | 0; this.N = this.w * this.h;
    this.unit = opt.unit || 1000;
    this.k = this.w / this.unit;
    this.seed = opt.seed || 1;
    this.rand = rng(this.seed * 7919 + 17);
    this.transparent = !!opt.transparent;
    this.gs = opt.grainScale || clamp(this.w / 430, 1, 2.4);
    const N = this.N;
    this.R = new Float32Array(N); this.G = new Float32Array(N); this.B = new Float32Array(N); this.A = new Float32Array(N);
    if (!this.transparent) {
      const p = hex(opt.paper || BOARD);
      this.R.fill(p[0]); this.G.fill(p[1]); this.B.fill(p[2]); this.A.fill(1);
      this.tooth = toothField(this.w, this.h, this.gs, this.seed);
    } else this.tooth = opt.tooth || null;
    this.grain = grainTile(this.gs);
    this.cv = document.createElement('canvas'); this.cv.width = this.w; this.cv.height = this.h;
    this.cx = this.cv.getContext('2d', { willReadFrequently: true });
  }

  // ---- masks ----
  zero() { return new Float32Array(this.N); }
  // evaluate fn(xUnits, yUnits) at pixel centres; bbox in units limits the work
  field(fn, bbox) {
    const { w, h, k } = this, M = this.zero(), inv = 1 / k;
    let x0 = 0, y0 = 0, x1 = w, y1 = h;
    if (bbox) {
      x0 = clamp(Math.floor(bbox[0] * k), 0, w); y0 = clamp(Math.floor(bbox[1] * k), 0, h);
      x1 = clamp(Math.ceil(bbox[2] * k), 0, w); y1 = clamp(Math.ceil(bbox[3] * k), 0, h);
      M.bb = [x0, y0, x1, y1];
    }
    for (let y = y0; y < y1; y++) {
      const uy = (y + 0.5) * inv, row = y * w;
      for (let x = x0; x < x1; x++) M[row + x] = fn((x + 0.5) * inv, uy);
    }
    return M;
  }
  // draw with canvas 2D in poster units (white = covered); returns coverage
  raster(fn, bbox) {
    const { cx, w, h, k } = this;
    let x0 = 0, y0 = 0, x1 = w, y1 = h;
    if (bbox) {
      x0 = clamp(Math.floor(bbox[0] * k) - 2, 0, w); y0 = clamp(Math.floor(bbox[1] * k) - 2, 0, h);
      x1 = clamp(Math.ceil(bbox[2] * k) + 2, 0, w); y1 = clamp(Math.ceil(bbox[3] * k) + 2, 0, h);
    }
    const M = this.zero();
    if (x1 <= x0 || y1 <= y0) { M.bb = [0, 0, 0, 0]; return M; }
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(x0, y0, x1 - x0, y1 - y0);
    cx.setTransform(k, 0, 0, k, 0, 0);
    cx.fillStyle = '#fff'; cx.strokeStyle = '#fff'; cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
    fn(cx, this);
    cx.setTransform(1, 0, 0, 1, 0, 0);
    const bw = x1 - x0, d = cx.getImageData(x0, y0, bw, y1 - y0).data;
    for (let y = y0; y < y1; y++) { const row = y * w, src = (y - y0) * bw * 4 + 3; for (let x = x0; x < x1; x++) M[row + x] = d[src + (x - x0) * 4] / 255; }
    if (bbox) { M.bb = [x0, y0, x1, y1]; cx.clearRect(x0, y0, bw, y1 - y0); } else cx.clearRect(0, 0, w, h);
    return M;
  }
  path(pts, close = true) { // helper for raster callbacks
    return (c) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); c.fill(); };
  }
  blur(M, sigmaUnits) { return blurArray(M, this.w, this.h, sigmaUnits * this.k, M.bb); }
  // antialiased hard edge from a signed field (negative = inside), using its local gradient
  aa(F, sharp = 1) {
    const { w, h } = this, M = this.zero();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, f = F[i];
      const fx = x + 1 < w ? F[i + 1] - f : f - F[i - 1];
      const fy = y + 1 < h ? F[i + w] - f : f - F[i - w];
      const g = Math.sqrt(fx * fx + fy * fy) / sharp + 1e-9;
      M[i] = clamp(0.5 - f / g);
    }
    return M;
  }
  mul(A, B) {
    const M = this.zero();
    const bb = A.bb && B.bb ? [Math.max(A.bb[0], B.bb[0]), Math.max(A.bb[1], B.bb[1]), Math.min(A.bb[2], B.bb[2]), Math.min(A.bb[3], B.bb[3])] : (A.bb || B.bb);
    if (bb) { for (let y = bb[1]; y < bb[3]; y++) for (let x = bb[0], i = y * this.w + x; x < bb[2]; x++, i++) M[i] = A[i] * B[i]; M.bb = bb.slice(); if (M.bb[2] < M.bb[0]) M.bb[2] = M.bb[0]; if (M.bb[3] < M.bb[1]) M.bb[3] = M.bb[1]; return M; }
    for (let i = 0; i < this.N; i++) M[i] = A[i] * B[i]; return M;
  }
  mulF(A, fn) { // multiply mask by a field fn(xu, yu)
    const { w, h, k } = this, inv = 1 / k, M = this.zero(), bb = A.bb || [0, 0, w, h];
    for (let y = bb[1]; y < bb[3]; y++) { const uy = (y + 0.5) * inv; for (let x = bb[0]; x < bb[2]; x++) { const i = y * w + x; if (A[i] > 0) M[i] = A[i] * fn((x + 0.5) * inv, uy); } }
    if (A.bb) M.bb = A.bb.slice();
    return M;
  }
  sub(A, B) { const M = this.zero(); for (let i = 0; i < this.N; i++) M[i] = clamp(A[i] - B[i]); return M; }
  max(A, B) { const M = this.zero(); for (let i = 0; i < this.N; i++) M[i] = A[i] > B[i] ? A[i] : B[i]; return M; }
  inv(A) { const M = this.zero(); for (let i = 0; i < this.N; i++) M[i] = 1 - A[i]; return M; }
  scale(A, s) { const M = this.zero(); for (let i = 0; i < this.N; i++) M[i] = clamp(A[i] * s); if (A.bb) M.bb = A.bb.slice(); return M; }
  shift(A, dxu, dyu) {
    const { w, h } = this, dx = Math.round(dxu * this.k), dy = Math.round(dyu * this.k), M = this.zero();
    for (let y = 0; y < h; y++) { const sy = y - dy; if (sy < 0 || sy >= h) continue; for (let x = 0; x < w; x++) { const sx = x - dx; if (sx >= 0 && sx < w) M[y * w + x] = A[sy * w + sx]; } }
    return M;
  }
  // the faint ridge of paint that collects against a frisket's cut edge (inside the mask)
  ridge(F, sigmaUnits = 0.9) {
    const b = this.blur(F, sigmaUnits), M = this.zero();
    for (let i = 0; i < this.N; i++) M[i] = clamp((F[i] - b[i]) * 2.2);
    if (b.bb) M.bb = b.bb.slice();
    return M;
  }

  // ---- paint ----
  // spray a colour through coverage M. opts: op (opacity), grain (0 smooth .. 1 stipple),
  // soft (droplet softness), tooth, spit (big droplets), mode: 'paint' | 'glaze' (transparent dye)
  spray(col, M, o = {}) {
    const op = o.op ?? 1, gr = o.grain ?? 0.3, soft = o.soft ?? 0.42, glaze = o.mode === 'glaze', gp = o.close ?? 0.9;
    const [cr, cg, cb] = hex(col);
    const { w, R, G, B, A } = this, T = this.tooth, ta = o.tooth ?? 0.25, tr = this.transparent;
    const gt = this.grain, gsz = gt.size, gd = gt.data, gm = gsz - 1;
    const ox = (this.rand() * gsz) | 0, oy = (this.rand() * gsz) | 0, invS = 1 / soft;
    const bb = M.bb || [0, 0, this.w, this.h];
    for (let y = bb[1]; y < bb[3]; y++) {
      const grow = ((y + oy) & gm) * gsz, row = y * w;
      for (let x = bb[0]; x < bb[2]; x++) {
        const i = row + x;
        let m = M[i];
        if (m <= 0.0006) continue;
        m *= op; if (m > 1) m = 1;
        const n = gd[grow + ((x + ox) & gm)];
        let hd = (m - n) * invS + 0.5; hd = hd < 0 ? 0 : hd > 1 ? 1 : hd;
        let c = m + (hd - m) * gr * Math.pow(1 - m * gp, 1.2);
        if (T) c *= 1 + ta * (T[i] - 0.5) * (1 - m) * 2;
        if (c <= 0) continue; if (c > 1) c = 1;
        if (glaze) {
          R[i] *= 1 - c + c * cr; G[i] *= 1 - c + c * cg; B[i] *= 1 - c + c * cb;
          if (tr) A[i] = A[i] + c * (1 - A[i]) * 0.5;
        } else if (tr) {
          const a0 = A[i], na = c + a0 * (1 - c);
          if (na > 0) { const f = c / na; R[i] += (cr - R[i]) * f; G[i] += (cg - G[i]) * f; B[i] += (cb - B[i]) * f; }
          A[i] = na;
        } else {
          R[i] += (cr - R[i]) * c; G[i] += (cg - G[i]) * c; B[i] += (cb - B[i]) * c;
        }
      }
    }
    if (o.spit) this.spit(col, M, o.spit, op);
    return this;
  }
  // big, irregular droplets thrown at low pressure, mostly where the coat is thin
  spit(col, M, amount, op = 1) {
    const n = Math.round(amount * this.N / (this.gs * this.gs * 900));
    const rr = this.rand, bb = M.bb || [0, 0, this.w, this.h];
    const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    for (let j = 0; j < n; j++) {
      const x = bb[0] + rr() * bw, y = bb[1] + rr() * bh, i = (y | 0) * this.w + (x | 0);
      const m = clamp(M[i] * op); const p = 4 * m * (1 - m) * 0.85 + m * 0.15;
      if (rr() > p) continue;
      this.dotPx(x, y, (0.35 + rr() * rr() * 1.3) * this.gs, col, 0.45 + 0.55 * rr());
    }
  }
  // opaque paint without grain; dry > 0 drags the brush so only the tooth's peaks take paint
  gouache(col, M, o = {}) {
    const op = o.op ?? 1, dry = o.dry ?? 0;
    const [cr, cg, cb] = hex(col);
    const { w, R, G, B, A } = this, T = this.tooth, tr = this.transparent;
    const bb = M.bb || [0, 0, this.w, this.h];
    for (let y = bb[1]; y < bb[3]; y++) for (let x = bb[0]; x < bb[2]; x++) {
      const i = y * w + x; let c = M[i] * op; if (c <= 0.002) continue;
      if (dry && T) c *= clamp(1 - dry * (1 - T[i]) * 1.8 + (T[i] - 0.5) * dry);
      if (c > 1) c = 1; if (c <= 0) continue;
      if (tr) { const a0 = A[i], na = c + a0 * (1 - c); if (na > 0) { const f = c / na; R[i] += (cr - R[i]) * f; G[i] += (cg - G[i]) * f; B[i] += (cb - B[i]) * f; } A[i] = na; }
      else { R[i] += (cr - R[i]) * c; G[i] += (cg - G[i]) * c; B[i] += (cb - B[i]) * c; }
    }
    return this;
  }
  // one antialiased dot, in pixels
  dotPx(x, y, r, col, a = 1) {
    const [cr, cg, cb] = hex(col), { w, h, R, G, B, A } = this, tr = this.transparent;
    const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(w - 1, Math.ceil(x + r + 1));
    const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(h - 1, Math.ceil(y + r + 1));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      let c = clamp(r + 0.5 - d) * a; if (c <= 0) continue;
      const i = yy * w + xx;
      if (tr) { const a0 = A[i], na = c + a0 * (1 - c); const f = c / na; R[i] += (cr - R[i]) * f; G[i] += (cg - G[i]) * f; B[i] += (cb - B[i]) * f; A[i] = na; }
      else { R[i] += (cr - R[i]) * c; G[i] += (cg - G[i]) * c; B[i] += (cb - B[i]) * c; }
    }
  }
  // toothbrush spatter: flick paint across a region; accept(xu, yu) can thin it out
  spatter(col, bbox, count, rMin, rMax, o = {}) {
    const rr = this.rand, k = this.k;
    for (let j = 0; j < count; j++) {
      const xu = lerp(bbox[0], bbox[2], rr()), yu = lerp(bbox[1], bbox[3], rr());
      const p = o.accept ? o.accept(xu, yu) : 1;
      if (rr() > p) continue;
      const size = lerp(rMin, rMax, Math.pow(rr(), o.pow ?? 3));
      const a = lerp(o.aMin ?? 0.5, o.aMax ?? 1, rr());
      const c = o.colors ? o.colors[(rr() * o.colors.length) | 0] : col;
      this.dotPx(xu * k, yu * k, Math.max(0.3, size * k), c, a);
    }
  }
  // a gouache sparkle: soft sprayed bloom, fine brushed rays, a hard bright centre
  glint(x, y, size, col = '#fff9ec', o = {}) {
    const bloom = o.bloom ?? 0.7, rot = o.rot ?? 0, rays = o.rays ?? 4;
    if (bloom > 0) {
      const s2 = size * size * (o.bloomSize ?? 0.35);
      const B = this.field((u, v) => bloom * Math.exp(-((u - x) ** 2 + (v - y) ** 2) / s2), [x - size * 2.2, y - size * 2.2, x + size * 2.2, y + size * 2.2]);
      this.spray(o.bloomCol || col, B, { grain: 0.35 });
    }
    const ext = size * 1.4;
    const M = this.raster((c) => {
      for (let r = 0; r < rays; r++) {
        const a = rot + (r / rays) * TAU, L = size * (r % 2 ? (o.short ?? 0.62) : 1.25), wd = size * (o.width ?? 0.075);
        const ca = Math.cos(a), sa = Math.sin(a);
        c.beginPath(); c.moveTo(x - sa * wd, y + ca * wd); c.lineTo(x + ca * L, y + sa * L); c.lineTo(x + sa * wd, y - ca * wd); c.closePath(); c.fill();
      }
      c.beginPath(); c.arc(x, y, size * (o.core ?? 0.13), 0, TAU); c.fill();
    }, [x - ext, y - ext, x + ext, y + ext]);
    this.gouache(col, M, { op: o.op ?? 0.95 });
    return this;
  }
  // brush-stamped strokes: pts = [[x, y, width], ...] in units
  strokeMask(strokes) {
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const pts of strokes) for (const p of pts) { const r = (p[2] || 1) / 2 + 2; bx0 = Math.min(bx0, p[0] - r); by0 = Math.min(by0, p[1] - r); bx1 = Math.max(bx1, p[0] + r); by1 = Math.max(by1, p[1] + r); }
    return this.raster((c) => {
      for (const pts of strokes) {
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0, w0] = pts[i], [x1, y1, w1] = pts[i + 1];
          const L = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(L / (Math.min(w0, w1) * 0.25 + 0.2)));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps, r = lerp(w0, w1, t) / 2;
            if (r <= 0.02) continue;
            c.beginPath(); c.arc(lerp(x0, x1, t), lerp(y0, y1, t), r, 0, TAU); c.fill();
          }
        }
      }
    }, [bx0, by0, bx1, by1]);
  }

  // lay a brushed vector layer (a canvas the same size as the board) onto the paint, opaque where it covers
  paste(src, op = 1) {
    const c = src.getContext('2d'), d = c.getImageData(0, 0, this.w, this.h).data;
    const { R, G, B, A, N } = this, tr = this.transparent;
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const a = d[j + 3] / 255 * op; if (a <= 0.002) continue;
      const cr = d[j] / 255, cg = d[j + 1] / 255, cb = d[j + 2] / 255;
      if (tr) { const a0 = A[i], na = a + a0 * (1 - a), f = a / na; R[i] += (cr - R[i]) * f; G[i] += (cg - G[i]) * f; B[i] += (cb - B[i]) * f; A[i] = na; }
      else { R[i] += (cr - R[i]) * a; G[i] += (cg - G[i]) * a; B[i] += (cb - B[i]) * a; }
    }
  }
  layer() { const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h; const c = cv.getContext('2d', { willReadFrequently: true }); c.setTransform(this.k, 0, 0, this.k, 0, 0); return { cv, c }; }

  // ---- out ----
  toCanvas(cv) {
    cv = cv || document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(this.w, this.h), d = img.data;
    const { R, G, B, A, N } = this, T = this.tooth, tr = this.transparent;
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const e = T && !tr ? 1 + 0.05 * (T[i] - 0.5) : 1;
      const dz = (hash(i, 7, 3) - 0.5) * 1.4;
      d[j] = R[i] * e * 255 + dz; d[j + 1] = G[i] * e * 255 + dz; d[j + 2] = B[i] * e * 255 + dz;
      d[j + 3] = tr ? A[i] * 255 : 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

G.Paint = { Board, rng, hash, vnoise, fbm, hex, mixc, css, clamp, lerp, smooth, TAU, blurArray };
})(window);

/*
 * Paper, noise and blur: the ground the painting is made on.
 *
 * The sheet is a cold-pressed watercolour paper: rounded tooth (cellular
 * bumps), fine felt noise and a slow cockle where it buckled when wet. Pigment
 * settles in the valleys of the tooth (granulation); dry brush only touches the
 * peaks. Everything is tileable and seeded, so a frame is always the same.
 */
(function (G) {
'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash2(x, y, s) { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Tileable value-noise fbm texture (size must be a power of two).
function noiseTile(size, baseCell, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, cell = baseCell;
  for (let o = 0; o < octaves; o++) {
    const n = Math.max(1, Math.round(size / cell)), lat = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) lat[i] = hash2(i % n, (i / n) | 0, seed + o * 101);
    const sc = n / size;
    for (let y = 0; y < size; y++) {
      const fy = y * sc, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = iy % n, y1 = (iy + 1) % n;
      for (let x = 0; x < size; x++) {
        const fx = x * sc, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % n, x1 = (ix + 1) % n;
        const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp; amp *= 0.5; cell = Math.max(1, cell / 2);
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) { out[i] /= total; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return { size, data: out, mask: size - 1 };
}
// Sample a tile at arbitrary scale with bilinear filtering.
function sampleTile(tile, x, y) {
  const m = tile.mask, ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, s = tile.size, d = tile.data;
  const x0 = ix & m, x1 = (ix + 1) & m, y0 = (iy & m) * s, y1 = ((iy + 1) & m) * s;
  const a = d[y0 + x0], b = d[y0 + x1], c = d[y1 + x0], e = d[y1 + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (e - c) * tx) * ty;
}

// Cold-pressed tooth: rounded cells (Worley F1, inverted) plus felt noise.
function paperTile(size, cell, seed) {
  const n = Math.round(size / cell), pts = new Float32Array(n * n * 2), r = rng(seed);
  for (let i = 0; i < n * n; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); }
  const bumps = new Float32Array(size * size), c = size / n, ic = 1 / c;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.floor(x * ic), gy = Math.floor(y * ic); let f1 = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = (gx + ox + n) % n, cy = (gy + oy + n) % n, k = (cy * n + cx) * 2;
      const ddx = (gx + ox + pts[k]) * c - x, ddy = (gy + oy + pts[k + 1]) * c - y, d2 = ddx * ddx + ddy * ddy;
      if (d2 < f1) f1 = d2;
    }
    // Rounded bumps only (no cell borders), so it reads as tooth, not crackle.
    bumps[y * size + x] = 1 - smoothstep(0, 1.05, Math.sqrt(f1) * ic);
  }
  const felt = noiseTile(size, 3, 3, seed + 7), mid = noiseTile(size, 11, 3, seed + 3), slow = noiseTile(size, 48, 3, seed + 13);
  const out = new Float32Array(size * size);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) { out[i] = bumps[i] * 0.34 + felt.data[i] * 0.3 + mid.data[i] * 0.24 + slow.data[i] * 0.12; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return { size, data: out, mask: size - 1 };
}

// Separable box blur, three passes ~ Gaussian. In place on Float32Array.
function boxBlurH(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w; let acc = src[row] * (r + 1);
    for (let x = 0; x < r; x++) acc += src[row + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      acc += src[row + Math.min(x + r, w - 1)] - src[row + Math.max(x - r - 1, 0)];
      dst[row + x] = acc * iarr;
    }
  }
}
function boxBlurV(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    let acc = src[x] * (r + 1);
    for (let y = 0; y < r; y++) acc += src[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      acc += src[Math.min(y + r, h - 1) * w + x] - src[Math.max(y - r - 1, 0) * w + x];
      dst[y * w + x] = acc * iarr;
    }
  }
}
function blur(a, w, h, radius, tmp) {
  if (radius < 0.5) return a;
  // Only the band of rows that holds paint (plus a margin) needs blurring.
  let y0 = 0, y1 = h - 1;
  while (y0 < h) { let any = false; for (let x = 0, r = y0 * w; x < w; x++) if (a[r + x] !== 0) { any = true; break; } if (any) break; y0++; }
  if (y0 >= h) return a;
  while (y1 > y0) { let any = false; for (let x = 0, r = y1 * w; x < w; x++) if (a[r + x] !== 0) { any = true; break; } if (any) break; y1--; }
  const m = Math.ceil(radius * 3) + 2; y0 = Math.max(0, y0 - m); y1 = Math.min(h - 1, y1 + m);
  if (y0 > 0 || y1 < h - 1) { const sub = a.subarray(y0 * w, (y1 + 1) * w); blurAll(sub, w, y1 - y0 + 1, radius, tmp ? tmp.subarray(0, sub.length) : null); return a; }
  return blurAll(a, w, h, radius, tmp);
}
function blurAll(a, w, h, radius, tmp) {
  tmp = tmp || new Float32Array(a.length);
  // Three box passes whose combined variance matches a Gaussian of this radius.
  const sig = radius, n = 3, wIdeal = Math.sqrt((12 * sig * sig / n) + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--; const wu = wl + 2;
  const m = Math.round((12 * sig * sig - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  for (let i = 0; i < n; i++) { const r = ((i < m ? wl : wu) - 1) / 2; boxBlurH(a, tmp, w, h, r); boxBlurV(tmp, a, w, h, r); }
  return a;
}

G.Paper = { clamp, smoothstep, hash2, rng, noiseTile, sampleTile, paperTile, blur };
})(typeof window !== 'undefined' ? window : globalThis);

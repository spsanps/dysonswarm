/* Glass plate renderer.
   The plate is made the way a real one was: light lands on an emulsion
   (an exposure buffer in floating point), the emulsion responds through a
   characteristic curve (toe, shoulder, and solarization where the Sun burns
   through), silver grain clumps, the plate holder and the darkroom leave their
   marks, and then the plate readers write on the glass in ink and grease pencil.
   Nothing here is an image file; every mark is computed. */

(function (root) {
  'use strict';
  const C = root.SwarmClock;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ================================================================ noise */
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1103515245);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, seed, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 31); n += a; a *= 0.5; f *= 2.07; }
    return s / n;
  }
  // A coarse field sampled bilinearly: cheap low-frequency variation per pixel.
  function coarseField(w, h, step, fn) {
    const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2;
    const g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * step, j * step);
    return { g, gw, gh, step };
  }
  function sampleField(F, x, y) {
    const fx = x / F.step, fy = y / F.step;
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const o = iy * F.gw + ix, g = F.g;
    const a = g[o], b = g[o + 1], c = g[o + F.gw], d = g[o + F.gw + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  function boxBlur(src, w, h, r, passes) {
    if (r < 1) return src.slice();
    let a = src.slice(), b = new Float32Array(w * h);
    const inv = 1 / (2 * r + 1);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {
        const o = y * w; let acc = 0;
        for (let x = -r; x <= r; x++) acc += a[o + clamp(x, 0, w - 1)];
        for (let x = 0; x < w; x++) {
          b[o + x] = acc * inv;
          acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += b[clamp(y, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = acc * inv;
          acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
        }
      }
    }
    return a;
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* ============================================================== palette */
  const GLASS = [247, 243, 231];       // clear glass on the light box
  const GLASS_EDGE = [214, 226, 205];  // looking through the glass thickness
  const SILVER = [33, 28, 23];         // developed silver, warm black
  const INK = [27, 23, 21];            // india ink
  const GREASE = [184, 60, 44];        // red grease pencil
  const IRON_GALL = [43, 50, 78];      // blue-black fountain pen, on paper
  const STAMP = [104, 76, 140];        // violet stamp pad
  const KRAFT = [216, 196, 156];       // plate sleeve
  const PRINT = [46, 38, 32];          // letterpress on the sleeve

  /* =============================================================== layout
     Everything on the stage is in CSS pixels. The plate is 10 x 8 inches
     (254 x 203 mm): landscape on wide screens, portrait on phones. It is pulled
     up out of its paper sleeve; older plates' sleeves are stacked behind. */
  function computeLayout(W, H) {
    const portrait = W < 700 || H > W * 1.05;
    const PW = portrait ? 203 : 254, PH = portrait ? 254 : 203;
    const inSleeve = portrait ? 0.075 : 0.085;  // share of plate height still inside the sleeve
    const below = portrait ? 0.13 : 0.11;       // sleeve visible under the plate, as share of stage height
    const top = portrait ? 0.05 : 0.085;        // room for the stack above
    const availH = H * (1 - below - top);
    const sW = (W * (portrait ? 0.9 : 0.86)) / PW;
    let s = Math.min(sW, availH / (PH * (1 - inSleeve)));
    // the stage height the plate would like at this width (the page may shrink to it)
    const fitH = Math.ceil(PH * sW * (1 - inSleeve) / (1 - below - top));
    const pw = PW * s, ph = PH * s;
    const cx = W / 2 + (portrait ? 0 : -W * 0.01);
    const plateTop = H * top + (availH - ph * (1 - inSleeve)) * 0.55;
    const cy = plateTop + ph / 2;
    const sleeveTop = plateTop + ph * (1 - inSleeve);
    return {
      W, H, portrait, PW, PH, s, pw, ph, cx, cy, inSleeve, fitH,
      rot: portrait ? -0.7 : -1.1,
      sleeve: { x: cx - pw * 0.535, y: sleeveTop, w: pw * 1.07, h: Math.max(20, H - sleeveTop - 10), rot: portrait ? 0.35 : 0.5 },
      stack: portrait
        ? [{ dx: 8, dy: -14, rot: 1.0 }, { dx: -7, dy: -24, rot: -0.5 }]
        : [{ dx: 16, dy: -24, rot: 1.4 }, { dx: -12, dy: -40, rot: -0.7 }, { dx: 26, dy: -55, rot: 2.1 }]
    };
  }

  /* ========================================================== sky -> plate
     The camera looks at the Sun from 30 degrees above the ecliptic. Positions
     are in solar radii; the plate scale is 5 mm per solar radius. */
  function makeView(L) {
    const S = 5.0;
    const sun = L.portrait ? { x: 101.5, y: 116 } : { x: 121, y: 97 };
    const el = 30 * Math.PI / 180, az = 38 * Math.PI / 180, roll = -11 * Math.PI / 180;
    const V = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const R = [-Math.sin(az), Math.cos(az), 0];
    const U = [V[1] * R[2] - V[2] * R[1], V[2] * R[0] - V[0] * R[2], V[0] * R[1] - V[1] * R[0]];
    const cr = Math.cos(roll), sr = Math.sin(roll);
    function project(p) {
      const sx = p[0] * R[0] + p[1] * R[1] + p[2] * R[2];
      const sy = -(p[0] * U[0] + p[1] * U[1] + p[2] * U[2]);
      const d = p[0] * V[0] + p[1] * V[1] + p[2] * V[2];
      return { x: sun.x + S * (sx * cr - sy * sr), y: sun.y + S * (sx * sr + sy * cr), d };
    }
    return { S, sun, R: S, project, PW: L.PW, PH: L.PH };
  }

  /* ======================================================= star catalogue
     One fixed patch of sky (mm from the Sun on the plate), shared by every
     plate, with a faint band of the Milky Way crossing it. */
  let STARS = null;
  function starCatalogue() {
    if (STARS) return STARS;
    const r = C.rng(20260906);
    const out = [];
    const bandAng = 0.5, bx = Math.cos(bandAng), by = Math.sin(bandAng);
    const dist = (x, y) => Math.abs((x + 34) * by - (y - 30) * bx);
    let n = 0;
    while (out.length < 1650 && n < 20000) {
      n++;
      const x = (r() - 0.5) * 290, y = (r() - 0.5) * 290;
      const band = Math.exp(-Math.pow(dist(x, y) / 26, 2));
      if (r() > 0.38 + 0.62 * band) continue;
      let f = 0.3 * Math.pow(1 - r() * 0.99999, -1.15);
      if (f > 6000) f = 6000;
      out.push({ x, y, f, band, tint: r() });
    }
    // a few named-looking bright stars at fixed places so every plate shares landmarks
    out.push({ x: -71, y: -46, f: 1700, band: 0 }, { x: 64, y: 58, f: 1100, band: 0 },
      { x: 92, y: -61, f: 800, band: 0 }, { x: -38, y: 74, f: 950, band: 0 }, { x: 17, y: -88, f: 600, band: 0 });
    STARS = out;
    return out;
  }

  /* ============================================================ the film */
  function Film(w, h, ppm) {
    this.w = w; this.h = h; this.ppm = ppm;
    this.E = new Float32Array(w * h);
  }
  // A star image: Gaussian core plus the emulsion's scattering wings.
  Film.prototype.star = function (xmm, ymm, f, sigmaMm) {
    const p = this.ppm, x = xmm * p - 0.5, y = ymm * p - 0.5;
    const s = Math.max(0.6, sigmaMm * p), s2 = 1 / (2 * s * s);
    const sw = 0.13 * p, sw2 = 1 / (sw * sw), wing = 0.022 * f;
    const rad = Math.ceil(Math.max(3.2 * s, sw * Math.cbrt(wing / 0.004)));
    const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(this.w - 1, Math.ceil(x + rad));
    const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(this.h - 1, Math.ceil(y + rad));
    const E = this.E, w = this.w;
    for (let j = y0; j <= y1; j++) {
      const dy = j - y; const o = j * w;
      for (let i = x0; i <= x1; i++) {
        const dx = i - x, r2 = dx * dx + dy * dy;
        const q = 1 + r2 * sw2;
        E[o + i] += f * Math.exp(-r2 * s2) + wing / (q * Math.sqrt(q));
      }
    }
  };
  // Halation: light reflected back from the far side of the glass makes a ring.
  Film.prototype.ring = function (xmm, ymm, rMm, wMm, amp) {
    const p = this.ppm, x = xmm * p - 0.5, y = ymm * p - 0.5, R = rMm * p, wd = Math.max(0.7, wMm * p);
    const rad = Math.ceil(R + 3 * wd), iw = 1 / (2 * wd * wd);
    const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(this.w - 1, Math.ceil(x + rad));
    const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(this.h - 1, Math.ceil(y + rad));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const d = Math.hypot(i - x, j - y) - R;
      this.E[j * this.w + i] += amp * Math.exp(-d * d * iw);
    }
  };
  // A trailed point: the collector moved during the exposure.
  Film.prototype.dash = function (ax, ay, bx, by, sigmaMm, peak) {
    const p = this.ppm;
    ax = ax * p - 0.5; ay = ay * p - 0.5; bx = bx * p - 0.5; by = by * p - 0.5;
    const s = Math.max(0.55, sigmaMm * p), s2 = 1 / (2 * s * s), rad = 3 * s;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad)), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + rad));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad)), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + rad));
    const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1e-6;
    const E = this.E, w = this.w;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      let t = ((i - ax) * vx + (j - ay) * vy) / vv; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = i - ax - t * vx, dy = j - ay - t * vy;
      E[j * w + i] += peak * Math.exp(-(dx * dx + dy * dy) * s2);
    }
  };

  /* An occultation mask around the Sun only (things crossing the disc). */
  function Mask(cxmm, cymm, halfMm, ppm) {
    this.ppm = ppm;
    this.x0 = Math.floor((cxmm - halfMm) * ppm); this.y0 = Math.floor((cymm - halfMm) * ppm);
    this.w = Math.ceil(2 * halfMm * ppm) + 2; this.h = this.w;
    this.M = new Float32Array(this.w * this.h);
  }
  Mask.prototype.dash = function (ax, ay, bx, by, sigmaMm, amt) {
    const p = this.ppm;
    ax = ax * p - 0.5 - this.x0; ay = ay * p - 0.5 - this.y0; bx = bx * p - 0.5 - this.x0; by = by * p - 0.5 - this.y0;
    const s = Math.max(0.5, sigmaMm * p), s2 = 1 / (2 * s * s), rad = 3 * s;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad)), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + rad));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad)), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + rad));
    const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1e-6;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      let t = ((i - ax) * vx + (j - ay) * vy) / vv; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = i - ax - t * vx, dy = j - ay - t * vy;
      const v = amt * Math.exp(-(dx * dx + dy * dy) * s2);
      const o = j * this.w + i;
      if (v > this.M[o]) this.M[o] = v;
    }
  };
  Mask.prototype.at = function (i, j) {
    const x = i - this.x0, y = j - this.y0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.M[y * this.w + x];
  };

  /* ================================================ the emulsion's curve */
  const CURVE = (function () {
    const N = 4096, lo = -7, hi = 15.5, lut = new Float32Array(N);
    const Dfog = 0.05, Dmax = 2.55, E0 = 1.25, g = 0.78, Es = 900, Dsol = 1.42, lam = 1.7;
    for (let i = 0; i < N; i++) {
      const E = Math.exp(lo + (hi - lo) * i / (N - 1));
      let D = Dfog + Dmax * (1 - Math.exp(-Math.pow(E / E0, g)));
      if (E > Es) D -= Dsol * (1 - Math.exp(-Math.log(E / Es) / lam));
      lut[i] = D;
    }
    return { lut, N, lo, hi, scale: (N - 1) / (hi - lo), Dfog };
  })();
  function densitySlow(E) {
    if (E <= 0.00091) return CURVE.Dfog;
    let i = (Math.log(E) - CURVE.lo) * CURVE.scale;
    if (i >= CURVE.N - 1) return CURVE.lut[CURVE.N - 1];
    const k = i | 0, t = i - k;
    return CURVE.lut[k] + (CURVE.lut[k + 1] - CURVE.lut[k]) * t;
  }
  // Fast path: index a table by the top 17 bits of the float (exponent and
  // 8 bits of mantissa), so no logarithm per pixel.
  const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
  const DLUT = (function () {
    const lut = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      U32[0] = ((i << 15) | 0x4000) >>> 0;
      const E = F32[0];
      lut[i] = (isFinite(E) && E > 0) ? densitySlow(E) : CURVE.Dfog;
    }
    return lut;
  })();
  function densityOf(E) {
    if (E <= 0.00091) return CURVE.Dfog;
    F32[0] = E;
    return DLUT[U32[0] >>> 15];
  }
  // density -> what you see on the light box (0 dark .. 1 clear), display gamma included
  const VIEW = (function () {
    const N = 2048, lut = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const D = 3.2 * i / (N - 1);
      lut[i] = Math.pow(Math.pow(10, -0.92 * D), 1 / 1.9);
    }
    return { lut, N, scale: (N - 1) / 3.2 };
  })();

  /* ====================================================== grain textures
     One grain field per bitmap size; each plate reads it at its own offset. */
  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const w = 1024, h = 1024;
    const n = w * h, white = new Float32Array(n);
    let s = 0x9e3779b9 ^ n;
    for (let i = 0; i < n; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const a = (s >>> 0) / 4294967296;
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const b = (s >>> 0) / 4294967296;
      white[i] = (a + b - 1) * 1.73;
    }
    const clump = boxBlur(white, w, h, 1, 1);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = white[i] * 0.55 + clump[i] * 2.1;
    return (GRAIN = out);
  }

  /* ============================================== physical plate details */
  function plateDefects(k, PW, PH) {
    const r = C.rng(C.hash32(k, 4242));
    const d = { chips: [], scratches: [], pins: [], dust: [], fibers: [], water: null, print: null, leak: null };
    // chips in the glass: corners take knocks most often
    const nChip = 1 + Math.floor(r() * 2.6);
    for (let i = 0; i < nChip; i++) {
      const corner = r() < 0.55;
      let x, y, nx, ny;
      if (corner) {
        const c = Math.floor(r() * 4);
        x = c % 2 ? PW : 0; y = c > 1 ? PH : 0;
        nx = c % 2 ? -1 : 1; ny = c > 1 ? -1 : 1;
        d.chips.push({ corner: true, x, y, nx, ny, a: 2.5 + r() * 5.5, b: 2 + r() * 4.5, seed: C.hash32(k, 50 + i) });
      } else {
        const side = Math.floor(r() * 4), t = 0.12 + r() * 0.76;
        if (side === 0) { x = t * PW; y = 0; nx = 0; ny = 1; }
        else if (side === 1) { x = PW; y = t * PH; nx = -1; ny = 0; }
        else if (side === 2) { x = t * PW; y = PH; nx = 0; ny = -1; }
        else { x = 0; y = t * PH; nx = 1; ny = 0; }
        d.chips.push({ corner: false, x, y, nx, ny, a: 3 + r() * 7, b: 0.8 + r() * 2.2, seed: C.hash32(k, 50 + i) });
      }
    }
    const nScr = Math.floor(r() * 3.4);
    for (let i = 0; i < nScr; i++) {
      const x = r() * PW, y = r() * PH, a = r() * TAU, len = 12 + r() * 60, bend = (r() - 0.5) * 18;
      d.scratches.push({ x, y, a, len, bend, w: 0.03 + r() * 0.05, depth: 0.5 + r() * 0.5 });
    }
    const nPin = 8 + Math.floor(r() * 16);
    for (let i = 0; i < nPin; i++) d.pins.push({ x: r() * PW, y: r() * PH, r: 0.06 + r() * r() * 0.28 });
    const nDust = 14 + Math.floor(r() * 22);
    for (let i = 0; i < nDust; i++) d.dust.push({ x: r() * PW, y: r() * PH, r: 0.05 + r() * r() * 0.22, a: 0.2 + r() * 0.45 });
    const nFib = Math.floor(r() * 2.5);
    for (let i = 0; i < nFib; i++) d.fibers.push({ x: r() * PW, y: r() * PH, a: r() * TAU, len: 2 + r() * 6, curl: (r() - 0.5) * 3, seed: C.hash32(k, 90 + i) });
    if (r() < 0.45) d.water = { x: 25 + r() * (PW - 50), y: 25 + r() * (PH - 50), r: 4 + r() * 7 };
    if (r() < 0.6) { // a fingerprint where someone held it, near an edge
      const side = Math.floor(r() * 4);
      const t = 0.15 + r() * 0.7;
      const pos = [[t * PW, 9], [PW - 9, t * PH], [t * PW, PH - 9], [9, t * PH]][side];
      d.print = { x: pos[0], y: pos[1], a: r() * TAU, rx: 6.5 + r() * 2, ry: 9 + r() * 2.5, seed: C.hash32(k, 77) };
    }
    if (r() < 0.18) {
      const side = Math.floor(r() * 4);
      d.leak = { side, t: 0.2 + r() * 0.6, size: 7 + r() * 8, amp: 0.05 + r() * 0.07 };
    }
    d.rebate = [2.4 + r() * 1.4, 2.4 + r() * 1.4, 2.4 + r() * 1.4, 2.4 + r() * 1.4]; // top right bottom left, mm
    d.shift = [(r() - 0.5) * 1.6, (r() - 0.5) * 1.6]; // registration differs plate to plate
    d.fog = 0.85 + r() * 0.35;
    d.grainOffset = Math.floor(r() * 1e6);
    return d;
  }

  // The plate's outline with its chips, as a Path2D in mm.
  function chipPoints(ch) {
    const r = C.rng(ch.seed), pts = [];
    const n = 11;
    if (ch.corner) {
      // a curved bite across the corner
      for (let i = 0; i <= n; i++) {
        const t = i / n, ang = t * Math.PI / 2;
        const wob = 1 + (r() - 0.5) * 0.22;
        pts.push([ch.x + ch.nx * ch.a * Math.cos(ang) * wob * (1 - 0.15 * Math.sin(t * Math.PI)), ch.y + ch.ny * ch.b * Math.sin(ang) * wob]);
      }
    } else {
      const tx = -ch.ny, ty = ch.nx; // along the edge
      for (let i = 0; i <= n; i++) {
        const t = i / n * 2 - 1;
        const depth = ch.b * Math.sqrt(Math.max(0, 1 - t * t)) * (1 + (r() - 0.5) * 0.3);
        pts.push([ch.x + tx * t * ch.a + ch.nx * depth, ch.y + ty * t * ch.a + ch.ny * depth]);
      }
    }
    return pts;
  }
  function insideChip(ch, x, y) {
    // approximate analytic test used per pixel near chips
    if (ch.corner) {
      const u = Math.abs(x - ch.x) / ch.a, v = Math.abs(y - ch.y) / ch.b;
      return u * u + v * v < 1;
    }
    const tx = -ch.ny, ty = ch.nx;
    const along = ((x - ch.x) * tx + (y - ch.y) * ty) / ch.a;
    const into = ((x - ch.x) * ch.nx + (y - ch.y) * ch.ny) / ch.b;
    return along * along + into * into < 1 && into >= -0.01;
  }

  /* ================================================== building one plate */
  function buildScene(k, now, L, view) {
    // collectors, stars, planets in plate mm, for plate k at time `now`
    const rings = [];
    const lastRing = Math.max(0, Math.min(k, C.dayIndex(now)));
    // keep the number of drawn dashes bounded; each dash then stands for a few collectors
    let budget = 0;
    for (let j = 1; j <= lastRing; j++) budget += C.ringSize(j);
    for (let j = 1; j <= lastRing; j++) {
      const g = C.ringGeometry(j);
      const n = j === k ? C.placedInRing(j, now) : C.ringSize(j);
      if (n <= 0) continue;
      rings.push({ g, n, size: C.ringSize(j), isNew: j === k });
    }
    return { rings, lastRing, budget };
  }

  function ringDashes(ring, view, densityScale) {
    // Turn one ring's collectors into dashes in plate mm.
    const g = ring.g, out = [];
    const r = C.rng(g.seed);
    const circMm = TAU * g.radius * view.S;
    const cap = Math.max(24, Math.round(circMm * 0.55 * densityScale));
    const drawn = Math.min(ring.size, cap);
    const per = ring.size / drawn;                          // collectors per dash
    const nDraw = Math.min(drawn, Math.ceil(ring.n / per));
    const speed = Math.sqrt(6 / g.radius);                  // orbital speed, relative
    for (let i = 0; i < nDraw; i++) {
      const frac = (i + 0.5) / drawn;
      // collectors are placed in hourly trains, so they bunch a little
      const train = Math.floor(frac * 24), within = frac * 24 - train;
      const bunch = (within - 0.5) * 0.06;
      const ang = g.start + g.dir * TAU * (frac - bunch / 24) + (r() - 0.5) * 0.004;
      const rr = g.radius * (1 + (r() - 0.5) * 2 * g.width);
      const c = Math.cos(ang), s = Math.sin(ang);
      const p = [rr * (g.e1[0] * c + g.e2[0] * s), rr * (g.e1[1] * c + g.e2[1] * s), rr * (g.e1[2] * c + g.e2[2] * s)];
      const t = [g.dir * (-g.e1[0] * s + g.e2[0] * c), g.dir * (-g.e1[1] * s + g.e2[1] * c), g.dir * (-g.e1[2] * s + g.e2[2] * c)];
      const A = view.project(p);
      const len = 0.2 * speed * (0.8 + r() * 0.4);         // solar radii travelled in the exposure
      const B = view.project([p[0] + t[0] * len, p[1] + t[1] * len, p[2] + t[2] * len]);
      // brightness: closer to the Sun is brighter; seen from behind (in front of the Sun) they show their dark side
      const phase = 0.32 + 0.68 * (0.5 - 0.5 * A.d / rr);
      const lit = Math.pow(6 / rr, 0.35) * phase * Math.pow(per, 0.15) * (0.7 + r() * 0.6);
      out.push({ ax: A.x, ay: A.y, bx: B.x, by: B.y, d: A.d, lit, tip: i === nDraw - 1 && ring.n < ring.size });
    }
    return out;
  }

  function exposeStars(film, view, shift, L) {
    const stars = starCatalogue();
    // on a small plate image a star can't be smaller than a pixel, so thin them out
    const vis = clamp(film.ppm / 5.6, 0.35, 1);
    for (const st of stars) {
      if (st.f < 0.3 / vis) continue;
      const x = view.sun.x + st.x + shift[0], y = view.sun.y + st.y + shift[1];
      if (x < -6 || y < -6 || x > L.PW + 6 || y > L.PH + 6) continue;
      // stars near the Sun are lost in its glare anyway
      const dS = Math.hypot(st.x, st.y);
      if (dS < view.R * 1.05) continue;
      film.star(x, y, st.f * (0.25 + 0.75 * vis), 0.05);
      if (st.f > 900) film.ring(x, y, 0.85 + Math.log10(st.f) * 0.14, 0.13, 0.0005 * st.f);
    }
  }

  function exposeBody(film, mask, view, pos, kind, L) {
    const P = view.project([pos.x, pos.y, pos.z]);
    const behind = P.d < 0 && Math.hypot(P.x - view.sun.x, P.y - view.sun.y) < view.R * 1.02;
    if (behind) return { P, hidden: true };
    if (kind === 'mercury') {
      film.star(P.x, P.y, 900, 0.16);
      film.ring(P.x, P.y, 1.15, 0.18, 0.5);
      // the mass-driver stream leaving Mercury: a faint dotted trail outward
      const rr = C.rng(77123);
      for (let i = 0; i < 26; i++) {
        const t = (i + rr() * 0.8) / 26;
        const ang = pos.ang + 0.04 + t * 0.7;
        const rad = pos.rad * (1 - t * 0.16);
        const q = view.project([rad * Math.cos(ang), rad * Math.sin(ang) * 0.99, rad * Math.sin(ang) * 0.12]);
        const jit = (rr() - 0.5) * 2.2 * (0.2 + t);
        film.star(q.x + jit, q.y - jit * 0.7, 1.5 * (1 - t) + 0.25, 0.06);
      }
    } else {
      // Another Sky: a cylinder, its long axis along the orbit, with a mirror glint
      const ang = pos.ang + Math.PI / 2;
      const a = [pos.x + Math.cos(ang) * 0.22, pos.y + Math.sin(ang) * 0.22, pos.z];
      const b = [pos.x - Math.cos(ang) * 0.22, pos.y - Math.sin(ang) * 0.22, pos.z];
      const A = view.project(a), B = view.project(b);
      film.dash(A.x, A.y, B.x, B.y, 0.11, 60);
      film.star(A.x, A.y, 260, 0.09);
      film.ring(P.x, P.y, 1.0, 0.16, 0.25);
    }
    return { P, hidden: false };
  }

  // The Sun on the emulsion: an overexposed disc that solarizes, its glare,
  // faint streamers, and scattered light across the plate.
  const SUN_LUT = (function () {
    const N = 16000, step = 0.01, lut = new Float32Array(N);
    const R = 5.0;
    for (let i = 0; i < N; i++) {
      const r = i * step;
      let E;
      if (r <= R) { const u = r / R; E = 2.2e6 * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - u * u))); }
      else {
        const x = R / r;
        E = 3.0e4 * Math.exp(-(r - R) / 0.2) + 90 * Math.pow(x, 7) + 1.6 * Math.pow(x, 2.8);
        // halation: light bounced off the back of the glass comes down again in a ring
        E += 0.16 * Math.exp(-Math.pow((r - R * 2.45) / (R * 0.16), 2)) + 0.05 * Math.exp(-Math.pow((r - R * 4.2) / (R * 0.3), 2));
      }
      E += 0.05 * Math.exp(-r / 30) + 0.034;   // sky fog: scattered light in the telescope
      lut[i] = E;
    }
    return { lut, N, step };
  })();

  // Coronal streamers: many fine rays and a few long ones.
  const RAYS = (function () {
    const r = C.rng(1919), out = [];
    for (let i = 0; i < 26; i++) out.push({ a: r() * TAU, w: 0.012 + r() * 0.03, amp: 0.25 + r() * 0.9, len: 2.2 + r() * 2.6 });
    for (let i = 0; i < 5; i++) out.push({ a: r() * TAU, w: 0.03 + r() * 0.04, amp: 0.8 + r() * 1.2, len: 4.5 + r() * 3.5 });
    return out;
  })();

  // The rays as a table over angle and radius, built once.
  const RAY_A = 1024, RAY_R = 64, RAY_RMAX = 8.5;
  let RAYTAB = null;
  function rayTable(R) {
    if (RAYTAB) return RAYTAB;
    const tab = new Float32Array(RAY_A * RAY_R);
    for (let ri = 0; ri < RAY_R; ri++) {
      const rmm = R * (1 + (RAY_RMAX - 1) * ri / (RAY_R - 1));
      const env = smooth(R * 1.02, R * 1.6, rmm);
      for (let ai = 0; ai < RAY_A; ai++) {
        const a = -Math.PI + TAU * ai / RAY_A;
        let st = 0;
        for (let q = 0; q < RAYS.length; q++) {
          const ry = RAYS[q];
          let da = a - ry.a; da -= TAU * Math.round(da / TAU);
          if (da > 0.5 || da < -0.5) continue;
          const wdt = ry.w * (1 + (rmm - R) / (R * 3));
          st += ry.amp * Math.exp(-da * da / (2 * wdt * wdt)) * (1 - smooth(R * 1.1, R * ry.len, rmm));
        }
        tab[ri * RAY_A + ai] = 1 + st * env;
      }
    }
    return (RAYTAB = tab);
  }

  // Pass 1: how much silver each pixel develops (density), before development effects.
  function computeDensity(opt, Dbuf, x0, y0, x1, y1) {
    const { w, ppm, film, mask, view, defects: df, L } = opt;
    const E = film.E;
    const sunx = (view.sun.x) * ppm, suny = (view.sun.y) * ppm;
    const invp = 1 / ppm, R = view.R;
    const reb = df.rebate.map(v => v * ppm);
    const PWp = L.PW * ppm, PHp = L.PH * ppm;
    const mottle = opt.mottle, streak = opt.streak;
    const leak = df.leak, water = df.water, imprint = opt.imprint;
    const rays = rayTable(R), rayK = (RAY_R - 1) / (R * (RAY_RMAX - 1)), angK = RAY_A / TAU;
    const SL = SUN_LUT.lut, SN = SUN_LUT.N - 1, SK = 1 / SUN_LUT.step, fog = df.fog;
    const hPW = L.PW / 2, hPH = L.PH / 2, iPW = 1 / L.PW, iPH = 1 / L.PH, Rr = R * RAY_RMAX, Rm = R * 2.3;
    for (let j = y0; j < y1; j++) {
      const ymm = (j + 0.5) * invp;
      const vy = (ymm - hPH) * iPH, vig = 0.32 * vy * vy;
      for (let i = x0; i < x1; i++) {
        const idx = j * w + i;
        const xmm = (i + 0.5) * invp;
        const dx = i + 0.5 - sunx, dy = j + 0.5 - suny;
        const rmm = Math.sqrt(dx * dx + dy * dy) * invp;
        let ri = (rmm * SK) | 0; if (ri > SN) ri = SN;
        let sunE = SL[ri];
        if (rmm > R && rmm < Rr) {
          const ai = ((Math.atan2(dy, dx) + Math.PI) * angK) | 0;
          sunE *= rays[(((rmm - R) * rayK) | 0) * RAY_A + (ai & (RAY_A - 1))];
        }
        if (rmm < Rm) {
          const m = mask.at(i, j);
          if (m > 0) sunE *= Math.pow(1 - Math.min(0.995, m), 3);
        }
        let e = (E[idx] + sunE) * fog;
        e *= 0.86 + 0.28 * sampleField(mottle, i, j);  // uneven coating and development
        const vx = (xmm - hPW) * iPW;
        e *= 1 - 0.32 * vx * vx - vig;                 // the lens darkens toward the corners
        // the plate holder's rebate covered the edges: no light there
        const dEdge = Math.min(i - reb[3], PWp - reb[1] - i, j - reb[0], PHp - reb[2] - j);
        if (dEdge < 1.2) e *= clamp((dEdge + 0.4) / 1.6, 0, 1);
        // the holder's corner springs shaded a quarter-circle at each corner
        const cxm = xmm < hPW ? xmm : L.PW - xmm, cym = ymm < hPH ? ymm : L.PH - ymm;
        if (cxm < 9 && cym < 9) { const cr = Math.sqrt((cxm - 1) * (cxm - 1) + (cym - 1) * (cym - 1)); e *= smooth(5.6, 6.3, cr); }
        // the holder's number, cut through its frame, printed on the edge
        if (imprint && i >= imprint.x0 && i < imprint.x1 && j >= imprint.y0 && j < imprint.y1) e += imprint.a[(j - imprint.y0) * imprint.w + (i - imprint.x0)] * 0.9;
        if (leak) { // light got past the dark slide
          const ex = leak.side === 1 ? PWp - i : leak.side === 3 ? i : (leak.side === 0 ? j : PHp - j);
          const along = leak.side % 2 ? j / PHp : i / PWp;
          e += Math.exp(-ex / (leak.size * ppm * 0.35)) * Math.exp(-Math.pow((along - leak.t) / 0.22, 2)) * leak.amp;
        }
        let D = densityOf(e);
        D -= sampleField(streak, i, j) * Math.min(1, D) * 0.08;  // tired developer below the dense Sun
        if (water) {
          const wdx = xmm - water.x, wdy = ymm - water.y, wr = Math.sqrt(wdx * wdx + wdy * wdy);
          D += 0.05 * Math.exp(-Math.pow((wr - water.r) / 0.25, 2)) - (wr < water.r ? 0.012 : 0);
        }
        Dbuf[idx] = D;
      }
    }
  }

  // Pass 2: development edge effects, grain, damage, then the glass and the light box.
  function develop(opt, Dbuf, out, x0, y0, x1, y1) {
    const { w, h, ppm, defects: df, L } = opt;
    const grain = opt.grain, gox = df.grainOffset & 1023, goy = (df.grainOffset >> 10) & 1023;
    const invp = 1 / ppm;
    // adjacency (Eberhard) effect: fresh developer from thin areas darkens the
    // edges of dense ones, and the thin side gets a pale fringe
    const m = Math.max(2, Math.round(ppm * 0.35));
    const ax0 = Math.max(0, x0 - m * 3), ay0 = Math.max(0, y0 - m * 3), ax1 = Math.min(w, x1 + m * 3), ay1 = Math.min(h, y1 + m * 3);
    const rw = ax1 - ax0, rh = ay1 - ay0;
    const sub = new Float32Array(rw * rh);
    for (let j = 0; j < rh; j++) sub.set(Dbuf.subarray((j + ay0) * w + ax0, (j + ay0) * w + ax1), j * rw);
    const blur = boxBlur(sub, rw, rh, m, 2);
    const VL = VIEW.lut, VN = VIEW.N - 1, VS = VIEW.scale, PWm = L.PW, PHm = L.PH;
    const print = df.print;
    const prSkew = print ? (() => { const pr = C.rng(print.seed); return { c: Math.cos(print.a), s: Math.sin(print.a), cx: print.x * ppm, cy: print.y * ppm, rx: print.rx * ppm, ry: print.ry * ppm, ph: pr() * 6, f: TAU / (0.48 * ppm) }; })() : null;
    const scr = df.scratches.map(sc => {
      const ca = Math.cos(sc.a), sa = Math.sin(sc.a);
      const ex = sc.x + ca * sc.len, ey = sc.y + sa * sc.len, pad = Math.abs(sc.bend) * 0.3 + 1;
      return { ...sc, ca, sa, bx0: Math.min(sc.x, ex) - pad, bx1: Math.max(sc.x, ex) + pad, by0: Math.min(sc.y, ey) - pad, by1: Math.max(sc.y, ey) + pad };
    });
    for (let j = y0; j < y1; j++) {
      const ymm = (j + 0.5) * invp;
      for (let i = x0; i < x1; i++) {
        const idx = j * w + i;
        const xmm = (i + 0.5) * invp;
        let D = Dbuf[idx];
        const Db = blur[(j - ay0) * rw + (i - ax0)];
        D += 0.55 * (D - Db);
        // silver grain: strongest in the mid-tones
        const gv = grain[(((j + goy) & 1023) << 10) | ((i + gox) & 1023)];
        D += gv * (0.02 + 0.055 * Math.min(D, 1.6) / 1.6) * (D > 1.9 ? 0.6 : 1);
        for (let q = 0; q < scr.length; q++) { // hairline scratches lift the silver off
          const sc = scr[q];
          if (xmm < sc.bx0 || xmm > sc.bx1 || ymm < sc.by0 || ymm > sc.by1) continue;
          const lx = xmm - sc.x, ly = ymm - sc.y;
          const ca = sc.ca, sa = sc.sa;
          const u = lx * ca + ly * sa;
          if (u < 0 || u > sc.len) continue;
          const v = -lx * sa + ly * ca - sc.bend * Math.sin(Math.PI * u / sc.len) * 0.3;
          if (Math.abs(v) < sc.w * 2.5) D *= 1 - sc.depth * Math.exp(-v * v / (2 * sc.w * sc.w)) * smooth(0, 3, u) * smooth(0, 3, sc.len - u);
        }
        if (D < 0.02) D = 0.02;
        let vi = (D * VS) | 0; if (vi > VN) vi = VN;
        let T = VL[vi];
        if (prSkew) { // a fingerprint on the glass side
          const px = i - prSkew.cx, py = j - prSkew.cy;
          const u = (px * prSkew.c + py * prSkew.s) / prSkew.rx, v = (-px * prSkew.s + py * prSkew.c) / prSkew.ry;
          const rr = u * u + v * v;
          if (rr < 1.3) {
            const ridge = Math.sin(Math.sqrt(u * u * prSkew.rx * prSkew.rx + v * v * prSkew.ry * prSkew.ry * 0.8) * prSkew.f * 0.9 + 1.8 * Math.sin(u * 3 + prSkew.ph) + v * 2.2);
            T *= 1 - 0.04 * (0.5 + 0.5 * ridge) * (1 - smooth(0.55, 1.3, rr));
          }
        }
        // glass tint: greener toward the edges, where you look through more glass
        let ed = xmm < ymm ? xmm : ymm; const ex2 = PWm - xmm, ey2 = PHm - ymm;
        if (ex2 < ed) ed = ex2; if (ey2 < ed) ed = ey2;
        let gr = GLASS[0], gg = GLASS[1], gb = GLASS[2];
        if (ed < 6) { const ge = 1 - smooth(0, 6, ed); gr += (GLASS_EDGE[0] - gr) * ge; gg += (GLASS_EDGE[1] - gg) * ge; gb += (GLASS_EDGE[2] - gb) * ge; }
        const mid = T * (1 - T) * 4; // aged silver warms in the mid tones
        const o = idx * 4;
        out[o] = SILVER[0] + (gr - SILVER[0]) * T + mid * 10;
        out[o + 1] = SILVER[1] + (gg - SILVER[1]) * T + mid * 3;
        out[o + 2] = SILVER[2] + (gb - SILVER[2]) * T - mid * 7;
        out[o + 3] = 255;
      }
    }
  }

  function renderEmulsion(opt) {
    const { w, h } = opt;
    const x0 = opt.x0 || 0, y0 = opt.y0 || 0, x1 = opt.x1 == null ? w : opt.x1, y1 = opt.y1 == null ? h : opt.y1;
    if (!opt.Dbuf) opt.Dbuf = new Float32Array(w * h);
    // density is needed a little beyond the region for the edge effect
    const m = Math.max(2, Math.round(opt.ppm * 0.35)) * 3;
    computeDensity(opt, opt.Dbuf, Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(w, x1 + m), Math.min(h, y1 + m));
    develop(opt, opt.Dbuf, opt.out.data, x0, y0, x1, y1);
  }

  /* ================================================================= ink
     Ink sits on the glass side. On glass it doesn't soak in: it dries with a
     darker rim and beads a little. On paper it feathers into the fibres. */
  function handPath(pts, width, seed, taper) {
    // variable-width stroke outline from a centreline (mm in, mm out)
    const r = C.rng(seed);
    const n = pts.length;
    const L = [], R = [];
    const ph1 = r() * 6, ph2 = r() * 6;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const t = i / (n - 1 || 1);
      let wv = width * (0.78 + 0.22 * Math.sin(t * 5 + ph1) * Math.sin(t * 2.3 + ph2));
      if (taper) wv *= smooth(0, 0.12, t) * 0.75 + 0.25 + 0 * t, wv *= 1 - 0.55 * smooth(0.82, 1, t);
      L.push([p[0] - ty * wv / 2, p[1] + tx * wv / 2]);
      R.push([p[0] + ty * wv / 2, p[1] - tx * wv / 2]);
    }
    const path = new Path2D();
    path.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) path.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) path.lineTo(R[i][0], R[i][1]);
    path.closePath();
    return path;
  }
  function wobble(pts, amp, seed, freq) {
    // resample a polyline every 0.4 mm and add a slow hand tremor
    const r = C.rng(seed), out = [];
    const ph = r() * 10, ph2 = r() * 10;
    let total = 0; const segs = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
    const steps = Math.max(2, Math.ceil(total / 0.4));
    let si = 0, acc = 0;
    for (let s = 0; s <= steps; s++) {
      const d = total * s / steps;
      while (si < segs.length - 1 && acc + segs[si] < d) { acc += segs[si]; si++; }
      const t = segs[si] ? (d - acc) / segs[si] : 0;
      const a = pts[si], b = pts[si + 1] || a;
      let x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1;
      const off = amp * (Math.sin(d * (freq || 0.35) + ph) * 0.7 + Math.sin(d * (freq || 0.35) * 2.7 + ph2) * 0.3);
      out.push([x + nx / nl * off, y + ny / nl * off]);
    }
    return out;
  }
  function ellipsePts(cx, cy, rx, ry, rot, a0, a1, seed) {
    // a hand-drawn loop: not closed exactly, overshoots a little, slightly lumpy
    const r = C.rng(seed), pts = [], n = 48;
    const lump = r() * 6;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      const k = 1 + 0.06 * Math.sin(a * 2 + lump) + 0.03 * Math.sin(a * 3 + lump * 2);
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    return pts;
  }
  function arrowPts(from, to, bend, seed) {
    const r = C.rng(seed);
    const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
    const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / l * bend * l, cy = my + dx / l * bend * l;
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push([(1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * cx + t * t * to[0], (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * cy + t * t * to[1]]);
    }
    const end = pts[pts.length - 1], pre = pts[pts.length - 3];
    const ang = Math.atan2(end[1] - pre[1], end[0] - pre[0]);
    const hl = Math.min(3.2, l * 0.3) * (0.9 + r() * 0.2);
    const h1 = [end[0] - Math.cos(ang - 0.42) * hl, end[1] - Math.sin(ang - 0.42) * hl];
    const h2 = [end[0] - Math.cos(ang + 0.38) * hl * 0.9, end[1] - Math.sin(ang + 0.38) * hl * 0.9];
    return { shaft: pts, heads: [[h1, end], [end, h2]] };
  }

  // Write text by hand: each word sits slightly differently.
  function handText(ctx, text, x, y, sizeMm, family, seed, opts) {
    opts = opts || {};
    const r = C.rng(seed);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((opts.rot || 0) + (r() - 0.5) * 0.02);
    ctx.font = `${sizeMm}px ${family}`;
    ctx.textBaseline = 'alphabetic';
    const words = text.split(' ');
    const space = ctx.measureText(' ').width * (opts.spacing || 1);
    let total = 0;
    for (const wd of words) total += ctx.measureText(wd).width;
    total += space * (words.length - 1);
    let cx = opts.align === 'right' ? -total : opts.align === 'center' ? -total / 2 : 0;
    for (const wd of words) {
      const wdw = ctx.measureText(wd).width;
      ctx.save();
      ctx.translate(cx, (r() - 0.5) * sizeMm * 0.06);
      ctx.rotate((r() - 0.5) * 0.035);
      ctx.fillText(wd, 0, 0);
      ctx.restore();
      cx += wdw + space * (0.9 + r() * 0.25);
    }
    ctx.restore();
    return total;
  }
  function measure(ctx, text, sizeMm, family) {
    ctx.save(); ctx.font = `${sizeMm}px ${family}`; const w = ctx.measureText(text).width; ctx.restore(); return w;
  }

  // Work only where something was drawn: find touched tiles from a tiny
  // downscaled copy, then process runs of tiles with a margin for blurs.
  function tiled(canvas, margin, fn) {
    const w = canvas.width, h = canvas.height, T = 32;
    const tw = Math.ceil(w / T), th = Math.ceil(h / T);
    const cx = canvas.getContext('2d');
    const full = cx.getImageData(0, 0, w, h), fd = full.data;
    const hit = new Uint8Array(tw * th);
    for (let y = 0; y < h; y++) {
      const row = y * w, ty = (y / T | 0) * tw;
      for (let x = 0; x < w; x++) if (fd[(row + x) * 4 + 3]) { hit[ty + (x / T | 0)] = 1; x = (((x / T) | 0) + 1) * T - 1; }
    }
    for (let j = 0; j < th; j++) {
      let i = 0;
      while (i < tw) {
        if (!hit[j * tw + i]) { i++; continue; }
        let e = i; while (e < tw && hit[j * tw + e]) e++;
        const x0 = i * T, y0 = j * T, x1 = Math.min(w, e * T), y1 = Math.min(h, (j + 1) * T);
        const rx0 = Math.max(0, x0 - margin), ry0 = Math.max(0, y0 - margin), rx1 = Math.min(w, x1 + margin), ry1 = Math.min(h, y1 + margin);
        const rw = rx1 - rx0, rh = ry1 - ry0;
        const sub = { data: new Uint8ClampedArray(rw * rh * 4) };
        for (let y = 0; y < rh; y++) sub.data.set(fd.subarray(((y + ry0) * w + rx0) * 4, ((y + ry0) * w + rx1) * 4), y * rw * 4);
        fn(sub, rw, rh, rx0, ry0);
        // write back only the run itself (the margin was context for blurs)
        for (let y = y0; y < y1; y++) {
          const sy = y - ry0;
          fd.set(sub.data.subarray((sy * rw + (x0 - rx0)) * 4, (sy * rw + (x1 - rx0)) * 4), (y * w + x0) * 4);
        }
        i = e;
      }
    }
    cx.putImageData(full, 0, 0);
  }

  // Ink dries on glass with a darker rim (the coffee-ring effect) and some beading.
  function developInkOnGlass(alphaC, ppm, seed) {
    const rad = Math.max(1, Math.round(ppm * 0.12));
    tiled(alphaC, rad * 3, (img, w, h, ox, oy) => {
      const d = img.data, A = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) A[i] = d[i * 4 + 3] / 255;
      const B = boxBlur(A, w, h, rad, 2);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const o = j * w + i, a = A[o];
        if (a <= 0.003) { d[o * 4 + 3] = 0; continue; }
        const rim = clamp(a - B[o] * 0.92, 0, 1) * 2.2 + (1 - B[o]) * 0.35;
        const bead = vnoise((i + ox) / (ppm * 0.35), (j + oy) / (ppm * 0.35), seed) - 0.5;
        const v = clamp(a * (0.7 + rim * 0.55 + bead * 0.28), 0, 1);
        d[o * 4] = INK[0] - rim * 10; d[o * 4 + 1] = INK[1] - rim * 8; d[o * 4 + 2] = INK[2] - rim * 4;
        d[o * 4 + 3] = v * 248;
      }
    });
    return alphaC;
  }
  // Grease pencil: waxy, it skips over the glass and leaves a broken stroke.
  function developGrease(alphaC, ppm, seed) {
    // wax only catches on the high points, so the stroke breaks up into grain,
    // more where the pencil was pressed lightly (the stroke's soft edges)
    const sc1 = 1 / Math.max(1.1, ppm * 0.16), sc2 = 1 / Math.max(2, ppm * 0.45);
    tiled(alphaC, 0, (img, w, h, ox, oy) => {
      const d = img.data;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const o = (j * w + i) * 4, a = d[o + 3] / 255;
        if (a <= 0.003) continue;
        const X = i + ox, Y = j + oy;
        const fine = hash2(X, Y, seed) * 0.35 + vnoise(X * sc1, Y * sc1, seed) * 0.65;
        const n = fine * 0.7 + vnoise(X * sc2, Y * sc2, seed + 9) * 0.3;
        const cover = smooth(0.3, 0.6, n + (a - 0.75) * 0.6);
        const sheen = vnoise(X * sc2 * 0.5, Y * sc2 * 0.5, seed + 3);
        d[o] = GREASE[0] + sheen * 16; d[o + 1] = GREASE[1] + sheen * 8; d[o + 2] = GREASE[2] + sheen * 6;
        d[o + 3] = clamp(a * cover, 0, 1) * 240;
      }
    });
    return alphaC;
  }
  // Ink on paper: soaks in and feathers along the fibres.
  function developInkOnPaper(alphaC, ppm, seed, color) {
    const w = alphaC.width, h = alphaC.height;
    const cx = alphaC.getContext('2d');
    const img = cx.getImageData(0, 0, w, h), d = img.data;
    const A = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) A[i] = d[i * 4 + 3] / 255;
    const B = boxBlur(A, w, h, Math.max(1, Math.round(ppm * 0.05)), 1);
    const sc = 1 / (ppm * 0.08);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = j * w + i;
      const fib = vnoise(i * sc * 0.3, j * sc * 2.2, seed) * 0.6 + vnoise(i * sc, j * sc, seed + 5) * 0.4;
      const a = clamp(Math.max(A[o] * 0.9, B[o] * 1.05) * (0.78 + fib * 0.35), 0, 1);
      d[o * 4] = color[0] + (1 - a) * 30; d[o * 4 + 1] = color[1] + (1 - a) * 22; d[o * 4 + 2] = color[2] + (1 - a) * 10;
      d[o * 4 + 3] = a * 235;
    }
    cx.putImageData(img, 0, 0);
    return alphaC;
  }

  // Draw the astronomical symbols by hand (fonts rarely have good ones).
  function symMercury(ctx, x, y, s) {
    // ☿: horns, circle, cross
    ctx.beginPath(); ctx.arc(x, y, s * 0.36, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - s * 0.62, s * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.36); ctx.lineTo(x, y + s * 0.98); ctx.moveTo(x - s * 0.26, y + s * 0.7); ctx.lineTo(x + s * 0.26, y + s * 0.7); ctx.stroke();
  }
  function symSun(ctx, x, y, s) {
    ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, s * 0.07, 0, TAU); ctx.fill();
  }

  /* ======================================================== annotations */
  function segCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }
  function segPointDist(a, b, p) {
    const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy || 1;
    const t = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l, 0, 1);
    return Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
  }
  function segBox(a, b, r) {
    const inside = p => p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h;
    if (inside(a) || inside(b)) return true;
    const c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    for (let i = 0; i < 4; i++) if (segCross(a, b, c[i], c[(i + 1) % 4])) return true;
    return false;
  }
  function placeLabel(cands, boxes, PW, PH, avoid, busy, leaders, objects, labelBoxes) {
    let best = null, bestS = Infinity;
    for (const c of cands) {
      let s = c.pref || 0;
      const b = c.box;
      if (c.lead && leaders) {
        const pad = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
        for (const l of leaders) {
          if (segCross(c.lead[0], c.lead[1], l[0], l[1])) s += 1500;
          else {
            const dd = Math.min(segPointDist(c.lead[0], c.lead[1], l[0]), segPointDist(c.lead[0], c.lead[1], l[1]), segPointDist(l[0], l[1], c.lead[0]), segPointDist(l[0], l[1], c.lead[1]));
            if (dd < 4) s += (4 - dd) * 300;                  // leaders crowding each other
          }
          if (segBox(l[0], l[1], pad(b, 1.5))) s += 1200;     // someone else's leader through these words
        }
        for (const lb of labelBoxes || []) if (segBox(c.lead[0], c.lead[1], pad(lb, 1.5))) s += 1200; // this leader through other words
        for (const o of objects || []) if (o !== c.self && segPointDist(c.lead[0], c.lead[1], [o.x, o.y]) < o.r) s += 900;
        // a leader shouldn't run under its own words
        const mx = (c.lead[0][0] + c.lead[1][0]) / 2, my = (c.lead[0][1] + c.lead[1][1]) / 2;
        if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) s += 600;
      }
      if (busy) s += busy(b) * 4000;
      const out = Math.max(0, 4 - b.x) + Math.max(0, 4 - b.y) + Math.max(0, b.x + b.w - PW + 4) + Math.max(0, b.y + b.h - PH + 4);
      if (out > 0) s += 5000 + out * 200;
      for (const o of boxes) {
        const ix = Math.max(0, Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x));
        const iy = Math.max(0, Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y));
        s += ix * iy * 40;
      }
      for (const a of avoid) {
        const nx = clamp(a.x, b.x, b.x + b.w), ny = clamp(a.y, b.y, b.y + b.h);
        const dd = Math.hypot(nx - a.x, ny - a.y);
        if (dd < a.r) s += (a.r - dd) * (a.w || 20);
      }
      if (s < bestS) { bestS = s; best = c; }
    }
    if (best) best.score = bestS;
    return best;
  }

  function drawAnnotations(state) {
    const { ink, grease, ppm, L, view, k, now, info, cssScale, defects, busy } = state;
    const PW = L.PW, PH = L.PH * (1 - L.inSleeve) - 1.5; // only the part out of the sleeve
    const ic = ink.getContext('2d'), gc = grease.getContext('2d');
    ic.setTransform(ppm, 0, 0, ppm, 0, 0); gc.setTransform(ppm, 0, 0, ppm, 0, 0);
    ic.fillStyle = '#000'; ic.strokeStyle = '#000'; gc.fillStyle = '#000'; gc.strokeStyle = '#000';
    ic.lineCap = 'round'; ic.lineJoin = 'round'; gc.lineCap = 'round'; gc.lineJoin = 'round';
    const mmPerCss = 1 / cssScale;                   // so lettering keeps a readable size on screen
    const phone = L.portrait;
    const HAND = '"La Belle Aurore", "Segoe Script", cursive';
    const WAX = '"Reenie Beanie", "Comic Sans MS", cursive';
    const size = (css, minMm) => Math.max(minMm || 0, css * mmPerCss);
    const boxes = [], hot = [];
    const sunAv = { x: view.sun.x, y: view.sun.y, r: view.R * 3.4, w: 30 };
    const avoid = [sunAv];
    const rr = C.rng(C.hash32(k, 31337));
    const penW = Math.max(0.22, 1.25 * mmPerCss);

    const strokeInk = (pts, wdt, seed, taper) => ic.fill(handPath(wobble(pts, 0.12, seed), wdt, seed, taper));
    const strokeWax = (pts, wdt, seed) => gc.fill(handPath(wobble(pts, 0.2, seed, 0.22), wdt, seed, false));

    // --- the label in the top-left corner: plate number, ink on paper (drawn separately)
    const labelBox = { x: 5, y: 5, w: phone ? size(64) : size(78), h: phone ? size(30) : size(34) };
    boxes.push(labelBox);

    // date and time, on the glass beside the label
    const dsz = size(phone ? 14.5 : 16);
    const dateC = k >= 1 ? C.dayDate(k) : C.pacificParts(now);
    const live = info.live;
    const tline = live || k < 1 ? `${C.fmtDate(dateC)} · ${C.fmtTime(now)} PT` : C.fmtDate(dateC);
    const dx = labelBox.x + labelBox.w + size(10), dy = labelBox.y + dsz * 1.05;
    handText(ic, tline, dx, dy, dsz, HAND, C.hash32(k, 1));
    const sub = k < 1 ? 'exp. 20 min · nothing built yet' : `exp. 20 min · ring ${k} ${live ? 'going up' : 'closed'}`;
    handText(ic, sub, dx + size(4), dy + dsz * 1.15, dsz * 0.8, HAND, C.hash32(k, 2));
    boxes.push({ x: dx, y: labelBox.y, w: measure(ic, tline, dsz, HAND) + size(6), h: dsz * 2.3 });

    // --- Mercury and Another Sky: circled in ink, named, and made clickable
    const named = [
      { id: 'swarm', pos: info.mercury, title: 'Mercury', sub: 'being taken apart', sym: 'mercury', circ: size(9) },
      { id: 'sky', pos: info.sky, title: 'Another Sky', sub: 'O’Neill cylinder', sym: null, circ: size(9) }
    ];
    const leaders = [], objects = [], labelBoxes = [];
    for (const nm of named) {
      if (!nm.pos || nm.pos.hidden) continue;
      const P = nm.pos.P;
      avoid.push({ x: P.x, y: P.y, r: nm.circ + size(10), w: 60 });
      boxes.push({ x: P.x - nm.circ, y: P.y - nm.circ, w: nm.circ * 2, h: nm.circ * 2 });
      nm.obj = { x: P.x, y: P.y, r: nm.circ * 1.3 };
      objects.push(nm.obj);
    }
    // place both labels together: try each order, keep the better total
    const plans = [];
    const visible = named.filter(nm => nm.pos && !nm.pos.hidden && nm.pos.P.x > 2 && nm.pos.P.y > 2 && nm.pos.P.x < PW - 2 && nm.pos.P.y < PH - 2);
    const tsz = size(phone ? 14 : 17), ssz = tsz * 0.74, showSub = !phone;
    const orders = visible.length > 1 ? [visible, visible.slice().reverse()] : [visible];
    for (const order of orders) {
      const bx = boxes.slice(), lds = leaders.slice(), lbs = labelBoxes.slice();
      let total = 0; const picks = [];
      for (const nm of order) {
        const P = nm.pos.P;
        const tw = Math.max(measure(ic, nm.title, tsz, HAND), showSub ? measure(ic, nm.sub, ssz, HAND) : 0) + (nm.sym ? tsz * 0.9 : 0);
        const th = tsz * 1.1 + (showSub ? ssz * 1.25 : 0);
        const cands = [];
        for (const [dk, dpen] of [[1, 0], [1.9, 20], [3, 45], [4.3, 80], [5.8, 120]]) {
          const dist = nm.circ + size(phone ? 16 : 22) * dk;
          for (let a = 0; a < 24; a++) {
            const ang = a / 24 * TAU;
            const ax = P.x + Math.cos(ang) * dist, ay = P.y + Math.sin(ang) * dist;
            const bxx = Math.cos(ang) >= 0 ? ax : ax - tw, by = ay - th / 2;
            const away = Math.cos(ang) * (P.x - view.sun.x) + Math.sin(ang) * (P.y - view.sun.y);
            const anchor = [bxx + (Math.cos(ang) >= 0 ? -size(2) : tw + size(2)), by + tsz * 0.62];
            cands.push({ ang, ax, ay, dk, self: nm.obj, lead: [[P.x + Math.cos(ang) * nm.circ * 1.1, P.y + Math.sin(ang) * nm.circ * 1.1], anchor],
              box: { x: bxx, y: by, w: tw, h: th }, pref: dpen + (away < 0 ? 40 : 0) + Math.abs(Math.sin(ang)) * 8 });
          }
        }
        const c = placeLabel(cands, bx, PW, PH, avoid, busy, lds, objects, lbs);
        total += c.score;
        lds.push(c.lead); lbs.push(c.box); bx.push(c.box);
        picks.push({ nm, c });
      }
      plans.push({ total, picks });
    }
    plans.sort((a, b) => a.total - b.total);
    for (const { nm, c } of (plans[0] ? plans[0].picks : [])) {
      const P = nm.pos.P;
      leaders.push(c.lead); labelBoxes.push(c.box); boxes.push(c.box);
      // circle
      ic.lineWidth = penW;
      const loop = ellipsePts(P.x, P.y, nm.circ, nm.circ * 0.82, rr() * 3, rr() * 6, rr() * 6 + TAU * 1.08, C.hash32(k, nm.id.length * 7));
      strokeInk(loop, penW, C.hash32(k, 11 + nm.id.length), false);
      // leader from circle edge to the label
      const la = c.ang;
      const from = [P.x + Math.cos(la) * nm.circ * 1.1, P.y + Math.sin(la) * nm.circ * 1.1];
      const to = [c.box.x + (Math.cos(la) >= 0 ? -size(2) : c.box.w + size(2)), c.box.y + tsz * 0.62];
      const lead = arrowPts(from, to, 0.14 * (rr() < 0.5 ? 1 : -1), C.hash32(k, 21)).shaft;
      strokeInk(lead, penW * 0.75, C.hash32(k, 22), true);
      // words
      let tx = c.box.x;
      if (nm.sym === 'mercury') { ic.lineWidth = penW * 0.85; symMercury(ic, tx + tsz * 0.3, c.box.y + tsz * 0.45, tsz * 0.62); tx += tsz * 0.85; }
      handText(ic, nm.title, tx, c.box.y + tsz * 0.85, tsz, HAND, C.hash32(k, 30 + nm.id.length));
      if (showSub) handText(ic, nm.sub, tx + size(3), c.box.y + tsz * 0.85 + ssz * 1.2, ssz, HAND, C.hash32(k, 40 + nm.id.length));
      hot.push({ id: nm.id, x: c.box.x - size(4), y: c.box.y - size(3), w: c.box.w + size(8), h: c.box.h + size(5), px: P.x, py: P.y, r: nm.circ * 1.4 });
    }

    // --- the newest ring: red grease pencil at its leading tip
    if (info.tip) {
      const T = info.tip;
      const dirx = T.x - view.sun.x, diry = T.y - view.sun.y, dl = Math.hypot(dirx, diry) || 1;
      const ux = dirx / dl, uy = diry / dl;
      const nsz = size(phone ? 27 : 34);
      const lab = String(k);
      const lw = measure(gc, lab, nsz, WAX);
      const cands = [];
      for (let a = -6; a <= 6; a++) for (const dk of [1, 1.7, 2.6]) {
        const ang = Math.atan2(uy, ux) + a * 0.26;
        const d = size(phone ? 34 : 44) * dk;
        const ax = T.x + Math.cos(ang) * d, ay = T.y + Math.sin(ang) * d;
        const extra = live ? measure(ic, C.fmtTime(now), size(14), HAND) + size(6) : 0;
        cands.push({ ang, ax, ay, box: { x: ax - lw / 2 - size(6), y: ay - nsz * 0.55, w: lw + size(12) + extra, h: nsz * 1.1 }, pref: Math.abs(a) * 3 + (dk - 1) * 30 });
      }
      const c = placeLabel(cands, boxes, PW, PH, [{ x: view.sun.x, y: view.sun.y, r: view.R * 2.2, w: 40 }], busy);
      boxes.push(c.box);
      const ex = T.x + (c.ax - T.x) * 0.22, ey = T.y + (c.ay - T.y) * 0.22;
      const sx2 = c.ax - (c.ax - T.x) * 0.25, sy2 = c.ay - (c.ay - T.y) * 0.25;
      const arrow = arrowPts([sx2, sy2], [ex, ey], 0.12 * (rr() < 0.5 ? -1 : 1), C.hash32(k, 55));
      const gw = Math.max(0.6, 3.1 * mmPerCss);
      strokeWax(arrow.shaft, gw, C.hash32(k, 56));
      strokeWax(arrow.heads[0], gw, C.hash32(k, 57));
      strokeWax(arrow.heads[1], gw, C.hash32(k, 58));
      const lx = c.ax - lw / 2, ly = c.ay + nsz * 0.3;
      gc.save(); gc.font = `${nsz}px ${WAX}`; gc.lineWidth = gw * 0.45; gc.lineJoin = 'round'; gc.strokeText(lab, lx, ly); gc.fillText(lab, lx, ly); gc.restore();
      // a loose circle round the number
      const circ = ellipsePts(c.ax + size(0.5), c.ay - nsz * 0.04, lw * 0.95 + size(4), nsz * 0.55, -0.15, 0.6, 0.6 + TAU * 1.05, C.hash32(k, 59));
      strokeWax(circ, gw * 0.8, C.hash32(k, 60));
      if (live) handText(ic, C.fmtTime(now), c.ax + lw * 0.95 + size(9), c.ay + size(5), size(14), HAND, C.hash32(k, 61));
    } else if (info.newRingMark) {
      // a finished ring: bracket it in grease pencil where it is most isolated
      const T = info.newRingMark;
      const nsz = size(phone ? 24 : 28), lab = String(k), lw = measure(gc, lab, nsz, WAX);
      const ux = (T.x - view.sun.x), uy = (T.y - view.sun.y), ul = Math.hypot(ux, uy) || 1;
      const ax = T.x + ux / ul * size(30), ay = T.y + uy / ul * size(30);
      const gw = Math.max(0.6, 3.1 * mmPerCss);
      const tick = [[T.x - uy / ul * size(9) + ux / ul * size(4), T.y + ux / ul * size(9) + uy / ul * size(4)], [T.x + ux / ul * size(6), T.y + uy / ul * size(6)], [T.x + uy / ul * size(9) + ux / ul * size(4), T.y - ux / ul * size(9) + uy / ul * size(4)]];
      strokeWax(tick, gw, C.hash32(k, 62));
      gc.save(); gc.font = `${nsz}px ${WAX}`; gc.fillText(lab, ax - lw / 2, ay + nsz * 0.3); gc.restore();
      boxes.push({ x: ax - lw, y: ay - nsz, w: lw * 2, h: nsz * 1.4 });
    }

    // --- the running count in the right margin
    if (k >= 1) {
      const csz = size(phone ? 15 : 17);
      const t1 = `Σ ${C.fmtNum(info.total)}`, t2 = `${info.rings} ring${info.rings === 1 ? '' : 's'}`;
      const w1 = measure(ic, t1, csz, HAND);
      const cx = PW - size(phone ? 14 : 18), cy = PH - size(phone ? 56 : 52);
      handText(ic, t1, cx, cy, csz, HAND, C.hash32(k, 70), { align: 'right' });
      strokeInk([[cx - w1, cy + size(4)], [cx + size(2), cy + size(3)]], penW * 0.8, C.hash32(k, 71), true);
      strokeInk([[cx - w1 + size(3), cy + size(7)], [cx + size(1), cy + size(6.5)]], penW * 0.7, C.hash32(k, 72), true);
      handText(ic, t2, cx, cy + csz * 1.5, csz * 0.8, HAND, C.hash32(k, 73), { align: 'right' });
      boxes.push({ x: cx - w1 - size(4), y: cy - csz, w: w1 + size(6), h: csz * 2.8 });
    }

    // --- comparison stars, ticked the way plate measurers did it
    if (!phone) {
      const stars = starCatalogue();
      const picks = [];
      for (const st of stars) {
        if (st.f < 60 || st.f > 2500) continue;
        const x = view.sun.x + st.x + defects.shift[0], y = view.sun.y + st.y + defects.shift[1];
        if (x < 22 || y < 22 || x > PW - 22 || y > PH - 22) continue;
        if (Math.hypot(st.x, st.y) < 60) continue;
        let clash = false;
        for (const b of boxes) if (x > b.x - 6 && x < b.x + b.w + 6 && y > b.y - 6 && y < b.y + b.h + 6) clash = true;
        if (!clash) picks.push({ x, y, f: st.f });
      }
      picks.sort((a, b) => b.f - a.f);
      const chosen = [];
      for (const p of picks) { if (chosen.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 30)) chosen.push(p); if (chosen.length >= 5) break; }
      chosen.forEach((p, n) => {
        const g = size(4.5), l = size(7);
        strokeInk([[p.x - g - l, p.y], [p.x - g, p.y]], penW * 0.6, C.hash32(k, 80 + n), false);
        strokeInk([[p.x + g, p.y], [p.x + g + l, p.y]], penW * 0.6, C.hash32(k, 90 + n), false);
        handText(ic, String(n + 1), p.x + g + l + size(2), p.y + size(4), size(11), HAND, C.hash32(k, 100 + n));
      });
    }

    // --- a small note that the plate was blinked against the one before it
    if (k > 1 && !phone) {
      const bsz = size(13);
      handText(ic, `blinked v. ${k - 1} ✓`, size(14), PH - size(30), bsz, HAND, C.hash32(k, 110));
    }
    return hot;
  }

  // The paper label in the corner: ink on paper, glued to the glass.
  function drawPlateLabel(ctx, ppm, L, k, cssScale, seed) {
    const mmPerCss = 1 / cssScale;
    const phone = L.portrait;
    const w = phone ? 64 * mmPerCss : 78 * mmPerCss, h = phone ? 30 * mmPerCss : 34 * mmPerCss;
    const x = 5, y = 5;
    const r = C.rng(seed);
    const pw = Math.ceil(w * ppm) + 4, ph = Math.ceil(h * ppm) + 4;
    const pc = makeCanvas(pw, ph), px = pc.getContext('2d');
    const img = px.createImageData(pw, ph), d = img.data;
    // backlit paper: you see the fibres glowing through it
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      const u = i / ppm, v = j / ppm;
      const edge = Math.min(u, w - u, v, h - v);
      const torn = (vnoise(u * 1.4, v * 1.4, seed) - 0.5) * 0.9;
      if (edge + torn * (v > h * 0.7 || u > w * 0.85 ? 1 : 0.3) < 0) continue;
      const fib = vnoise(u * 3, v * 9, seed + 1) * 0.55 + vnoise(u * 11, v * 13, seed + 2) * 0.45;
      const glue = 1 - smooth(0, 1.4, edge) * 0.5;
      const o = (j * pw + i) * 4;
      const base = 222 - fib * 26 - glue * 14;
      d[o] = base + 6; d[o + 1] = base - 2; d[o + 2] = base - 22;
      d[o + 3] = 236;
    }
    px.putImageData(img, 0, 0);
    // the plate number, written on the label in fountain pen
    const ink = makeCanvas(pw, ph), ix = ink.getContext('2d');
    ix.setTransform(ppm, 0, 0, ppm, 0, 0);
    ix.fillStyle = '#000';
    const HAND = '"La Belle Aurore", "Segoe Script", cursive';
    const fs = h * 0.66;
    handText(ix, k < 1 ? 'DS 0' : `DS ${k}`, w * 0.1, h * 0.72, fs, HAND, seed + 7);
    developInkOnPaper(ink, ppm, seed + 8, IRON_GALL);
    px.drawImage(ink, 0, 0);
    ctx.save();
    ctx.translate(x * ppm, y * ppm);
    ctx.rotate((r() - 0.5) * 0.04);
    ctx.drawImage(pc, 0, 0);
    ctx.restore();
  }

  /* ======================================================== whole plate */
  function renderPlate(p) {
    // p: { k, now, L, dpr, blink } -> { cur, prev, hot, info }
    const { k, now, L } = p;
    // the emulsion can be a little softer than the screen on big plates (it is
    // a photograph); the ink layer is always at full resolution
    const dprE = L.pw > 560 ? Math.min(p.dpr, 1.5) : p.dpr;
    const ppm = L.s * dprE, ppmI = L.s * p.dpr;
    const w = Math.round(L.PW * ppm), h = Math.round(L.PH * ppm);
    const wI = Math.round(L.PW * ppmI), hI = Math.round(L.PH * ppmI);
    const view = makeView(L);
    const df = plateDefects(k, L.PW, L.PH);
    const sh = df.shift;
    const shiftV = { ...view, sun: { x: view.sun.x + sh[0], y: view.sun.y + sh[1] }, project: q => { const P = view.project(q); return { x: P.x + sh[0], y: P.y + sh[1], d: P.d }; } };

    const film = new Film(w, h, ppm);
    const mask = new Mask(shiftV.sun.x, shiftV.sun.y, view.R * 2.4, ppm);
    exposeStars(film, view, sh, L);
    const tNow = Math.min(now, C.dayEnd(Math.max(1, k)) - 1);
    const merc = exposeBody(film, mask, shiftV, C.mercury(tNow), 'mercury', L);
    const sky = exposeBody(film, mask, shiftV, C.anotherSky(tNow), 'sky', L);

    const scene = buildScene(k, tNow, L, shiftV);
    const totalDash = scene.rings.reduce((a, r) => a + Math.min(r.size, TAU * r.g.radius * view.S * 0.55), 0);
    const densityScale = totalDash > 45000 ? 45000 / totalDash : 1;
    const drawnTotal = Math.min(totalDash, 45000);
    const crowd = drawnTotal > 9000 ? Math.pow(9000 / drawnTotal, 0.55) : 1;
    const thin = Math.max(0.045, 0.5 / ppm);
    const newDashes = [];
    const drawDash = (dsh, film, mask) => {
      const dS = Math.hypot(dsh.ax - shiftV.sun.x, dsh.ay - shiftV.sun.y);
      if (dsh.d < 0 && dS < view.R * 1.02) return;   // hidden behind the Sun
      if (dsh.d > 0 && dS < view.R * 2.2) mask.dash(dsh.ax, dsh.ay, dsh.bx, dsh.by, thin * 1.15, 1);
      film.dash(dsh.ax, dsh.ay, dsh.bx, dsh.by, thin, 0.95 * dsh.lit * crowd);
    };
    let tip = null, newRingMark = null;
    for (const ring of scene.rings) {
      const ds = ringDashes(ring, shiftV, densityScale);
      if (ring.isNew) { newDashes.push(...ds); continue; }
      for (const d of ds) drawDash(d, film, mask);
    }
    // tip of the newest ring, or a quiet spot on it if it is finished
    if (newDashes.length) {
      const last = newDashes[newDashes.length - 1];
      if (last.tip) tip = { x: last.ax, y: last.ay };
      else {
        let best = null, bs = -1;
        for (let i = 0; i < newDashes.length; i += 7) {
          const d = newDashes[i];
          if (d.ax < 25 || d.ay < 25 || d.ax > L.PW - 25 || d.ay > L.PH - 25) continue;
          const ds = Math.hypot(d.ax - shiftV.sun.x, d.ay - shiftV.sun.y);
          if (ds < view.R * 4) continue;
          const sc = ds * (0.6 + 0.4 * C.rng(i + 3)());
          if (sc > bs) { bs = sc; best = d; }
        }
        if (best) newRingMark = { x: best.ax, y: best.ay };
      }
    }

    const grain = grainTile();
    const mseed = C.hash32(k, 600);
    const mottle = coarseField(w, h, Math.max(4, Math.round(ppm * 2.5)), (x, y) => fbm(x / (ppm * 26), y / (ppm * 26), mseed, 3));
    // edge imprint: small letters exposed through the holder frame, along the left edge
    const imprint = (() => {
      const txt = `DS  ·  HOLDER ${1 + (k % 4)}  ·  20 MIN  ·  ${k >= 1 ? 'No. ' + k : 'TEST'}`;
      const fs = 1.55 * ppm, len = Math.ceil(fs * 0.62 * txt.length) + 4, thick = Math.ceil(fs * 1.3);
      const c = makeCanvas(len, thick), x = c.getContext('2d');
      x.font = `700 ${fs}px "Old Standard TT", Georgia, serif`; x.letterSpacing = (0.2 * ppm) + 'px';
      x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(txt, 2, thick / 2);
      const d = x.getImageData(0, 0, len, thick).data;
      // rotate 90 degrees: reads bottom to top along the left edge
      const W2 = thick, H2 = len, a = new Float32Array(W2 * H2);
      for (let yy = 0; yy < thick; yy++) for (let xx = 0; xx < len; xx++) a[(len - 1 - xx) * W2 + yy] = d[(yy * len + xx) * 4 + 3] / 255;
      const x0 = Math.round(df.rebate[3] * ppm * 0.18), y0 = Math.round(L.PH * ppm * 0.18);
      return { a, w: W2, x0, y0, x1: x0 + W2, y1: Math.min(h, y0 + H2) };
    })();
    const sunPx = shiftV.sun.x * ppm, sunPy = shiftV.sun.y * ppm;
    const streak = coarseField(w, h, Math.max(3, Math.round(ppm * 1.2)), (x, y) => {
      const dy = (y - sunPy) / ppm, dx = (x - sunPx) / ppm;
      if (dy < view.R) return 0;
      const fall = Math.exp(-dy / 55) * Math.exp(-Math.pow(dx / (view.R * 3.2), 2));
      return fall * (0.6 + 0.4 * vnoise(dx * 0.9, dy * 0.05, mseed + 4));
    });

    const ctxOpts = { w, h, ppm, film, mask, view: shiftV, defects: df, L, grain, mottle, streak, imprint, Dbuf: new Float32Array(w * h) };
    // keep the exposure without the newest ring, for the blink's earlier version
    const baseE = newDashes.length ? film.E.slice() : null;
    const baseM = newDashes.length ? mask.M.slice() : null;
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    for (const d of newDashes) {
      drawDash(d, film, mask);
      bx0 = Math.min(bx0, d.ax, d.bx); by0 = Math.min(by0, d.ay, d.by); bx1 = Math.max(bx1, d.ax, d.bx); by1 = Math.max(by1, d.ay, d.by);
    }
    const curImg = new ImageData(w, h);
    renderEmulsion({ ...ctxOpts, out: curImg });

    // the plate's outline: glass with chips out of it
    const outline = new Path2D();
    outline.rect(0, 0, L.PW, L.PH);
    const chipPaths = df.chips.map(ch => { const pts = chipPoints(ch); const pth = new Path2D(); pth.moveTo(pts[0][0], pts[0][1]); for (const q of pts) pth.lineTo(q[0], q[1]); if (ch.corner) pth.lineTo(ch.x, ch.y); else pth.lineTo(pts[0][0], pts[0][1]); pth.closePath(); return { pth, pts, ch }; });

    const info = {
      live: k >= 1 && now < C.dayEnd(k),
      total: C.totalPlaced(tNow), rings: Math.max(0, scene.lastRing),
      mercury: merc, sky, tip, newRingMark
    };
    // ink layers (shared by both versions)
    const inkC = makeCanvas(wI, hI), greaseC = makeCanvas(wI, hI);
    const Db = ctxOpts.Dbuf;
    const busy = b => { // how much is already on the plate under a box (0 = clear sky)
      let acc = 0, n = 0;
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 8; gx++) {
        const x = Math.round((b.x + b.w * (gx + 0.5) / 8) * ppm), y = Math.round((b.y + b.h * (gy + 0.5) / 5) * ppm);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        let m = 0;
        for (let q = -2; q <= 2; q++) { const v = Db[clamp(y + q, 0, h - 1) * w + clamp(x + q * 2, 0, w - 1)]; if (v > m) m = v; }
        acc += Math.max(0, m - 0.32); n++;
      }
      return n ? acc / n : 0;
    };
    const hot = drawAnnotations({ ink: inkC, grease: greaseC, ppm: ppmI, L, view: shiftV, k, now: tNow, info, cssScale: L.s, defects: df, busy });
    developInkOnGlass(inkC, ppmI, C.hash32(k, 900));
    developGrease(greaseC, ppmI, C.hash32(k, 901));
    // the ink layer: everything written or stuck on the glass, and the glass edge
    const ink = makeCanvas(wI, hI), ix = ink.getContext('2d');
    ix.drawImage(inkC, 0, 0);
    ix.drawImage(greaseC, 0, 0);
    drawPlateLabel(ix, ppmI, L, k, L.s, C.hash32(k, 333));
    ix.save(); ix.scale(ppmI, ppmI);
    {
      const lw = 1 / ppmI;
      ix.strokeStyle = 'rgba(92,112,92,.55)'; ix.lineWidth = lw * 2.2; ix.strokeRect(lw, lw, L.PW - 2 * lw, L.PH - 2 * lw);
      ix.strokeStyle = 'rgba(255,255,248,.65)'; ix.lineWidth = lw; ix.strokeRect(lw * 3.2, lw * 3.2, L.PW - 6.4 * lw, L.PH - 6.4 * lw);
      for (const cp of chipPaths) {
        ix.save(); ix.globalCompositeOperation = 'destination-out'; ix.fill(cp.pth); ix.restore();
        ix.save(); ix.clip(outline);
        const pts = cp.pts;
        ix.strokeStyle = 'rgba(214,228,206,.9)'; ix.lineWidth = lw * 3;
        ix.beginPath(); ix.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ix.lineTo(q[0], q[1]); ix.stroke();
        ix.strokeStyle = 'rgba(80,98,80,.5)'; ix.lineWidth = lw * 1.2; ix.stroke();
        const r = C.rng(cp.ch.seed + 1);
        for (let q = 1; q <= 3; q++) {
          const sc = 1 + q * 0.13;
          ix.strokeStyle = `rgba(120,140,118,${0.22 - q * 0.05})`; ix.lineWidth = lw;
          ix.beginPath();
          pts.forEach((pt, i) => { const x = cp.ch.x + (pt[0] - cp.ch.x) * sc + (r() - 0.5) * 0.1, y = cp.ch.y + (pt[1] - cp.ch.y) * sc; i ? ix.lineTo(x, y) : ix.moveTo(x, y); });
          ix.stroke();
        }
        ix.restore();
      }
    }
    ix.restore();

    const finish = (img) => {
      const c = makeCanvas(w, h), cx = c.getContext('2d');
      cx.putImageData(img, 0, 0);
      cx.save();
      cx.scale(ppm, ppm);
      // dust and fibres lying on the glass (dark against the light)
      for (const ds of df.dust) { cx.fillStyle = `rgba(48,40,32,${ds.a})`; cx.beginPath(); cx.arc(ds.x, ds.y, ds.r, 0, TAU); cx.fill(); }
      cx.lineCap = 'round';
      for (const fb of df.fibers) {
        const r = C.rng(fb.seed);
        cx.strokeStyle = 'rgba(52,44,36,.32)'; cx.lineWidth = 0.05;
        cx.beginPath(); let x = fb.x, y = fb.y, a = fb.a; cx.moveTo(x, y);
        for (let i = 0; i < 14; i++) { a += (r() - 0.5) * fb.curl * 0.5; x += Math.cos(a) * fb.len / 14; y += Math.sin(a) * fb.len / 14; cx.lineTo(x, y); }
        cx.stroke();
      }
      // pinholes: clear specks where dust shaded the emulsion
      for (const pn of df.pins) { cx.fillStyle = 'rgba(250,247,236,.85)'; cx.beginPath(); cx.arc(pn.x, pn.y, pn.r, 0, TAU); cx.fill(); }
      cx.restore();
      cx.save(); cx.globalCompositeOperation = 'destination-out'; cx.scale(ppm, ppm);
      for (const cp of chipPaths) cx.fill(cp.pth);
      cx.restore();
      return c;
    };
    const cur = finish(curImg);
    // the earlier version: same plate, same grain, without the newest ring
    let prev = null;
    const makePrev = () => {
      if (prev) return prev;
      if (!baseE) return (prev = cur);
      film.E.set(baseE); mask.M.set(baseM);
      const prevImg = new ImageData(new Uint8ClampedArray(curImg.data), w, h);
      const m = 1.2;
      renderEmulsion({ ...ctxOpts, out: prevImg,
        x0: clamp(Math.floor((bx0 - m) * ppm), 0, w), y0: clamp(Math.floor((by0 - m) * ppm), 0, h),
        x1: clamp(Math.ceil((bx1 + m) * ppm), 0, w), y1: clamp(Math.ceil((by1 + m) * ppm), 0, h) });
      return (prev = finish(prevImg));
    };
    return { cur, makePrev, ink, hot, info, view: shiftV, w, h, ppm };
  }

  /* ============================================================ paper */
  function paperTexture(w, h, ppm, seed, base, opts) {
    opts = opts || {};
    const img = new ImageData(w, h), d = img.data;
    const sc = 1 / ppm;
    const F = coarseField(w, h, Math.max(3, Math.round(ppm * 1.5)), (x, y) => fbm(x * sc / 18, y * sc / 18, seed, 3));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = i * sc, v = j * sc;
      const fib = vnoise(u * 0.9, v * 7, seed + 3) * 0.5 + vnoise(u * 5, v * 3, seed + 4) * 0.5;
      const blot = sampleField(F, i, j);
      const speck = hash2(i, j, seed) > 0.9985 ? 0.5 : 0;
      const t = (fib - 0.5) * 9 + (blot - 0.5) * 22 - speck * 40;
      const o = (j * w + i) * 4;
      d[o] = base[0] + t; d[o + 1] = base[1] + t * 0.95; d[o + 2] = base[2] + t * 0.8; d[o + 3] = 255;
    }
    return img;
  }

  // The front of the plate's sleeve: kraft paper, a printed form, filled in by hand.
  function renderSleeve(p) {
    const { L, dpr, k, info, now } = p;
    const S = L.sleeve;
    const ppc = dpr; // pixels per css px
    const w = Math.round(S.w * ppc), h = Math.round(S.h * ppc);
    const c = makeCanvas(w, h), cx = c.getContext('2d');
    const seed = C.hash32(k, 5150);
    const mmc = L.s; // css px per mm
    const ppm = mmc * ppc;
    cx.putImageData(paperTexture(w, h, ppm, seed, KRAFT), 0, 0);
    // toning along the mouth and the edges, wear and foxing
    const g = cx.createLinearGradient(0, 0, 0, Math.min(h, 40 * ppc));
    g.addColorStop(0, 'rgba(120,88,44,.28)'); g.addColorStop(1, 'rgba(120,88,44,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    const gl = cx.createLinearGradient(0, 0, w, 0);
    gl.addColorStop(0, 'rgba(110,80,40,.22)'); gl.addColorStop(0.04, 'rgba(110,80,40,0)'); gl.addColorStop(0.96, 'rgba(110,80,40,0)'); gl.addColorStop(1, 'rgba(110,80,40,.25)');
    cx.fillStyle = gl; cx.fillRect(0, 0, w, h);
    const r = C.rng(seed);
    for (let i = 0; i < 9; i++) {
      const fx = r() * w, fy = r() * h, fr = (0.6 + r() * 2.2) * ppm;
      const fg = cx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fg.addColorStop(0, 'rgba(140,92,48,.22)'); fg.addColorStop(1, 'rgba(140,92,48,0)');
      cx.fillStyle = fg; cx.beginPath(); cx.arc(fx, fy, fr, 0, TAU); cx.fill();
    }
    // side seams of the envelope: the paper is folded over and glued
    cx.fillStyle = 'rgba(90,64,30,.16)';
    cx.fillRect(0, 0, 5 * ppm, h); cx.fillRect(w - 5 * ppm, 0, 5 * ppm, h);
    cx.strokeStyle = 'rgba(80,56,26,.35)'; cx.lineWidth = ppc;
    cx.beginPath(); cx.moveTo(5 * ppm, 0); cx.lineTo(5 * ppm, h); cx.moveTo(w - 5 * ppm, 0); cx.lineTo(w - 5 * ppm, h); cx.stroke();
    // printed form, then the hand entries
    const phone = L.portrait;
    const FORM = '"Old Standard TT", Georgia, serif';
    const HAND = '"La Belle Aurore", "Segoe Script", cursive';
    const Wc = S.w;
    const top = phone ? 15 : 24;
    const left = phone ? 22 : 38, right = Wc - (phone ? 16 : 32);
    const lab = phone ? 9.5 : 11, val = phone ? 15 : 18.5;
    const date = k >= 1 ? C.dayDate(k) : C.pacificParts(now);
    const printText = (t, x, y, sz, o) => {
      o = o || {};
      cx.font = `${o.italic ? 'italic ' : ''}${o.bold ? '700 ' : ''}${sz}px ${FORM}`;
      cx.textAlign = o.align || 'left';
      cx.letterSpacing = (o.spacing || 0) + 'px';
      cx.fillStyle = 'rgba(255,242,214,.4)'; cx.fillText(t, x + 0.5, y + 0.6);   // the bite of the type
      cx.fillStyle = `rgba(${PRINT[0]},${PRINT[1]},${PRINT[2]},.85)`; cx.fillText(t, x, y);
      cx.letterSpacing = '0px'; cx.textAlign = 'left';
      return cx.measureText(t).width;
    };
    cx.save(); cx.scale(ppc, ppc);
    printText('DYSON SWARM · PLATE STACK', left, top, phone ? 8.5 : 9.5, { spacing: 2.4 });
    printText(phone ? 'The Sun and its swarm' : 'Field: the Sun and its swarm, seen from 30° above the plane', right, top, phone ? 8.5 : 9.5, { italic: true, align: 'right' });
    cx.strokeStyle = `rgba(${PRINT[0]},${PRINT[1]},${PRINT[2]},.55)`; cx.lineWidth = 0.7;
    cx.beginPath(); cx.moveTo(left, top + 6); cx.lineTo(right, top + 6); cx.stroke();
    const cols = phone ? [
      { l: 'Plate', v: k < 1 ? '—' : `DS ${k}`, w: 0.27 },
      { l: 'Date', v: C.fmtDate(date), w: 0.4 },
      { l: 'Coll.', v: C.fmtNum(info.total), w: 0.33 }
    ] : [
      { l: 'Plate No.', v: k < 1 ? '—' : `DS ${k}`, w: 0.18 },
      { l: 'Date', v: C.fmtDate(date), w: 0.24 },
      { l: 'Rings', v: String(info.rings), w: 0.12 },
      { l: 'Collectors', v: C.fmtNum(info.total), w: 0.2 },
      { l: 'Remarks', v: k < 1 ? 'Sun alone' : info.live ? `ring ${k} going up` : `ring ${k} closed`, w: 0.26 }
    ];
    const row1 = top + (phone ? 23 : 32);
    const fields = [];
    let x = left;
    for (const col of cols) {
      const cw = (right - left) * col.w;
      const lw = printText(col.l, x, row1, lab, { italic: true });
      cx.beginPath(); cx.moveTo(x + lw + 4, row1 + 2); cx.lineTo(x + cw - 10, row1 + 2); cx.stroke();
      fields.push({ x: x + lw + 8, y: row1 - 1, v: col.v });
      x += cw;
    }
    if (!phone) {
      const row2 = row1 + 30;
      const l2 = printText('Measured by', left, row2, lab, { italic: true });
      cx.beginPath(); cx.moveTo(left + l2 + 4, row2 + 2); cx.lineTo(left + (right - left) * 0.42, row2 + 2); cx.stroke();
      fields.push({ x: left + l2 + 8, y: row2 - 1, v: 'S.K.' });
      const l3 = printText('Launchers', left + (right - left) * 0.46, row2, lab, { italic: true });
      cx.beginPath(); cx.moveTo(left + (right - left) * 0.46 + l3 + 4, row2 + 2); cx.lineTo(left + (right - left) * 0.66, row2 + 2); cx.stroke();
      fields.push({ x: left + (right - left) * 0.46 + l3 + 8, y: row2 - 1, v: String(C.launchers(k)) });
    }
    cx.restore();
    const inkC = makeCanvas(w, h), ix = inkC.getContext('2d');
    ix.setTransform(ppc, 0, 0, ppc, 0, 0); ix.fillStyle = '#000';
    fields.forEach((f, i) => handText(ix, f.v, f.x, f.y, val, HAND, seed + 20 + i));
    developInkOnPaper(inkC, ppc * 3.2, seed + 30, IRON_GALL);
    cx.drawImage(inkC, 0, 0);
    // a violet date stamp, inked unevenly
    if (!phone) {
      const stC = makeCanvas(w, h), sx = stC.getContext('2d');
      sx.setTransform(ppc, 0, 0, ppc, 0, 0);
      const sw = phone ? 70 : 96, shh = phone ? 22 : 30;
      const stx = phone ? right - sw / 2 - 4 : right - sw / 2 - 10, sty = phone ? row1 + 24 : row1 + 32;
      sx.translate(stx, sty); sx.rotate(-0.1 + (r() - 0.5) * 0.08);
      sx.strokeStyle = '#000'; sx.fillStyle = '#000'; sx.lineWidth = 1.7;
      sx.strokeRect(-sw / 2, -shh / 2, sw, shh);
      sx.lineWidth = 0.7; sx.strokeRect(-sw / 2 + 2.5, -shh / 2 + 2.5, sw - 5, shh - 5);
      sx.textAlign = 'center'; sx.letterSpacing = '1.3px';
      sx.font = `700 ${phone ? 7 : 9}px ${FORM}`;
      sx.fillText('PLATE FILED', 0, -shh / 2 + (phone ? 8.5 : 11.5));
      sx.font = `700 ${phone ? 9 : 12}px ${FORM}`;
      sx.fillText(`${String(date.d).padStart(2, '0')} ${C.MONTHS[date.m - 1].toUpperCase()} ${date.y}`, 0, shh / 2 - (phone ? 4.5 : 6));
      const sd = sx.getImageData(0, 0, w, h), q = sd.data;
      const ssc = 1 / (ppc * 2.2);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const o = (j * w + i) * 4; if (!q[o + 3]) continue;
        const n = vnoise(i * ssc, j * ssc, seed + 40) * 0.7 + vnoise(i * ssc * 4, j * ssc * 4, seed + 41) * 0.3;
        const a = q[o + 3] / 255 * smooth(0.2, 0.58, n);
        q[o] = STAMP[0]; q[o + 1] = STAMP[1]; q[o + 2] = STAMP[2]; q[o + 3] = a * 195;
      }
      sx.putImageData(sd, 0, 0);
      cx.drawImage(stC, 0, 0);
    }
    // the thumb notch at the mouth: cut a half circle out of the paper
    cx.save();
    cx.globalCompositeOperation = 'destination-out';
    const nr = (phone ? 15 : 20) * ppc;
    cx.beginPath(); cx.arc(w / 2, 0, nr, 0, Math.PI); cx.fill();
    // frayed mouth edge
    for (let i = 0; i < w; i += 2) {
      const n = vnoise(i / (ppc * 6), 0.5, seed + 50);
      cx.fillRect(i, 0, 2, Math.max(0, (n - 0.55) * 4 * ppc));
    }
    cx.restore();
    // shading inside the notch edge and a soft lip shadow at the mouth
    cx.save();
    cx.globalCompositeOperation = 'source-atop';
    const lip = cx.createLinearGradient(0, 0, 0, 6 * ppc);
    lip.addColorStop(0, 'rgba(255,248,230,.45)'); lip.addColorStop(1, 'rgba(255,248,230,0)');
    cx.fillStyle = lip; cx.fillRect(0, 0, w, 6 * ppc);
    cx.restore();
    return c;
  }
  function measureCss(ctx, t, sz, fam) { ctx.save(); ctx.font = `italic ${sz}px ${fam}`; const m = ctx.measureText(t).width; ctx.restore(); return m; }

  // The desk: older plates' sleeves stacked behind, and the shadows things cast.
  function renderDesk(p) {
    const { L, dpr, k } = p;
    const q = Math.min(dpr, 1.5);
    const c = makeCanvas(L.W * q, L.H * q), cx = c.getContext('2d');
    cx.scale(q, q);
    const S = L.sleeve;
    const HAND = '"La Belle Aurore", "Segoe Script", cursive';
    // stack behind (drawn back to front)
    const n = Math.min(L.stack.length, Math.max(0, k - 1));
    for (let i = n - 1; i >= 0; i--) {
      const st = L.stack[i];
      const sw = S.w * 0.995, shh = L.ph * 1.02;
      cx.save();
      cx.translate(L.cx + st.dx, L.cy + st.dy);
      cx.rotate(st.rot * Math.PI / 180);
      cx.shadowColor = 'rgba(70,50,25,.18)'; cx.shadowBlur = 10; cx.shadowOffsetY = 3;
      const tone = 208 - i * 6;
      cx.fillStyle = `rgb(${tone + 8},${tone - 10},${tone - 50})`;
      cx.fillRect(-sw / 2, -shh / 2, sw, shh);
      cx.shadowColor = 'transparent';
      // top edge wear
      cx.fillStyle = 'rgba(120,86,40,.18)'; cx.fillRect(-sw / 2, -shh / 2, sw, 5);
      cx.strokeStyle = 'rgba(90,64,30,.28)'; cx.lineWidth = 0.8; cx.strokeRect(-sw / 2 + 0.5, -shh / 2 + 0.5, sw - 1, shh - 1);
      // plate number on the visible edge
      cx.fillStyle = `rgba(${IRON_GALL[0]},${IRON_GALL[1]},${IRON_GALL[2]},.82)`;
      cx.font = `${L.portrait ? 10.5 : 12}px ${HAND}`;
      cx.textAlign = 'center';
      const lx = [0.36, -0.3, 0.12][i] * sw;
      cx.fillText(`DS ${k - 1 - i}`, lx, -shh / 2 + (L.portrait ? 10 : 12));
      cx.restore();
    }
    // the plate's shadow on the desk: soft, warm, slightly offset
    cx.save();
    cx.translate(L.cx + 3, L.cy + 6);
    cx.rotate(L.rot * Math.PI / 180);
    cx.shadowColor = 'rgba(66,46,22,.32)'; cx.shadowBlur = 22; cx.shadowOffsetY = 6;
    cx.fillStyle = 'rgba(120,96,64,.25)';
    cx.fillRect(-L.pw / 2, -L.ph / 2, L.pw, L.ph);
    cx.restore();
    return c;
  }

  root.SwarmPlate = { computeLayout, renderPlate, renderSleeve, renderDesk, makeView };
})(window);

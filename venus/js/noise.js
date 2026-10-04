// Deterministic noise shared by the terrain bake and object placement.
// `vnoise` and `fineDetail` mirror the GLSL versions in glsl.js exactly (same hash,
// same interpolation), so objects can sit on the shader's fine relief.

export function hashU(x, y) {
  let h = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
export const hash2 = (x, y) => hashU(x, y) / 4294967296;

// Value noise in [-1, 1] with quintic fade.
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}

// Gradient noise in roughly [-1, 1]; used only in the CPU bake.
const GX = new Float32Array(256), GY = new Float32Array(256);
for (let i = 0; i < 256; i++) { const a = i / 256 * Math.PI * 2; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
export function gnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (cx, cy, dx, dy) => { const k = hashU(cx, cy) & 255; return GX[k] * dx + GY[k] * dy; };
  const a = g(ix, iy, fx, fy), b = g(ix + 1, iy, fx - 1, fy);
  const c = g(ix, iy + 1, fx, fy - 1), d = g(ix + 1, iy + 1, fx - 1, fy - 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 1.4;
}

// Fine relief added on top of the baked heightmap near the viewer (render metres).
// Must match `fineDetail` in glsl.js.
export function fineDetail(x, z, octaves = 5) {
  let h = 0, amp = 9.0, f = 1 / 160;
  for (let i = 0; i < octaves; i++) {
    h += vnoise(x * f + i * 17.3, z * f - i * 9.1) * amp;
    amp *= 0.45; f *= 2.13;
  }
  return h;
}

export function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Mirrors glsl.js nearField(): the ledge, relative to the standpoint's ground height.
export function nearField(x, z) {
  const a = x * (-0.97815) + z * (0.20791), b = x * (-0.20791) + z * (-0.97815);
  const edge = 3.0 + 0.7 * vnoise(b / 4, 3.7) + 0.35 * vnoise(b / 1.5, 9.1) - 0.015 * b * b + 0.12 * Math.max(-b, 0);
  const beyond = a - edge;
  let h = 0.35 * vnoise(x / 9, z / 9) + 0.15 * vnoise(x / 3, z / 3) - 0.02 * Math.max(a, 0);
  h += 0.4 * smoothstep(2, -8, a);
  h += -14 * smoothstep(-0.8, 2.6, beyond);
  h += -9 * smoothstep(7, 13, beyond + 3 * vnoise(b / 9, 1.3));
  h += -0.65 * Math.max(beyond - 3, 0);
  return h;
}
export function slabs(x, z) {
  const n = vnoise(x / 6, z / 6) + 0.45 * vnoise(x / 2.2 + 4, z / 2.2 + 4);
  const k = n * 2.4, f = k - Math.floor(k);
  return (Math.floor(k) + smoothstep(0.35, 0.8, f)) * 0.07 + vnoise(x * 1.9, z * 1.9) * 0.02;
}

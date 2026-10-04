// Crisp screenprint at screen resolution: flat inks drawn as vectors, halftone screens drawn as
// real dots (one circle per cell of a rotated grid, sized by the tone), fine hatching, and a hint
// of misregistration. No noise grain: richness comes from the dots and the linework.
//
// Everything is drawn in world units on a context already scaled to device pixels; `k` is device
// pixels per unit, so dots and hairlines never fall below what a screen can show.
import { TAU, PI, clamp, rgb } from './math.js';
import { makeCanvas } from './tone.js';

export function inker(ctx, k) {
  const px = 1 / k;
  const I = {
    ctx, k, px,
    // a halftone cell never finer than ~3.4 device pixels, a line never thinner than ~0.7
    cell: c => Math.max(c, 3.4 * px),
    lw: w => Math.max(w, .7 * px),
  };
  // Clip to a shape for the duration of fn.
  I.within = (shape, fn) => { ctx.save(); ctx.beginPath(); shape(ctx); ctx.clip(); fn(); ctx.restore(); };
  // A halftone screen: tone(x, y) → coverage 0..1, sampled at each cell centre.
  // o: { cell, angle, color, min, max, gain, shape, box }
  I.halftone = (box, tone, o) => {
    const cell = I.cell(o.cell), ang = o.angle ?? .26, ca = Math.cos(ang), sa = Math.sin(ang);
    const [x0, y0, x1, y1] = box, gain = o.gain ?? 1, mn = o.min ?? .012, mx = o.max ?? 1, shape = (o.shape ?? 1) / Math.sqrt(PI);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const u = (x * ca + y * sa) / cell, v = (-x * sa + y * ca) / cell;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const rmin = .32 * px;
    ctx.fillStyle = o.color; ctx.beginPath(); let n = 0;
    for (let v = Math.floor(v0); v <= Math.ceil(v1); v++) {
      for (let u = Math.floor(u0); u <= Math.ceil(u1); u++) {
        const cx = (u * ca - v * sa) * cell, cy = (u * sa + v * ca) * cell;
        if (cx < x0 - cell || cx > x1 + cell || cy < y0 - cell || cy > y1 + cell) continue;
        let t = tone(cx, cy) * gain;
        if (!(t > mn)) continue;
        if (t > mx) t = mx;
        const r = cell * shape * Math.sqrt(t);
        if (r < rmin) continue;
        ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU);
        if (++n > 2500) { ctx.fill(); ctx.beginPath(); n = 0; }
      }
    }
    ctx.fill();
  };
  // Parallel lines across a box (clip first with within). o: { gap, angle, width, color, alpha, wobble }
  I.hatch = (box, o) => {
    const ang = o.angle ?? 0, ca = Math.cos(ang), sa = Math.sin(ang), gap = Math.max(o.gap, 2.2 * px);
    const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
    ctx.strokeStyle = o.color; ctx.lineWidth = I.lw(o.width ?? .6); ctx.globalAlpha = o.alpha ?? 1;
    ctx.beginPath();
    for (let d = -R; d <= R; d += gap) {
      const bx = cx - sa * d, by = cy + ca * d;
      ctx.moveTo(bx - ca * R, by - sa * R); ctx.lineTo(bx + ca * R, by + sa * R);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  // Dots at listed points [x, y, r].
  I.dots = (list, color, a = 1) => {
    ctx.fillStyle = color; ctx.globalAlpha = a; ctx.beginPath();
    for (const [x, y, r] of list) { const rr = Math.max(r, .45 * px); ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
    ctx.fill(); ctx.globalAlpha = 1;
  };
  // Flat ink computed per device pixel: fn(x, y) → coverage 0..1 at the pixel's centre in world
  // units. For shapes only a function can describe (coastlines from a map). Honours the clip.
  I.raster = (box, fn, color) => {
    const t = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height;
    const x0 = Math.max(0, Math.floor(t.a * box[0] + t.e)), y0 = Math.max(0, Math.floor(t.d * box[1] + t.f));
    const x1 = Math.min(cw, Math.ceil(t.a * box[2] + t.e)), y1 = Math.min(ch, Math.ceil(t.d * box[3] + t.f));
    const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
    const img = new ImageData(w, h), d = img.data, [r, g, b] = rgb(color);
    for (let py = 0; py < h; py++) {
      const wy = (y0 + py + .5 - t.f) / t.d;
      for (let px = 0; px < w; px++) {
        const a = fn((x0 + px + .5 - t.e) / t.a, wy);
        if (a > 0) { const i = (py * w + px) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a >= 1 ? 255 : a * 255; }
      }
    }
    const tmp = makeCanvas(w, h); tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tmp, x0, y0); ctx.restore();
  };
  I.disc = (c, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU); ctx.fill(); };
  I.ring = (c, r, color, w, a = 1) => { ctx.strokeStyle = color; ctx.lineWidth = I.lw(w); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; };
  return I;
}

// An ellipse (centre c, semi-axes rx, ry, rotated by rot) as a point function of angle.
export function ellipse(c, rx, ry, rot = 0) {
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const pt = a => { const x = rx * Math.cos(a), y = ry * Math.sin(a); return [c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]; };
  const tan = a => { const dx = -rx * Math.sin(a), dy = ry * Math.cos(a); return Math.atan2(dx * sr + dy * cr, dx * cr - dy * sr); };
  return { c, rx, ry, rot, pt, tan };
}

// Stroke an ellipse with depth: the near half (sin a > 0) heavier and brighter than the far half,
// changing smoothly, in short segments. Only segments inside `view` [x0, y0, x1, y1] are drawn.
// part: 'all' | 'front' | 'back'.
// Segments are grouped into a few weight levels so each level is one stroke.
const LEVELS = 8;
export function strokeDepth(ctx, el, o, view = null, part = 'all') {
  const n = o.n ?? Math.max(48, Math.min(900, Math.round((el.rx + el.ry) / 5)));
  const [wf, wb] = o.w, [af, ab] = o.a;
  const runs = Array.from({ length: LEVELS }, () => []);
  // the ellipse's points are fixed, so keep them on it
  const cache = el._pts && el._pts.n === n ? el._pts : (el._pts = { n, p: Array.from({ length: n + 1 }, (_, i) => el.pt(i / n * TAU)) });
  let prev = cache.p[0], lastLevel = -1, run = null;
  for (let i = 1; i <= n; i++) {
    const a = i / n * TAU, p = cache.p[i], s = Math.sin(a - TAU / n / 2);
    const skip = (part === 'front' && s <= 0) || (part === 'back' && s > 0) ||
      (view && (Math.max(p[0], prev[0]) < view[0] || Math.min(p[0], prev[0]) > view[2] || Math.max(p[1], prev[1]) < view[1] || Math.min(p[1], prev[1]) > view[3]));
    if (skip) { prev = p; lastLevel = -1; continue; }
    const d = clamp((s + 1) / 2), lv = Math.min(LEVELS - 1, Math.round(d * d * (3 - 2 * d) * (LEVELS - 1)));
    if (lv !== lastLevel) { run = [prev]; runs[lv].push(run); lastLevel = lv; }
    run.push(p);
    prev = p;
  }
  ctx.strokeStyle = o.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let lv = 0; lv < LEVELS; lv++) {
    if (!runs[lv].length) continue;
    const dd = lv / (LEVELS - 1);
    ctx.globalAlpha = ab + (af - ab) * dd; ctx.lineWidth = wb + (wf - wb) * dd;
    ctx.beginPath();
    for (const r of runs[lv]) { ctx.moveTo(r[0][0], r[0][1]); for (let j = 1; j < r.length; j++) ctx.lineTo(r[j][0], r[j][1]); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// A four-point glint.
export function spark(ctx, x, y, L, g, core = '#f6c444', ray = '#fff6df') {
  if (g <= .01) return;
  ctx.save(); ctx.globalAlpha = clamp(g); ctx.fillStyle = ray;
  const w = Math.max(L * .085, .35);
  ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x, y - w); ctx.lineTo(x + L, y); ctx.lineTo(x, y + w); ctx.closePath();
  ctx.moveTo(x, y - L); ctx.lineTo(x + w, y); ctx.lineTo(x, y + L); ctx.lineTo(x - w, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, w * 1.4, 0, TAU); ctx.fill();
  ctx.restore();
}

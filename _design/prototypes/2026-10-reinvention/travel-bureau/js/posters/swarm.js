/* No. 02 · The Swarm. After swarm/simulation.js: a golden Sun inside a growing shell of
   collectors, and Mercury, already partly taken apart, feeding it. The Sun's glare fills the
   sky, so near it the collectors read as dark specks and farther out as bright points.
   Living thing: packets of Mercury leave the quarry, climb the long arc, and flare as they
   join the swarm. */
(function () {
'use strict';
const { clamp, lerp, smooth, fbm, vnoise, rng, TAU, mixc } = Paint;
const { ART, INK } = Kit;

const SC = [590, 400], RS = 98;                 // the Sun, in poster units
const MC = [205, 1105], RM = 330;               // Mercury, low and close
const TILT = 1.02, YAW = 0.35;                   // how we look at the swarm's shell
const LIGHT = [SC[0] - MC[0], SC[1] - MC[1], 0]; { const l = Math.hypot(LIGHT[0], LIGHT[1]); LIGHT[0] = LIGHT[0] / l * 0.88; LIGHT[1] = LIGHT[1] / l * 0.88; LIGHT[2] = -0.47; }

// glare brightness of the sky at a point (0 dark rim .. 1 white)
function glare(u, v) { const d = Math.hypot(u - SC[0], v - SC[1]); return clamp(Math.exp(-((d / 330) ** 1.6))); }

// a point on the swarm's shell (sun radii) to screen + depth
function shell(x, y, z) {
  const c = Math.cos(YAW), s = Math.sin(YAW);
  let X = x * c - z * s, Z = x * s + z * c, Y = y;
  const ct = Math.cos(TILT), st = Math.sin(TILT);
  const Y2 = Y * ct - Z * st, Z2 = Y * st + Z * ct;
  return [SC[0] + X * RS, SC[1] + Y2 * RS, Z2];
}

// Mercury's stream: from the quarry, a long climbing arc that bends into orbit
const STREAM = [[408, 846], [438, 700], [400, 560], [360, 470], [372, 360], [450, 290]];
function bez(t) { // Catmull-Rom through STREAM
  const n = STREAM.length - 1, f = clamp(t) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = STREAM[Math.max(0, i - 1)], p1 = STREAM[i], p2 = STREAM[i + 1], p3 = STREAM[Math.min(n, i + 2)];
  const q = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])];
}

function build(b) {
  const W = Kit.windowMask(b);
  const bx = [ART.x0, ART.y0, ART.x1, ART.y1];

  // ---- the sky: a plum ground, then the glare built up coat by coat toward the Sun ----
  b.spray('#3f2537', W, { grain: 0.08 });
  b.spray('#6a3448', b.mulF(W, (u, v) => clamp(1 - (v - ART.y0) / ART.h * 0.6) * 0.5), { grain: 0.1 });
  const coat = (col, r, p, op, gr = 0.1) => b.spray(col, b.mulF(W, (u, v) => op * Math.exp(-((Math.hypot(u - SC[0], (v - SC[1]) * 1.04) / r) ** p))), { grain: gr, soft: 0.5 });
  coat('#9a4450', 700, 1.5, 0.95);
  coat('#cf6d4c', 500, 1.6, 0.95);
  coat('#eb9a5e', 350, 1.7, 0.95);
  coat('#f6c27c', 230, 1.8, 0.9);
  coat('#fbe0a8', 150, 2, 0.85);
  // a faint ecliptic haze: the swarm's dust band, sprayed with a loose shield
  b.spray('#ffe2a8', b.mulF(W, (u, v) => {
    const dx = u - SC[0], dy = v - SC[1], a = -0.2;
    const along = dx * Math.cos(a) + dy * Math.sin(a), across = -dx * Math.sin(a) + dy * Math.cos(a);
    return 0.3 * Math.exp(-((across / 40) ** 2)) * Math.exp(-((along / 520) ** 2));
  }), { grain: 0.25 });

  // toothbrush stars, only out in the dark corners
  b.spatter('#fff4dc', bx, 420, 0.9, 2.8, { accept: (u, v) => (1 - glare(u, v)) ** 3, aMin: 0.55, aMax: 1, pow: 3.5 });

  // ---- the Sun: frisket disc, limb-darkened spray, mottled surface, overspray corona ----
  const SUN = b.field((u, v) => clamp(RS - Math.hypot(u - SC[0], v - SC[1]) + 0.5), [SC[0] - RS - 4, SC[1] - RS - 4, SC[0] + RS + 4, SC[1] + RS + 4]);
  b.spray('#fff9e8', SUN, { grain: 0.05 });
  b.spray('#f6c25c', b.mulF(SUN, (u, v) => smooth(0.55, 1.02, Math.hypot(u - SC[0], v - SC[1]) / RS) * 0.95), { grain: 0.3 });
  b.spray('#e58a3e', b.mulF(SUN, (u, v) => smooth(0.86, 1.02, Math.hypot(u - SC[0], v - SC[1]) / RS) * 0.7), { grain: 0.35 });
  b.spray('#f6bd5a', b.mulF(SUN, (u, v) => smooth(0.5, 0.75, fbm(u / 14, v / 14, 31, 3)) * 0.22), { grain: 0.15, soft: 0.5 });
  b.gouache('#fff3cf', b.ridge(SUN, 0.8), { op: 0.6 });
  b.spray('#fff3d2', b.field((u, v) => 0.45 * Math.exp(-(((Math.hypot(u - SC[0], v - SC[1]) - RS) / 26) ** 2)), [SC[0] - RS - 90, SC[1] - RS - 90, SC[0] + RS + 90, SC[1] + RS + 90]), { grain: 0.35 });

  // ---- orbit paths: fine brushed hairlines, dark against the glare, pale in the dark ----
  const orbits = [];
  const orbitDefs = [[1.75, 0.1, 0.3], [2.3, -0.22, 1.4], [2.95, 0.3, 2.6], [3.7, -0.12, 3.9], [4.6, 0.2, 5.1]];
  for (const [r, inc, node] of orbitDefs) {
    const pts = [];
    for (let i = 0; i <= 260; i++) {
      const a = (i / 260) * TAU; let x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0;
      const ci = Math.cos(inc), si = Math.sin(inc); [y, z] = [y * ci - z * si, y * si + z * ci];
      const cn = Math.cos(node), sn = Math.sin(node); [x, z] = [x * cn - z * sn, x * sn + z * cn];
      const p = shell(x, y, z);
      // hidden behind the Sun's disc
      const behind = p[2] > 0 && Math.hypot(p[0] - SC[0], p[1] - SC[1]) < RS + 3;
      pts.push([p[0], p[1], behind ? 0 : 1.25]);
    }
    orbits.push(pts);
  }
  const ORB = b.mul(b.strokeMask(orbits), W);
  b.gouache('#6b3442', b.mulF(ORB, (u, v) => smooth(0.3, 0.75, glare(u, v)) * 0.4), {});
  b.gouache('#ffe9c2', b.mulF(ORB, (u, v) => (1 - smooth(0.2, 0.6, glare(u, v))) * 0.42), {});

  // ---- collectors: thousands of small gouache dots on the shell ----
  const r = rng(2024), cols = [];
  for (let i = 0; i < 2200; i++) {
    const orbit = orbitDefs[(r() * orbitDefs.length) | 0];
    let rad, x, y, z;
    if (r() < 0.75) { // on or near an orbit
      const [ro, inc, node] = orbit, a = r() * TAU; rad = ro * (1 + (r() - 0.5) * 0.08);
      x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = (r() - 0.5) * 0.12;
      const ci = Math.cos(inc), si = Math.sin(inc); [y, z] = [y * ci - z * si, y * si + z * ci];
      const cn = Math.cos(node), sn = Math.sin(node); [x, z] = [x * cn - z * sn, x * sn + z * cn];
    } else { // the general shell
      rad = lerp(1.6, 5.2, Math.pow(r(), 0.8)); const u = (r() * 2 - 1) * 0.35, th = r() * TAU, q = Math.sqrt(1 - u * u);
      x = q * Math.cos(th) * rad; y = u * rad; z = q * Math.sin(th) * rad;
    }
    const p = shell(x, y, z);
    if (p[2] > 0 && Math.hypot(p[0] - SC[0], p[1] - SC[1]) < RS + 2) continue;
    if (p[0] < ART.x0 || p[0] > ART.x1 || p[1] < ART.y0 || p[1] > ART.y1) continue;
    cols.push([p[0], p[1], lerp(1.8, 3.6, r() ** 2) * (1 - p[2] * 0.05), r()]);
  }
  const k = b.k;
  for (const c of cols) {
    const L = glare(c[0], c[1]);
    const onSun = Math.hypot(c[0] - SC[0], c[1] - SC[1]) < RS;
    if (onSun && c[3] > 0.12) continue;
    const col = onSun ? '#9a5a32' : mixc('#fff2d2', '#55283a', smooth(0.25, 0.7, L));
    b.dotPx(c[0] * k, c[1] * k, c[2] * k * 0.55, col, onSun ? 0.7 : 0.92);
  }
  // a few collectors catch the Sun and flash
  const gl = rng(77);
  for (let i = 0; i < 26; i++) {
    const c = cols[(gl() * cols.length) | 0]; if (!c || glare(c[0], c[1]) > 0.5) continue;
    b.glint(c[0], c[1], lerp(5, 13, gl() ** 2), '#fff6df', { bloom: 0.4, rays: 4, rot: 0.785 + (gl() - 0.5) * 0.3, width: 0.06 });
  }

  // ---- the stream's trail: a faint sprayed path ----
  const trail = []; for (let i = 0; i <= 120; i++) { const p = bez(i / 120); trail.push([p[0], p[1], lerp(16, 5, i / 120)]); }
  const TR = b.mul(b.blur(b.strokeMask([trail]), 5), W);
  b.spray('#ffd9a0', b.scale(TR, 0.42), { grain: 0.45, soft: 0.3 });

  mercury(b, W);

  Kit.band(b, {
    no: '02', open: true, title: 'The Swarm',
    titleStyle: { top: '#efae45', bottom: '#b4412b', band: '#ffd88c', shadow: INK.plum },
    line: 'TAKE MERCURY APART · BUILD A SWARM AROUND THE SUN',
  });
  return { packet: packetSprite(b) };
}

function mercury(b, W) {
  const inside = (u, v) => Math.hypot(u - MC[0], v - MC[1]) < RM;
  // the quarry: a stepped bite out of the limb facing the Sun
  const bite = [[300, 760], [338, 790], [352, 818], [392, 832], [404, 862], [446, 880], [470, 960], [560, 900], [520, 760], [430, 700], [340, 720]];
  const DISC = b.field((u, v) => clamp(RM - Math.hypot(u - MC[0], v - MC[1]) + 0.5), [MC[0] - RM - 2, MC[1] - RM - 2, MC[0] + RM + 2, MC[1] + RM + 2]);
  const BITE = b.raster(b.path(bite));
  const M = b.mul(b.sub(DISC, BITE), W);
  const lit = (u, v) => { // lambert on a sphere lit from the Sun's direction
    const x = (u - MC[0]) / RM, y = (v - MC[1]) / RM, zz = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    return clamp(x * LIGHT[0] + y * LIGHT[1] + zz * LIGHT[2] + 0.12);
  };
  b.spray('#2c1a24', M, { grain: 0.06 });
  b.spray('#5e3438', b.mulF(M, (u, v) => smooth(0.0, 0.35, lit(u, v)) * 0.9), { grain: 0.15 });
  b.spray('#b06e4f', b.mulF(M, (u, v) => smooth(0.22, 0.6, lit(u, v))), { grain: 0.15 });
  b.spray('#eab07a', b.mulF(M, (u, v) => smooth(0.5, 0.85, lit(u, v)) * 0.95), { grain: 0.15 });
  b.spray('#fff0cf', b.mulF(M, (u, v) => smooth(0.78, 1.02, lit(u, v)) * 0.8), { grain: 0.15 });
  // reflected warm light from the glare on the dark side
  b.spray('#7a3f45', b.mulF(M, (u, v) => { const x = (u - MC[0]) / RM, y = (v - MC[1]) / RM; return smooth(0.75, 1, Math.hypot(x, y)) * smooth(0.25, 0, lit(u, v)) * 0.6; }), { grain: 0.3 });
  // regolith mottling
  b.spray('#3a2526', b.mulF(M, (u, v) => smooth(0.55, 0.8, fbm(u / 26, v / 26, 51, 4)) * 0.4 * smooth(0.2, 0.7, lit(u, v))), { grain: 0.4, mode: 'glaze', op: 0.5 });
  // craters: frisket ellipses, foreshortened toward the limb; dark on the Sun side, lit rim opposite
  const r = rng(88);
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.93, cr = lerp(6, 34, r() ** 2.2);
    const x = MC[0] + Math.cos(a) * d * RM, y = MC[1] + Math.sin(a) * d * RM;
    if (!inside(x, y) || y > ART.y1 + 20) continue;
    const nx = (x - MC[0]) / RM, ny = (y - MC[1]) / RM, rr = Math.hypot(nx, ny), squash = Math.sqrt(Math.max(0.05, 1 - rr * rr));
    const ang = Math.atan2(ny, nx);
    const box = [x - cr - 3, y - cr - 3, x + cr + 3, y + cr + 3];
    const C = b.mul(b.raster((c) => { c.beginPath(); c.ellipse(x, y, cr * squash, cr, ang, 0, TAU); c.fill(); }, box), M);
    const L = lit(x, y);
    b.spray('#2a1b1f', b.mulF(C, (u, v) => clamp(0.5 + ((u - x) * LIGHT[0] + (v - y) * LIGHT[1]) / cr * 0.9) * (0.35 + 0.4 * L)), { grain: 0.4 });
    const rim = b.mul(b.ridge(C, 0.9), b.field((u, v) => clamp(0.5 - ((u - x) * LIGHT[0] + (v - y) * LIGHT[1]) / cr), box));
    b.gouache('#ffe6bd', rim, { op: 0.75 * smooth(0.15, 0.7, L), dry: 0.3 });
  }
  // the quarry faces: cut terraces, lit warm, with working lights
  const FACE = b.mul(b.sub(b.field((u, v) => clamp(RM + 6 - Math.hypot(u - MC[0], v - MC[1])), [MC[0] - RM - 8, MC[1] - RM - 8, MC[0] + RM + 8, MC[1] + RM + 8]), b.sub(DISC, BITE)), b.mul(BITE, W));
  const terraces = b.strokeMask([
    [[296, 762, 5], [338, 792, 5], [352, 820, 5], [392, 834, 5], [404, 864, 5], [446, 882, 5], [470, 962, 5]],
  ]);
  b.spray('#8c4b33', b.mul(terraces, W), { grain: 0.3 });
  b.gouache('#ffcf8a', b.mul(b.shift(b.strokeMask([[[296, 760, 1.6], [338, 790, 1.6], [352, 818, 1.6], [392, 832, 1.6], [404, 862, 1.6], [446, 880, 1.6], [470, 958, 1.6]]]), 0, -1.5), W), { op: 0.85 });
  for (const [x, y] of [[340, 790], [392, 832], [446, 880], [470, 940]]) b.glint(x, y, 6, '#fff0cc', { bloom: 0.6, rays: 4, rot: 0.785, width: 0.06 });
  // the mass driver: a straight rail across the surface to the launch point
  const rail = b.mul(b.strokeMask([[[250, 930, 1.8], [404, 846, 1.6]]]), M);
  b.gouache('#2b1b1e', b.shift(rail, 0.8, 1.2), { op: 0.45 });
  b.gouache('#ffd79a', rail, { op: 0.7 });
  // rim light along the limb facing the Sun
  b.gouache('#fff0cf', b.mulF(b.ridge(M, 1.6), (u, v) => smooth(0.5, 0.95, lit(u, v))), { op: 0.8 });
  b.glint(404, 846, 11, '#fff8e6', { bloom: 0.8, rays: 4, rot: 0.3, width: 0.06 });
}

function packetSprite(b) {
  const size = Math.max(24, Math.round(34 * b.k * 2)) | 0;
  const g = new Paint.Board(size, size, { transparent: true, unit: 100, seed: 3, grainScale: b.gs });
  // a faint dark halo so the packet reads against the glare, then a warm bloom and a hard core
  g.spray('#4a2235', g.field((u, v) => 0.32 * Math.exp(-(((Math.hypot(u - 50, v - 50) - 15) / 7) ** 2))), { grain: 0.2 });
  g.spray('#ffd79a', g.field((u, v) => 0.9 * Math.exp(-((u - 50) ** 2 + (v - 50) ** 2) / 150)), { grain: 0.25 });
  g.glint(50, 50, 30, '#fffbf0', { bloom: 0, rays: 4, rot: 0.785, width: 0.07, core: 0.22 });
  return g.toCanvas();
}

const PERIOD = 1.6, LIFE = 15;
function frame(ctx, t, k, L) {
  ctx.save();
  ctx.beginPath(); ctx.rect(ART.x0 * k, ART.y0 * k, ART.w * k, ART.h * k); ctx.clip();
  const n0 = Math.floor((t - LIFE) / PERIOD), n1 = Math.floor(t / PERIOD);
  for (let n = n0; n <= n1; n++) {
    const age = t - n * PERIOD; if (age < 0 || age > LIFE) continue;
    const u = age / LIFE;
    // fast off the rail, slowing as it climbs, then easing into orbit
    const s = 1 - Math.pow(1 - u, 1.8);
    const p = Paint.clamp(s, 0, 1), q = bez(p);
    const jitter = Paint.hash(n, 3, 1) - 0.5;
    const x = q[0] + jitter * 10 * p, y = q[1] + jitter * 6 * p;
    let a = Paint.smooth(0, 0.04, u) * (1 - Paint.smooth(0.9, 1, u));
    const sz = (u > 0.86 ? 40 + 60 * Paint.smooth(0.86, 0.95, u) * (1 - Paint.smooth(0.95, 1, u)) : 44 - 18 * p) * k;
    ctx.globalAlpha = a;
    ctx.drawImage(L.packet, x * k - sz / 2, y * k - sz / 2, sz, sz);
  }
  ctx.restore();
}

Bureau.define({ id: 'swarm', seed: 202, still: 9.3, fps: 24, build, frame });
})();

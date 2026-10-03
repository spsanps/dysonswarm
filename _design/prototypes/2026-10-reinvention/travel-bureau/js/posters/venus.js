/* No. 04 · Over Venus (not open yet). A domed city floating about 50 km up, where the air
   pressure is close to Earth's at sea level and breathable air is itself a lifting gas in
   Venus's carbon dioxide. Living thing: the cloud deck streams past underneath (the winds
   up here carry the cloud tops round the planet in about four days), in three layers at
   three speeds, and the city rides gently on the air. Clouds are airbrushed the classic way:
   spray along the edge of a cut scalloped template so each billow has a hard lit top that
   melts into shadow; each layer is a seamless strip, painted once, slid each frame. */
(function () {
'use strict';
const { clamp, lerp, smooth, fbm, vnoise, rng, TAU, hex, mixc } = Paint;
const { ART, INK } = Kit;

const SUNP = [742, 236];
const CITY = { x: 556, y: 712 };                       // centre of the city's deck, poster units
const LAYERS = [ // top edge, depth of strip, period, speed (units/s), bump size, palette
  { top: 752, h: 450, P: 700, v: 3.2, s: 40, lit: '#fff3d8', mid: '#f1d29c', deep: '#d9a674', seed: 11 },
  { top: 845, h: 360, P: 820, v: 7.5, s: 66, lit: '#fff1d2', mid: '#eabd80', deep: '#c38654', seed: 23 },
  { top: 975, h: 240, P: 960, v: 15, s: 100, lit: '#ffefcf', mid: '#e1a565', deep: '#a5603a', seed: 37 },
];

// a periodic row of billows: [centre x, radius] covering [0, P), with smaller ones riding on top
function billows(P, size, seed) {
  const r = rng(seed), out = [];
  let x = 0;
  while (x < P) { const rad = size * lerp(0.5, 1.6, r() ** 1.3); out.push([x + rad * 0.6, rad, r()]); x += rad * lerp(0.7, 1.25, r()); }
  const sc = P / x; for (const bl of out) { bl[0] *= sc; bl[1] *= sc; }
  const small = [];
  for (const [cx, rad] of out) { const n = 1 + ((r() * 3) | 0); for (let j = 0; j < n; j++) small.push([cx + (r() - 0.5) * rad * 1.2, rad * lerp(0.28, 0.55, r()), r(), rad]); }
  return { big: out, small };
}
const FLAT_BIG = 0.5, FLAT_SMALL = 0.62;

// one cloud layer as a transparent strip: (artW + P) wide, tiles every P
function paintLayer(b, Lr) {
  const k = b.k, Wu = ART.w + Lr.P + 4, Hu = Lr.h;
  const g = new Paint.Board(Math.round(Wu * k), Math.round(Hu * k), { transparent: true, unit: Wu, seed: Lr.seed, grainScale: b.gs, tooth: null });
  const { big, small } = billows(Lr.P, Lr.s, Lr.seed);
  const ph = Lr.seed * 0.7;
  const baseAt = (x) => Lr.s * 1.3 + Lr.s * 0.35 * Math.sin((x / Lr.P) * TAU + ph) + Lr.s * 0.15 * Math.sin((x / Lr.P) * TAU * 3 + ph * 2);
  // all billows as ellipses: [cx, cy, rx, ry]
  const ells = [];
  for (let rep = -1; rep <= 2; rep++) {
    const off = rep * Lr.P;
    for (const [cx, rad] of big) { const x = cx + off; ells.push([x, baseAt(cx), rad, rad * FLAT_BIG, 0]); }
    for (const [cx, rad, , R0] of small) { const x = cx + off; ells.push([x, baseAt(cx) - R0 * FLAT_BIG * 0.7, rad, rad * FLAT_SMALL, 1]); }
  }
  const tops = new Float32Array(g.w);
  for (let x = 0; x < g.w; x++) {
    const u = (x + 0.5) / k; let y = baseAt(u) + 4;
    for (const [cx, cy, rx, ry] of ells) { const dx = u - cx; if (Math.abs(dx) < rx) y = Math.min(y, cy - Math.sqrt(1 - (dx / rx) ** 2) * ry); }
    tops[x] = y;
  }
  const topU = (u) => tops[Math.max(0, Math.min(g.w - 1, Math.floor(u * k)))];
  const M = g.field((u, v) => clamp((v - topU(u)) * k + 0.5));
  // light per billow: the side facing the (upper right) Sun
  const sun = [0.55, -0.83];
  const LIT = g.zero();
  for (const [cx, cy, rx, ry] of ells) {
    const x0 = Math.max(0, Math.floor((cx - rx * 1.03) * k)), x1 = Math.min(g.w, Math.ceil((cx + rx * 1.03) * k));
    const y0 = Math.max(0, Math.floor((cy - ry * 1.03) * k)), y1 = Math.min(g.h, Math.ceil((cy + ry * 1.03) * k));
    for (let y = y0; y < y1; y++) {
      const dy = ((y + 0.5) / k - cy) / ry;
      for (let x = x0; x < x1; x++) {
        const dx = ((x + 0.5) / k - cx) / rx, d = Math.hypot(dx, dy);
        if (d > 1.02) continue;
        const lit = (dx * sun[0] + dy * sun[1]) / (d + 1e-3), val = smooth(-0.2, 0.95, lit) * smooth(0.2, 1, d), i = y * g.w + x;
        if (val > LIT[i]) LIT[i] = val;
      }
    }
  }
  const depth = (u, v) => v - topU(u);
  g.spray(Lr.mid, M, { grain: 0.06 });
  g.spray(Lr.deep, g.mulF(M, (u, v) => smooth(0, Lr.s * 1.9, depth(u, v)) * 0.8), { grain: 0.15 });
  g.spray(Lr.deep, g.mul(M, g.field((u, v) => (1 - LIT[Math.min(g.N - 1, Math.floor(v * k) * g.w + Math.floor(u * k))]) * smooth(2, 26, depth(u, v)) * 0.4)), { grain: 0.2, mode: 'glaze', op: 0.55 });
  g.spray(Lr.lit, g.mul(M, LIT), { grain: 0.15 });
  // the hard lit edge where the template sat, brightest where it faces the Sun
  g.spray('#fffaf0', g.mulF(M, (u, v) => Math.exp(-depth(u, v) / 4) * (0.15 + 0.75 * LIT[Math.min(g.N - 1, Math.floor(v * k) * g.w + Math.floor(u * k))])), { grain: 0.12 });
  return { cv: g.toCanvas(), P: Lr.P, top: Lr.top, v: Lr.v, Wu };
}

function paintCity(b) {
  const k = b.k, Wu = 420, Hu = 300, ox = Wu / 2, oy = 220; // local origin = deck centre
  const g = new Paint.Board(Math.round(Wu * k), Math.round(Hu * k), { transparent: true, unit: Wu, seed: 404, grainScale: b.gs });
  const R = 168;
  // the buoyant hull under the deck: a broad rounded lens
  const hull = g.raster((c) => { c.beginPath(); c.ellipse(ox, oy + 6, R * 1.1, 34, 0, 0, Math.PI); c.lineTo(ox - R * 1.1, oy + 6); c.closePath(); c.fill(); });
  g.spray('#5b3a3a', hull, { grain: 0.05 });
  g.spray('#b0785a', g.mulF(hull, (u, v) => smooth(ox - R, ox + R * 0.9, u) * smooth(oy + 50, oy, v)), { grain: 0.2 });
  g.spray('#f2c897', g.mulF(hull, (u, v) => smooth(ox + R * 0.2, ox + R * 1.05, u) * smooth(oy + 30, oy + 4, v) * 0.8), { grain: 0.2 });
  // a keel and window lights along the hull
  const lights = g.raster((c) => { for (let i = -7; i <= 7; i++) { const x = ox + i * 20, y = oy + 17 - Math.abs(i) * 0.5; c.beginPath(); c.arc(x, y, 1.7, 0, TAU); c.fill(); } });
  g.gouache('#ffe6b4', lights, { op: 0.95 });
  // the deck rim
  const deck = g.raster((c) => { c.beginPath(); c.ellipse(ox, oy, R * 1.14, 13, 0, 0, TAU); c.fill(); });
  g.spray('#e9d6b8', deck, { grain: 0.05 });
  g.spray('#8a5c4c', g.mulF(deck, (u, v) => smooth(oy - 6, oy + 12, v) * 0.8), { grain: 0.2 });
  // inside the dome: parkland, a little lake, white towers
  const ground = g.raster((c) => { c.beginPath(); c.ellipse(ox, oy - 2, R * 0.98, 10, 0, 0, TAU); c.fill(); });
  g.spray('#7f9a55', ground, { grain: 0.1 });
  const towers = [[-104, 26, 18], [-80, 44, 14], [-58, 64, 20], [-34, 40, 16], [-14, 92, 18], [8, 58, 24], [32, 78, 14], [52, 46, 20], [76, 60, 16], [100, 30, 18]];
  const T = g.raster((c) => { for (const [dx, hh, ww] of towers) c.fillRect(ox + dx - ww / 2, oy - 4 - hh, ww, hh); });
  g.spray('#efe2c6', T, { grain: 0.05 });
  for (const [dx, hh, ww] of towers) {
    const side = g.raster((c) => { c.fillRect(ox + dx - ww / 2, oy - 4 - hh, ww * 0.38, hh); }, [ox + dx - ww, oy - 6 - hh, ox + dx, oy]);
    g.spray('#b48d74', side, { grain: 0.15, op: 0.7 });
    const cap = g.raster((c) => { c.fillRect(ox + dx - ww / 2, oy - 4 - hh, ww, 2.2); }, [ox + dx - ww, oy - 8 - hh, ox + dx + ww, oy - hh]);
    g.gouache('#fff7e6', cap, { op: 0.9 });
    const win = g.raster((c) => { for (let yy = oy - hh + 4; yy < oy - 10; yy += 7) c.fillRect(ox + dx - ww / 2 + ww * 0.45, yy, ww * 0.45, 1.6); }, [ox + dx - ww, oy - 6 - hh, ox + dx + ww, oy]);
    g.gouache('#c9a98a', win, { op: 0.6 });
  }
  const trees = g.raster((c) => { const r = rng(9); for (let i = 0; i < 34; i++) { const x = ox + (r() - 0.5) * R * 1.85, y = oy - 3 - r() * 5; c.beginPath(); c.ellipse(x, y - 6, 7 + r() * 7, 6 + r() * 5, 0, 0, TAU); c.fill(); } });
  g.spray('#5e7f45', trees, { grain: 0.15 });
  g.spray('#a3b86a', g.mulF(trees, (u, v) => smooth(ox - R, ox + R, u) * 0.6), { grain: 0.3 });
  // the dome: glass sprayed thin, a hard reflection band, geodesic ribs brushed in
  const DOME = g.field((u, v) => { const dx = (u - ox) / R, dy = (v - oy) / R; return v < oy ? clamp((1 - Math.hypot(dx, dy)) * R * k + 0.5) : 0; });
  g.spray('#fff2d6', g.mulF(DOME, (u, v) => { const dx = (u - ox) / R, dy = (v - oy) / R; return 0.18 + 0.4 * smooth(0.6, 1, Math.hypot(dx, dy)); }), { grain: 0.2 });
  g.spray('#ffffff', g.mulF(DOME, (u, v) => { const dx = (u - ox) / R, dy = (v - oy) / R; const a = Math.atan2(-dy, dx); return smooth(0.62, 0.8, Math.hypot(dx, dy)) * smooth(0.9, 1.3, a) * smooth(1.9, 1.5, a) * 0.85; }), { grain: 0.15 });
  const ribs = [];
  for (let i = 1; i < 6; i++) { const a = (i / 6) * Math.PI, pts = []; for (let j = 0; j <= 30; j++) { const t = (j / 30) * Math.PI / 2; pts.push([ox + Math.cos(a) * Math.cos(t) * R * 0.999, oy - Math.sin(t) * R, 0.9]); } ribs.push(pts); }
  for (const f of [0.35, 0.68, 0.9]) { const pts = []; const yy = oy - Math.sin(f * Math.PI / 2) * R, rr = Math.cos(f * Math.PI / 2) * R; for (let j = 0; j <= 40; j++) { const a = (j / 40) * Math.PI; pts.push([ox - Math.cos(a) * rr, yy + Math.sin(a) * rr * 0.06, 0.8]); } ribs.push(pts); }
  g.gouache('#fff8ea', g.mul(g.strokeMask(ribs), DOME), { op: 0.6 });
  g.gouache('#fffaf0', g.ridge(DOME, 1.1), { op: 0.85 });
  g.glint(ox + R * 0.48, oy - R * 0.74, 13, '#fffdf4', { bloom: 0.7, rays: 4, rot: 0.785, width: 0.06 });
  return { cv: g.toCanvas(), ox, oy, Wu, Hu };
}

function build(b) {
  const W = Kit.windowMask(b);
  const bx = [ART.x0, ART.y0, ART.x1, ART.y1];
  // ---- sky: ochre at the top, cream toward the horizon, a sun diffused into a bright smear ----
  b.spray('#d29c58', W, { grain: 0.06 });
  b.spray('#e9bf7c', b.mulF(W, (u, v) => smooth(ART.y0, 560, v)), { grain: 0.1 });
  b.spray('#f8e1ad', b.mulF(W, (u, v) => smooth(380, 760, v)), { grain: 0.1 });
  b.spray('#fff2d4', b.mulF(W, (u, v) => smooth(600, 790, v) * 0.9), { grain: 0.1 });
  b.spray('#fff1cf', b.mulF(W, (u, v) => 0.8 * Math.exp(-((Math.hypot(u - SUNP[0], (v - SUNP[1]) * 1.2) / 230) ** 1.4))), { grain: 0.12 });
  b.spray('#fffaf0', b.mulF(W, (u, v) => Math.exp(-((Math.hypot(u - SUNP[0], v - SUNP[1]) / 60) ** 2))), { grain: 0.1 });
  // high haze streaks, sprayed against a loose shield (soft both sides)
  for (const [y, h, a, sl] of [[170, 16, 0.3, -0.05], [262, 10, 0.22, -0.03], [430, 22, 0.25, -0.02], [520, 9, 0.2, -0.01]]) {
    b.spray('#fff4dc', b.mulF(W, (u, v) => a * Math.exp(-(((v - y - (u - 500) * sl) / h) ** 2)) * (0.6 + 0.4 * fbm(u / 120, y, 3, 2))), { grain: 0.25 });
  }
  // the most distant deck, a static band at the horizon
  b.spray('#f3d7a3', b.mulF(W, (u, v) => smooth(752, 770, v)), { grain: 0.1 });
  b.spray('#fff3d8', b.mulF(W, (u, v) => Math.exp(-(((v - 772) / 4) ** 2)) * 0.8), { grain: 0.15 });
  // a second city, very far off on the horizon
  const far = b.raster((c) => { c.beginPath(); c.arc(190, 762, 15, Math.PI, 0); c.closePath(); c.fill(); c.beginPath(); c.ellipse(190, 764, 18, 3.5, 0, 0, TAU); c.fill(); }, [168, 740, 212, 770]);
  b.spray('#d9a874', far, { grain: 0.15 });
  b.gouache('#fff6e0', b.ridge(far, 0.7), { op: 0.6 });

  Kit.band(b, {
    no: '04', open: false, title: 'Over Venus',
    titleStyle: { top: '#e8a443', bottom: '#9a4f2c', band: '#ffd98f', shadow: INK.plum },
    line: 'A FLOATING CITY 50 KM ABOVE VENUS',
  });
  const layers = LAYERS.map((L) => paintLayer(b, L));
  const city = paintCity(b);
  return { layers, city };
}

function frame(ctx, t, k, L) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ART.x0 * k, ART.y0 * k, ART.w * k, ART.h * k, 10 * k) : ctx.rect(ART.x0 * k, ART.y0 * k, ART.w * k, ART.h * k); ctx.clip();
  const draw = (ly) => {
    const off = ((t * ly.v) % ly.P + ly.P) % ly.P;
    ctx.drawImage(ly.cv, Math.round((ART.x0 - off) * k), Math.round(ly.top * k));
  };
  draw(L.layers[0]);
  // its shadow falls down and left onto the deck below
  ctx.save(); ctx.globalAlpha = 0.16;
  ctx.translate((CITY.x - 80) * k, (CITY.y + 100) * k); ctx.scale(1, 0.14);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 210 * k);
  g.addColorStop(0, 'rgba(130,64,40,1)'); g.addColorStop(0.5, 'rgba(130,64,40,.55)'); g.addColorStop(1, 'rgba(130,64,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 210 * k, 0, TAU); ctx.fill(); ctx.restore();
  // the city rides the air: a slow rise and fall, a slight roll
  const bob = Math.sin(t * TAU / 14) * 3.2, roll = Math.sin(t * TAU / 19 + 1) * 0.006;
  ctx.save();
  ctx.translate(CITY.x * k, (CITY.y + bob) * k); ctx.rotate(roll);
  ctx.drawImage(L.city.cv, -L.city.ox * k, -L.city.oy * k);
  ctx.restore();
  draw(L.layers[1]);
  draw(L.layers[2]);
  ctx.restore();
}

Bureau.define({ id: 'venus', seed: 404, still: 21, fps: 20, build, frame });
})();

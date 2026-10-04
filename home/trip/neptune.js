// Stop 5, Neptune and Triton. Neptune is a banded blue print with its faint rings and the Adams
// ring's arcs; Triton, in front, is the moon grown into a computer, in cloisonné: cells of
// coloured enamel inside gold wire, the night side full of lit halls, the whole moon glowing.
import { TAU, PI, clamp, smooth, fbm, mulberry32, vnoise } from './math.js';
import { INK } from './world.js';
import { globe } from './globe.js';
import { spark } from './ink.js';

const { NAVY, CREAM, COBALT, AZURE, ICE, WIRE, AMBER, ABYSS, YELLOW } = INK;
const NIGHT = '#0a1022';
const ENAMEL_DAY = ['#efc9c2', '#ecc0ba', '#f4d6cc', '#e2b6c0', '#f1cfc5'];
const ENAMEL_NIGHT = ['#1a2459', '#202c6b', '#16204e', '#27336f'];

export function neptuneGeo(w) {
  const N = w.NEPTUNE, R = w.NR, land = w.mode === 'landscape';
  const G = globe(N, R, w.light(N), { roll: land ? -.42 : -.38, tilt: -.22, front: .18 });
  const T = w.TRITON, TR = w.TR;
  const TG = globe(T, TR, w.light(T), { roll: .3, tilt: .35, front: .25, lon0: .8 });
  // Triton's orbit: an ellipse round Neptune through Triton, tipped against the rings (it runs backwards)
  const dx = T[0] - N[0], dy = T[1] - N[1], rot = Math.atan2(dy, dx) * .25 + (land ? .1 : 1.2);
  const cr = Math.cos(rot), sr = Math.sin(rot), u = dx * cr + dy * sr, v = -dx * sr + dy * cr;
  const q = .48, rx = Math.hypot(u, v / q), ry = rx * q;
  const orbit = a => [N[0] + rx * Math.cos(a) * cr - ry * Math.sin(a) * sr, N[1] + rx * Math.cos(a) * sr + ry * Math.sin(a) * cr, Math.sin(a)];
  const tA = Math.atan2(v / q, u);
  return { N, R, G, T, TR, TG, orbit, tA };
}

export function drawNeptune(I, w) {
  const g = neptuneGeo(w), { ctx } = I, { N, R, G, T, TR, TG } = g;
  const box = [N[0] - R, N[1] - R, N[0] + R, N[1] + R];
  const ringPts = r => { const p = []; for (let i = 0; i <= 360; i++) p.push(G.fwd(i / 360 * TAU, 0, r)); return p; };
  const rings = [[1.69, .4, .14], [2.15, .45, .2], [2.23, 1.4, .07], [2.54, .55, .3]];   // radius, width (×R/100), alpha
  const strokeRing = (r, wd, a, front) => {
    ctx.strokeStyle = CREAM; ctx.lineWidth = I.lw(R * wd / 100); ctx.globalAlpha = a; ctx.beginPath(); let pen = false;
    for (const p of ringPts(r)) { if ((p[2] >= 0) !== front) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  const adamsArcs = front => {   // Liberté, Égalité, Fraternité: brighter clumps on the outer ring
    ctx.strokeStyle = CREAM; ctx.lineCap = 'round';
    for (const [a0, len] of [[2.2, .14], [2.42, .1], [2.58, .18], [2.85, .06]]) {
      ctx.lineWidth = I.lw(R * .008); ctx.globalAlpha = .7; ctx.beginPath(); let pen = false;
      for (let i = 0; i <= 24; i++) { const p = G.fwd(a0 + len * i / 24, 0, 2.54); if ((p[2] >= 0) !== front) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  // Triton's orbit and the rings' far side, behind the planet
  const orbitRun = front => { ctx.strokeStyle = WIRE; ctx.lineWidth = I.lw(R * .003); ctx.globalAlpha = front ? .4 : .16; ctx.beginPath(); let pen = false; for (let i = 0; i <= 400; i++) { const p = g.orbit(i / 400 * TAU); if ((p[2] >= 0) !== front) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; } ctx.stroke(); ctx.globalAlpha = 1; };
  orbitRun(false);
  for (const [r, wd, a] of rings) strokeRing(r, wd, a * .7, false);
  adamsArcs(false);

  // ── Neptune ──
  I.disc(N, R, COBALT);
  I.within(c => c.arc(N[0], N[1], R, 0, TAU), () => {
    const lat = (x, y) => { const s = G.inv(x, y); return s ? s.lat * 57.3 : null; };
    // bright bands (azure) and dark bands (abyss), with soft wandering edges
    I.halftone(box, (x, y) => {
      const s = G.inv(x, y); if (!s) return 0; const L = s.lat * 57.3 + 4 * fbm(s.lon * 1.5, s.lat * 3, 21, 3);
      return (.55 * Math.exp(-(((L + 50) / 9) ** 2)) + .5 * Math.exp(-(((L - 8) / 14) ** 2)) + .35 * smooth(55, 75, L)) * (.75 + .25 * fbm(s.lon * 3, s.lat * 14, 23, 3));
    }, { cell: 2.6, angle: .25, color: AZURE, max: .85 });
    I.halftone(box, (x, y) => {
      const s = G.inv(x, y); if (!s) return 0; const L = s.lat * 57.3;
      return .5 * Math.exp(-(((L + 22) / 8) ** 2)) + .35 * Math.exp(-(((L - 32) / 7) ** 2)) + .45 * smooth(-62, -80, L);
    }, { cell: 2.6, angle: .85, color: ABYSS, max: .8 });
    // the Great Dark Spot and its bright companion cloud
    const sp = G.fwd(-.35, -22 / 57.3);
    if (sp[2] > 0) {
      ctx.save(); ctx.translate(sp[0], sp[1]); ctx.rotate(-.42);
      const f = sp[2];
      ctx.restore();
      I.halftone([sp[0] - R * .25, sp[1] - R * .2, sp[0] + R * .25, sp[1] + R * .2], (x, y) => {
        const u = (x - sp[0]) * Math.cos(.42) + (y - sp[1]) * Math.sin(.42), v = -(x - sp[0]) * Math.sin(.42) + (y - sp[1]) * Math.cos(.42);
        const d = Math.hypot(u / (R * .14 * f + R * .02), v / (R * .072));
        return d < 1.25 ? smooth(1.25, .55, d) : 0;
      }, { cell: 2.2, angle: .9, color: ABYSS, max: 1, shape: 1.25 });
      ctx.save(); ctx.translate(sp[0], sp[1]); ctx.rotate(-.42);
      ctx.strokeStyle = CREAM; ctx.lineCap = 'round'; ctx.globalAlpha = .85; ctx.lineWidth = I.lw(R * .012);
      ctx.beginPath(); ctx.ellipse(R * .01, R * .095, R * .11 * f, R * .016, 0, Math.PI * .1, Math.PI * .9); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // bands: crisp ribbons along the latitudes, the print's own stripes
    ctx.lineCap = 'butt';
    for (const [L, wdt, col, al] of [[-48, .05, AZURE, .55], [-41, .018, CREAM, .35], [8, .08, AZURE, .4], [18, .02, CREAM, .3], [36, .035, ABYSS, .5], [-24, .04, ABYSS, .45], [58, .05, AZURE, .45]]) {
      ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = I.lw(R * wdt); ctx.beginPath(); let pen = false;
      for (let j = 0; j <= 120; j++) { const p = G.fwd(-PI + j / 120 * TAU, L / 57.3); if (p[2] < 0) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
      ctx.stroke();
    }
    // cirrus: long fine cream streaks drawn out along the latitudes by the winds
    const r = mulberry32(31); ctx.strokeStyle = CREAM; ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const L0 = [-38, -31, 22, 27, 41, 12][i % 6] + (r() - .5) * 4, lon0 = (r() - .5) * 2.4, len = .2 + r() * .45;
      ctx.lineWidth = I.lw(R * (.003 + .006 * r())); ctx.globalAlpha = .5 + .45 * r(); ctx.beginPath(); let pen = false;
      for (let j = 0; j <= 24; j++) { const p = G.fwd(lon0 + len * j / 24, (L0 + j * .04) / 57.3); if (p[2] < .05) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // limb darkening and the night side
    I.halftone(box, (x, y) => { const s = G.inv(x, y); return s ? smooth(.7, 1, s.r) * .45 : 0; }, { cell: 2.6, angle: .55, color: ABYSS, max: .7 });
    I.halftone(box, (x, y) => { const s = G.inv(x, y); return s ? smooth(.1, -.28, G.day(s.n)) * .97 : 0; }, { cell: 2.6, angle: .6, color: NIGHT, max: 1, shape: 1.3 });
    void lat;
  });
  // a fine bright limb on the lit side
  ctx.save(); const sa = Math.atan2(-G.sun[1], G.sun[0]);
  ctx.strokeStyle = AZURE; ctx.lineWidth = I.lw(R * .006); ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(N[0], N[1], R - R * .003, sa - 1.3, sa + 1.3); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
  for (const [r, wd, a] of rings) strokeRing(r, wd, a, true);
  adamsArcs(true);
  orbitRun(true);

  // ── Triton's glow: warm gold dots, the heat of the halls ──
  I.halftone([T[0] - TR * 2.8, T[1] - TR * 2.8, T[0] + TR * 2.8, T[1] + TR * 2.8], (x, y) => {
    const d = Math.hypot(x - T[0], y - T[1]) / TR; if (d < 1) return 0;
    return Math.pow(clamp(1 - (d - 1) / 1.6), 2.2) * .62 * (.8 + .2 * vnoise(Math.atan2(y - T[1], x - T[0]) * 4, 3, 7));
  }, { cell: 3, angle: .26, color: WIRE, max: .8 });
  drawTriton(I, g);
  void PI; void NAVY; void YELLOW;
}

// Triton in cloisonné: Voronoi cells of enamel on the sphere, gold wire between them.
function drawTriton(I, g) {
  const { ctx } = I, { T, TR, TG } = g;
  const box = [T[0] - TR, T[1] - TR, T[0] + TR, T[1] + TR];
  const r = mulberry32(77), seeds = [];
  for (let i = 0; i < 150; i++) { const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z); seeds.push([s * Math.cos(a), z, s * Math.sin(a), r()]); }
  const vec = s => [Math.cos(s.lat) * Math.sin(s.lon), Math.sin(s.lat), Math.cos(s.lat) * Math.cos(s.lon)];
  const cellAt = (x, y) => {
    const s = TG.inv(x, y); if (!s) return null;
    const p = vec(s); let d1 = 9, d2 = 9, i1 = 0;
    for (let i = 0; i < seeds.length; i++) { const q = seeds[i], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < d1) { d2 = d1; d1 = d; i1 = i; } else if (d < d2) d2 = d; }
    return { s, i: i1, edge: Math.sqrt(d2) - Math.sqrt(d1), day: TG.day(s.n) };
  };
  // enamel, cell by cell (each colour one raster pass)
  I.disc(T, TR, ENAMEL_NIGHT[0]);
  const memo = new Map(), key = (x, y) => Math.round(x * 64) * 100003 + Math.round(y * 64);
  const C = (x, y) => { const k = key(x, y); let v = memo.get(k); if (v === undefined) { v = cellAt(x, y); memo.set(k, v); } return v; };
  ENAMEL_DAY.forEach((col, ci) => I.raster(box, (x, y) => { const c = C(x, y); return c && c.i % ENAMEL_DAY.length === ci ? smooth(-.05, .12, c.day) : 0; }, col));
  ENAMEL_NIGHT.forEach((col, ci) => ci && I.raster(box, (x, y) => { const c = C(x, y); return c && c.i % ENAMEL_NIGHT.length === ci ? smooth(.12, -.05, c.day) : 0; }, col));
  // halls: amber cells on the night side, the computer at work
  I.raster(box, (x, y) => { const c = C(x, y); if (!c) return 0; const sd = seeds[c.i][3]; return sd > .45 ? smooth(.05, -.1, c.day) * smooth(.012, .03, c.edge) * (sd > .75 ? 1 : .6) : 0; }, AMBER);
  // a soft rose terminator on the day side
  I.halftone(box, (x, y) => { const s = TG.inv(x, y); return s ? smooth(.45, -.05, TG.day(s.n)) * smooth(-.15, .05, TG.day(s.n)) * .6 : 0; }, { cell: 1.6, angle: .6, color: '#b9869a', max: .7 });
  // gold wire between the cells, bolder where the moon is awake
  I.raster(box, (x, y) => { const c = C(x, y); if (!c) return 0; const wd = c.day < 0 ? .03 : .022; return 1 - smooth(wd * .55, wd, c.edge); }, WIRE);
  // the rim, a gold bezel
  I.ring(T, TR, WIRE, TR * .035, 1);
  // geysers: dark plumes rising from the sunlit south and trailing downwind
  ctx.strokeStyle = '#6a5a73'; ctx.lineCap = 'round';
  for (const [lon, lat, h] of [[.2, -.6, .5], [.5, -.75, .38], [-.2, -.5, .3]]) {
    const p = TG.fwd(lon, lat, 1); if (p[2] < .1) continue;
    const top = TG.fwd(lon, lat, 1 + h * .18);
    ctx.lineWidth = I.lw(TR * .02); ctx.globalAlpha = .75; ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    ctx.quadraticCurveTo(top[0], top[1], top[0] + TR * h * .9, top[1] + TR * .05); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// what moves: thought running along Triton's wires, glints on the Adams arcs, a slow pulse in the halls
export function drawNeptuneLive(ctx, w, t, k) {
  const g = neptuneGeo(w), { T, TR, TG, R, G } = g;
  const r = mulberry32(5);
  for (let i = 0; i < 18; i++) {
    const lon = r() * TAU, lat = (r() - .5) * 2.6, sp = .15 + r() * .25, ph = r();
    const p = TG.fwd(lon + ((t * sp + ph) % 1) * .9, lat + Math.sin(t * .3 + i) * .05, 1.005); if (p[2] < .1) continue;
    const n = [(p[0] - T[0]) / TR, -(p[1] - T[1]) / TR, p[2]], night = TG.day(n) < .05;
    const g2 = .35 + .65 * Math.pow(.5 + .5 * Math.sin(t * 3 + i * 1.7), 3);
    if (night) spark(ctx, p[0], p[1], TR * .12 * g2, g2, AMBER, '#fff1cf');
    else { ctx.fillStyle = '#fff6df'; ctx.globalAlpha = g2 * .7; const s = Math.max(TR * .012, .8 / k); ctx.fillRect(p[0] - s, p[1] - s, s * 2, s * 2); ctx.globalAlpha = 1; }
  }
  for (let i = 0; i < 2; i++) {
    const a = 2.2 + ((t * .02 + i * .45) % 1) * .8, p = G.fwd(a, 0, 2.54); if (p[2] < 0) continue;
    spark(ctx, p[0], p[1], R * .03, .6);
  }
  void smooth; void ICE;
}

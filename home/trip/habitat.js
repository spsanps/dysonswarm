// Stop 4, Another Sky: an O'Neill cylinder near Earth, in the Another Sky poster's inks (teal,
// sea, sand, coral, gold on navy). Its proportions are the explorer's own, 24 km across and
// 56 km long. The end facing the Sun is glazed, and through it you see the land inside curving
// up and over, with the light at the far end, as on the poster. It turns.
import { TAU, PI, clamp, smooth, fbm, mulberry32, vnoise, norm } from './math.js';
import { INK } from './world.js';
import { spark } from './ink.js';

const { NAVY, CREAM, YELLOW, SEA, SKY, SAND, CORAL, MOSS, OLIVE, GOLD } = INK;
const HULL = '#d9c9a3', HULL_DARK = '#3d4f5c';

export function habGeo(w) {
  const C = w.HAB, HL = w.HL, HR = w.HR, l = w.light(C), land = w.mode === 'landscape';
  const off = land ? -.22 : .32, base = Math.atan2(-l[1], -l[0]) + off;   // axis points away from the Sun
  const a = [Math.cos(base), Math.sin(base)], b = [-a[1], a[0]];
  const th = .78, ct = Math.cos(th), st = Math.sin(th);
  // cylinder coordinates (x along the axis, phi round it) → screen and depth
  const P = (x, phi, r = HR) => {
    const y = r * Math.cos(phi), z = r * Math.sin(phi);
    const X = x * ct + z * st, Z = -x * st + z * ct;
    return [C[0] + a[0] * X + b[0] * y, C[1] + a[1] * X + b[1] * y, Z];
  };
  const la = l[0] * a[0] + l[1] * a[1], lb = l[0] * b[0] + l[1] * b[1], ln = Math.hypot(la, lb, .45);
  const L = [la / ln, lb / ln, .45 / ln];
  const shade = phi => Math.sin(phi) * st * L[0] + Math.cos(phi) * L[1] + Math.sin(phi) * ct * L[2];   // hull normal · light
  const capN = -ct * L[0] + st * L[2];   // the near cap's normal · light
  return { C, HL, HR, l, a, b, th, ct, st, P, shade, capN, L };
}

export function drawHabitat(I, w) {
  const g = habGeo(w), { ctx } = I, { HL, HR, P, a, b, st } = g;
  const path = (pts, close = true) => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); };
  const arc = (x, p0, p1, r = HR, n = 64) => { const o = []; for (let i = 0; i <= n; i++) o.push(P(x, p0 + (p1 - p0) * i / n, r)); return o; };
  const box = w.plates.find(p => p.id === 'habitat').box;

  // the hull's visible half: from the near cap's rim to the far end
  const hull = [...arc(-HL, 0, PI), ...arc(HL, PI, 0)];
  ctx.fillStyle = HULL; ctx.beginPath(); path(hull); ctx.fill();
  const Yb = (x, y) => (x - g.C[0]) * b[0] + (y - g.C[1]) * b[1];
  const Xa = (x, y) => (x - g.C[0]) * a[0] + (y - g.C[1]) * a[1];
  const invPhi = (x, y) => Math.acos(clamp(Yb(x, y) / HR, -1, 1));   // front half (sin phi > 0)
  // the cutaway: a long window cut in the hull, showing the land on the far inside wall
  const c0 = -HL * .62, c1 = HL * .8, p0 = .72, p1 = 1.78;
  const cut = [...arc(c0, p0, p1, HR, 32), ...arc(c1, p1, p0, HR, 32)];
  I.within(c => path(hull), () => {
    // shading in three tones: a cream highlight, the sand, a halftone shadow round the far side
    I.halftone(box, (x, y) => smooth(.2, -.55, g.shade(invPhi(x, y))) * .85, { cell: 2.4, angle: .7, color: HULL_DARK, max: .9 });
    ctx.lineCap = 'butt';
    const hp = PI * .5 + Math.atan2(-g.L[1], g.L[0] * .7) * .35;
    for (const [dw, al, col] of [[.16, .5, CREAM], [.07, .9, CREAM]]) {
      const q0 = P(-HL, hp, HR), q1 = P(HL, hp, HR);
      ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = I.lw(HR * dw);
      ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // longitudinal panel seams
    ctx.strokeStyle = HULL_DARK; ctx.lineWidth = I.lw(HR * .005); ctx.globalAlpha = .35; ctx.beginPath();
    for (let k = 1; k < 18; k++) { const phi = k / 18 * PI, q0 = P(-HL, phi), q1 = P(HL, phi); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); }
    ctx.stroke(); ctx.globalAlpha = 1;
    // hoops every 4 km, the heavy ones every 12
    for (let i = 1; i < 14; i++) {
      const x = -HL + i / 14 * 2 * HL;
      ctx.strokeStyle = i % 3 === 0 ? MOSS : HULL_DARK; ctx.lineWidth = I.lw(i % 3 === 0 ? HR * .026 : HR * .007); ctx.globalAlpha = i % 3 === 0 ? 1 : .5;
      ctx.beginPath(); path(arc(x, 0, PI, HR * 1.002, 48), false); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the land inside, through the cut
    ctx.save(); ctx.beginPath(); path(cut); ctx.clip();
    const inside = (x, y) => {   // screen → (x, phi) on the far inner wall (sin phi < 0)
      const phi = -Math.acos(clamp(Yb(x, y) / HR, -1, 1));
      return [(Xa(x, y) - HR * Math.sin(phi) * st) / g.ct, phi];
    };
    const lake = (X, F) => fbm(X / HR * 2.2 + 3, F * 2.1 + 5, 91, 4);
    ctx.fillStyle = MOSS; ctx.beginPath(); path(cut); ctx.fill();
    const cb = [Math.min(...cut.map(q => q[0])), Math.min(...cut.map(q => q[1])), Math.max(...cut.map(q => q[0])), Math.max(...cut.map(q => q[1]))];
    I.raster(cb, (x, y) => { const [X, F] = inside(x, y); return smooth(.56, .6, fbm(X / HR * 3.4, F * 3.2 + 1, 93, 4)) * (1 - smooth(.6, .64, lake(X, F))); }, OLIVE);
    I.raster(cb, (x, y) => { const [X, F] = inside(x, y); return smooth(.62, .66, lake(X, F)); }, SEA);
    I.raster(cb, (x, y) => { const [X, F] = inside(x, y); const v = lake(X, F); return smooth(.6, .62, v) * (1 - smooth(.625, .64, v)); }, SAND);
    // fields: fine ruled strips on the land
    I.halftone(cb, (x, y) => { const [X, F] = inside(x, y); return lake(X, F) > .6 ? 0 : .25 * smooth(.45, .6, fbm(X / HR * 9, F * 9, 95, 2)); }, { cell: 2, angle: .2, color: SAND, max: .5 });
    // clouds in the air between, nearer to us than the land
    const r = mulberry32(17); ctx.fillStyle = CREAM;
    for (let i = 0; i < 16; i++) {
      const X = c0 + r() * (c1 - c0), F = p0 + .12 + r() * (p1 - p0 - .24), rr = HR * (.35 + .4 * r());
      for (let j = 0; j < 5; j++) {
        const q = P(X + (r() - .5) * HR * .14, F + (r() - .5) * .07, rr), sz = HR * (.008 + .014 * r());
        ctx.globalAlpha = .92; ctx.beginPath(); ctx.ellipse(q[0], q[1], sz * 2, sz, Math.atan2(a[1], a[0]), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // depth at the cut's edges: the inner wall in shadow under the lip
    I.halftone(cb, (x, y) => { const f = invPhi(x, y); return smooth(p0 + .12, p0, f) * .7 + smooth(p1 - .1, p1, f) * .4; }, { cell: 2.2, angle: .9, color: HULL_DARK, max: .8 });
    ctx.restore();
    // the cut's frame: a teal sill and fine mullions, so it reads as glazing rather than a wound
    ctx.strokeStyle = MOSS; ctx.lineWidth = I.lw(HR * .02); ctx.beginPath(); path(cut); ctx.stroke();
    ctx.strokeStyle = HULL; ctx.lineWidth = I.lw(HR * .007); ctx.globalAlpha = .8; ctx.beginPath();
    for (let i = 1; i < 12; i++) { const x = c0 + (c1 - c0) * i / 12; path(arc(x, p0, p1, HR, 16), false); }
    ctx.stroke(); ctx.globalAlpha = 1;
    // portholes of light along the shaded side
    const r2 = mulberry32(3); ctx.fillStyle = YELLOW;
    for (let i = 0; i < 320; i++) {
      const x = -HL + r2() * 2 * HL, phi = r2() * PI; if (g.shade(phi) > -.1) continue;
      const q = P(x, phi, HR * 1.003), sz = Math.max(HR * .004, .6 * I.px); ctx.globalAlpha = .45 + .55 * r2(); ctx.fillRect(q[0] - sz, q[1] - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
  });
  // the far rim
  ctx.strokeStyle = HULL_DARK; ctx.lineWidth = I.lw(HR * .012); ctx.globalAlpha = .75;
  ctx.beginPath(); path(arc(HL, 0, PI), false); ctx.stroke(); ctx.globalAlpha = 1;

  // the near cap: a glazed end, a rim of gold, and the world inside
  const cap = arc(-HL, 0, TAU, HR, 128);
  ctx.fillStyle = SAND; ctx.beginPath(); path(cap); ctx.fill();
  const inner = arc(-HL, 0, TAU, HR * .9, 128);
  const capC = P(-HL, 0, 0);
  I.within(c => path(inner), () => {
    // looking in: the land on the inside curving round, in rings toward the far end
    const far = [capC[0] + a[0] * HR * .28, capC[1] + a[1] * HR * .28];   // where the far end appears
    ctx.fillStyle = SKY; ctx.beginPath(); path(inner); ctx.fill();
    const rings = 9, r2 = mulberry32(11);
    for (let i = 0; i < rings; i++) {
      const f0 = 1 - i / rings, f1 = 1 - (i + 1) / rings;
      const ring = (f, phi) => { const p = P(-HL, phi, HR * .9 * Math.pow(f, 1.25)); const k = 1 - f; return [p[0] + (far[0] - capC[0]) * k, p[1] + (far[1] - capC[1]) * k]; };
      // sectors: three strips of land (fields, lakes) between strips of sky, as inside the explorer
      for (let s = 0; s < 18; s++) {
        const p0 = s / 18 * TAU + i * .07, p1 = (s + 1) / 18 * TAU + i * .07, landStrip = (s % 6) < 4;
        if (!landStrip) continue;
        const v = r2(), col = v < .45 ? MOSS : v < .7 ? OLIVE : v < .85 ? SEA : SAND;
        ctx.fillStyle = col; ctx.beginPath();
        const q = [ring(f0, p0), ring(f0, p1), ring(f1, p1), ring(f1, p0)];
        path(q); ctx.fill();
      }
    }
    // clouds drifting in the open air
    ctx.fillStyle = CREAM;
    for (let i = 0; i < 26; i++) {
      const f = .35 + .6 * r2(), phi = r2() * TAU, p = P(-HL, phi, HR * .9 * Math.pow(f, 1.25)), k = 1 - f;
      const q = [p[0] + (far[0] - capC[0]) * k, p[1] + (far[1] - capC[1]) * k], s = HR * .035 * f;
      ctx.globalAlpha = .85; ctx.beginPath(); ctx.ellipse(q[0], q[1], s * 1.8, s, Math.atan2(a[1], a[0]) + PI / 2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the light at the far end: a gold and coral target, like the poster's
    for (const [r, col] of [[.22, GOLD], [.17, CREAM], [.12, CORAL], [.08, CREAM], [.04, CORAL]]) {
      const e = arc(-HL, 0, TAU, HR * r, 48).map(p => [p[0] + far[0] - capC[0], p[1] + far[1] - capC[1]]);
      ctx.fillStyle = col; ctx.beginPath(); path(e); ctx.fill();
    }
    // glazing: a faint sky-light screen over it all, brighter toward the rim
    I.halftone(box, (x, y) => {
      const d = Math.hypot((x - capC[0]) / (HR * .9), (y - capC[1]) / (HR * .9));
      return smooth(.55, 1.15, d) * .35;
    }, { cell: 2.2, angle: .3, color: CREAM, max: .5 });
  });
  // the rim: gold, with a fine inner line
  ctx.strokeStyle = GOLD; ctx.lineWidth = I.lw(HR * .03); ctx.beginPath(); path(arc(-HL, 0, TAU, HR * .95, 128)); ctx.stroke();
  ctx.strokeStyle = HULL_DARK; ctx.lineWidth = I.lw(HR * .008); ctx.globalAlpha = .6; ctx.beginPath(); path(inner); ctx.stroke(); ctx.globalAlpha = 1;
  // shading on the cap's rim band (it faces the Sun, so mostly lit)
  ctx.strokeStyle = HULL_DARK; ctx.lineWidth = I.lw(HR * .012); ctx.globalAlpha = .55; ctx.beginPath(); path(cap); ctx.stroke(); ctx.globalAlpha = 1;
  // the hub: a short docking spindle toward the Sun
  const s0 = P(-HL, 0, 0), s1 = P(-HL - HR * .18, 0, 0);
  ctx.strokeStyle = GOLD; ctx.lineWidth = I.lw(HR * .06); ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
  const hub = []; for (let i = 0; i <= 32; i++) hub.push(P(-HL - HR * .18, i / 32 * TAU, HR * .055));
  ctx.fillStyle = CREAM; ctx.beginPath(); path(hub); ctx.fill();
  void norm; void vnoise; void fbm; void NAVY;
}

// what moves: the cylinder turns (lights on the hull and the cap's spokes go round), a shuttle docks
export function drawHabitatLive(ctx, w, t, k) {
  const g = habGeo(w), { HL, HR, P } = g;
  const spin = t * TAU / 40;   // a turn every 40 s here (the real one takes about 3½ minutes)
  // marker lights on the hoops, riding round with the hull
  for (let i = 1; i < 14; i += 3) {
    const x = -HL + i / 14 * 2 * HL;
    for (let j = 0; j < 4; j++) {
      const phi = ((spin + j / 4 * TAU + i) % TAU + TAU) % TAU; if (phi > PI) continue;
      const p = P(x, phi, HR * 1.01), lit = Math.sin(phi);
      ctx.fillStyle = j % 2 ? CORAL : '#fff6df'; ctx.globalAlpha = .4 + .6 * lit;
      const s = Math.max(HR * .008, .9 / k); ctx.beginPath(); ctx.arc(p[0], p[1], s, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // the cap's spokes (mullions of the glazing) turning
  ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(HR * .006, .7 / k); ctx.globalAlpha = .85; ctx.beginPath();
  for (let i = 0; i < 12; i++) { const phi = spin + i / 12 * TAU, p0 = P(-HL, phi, HR * .24), p1 = P(-HL, phi, HR * .9); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
  ctx.stroke();
  ctx.beginPath(); for (let i = 0; i <= 96; i++) { const p = P(-HL, i / 96 * TAU, HR * .6); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.globalAlpha = .45; ctx.stroke();
  ctx.globalAlpha = 1;
  // a shuttle easing in toward the spindle, then gone, every 24 s
  const u = (t % 24) / 24, f = smooth(0, .85, u), dish = P(-HL - HR * .2, 0, 0);
  const from = [dish[0] - g.a[0] * HR * 2.2 + g.b[0] * HR * .9, dish[1] - g.a[1] * HR * 2.2 + g.b[1] * HR * .9];
  const p = [from[0] + (dish[0] - from[0]) * f, from[1] + (dish[1] - from[1]) * f];
  const fade = smooth(0, .08, u) * (1 - smooth(.86, .95, u));
  if (fade > .02) {
    ctx.globalAlpha = fade; ctx.fillStyle = CREAM; const s = Math.max(HR * .014, 1.2 / k);
    ctx.fillRect(p[0] - s * 1.6, p[1] - s * .6, s * 3.2, s * 1.2); ctx.globalAlpha = 1;
    spark(ctx, p[0] - g.a[0] * s * 2, p[1] - g.a[1] * s * 2, HR * .05, fade * (.5 + .5 * Math.sin(t * 9)), CORAL);
  }
}

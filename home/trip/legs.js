// On the way between places, so the stretches between stops are not empty sky: a comet falling
// past the Sun, an asteroid under tow with a convoy heading out past Venus, traffic from the Moon
// to the cylinder. Plates for what holds still, a live layer for what moves.
import { TAU, PI, clamp, smooth, fbm, mulberry32, bez, at, norm } from './math.js';
import { INK } from './world.js';
import { spark } from './ink.js';

const { NAVY, CREAM, YELLOW, ORANGE, SKY, SLATE } = INK;

// the comet: a bright head, a halftone dust tail curving away from the Sun, a straight ion tail
export function drawComet(I, w) {
  const { ctx } = I, H = w.COMET, R = w.CR, away = norm([H[0] - w.SUN[0], H[1] - w.SUN[1]]), n = [-away[1], away[0]];
  const L = 400;
  const box = w.plates.find(p => p.id === 'comet').box;
  // dust tail: a broad screen of yellow dots, curving a little behind the comet's motion
  const curve = s => [H[0] + away[0] * s * L + n[0] * s * s * L * .16, H[1] + away[1] * s * L + n[1] * s * s * L * .16];
  I.halftone(box, (x, y) => {
    // nearest point along the tail's spine, roughly
    let best = 1e9, bs = 0;
    for (let i = 0; i <= 24; i++) { const s = i / 24, p = curve(s), d = (x - p[0]) ** 2 + (y - p[1]) ** 2; if (d < best) { best = d; bs = s; } }
    const width = R * 1.4 + bs * L * .2, d = Math.sqrt(best) / width;
    if (d > 1.2) return 0;
    return Math.pow(clamp(1 - d), 1.4) * Math.pow(1 - bs, 1.3) * .9 * (.75 + .25 * fbm(bs * 9, d * 3, 5, 2));
  }, { cell: 3.2, angle: .3, color: YELLOW, max: .85 });
  // ion tail: fine straight lines, pale blue
  ctx.strokeStyle = SKY; ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) {
    const off = i * R * .35, len = L * (1.1 - Math.abs(i) * .08);
    const p0 = [H[0] + n[0] * off * .3, H[1] + n[1] * off * .3], p1 = [H[0] + away[0] * len + n[0] * off, H[1] + away[1] * len + n[1] * off];
    const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
    g.addColorStop(0, 'rgba(169,207,197,.85)'); g.addColorStop(1, 'rgba(169,207,197,0)');
    ctx.strokeStyle = g; ctx.lineWidth = I.lw(i ? .7 : 1.2);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
  }
  // coma and nucleus
  I.halftone([H[0] - R * 4, H[1] - R * 4, H[0] + R * 4, H[1] + R * 4], (x, y) => { const d = Math.hypot(x - H[0], y - H[1]) / (R * 3.6); return d < 1 ? Math.pow(1 - d, 1.6) * .9 : 0; }, { cell: 2.2, angle: 1, color: CREAM, max: .9 });
  I.disc(H, R * .7, '#fff6df');
}

// a solar sail: a square of film on diagonal booms, turned to the light, its payload at the hub
export function drawSail(I, w) {
  const { ctx } = I, C = w.SAIL, R = w.SAILR, l = w.light(C);
  const rot = Math.atan2(l[1], l[0]) + .55, squash = .42;
  const P = (u, v) => { const x = u * R, y = v * R * squash, c = Math.cos(rot), s = Math.sin(rot); return [C[0] + x * c - y * s, C[1] + x * s + y * c]; };
  const corners = [P(0, -1.25), P(1.25, 0), P(0, 1.25), P(-1.25, 0)];
  const quad = c => { c.moveTo(...corners[0]); for (const p of corners) c.lineTo(p[0], p[1]); c.closePath(); };
  // film: cream, with a gold sheen screened across it where it faces the Sun
  ctx.fillStyle = CREAM; ctx.beginPath(); quad(ctx); ctx.fill();
  I.within(quad, () => {
    I.halftone([C[0] - R * 1.5, C[1] - R * 1.5, C[0] + R * 1.5, C[1] + R * 1.5], (x, y) => {
      const d = ((x - C[0]) * l[0] + (y - C[1]) * l[1]) / R;
      return smooth(-1.2, .9, -d) * .7;
    }, { cell: 2, angle: .3, color: '#c99a3a', max: .8 });
    // seams of the film
    ctx.strokeStyle = SLATE; ctx.globalAlpha = .45; ctx.lineWidth = I.lw(.5); ctx.beginPath();
    for (let i = -4; i <= 4; i++) { const a = P(i * .28, -1.3), b = P(i * .28, 1.3); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke(); ctx.globalAlpha = 1;
  });
  // booms and hub
  ctx.strokeStyle = NAVY; ctx.lineWidth = I.lw(R * .025); ctx.beginPath();
  ctx.moveTo(...corners[0]); ctx.lineTo(...corners[2]); ctx.moveTo(...corners[1]); ctx.lineTo(...corners[3]); ctx.stroke();
  ctx.strokeStyle = CREAM; ctx.lineWidth = I.lw(R * .012); ctx.globalAlpha = .9; ctx.beginPath(); quad(ctx); ctx.stroke(); ctx.globalAlpha = 1;
  I.disc(C, R * .07, YELLOW);
}

// an asteroid under tow: a rock with a tug at its back, a long plume pushing it outward
export function drawTug(I, w) {
  const { ctx } = I, C = w.TUG, R = w.TGR, l = w.light(C);
  const r = mulberry32(12), pts = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * TAU, rr = R * (.78 + .3 * fbm(Math.cos(a) * 1.5 + 4, Math.sin(a) * 1.5, 9, 3)); pts.push([C[0] + Math.cos(a) * rr * 1.25, C[1] + Math.sin(a) * rr]); }
  const shape = c => { c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]); c.closePath(); };
  // plume first, behind the rock (pointing away from where it is going: toward the Sun side)
  const back = [-(-l[0]), -(-l[1])].map(v => v), dir = norm([l[0], l[1]]);
  const tug = [C[0] + dir[0] * R * 1.1, C[1] + dir[1] * R * 1.1];
  I.halftone([tug[0] - R * 7, tug[1] - R * 7, tug[0] + R * 7, tug[1] + R * 7], (x, y) => {
    const u = ((x - tug[0]) * dir[0] + (y - tug[1]) * dir[1]) / (R * 6), v = Math.abs((x - tug[0]) * -dir[1] + (y - tug[1]) * dir[0]) / (R * (.25 + u * .5));
    return u > 0 && u < 1 && v < 1 ? Math.pow(1 - u, 1.5) * (1 - v * v) * .85 : 0;
  }, { cell: 2.4, angle: .5, color: ORANGE, max: .9 });
  ctx.fillStyle = CREAM; ctx.beginPath(); shape(ctx); ctx.fill();
  I.within(shape, () => {
    I.halftone([C[0] - R * 1.4, C[1] - R * 1.1, C[0] + R * 1.4, C[1] + R * 1.1], (x, y) => {
      const d = ((x - C[0]) * l[0] + (y - C[1]) * l[1]) / R; let t = smooth(.3, -.8, d) * .9;
      t += .35 * smooth(.55, .7, fbm((x - C[0]) / R * 3, (y - C[1]) / R * 3, 4, 3));
      return t;
    }, { cell: 2, angle: .8, color: NAVY, max: 1 });
  });
  // the tug: a small frame with tanks, clamped to the rock
  ctx.save(); ctx.translate(tug[0], tug[1]); ctx.rotate(Math.atan2(dir[1], dir[0]));
  ctx.fillStyle = SLATE; ctx.fillRect(-R * .35, -R * .32, R * .7, R * .64);
  ctx.fillStyle = CREAM; ctx.fillRect(-R * .3, -R * .26, R * .32, R * .52);
  ctx.strokeStyle = CREAM; ctx.lineWidth = I.lw(R * .04); ctx.beginPath(); ctx.moveTo(-R * .35, -R * .32); ctx.lineTo(-R * .75, -R * .55); ctx.moveTo(-R * .35, R * .32); ctx.lineTo(-R * .75, R * .55); ctx.stroke();
  ctx.fillStyle = YELLOW; ctx.fillRect(R * .3, -R * .12, R * .14, R * .24);
  ctx.restore();
  void back; void r; void PI;
}

const along = (pts, f) => { const p = bez(pts[0], pts[1], pts[Math.max(1, pts.length - 2)], pts[pts.length - 1], 80); return at(p, f); };

export function drawLegsLive(ctx, w, t, k, view) {
  const meets = (x0, y0, x1, y1) => x0 < view[2] && x1 > view[0] && y0 < view[3] && y1 > view[1];
  // the convoy: five freighters on their way out, engines lit, a few minutes apart
  const C = w.CONVOY;
  if (meets(Math.min(...C.map(p => p[0])) - 50, Math.min(...C.map(p => p[1])) - 50, Math.max(...C.map(p => p[0])) + 50, Math.max(...C.map(p => p[1])) + 50)) {
    const path = bez(C[0], C[1], C[1], C[2], 80);
    for (let i = 0; i < 5; i++) {
      const f = ((t / 46 + i / 5) % 1), p = at(path, f), q = at(path, Math.min(1, f + .01)), a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const fade = smooth(0, .12, f) * (1 - smooth(.85, 1, f)); if (fade < .02) continue;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a); ctx.globalAlpha = fade;
      const s = Math.max(4.2, 1.4 / k);
      ctx.fillStyle = CREAM; ctx.fillRect(-s * 2.6, -s * .55, s * 3.6, s * 1.1); ctx.fillRect(-s * 1.4, -s * 1.1, s * 1.2, s * 2.2);
      ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.moveTo(-s * 2.6, -s * .4); ctx.lineTo(-s * 5.5 - Math.sin(t * 30 + i) * s * .6, 0); ctx.lineTo(-s * 2.6, s * .4); ctx.fill();
      ctx.restore();
      // a dotted wake
      ctx.fillStyle = CREAM; ctx.globalAlpha = fade * .45;
      for (let j = 1; j < 9; j++) { const pp = at(path, Math.max(0, f - j * .012)); ctx.beginPath(); ctx.arc(pp[0], pp[1], Math.max(.9, .7 / k), 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  // traffic between the Moon and the cylinder
  const T = w.TRAFFIC;
  if (meets(Math.min(...T.map(p => p[0])) - 40, Math.min(...T.map(p => p[1])) - 40, Math.max(...T.map(p => p[0])) + 40, Math.max(...T.map(p => p[1])) + 40)) {
    const path = bez(T[0], T[1], T[2], T[3], 120);
    for (let i = 0; i < 9; i++) {
      const f = (t / 30 + i / 9) % 1, p = at(path, f), fade = smooth(0, .08, f) * (1 - smooth(.9, 1, f));
      ctx.fillStyle = '#fff6df'; ctx.globalAlpha = fade * .95; const s = Math.max(3, 1 / k);
      ctx.fillRect(p[0] - s, p[1] - s * .6, s * 2, s * 1.2);
      ctx.fillStyle = CREAM; ctx.globalAlpha = fade * .4;
      for (let j = 1; j < 7; j++) { const pp = at(path, Math.max(0, f - j * .008)); ctx.beginPath(); ctx.arc(pp[0], pp[1], Math.max(.9, .7 / k), 0, TAU); ctx.fill(); }
      if (i % 3 === 0) spark(ctx, p[0], p[1], 12, fade * (.4 + .4 * Math.sin(t * 4 + i)));
    }
    ctx.globalAlpha = 1;
  }
  // the tug's engine flickers
  if (meets(w.TUG[0] - 200, w.TUG[1] - 200, w.TUG[0] + 200, w.TUG[1] + 200)) {
    const dir = w.light(w.TUG), p = [w.TUG[0] + dir[0] * w.TGR * 1.55, w.TUG[1] + dir[1] * w.TGR * 1.55];
    spark(ctx, p[0], p[1], w.TGR * (.35 + .1 * Math.sin(t * 13)), .85, ORANGE);
  }
  // the sail catches the Sun now and then
  if (meets(w.SAIL[0] - 100, w.SAIL[1] - 100, w.SAIL[0] + 100, w.SAIL[1] + 100)) {
    const g = Math.pow(Math.max(0, Math.sin(t / 5)), 8);
    spark(ctx, w.SAIL[0] + w.SAILR * .3, w.SAIL[1] - w.SAILR * .1, w.SAILR * (.4 + .8 * g), .3 + .7 * g);
  }
  // the comet's head glints
  if (w.COMET && meets(w.COMET[0] - 60, w.COMET[1] - 60, w.COMET[0] + 60, w.COMET[1] + 60)) spark(ctx, w.COMET[0], w.COMET[1], w.CR * 2.6, .7 + .3 * Math.sin(t * 1.3));
}

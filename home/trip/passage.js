// Between Another Sky and Neptune, the planets we pass: Mars, then the asteroid belt (dots on the
// sky layer), Jupiter, Saturn, Uranus. Smaller prints than the destinations, each true to its look.
import { TAU, clamp, smooth, fbm } from './math.js';
import { INK } from './world.js';
import { globe } from './globe.js';

const { NAVY, CREAM, ORANGE, SAND, CORAL, SKY, SEA, YELLOW } = INK;
const NIGHT = '#0a1022';

function night(I, G, box, cell = 2) {
  I.halftone(box, (x, y) => { const s = G.inv(x, y); return s ? smooth(.12, -.22, G.day(s.n)) * .97 : 0; }, { cell, angle: .6, color: NIGHT, max: 1, shape: 1.3 });
}
const bx = (C, R) => [C[0] - R, C[1] - R, C[0] + R, C[1] + R];

export function drawMars(I, w) {
  const C = w.MARS, R = w.MAR, G = globe(C, R, w.light(C), { roll: -.2, tilt: .3, lon0: 1 }), b = bx(C, R);
  I.disc(C, R, ORANGE);
  I.within(c => c.arc(C[0], C[1], R, 0, TAU), () => {
    I.halftone(b, (x, y) => { const s = G.inv(x, y); return s ? smooth(.45, .62, fbm(s.lon * 1.6 + 2, s.lat * 2.2, 5, 4)) * .6 : 0; }, { cell: 1.6, angle: .4, color: '#9c3a1c', max: .7 });
    I.raster(b, (x, y) => { const s = G.inv(x, y); return s ? smooth(1.15, 1.25, Math.abs(s.lat) + .1 * fbm(s.lon * 3, 1, 7, 2)) : 0; }, CREAM);
    night(I, G, b, 1.6);
  });
}

export function drawJupiter(I, w) {
  const C = w.JUPITER, R = w.JR, G = globe(C, R, w.light(C), { roll: -.06, tilt: .05, lon0: .4 }), b = bx(C, R);
  I.disc(C, R, SAND);
  I.within(c => c.arc(C[0], C[1], R, 0, TAU), () => {
    // belts (darker, warm) and zones (cream), with turbulent edges
    const belt = (lat, lon) => {
      const L = lat * 57.3 + 3 * Math.sin(lon * 4 + lat * 9) * fbm(lon * 2, lat * 8, 9, 2);
      return Math.max(0, Math.cos((L + 4) / 9.5 * Math.PI)) * smooth(55, 40, Math.abs(L));
    };
    I.halftone(b, (x, y) => { const s = G.inv(x, y); return s ? belt(s.lat, s.lon) * .85 : 0; }, { cell: 1.9, angle: .2, color: CORAL, max: .9 });
    I.halftone(b, (x, y) => { const s = G.inv(x, y); if (!s) return 0; const L = s.lat * 57.3; return smooth(.5, .7, fbm(s.lon * 5, s.lat * 22, 11, 3)) * .5 * (1 - belt(s.lat, s.lon)) + smooth(48, 70, Math.abs(L)) * .35; }, { cell: 1.9, angle: .8, color: CREAM, max: .7 });
    // the Great Red Spot
    const spot = G.fwd(.75, -22 / 57.3);
    if (spot[2] > 0) {
      I.disc([spot[0], spot[1]], 0, CORAL);
      const ctx = I.ctx; ctx.save(); ctx.translate(spot[0], spot[1]); ctx.rotate(-.06);
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.ellipse(0, 0, R * .2 * spot[2] + R * .05, R * .1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = CORAL; ctx.beginPath(); ctx.ellipse(0, 0, R * .16 * spot[2] + R * .04, R * .075, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b9472f'; ctx.beginPath(); ctx.ellipse(R * .01, 0, R * .09 * spot[2] + R * .02, R * .04, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    night(I, G, b, 1.9);
  });
}

export function drawSaturn(I, w) {
  const C = w.SATURN, R = w.SAR, l = w.light(C), roll = -.32, tilt = .42;
  const G = globe(C, R, l, { roll, tilt }), b = bx(C, R);
  const ctx = I.ctx;
  // the rings, in the equatorial plane: back half first, the planet, then the front half
  const bands = [[1.24, 1.52, .35, SAND], [1.53, 1.95, .95, CREAM], [1.95, 2.03, 0, null], [2.03, 2.27, .75, SAND]];
  const ringPath = (r, front) => { const p = []; for (let i = 0; i <= 160; i++) { const q = G.fwd(i / 160 * TAU, 0, r); if ((q[2] >= 0) === front) p.push(q); else if (p.length && p[p.length - 1] !== null) p.push(null); } return p; };
  const drawRings = front => {
    for (const [r0, r1, a, col] of bands) {
      if (!col) continue;
      for (let r = r0; r < r1; r += .035) {
        ctx.strokeStyle = col; ctx.globalAlpha = a * (.75 + .25 * Math.sin(r * 60)); ctx.lineWidth = I.lw(R * .03);
        ctx.beginPath(); let pen = false;
        for (const q of ringPath(r, front)) { if (!q) { pen = false; continue; } pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };
  drawRings(false);
  I.disc(C, R, SAND);
  I.within(c => c.arc(C[0], C[1], R, 0, TAU), () => {
    I.halftone(b, (x, y) => { const s = G.inv(x, y); return s ? Math.max(0, Math.cos(s.lat * 57.3 / 11 * Math.PI)) * .45 + smooth(50, 75, Math.abs(s.lat * 57.3)) * .4 : 0; }, { cell: 1.7, angle: .3, color: '#c79a52', max: .8 });
    // the rings' shadow across the globe
    I.halftone(b, (x, y) => { const s = G.inv(x, y); return s && s.lat < 0 && s.lat > -.42 ? .55 * smooth(-.42, -.3, s.lat) * smooth(0, -.08, s.lat) : 0; }, { cell: 1.7, angle: .9, color: NIGHT, max: .7 });
    night(I, G, b, 1.7);
  });
  drawRings(true);
  void YELLOW; void clamp;
}

export function drawUranus(I, w) {
  const C = w.URANUS, R = w.UR, l = w.light(C), G = globe(C, R, l, { roll: 1.45, tilt: .2 }), b = bx(C, R);
  const ctx = I.ctx;
  // faint rings, nearly face-on round its tipped-over axis
  ctx.strokeStyle = CREAM; ctx.lineWidth = I.lw(R * .02); ctx.globalAlpha = .4;
  for (const r of [1.6, 1.75, 2.0]) { ctx.beginPath(); for (let i = 0; i <= 120; i++) { const q = G.fwd(i / 120 * TAU, 0, r); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
  ctx.globalAlpha = 1;
  I.disc(C, R, SKY);
  I.within(c => c.arc(C[0], C[1], R, 0, TAU), () => {
    I.halftone(b, (x, y) => { const s = G.inv(x, y); return s ? smooth(.6, 1, s.r) * .45 : 0; }, { cell: 1.6, angle: .5, color: SEA, max: .6 });
    night(I, G, b, 1.6);
  });
  void NAVY;
}

// Stop 3, Earth with the Orbital Ring: a thin bright ring 300 km up (1.047 Earth radii, so it
// hugs the planet), with cables down to the sea. The globe is true: Natural Earth coastlines,
// turned to the Indian Ocean, where the ride starts (the Maldives, on the equator).
import { TAU, PI, clamp, smooth, fbm, mulberry32, vnoise } from './math.js';
import { INK } from './world.js';
import { spark } from './ink.js';
import { makeCanvas } from './tone.js';

const { NAVY, CREAM, YELLOW, CERISE, TEAL, OCEAN, SAND, OLIVE, AMBER, SLATE } = INK;
const NIGHT = '#0a1022';   // darker than the sky, so the night side reads as a silhouette
const D = PI / 180;

// The land mask: equirectangular, 1024 × 512, grey 0..255 (255 = land).
let maskP = null;
export function landMask() {
  if (!maskP) maskP = (async () => {
    const res = await fetch(new URL('./data/land-1024.png', import.meta.url));
    const bmp = await createImageBitmap(await res.blob());
    const c = makeCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data, W = bmp.width, H = bmp.height, a = new Float32Array(W * H);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
    return (lon, lat) => {   // radians → 0..1, bilinear
      let fx = ((lon / TAU + .5) % 1 + 1) % 1 * W - .5, fy = (.5 - lat / PI) * H - .5;
      if (fy < 0) fy = 0; else if (fy > H - 1.001) fy = H - 1.001;
      const ix = Math.floor(fx), iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const x0 = (ix + W) % W, x1 = (ix + 1) % W, q0 = iy * W, q1 = q0 + W;
      const p = a[q0 + x0] + (a[q0 + x1] - a[q0 + x0]) * tx, r = a[q1 + x0] + (a[q1 + x1] - a[q1 + x0]) * tx;
      return p + (r - p) * ty;
    };
  })();
  return maskP;
}

// The globe's pose: view centre longitude/latitude, the axis's roll on screen.
export function earthGeo(w) {
  const E = w.EARTH, R = w.ER, l = w.light(E), land = w.mode === 'landscape';
  const lon0 = 68 * D, lat0 = 13 * D, roll = land ? -.36 : -.3;
  const cr = Math.cos(roll), sr = Math.sin(roll), cl = Math.cos(lat0), sl = Math.sin(lat0);
  // sunlight in view coordinates (x right, y up, z toward us): from the Sun, a little in front
  const sv = [l[0], -l[1], .32], sn = Math.hypot(...sv), sun = sv.map(v => v / sn);
  // screen (x, y) → { lon, lat, n (view normal) } or null off the disc
  const inv = (x, y) => {
    const X = (x - E[0]) / R, Y = (y - E[1]) / R, rr = X * X + Y * Y; if (rr >= 1) return null;
    const u = X * cr + Y * sr, v = -(-X * sr + Y * cr), z = Math.sqrt(1 - rr);   // un-roll; v up
    // un-tilt by lat0 about the x axis: view → globe frame with the centre at (lon0, 0)
    const gy = v * cl + z * sl, gz = -v * sl + z * cl;
    return { lat: Math.asin(clamp(gy, -1, 1)), lon: lon0 + Math.atan2(u, gz), n: [X, -Y, z] };
  };
  // globe point (lon, lat, radius) → screen [x, y, z]
  const fwd = (lon, lat, r = 1) => {
    const gx = Math.cos(lat) * Math.sin(lon - lon0), gy = Math.sin(lat), gz = Math.cos(lat) * Math.cos(lon - lon0);
    const v = gy * cl - gz * sl, z = gy * sl + gz * cl, u = gx;
    const X = u * cr + v * sr, Yup = -u * sr + v * cr;    // re-roll (v up)
    return [E[0] + X * R * r, E[1] - Yup * R * r, z];
  };
  const day = n => n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
  return { E, R, l, inv, fwd, day, sun };
}

const cloudAt = (lon, lat) => {
  const L = lat / D;
  // bands: the tropics' rain belt, clear subtropics, stormy mid-latitudes
  const band = .55 * Math.exp(-(((L - 6) / 7) ** 2)) + .6 * smooth(30, 52, Math.abs(L)) * (1 - .4 * smooth(70, 85, Math.abs(L))) + .12;
  const wx = fbm(lon * 2 + 7, lat * 3.4, 41, 3) * 2, wy = fbm(lon * 2 + 2, lat * 3.4 + 9, 43, 3) * 1.3;
  const n = fbm(lon * 4.4 + wx, lat * 7.5 + wy, 47, 5);
  return smooth(.6 - band * .26, .8 - band * .22, n);
};

export async function drawEarth(I, w) {
  const g = earthGeo(w), { ctx } = I, { E, R, inv, fwd, day } = g;
  const land = await landMask();
  const box = [E[0] - R - 2, E[1] - R - 2, E[0] + R + 2, E[1] + R + 2];
  const body = c => c.arc(E[0], E[1], R, 0, TAU);
  // memo the inverse projection per halftone cell lookups is cheap enough; keep it simple

  // ── the Orbital Ring's far side, where it shows past the limb ──
  const ringPts = [];
  for (let i = 0; i <= 720; i++) ringPts.push(fwd(i / 720 * TAU, 0, 1.047));
  const ringPath = (part) => {   // part: 1 front (z ≥ 0), -1 back
    const runs = []; let run = null;
    for (const p of ringPts) { const on = part > 0 ? p[2] >= 0 : p[2] < 0; if (on) { if (!run) runs.push(run = []); run.push(p); } else run = null; }
    return runs;
  };
  const strokeRuns = (runs, color, wdt, a) => { ctx.strokeStyle = color; ctx.lineWidth = I.lw(wdt); ctx.globalAlpha = a; ctx.beginPath(); for (const r of runs) { ctx.moveTo(r[0][0], r[0][1]); for (const p of r) ctx.lineTo(p[0], p[1]); } ctx.stroke(); ctx.globalAlpha = 1; };
  ctx.save();
  ctx.beginPath(); ctx.rect(box[0] - R, box[1] - R, R * 5, R * 5); body(ctx); ctx.clip('evenodd');
  strokeRuns(ringPath(-1), CERISE, R * .009, .85);
  strokeRuns(ringPath(-1), CREAM, R * .004, .75);
  ctx.restore();

  // ── atmosphere: a breath of teal dots beyond the lit limb ──
  I.halftone([E[0] - R * 1.08, E[1] - R * 1.08, E[0] + R * 1.08, E[1] + R * 1.08], (x, y) => {
    const d = Math.hypot(x - E[0], y - E[1]) / R; if (d < 1) return 0;
    const n = [(x - E[0]) / R / d, -(y - E[1]) / R / d, 0], dl = day(n);
    return Math.pow(clamp(1 - (d - 1) / .045), 1.5) * smooth(-.25, .5, dl) * .7;
  }, { cell: 2, angle: .4, color: TEAL, max: .8 });

  // ── the globe ──
  I.disc(E, R, OCEAN);
  I.within(body, () => {
    // ocean: teal where the sunlight falls, with a glint where the Sun reflects
    I.halftone(box, (x, y) => {
      const s = inv(x, y); if (!s) return 0;
      const dl = day(s.n); if (dl <= 0) return 0;
      const glint = Math.pow(Math.max(0, s.n[0] * g.sun[0] * .5 + s.n[1] * g.sun[1] * .5 + s.n[2] * .85 + .05), 26);
      return Math.pow(dl, .9) * .5 + glint * .5;
    }, { cell: 2.3, angle: .9, color: TEAL, max: .85 });
    // land, flat sand with a crisp coastline; green where it rains
    const landA = (x, y) => { const s = inv(x, y); return s ? smooth(.42, .58, land(s.lon, s.lat)) : 0; };
    I.raster(box, landA, SAND);
    I.within(c => body(c), () => {
      I.halftone(box, (x, y) => {
        const s = inv(x, y); if (!s) return 0;
        const L = Math.abs(s.lat / D), wet = Math.exp(-(((s.lat / D - 4) / 13) ** 2)) + .55 * smooth(38, 52, L) * (1 - smooth(62, 70, L));
        return landA(x, y) * clamp(wet * (.7 + .55 * fbm(s.lon * 5, s.lat * 5, 61, 3)) - .05) * .95;
      }, { cell: 2.1, angle: .3, color: OLIVE, max: .9 });
    });
    // ice: the polar caps and Greenland
    I.raster(box, (x, y) => { const s = inv(x, y); if (!s) return 0; const L = s.lat / D; return smooth(-62, -66, L) + smooth(77, 82, L) * .9 + (smooth(66, 70, L) * smooth(.42, .58, land(s.lon, s.lat))); }, CREAM);
    // clouds
    I.halftone(box, (x, y) => {
      const s = inv(x, y); if (!s) return 0;
      return cloudAt(s.lon, s.lat) * .95;
    }, { cell: 2.1, angle: .15, color: CREAM, max: 1, shape: 1.15 });
    // night: a deep navy screen past the terminator, and the cities' lights
    I.halftone(box, (x, y) => {
      const s = inv(x, y); if (!s) return 0;
      const dl = day(s.n), r = Math.hypot(s.n[0], s.n[1]);
      return smooth(.16, -.2, dl) * .97 + smooth(.82, 1, r) * .25 * smooth(.3, -.1, dl);
    }, { cell: 2.3, angle: .6, color: NIGHT, max: 1, shape: 1.3 });
    const lights = [], rr = mulberry32(5);
    for (let i = 0; i < 9000; i++) {
      const x = E[0] + (rr() * 2 - 1) * R, y = E[1] + (rr() * 2 - 1) * R, s = inv(x, y); if (!s) continue;
      if (day(s.n) > -.06) continue;
      const lv = land(s.lon, s.lat); if (lv < .5) continue;
      const pop = fbm(s.lon * 9, s.lat * 9, 71, 3) * (1 - smooth(55, 70, Math.abs(s.lat / D)));
      if (pop < .52) continue;
      lights.push([x, y, R * (.0028 + .006 * smooth(.52, .8, pop) * rr())]);
    }
    I.dots(lights, AMBER, .9);
  });
  // the lit limb: a crisp hairline of cream-teal
  ctx.save(); ctx.lineCap = 'round';
  const sa = Math.atan2(-g.sun[1], g.sun[0]);
  ctx.strokeStyle = '#bfe9ea'; ctx.lineWidth = I.lw(R * .006); ctx.globalAlpha = .85;
  ctx.beginPath(); ctx.arc(E[0], E[1], R - R * .003, sa - 1.35, sa + 1.35); ctx.stroke();
  ctx.strokeStyle = TEAL; ctx.lineWidth = I.lw(R * .004); ctx.globalAlpha = .35;
  ctx.beginPath(); ctx.arc(E[0], E[1], R - R * .002, sa + 1.35, sa + TAU - 1.35); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;

  // ── the ring's near side, over the globe: cerise sheath, cream ring, cables to the sea ──
  const front = ringPath(1);
  strokeRuns(front, NIGHT, R * .022, .4);
  strokeRuns(front, CERISE, R * .013, 1);
  strokeRuns(front, CREAM, R * .0055, 1);
  // cables every 7.5° of longitude on the near side; stations every 30°
  ctx.strokeStyle = CREAM; ctx.lineWidth = I.lw(R * .0016); ctx.globalAlpha = .85; ctx.beginPath();
  for (let lon = 0; lon < 360; lon += 7.5) {
    const a = fwd(lon * D, 0, 1.047), b = fwd(lon * D, 0, 1.0);
    if (a[2] < .05) continue;
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  for (let lon = 0; lon < 360; lon += 30) {
    const a = fwd(lon * D, 0, 1.047); if (a[2] < .05) continue;
    const b = fwd(lon * D + .02, 0, 1.047), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
    ctx.fillStyle = CREAM; ctx.fillRect(-R * .016, -R * .009, R * .032, R * .018);
    ctx.fillStyle = CERISE; ctx.fillRect(-R * .005, -R * .009, R * .01, R * .018);
    ctx.restore();
  }

  // ── the Moon ──
  const M = w.MOON, MR = w.MOR, ml = w.light(M);
  I.disc(M, MR, CREAM);
  I.within(c => c.arc(M[0], M[1], MR, 0, TAU), () => {
    const mb = [M[0] - MR, M[1] - MR, M[0] + MR, M[1] + MR];
    I.halftone(mb, (x, y) => {   // maria
      const u = (x - M[0]) / MR, v = (y - M[1]) / MR;
      return smooth(.5, .62, fbm(u * 2.2 + 3, v * 2.2 + 1, 81, 4)) * .55;
    }, { cell: 1.8, angle: .5, color: SLATE, max: .7 });
    I.halftone(mb, (x, y) => {
      const u = (x - M[0]) / MR, v = (y - M[1]) / MR, dl = -(u * ml[0] + v * ml[1]);
      return smooth(-.1, .35, dl) * .95;
    }, { cell: 1.8, angle: .9, color: NAVY, max: 1, shape: 1.3 });
  });
  void YELLOW; void vnoise;
}

// what moves: cars running along the near side of the ring, a lift climbing a cable, lights
export function drawEarthLive(ctx, w, t, k) {
  const g = earthGeo(w), { R, fwd } = g;
  for (let i = 0; i < 14; i++) {
    const lon = ((i / 14) * 360 + t * (i % 2 ? 1.6 : -1.1)) % 360 * D;
    const p = fwd(lon, 0, 1.047); if (p[2] < .08) continue;
    const lit = g.day([(p[0] - g.E[0]) / R, -(p[1] - g.E[1]) / R, p[2]]);
    ctx.fillStyle = lit > 0 ? '#fff6df' : AMBER; ctx.globalAlpha = .55 + .45 * p[2];
    const s = Math.max(R * .006, 1.1 / k); ctx.fillRect(p[0] - s, p[1] - s * .6, s * 2, s * 1.2);
  }
  ctx.globalAlpha = 1;
  // a lift car riding up one cable near the centre of the face, then down again
  const lon = 75 * D, a = fwd(lon, 0, 1.0), b = fwd(lon, 0, 1.047), f = .5 - .5 * Math.cos(t / 9 * PI);
  const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  ctx.fillStyle = CERISE; const s = Math.max(R * .005, 1 / k); ctx.fillRect(p[0] - s, p[1] - s, s * 2, s * 2);
  spark(ctx, p[0], p[1], R * .03, .5 + .5 * Math.sin(t * 2));
}

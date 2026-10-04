/*
 * THE ORBITAL RING: the ride.
 * A car climbs a cable from a platform in the Pacific off San Francisco to a station hanging
 * from an orbital ring 300 km up (after Paul Birch, 1982). The ring is tilted 37.45° to the
 * equator, so it passes over the platform at its northernmost point.
 * This file holds the ride's timing, the Sun's clock, the camera, the controls and
 * the notes. The renderer is in renderer.js; the shaders are in shaders.js.
 */
import { createRenderer } from './renderer.js';
import { createLabels } from './labels.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

/* ---------------------------------------------------------------- the ride */
export const RG = 6371.0;           // km
export const RING_ALT = 300.0;      // km: one of Birch's two worked examples (300 and 600 km)
const EYE0 = 0.0215;                // eye height above the sea on the platform, km (car floor on the 20 m deck)
const EYE_DOCK = RING_ALT - 0.0925; // eye height when docked under the station, km
const CLIMB = (EYE_DOCK - EYE0) * 1000; // m
const A_UP = 1.0;                   // m/s^2: Birch's "gentle ride" for passengers
const A_DN = 3.0;                   // m/s^2: braking for the last quarter (my choice)
const H1 = CLIMB * A_DN / (A_UP + A_DN);      // where braking starts (m above the platform)
const T1 = Math.sqrt(2 * H1 / A_UP);          // s
const V1 = A_UP * T1;                         // top speed, m/s
const T2 = V1 / A_DN;
export const T_RIDE = T1 + T2;                // about 894 s: just under 15 minutes
const CAR_OFF = [0.00045, -0.00256];   // the car's eye from the cable, km: the cable is 2.6 m away, just west of north

function rideAt(t) {
  t = clamp(t, 0, T_RIDE);
  let y, v, a;
  if (t < T1) { y = .5 * A_UP * t * t; v = A_UP * t; a = A_UP; }
  else { const s = t - T1; y = H1 + V1 * s - .5 * A_DN * s * s; v = V1 - A_DN * s; a = -A_DN; }
  if (t >= T_RIDE) { y = CLIMB; v = 0; a = 0; }
  return { alt: EYE0 + y / 1000, v, a };
}
function timeForAlt(altKm) {
  const y = clamp((altKm - EYE0) * 1000, 0, CLIMB);
  if (y <= H1) return Math.sqrt(2 * y / A_UP);
  const rem = CLIMB - y; return T_RIDE - Math.sqrt(2 * rem / A_DN);
}
/* air pressure as a fraction of sea level (US Standard Atmosphere, interpolated in log) */
const PRESS = [[0, 1], [5, .533], [10, .261], [15, .119], [20, .0540], [25, .0251], [30, .0118], [40, .00283], [50, .000787], [60, .000217], [70, .0000516], [80, .0000104], [90, .00000180], [100, .00000032], [150, .0000000045], [200, .00000000085], [300, .00000000009]];
function pressure(h) {
  if (h <= 0) return 1;
  for (let i = 1; i < PRESS.length; i++) if (h <= PRESS[i][0]) {
    const [h0, p0] = PRESS[i - 1], [h1, p1] = PRESS[i];
    return Math.exp(lerp(Math.log(p0), Math.log(p1), (h - h0) / (h1 - h0)));
  }
  return PRESS[PRESS.length - 1][1];
}
const gAt = h => 9.80665 * Math.pow(RG / (RG + h), 2);

/* ------------------------------------------------------------ the Sun's clock */
function dayOfYear(d) { const s = Date.UTC(d.getUTCFullYear(), 0, 0); return (d - s) / 864e5; }
function declination(doy) { return -23.44 * D2R * Math.cos(2 * Math.PI / 365 * (doy + 10)); }
/* ------------------------------------------------- where the ring runs */
/* The first platform floats in the Pacific about 30 km off Half Moon Bay, California. The ring
   is a great circle tilted to the equator by the platform's latitude, passing over it at its
   northernmost point: there it runs due east and west, and its tilt equals the latitude.
   Frames: X along the ring (east at the platform), Y up, Z the ring's axis (north at the
   platform). Ring coordinates are longitude and latitude in that frame (see bake_geography.py). */
const LAT0 = 37.45, LON = -122.85, INCL = LAT0;
const ecef = (lat, lon) => { const a = lat * D2R, o = lon * D2R; return [Math.cos(a) * Math.cos(o), Math.cos(a) * Math.sin(o), Math.sin(a)]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const RU = ecef(LAT0, LON), RE = [-Math.sin(LON * D2R), Math.cos(LON * D2R), 0];
const RN = [RU[1] * RE[2] - RU[2] * RE[1], RU[2] * RE[0] - RU[0] * RE[2], RU[0] * RE[1] - RU[1] * RE[0]];
/* ring longitude (deg, east along the ring from the platform) and ring latitude -> geographic */
export function ringToGeo(a, b = 0) {
  const ca = Math.cos(a * D2R), sa = Math.sin(a * D2R), cb = Math.cos(b * D2R), sb = Math.sin(b * D2R);
  const g = [0, 1, 2].map(i => cb * sa * RE[i] + cb * ca * RU[i] + sb * RN[i]);
  return { lat: Math.asin(Math.max(-1, Math.min(1, g[2]))) / D2R, lon: Math.atan2(g[1], g[0]) / D2R };
}
/* a point at (lat, lon, height km) in station K's frame, km from the Earth's centre */
export function geoToFrame(lat, lon, h, K) {
  const g = ecef(lat, lon), r = RG + h;
  const x = dot3(g, RE) * r, y = dot3(g, RU) * r, z = dot3(g, RN) * r;
  const th = K * 15 * D2R, c = Math.cos(th), s = Math.sin(th);
  return [x * c - y * s, x * s + y * c, z];
}
const DEPARTURES = {
  dawn: { label: 'Dawn', elev: -7, morning: true },
  day: { label: 'Midday', hour: 10.9 },
  dusk: { label: 'Dusk', elev: -4, morning: false },
  night: { label: 'Night', hour: 22.6 },
  now: { label: 'Now' },
};
function departureHourAngle(key, dec, now = new Date(), lat = LAT0) {
  const d = DEPARTURES[key];
  if (key === 'now') {
    const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const solar = (utcH + LON / 15 + 24) % 24;
    return (solar - 12) * 15 * D2R;
  }
  if (d.hour != null) return (d.hour - 12) * 15 * D2R;
  const p = lat * D2R;
  const c = clamp((Math.sin(d.elev * D2R) - Math.sin(p) * Math.sin(dec)) / (Math.cos(p) * Math.cos(dec)), -1, 1);
  const H = Math.acos(c);
  return d.morning ? -H : H;
}
/* the Sun in station K's frame: hour angle H at the platform, declination dec */
function sunDir(H, dec, K = 0) {
  const d0 = -Math.sin(H) * Math.cos(dec), d1 = Math.cos(H) * Math.cos(dec), d2 = Math.sin(dec);
  const cp = Math.cos(LAT0 * D2R), sp = Math.sin(LAT0 * D2R);
  const x = d0, y = d1 * cp + d2 * sp, z = -d1 * sp + d2 * cp;     /* equator -> the platform's frame */
  const th = K * 15 * D2R, c = Math.cos(th), s = Math.sin(th);
  return [x * c - y * s, x * s + y * c, z];
}
/* the sky's rotation: station K's frame -> the frame the stars are fixed in */
function starMatrix(H, K, doy) {
  const a = -(H + doy / 365 * 2 * Math.PI), ca = Math.cos(a), sa = Math.sin(a);
  const cp = Math.cos(LAT0 * D2R), sp = Math.sin(LAT0 * D2R);
  const th = -K * 15 * D2R, ct = Math.cos(th), st = Math.sin(th);
  const Rz = (c, s) => [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  const At = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const M = mul(mul(Rz(ca, sa), At), Rz(ct, st));
  return new Float32Array([M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]]);
}
function solarClock(H) { let h = 12 + H / (15 * D2R); h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }

/* --------------------------------------------------------------- camera maths */
/* tilt: the local vertical leans east by this angle (the pod partway round the ring) */
function dirFrom(yaw, pitch, tilt = 0) {
  const cp = Math.cos(pitch), e = cp * Math.sin(yaw), u = Math.sin(pitch), n = cp * Math.cos(yaw);
  const c = Math.cos(tilt), s = Math.sin(tilt);
  return [e * c + u * s, -e * s + u * c, n];
}
function norm(a) { const l = Math.hypot(...a) || 1; return a.map(x => x / l); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
/* World axes are X east, Y up, Z north (a left-handed set), so "right" is up x forward. */
function viewMatrix(yaw, pitch, tilt = 0) {
  const up = [Math.sin(tilt), Math.cos(tilt), 0];
  const f = dirFrom(yaw, pitch, tilt); const r = norm(cross(up, f)); const u = cross(f, r);
  return new Float32Array([r[0], r[1], r[2], u[0], u[1], u[2], -f[0], -f[1], -f[2]]);
}
function project(dir, yaw, pitch, tanHalf, tilt = 0) {
  const up = [Math.sin(tilt), Math.cos(tilt), 0];
  const f = dirFrom(yaw, pitch, tilt); const r = norm(cross(up, f)); const u = cross(f, r);
  const z = dir[0] * f[0] + dir[1] * f[1] + dir[2] * f[2]; if (z <= 0) return null;
  const x = (dir[0] * r[0] + dir[1] * r[1] + dir[2] * r[2]) / z / tanHalf[0];
  const y = (dir[0] * u[0] + dir[1] * u[1] + dir[2] * u[2]) / z / tanHalf[1];
  return [x * .5 + .5, y * .5 + .5];
}

/* Where the camera looks when the visitor isn't steering: one composed view per stretch. */
const AUTO = {
  // [altitude km, bearing deg, pitch deg]
  dawn: [[0, 80, 9], [0.4, 78, 6], [2.2, 78, -4], [8, 84, -7], [25, 92, -6], [60, 96, -10], [140, 86, -16], [240, 80, -14], [290, 78, -10], [294, 20, 86], [299.6, 0, 88]],
  day: [[0, 160, 10], [0.4, 150, 4], [3, 140, -8], [20, 120, -10], [60, 110, -16], [160, 90, -22], [250, 80, -14], [290, 70, -10], [294, 20, 86], [299.6, 0, 88]],
  dusk: [[0, 278, 8], [0.4, 276, 4], [3, 274, -5], [25, 268, -6], [60, 264, -10], [160, 280, -18], [250, 285, -12], [290, 290, -10], [294, 340, 86], [299.6, 0, 88]],
  night: [[0, 64, 26], [0.4, 66, 20], [3, 70, 4], [20, 40, -8], [80, 10, -12], [200, 350, -18], [260, 345, -10], [290, 340, -10], [294, 350, 86], [299.6, 0, 88]],
};
function autoLook(dep, alt) {
  const k = AUTO[dep] || AUTO.dawn;
  const la = Math.log(alt + 1);
  for (let i = 1; i < k.length; i++) {
    if (alt <= k[i][0] || i === k.length - 1) {
      const a = k[i - 1], b = k[i]; const t = smooth(Math.log(a[0] + 1), Math.log(b[0] + 1), la);
      let db = ((b[1] - a[1] + 540) % 360) - 180;
      return [(a[1] + db * t) * D2R, lerp(a[2], b[2], t) * D2R];
    }
  }
  return [k[0][1] * D2R, k[0][2] * D2R];
}

/* ------------------------------------------------- stations round the ring */
/* One station every 15 degrees round the ring, each with a cable to the surface. Station 0 is
   the first platform. Whether each cable lands on water is measured from Natural Earth (see
   bake_geography.py, which also prints where they stand). */
const STEP = 15 * Math.PI / 180;
const STATIONS = [
  ['the Pacific off Half Moon Bay, California', 1], ['the high plains of northeastern New Mexico', 0],
  ['southern Alabama', 0], ['the Atlantic, north of the Turks and Caicos', 1],
  ['the Atlantic, east of the Leeward Islands', 1], ['the tropical Atlantic', 1], ['the equatorial Atlantic', 1],
  ['the South Atlantic, west of Ascension Island', 1], ['the South Atlantic, near St Helena', 1],
  ['the South Atlantic, west of Namibia', 1], ['the Great Karoo, South Africa', 0],
  ['the southwest Indian Ocean', 1], ['the southern Indian Ocean', 1],
  ['the Indian Ocean, near Amsterdam Island', 1], ['the eastern Indian Ocean', 1],
  ['the Indian Ocean off Western Australia', 1], ['the Kimberley coast, Western Australia', 0],
  ['the Arafura Sea, south of New Guinea', 1], ['the Pacific, north of the Admiralty Islands', 1],
  ['the western Pacific, west of the Marshall Islands', 1], ['the central Pacific', 1],
  ['the Pacific, near the Northwestern Hawaiian Islands', 1], ['the Pacific, north of Hawaii', 1],
  ['the northeast Pacific', 1],
];
const stationOf = k => STATIONS[((k % 24) + 24) % 24];
const wrap180 = l => ((l + 180) % 360 + 360) % 360 - 180;
const ringLonOf = k => wrap180(15 * k);
const geoOf = (k, alpha = 0) => ringToGeo(15 * k + alpha / D2R);
const fmtLon = l => Math.abs(l).toFixed(1) + '°' + (l >= 0 ? 'E' : 'W');
const fmtLat = l => Math.abs(l).toFixed(1) + '°' + (l >= 0 ? 'N' : 'S');
const fmtPlace = g => fmtLat(g.lat) + ' ' + fmtLon(g.lon);
export { STATIONS };

/* The opening shot on the platform, in real seconds: [t, bearing, pitch, lens] */
const PLATFORM_LOOK = [[0, 80, 7, 1.35], [3.5, 86, 7, 1.35], [8, 90, 60, 1.42], [10.5, 90, 86, 1.42], [12.3, 90, 86, 1.42], [14.5, 80, 9, 1.32]];
function platformLook(t) {
  const k = PLATFORM_LOOK;
  for (let i = 1; i < k.length; i++) if (t <= k[i][0] || i === k.length - 1) {
    const a = k[i - 1], b = k[i]; const u = smooth(a[0], b[0], t);
    return [lerp(a[1], b[1], u) * D2R, lerp(a[2], b[2], u) * D2R, lerp(a[3], b[3], u)];
  }
}
/* The first look round the gallery, in real seconds: east along the ring, up over your
   head where it passes, down to the west where it runs on, and back. [t, bearing, pitch] */
const GALLERY_LOOK = [[0, 96, -15], [4.5, 94, -12], [8.5, 96, 48], [13, 250, 8], [17, 250, 4], [21, 200, -62], [25, 100, -14]];
function galleryLook(t) {
  const k = GALLERY_LOOK;
  for (let i = 1; i < k.length; i++) if (t <= k[i][0] || i === k.length - 1) {
    const a = k[i - 1], b = k[i]; const u = smooth(a[0], b[0], t);
    return [lerp(a[1], b[1], u) * D2R, lerp(a[2], b[2], u) * D2R];
  }
}
const GALLERY_NOTES = [
  [1, 'This is the ring. East, it runs down to the horizon and on round the world.'],
  [11, 'Behind you is the station you came up to. Its cable hangs underneath.'],
  [18.5, 'Straight down: 300 km of air, then the sea. Travel along the ring, or ride any cable down.'],
];
const OPENING_FIRST = {
  dawn: 'That thin line rising from the horizon is the ring, 300 km up.',
  dusk: 'That thin line rising from the horizon is the ring, 300 km up, still in sunlight.',
  night: 'That line of lights rising from the horizon is the ring, 300 km up.',
  day: 'That faint thread up from the horizon is the ring, 300 km up. It is easier to see at dawn.',
  now: 'The ring rises from the eastern horizon, 300 km up.',
};
const OPENING = [
  [.8, null],
  [6.8, 'Follow it up. It crosses the whole sky, and goes all the way round the Earth.'],
  [10.6, 'Our cable hangs from the station straight overhead. Fifteen minutes to the top.'],
];

/* ------------------------------------------------------------------- notes */
const NOTES = [
  { alt: 0, key: 'start' },
  { alt: 0.7, text: 'Cloud base: the cumulus start at about 700 m today.' },
  { alt: 3.6, text: 'Above the low clouds.' },
  { alt: 8.85, text: 'As high as Everest. You are doing about 130 m/s.' },
  { alt: 12, text: 'Above the weather. At this latitude it ends at about 12 km.' },
  { alt: 25, text: 'The ozone layer. Most of it is around here.' },
  { alt: 50, text: 'The sky has stopped being blue.' },
  { alt: 80, text: 'Shooting stars burn up around this height.' },
  { alt: 100, text: 'The Kármán line. By one definition, this is space.' },
  { alt: 0.001 * H1 + EYE0, text: 'Braking now. For the next four minutes you weigh about 60% of normal.' },
  { alt: 285, text: 'The station is overhead. Look up through the roof window.' },
];

/* ======================================================================= app */
/* The shaders take a few seconds to compile on Windows. When the visitor reaches for the Board
   button (hover, focus or touch), the context is made and compiling starts in the background,
   so by the click part of the wait is already over. Nothing is drawn until start(). */
let early = null;
export function prepare() {
  if (early) return;
  try { early = createRenderer($('ride'), { base: './', preserve: new URLSearchParams(location.search).has('freeze') }); }
  catch (e) { early = null; }
}

export async function start(env = {}) {
  const q = new URLSearchParams(location.search);
  const test = q.has('freeze');
  const reduce = env.reducedMotion || q.get('rm') === '1';
  const canvas = $('ride');
  const ui = env.ui || {};
  const boot = env.boot || (() => {});

  let R;
  try {
    R = early || createRenderer(canvas, { base: './', preserve: test });
    await R.build((p, label) => boot(p, label));
    R.startHigh();
  } catch (e) {
    console.error(e);
    env.fail && env.fail(e);
    return;
  }

  const labels = createLabels($('labels'), geoToFrame);

  /* ---------- state ---------- */
  const now = new Date();
  const doy = q.has('doy') ? +q.get('doy') : dayOfYear(now);
  const dec = declination(doy);
  const S = {
    dep: DEPARTURES[env.departure] ? env.departure : DEPARTURES[q.get('dep')] ? q.get('dep') : 'dawn',
    clock: 0,              // simulated seconds since the visitor boarded
    departAt: 10,          // simulated clock reference for the departure hour
    K: 0,                  // which station's frame we are in (0 = the first platform)
    alpha: 0,              // the pod's angle east of station K, radians
    travelV: 0, travelTarget: 0,   // pod speed along the ring, m/s (east positive)
    platformReal: 0,       // real seconds since boarding (the opening shot runs on real time)
    galleryReal: 99,       // real seconds since stepping into the gallery
    departReal: 14,        // the car leaves after this many real seconds, unless you press Depart
    rideT: 0,              // seconds into the climb
    dir: 1,                // 1 up, -1 down
    phase: 'platform',     // platform | climb | docked | gallery
    speedK: 5, paused: false,
    yaw: 0, pitch: 0, auto: true, fovScale: 1,
    hidden: false, quality: q.get('q') || 'auto', scale: 1,
    frame: 0, anim: 0, lastHud: 0, noteIdx: 0, galleryAt: 0, dockFade: 0,
  };
  const DAYRATE = 2 * Math.PI / 86400;
  let H0 = departureHourAngle(S.dep, dec, now) - S.departAt * DAYRATE;
  if (reduce) { S.paused = true; S.departReal = Infinity; }
  if (q.has('pt')) S.platformReal = +q.get('pt');

  /* test hooks */
  if (q.has('alt')) {
    const a = +q.get('alt');
    S.phase = a <= EYE0 + 1e-6 ? 'platform' : 'climb';
    S.rideT = timeForAlt(a); S.clock = S.departAt + S.rideT;
    if (a >= EYE_DOCK - 1e-4) { S.phase = 'docked'; }
  }
  if (q.get('gallery') === '1') { S.phase = 'gallery'; S.rideT = T_RIDE; S.clock = S.departAt + T_RIDE + 20; }
  if (q.has('K')) S.K = +q.get('K');
  if (q.has('gt')) S.galleryReal = +q.get('gt');
  if (q.has('al')) S.alpha = +q.get('al') * D2R;
  if (q.has('tv')) S.travelV = S.travelTarget = +q.get('tv');
  if (q.has('clock')) S.clock = +q.get('clock');
  if (q.has('fov')) S.fovScale = +q.get('fov');
  if (q.has('yaw')) { S.auto = false; S.yaw = +q.get('yaw') * D2R; S.pitch = +(q.get('pitch') || 0) * D2R; }

  /* ---------- sizing ---------- */
  const dprCap = () => S.quality === 'high' ? 2 : S.quality === 'low' ? .75 : S.quality === 'medium' ? 1 : 1.25;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap());
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    canvas.width = w; canvas.height = h;
    const sc = q.has('scale') ? +q.get('scale') : S.scale;
    R.resize(Math.round(w * sc), Math.round(h * sc));
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- per-frame state for the renderer ---------- */
  function worldState() {
    const ride = rideAt(S.rideT);
    let alt = S.phase === 'platform' ? EYE0 : ride.alt;
    /* the hour angle where the frame is anchored: each station east is an hour later */
    const H = H0 + S.clock * DAYRATE;              /* the hour angle at the first platform */
    const sun = sunDir(H, dec, S.K);
    let camE, mode = 0, tilt = 0;
    if (S.phase === 'gallery') {
      mode = 1;
      /* the observation pod: 180 m east of the station on a boom, 30 m north of the ring and 42 m below it */
      tilt = S.alpha + 0.180 / (RG + RING_ALT);
      const r = RG + RING_ALT - 0.0420;
      camE = [r * Math.sin(tilt), r * Math.cos(tilt), 0.030];
    } else {
      camE = [CAR_OFF[0], RG + alt, CAR_OFF[1]];
    }
    const camM = camE.map(v => v * 1000);
    const C = camM.map(v => -v);
    const rho = Math.hypot(C[0], C[1]);
    const ringU0 = rho - (RG + RING_ALT) * 1000;
    const station = [0 - camM[0], (RG + RING_ALT) * 1000 - camM[1], 0 - camM[2]];
    const platform = [0 - camM[0], RG * 1000 - camM[1], 0 - camM[2]];
    return { ride, alt: Math.hypot(camE[0], camE[1], camE[2]) - RG, H, sun, camE, mode, C, ringU0, station, platform, tilt };
  }

  /* ---------- the graphics context can be lost (sleep, driver reset) ---------- */
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); S.hidden = true;
    env.fail && env.fail(Object.assign(new Error('lost'), { code: 'lost' }));
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  /* ---------- input: drag to look, wheel or pinch to zoom ---------- */
  let drag = null, lastInput = 0;
  const touches = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', e => {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; return; }
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId);
  });
  const lift = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && pinch > 0) {
      const [a, b] = [...touches.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      S.fovScale = clamp(S.fovScale * pinch / Math.max(d, 1), .45, 1.45); pinch = d; return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const k = 2 * Math.atan(fovTan()[1]) / innerHeight;
    /* S.yaw and S.pitch always hold what is on screen, so taking over is seamless */
    S.auto = false; lastInput = performance.now();
    S.yaw -= (e.clientX - drag.x) * k; S.pitch = clamp(S.pitch + (e.clientY - drag.y) * k, -88 * D2R, 88 * D2R);
    drag.x = e.clientX; drag.y = e.clientY; ui.onLook && ui.onLook(false);
  });
  const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => { e.preventDefault(); S.fovScale = clamp(S.fovScale * Math.exp(e.deltaY * .001), .45, 1.45); }, { passive: false });
  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); S.auto = false; ui.onLook && ui.onLook(false); }
  });
  window.addEventListener('keyup', e => keys.delete(e.key));
  window.addEventListener('keydown', e => {
    if (S.phase !== 'gallery' || e.target.closest?.('input,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'a') api.travel(-1); else if (k === 'd') api.travel(1); else if (k === 's') api.travel(0); else if (k === 'n') api.travel(2);
  });
  document.addEventListener('visibilitychange', () => { S.hidden = document.hidden; last = performance.now(); });

  let autoLens = 1, smoothLook = false;
  function fovTan() {
    const asp = innerWidth / innerHeight;
    const v = (asp >= 1 ? 52 : 74) * D2R * S.fovScale * (S.phase === 'gallery' ? 1.12 : 1) * (asp >= 1 ? autoLens : Math.min(autoLens, 1.12));
    const ty = Math.tan(Math.min(v, 2.6) / 2);
    return [ty * asp, ty];
  }

  /* ---------- the loop ---------- */
  let last = performance.now(), fpsAvg = 1 / 60, adaptT = 0, firstFrames = 0, accN = 1, lastSig = '', snapMeter = 4, lastSt = null;
  const stats = { frames: 0, ms: 0 };
  window.__stats = stats;

  function step(dt) {
    if (!S.paused) {
      const sdt = dt * S.speedK;
      S.clock += sdt;
      if (S.phase === 'platform') {
        const before = S.platformReal; S.platformReal += dt;
        for (const [at, text] of OPENING) if (before < at && S.platformReal >= at && isFinite(S.departReal)) ui.note && ui.note(text || OPENING_FIRST[S.dep] || OPENING_FIRST.dawn);
        if (S.platformReal >= S.departReal) { S.phase = 'climb'; S.dir = 1; S.rideT = 0; S.departAt = S.clock; ui.onPhase && ui.onPhase('climb'); }
      }
      if (S.phase === 'climb') {
        S.rideT += sdt * S.dir;
        if (S.dir > 0 && S.rideT >= T_RIDE) { S.rideT = T_RIDE; S.phase = 'docked'; S.galleryAt = S.clock + 8 * S.speedK; ui.onPhase && ui.onPhase('docked'); }
        if (S.dir < 0 && S.rideT <= 0) { S.rideT = 0; S.phase = 'platform'; S.platformReal = 0; S.departReal = Infinity; ui.onPhase && ui.onPhase('platform'); }
      }
      if (S.phase === 'docked' && S.clock >= S.galleryAt && !test) goGallery();
      if (S.phase === 'gallery') {
        /* the pod speeds up and slows at about 0.5 g, in simulated time */
        const acc = 8 * sdt;
        let tgt = S.travelTarget;
        if (S.glide != null) {
          /* gliding in to a station: aim at it, stop on it */
          const rem = (S.glide * STEP - (S.K * STEP + S.alpha)) * (RG + RING_ALT) * 1000;
          const vMax = Math.sqrt(2 * 8 * Math.abs(rem)) * Math.sign(rem);
          tgt = Math.abs(rem) < 2 ? 0 : clamp(vMax, -4000, 4000);
          if (Math.abs(rem) < 2 && Math.abs(S.travelV) < 3) { S.travelV = 0; S.alpha = S.glide * STEP - S.K * STEP; S.glide = null; ui.onStation && ui.onStation(stationInfo()); }
        }
        S.travelV += clamp(tgt - S.travelV, -acc, acc);
        S.alpha += S.travelV * sdt / ((RG + RING_ALT) * 1000);
        /* re-anchor to the nearest station */
        while (S.alpha > STEP / 2) { S.alpha -= STEP; S.K++; passStation(); }
        while (S.alpha < -STEP / 2) { S.alpha += STEP; S.K--; passStation(); }
      }
    }
    if (S.phase === 'gallery' && S.galleryReal < 30) {
      const before = S.galleryReal; S.galleryReal += dt;
      if (S.auto) for (const [at, text] of GALLERY_NOTES) if (before < at && S.galleryReal >= at) ui.note && ui.note(text);
    }
    for (const k of keys) {
      const r = 1.2 * dt;
      if (k === 'ArrowLeft') S.yaw -= r; if (k === 'ArrowRight') S.yaw += r;
      if (k === 'ArrowUp') S.pitch = clamp(S.pitch + r, -88 * D2R, 88 * D2R); if (k === 'ArrowDown') S.pitch = clamp(S.pitch - r, -88 * D2R, 88 * D2R);
    }
    /* docking: the picture goes to black like a slide changing, then the gallery fades in */
    if (S.phase === 'docked') S.dockFade = smooth(S.galleryAt - 3 * S.speedK, S.galleryAt, S.clock);
    else if (S.phase === 'gallery') S.dockFade = Math.max(0, S.dockFade - dt * 1.2);
    else S.dockFade = 0;
  }
  function stationInfo(k = S.K) {
    const [place, water] = stationOf(k);
    const g = geoOf(k);
    return { k: ((k % 24) + 24) % 24, lon: g.lon, lat: g.lat, place, water: !!water, here: Math.abs(S.alpha) < 4e-4 && Math.abs(S.travelV) < 1 };
  }
  function passStation() {
    snapMeter = 2;
    const i = stationInfo();
    ui.note && ui.note('Station ' + i.k + ', over ' + i.place + ' (' + fmtPlace(i) + ').' + (i.water ? '' : ' Its cable comes down on land.'));
  }
  function goGallery() { snapMeter = 3; S.galleryReal = test ? 99 : 0; S.phase = 'gallery'; S.auto = true; ui.onPhase && ui.onPhase('gallery'); }

  function frame(t) {
    requestAnimationFrame(frame);
    if (S.hidden) return;
    const dt = Math.min(.1, (t - last) / 1000); last = t;
    if (!test) step(dt);
    S.anim += dt; S.frame++;
    const w = worldState();
    let yaw = S.yaw, pitch = S.pitch;
    if (S.auto) {
      if (w.mode === 1) {
        const moving = Math.abs(S.travelV) > 1 || S.travelTarget !== 0 || S.glide != null;
        if (S.galleryReal < 25 && !moving) [yaw, pitch] = galleryLook(S.galleryReal);
        else { const west = S.travelV < -1 || S.travelTarget < 0 || (S.glide != null && S.glide * STEP < S.K * STEP + S.alpha); yaw = (west ? 270 : 90) * D2R; pitch = -13 * D2R; }
      }
      else if (S.phase === 'platform' && isFinite(S.departReal)) {
        let l; [yaw, pitch, l] = platformLook(S.platformReal); autoLens = l;
      } else {
        [yaw, pitch] = autoLook(S.dep, w.alt);
        /* a narrow portrait view should look through a window, not at a mullion */
        if (innerWidth < innerHeight && Math.abs(pitch) < 60 * D2R) {
          const b = yaw / D2R, win = Math.round((b - 30) / 60) * 60 + 30;
          yaw = (b + (win - b) * .85) * D2R;
        }
      }
      /* ease towards the target so changes of plan become pans, not cuts */
      if (!test && smoothLook) {
        const k = 1 - Math.exp(-dt / .9);
        let dy = ((yaw - S.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        yaw = S.yaw + dy * k; pitch = S.pitch + (pitch - S.pitch) * k;
      }
      smoothLook = true;
      S.yaw = yaw; S.pitch = pitch;
    }
    if (!(S.phase === 'platform' && isFinite(S.departReal) && S.auto)) {
      const tgt = S.auto && S.phase === 'climb' ? lerp(1.32, 1, smooth(0.03, 3, w.alt)) : 1;
      autoLens = test ? tgt : autoLens + (tgt - autoLens) * (1 - Math.exp(-dt / .8));
    }
    const tanHalf = fovTan();
    const sunP = project(w.sun, yaw, pitch, tanHalf, w.tilt);
    labels.update({ camE: w.camE, K: S.K, mode: w.mode, podAng: w.tilt, hidden: S.dockFade > .05, project: d => project(d, yaw, pitch, tanHalf, w.tilt) });
    const night = smooth(.05, -.12, w.sun[1]);
    const st = {
      time: S.clock, frame: S.frame, camE: w.camE, camH: w.alt, view: viewMatrix(yaw, pitch, w.tilt), tanHalf,
      lon0: ringLonOf(S.K), lonRel: S.K * STEP, podAng: w.tilt,
      sun: w.sun, starRot: starMatrix(w.H, S.K, doy), mode: w.mode, speed: Math.abs(w.ride.v) * (S.phase === 'climb' ? 1 : 0),
      dock: S.dockFade, cabinLamp: 0, C: w.C, ringU0: w.ringU0, station: w.station, platform: w.platform,
      wind: [-0.0065 * S.clock, 0.0012 * S.clock], evolve: S.clock, qual: S.quality === 'low' ? 0 : S.quality === 'high' ? 1 : .55,
      night, minMean: Math.exp(lerp(Math.log(.0006), Math.log(1.5e-6), night)), expBias: 0, meterRate: test ? (firstFrames < 3 ? 1 : .5) : snapMeter > 0 ? (snapMeter--, 1) : 1 - Math.exp(-dt / .6), grainSeed: reduce ? 1 : Math.floor(S.anim * 24) % 97,
      grain: 1, debug: q.has('dbg') ? +q.get('dbg') : 0, dbgMask: +(q.get('dm') || 0), sunUv: sunP || [0, 0], sunOn: sunP && sunP[0] > -.1 && sunP[0] < 1.1 && sunP[1] > -.1 && sunP[1] < 1.1 ? 1 : 0,
    };
    /* progressive refinement: when nothing changes, average frames for a clean still */
    const sig = [w.camE[0].toFixed(7), w.camE[1].toFixed(6), S.K, yaw.toFixed(5), pitch.toFixed(5), S.clock.toFixed(2), tanHalf[1].toFixed(5), innerWidth, innerHeight, S.dep, S.quality, R.variant(st)].join('|');   /* a new shader build starts a new average */
    accN = sig === lastSig ? Math.min(accN + 1, 64) : 1; lastSig = sig;
    st.accumN = accN;
    lastSt = st;
    /* a jump straight to the top before its shader is ready: say so (it takes a few seconds) */
    const wait = R.waiting(st);
    if (wait !== S.waiting) { S.waiting = wait; ui.busy && ui.busy(wait); }
    const t0 = performance.now();
    R.render(st);
    if (pendingShot) { pendingShot(); pendingShot = null; }
    const ms = performance.now() - t0;
    stats.frames++; stats.ms = ms;
    /* adapt resolution to keep the ride smooth */
    fpsAvg = lerp(fpsAvg, dt, .05); adaptT += dt;
    if (S.quality === 'auto' && !test && adaptT > 2.5 && S.frame > 30) {
      adaptT = 0;
      if (fpsAvg > 1 / 40 && S.scale > .5) { S.scale = Math.max(.5, S.scale * .85); resize(); }
      else if (fpsAvg < 1 / 57 && S.scale < 1) { S.scale = Math.min(1, S.scale * 1.08); resize(); }
    }
    if (test) {
      if (!S.waiting) firstFrames++;
      if (firstFrames === (+q.get('acc') || 12)) { window.__ready = true; S.hidden = true; }
    }
    if (t - S.lastHud > 120) { S.lastHud = t; hud(w); }
  }

  /* ---------- HUD and notes ---------- */
  let noteTimer = 0;
  function showNote(text) { ui.note && ui.note(text); }
  function hud(w) {
    const r = w.ride;
    const alt = w.alt;
    const isGallery = S.phase === 'gallery';
    const v = S.phase === 'climb' ? Math.abs(r.v) : isGallery ? Math.abs(S.travelV) : 0;
    const acc = S.phase === 'climb' ? r.a : 0;   /* a time-reversed ride keeps the sign of its acceleration */
    let weight = (gAt(alt) + acc) / 9.80665;
    if (isGallery) {
      /* moving round the ring changes the curve you are carried along: east makes you lighter */
      const rm = (RG + alt) * 1000, vRot = 465.1 * (RG + alt) / RG, vIn = vRot + S.travelV;
      weight = (gAt(alt) - (vIn * vIn - vRot * vRot) / rm) / 9.80665;
    }
    const here = geoOf(S.K, isGallery ? S.alpha : 0);
    const Hhere = w.H + (here.lon - LON) * D2R;      /* local hour angle where we are */
    ui.hud && ui.hud({
      alt, v, weight, air: pressure(alt), rideT: S.phase === 'platform' ? 0 : S.rideT, rideTotal: T_RIDE,
      clock: solarClock(Hhere), phase: S.phase, speedK: S.speedK, paused: S.paused, auto: S.auto,
      countdown: S.phase === 'platform' && isFinite(S.departReal) ? Math.max(0, S.departReal - S.platformReal) : null,
      lon: here.lon, lat: here.lat, station: stationInfo(), travel: S.travelV, gliding: S.glide != null,
    });
    /* notes as the car passes each height */
    if (S.phase === 'climb' && S.dir > 0) {
      while (S.noteIdx < NOTES.length && alt >= NOTES[S.noteIdx].alt) {
        const n = NOTES[S.noteIdx]; S.noteIdx++;
        if (n.text && alt - n.alt < 6 + n.alt * .05) showNote(n.text);
      }
      if (!S.sunNoted) {
        const sunUpHere = sunVisibleFrom(alt, w.sun), sunUpGround = w.sun[1] > -0.0145;
        if (sunUpHere && !sunUpGround && alt > 1) { S.sunNoted = true; showNote(S.dep === 'dusk' ? 'The Sun is back. It set before we left. The sea below is already in the dark.' : 'Sunrise, at ' + Math.round(alt) + ' km. The sea below is still in the dark.'); }
      }
    }
  }
  function sunVisibleFrom(alt, sun) { const dip = Math.acos(RG / (RG + alt)); return Math.asin(sun[1]) > -dip - 0.0145; }

  /* ---------- photographs: a roll of twelve ---------- */
  const roll = []; let pendingShot = null;
  function takePhoto() {
    if (roll.length >= 12) return Promise.resolve(null);
    return new Promise(res => {
      pendingShot = () => {
        const s = Math.min(canvas.width, canvas.height);
        const c = document.createElement('canvas'); c.width = c.height = 720;
        const g = c.getContext('2d');
        g.drawImage(canvas, (canvas.width - s) / 2, (canvas.height - s) / 2, s, s, 0, 0, 720, 720);
        const w = worldState();
        const at = geoOf(S.K, S.phase === 'gallery' ? S.alpha : 0);
        const shot = { canvas: c, alt: w.alt, clock: solarClock(w.H + (at.lon - LON) * D2R), n: roll.length + 1 };
        roll.push(shot); res(shot);
      };
    });
  }

  /* ---------- public controls for the page ---------- */
  const api = {
    depart() { if (S.phase === 'platform') { S.departReal = S.platformReal; S.paused = false; } },
    togglePause() { S.paused = !S.paused; return S.paused; },
    setSpeed(k) { S.speedK = k; },
    setDeparture(key) {
      if (!DEPARTURES[key]) return;
      /* keep the car where it is; change the hour it left */
      S.dep = key; snapMeter = 3;
      const ref = isFinite(S.departAt) ? S.departAt : 0;
      /* the chosen hour is local to the platform under this station */
      H0 = departureHourAngle(key, dec, new Date(), stationInfo().lat) - ref * DAYRATE - (key === 'now' ? 0 : (stationInfo().lon - LON) * D2R);
      S.sunNoted = false;
    },
    follow() { S.auto = true; S.galleryReal = Math.max(S.galleryReal, 25); ui.onLook && ui.onLook(true); },
    jumpTo(altKm) {
      snapMeter = 3;
      S.paused = reduce ? true : S.paused;
      if (altKm === 'gallery') { if (!isFinite(S.departAt)) S.departAt = 0; S.rideT = T_RIDE; S.clock = S.departAt + T_RIDE + 30; S.noteIdx = NOTES.length; goGallery(); return; }
      if (altKm <= EYE0) { S.phase = 'platform'; S.rideT = 0; S.platformReal = 0; S.departReal = reduce ? Infinity : 14; S.noteIdx = 0; S.auto = true; return; }
      if (!isFinite(S.departAt)) S.departAt = 0;
      S.phase = 'climb'; S.dir = 1; S.rideT = timeForAlt(altKm); S.clock = S.departAt + S.rideT;
      S.noteIdx = NOTES.findIndex(n => n.alt > altKm); if (S.noteIdx < 0) S.noteIdx = NOTES.length;
      S.sunNoted = sunVisibleFrom(altKm, worldState().sun);
    },
    rideDown() {
      const i = stationInfo();
      if (S.phase === 'docked' || (S.phase === 'gallery' && i.here && i.water)) {
        S.phase = 'climb'; S.dir = -1; S.rideT = T_RIDE; S.paused = false; S.alpha = 0; S.travelV = 0; S.travelTarget = 0; S.auto = true; snapMeter = 3;
        ui.note && ui.note('Riding down to the sea at ' + fmtPlace(i) + ', over ' + i.place + '.');
      }
    },
    /* dir: -1 west, 1 east, 0 stop here, 2 on to the next station (in the way we are going, else east) */
    travel(dir) {
      if (S.phase !== 'gallery') return;
      S.glide = null; S.paused = false;
      if (S.speedK < 20) { S.speedK = 20; ui.onSpeed && ui.onSpeed(20); }
      if (dir === 1 || dir === -1) { S.travelTarget = dir * 4000; S.auto = true; ui.onLook && ui.onLook(true); return; }
      S.travelTarget = 0;
      if (dir === 2) {
        const pos = S.K * STEP + S.alpha, east = S.travelV > -1;
        S.glide = east ? Math.floor(pos / STEP + 1e-6) + 1 : Math.ceil(pos / STEP - 1e-6) - 1;
        if (Math.abs(S.travelV) > 1 && Math.sign(S.glide * STEP - pos) !== Math.sign(S.travelV)) S.glide += Math.sign(S.travelV);
        S.auto = true; ui.onLook && ui.onLook(true);
      }
    },
    get station() { return stationInfo(); },
    rideAgain() { S.phase = 'platform'; S.rideT = 0; S.dir = 1; S.clock = 0; S.departAt = 10; S.platformReal = 0; S.departReal = reduce ? Infinity : 14; S.noteIdx = 0; S.sunNoted = false; S.auto = true; S.alpha = 0; S.travelV = 0; S.travelTarget = 0; S.glide = null; H0 = departureHourAngle(S.dep, dec, new Date(), stationInfo().lat) - (isFinite(S.departAt) ? S.departAt : 0) * DAYRATE - (S.dep === 'now' ? 0 : (stationInfo().lon - LON) * D2R); ui.onLook && ui.onLook(true); },
    stepOut: goGallery,
    setQuality(qk) { S.quality = qk; S.scale = 1; resize(); },
    get quality() { return S.quality; },
    takePhoto, roll,
    get state() { return S; },
    altFor: timeForAlt, T_RIDE,
  };
  window.__ride = api; api.noiseStats = l => R.noiseStats(l);
  /* test hook: time n frames of the current view, waiting for the GPU each time */
  api.bench = n => { const gl = R.gl, out = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); lastSt.frame++; lastSt.accumN = 1; R.render(lastSt); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); out.push(performance.now() - t0); } out.sort((a, b) => a - b); return { median: +out[n >> 1].toFixed(1), size: R.size }; };
  requestAnimationFrame(t => { last = t; frame(t); });
  return api;
}

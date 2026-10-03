// Four Hours Out: the clocks.
// Real orbits, kept simple enough to run every frame. No renderer in here: the intro
// page imports this file on its own to print the light-delay line.

const D = Math.PI / 180;
export const MINUTE = 6e4, HOUR = 36e5, DAY = 864e5;

// ---------------------------------------------------------------------------
// Earth to Neptune. JPL's approximate Keplerian elements (E. M. Standish, "Keplerian
// Elements for Approximate Positions of the Major Planets", valid 1800–2050).
// Checked against JPL Horizons for 2026–27: one-way light time agrees within a second.
const EL = {
  earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668,
    100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
  neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372,
    -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
};
function helio(k, jd) {
  const T = (jd - 2451545) / 36525, e0 = EL[k];
  const a = e0[0] + e0[1] * T, e = e0[2] + e0[3] * T, I = (e0[4] + e0[5] * T) * D;
  const L = e0[6] + e0[7] * T, w = e0[8] + e0[9] * T, O = e0[10] + e0[11] * T;
  let M = (((L - w) % 360) + 540) % 360 - 180; M *= D;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const om = (w - O) * D, Om = O * D;
  const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  return [(co * cO - so * sO * cI) * x + (-so * cO - co * sO * cI) * y,
    (co * sO + so * cO * cI) * x + (-so * sO + co * cO * cI) * y,
    so * sI * x + co * sI * y];
}
/** One-way light time between Earth and Neptune, for a signal leaving Earth at `ms`. */
export function lightTime(ms) {
  const jd = ms / DAY + 2440587.5, e = helio('earth', jd);
  let tau = 0, au = 0;
  for (let i = 0; i < 3; i++) {
    const n = helio('neptune', jd + tau / 1440);
    au = Math.hypot(n[0] - e[0], n[1] - e[1], n[2] - e[2]);
    tau = au * 499.004784 / 60;
  }
  return { minutes: tau, au, ms: tau * MINUTE };
}

// ---------------------------------------------------------------------------
// Triton's sky. Triton keeps one face to Neptune, so Neptune never moves in its sky.
// The Sun goes once around Triton's sky every 5.876 days, along a circle whose
// latitude (the subsolar latitude) drifts by about 1.4° a year.
// Both from JPL Horizons, 2020–2040:
//  - minimum phase of Neptune as seen from Triton: 2026-10-06 19:30 UT, then every
//    5.87638 days (checked against the minima of 2028-01-02 and 2029-06-02);
//  - subsolar latitude on Triton, seen from the Sun, every two years.
const P_DAYS = 5.87638;
const T_THIN = Date.UTC(2026, 9, 6, 19, 30);
const DELTA = [[2020, -37.529], [2022, -35.154], [2024, -32.655], [2026, -30.057], [2028, -27.376],
  [2030, -24.616], [2032, -21.786], [2034, -18.896], [2036, -15.959], [2038, -12.987], [2040, -9.991]];
export const PERIOD_MS = P_DAYS * DAY;

// The imagined campus: 15° south, 82° west of the point that faces Neptune, at the
// edge of the southern frost cap. From here Neptune hangs 8° above the horizon.
export const SITE = { lat: -15, lon: -82 };

function delta(ms) {
  const y = 1970 + ms / (365.2425 * DAY);
  if (y <= DELTA[0][0]) return DELTA[0][1];
  for (let i = 1; i < DELTA.length; i++) {
    if (y <= DELTA[i][0]) { const a = DELTA[i - 1], b = DELTA[i], t = (y - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
  }
  return DELTA[DELTA.length - 1][1];
}

// Body frame: x towards Neptune, z along Triton's spin axis (IAU north), y = z × x.
// Triton spins backwards, so the subsolar point moves east and the Sun rises in the west.
const lat = SITE.lat * D, lon = SITE.lon * D;
const UP = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
const EAST = [-Math.sin(lon), Math.cos(lon), 0];
const NORTH = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Scene frame: y up, −z points at Neptune's compass bearing, x to the right of it.
const NEP_BODY = [1, 0, 0];
const hn = [dot(NEP_BODY, EAST), dot(NEP_BODY, NORTH)];
const hl = Math.hypot(hn[0], hn[1]);
const FWD = [(hn[0] * EAST[0] + hn[1] * NORTH[0]) / hl, (hn[0] * EAST[1] + hn[1] * NORTH[1]) / hl, (hn[0] * EAST[2] + hn[1] * NORTH[2]) / hl];
const RIGHT = [FWD[1] * UP[2] - FWD[2] * UP[1], FWD[2] * UP[0] - FWD[0] * UP[2], FWD[0] * UP[1] - FWD[1] * UP[0]];
const toScene = v => [dot(v, RIGHT), dot(v, UP), -dot(v, FWD)];
export const NEPTUNE_DIR = toScene(NEP_BODY);
export const NEPTUNE_ALT = Math.asin(NEPTUNE_DIR[1]) / D;
/** Compass bearing of a scene direction, degrees clockwise from north. */
export function bearing(v) {
  // scene → body
  const b = [RIGHT[0] * v[0] + UP[0] * v[1] - FWD[0] * v[2], RIGHT[1] * v[0] + UP[1] * v[1] - FWD[1] * v[2], RIGHT[2] * v[0] + UP[2] * v[1] - FWD[2] * v[2]];
  return ((Math.atan2(dot(b, EAST), dot(b, NORTH)) / D) + 360) % 360;
}
// Neptune's spin axis as seen from Triton: Triton's orbit is tilted 157° to Neptune's
// equator, so Neptune's north pole points roughly opposite Triton's, 23° off.
const NEP_POLE_BODY = [Math.sin(23 * D) * 0.6, Math.sin(23 * D) * 0.8, -Math.cos(23 * D)];
export const NEPTUNE_POLE = toScene(NEP_POLE_BODY);

function sunBody(ms) {
  const H = 2 * Math.PI * (ms - T_THIN) / PERIOD_MS, d = delta(ms) * D;
  return [Math.cos(d) * Math.cos(H), Math.cos(d) * Math.sin(H), Math.sin(d)];
}
/** Sun direction in the scene frame. */
export function sunDir(ms) { return toScene(sunBody(ms)); }
/** Fraction of Neptune's disc that is lit, seen from Triton. */
export function neptuneLit(ms) { return (1 - dot(sunBody(ms), NEP_BODY)) / 2; }

/** Everything the scene and the board need about the sky at one moment. */
export function sky(ms) {
  const sun = sunDir(ms);
  const lit = neptuneLit(ms);
  const waxing = neptuneLit(ms + HOUR) > lit;
  const alt = Math.asin(Math.max(-1, Math.min(1, sun[1]))) / D;
  return { sun, sunAlt: alt, sunUp: alt > 0, neptune: NEPTUNE_DIR, lit, waxing, delta: delta(ms),
    // Neptune turns once in 16.11 h; Triton circles the other way every 141 h, so the
    // face Triton sees comes round every 14.46 h.
    neptuneSpin: 2 * Math.PI * (((ms / (14.46 * HOUR)) % 1) + 1) % (2 * Math.PI) };
}

/** Next time after `ms` that the Sun rises (dir = 1) or sets (dir = −1). Null if it doesn't. */
export function nextSunEvent(ms, dir) {
  const step = 10 * MINUTE;
  let prev = sunDir(ms)[1];
  for (let t = ms + step; t < ms + PERIOD_MS * 1.05; t += step) {
    const y = sunDir(t)[1];
    if ((dir > 0 && prev <= 0 && y > 0) || (dir < 0 && prev > 0 && y <= 0)) {
      let a = t - step, b = t;
      for (let i = 0; i < 12; i++) { const m = (a + b) / 2, ym = sunDir(m)[1]; if ((dir > 0) === (ym > 0)) b = m; else a = m; }
      return b;
    }
    prev = y;
  }
  return null;
}
/** Next fullest (kind = 'full') or thinnest ('thin') Neptune after `ms`. */
export function nextNeptune(ms, kind) {
  const k = Math.floor((ms - T_THIN) / PERIOD_MS);
  for (let i = 0; i < 3; i++) {
    const t = T_THIN + (k + i + (kind === 'full' ? 0.5 : 0)) * PERIOD_MS;
    if (t > ms) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatting, in the visitor's own time zone.
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const fmtDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
export function clock(ms) { return fmtTime.format(new Date(ms)).replace(/\s?([AP]M)$/i, (m, p) => ' ' + p.toLowerCase()); }
/** "at 4:12 pm", "tomorrow at 1:05 am", "on Thu at 9:30 am", or "on Oct 12", in the visitor's time zone. */
export function when(ms, now) {
  const c = clock(ms);
  const days = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  if (days === 0) return 'at ' + c;
  if (days === 1) return 'tomorrow at ' + c;
  if (days === -1) return 'yesterday at ' + c;
  if (Math.abs(days) < 6) return 'on ' + fmtDay.format(new Date(ms)) + ' at ' + c;
  return 'on ' + fmtDate.format(new Date(ms));
}
export function date(ms) { return fmtDate.format(new Date(ms)); }
/** "4 h 02 min", "1 day 7 h", "26 min". */
export function span(ms) {
  const m = Math.round(Math.abs(ms) / MINUTE);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return h + ' h ' + String(mm).padStart(2, '0') + ' min';
  const d = Math.floor(h / 24), hh = h % 24;
  return d + (d === 1 ? ' day ' : ' days ') + hh + ' h';
}

/** The two lines the whole piece is about. */
export function delayLines(now) {
  const lt = lightTime(now);
  const arrive = now + lt.ms;
  const home = arrive + lightTime(arrive).ms;
  return { lt, arrive, home };
}

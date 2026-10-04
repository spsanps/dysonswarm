// The clocks: Earth–Neptune light time and the Sun in Triton's sky, kept from the first
// version (checked against JPL Horizons). No renderer here, so the intro page can use it alone.

const D = Math.PI / 180;
export const MINUTE = 6e4, HOUR = 36e5, DAY = 864e5;

// Earth and Neptune from JPL's approximate Keplerian elements (Standish, valid 1800–2050).
// One-way light time agrees with Horizons within about a second for 2026–27.
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
/** One-way light time between Earth and Neptune for a signal leaving Earth at `ms`. */
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

// Triton keeps one face to Neptune. In its body frame (x towards Neptune, z = IAU north),
// the Sun goes round once every 5.87638 days, along a circle at the subsolar latitude, which
// drifts by about 1.4° a year. Both fitted to JPL Horizons, 2020–2040: Neptune's thinnest
// phase seen from Triton on 2026-10-06 19:30 UT, and the subsolar latitude every two years.
export const P_DAYS = 5.87638;
export const PERIOD_MS = P_DAYS * DAY;
const T_THIN = Date.UTC(2026, 9, 6, 19, 30);
const DELTA = [[2020, -37.529], [2022, -35.154], [2024, -32.655], [2026, -30.057], [2028, -27.376],
  [2030, -24.616], [2032, -21.786], [2034, -18.896], [2036, -15.959], [2038, -12.987], [2040, -9.991]];
export function subsolarLat(ms) {
  const y = 1970 + ms / (365.2425 * DAY);
  if (y <= DELTA[0][0]) return DELTA[0][1];
  for (let i = 1; i < DELTA.length; i++) {
    if (y <= DELTA[i][0]) { const a = DELTA[i - 1], b = DELTA[i], t = (y - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
  }
  return DELTA[DELTA.length - 1][1];
}
/** Sun's hour angle (radians) in Triton's body frame; it grows with time (the Sun moves east). */
export function hourAngle(ms) { return 2 * Math.PI * (ms - T_THIN) / PERIOD_MS; }
/** Unit vector to the Sun in Triton's body frame. */
export function sunBody(ms) {
  const H = hourAngle(ms), d = subsolarLat(ms) * D;
  return [Math.cos(d) * Math.cos(H), Math.cos(d) * Math.sin(H), Math.sin(d)];
}
/** Neptune's spin axis in Triton's body frame. Triton's orbit is tilted 157° to Neptune's
 *  equator, so Neptune's pole sits 23° from Triton's south pole and turns once per orbit.
 *  The phase is set so Neptune's subsolar latitude is about −20°, as now. */
export function neptunePole(ms) {
  const phi = hourAngle(ms) + 69.5 * D, inc = 23 * D;
  return [Math.sin(inc) * Math.cos(phi), Math.sin(inc) * Math.sin(phi), Math.cos(inc)];
}
/** Fraction of Neptune's disc lit, seen from Triton. */
export function neptuneLit(ms) { return (1 - sunBody(ms)[0]) / 2; }

// Formatting in the visitor's own time zone.
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
export function clock(ms) { return fmtTime.format(new Date(ms)).replace(/\s?([AP]M)$/i, (m, p) => ' ' + p.toLowerCase()); }
export function when(ms, now) {
  const c = clock(ms);
  const days = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  if (days === 0) return 'at ' + c;
  if (days === 1) return 'tomorrow at ' + c;
  return 'on ' + fmtDay.format(new Date(ms)) + ' at ' + c;
}
/** "4 h 02 min". */
export function span(ms) {
  const m = Math.round(Math.abs(ms) / MINUTE);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
}

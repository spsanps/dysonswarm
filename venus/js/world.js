// Viewpoints, the Sun's tracks and the light/air for a given year and hour.

import { clamp, lerp, smoothstep } from './noise.js';
import { heightRender, EXAGGERATION } from './terrain.js';

const D2R = Math.PI / 180;
export const LATITUDE = 61.6;   // degrees north: the southern edge of Lakshmi Planum

export const VIEWS = [
  { id: 'headland', name: 'The headland', sub: 'Above the bay, 1,200 m up', x: 0, z: 0, eye: 1.7, yaw: 258, pitch: -10, fov: 66, yawRange: 120, pitchRange: [40, 45], portraitPitch: -9, portraitYaw: 6 },
  { id: 'shore', name: 'The shore', sub: 'Where the town will be, at the water’s edge', x: -6200, z: -1150, eye: 1.7, yaw: 200, pitch: -2, fov: 64, yawRange: 150, pitchRange: [35, 50], portraitPitch: -6 },
  { id: 'above', name: 'Above the bay', sub: '18 km up, looking west', x: 14000, z: 9000, alt: 18000, yaw: 250, pitch: -21, fov: 58, yawRange: 180, pitchRange: [45, 30], portraitPitch: -6, fly: true },
];

export function dirFromAzEl(az, el) {
  const a = az * D2R, e = el * D2R;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

// A camera from a view's numbers (or a free camera: {x, y, z, yaw, pitch, fov}).
export function viewStart(view) {
  const y = view.alt !== undefined ? view.alt : heightRender(view.x, view.z) + view.eye;
  return { x: view.x, y, z: view.z, yaw: view.yaw, pitch: view.pitch, fov: view.fov };
}
export function buildCamera(c) {
  const x = c.x, y = c.y, z = c.z;
  const yaw = c.yaw * D2R, pitch = clamp(c.pitch, -85, 85) * D2R;
  const fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const right = [Math.cos(yaw), 0, Math.sin(yaw)];
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  return { pos: [x, y, z], fwd, right, up, fov: c.fov };
}
export function cameraFor(view, yawOff = 0, pitchOff = 0, fovMul = 1) {
  const x = view.x, z = view.z;
  const y = view.alt !== undefined ? view.alt : heightRender(x, z) + view.eye;
  const yaw = (view.yaw + yawOff) * D2R, pitch = clamp(view.pitch + pitchOff, -80, 80) * D2R;
  const fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const right = [Math.cos(yaw), 0, Math.sin(yaw)];
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  return { pos: [x, y, z], fwd, right, up, fov: view.fov * fovMul };
}

// The real Sun on Venus today: it rises in the west (Venus spins backwards) and a day
// lasts 117 Earth days. `h` is a local hour on a 24-hour dial.
export function venusSun(h) {
  const H = (h - 12) * 15 * D2R, phi = LATITUDE * D2R;
  const el = Math.asin(Math.cos(phi) * Math.cos(H));
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi)) / D2R + 180; // prograde azimuth
  az = (360 - az) % 360;                                                    // retrograde
  return { az, el: el / D2R };
}

// The soletta's image of the Sun (Birch §10): a 24-hour day. Its track shifts from day
// to day; this is one day's track.
export function solettaSun(h) {
  const H = (h - 12) * 15 * D2R, phi = LATITUDE * D2R, dec = 12 * D2R;
  const el = Math.asin(Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / D2R + 180;
  return { az: (az + 360) % 360, el: el / D2R };
}

// Where the Sun (and the shade over it) sit in the dark years: any Venus hour would do;
// this one puts the shade low in the west, in front of the headland.
export const DARK_SUN = { az: 244, el: 6 };

const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const WL = [0.545, 1.0, 2.04];   // Rayleigh (550/λ)^4 for 640, 550, 460 nm

function airmass(mu) {
  const a = Math.acos(clamp(mu, -1, 1)) / D2R;
  return 1 / (Math.max(mu, 0) + 0.15 * Math.pow(Math.max(93.885 - a, 0.5), -1.253));
}

// Everything the shaders need to light the scene for one year and hour.
// Three regimes blend: Venus's own orange daylight (today, fading under the shade),
// the soletta's 24-hour sun (after year 206), and night (the dark centuries, and
// soletta nights), which is painted as dim blue light so the land still reads.
// The dark centuries' moonlight: a little less blue and a little brighter than it was, so the
// shade, rain, seas and snow years read clearly (October 2026; was [0.50, 0.60, 0.95] at 0.55).
const MOON = [0.58, 0.64, 0.90];
const NIGHT_EXPOSURE = 0.85;
export function lighting(st, hour, camAltTrue) {
  const L = {};
  const venusDay = st.soletta < 0.5;
  const sunTrue = venusDay && st.shade < 0.01 ? venusSun(hour) : DARK_SUN;
  L.sunDir = dirFromAzEl(sunTrue.az, sunTrue.el);
  const sol = solettaSun(hour);
  const solDir = dirFromAzEl(sol.az, sol.el);
  L.sol = sol;

  // Air. Rayleigh from the column; a little aerosol depending on the weather.
  const H = clamp(st.H, 4000, 20000);
  const bR550 = st.tauR / H;
  L.betaR = WL.map(w => bR550 * w);
  let tauM = 0.005 + st.co2Rain * 0.35 + st.snowFall * 0.4 + st.acidRain * 0.3 + st.waterRain * 0.10 + st.clouds * 0.012;
  L.HM = 1800;
  L.betaM = [tauM / L.HM, tauM / L.HM, tauM / L.HM * 1.03];
  L.HR = H;
  L.mieG = 0.68;

  // 1. Venus today: no direct sun under the clouds, an orange glow from everywhere.
  const sunFree = 1 - st.shade;
  const dayGlow = venusDay ? clamp(Math.sin(Math.max(sunTrue.el, -6) * D2R) * 2.4 + 0.2, 0, 1) : 0;
  const glow = dayGlow * sunFree * st.cloudDeck;
  L.diffuse = scale([1.0, 0.52, 0.19], 0.020 * glow);
  L.skyAmb = scale([1.0, 0.56, 0.24], 0.048 * glow);
  L.groundAmb = scale([0.55, 0.28, 0.11], 0.014 * glow);

  // 2. The soletta's sun: half the full Venus sunlight, like Earth's.
  L.lightDir = solDir;
  const mu = Math.max(solDir[1], -0.2);
  const sunUp = smoothstep(-2, 3, sol.el);
  const am = airmass(Math.max(mu, 0.012));
  const dens = i => L.betaR[i] * H * Math.exp(-camAltTrue / H) + L.betaM[i] * L.HM * Math.exp(-camAltTrue / L.HM);
  const T = [0, 1, 2].map(i => Math.exp(-dens(i) * am));
  const solI = 0.5 * st.soletta * sunUp;
  L.lightCol = scale(T, solI);
  L.skyLight = [solI, solI, solI];
  // sky light on the ground: bluish, from the scattering column, plus twilight
  const twilight = st.soletta * smoothstep(-9, 0, sol.el) * (1 - sunUp);
  const zen = [0, 1, 2].map(i => 1 - Math.exp(-dens(i) * 1.6));
  L.skyAmb = add3(L.skyAmb, zen.map((z, i) => z * (solI * (0.55 + 0.45 * T[i]) * 0.55 + 0.035 * twilight * [0.7, 0.8, 1][i])));
  L.groundAmb = add3(L.groundAmb, scale(L.lightCol, 0.10 * Math.max(mu, 0)));

  // 3. Night: starlight, skyglow and the colonies' mirrors, as a painter would light it.
  const dayLum = lum(L.lightCol) * Math.max(mu, 0) + lum(L.skyAmb) + lum(L.diffuse) * 2;
  const night = 1 - clamp(dayLum / 0.004, 0, 1);
  L.night = night;
  const clear = 1 - st.cloudDeck * 0.25;   // the acid deck dims the night less than it did (0.55), so the rain years read
  L.nightAmb = scale(MOON, 0.0055 * night * clear);
  L.nightSky = scale([0.16, 0.20, 0.36], 0.0062 * night * (1 - st.cloudDeck * 0.6));
  L.colonyLight = 0;
  L.starVis = (1 - st.cloudDeck) * night;
  L.shadeVis = st.shade * (1 - st.cloudDeck) * (st.soletta > 0.5 ? night : 1);

  // Exposure: the eye adapts partly. Under the shade it does not re-adapt to the
  // fading daylight (the point is that the light goes), only to the night after.
  const Eday = lum(L.lightCol) * Math.max(Math.sin(sol.el * D2R), 0) * 0.8 + lum(L.skyAmb) * 0.9;
  const Etoday = lum(L.diffuse) * 2.2 + lum(L.skyAmb) * 0.5;
  const Enight = lum(L.nightAmb);
  // Night is drawn as if by moonlight, so the land reads (there is no moon; it would
  // be close to black). The air is thinned for the eye at night for the same reason.
  const exNight = NIGHT_EXPOSURE / Math.pow(lum(MOON) * 0.0055 + 1e-6, 0.82);
  let ex;
  if (venusDay) {
    const fullToday = lum([1.0, 0.52, 0.19]) * 0.020 * 2.2 + lum([1.0, 0.56, 0.24]) * 0.048 * 0.5;
    const exToday = 1.6 / Math.pow(fullToday * Math.max(dayGlow, 0.15), 0.82);
    // under the shade the eye adapts only a little: the light really goes
    ex = Math.min(exToday * (1 + 2.5 * st.shade), exNight);
  } else {
    const exD = 1.6 / Math.pow(Eday + Etoday + 1e-6, 0.82);
    ex = lerp(Math.min(exD, exNight), exNight, night);
  }
  L.airK = lerp(1, 0.02, night * smoothstep(0.3, 2.0, st.tauR));   // was 0.05: thinner at night so the land reads
  // Venus today, painted a little clearer than it is so the land below shows
  if (venusDay && st.cloudDeck > 0.5) L.airK *= lerp(1, 0.035, 1 - night);   // was 0.06
  L.exposure = clamp(ex, 1, 900);
  return L;
}

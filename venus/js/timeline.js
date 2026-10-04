// The years. One fixed place, two hundred years.
//
// The order and most dates follow Paul Birch, "Terraforming Venus Quickly",
// J. Brit. Interplanet. Soc. 44, 157-167 (1991), section 11, where year 0 is his 2040:
// heat pipes and a floating colony first; the sunshade at year 5; stage 1 cooling done
// by 15; CO2 rain from 20; seas freezing at the triple point around 90-110; the rest of
// the CO2 falling as snow until 120; cover disks lowered onto the frozen seas; a soletta
// for a 24-hour day; water from a broken-up ice moon; tents, plants and oxygen; the
// colonies settling onto the new sea by 150; Earthlike by 160.
//
// San's own addition is the land: the CO2 snow is paved over with plastic sheet and
// other materials, and soil is laid on top. Those dates are imagined.

import { clamp, lerp, smoothstep } from './noise.js';

export const YEAR_MAX = 200;

export const STAGES = [
  { id: 'today', name: 'Today', start: 0, end: 5 },
  { id: 'shade', name: 'The shade', start: 5, end: 10 },
  { id: 'rain', name: 'Rain', start: 10, end: 20 },
  { id: 'seas', name: 'CO2 seas', start: 20, end: 90 },
  { id: 'snow', name: 'CO2 snow', start: 90, end: 110 },
  { id: 'paving', name: 'Paving', start: 110, end: 126 },
  { id: 'soil', name: 'Soil', start: 126, end: 136 },
  { id: 'water', name: 'Water', start: 136, end: 150 },
  { id: 'green', name: 'Green', start: 150, end: 200 },
];

// Shared with the shaders (as #defines), the machines and the captions.
export const SCHEDULE = {
  PIPES_UP: 1, PIPES_DOWN: 60,
  SHADE_START: 5, SHADE_DONE: 8.5,
  ACID_START: 8, CLEAR: 15.5,
  CO2_RAIN: 20, FREEZE_START: 90, FREEZE_DONE: 103, SNOW_START: 101, SNOW_DONE: 109,
  PAVE_SEA_START: 110.8, PAVE_SEA_SPAN: 14,
  PAVE_LAND_START: 113.5, PAVE_LAND_SPAN: 11.5,
  SOLETTA: 124.5,
  SOIL_START: 126.8, SOIL_SPAN: 9,
  ICEFALL_START: 136, ICEFALL_END: 150, WATER_START: 137, WATER_FULL: 150,
  GREEN_START: 142, TENTS_UP: 139, TENTS_DOWN: 162,
  COLONY_LAND: 150, ISLANDS_START: 151, ISLANDS_SPAN: 30,
  TOWN_START: 145,
};

// Liquid CO2 sea level (true m above the 6051 km sphere) against the fraction of the
// condensable CO2 that has rained out, from Magellan's hypsometry (_design/venus).
const SEA_CURVE = [
  [0, -2951], [0.02, -150], [0.05, 83], [0.1, 285], [0.15, 419], [0.2, 526], [0.3, 698], [0.4, 842],
  [0.5, 969], [0.6, 1085], [0.7, 1195], [0.8, 1300], [0.9, 1400], [1.0, 1498],
];
function seaLevelFor(f) {
  for (let i = 1; i < SEA_CURVE.length; i++) {
    const [f1, h1] = SEA_CURVE[i];
    if (f <= f1) { const [f0, h0] = SEA_CURVE[i - 1]; return lerp(h0, h1, (f - f0) / (f1 - f0)); }
  }
  return 1500;
}

export function stageAt(y) {
  for (const s of STAGES) if (y < s.end) return s;
  return STAGES[STAGES.length - 1];
}

// CO2 vapour pressure (bar): Clausius-Clapeyron through the triple point (216.6 K,
// 5.18 bar), fitted to reach the critical point (304 K, 73.8 bar) above it; the
// solid's curve below is steeper.
const pvapLiquid = t => 5.18 * Math.exp(2000 * (1 / 216.6 - 1 / t));
const pvapSolid = t => 5.18 * Math.exp(3100 * (1 / 216.6 - 1 / t));

export function stateAt(y) {
  const S = SCHEDULE;
  const st = { year: y, stage: stageAt(y) };

  st.shade = smoothstep(S.SHADE_START, S.SHADE_DONE, y);
  st.soletta = smoothstep(S.SOLETTA - 0.5, S.SOLETTA + 1.5, y);

  // Temperature at the old sea level (K). Birch's Table 1, with heat pipes.
  let T;
  if (y < S.SHADE_START) T = 737;
  else if (y < 15) T = lerp(737, 304, Math.pow(smoothstep(S.SHADE_START, 15, y), 0.8));
  else if (y < 25) T = 304;
  else if (y < S.FREEZE_START) T = lerp(304, 216.6, (y - 25) / (S.FREEZE_START - 25));
  else if (y < S.FREEZE_DONE) T = 216.6;
  else if (y < S.SNOW_DONE) T = lerp(216.6, 192, smoothstep(S.FREEZE_DONE, S.SNOW_DONE, y));
  else if (y < S.SOLETTA) T = 192;
  else T = lerp(192, 289, smoothstep(S.SOLETTA, 145, y));
  st.T = T;

  // Hot rock glows, just, while it is hotter than about 600 K (and only in the dark).
  st.glow = smoothstep(560, 737, T) * st.shade;

  // CO2 in the air (bar at the old sea level). No condensation above the critical
  // temperature; at 304 K the excess (about 20 bar) rains out over stage 2.
  let co2;
  if (y < 20) co2 = 92;
  else if (y < 25) co2 = lerp(92, 74, smoothstep(20, 25, y));
  else if (y < S.FREEZE_START) co2 = Math.min(74, pvapLiquid(T));
  else if (y < S.FREEZE_DONE) co2 = lerp(5.18, 5.0, smoothstep(S.FREEZE_START, S.FREEZE_DONE, y));
  else if (y < S.SNOW_DONE) co2 = Math.min(5.0, pvapSolid(T));
  else co2 = lerp(pvapSolid(192), 0.004, smoothstep(140, 165, y));
  // Nitrogen: about 3 bar now; Birch exports most of the excess after year 120.
  const n2 = y < 120 ? 3.2 : lerp(3.2, 0.78, smoothstep(120, 160, y));
  const o2 = lerp(0, 0.23, smoothstep(142, 160, y));
  st.co2 = co2; st.n2 = n2; st.o2 = o2; st.P = co2 + n2 + o2;

  // The sulphuric acid clouds and haze rain out as the air cools.
  st.cloudDeck = 1 - smoothstep(S.ACID_START + 2, S.CLEAR, y);
  st.acidRain = smoothstep(S.ACID_START, S.ACID_START + 1.5, y) * (1 - smoothstep(S.CLEAR - 2, S.CLEAR + 0.5, y));
  st.acid = smoothstep(S.ACID_START + 1, S.CLEAR, y) * (1 - smoothstep(S.SOIL_START, S.SOIL_START + 6, y));
  st.lightning = st.acidRain;

  // CO2 rain, seas, freezing, snow.
  st.co2Rain = smoothstep(S.CO2_RAIN, S.CO2_RAIN + 1, y) * (1 - smoothstep(S.FREEZE_START - 8, S.FREEZE_START, y));
  const condensed = clamp((92 - co2) / (92 - 5.18), 0, 1);
  st.condensed = condensed;
  st.freeze = smoothstep(S.FREEZE_START, S.FREEZE_DONE, y);
  st.seaLevelTrue = condensed <= 0.001 ? -9999 : seaLevelFor(condensed);
  st.seaLiquid = condensed > 0.001 && st.freeze < 1;
  st.snowFall = smoothstep(S.SNOW_START, S.SNOW_START + 1, y) * (1 - smoothstep(S.SNOW_DONE - 1, S.SNOW_DONE + 1, y));
  st.snow = smoothstep(S.SNOW_START, S.SNOW_DONE, y);

  // Water, green, people.
  st.water = smoothstep(S.WATER_START, S.WATER_FULL, y);
  st.icefall = (y > S.ICEFALL_START && y < S.ICEFALL_END) ? 1 : 0;
  st.waterRain = smoothstep(S.ICEFALL_START, S.ICEFALL_START + 1, y) * (1 - smoothstep(S.ICEFALL_END, S.ICEFALL_END + 3, y));
  st.green = smoothstep(S.GREEN_START, 185, y);
  st.tents = smoothstep(S.TENTS_UP, S.TENTS_UP + 4, y) * (1 - smoothstep(S.TENTS_DOWN - 2, S.TENTS_DOWN + 3, y));
  st.town = smoothstep(S.TOWN_START, 195, y);
  st.clouds = smoothstep(S.WATER_START - 1, S.WATER_START + 6, y);
  st.pipes = smoothstep(S.PIPES_UP, S.PIPES_UP + 3, y) * (1 - smoothstep(S.PIPES_DOWN - 4, S.PIPES_DOWN, y));

  // Optics. Rayleigh optical depth scales with the column mass; CO2 scatters about
  // 2.4 times as strongly as air per molecule. Venus's g is 8.87 m/s².
  const g = 8.87, colEarth = 101325 / 9.81;
  st.tauR = 0.097 * ((co2 * 1e5 / g) / colEarth * 2.4 * 29 / 44 + ((n2 + o2) * 1e5 / g) / colEarth);
  const molar = (co2 * 44 + n2 * 28 + o2 * 32) / Math.max(st.P, 1e-3);
  st.H = 8.314 * T / (molar / 1000 * g);

  // The floating colony: at the 1-bar level (about 50 km up today), 15 km by year 55,
  // 8 km by 90, on the water by 150 (Birch §8 and §11).
  const alt = y < 15 ? 50000 : y < 55 ? lerp(50000, 15000, (y - 15) / 40) : y < 90 ? lerp(15000, 8000, (y - 55) / 35) : lerp(8000, 3000, smoothstep(90, S.COLONY_LAND - 6, y));
  st.colonyAlt = y < S.COLONY_LAND - 6 ? alt : lerp(3000, 0, smoothstep(S.COLONY_LAND - 6, S.COLONY_LAND, y));
  return st;
}

// One caption per stage, in San's voice.
export const CAPTIONS = {
  today: 'Venus as it is. Ninety times the air pressure of Earth and hot enough to melt lead. The light comes down through sulphuric acid clouds, dim and orange. Machines are already working high above, where the air is cool.',
  shade: 'A sunshade goes up between Venus and the Sun, about twice as wide as the planet. It is mostly mirror. The light fades over a few years. Then it is night, for over a century.',
  rain: 'The air cools. The acid clouds rain out, and for the first time the rain reaches the ground. The sky clears, but the air is still too thick to see the stars through.',
  seas: 'Below 31 °C the carbon dioxide starts to rain as a liquid. It runs downhill and fills the lowlands, and the air thins as it goes. The stars come out slowly, one decade at a time.',
  snow: 'At minus 57 °C the seas freeze. The rest of the carbon dioxide falls as snow, and about two bar of nitrogen is left.',
  paving: 'Then everything is paved over, to keep the carbon dioxide frozen when the light comes back. Hexagons of hollow blocks are lowered onto the frozen sea. On land, sheets of plastic go down over the snow, strip by strip.',
  soil: 'A mirror in orbit starts giving Venus a day, 24 hours long. It is the first sunrise in more than a hundred years. Soil goes on top of the paving.',
  water: 'Water comes from an ice moon, broken into pieces and dropped in over fourteen years. It rains for months after each one. A sea fills on top of the paving.',
  green: 'Plants turn the leftover carbon dioxide into oxygen. Farms start under big tents and spread out. The floating colonies come down onto the new sea and become islands.',
};

// The slider runs through the story, not linearly through the years: each stage gets
// a share of the track, so the busy early decades are as easy to reach as the long
// quiet ones. u is 0..1 along the track.
const WEIGHTS = { today: 0.9, shade: 0.9, rain: 1.0, seas: 1.5, snow: 1.1, paving: 1.4, soil: 1.0, water: 1.0, green: 1.6 };
const TOTAL_W = STAGES.reduce((s, st) => s + WEIGHTS[st.id], 0);
export const STORY = (() => {
  let u = 0;
  return STAGES.map(st => { const w = WEIGHTS[st.id] / TOTAL_W; const seg = { ...st, u0: u, u1: u + w }; u += w; return seg; });
})();
export function yearToStory(y) {
  for (const s of STORY) if (y <= s.end) return s.u0 + (s.u1 - s.u0) * clamp((y - s.start) / (s.end - s.start), 0, 1);
  return 1;
}
export function storyToYear(u) {
  for (const s of STORY) if (u <= s.u1) return s.start + (s.end - s.start) * clamp((u - s.u0) / (s.u1 - s.u0), 0, 1);
  return YEAR_MAX;
}

// What the visitor does at each stage: a verb, the years it plays to, and whether it
// is done by hand (paving, soil) before the colonies take over.
export const ACTIONS = [
  { from: 0, to: 4.9, verb: 'Put up the shade', play: 10, orbit: 'shade' },
  { from: 4.9, to: 19.9, verb: 'Let it cool', play: 22 },
  { from: 19.9, to: 89.9, verb: 'Let the air rain out', play: 90 },
  { from: 89.9, to: 110.05, verb: 'Let it freeze', play: 110.2 },
  { from: 110.05, to: 124.9, verb: 'Lay the paving', hand: 'pave', hold: 110.2, finish: 'Let the colonies finish', play: 125 },
  { from: 124.9, to: 126.05, verb: 'Turn on the mirror', play: 126.2 },
  { from: 126.05, to: 135.9, verb: 'Spread the soil', hand: 'soil', hold: 126.2, finish: 'Let the machines finish', play: 136.2 },
  { from: 135.9, to: 149.9, verb: 'Drop the ice moon', play: 150 },
  { from: 149.9, to: 199.9, verb: 'Plant', play: 200 },
];
export function actionAt(y) { return ACTIONS.find(a => y >= a.from && y < a.to) || null; }

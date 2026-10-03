/*
 * The world outside the window: Another Sky's geometry, unchanged.
 *
 * Every constant and land function below is copied from /another-sky/explorer.js
 * (R, LENGTH, LAKES, CITY, terrain, lakeField, urban, the Longwater Bridge, the
 * transit rings, the luminaire lines, the trail from Firstlight Overlook). The
 * painting is projected from these, so the view is of the place visitors walk.
 * Habitat coordinates: s = arc around the cylinder, z = along the axis,
 * h = height inward from the shell. Metres.
 */
(function (W) {
'use strict';
const TAU = Math.PI * 2, R = 12000, LENGTH = 56000, HALF = LENGTH / 2, CIRC = TAU * R;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { let t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = s => ((s + CIRC / 2) % CIRC + CIRC) % CIRC - CIRC / 2;
const deltaS = (a, b) => wrap(a - b);
const hash = (a, b) => { let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

const LAKES = [[-1900,-2100,4250,6600],[11900,-6500,3750,8200],[-17300,-2200,4600,8600],[29200,7300,3900,10200],[-30700,-19500,5200,5300],[5600,18300,4300,7200],[-11500,19000,5000,5900],[23000,-22100,3450,4600]];
const CITY = [
[3450,1250,2400],[5900,-13600,2800],[-8400,-11600,2900],[-7150,4100,2450],[17800,-8300,3200],[15500,14600,2700],[-19800,-16600,2700],[-25300,5000,3400],[-36500,-6100,3700],[29200,-12900,3050],[23800,20800,2600],[-4200,23200,2900],[2100,-24500,2650],[-32200,21100,2900],[-18300,9800,2800],[19000,3500,2400],[6200,6200,2700],[-5000,-20700,2500],[-28000,-6000,3000],[34500,13500,2350],[35600,-20000,3100],[-23600,23900,2350],[10400,-23300,2400],[-4000,11600,2250]
];
// Same as the explorer's, except lakes more than three radii away are skipped: they
// could only return values above 1.9, which never make water or change the land.
function lakeField(s, z) { let d = 9; for (let i = 0; i < LAKES.length; i++) { const l = LAKES[i], zz = z - l[1]; if (zz > l[3] * 3 || zz < -l[3] * 3) continue; const sx = deltaS(s, l[0]); if (sx > l[2] * 3 || sx < -l[2] * 3) continue; const e = Math.sqrt((sx / l[2]) ** 2 + (zz / l[3]) ** 2); const wiggle = .049 * Math.sin(sx / 670 + zz / 920) + .029 * Math.sin(zz / 390 - sx / 860); d = Math.min(d, e - 1 + wiggle); } return d; }
function terrainParts(s, z) {
  s = wrap(s); const field = lakeField(s, z);
  let h = 69 + 30 * Math.sin(s / 1750 + .9 * Math.sin(z / 3300)) + 24 * Math.sin(z / 1920 + s / 3280) + 11 * Math.sin(s / 480 + z / 580) + 8 * Math.cos(z / 330 - s / 740);
  let hs = deltaS(s, 1550), hz = z - 4250; h += 124 * Math.exp(-(hs * hs + hz * hz) / (920 * 920));
  h += 195 * Math.exp(-((deltaS(s, -6600) / 1900) ** 2 + ((z - 13500) / 2000) ** 2));
  h += 160 * Math.exp(-((deltaS(s, 25000) / 1750) ** 2 + ((z + 3000) / 3000) ** 2));
  const water = 1 - smooth(-.19, .16, field);
  return { h: lerp(h, -155 - 22 * Math.sin(s / 1700) * Math.cos(z / 2700), water), field };
}
function terrain(s, z) { return terrainParts(s, z).h; }
function urban(s, z) { let u = 0; for (let i = 0; i < CITY.length; i++) { const c = CITY[i], x = deltaS(s, c[0]) / c[2], y = (z - c[1]) / c[2], d = x * x + y * y; if (d < 8) u = Math.max(u, Math.exp(-d * .80)); } return u; }
// The explorer's vegetation channel (map texture "b"): darker groves where it is low.
function greenery(s, z) { return clamp(.5 + .25 * Math.sin(s / 530) * Math.cos(z / 650) + .17 * Math.sin(z / 1830 + s / 1200), 0, 1); }
// The explorer's field tone: one value per 280 x 370 m field.
function fieldTone(s, z) { return fract(Math.sin((Math.floor(s / 280) * 127.1 + Math.floor(z / 370) * 311.7)) * 43758.5453); }
function fract(x) { return x - Math.floor(x); }

function pos(s, z, h = 0) { const t = s / R, r = R - h; return [Math.sin(t) * r, -Math.cos(t) * r, z]; }
function upAt(s) { return [-Math.sin(s / R), Math.cos(s / R), 0]; }
function tangentAt(s) { return [Math.cos(s / R), Math.sin(s / R), 0]; }
function toHab(p) { const r = Math.hypot(p[0], p[1]); return { s: Math.atan2(p[0], -p[1]) * R, z: p[2], h: R - r, r }; }

const BRIDGES = [{ s0: -5940, s1: 2630, z: 1600, h: 112, width: 46, name: 'Longwater Bridge' }, { s0: 7750, s1: 16000, z: -6500, h: 125, width: 36, name: 'Eastwater Crossing' }, { s0: -21900, s1: -12400, z: -2700, h: 108, width: 40, name: 'Verdant Crossing' }];
function bridgeH(b, s) { return b.h + 18 * Math.sin((s - b.s0) / (b.s1 - b.s0) * Math.PI); }
const RING_Z = [-25300, -15500, -4300, 8200, 21600];
const RING_R = R - 1060, HOOP_R = R - 85;
// Trains: the explorer runs three per ring at 105-170 m/s. Here speeds are fixed so
// a train is where the clock says it should be.
const TRAINS = [];
for (let i = 0; i < RING_Z.length; i++) for (let k = 0; k < 3; k++) TRAINS.push({ z: RING_Z[i] - 10, s: k / 3 * CIRC + hash(i, k) * 4000, speed: (105 + hash(k, i + 7) * 65) * (k % 2 ? -1 : 1) });
// Six lines of longitudinal luminaires, 125 m up, a 1030 m fixture every 1100 m.
const LUMINAIRE_S = [0, 1, 2, 3, 4, 5].map(j => wrap((j + .43) / 6 * CIRC));
const LUMINAIRE_Z = []; for (let i = 0; i < 50; i++) LUMINAIRE_Z.push(-HALF + 560 + i * 1100);
const AXIAL_COLLARS = [-25000, -12000, 1000, 14000, 26000];
const POI = [
  { name: 'Firstlight Overlook', s: 1515, z: 4290 }, { name: 'Meridian Waterfront', s: 3360, z: 1600 },
  { name: 'Longwater Bridge', s: -1380, z: 1600 }, { name: 'Crown Garden', s: -36480, z: -6080 },
  { name: 'Endcap Observatory', s: 480, z: -26700 }
];
function spline(points, subdiv = 12) { let out = []; for (let i = 0; i < points.length - 1; i++) { const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)]; for (let j = 0; j < subdiv; j++) { let t = j / subdiv, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(k => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); } } out.push(points.at(-1)); return out; }
const TRAIL = spline([[1515,4330],[1520,4285],[1520,4235],[1502,4125],[1550,4000],[1480,3800],[1640,3540],[1880,3400],[1990,3120],[2200,2880],[2360,2480],[2550,2130],[2590,1650]], 10);
// Deliberate trees around the overlook in the explorer.
const FRAME_TREES = [[1539, 4286, 19], [1486, 4314, 14]];

// Smooth value noise in world metres (for ragged town edges); not in the explorer.
function worldNoise(s, z, cell) { const x = s / cell, y = z / cell, ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv; }
// Small deterministic generator for things the explorer scatters at random.
function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

W.World = { TAU, R, LENGTH, HALF, CIRC, clamp, lerp, smooth, wrap, deltaS, hash, fract, LAKES, CITY, lakeField, terrain, terrainParts, urban, greenery, fieldTone, pos, upAt, tangentAt, toHab, BRIDGES, bridgeH, RING_Z, RING_R, HOOP_R, TRAINS, LUMINAIRE_S, LUMINAIRE_Z, AXIAL_COLLARS, POI, TRAIL, FRAME_TREES, rng, worldNoise };
})(typeof window !== 'undefined' ? window : globalThis);

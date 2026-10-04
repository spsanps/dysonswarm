// The master plan: one hexagonal grid over everything (Birch's unit hexagon, 1.2 km
// a side). Every hexagon gets its own dates for covering, soil and what grows on it.
// The shader has the same functions (glsl.js: hexInfo, hexSchedule); keep them in step.

import { hashU, clamp, smoothstep, vnoise } from './noise.js';
import { SCHEDULE as S } from './timeline.js';
import { heightTrue } from './terrain.js';

export const HEX_S = 1200;            // circumradius (= side), metres
export const HEX_ROT = 0.31;          // grid rotation, radians
export const HEX_A = HEX_S * Math.sqrt(3) / 2;  // apothem
export const ICE_TRUE = 1240 - 1500;  // frozen-sea surface, true m relative to the old sea level
export const SEA_ORIGIN = [-4000, 9000];        // paving starts near our shore
export const LANE = 60;               // width of one strip of sheeting or soil (m)
export const LAND_DUR = 3.5, SOIL_DUR = 3;      // years to cover one hexagon

const h01 = (i, j, k) => hashU(i * 7 + k * 131, j * 13 - k * 71) / 4294967296;
const cosR = Math.cos(HEX_ROT), sinR = Math.sin(HEX_ROT);

export function hexInfo(x, z) {
  // into grid space (rotate by -HEX_ROT)
  const qx = x * cosR + z * sinR, qy = -x * sinR + z * cosR;
  const fq = (Math.sqrt(3) / 3 * qx - qy / 3) / HEX_S, fr = (2 / 3 * qy) / HEX_S;
  let rx = Math.round(fq), ry = Math.round(fr), rz = Math.round(-fq - fr);
  const dx = Math.abs(rx - fq), dy = Math.abs(ry - fr), dz = Math.abs(rz + fq + fr);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
  const cx = HEX_S * Math.sqrt(3) * (rx + ry / 2), cy = HEX_S * 1.5 * ry;
  const lx = qx - cx, ly = qy - cy;
  const ax = Math.abs(lx), ay = Math.abs(ly);
  const edge = HEX_A - Math.max(ax, ax * 0.5 + ay * 0.8660254);
  return {
    i: rx, j: ry, edge,
    cx: cx * cosR - cy * sinR, cz: cx * sinR + cy * cosR,  // centre back in world space
    lx, ly,                                                // local, grid-aligned
  };
}

export function hexCenter(i, j) {
  const cx = HEX_S * Math.sqrt(3) * (i + j / 2), cy = HEX_S * 1.5 * j;
  return [cx * cosR - cy * sinR, cx * sinR + cy * cosR];
}

// Per-hexagon dates (mirrors glsl.js hexSchedule). `floorTrue` is the terrain at the
// centre (true m relative to the old CO2 sea level).
export const COLONY_XZ = [-31486.3, 17453.1];
export const TOWN_XZ = [-6847.0, -1455.4];
export function hexSchedule(i, j, floorTrue) {
  const r0 = h01(i, j, 0), r1 = h01(i, j, 1), r2 = h01(i, j, 2), r3 = h01(i, j, 3);
  const [cx, cz] = hexCenter(i, j);
  const sea = floorTrue < -2;
  const out = { sea, r0, r1, r2, r3, town: 0, island: false, islandT: 1e9 };
  const seaRank = clamp(Math.pow(clamp(Math.hypot(cx - SEA_ORIGIN[0], cz - SEA_ORIGIN[1]) / 95000, 0, 1), 0.8) + (r0 - 0.5) * 0.08, 0, 1);
  out.seaPave = S.PAVE_SEA_START + S.PAVE_SEA_SPAN * seaRank;
  const rank = clamp(Math.pow(clamp(Math.max(floorTrue, 0) / 2600, 0, 1), 0.7) + (r0 - 0.5) * 0.12, 0, 1);
  out.pave = S.PAVE_LAND_START + (S.PAVE_LAND_SPAN - LAND_DUR) * rank;
  out.soil = S.SOIL_START + (S.SOIL_SPAN - SOIL_DUR) * clamp(rank + (r2 - 0.5) * 0.1, 0, 1);
  if (sea) {
    const cluster = vnoise(cx / 7000 + 3.3, cz / 7000 - 1.7) + 0.35 * vnoise(cx / 2500 + 9, cz / 2500 + 9);
    out.island = cluster > 0.18 && floorTrue < -40;
    const dl = Math.hypot(cx - COLONY_XZ[0], cz - COLONY_XZ[1]);
    out.islandT = S.ISLANDS_START + S.ISLANDS_SPAN * clamp(dl / 70000, 0, 1) + r2 * 2;
  } else {
    const dt = Math.hypot(cx - TOWN_XZ[0], cz - TOWN_XZ[1]);
    out.town = (floorTrue < 260 ? 1 : 0) * smoothstep(6000, 2500, dt + r1 * 1500);
  }
  out.laneAngle = HEX_ROT + Math.PI / 2 + Math.floor(r2 * 3) * Math.PI / 3;
  out.soilAngle = out.laneAngle + Math.PI / 3;
  return out;
}

// The machines on a land hexagon's front this year: one per strip (mirrors laneCover).
export function frontMachines(info, sched, year, kind) {
  const start = kind === 'soil' ? sched.soil : sched.pave;
  const dur = kind === 'soil' ? SOIL_DUR : LAND_DUR;
  const t = (year - start) / dur;
  if (t <= 0 || t > 1.05) return [];
  const ang = kind === 'soil' ? sched.soilAngle : sched.laneAngle;
  const ux = Math.cos(ang), uz = Math.sin(ang);
  const K = Math.ceil(2 * HEX_A / LANE);
  const out = [];
  for (let k = 0; k < K; k++) {
    const jit = (h01(info.i, info.j, 10 + k) - 0.5) * 0.08;
    const front = -HEX_S + (t - jit) * 2 * HEX_S;
    const vv = -HEX_A + (k + 0.5) * LANE;
    const x = info.cx + ux * front - uz * vv, z = info.cz + uz * front + ux * vv;
    const back = hexInfo(x, z);
    if (back.i !== info.i || back.j !== info.j || back.edge < 15) continue;
    out.push({ x, z, heading: ang });
  }
  return out;
}

export function floorAt(i, j) {
  const [cx, cz] = hexCenter(i, j);
  return heightTrue(cx, cz);
}

// The year the front of sheet (or soil) reaches the point (x, z) on land, mirroring
// the shader's laneCover().
export function laneTime(x, z, kind) {
  const info = hexInfo(x, z);
  const sc = hexSchedule(info.i, info.j, heightTrue(info.cx, info.cz));
  const start = kind === 'soil' ? sc.soil : sc.pave;
  const dur = kind === 'soil' ? SOIL_DUR : LAND_DUR;
  const ang = kind === 'soil' ? sc.soilAngle : sc.laneAngle;
  const ux = Math.cos(ang), uz = Math.sin(ang);
  const lx = x - info.cx, lz = z - info.cz;
  const uu = lx * ux + lz * uz, vv = -lx * uz + lz * ux;
  const k = Math.floor((vv + HEX_A) / LANE);
  const jit = (h01(info.i, info.j, 10 + k) - 0.5) * 0.08;
  return start + ((uu + HEX_S) / (2 * HEX_S) + jit) * dur;
}

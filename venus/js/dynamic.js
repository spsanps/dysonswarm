// Things that move or come and go with the years: the floating colony, the heat
// pipes, the floaters that lower the cover hexagons, the crawlers that lay sheet and
// soil, and every light they carry. Rebuilt each frame from the year (cheap: a few
// hundred instances).

import { mesh, setInstances, drawMesh, program, setUniforms } from './gl.js';
import * as M from './meshes.js';
import { KIND, groundAt } from './objects.js';
import { hexInfo, hexCenter, hexSchedule, frontMachines, HEX_S } from './plan.js';
import { heightTrue, EXAGGERATION } from './terrain.js';
import { SCHEDULE as S } from './timeline.js';
import { LIGHT_VS, LIGHT_FS } from './glsl.js';
import { clamp, lerp, smoothstep, mulberry } from './noise.js';
const KIND_CABLE = 16;

const LAYOUT = [4, 4, 4, 4];
const D2R = Math.PI / 180;

// Birch's heat pipe (§3.3, Fig. 2): a tower from the ground to about the 1-bar level,
// fluted at both ends. Unit height, unit foot radius.
function heatPipe() {
  return M.merge(
    M.cylinder(12, 1.0, 0.16, 0.06, 0, false),
    M.cylinder(12, 0.16, 0.12, 0.88, 0.06, false),
    M.cylinder(12, 0.12, 0.9, 0.06, 0.94, true),
  );
}
function floater() {
  const { v, f } = M.icosphere(2);
  const env = M.flat(f.map(t => t.map(i => [v[i][0], v[i][1] * 0.28 + 0.55, v[i][2] * 0.62])));
  const gondola = M.box(0.32, 0.08, 0.16, 0.2);
  return M.merge(env, gondola);
}
function crawler() {
  return M.merge(
    M.box(1.0, 0.22, 0.62, 0.0),     // tracks
    M.box(0.86, 0.36, 0.56, 0.22),   // body
    M.box(0.26, 0.26, 0.4, 0.58),    // cab
    M.transform(M.cylinder(10, 0.17, 0.17, 0.7, 0, true), { t: [-0.62, 0.22, -0.35] }),  // the roll of sheet
  );
}
function dome() {
  const { v, f } = M.icosphere(2);
  return M.flat(f.filter(t => t.every(i => v[i][1] > -0.05)).map(t => t.map(i => [v[i][0], Math.max(v[i][1], 0), v[i][2]])));
}

export class Dynamic {
  constructor(gl) {
    this.gl = gl;
    this.m = {
      hull: mesh(gl, M.hexPrism(1, 0.04), LAYOUT),
      dome: mesh(gl, dome(), LAYOUT),
      floater: mesh(gl, floater(), LAYOUT),
      pipe: mesh(gl, heatPipe(), LAYOUT),
      block: mesh(gl, M.hexPrism(1, 0.0), LAYOUT),
      cable: mesh(gl, M.box(1, 1, 1, 0), LAYOUT),
      crawler: mesh(gl, crawler(), LAYOUT),
    };
    this.lightProg = program(gl, LIGHT_VS(), LIGHT_FS(), 'lights');
    this.lightVAO = gl.createVertexArray();
    this.lightBuf = gl.createBuffer();
    gl.bindVertexArray(this.lightVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    this.lightCount = 0;
    this.hexes = null;
    // heat pipes: azimuth (deg), distance (m)
    this.pipes = [[232, 21000], [251, 34000], [268, 15000], [283, 27000], [244, 52000]];
  }

  // Cache the hexagons around a viewpoint with their dates.
  prepare(cam) {
    const list = [];
    const R = 70000;
    const c = hexInfo(cam[0], cam[2]);
    const n = Math.ceil(R / (HEX_S * 1.5)) + 2;
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const i = c.i + di, j = c.j + dj;
      const [x, z] = hexCenter(i, j);
      const d = Math.hypot(x - cam[0], z - cam[2]);
      if (d > R) continue;
      const floor = heightTrue(x, z);
      const sc = hexSchedule(i, j, floor);
      list.push({ i, j, x, z, d, floor, sc, info: { i, j, cx: x, cz: z } });
    }
    list.sort((a, b) => a.d - b.d);
    this.hexes = list;
  }

  update(year, time, cam, st, L, townLights, userHexes = [], clock = 0) {
    const gl = this.gl;
    const inst = { hull: [], dome: [], floater: [], block: [], cable: [], crawler: [], pipe: [] };
    const lights = [];
    const put = (arr, x, y, z, yaw, sx, sy, sz, kind, col = [1, 1, 1], seed = 0) =>
      arr.push(x, y, z, yaw, sx, sy, sz, kind, col[0], col[1], col[2], seed, -1000, 100000, 0.01, 0);
    const LK = 0.022;
    const lamp = (x, y, z, size, r, g, b, seed = 0) => lights.push(x, y, z, size, r * LK, g * LK, b * LK, seed);
    const nightK = L.night;

    // ── the floating colony (Birch §8): far and high at first, coming down and in ──
    {
      // It rides near the 1-bar level. Its path is chosen so it stays in view.
      const approach = smoothstep(100, 266, year);
      const D = lerp(125000, 36000, approach);
      const az = lerp(236, 242, approach) * D2R;
      const el = lerp(7.5, 1.2, Math.pow(approach, 1.4)) * D2R;
      const alt = Math.tan(el) * D + D * D / (2 * 6051800) + cam[1];
      const landed = smoothstep(S.COLONY_LAND - 2, S.COLONY_LAND, year);
      const waterY = 4 * EXAGGERATION;  // the full sea level
      const y = lerp(alt, waterY - 300, landed);
      const x = cam[0] + Math.sin(az) * D, z = cam[2] - Math.cos(az) * D;
      const R = 11000;
      put(inst.hull, x, y, z, 0.2, R, 650, R, KIND.colony);
      // its city of domes on top (seen once it is down)
      const r = mulberry(77);
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2 + r(), d = k === 0 ? 0 : R * (0.35 + r() * 0.35);
        const rr = (k === 0 ? 3200 : 1500 + r() * 1200);
        put(inst.dome, x + Math.cos(a) * d, y + 650, z + Math.sin(a) * d, 0, rr, rr * 0.55, rr, KIND.dome);
      }
      // rim lights and the underside lit by its own mirrors
      const vis = 1;
      for (let k = 0; k < 36; k++) {
        const a = 0.2 + Math.PI / 6 + k / 36 * Math.PI * 2;
        const rr = R * 0.97;
        lamp(x + Math.cos(a) * rr, y + 200, z + Math.sin(a) * rr, 240, 3.2 * vis, 2.4 * vis, 1.5 * vis, k);
      }
      if (landed > 0.5) for (let k = 0; k < 60; k++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * R * 0.85;
        lamp(x + Math.cos(a) * d, y + 900 + r() * 600, z + Math.sin(a) * d, 120, 0.25 * nightK, 0.17 * nightK, 0.08 * nightK, k);
      }
      this.colony = { x, y, z, R };
    }

    // ── heat pipes (Birch §3.3): towers up into the cool air, a chain of beacons each ──
    if (st.pipes > 0.01) {
      for (const [azd, D] of this.pipes) {
        const az = azd * D2R;
        const x = cam[0] + Math.sin(az) * D, z = cam[2] - Math.cos(az) * D;
        const gy = heightTrue(x, z) * EXAGGERATION;
        const H = Math.min(st.colonyAlt * 0.9, 42000) * st.pipes;
        put(inst.pipe, x, gy - 100, z, 0, 260, H, 260, KIND.pipe);
        for (let hh = 2500; hh < H; hh += 3200) lamp(x, gy + hh, z, 60, 1.6, 0.30, 0.10, hh + D);
        lamp(x, gy + H, z, 160, 2.0, 1.7, 1.3, D);
      }
    }

    // ── paving: floaters lowering hexagons onto the frozen sea; crawlers on land ──
    const machines = [];
    if (this.hexes && year > S.PAVE_SEA_START - 2 && year < S.SOIL_START + S.SOIL_SPAN + 2) {
      let floaters = 0, crawlers = 0;
      for (const h of this.hexes) {
        const sc = h.sc;
        if (sc.sea) {
          const lead = 1.4;
          if (floaters < 26 && year > sc.seaPave - lead && year < sc.seaPave + 0.25) {
            const t = clamp((year - (sc.seaPave - lead)) / lead, 0, 1);
            const iceY = 0.24 * Math.min(h.floor * EXAGGERATION, 0);
            const fy = iceY + 760;
            const blockY = lerp(fy - 700, iceY + 4, smoothstep(0.15, 1, t));
            const yaw = 0.31;
            put(inst.floater, h.x, fy, h.z, yaw, 1100, 520, 1100, KIND.floater);
            if (year < sc.seaPave) {
              put(inst.block, h.x, blockY, h.z, yaw + Math.PI / 6 * 0, HEX_S * 0.98, 6 * EXAGGERATION, HEX_S * 0.98, KIND.block);
              for (let k = 0; k < 3; k++) {
                const a = yaw + Math.PI / 6 + k * Math.PI * 2 / 3;
                const cx = h.x + Math.cos(a) * HEX_S * 0.6, cz = h.z + Math.sin(a) * HEX_S * 0.6;
                put(inst.cable, cx, blockY, cz, 0, 14, fy - blockY - 300, 14, KIND.block + 1);
              }
            }
            lamp(h.x, fy - 420, h.z, 50, 2.2, 1.5, 0.75, h.i);
            for (let k = 0; k < 6; k++) {
              const a = yaw + Math.PI / 6 + k * Math.PI / 3;
              lamp(h.x + Math.cos(a) * 1300, blockY + 40, h.z + Math.sin(a) * 1300, 30, 1.6, 1.0, 0.45, k + h.j);
            }
            floaters++;
          }
          // welding crews on the seams of new hexagons
          if (year > sc.seaPave && year < sc.seaPave + 3 && year < S.SOLETTA + 6 && h.d < 40000) {
            const iceY = 0.24 * Math.min(h.floor * EXAGGERATION, 0) + 6;
            for (let k = 0; k < 2; k++) {
              const a = 0.31 + Math.PI / 6 + ((h.i * 7 + h.j * 3 + k * 3) % 6) * Math.PI / 3 + (year - sc.seaPave) * 0.7;
              lamp(h.x + Math.cos(a) * HEX_S * 0.9, iceY, h.z + Math.sin(a) * HEX_S * 0.9, 40, 6.0, 4.2, 2.2, k);
            }
          }
        } else if (h.d < 9000 && crawlers < 90) {
          for (const kind of ['sheet', 'soil']) {
            const list = frontMachines(h.info, sc, year, kind === 'soil' ? 'soil' : 'pave');
            for (const pos of list) {
              if (crawlers >= 90) break;
              const gy = groundAt(pos.x, pos.z, cam);
              const sz = 9;
              put(inst.crawler, pos.x, gy, pos.z, -pos.heading, sz, sz * 0.8, sz, KIND.machine);
              const fx = Math.cos(pos.heading), fz = Math.sin(pos.heading);
              lamp(pos.x + fx * 6, gy + 5, pos.z + fz * 6, 2.2, 7.0, 5.2, 3.0, crawlers);
              lamp(pos.x - fx * 4, gy + 6, pos.z - fz * 4, 1.6, 5.0, 2.2, 0.8, crawlers + 7);
              machines.push([pos.x + fx * 8, gy + 6, pos.z + fz * 8, kind === 'soil' && L.night < 0.5 ? 0.0 : 0.6]);
              crawlers++;
            }
          }
        }
      }
    }
    // hexagons the visitor is working by hand: a floater lowers a cover block onto the
    // frozen sea; on land a front of machines lays sheet or soil
    for (const u of userHexes) {
      const tt = clock - u.t0;
      if (u.kind === 'sea' && tt < 12) {
        const floorR = heightTrue(u.x, u.z) * EXAGGERATION;
        const iceY = 0.24 * Math.min(floorR, 0);
        const fy = iceY + 760;
        if (tt < 4.5) {
          const p = clamp(tt / 3.2, 0, 1);
          const blockY = lerp(fy - 700, iceY + 4, smoothstep(0.1, 1, p));
          put(inst.floater, u.x, fy, u.z, 0.31, 1100, 520, 1100, KIND.floater);
          if (tt < 3.2) {
            put(inst.block, u.x, blockY, u.z, 0.31, HEX_S * 0.98, 6 * EXAGGERATION, HEX_S * 0.98, KIND.block);
            for (let k = 0; k < 3; k++) {
              const a = 0.31 + Math.PI / 6 + k * Math.PI * 2 / 3;
              put(inst.cable, u.x + Math.cos(a) * HEX_S * 0.6, blockY, u.z + Math.sin(a) * HEX_S * 0.6, 0, 14, fy - blockY - 300, 14, KIND.cable);
            }
          }
          lamp(u.x, fy - 420, u.z, 50, 2.2, 1.5, 0.75, u.i);
        }
        if (tt > 3.2) for (let k = 0; k < 3; k++) {
          const a = 0.31 + Math.PI / 6 + ((u.i * 7 + u.j * 3 + k * 2) % 6) * Math.PI / 3 + tt * 0.6;
          lamp(u.x + Math.cos(a) * HEX_S * 0.9, iceY + 8, u.z + Math.sin(a) * HEX_S * 0.9, 40, 6.0, 4.2, 2.2, k);
        }
      } else if ((u.kind === 'land' || u.kind === 'soil') && tt < 6) {
        const sc = hexSchedule(u.i, u.j, heightTrue(u.x, u.z));
        const t = tt / 5;
        const ang = u.kind === 'soil' ? sc.soilAngle : sc.laneAngle;
        const K = Math.ceil(2 * HEX_S * 0.8660254 / 60);
        for (let k = 0; k < K; k += 2) {
          const front = -HEX_S + t * 2 * HEX_S;
          const vv = -HEX_S * 0.8660254 + (k + 0.5) * 60;
          const ux = Math.cos(ang), uz = Math.sin(ang);
          const x = u.x + ux * front - uz * vv, z = u.z + uz * front + ux * vv;
          const back = hexInfo(x, z);
          if (back.i !== u.i || back.j !== u.j || back.edge < 15) continue;
          const gy = groundAt(x, z, cam);
          put(inst.crawler, x, gy, z, -ang, 9, 7, 9, KIND.machine);
          lamp(x + ux * 6, gy + 5, z + uz * 6, 2.2, 7.0, 5.2, 3.0, k);
          machines.push([x + ux * 8, gy + 6, z + uz * 8, L.night > 0.5 ? 0.6 : 0.0]);
        }
      }
    }
    // the town at night: one warm light per house once it is built
    if (townLights && townLights.length && L.night > 0.05) {
      for (let i = 0; i < townLights.length; i += 8) {
        if (year < townLights[i + 4] + 1.5 || townLights[i + 5] < 0.35) continue;
        lamp(townLights[i], townLights[i + 1], townLights[i + 2], 6, 1.0 * L.night, 0.68 * L.night, 0.34 * L.night, i);
      }
    }
    machines.sort((a, b) => Math.hypot(a[0] - cam[0], a[2] - cam[2]) - Math.hypot(b[0] - cam[0], b[2] - cam[2]));
    this.machineU = new Float32Array(32);
    machines.slice(0, 8).forEach((m, i) => this.machineU.set(m, i * 4));

    for (const k in inst) setInstances(gl, this.m[k], new Float32Array(inst[k]), inst[k].length / 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lights), gl.DYNAMIC_DRAW);
    this.lightCount = lights.length / 8;
  }

  drawSolid(objects) {
    for (const k of ['hull', 'dome', 'floater', 'block', 'cable', 'crawler', 'pipe']) drawMesh(this.gl, this.m[k]);
  }

  drawLights(U, pxPerRad) {
    const gl = this.gl, p = this.lightProg;
    if (!this.lightCount) return;
    gl.useProgram(p);
    setUniforms(gl, p, { ...U, uPxPerRad: pxPerRad });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.bindVertexArray(this.lightVAO);
    gl.drawArrays(gl.POINTS, 0, this.lightCount);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
}

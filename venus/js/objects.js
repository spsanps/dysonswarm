// Things placed in the world: rocks now, and later the machines, the colony, tents,
// houses and trees. Static things carry their own years (in, out, grow) so the GPU
// decides what is visible; moving things are rewritten each frame.

import { program, mesh, setInstances, drawMesh, setUniforms, bindTex } from './gl.js';
import { OBJECT_VS, OBJECT_FS } from './glsl.js';
import * as M from './meshes.js';
import { terrainRender, blendStand, EXAGGERATION } from './terrain.js';
import { mulberry, clamp, smoothstep, fineDetail, nearField, slabs } from './noise.js';
import { laneTime, hexInfo, hexCenter, hexSchedule, HEX_S, TOWN_XZ } from './plan.js';
import { heightTrue } from './terrain.js';
import { SCHEDULE as S } from './timeline.js';

const LAYOUT = [4, 4, 4, 4];
export const KIND = { rock: 0, machine: 1, lamp: 2, colony: 3, dome: 4, tent: 5, wall: 6, roof: 7, conifer: 8, broadleaf: 9, grass: 10, boat: 11, sail: 12, pipe: 13, floater: 14, block: 15, cable: 16, bench: 17 };

// The ground height the shader draws at (x, z) when seen from `cam`.
export function groundAt(x, z, cam) {
  const t = Math.hypot(x - cam[0], z - cam[2]);
  const fine = 1 - smoothstep(600, 4000, t);
  const sl = 1 - smoothstep(120, 260, t);
  return blendStand(x, z, terrainRender(x, z, 0) + fineDetail(x, z) * fine) + slabs(x, z) * sl;
}

export class Objects {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, OBJECT_VS(), OBJECT_FS(), 'objects');
    this.batches = {};
    const rocks = [];
    for (let i = 0; i < 7; i++) rocks.push(M.rock(101 + i * 17, i < 4 ? 0.75 : 0.35));
    // slabs lying askew, like the plates at the Venera 13 and 14 sites
    rocks.push(M.tilt(M.rock(211, 0.9), 0.22, 0.12), M.tilt(M.rock(233, 0.9), -0.3, 0.2), M.tilt(M.rock(257, 0.85), 0.12, -0.35));
    this.batches.rocks = rocks.map(g => mesh(gl, g, LAYOUT));
    const h = M.house();
    this.batches.life = {
      wall: mesh(gl, h.walls, LAYOUT), roof: mesh(gl, h.roof, LAYOUT),
      conifer: mesh(gl, M.conifer(), LAYOUT), broadleaf: mesh(gl, M.broadleaf(5), LAYOUT),
      grass: mesh(gl, M.tuft(3), LAYOUT), bench: mesh(gl, M.bench(), LAYOUT),
    };
    this.batches.tent = mesh(gl, M.tent(), LAYOUT);
    this.townLights = new Float32Array(0);
  }

  // The town, the trees, the grass and the tents: everything that arrives with the
  // green years, each with its own birth year so the GPU decides what is there.
  placeLife(view, cam) {
    const r = mulberry(4242);
    const out = { wall: [], roof: [], conifer: [], broadleaf: [], grass: [], bench: [], tent: [] };
    const lights = [];
    const put = (arr, x, y, z, yaw, sx, sy, sz, kind, col, born, grow, gone = 1e5) =>
      arr.push(x, y, z, yaw, sx, sy, sz, kind, col[0], col[1], col[2], r(), born, gone, grow, 0);
    const G = (x, z) => groundAt(x, z, cam);
    // hexagons within reach
    const c = hexInfo(cam[0], cam[2]);
    const hexes = [];
    for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) {
      const i = c.i + di, j = c.j + dj, [x, z] = hexCenter(i, j);
      const d = Math.hypot(x - cam[0], z - cam[2]);
      if (d > 15000) continue;
      const sc = hexSchedule(i, j, heightTrue(x, z));
      hexes.push({ i, j, x, z, d, sc });
    }
    const inHex = (h, x, z) => { const k = hexInfo(x, z); return k.i === h.i && k.j === h.j && k.edge > 30; };
    const wallCols = [[0.62, 0.58, 0.50], [0.66, 0.60, 0.48], [0.56, 0.52, 0.46], [0.70, 0.66, 0.58]];
    const roofCols = [[0.42, 0.19, 0.11], [0.30, 0.27, 0.25], [0.46, 0.30, 0.15], [0.36, 0.16, 0.10]];
    for (const h of hexes) {
      const sc = h.sc;
      if (sc.sea) continue;
      // the town: houses along a street grid, growing out from the harbour
      if (sc.town > 0.5) {
        const ang = sc.soilAngle;
        const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
        for (let bi = -11; bi <= 11; bi++) for (let bj = -17; bj <= 17; bj++) {
          for (let k = 0; k < 3; k++) {
            const lu = bi * 110 + (k - 1) * 30 + (r() - 0.5) * 8, lv = bj * 70 + (r() > 0.5 ? 16 : -16);
            const x = h.x + ux * lu + vx * lv, z = h.z + uz * lu + vz * lv;
            if (!inHex(h, x, z) || r() > 0.55) continue;
            const dTown = Math.hypot(x - TOWN_XZ[0], z - TOWN_XZ[1]);
            const born = S.TOWN_START + Math.min(48, dTown / 5500 * 45) + r() * 8;
            const w = 9 + r() * 7, d = 7 + r() * 5, ht = 5 + r() * 4;
            const y = G(x, z) - 0.5;
            const yaw = -ang + (r() > 0.85 ? Math.PI / 2 : 0);
            const wc = wallCols[Math.floor(r() * 4)], rc = roofCols[Math.floor(r() * 4)];
            put(out.wall, x, y, z, yaw, w, ht, d, KIND.wall, wc, born, 1.5);
            put(out.roof, x, y + 0.01, z, yaw, w, ht, d, KIND.roof, rc, born + 0.6, 1.0);
            lights.push(x, y + ht * 0.5, z, 2.5, born, r(), 0, 0);
            if (out.wall.length / 16 > 2600) break;
          }
        }
      }
      // tents over farms and the town (Birch's Fig. 5), near enough to read
      if ((sc.r3 < 0.45 || sc.town > 0.5) && h.d < 13000 && h.d > 2600) {
        const born = Math.max(S.TENTS_UP, sc.soil + 2) + r() * 4;
        put(out.tent, h.x, G(h.x, h.z) - 2, h.z, 0, HEX_S * 0.93, 26, HEX_S * 0.93, KIND.tent, [1, 1, 1], born, 1.5, S.TENTS_DOWN + r() * 6);
      }
      // woods
      if (sc.r3 >= 0.45 && sc.r3 < 0.75 && h.d < 4500) {
        const n = Math.round(2600 * (1 - h.d / 5200));
        for (let t = 0; t < n; t++) {
          const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * HEX_S * 0.95;
          const x = h.x + Math.cos(a) * rr, z = h.z + Math.sin(a) * rr;
          if (!inHex(h, x, z)) continue;
          const born = Math.max(S.GREEN_START + 6, sc.soil + 8) + r() * 22;
          const tall = 9 + r() * 14;
          const con = r() < 0.55;
          put(con ? out.conifer : out.broadleaf, x, G(x, z) - 0.5, z, r() * 6.28, tall * (con ? 0.55 : 0.8), tall, tall * (con ? 0.55 : 0.8), con ? KIND.conifer : KIND.broadleaf, [r(), 0, 0], born, 18);
        }
      }
    }
    // the headland itself: a few trees on its slopes, grass and flowers at our feet
    if (view.id === 'headland' || view.id === 'shore') {
      for (let t = 0; t < 260; t++) {
        const a = r() * Math.PI * 2, rr = 40 + Math.pow(r(), 0.7) * 600;
        const x = cam[0] + Math.cos(a) * rr, z = cam[2] + Math.sin(a) * rr;
        const y = G(x, z);
        if (y < cam[1] - 400) continue;
        const soil = laneTime(x, z, 'soil') ?? 140;
        const tall = 5 + r() * 9, con = r() < 0.6;
        put(con ? out.conifer : out.broadleaf, x, y - 0.4, z, r() * 6.28, tall * (con ? 0.5 : 0.75), tall, tall * (con ? 0.5 : 0.75), con ? KIND.conifer : KIND.broadleaf, [r(), 0, 0], Math.max(S.GREEN_START + 4, soil + 10) + r() * 20, 16);
      }
      const yaw = view.yaw * Math.PI / 180;
      const F = [Math.sin(yaw), -Math.cos(yaw)], Rt = [Math.cos(yaw), Math.sin(yaw)];
      for (let t = 0; t < 3200; t++) {
        const a = -4 + Math.pow(r(), 0.7) * 7.5, b = (r() - 0.5) * 14;
        if (a > 2.9 - 0.015 * b * b + 0.12 * Math.max(-b, 0)) continue;
        const x = cam[0] + F[0] * a + Rt[0] * b, z = cam[2] + F[1] * a + Rt[1] * b;
        const soil = laneTime(x, z, 'soil') ?? 130;
        const flower = r() < 0.06;
        const s = flower ? 0.16 + r() * 0.12 : 0.08 + r() * 0.16;
        const col = flower ? (r() < 0.5 ? [0.75, 0.62, 0.18] : [0.80, 0.78, 0.72]) : [0.09 + r() * 0.07, 0.12 + r() * 0.05, 0.035];
        put(out.grass, x, G(x, z) - 0.02, z, r() * 6.28, s, s, s, KIND.grass, col, Math.max(S.GREEN_START, soil + 3) + r() * 10, 4);
      }
      // a bench where people come to look
      // (just to your right, facing the bay; turn to see it)
      const bx = cam[0] + F[0] * 0.6 + Rt[0] * 3.6, bz = cam[2] + F[1] * 0.6 + Rt[1] * 3.6;
      put(out.bench, bx, G(bx, bz) - 0.03, bz, -yaw + Math.PI - 0.5, 1, 1, 1, KIND.bench, [0.36, 0.25, 0.16], 168, 0.6);
    }
    for (const k in this.batches.life) setInstances(this.gl, this.batches.life[k], new Float32Array(out[k]), out[k].length / 16);
    setInstances(this.gl, this.batches.tent, new Float32Array(out.tent), out.tent.length / 16);
    this.townLights = new Float32Array(lights);
  }

  // Place the rocks around a viewpoint (deterministic per viewpoint). The headland
  // gets a composed foreground; elsewhere rocks are scattered.
  placeRocks(view, cam) {
    const r = mulberry(7 + view.x * 13 + view.z * 7);
    const per = this.batches.rocks.map(() => []);
    const yaw = view.yaw * Math.PI / 180;
    const F = [Math.sin(yaw), -Math.cos(yaw)], Rt = [Math.cos(yaw), Math.sin(yaw)];
    const at = (a, b) => [cam[0] + F[0] * a + Rt[0] * b, cam[2] + F[1] * a + Rt[1] * b];
    const push = (x, z, sx, sy, sz, yawR, proto = -1, bury = 0.28) => {
      const k = proto >= 0 ? proto : Math.floor(r() * per.length);
      const y = groundAt(x, z, cam) - sy * bury - 0.05;
      const pave = laneTime(x, z, 'pave') ?? 1e5, soil = laneTime(x, z, 'soil') ?? 1e5;
      // rocks are covered by the sheet, then sink under the soil over a couple of years
      per[k].push(x, y, z, yawR, sx, sy, sz, KIND.rock, r(), pave, soil, r(), -1000, soil + 0.5 + r() * 2, 2.5, 0);
    };
    if (view.id === 'headland') {
      // the repoussoir: boulders massed at lower left, cut by the frame; low slabs at
      // right; broken plates along the lip
      let [x, z] = at(3.6, -2.7); push(x, z, 2.3, 1.5, 1.8, yaw + 0.4, 5, 0.1);
      [x, z] = at(2.3, -2.0); push(x, z, 1.3, 0.75, 1.0, yaw + 2.1, 4, 0.12);
      [x, z] = at(5.2, -3.9); push(x, z, 1.8, 1.1, 1.4, yaw - 1.2, 6, 0.1);
      [x, z] = at(1.7, -1.35); push(x, z, 0.6, 0.25, 0.5, yaw + 0.9, 7, 0.2);
      [x, z] = at(2.6, 1.9); push(x, z, 0.8, 0.32, 0.6, yaw - 0.9, 8, 0.15);
      [x, z] = at(2.0, 1.1); push(x, z, 0.45, 0.16, 0.35, yaw + 1.7, 9, 0.2);
      for (let i = 0; i < 16; i++) {
        const b = -1.6 + i * 0.3 + (r() - 0.5) * 0.3;
        const edge = 3.0 - 0.015 * b * b + 0.12 * Math.max(-b, 0);
        const a = edge - 0.5 + r() * 0.8;
        [x, z] = at(a, b * (1 + a * 0.12));
        const sz = 0.2 + Math.pow(r(), 1.5) * 0.55;
        push(x, z, sz, sz * (0.2 + r() * 0.2), sz * (0.6 + r() * 0.5), r() * 6.28, 7 + Math.floor(r() * 3), 0.15);
      }
      // small stones and chips on the platform
      for (let i = 0; i < 60; i++) {
        const a = -6 + r() * 9, b = -12 + r() * 24;
        if (a > 2.6 - 0.015 * b * b) continue;
        [x, z] = at(a, b);
        const s = 0.12 + Math.pow(r(), 2.5) * 0.7;
        push(x, z, s * (0.8 + r() * 0.6), s * (0.3 + r() * 0.3), s * (0.8 + r() * 0.6), r() * 6.28);
      }
      // the broken edge and the talus below it
      for (let i = 0; i < 90; i++) {
        const a = 5 + Math.pow(r(), 0.8) * 9, b = -16 + r() * 32;
        [x, z] = at(a, b);
        const s = 0.2 + Math.pow(r(), 2) * 0.9;
        push(x, z, s, s * (0.4 + r() * 0.4), s * (0.7 + r() * 0.6), r() * 6.28);
      }
      for (let i = 0; i < 220; i++) {
        const a = 14 + Math.pow(r(), 1.3) * 300, b = (r() - 0.5) * (40 + a * 1.2);
        [x, z] = at(a, b);
        const s = 0.3 + Math.pow(r(), 2.2) * (0.6 + a * 0.012);
        push(x, z, s, s * (0.45 + r() * 0.4), s * (0.7 + r() * 0.6), r() * 6.28);
      }
    } else {
      for (let i = 0; i < 260; i++) {
        const a = 2 + Math.pow(r(), 1.4) * 260, b = (r() - 0.5) * (30 + a * 1.4);
        const [x, z] = at(a, b);
        const s = 0.3 + Math.pow(r(), 2.4) * 2.5;
        push(x, z, s, s * (0.4 + r() * 0.4), s * (0.7 + r() * 0.6), r() * 6.28);
      }
    }
    this.batches.rocks.forEach((b, i) => setInstances(this.gl, b, new Float32Array(per[i]), per[i].length / 16));
  }

  // the tents: a glossy, mostly clear membrane, drawn after everything solid
  drawTransparent(uniforms, textures) {
    const gl = this.gl, p = this.prog;
    if (!this.batches.tent.instances) return;
    gl.useProgram(p);
    let unit = 0;
    for (const k in textures) bindTex(gl, p, k, textures[k], unit++);   // rebind: the weather pass used unit 0
    setUniforms(gl, p, { ...uniforms, uTransparent: 1 });
    if (uniforms.uPoster > 0.5) gl.disable(gl.BLEND); else { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
    gl.depthMask(uniforms.uPoster > 0.5); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    drawMesh(gl, this.batches.tent);
    gl.depthMask(true); gl.disable(gl.BLEND);
    setUniforms(gl, p, { uTransparent: 0 });
  }

  draw(frame, uniforms, textures, extra) {
    const gl = this.gl, p = this.prog;
    gl.useProgram(p);
    let unit = 0;
    for (const k in textures) bindTex(gl, p, k, textures[k], unit++);
    setUniforms(gl, p, uniforms);
    gl.uniform4fv(p.u('uMachines[0]'), frame.machines);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    for (const b of this.batches.rocks) drawMesh(gl, b);
    for (const k in this.batches.life) drawMesh(gl, this.batches.life[k]);
    if (extra) extra();
  }
}

// The renderer: a G-buffer of light and cell ids, then cloisonné enamel made from it.
import * as G from './gl.js';
import * as SH from './shaders.js';
import { R, CELL, V, NEP_DIST, NEP_R, heightAt, tangentFrame } from './world.js';
import { DISH, GEYSERS } from './machine.js';

const F32 = new Float32Array(1);
const fround = x => { F32[0] = x; return F32[0]; };

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    const P = (vs, fs, n) => G.program(gl, vs, fs, n);
    const FS = SH.FULLSCREEN_VS;
    this.p = {
      region: P(FS, SH.REGION_FS, 'region'), sky: P(FS, SH.SKY_FS, 'sky'),
      terrain: P(SH.TERRAIN_VS, SH.TERRAIN_FS, 'terrain'), inst: P(SH.INST_VS, SH.INST_FS, 'instances'),
      lattice: P(SH.LATTICE_VS, SH.LATTICE_FS, 'lattice'), dish: P(SH.DISH_VS, SH.DISH_FS, 'dish'),
      geyser: P(FS, SH.GEYSER_FS, 'geysers'), base: P(FS, SH.ENAMEL_BASE, 'enamel'), seed: P(FS, SH.SEED_FS, 'wire seeds'),
      jfa: P(FS, SH.JFA_FS, 'wire'), blur: P(FS, SH.BLUR_FS, 'glow'), final: P(FS, SH.ENAMEL_FINAL, 'finish'),
    };
    this.empty = gl.createVertexArray();
    this.cube = this.makeCube();
    this.dish = this.makeDish();
    this.dome = this.makeDome();
    this.strip = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strip);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.inst = null; this.lat = null;
  }
  fs() { this.gl.bindVertexArray(this.empty); this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); }
  makeCube() {
    const gl = this.gl, P = [], N = [], L = [], I = [];
    // faces: 0 +X, 1 −X, 2 +Y (top), 3 −Y, 4 +Z, 5 −Z; uv = (along X or Z, up) on the sides
    const F = [[[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[-1, 0, 0], [0, 0, -1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]]];
    F.forEach(([n, u, v], f) => {
      const b = P.length / 3;
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = .5 * (n[0] + a * u[0] + c * v[0]), y = .5 * (n[1] + a * u[1] + c * v[1]) + .5, z = .5 * (n[2] + a * u[2] + c * v[2]);
        P.push(x, y, z); N.push(...n);
        const along = f === 4 || f === 5 ? x + .5 : f === 0 || f === 1 ? z + .5 : x + .5;
        L.push(f >= 4 ? (f === 4 ? .5 - x : x + .5) : along, f === 2 || f === 3 ? z + .5 : y, f);
      }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    [[P, 0], [N, 1], [L, 2]].forEach(([d, loc]) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
    this.instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const st = 64;
    [[3, 0, 3], [4, 12, 3], [5, 24, 3], [6, 36, 3], [7, 48, 4]].forEach(([loc, off, n]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, st, off); gl.vertexAttribDivisor(loc, 1); });
    gl.bindVertexArray(null);
    return { vao, count: I.length };
  }
  /** A fusion plant: a drum (face 10) under a dome (face 11), unit size like the cube: x and z in
   *  [−½, ½], y in [0, 1]. aLoc = (sector 0..1, height 0..1, face). Its own instance buffer. */
  makeDome() {
    const gl = this.gl, P = [], N = [], L = [], I = [];
    const NS = 24, DRUM = .3;
    const ring = (y, r, ny, nr, face) => { for (let i = 0; i <= NS; i++) { const t = i / NS * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); P.push(c * r, y, s * r); N.push(c * nr, ny, s * nr); L.push(i / NS, y, face); } };
    const strip = (a, b) => { for (let i = 0; i < NS; i++) I.push(a + i, b + i, a + i + 1, a + i + 1, b + i, b + i + 1); };
    ring(0, .5, 0, 1, 10); ring(DRUM, .5, 0, 1, 10); strip(0, NS + 1);
    const NR = 7;
    let prev = -1;
    for (let j = 0; j <= NR; j++) {
      const th = j / NR * Math.PI / 2, y = DRUM + (1 - DRUM) * Math.sin(th), r = .5 * Math.cos(th);
      const ny = Math.sin(th) * .5, nr = Math.cos(th) * (1 - DRUM);   // ellipse normal, before scaling
      const l = Math.hypot(ny, nr), base = P.length / 3;
      ring(y, Math.max(r, .004), ny / l, nr / l, 11);
      if (prev >= 0) strip(prev, base);
      prev = base;
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    [[P, 0], [N, 1], [L, 2]].forEach(([d, loc]) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
    this.plantBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.plantBuf);
    [[3, 0, 3], [4, 12, 3], [5, 24, 3], [6, 36, 3], [7, 48, 4]].forEach(([loc, off, n]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 64, off); gl.vertexAttribDivisor(loc, 1); });
    gl.bindVertexArray(null);
    return { vao, count: I.length };
  }
  makeDish() {
    // a 1.8 km paraboloid on a pedestal; aRS = (radial fraction, sector) — 2 on the pedestal
    const gl = this.gl, P = [], N = [], S = [], I = [];
    const RIM = 900, DEPTH = 220, NR = 18, NS = 48;
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NS; i++) {
      const r = j / NR * RIM, t = i / NS * Math.PI * 2, z = r * r / (RIM * RIM) * DEPTH;
      P.push(Math.cos(t) * r, z + 380, Math.sin(t) * r);
      const dz = 2 * r / (RIM * RIM) * DEPTH; const n = V.norm([-Math.cos(t) * dz, 1, -Math.sin(t) * dz]);
      N.push(...n); S.push(j / NR, i / NS);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NS; i++) { const a = j * (NS + 1) + i, b = a + NS + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const base = P.length / 3;
    for (let i = 0; i <= 12; i++) { const t = i / 12 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      P.push(c * 60, -40, s * 60, c * 30, 390, s * 30); N.push(c, 0, s, c, 0, s); S.push(2, i / 12, 2, i / 12); }
    for (let i = 0; i < 12; i++) { const a = base + i * 2; I.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    [[P, 0, 3], [N, 1, 3], [S, 2, 2]].forEach(([d, loc, n]) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: I.length };
  }

  /** Bake the region map and read it back for the CPU's terrain. */
  bakeRegions(W = 2048, H = 1024) {
    const gl = this.gl;
    this.regionT = G.target(gl, W, H, [{ filter: gl.LINEAR, wrapS: gl.REPEAT, wrapT: gl.CLAMP_TO_EDGE }]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.regionT.fb); gl.viewport(0, 0, W, H);
    gl.useProgram(this.p.region.p); this.fs();
    const data = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { data, W, H };
  }
  setMachine(m) {
    const gl = this.gl;
    this.fieldMap = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.fieldMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, m.fmW, m.fmH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, m.fieldMap);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    this.fmSize = [m.fmW, m.fmH];
    const n = m.fields.length;
    this.fieldTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 3, 0, gl.RGBA, gl.FLOAT, m.fieldData);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    // the lattice: one instance per span, drawn as a camera-facing ribbon
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strip); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, m.spans, gl.STATIC_DRAW);
    [[1, 0, 3], [2, 12, 3], [3, 24, 4], [4, 40, 1]].forEach(([loc, off, k]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, k, gl.FLOAT, false, 44, off); gl.vertexAttribDivisor(loc, 1); });
    gl.bindVertexArray(null);
    this.lat = { vao, count: m.spans.length / 11 };
    const dg = DISH, h = heightAt(dg);
    this.dishPos = V.mul(dg, R + h - 20);
  }
  setInstances(data, origin, plants) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    if (plants) { gl.bindBuffer(gl.ARRAY_BUFFER, this.plantBuf); gl.bufferData(gl.ARRAY_BUFFER, plants, gl.DYNAMIC_DRAW); }
    this.inst = { count: data.length / 16, origin, plants: plants ? plants.length / 16 : 0, plantData: plants };
  }
  resize(W, H) {
    const gl = this.gl;
    if (this.W === W && this.H === H) return;
    this.W = W; this.H = H;
    const del = t => { if (!t) return; gl.deleteFramebuffer(t.fb); t.tex.forEach(x => gl.deleteTexture(x)); };
    [this.gb, this.vol, this.base, this.jA, this.jB, this.gA, this.gB].forEach(del);
    const N8 = { filter: gl.NEAREST }, L8 = { filter: gl.LINEAR };
    const UI = { internal: gl.RGBA32UI, format: gl.RGBA_INTEGER, type: gl.UNSIGNED_INT, filter: gl.NEAREST };
    const I16 = { internal: gl.RGBA16I, format: gl.RGBA_INTEGER, type: gl.SHORT, filter: gl.NEAREST };
    this.gb = G.target(gl, W, H, [N8, UI], true);
    this.vol = G.target(gl, W, H, [L8]);
    this.base = G.target(gl, W, H, [L8]);
    this.jA = G.target(gl, W, H, [I16]); this.jB = G.target(gl, W, H, [I16]);
    const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
    this.gA = G.target(gl, hw, hh, [L8]); this.gB = G.target(gl, hw, hh, [L8]);
  }

  /** Draw one frame. `s` is the frame state from the app. */
  render(s) {
    const gl = this.gl, W = this.W, H = this.H, cam = s.cam, cp = cam.pos;
    const camLen = V.len(cp), far = camLen + 2.2 * R;
    const pixAng = 2 * Math.tan(cam.fovy / 2) / H;
    const camF = [fround(cp[0]), fround(cp[1]), fround(cp[2])], camLo = [cp[0] - camF[0], cp[1] - camF[1], cp[2] - camF[2]];
    const nep = V.sub([NEP_DIST, 0, 0], cp), nepD = V.len(nep);
    const common = {
      uVP: cam.vp, uLogC: 1 / Math.log2(far + 1), uSun: s.sun, uNepLit: s.nepLit, uYear: s.year, uTime: s.time,
      uFieldMap: { tex: this.fieldMap, unit: 6 }, uFields: { tex: this.fieldTex, unit: 7 }, uFieldMapSize: this.fmSize, uCamF: camF,
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gb.fb); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferuiv(gl.COLOR, 1, [0, 7, 0x7f000000, 0]);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(this.p.sky.p);
    G.uniforms(gl, this.p.sky, { uInvVP: cam.inv, uSunDir: s.sun, uNepDir: V.mul(nep, 1 / nepD), uNepAng: NEP_R / nepD,
      uNepPole: s.nepPole, uNepSpin: s.nepSpin, uPixAng: pixAng, uSS: s.ss, uLogC: common.uLogC });
    this.fs();
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    // terrain
    const tp = this.p.terrain;
    gl.useProgram(tp.p);
    G.uniforms(gl, tp, { ...common, uRegion: { tex: this.regionT.tex[0], unit: 5 }, uMinPx: 34 * s.ss, uFinRing: s.finRing, uPixAng: pixAng, uCellS: { v1: new Float32Array(CELL) } });
    const CI = new Int32Array(24), CF = new Float32Array(24);
    for (const c of s.chunks) {
      const ctr = c.center;
      for (let k = 0; k < 8; k++) for (let a = 0; a < 3; a++) { const q = ctr[a] / CELL[k], f = Math.floor(q); CI[k * 3 + a] = f; CF[k * 3 + a] = q - f; }
      G.uniforms(gl, tp, { uOff: [ctr[0] - cp[0], ctr[1] - cp[1], ctr[2] - cp[2]], uChunkF: [ctr[0], ctr[1], ctr[2]], uCI: { iv3: CI }, uCF: { v3: CF } });
      gl.bindVertexArray(c.vao); gl.drawElements(gl.TRIANGLES, s.terrainCount, gl.UNSIGNED_SHORT, 0);
    }
    // things on the ground
    if (this.inst && this.inst.count && s.finRing > 0) {
      const ip = this.p.inst, o = this.inst.origin;
      gl.useProgram(ip.p);
      G.uniforms(gl, ip, { ...common, uOrigin: [o[0] - cp[0], o[1] - cp[1], o[2] - cp[2]], uRing: s.finRing + 3000 });
      gl.bindVertexArray(this.cube.vao); gl.drawElementsInstanced(gl.TRIANGLES, this.cube.count, gl.UNSIGNED_SHORT, 0, this.inst.count);
      if (this.inst.plants) { gl.bindVertexArray(this.dome.vao); gl.drawElementsInstanced(gl.TRIANGLES, this.dome.count, gl.UNSIGNED_SHORT, 0, this.inst.plants); }
    }
    // the dish, pointing at Earth (within 2° of the Sun from here)
    if (this.dishPos && V.len(V.sub(this.dishPos, cp)) < 600e3) {
      const up = DISH, fr = tangentFrame(up);
      let ax = V.norm(V.add(s.sun, V.mul(up, Math.max(0, .15 - V.dot(s.sun, up)))));
      const xr = V.norm(V.cross(ax, fr.north)), zr = V.cross(xr, ax);
      gl.useProgram(this.p.dish.p);
      G.uniforms(gl, this.p.dish, { ...common, uOrigin: V.sub(this.dishPos, cp), uBasis: { mat3: new Float32Array([...xr, ...ax, ...zr]) } });
      gl.bindVertexArray(this.dish.vao); gl.drawElements(gl.TRIANGLES, this.dish.count, gl.UNSIGNED_SHORT, 0);
    }
    // the lattice
    if (this.lat) {
      const lp = this.p.lattice;
      gl.useProgram(lp.p);
      G.uniforms(gl, lp, { ...common, uCamHi: camF, uCamLo: camLo, uPixAng: pixAng * (s.ss > 0 ? 1 : 1), uMinNight: s.orbit ? 2 : 1, uMinDay: s.orbit ? 14 : 1, uLatW: .5 * s.ss });
      gl.bindVertexArray(this.lat.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.lat.count);
    }
    gl.disable(gl.DEPTH_TEST);
    // geysers
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.vol.fb); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const gs = GEYSERS.filter(g => V.len(V.sub(V.mul(g.p, R), cp)) < 1500e3);
    if (gs.length && s.geysers) {
      const Gp = [], Gu = [], Gw = [];
      for (const g of gs) {
        const base = V.mul(g.p, R + heightAt(g.p)), fr = tangentFrame(g.p), az = g.wind * Math.PI / 180;
        Gp.push(...V.sub(base, cp)); Gu.push(...g.p); Gw.push(...V.add(V.mul(fr.north, Math.cos(az)), V.mul(fr.east, Math.sin(az))));
      }
      while (Gp.length < 6) { Gp.push(0, 0, 0); Gu.push(0, 0, 1); Gw.push(1, 0, 0); }
      gl.useProgram(this.p.geyser.p);
      G.uniforms(gl, this.p.geyser, { uInvVP: cam.inv, uIds: { tex: this.gb.tex[1], unit: 0 }, uSun: s.sun, uTime: s.time,
        uG: { v3: new Float32Array(Gp) }, uGUp: { v3: new Float32Array(Gu) }, uGW: { v3: new Float32Array(Gw) }, uGN: { int: gs.length } });
      this.fs();
    }
    // enamel
    const dec = { uL: { tex: this.gb.tex[0], unit: 0 }, uIds: { tex: this.gb.tex[1], unit: 1 }, uRes: [W, H], uSS: s.ss };
    const pass = (prog, tgt, extra) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null); gl.viewport(0, 0, tgt ? tgt.w : W, tgt ? tgt.h : H);
      gl.useProgram(prog.p); G.uniforms(gl, prog, { ...dec, ...extra }); this.fs();
    };
    pass(this.p.base, this.base, { uInvVP: cam.inv });
    pass(this.p.seed, this.jA, {});
    let a = this.jA, b = this.jB;
    for (const st of [8, 4, 2, 1].map(x => Math.max(1, Math.round(x * s.ss)))) {
      pass(this.p.jfa, b, { uSrc: { tex: a.tex[0], unit: 2 }, uStep: { int: st } });
      [a, b] = [b, a];
    }
    const hw = this.gA.w, hh = this.gA.h;
    pass(this.p.blur, this.gA, { uSrc: { tex: this.base.tex[0], unit: 2 }, uDir: [1.6 / hw, 0], uFirst: 1 });
    pass(this.p.blur, this.gB, { uSrc: { tex: this.gA.tex[0], unit: 2 }, uDir: [0, 1.6 / hh], uFirst: 0 });
    pass(this.p.final, null, { uBase: { tex: this.base.tex[0], unit: 3 }, uJfa: { tex: a.tex[0], unit: 4 }, uGlow: { tex: this.gB.tex[0], unit: 5 },
      uVol: { tex: this.vol.tex[0], unit: 6 }, uNetW: s.netW, uFormW: 1.9 });
  }
}

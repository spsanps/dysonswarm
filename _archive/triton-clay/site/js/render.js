// The renderer: shadow map, the model, the backdrop, then shallow focus and a little glow.
import { compile, uploadMesh, setInstances, updateInstances, texture, target, freeTarget, m4, v3 } from './gl.js';
import * as S from './shaders.js';
import * as W from './world.js';
import { icosphere } from './meshes.js';

export const QUALITY = {
  high: { scale: 2, msaa: 4, shadow: 2048, taps: 32, glow: true, shadowTaps: 12 },
  medium: { scale: 1.5, msaa: 4, shadow: 2048, taps: 24, glow: true, shadowTaps: 10 },
  low: { scale: 1, msaa: 0, shadow: 1024, taps: 14, glow: false, shadowTaps: 6 },
};

function noise3D(gl) {
  // Four independent tileable value noises in one 32³ texture.
  const N = 32, P = 8, cell = N / P;
  // A fixed seed, so every visitor's clay has the same thumbprints.
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const lat = [];
  for (let c = 0; c < 4; c++) { const a = new Float32Array(P * P * P); for (let i = 0; i < a.length; i++) a[i] = rnd(); lat.push(a); }
  const data = new Uint8Array(N * N * N * 4);
  const sm = t => t * t * (3 - 2 * t);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / cell, fy = y / cell, fz = z / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const tx = sm(fx - x0), ty = sm(fy - y0), tz = sm(fz - z0);
    const X0 = x0 % P, X1 = (x0 + 1) % P, Y0 = y0 % P, Y1 = (y0 + 1) % P, Z0 = z0 % P, Z1 = (z0 + 1) % P;
    for (let c = 0; c < 4; c++) {
      const L = lat[c], g = (a, b, d) => L[(d * P + b) * P + a];
      const l = (a, b, t) => a + (b - a) * t;
      const v = l(l(l(g(X0, Y0, Z0), g(X1, Y0, Z0), tx), l(g(X0, Y1, Z0), g(X1, Y1, Z0), tx), ty), l(l(g(X0, Y0, Z1), g(X1, Y0, Z1), tx), l(g(X0, Y1, Z1), g(X1, Y1, Z1), tx), ty), tz);
      data[((z * N + y) * N + x) * 4 + c] = Math.round(v * 255);
    }
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);
  return t;
}

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.q = QUALITY.medium;
    this.items = [];
    this.stats = { frameMs: 0 };
  }

  async build(progress) {
    const gl = this.gl;
    const tick = () => new Promise(r => setTimeout(r, 0));
    progress('Rolling out the ice', 8); await tick();
    this.noise = noise3D(gl);
    const terrain = W.terrainMesh();
    progress('Pressing out the halls', 26); await tick();
    const { props, halls } = W.buildObjects();
    progress('Sanding the edges', 52); await tick();
    const ground = W.bakeGround(384);
    this.groundTex = texture(gl, ground.N, ground.N, { data: ground.data, mip: true });
    this.groundS = ground.S;
    progress('Teasing out the smoke', 70); await tick();

    const I = m4.ident();
    const add = (mesh, instances, opts = {}) => {
      const m = uploadMesh(gl, mesh.done ? mesh.done() : mesh);
      setInstances(gl, m, instances);
      const it = { m, ...opts };
      this.items.push(it);
      return it;
    };
    add(terrain, [{ model: I }], { name: 'terrain' });
    add(props, [{ model: I }], { name: 'props' });
    this.halls = halls.map(h => add(h.mesh, [{ model: h.model, colour: h.colour, params: h.params }], { name: 'hall' }));
    this.dish = add(W.dishHeadMesh(), [{ model: I }], { name: 'dish' });
    const parts = W.personParts();
    this.person = {};
    for (const [k, mesh] of Object.entries(parts)) {
      const n = (k === 'arm' || k === 'leg' || k === 'boot') ? 2 : 1;
      this.person[k] = add(mesh, new Array(n).fill(0).map(() => ({ model: I })), { name: 'person-' + k });
    }
    const puff = icosphere(2);
    for (let k = 0; k < puff.e.length; k += 4) { puff.e[k] = W.MAT.PUFF; puff.e[k + 3] = W.IDS.GEYSER; }
    this.puffs = add(puff, new Array(W.PUFF_COUNT).fill(0).map((_, i) => ({ model: I, colour: [0.5, 0, 0, 1], params: [W.IDS.GEYSER, i * 0.731, 0, 0] })), { name: 'puffs' });

    progress('Mixing the paint', 84); await tick();
    this.scene = compile(gl, S.SCENE_VS, S.SCENE_FS, 'scene');
    this.shadowProg = compile(gl, S.SHADOW_VS, S.SHADOW_FS, 'shadow');
    this.sky = compile(gl, S.QUAD_VS, S.SKY_FS, 'sky');
    this.dof = compile(gl, S.QUAD_VS, S.DOF_FS, 'dof');
    this.glow = compile(gl, S.QUAD_VS, S.GLOW_FS, 'glow');
    this.comp = compile(gl, S.QUAD_VS, S.COMPOSITE_FS, 'composite');
    this.emptyVao = gl.createVertexArray();
    progress('Setting the lights', 94); await tick();
  }

  setQuality(name, w, h, dpr) {
    this.qName = name;
    this.q = QUALITY[name];
    this.resize(w, h, dpr, true);
  }

  resize(cssW, cssH, dpr, force) {
    const gl = this.gl;
    const scale = Math.min(dpr, this.q.scale);
    // keep the pixel count sane on big screens
    let s = scale;
    const maxPx = this.q === QUALITY.high ? 4.2e6 : (this.q === QUALITY.medium ? 2.6e6 : 1.4e6);
    if (cssW * cssH * s * s > maxPx) s = Math.sqrt(maxPx / (cssW * cssH));
    const w = Math.max(2, Math.round(cssW * s)), h = Math.max(2, Math.round(cssH * s));
    if (!force && this.w === w && this.h === h) return;
    this.w = w; this.h = h; this.pxScale = s;
    gl.canvas.width = w; gl.canvas.height = h;
    freeTarget(gl, this.main); freeTarget(gl, this.half); freeTarget(gl, this.quarter);
    const samples = Math.min(this.q.msaa, gl.getParameter(gl.MAX_SAMPLES) || 0);
    this.main = target(gl, w, h, samples, true);
    this.half = target(gl, Math.max(1, w >> 1), Math.max(1, h >> 1), 0, false);
    this.quarter = target(gl, Math.max(1, w >> 2), Math.max(1, h >> 2), 0, false);
    const size = this.q.shadow;
    if (!this.shadow || this.shadow.size !== size) {
      if (this.shadow) { gl.deleteTexture(this.shadow.tex); gl.deleteFramebuffer(this.shadow.fb); }
      const tex = texture(gl, size, size, { depth: true });
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.shadow = { tex, fb, size };
    }
  }

  // Dynamic objects ------------------------------------------------------------
  updatePuffs(t, step) {
    const m = this.puffs.m, d = m.data;
    for (let i = 0; i < W.PUFF_COUNT; i++) {
      const p = W.puffAt(i, t);
      const s = Math.max(0.0001, p.size);
      d.set(m4.trs([p.x, p.y, p.z], i * 1.7 + step * 0.0, s, i * 0.9, i * 2.3), i * 24);
      d[i * 24 + 16] = p.dark;
      d[i * 24 + 17] = p.opacity;
      d[i * 24 + 21] = i * 0.731 + Math.floor(step / 3) * 0.05 * ((i % 3) - 1);
    }
    updateInstances(this.gl, m);
  }
  updateDish(dir) {
    // Point the bowl along dir, pivoting above the pedestal.
    const y = v3.norm(dir);
    const ref = Math.abs(y[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const x = v3.norm(v3.cross(ref, y)), z = v3.cross(x, y);
    const m = this.dish.m;
    m.data.set(m4.basis(x, y, z, [W.DISH.x, 1.78, W.DISH.z]), 0);
    updateInstances(this.gl, m);
  }
  updatePerson(c, groundY) {
    const P = this.person;
    const hide = !c.visible;
    const S = 0.78;
    const base = m4.mul(m4.trs([c.x || 0, (groundY || 0) + (hide ? -50 : 0), c.z || 0], c.dir || 0), m4.trs([0, 0, 0], 0, S));
    const ph = c.phase || 0;
    const swing = c.walking ? Math.sin(ph) * 0.5 : 0;
    const bob = c.walking ? Math.abs(Math.cos(ph)) * 0.025 : (c.sitting ? 0 : 0);
    let hipY = 0.3, torsoY = 0.47, legAng = [swing, -swing], legFwd = 0;
    if (c.sitting) { hipY = 0.33 / S + 0.02; torsoY = hipY + 0.17; legAng = [-1.25, -1.25]; legFwd = 0; }
    const breathe = c.sitting ? Math.sin((c.breathe || 0) * 1.3) * 0.01 : 0;
    const set = (item, k, mat) => { item.m.data.set(mat, k * 24); };
    const B = m4.mul(base, m4.trs([0, bob, 0]));
    set(P.torso, 0, m4.mul(B, m4.trs([0, torsoY + breathe, 0], 0, 1, c.sitting ? -0.08 : 0)));
    const look = c.looking ? 0.15 : (c.sitting ? -0.18 : 0);
    set(P.helmet, 0, m4.mul(B, m4.trs([0, torsoY + 0.32 + breathe, 0.0])));
    set(P.visor, 0, m4.mul(B, m4.trs([0, torsoY + 0.33 + breathe, 0.1], 0, 1, look)));
    set(P.pack, 0, m4.mul(B, m4.trs([0, torsoY + 0.03, -0.15])));
    for (let k = 0; k < 2; k++) {
      const sx = k ? 1 : -1;
      const armA = c.sitting ? -0.6 : -legAng[k] * 0.8;
      set(P.arm, k, m4.mul(B, m4.trs([sx * 0.19, torsoY + 0.12, 0], 0, 1, armA, sx * 0.12)));
      const legM = m4.mul(B, m4.trs([sx * 0.08, hipY, legFwd], 0, 1, legAng[k]));
      set(P.leg, k, legM);
      set(P.boot, k, m4.mul(legM, m4.trs([0, -0.25, 0.03])));
    }
    for (const k of Object.keys(P)) updateInstances(this.gl, P[k].m);
  }

  drawItems() {
    const gl = this.gl;
    for (const it of this.items) {
      if (!it.m.instances) continue;
      gl.bindVertexArray(it.m.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, it.m.count, it.m.type, 0, it.m.instances);
    }
    gl.bindVertexArray(null);
  }

  // One frame --------------------------------------------------------------------
  frame(st) {
    const gl = this.gl;
    const t0 = performance.now();
    // ---- shadow map from the key light
    const L = st.keyDir;
    const centre = [0, 1.5, 0];
    const up = Math.abs(L[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const lv = m4.lookAt(v3.add(centre, v3.mul(L, 60)), centre, up);
    // fit the light's box around the model
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const x of [-17, 17]) for (const y of [-5.6, 11.5]) for (const z of [-17, 17]) {
      const p = m4.apply(lv, [x, y, z]);
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    }
    const lp = m4.ortho(mn[0], mx[0], mn[1], mx[1], -mx[2] - 1, -mn[2] + 1);
    const shadowVP = m4.mul(lp, lv);
    if (st.shadowDirty !== false) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fb);
      gl.viewport(0, 0, this.shadow.size, this.shadow.size);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 2.0);
      const p = this.shadowProg;
      gl.useProgram(p.p);
      gl.uniformMatrix4fv(p.u.uVP, false, shadowVP);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.noise); gl.uniform1i(p.u.uNoise, 1);
      gl.uniform1f(p.u.uStep, st.step);
      this.drawItems();
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // ---- the model
    const tgt = this.main;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.msfb || tgt.fb);
    gl.viewport(0, 0, tgt.w, tgt.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const p = this.scene, u = p.u;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(u.uVP, false, st.vp);
    gl.uniform3fv(u.uCam, st.eye);
    gl.uniform3fv(u.uSunDir, st.sunDir); gl.uniform3fv(u.uSunCol, st.sunCol);
    gl.uniform3fv(u.uNepDir, st.nepDir); gl.uniform3fv(u.uNepCol, st.nepCol);
    gl.uniform3fv(u.uKeyDir, L); gl.uniform1f(u.uKeyIsSun, st.keyIsSun ? 1 : 0);
    gl.uniformMatrix4fv(u.uShadowVP, false, shadowVP);
    gl.uniform1f(u.uShadowSoft, (st.keyIsSun ? 1.3 : 4.5) / this.shadow.size);
    gl.uniform1f(u.uShadowOn, 1);
    gl.uniform1i(u.uShadowTaps, this.q.shadowTaps);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex); gl.uniform1i(u.uShadow, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.noise); gl.uniform1i(u.uNoise, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.groundTex); gl.uniform1i(u.uGround, 2);
    gl.uniform1f(u.uGroundS, this.groundS);
    gl.uniform3fv(u.uAmbTop, st.ambTop); gl.uniform3fv(u.uAmbBottom, st.ambBottom);
    gl.uniform1f(u.uExposure, st.exposure); gl.uniform1f(u.uLights, 1); gl.uniform1f(u.uWindows, st.windows);
    gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uStep, st.step);
    gl.uniform1f(u.uHover, st.hover || 0); gl.uniform1f(u.uSel, st.sel || 0);
    gl.uniform1f(u.uHW, W.HW);
    gl.uniform4fv(u.uHallA, st.hallA); gl.uniform4fv(u.uHallB, st.hallB);
    gl.uniform4fv(u.uLamp, st.lamps);
    gl.uniform4fv(u.uBusy, st.busy);
    gl.uniform3fv(u.uPal, st.palette);
    gl.uniform1f(u.uFocus, st.focus); gl.uniform1f(u.uAperture, st.aperture);
    this.drawItems();

    // ---- the backdrop, wherever the model isn't
    gl.depthMask(false);
    const k = this.sky, ku = k.u;
    gl.useProgram(k.p);
    gl.uniformMatrix4fv(ku.uSkyInv, false, st.skyInv);
    gl.uniform3fv(ku.uSunDir, st.sunDir); gl.uniform3fv(ku.uNepDir, st.nepDir); gl.uniform3fv(ku.uNepPole, st.nepPole);
    gl.uniform1f(ku.uSunVis, st.sunVis); gl.uniform1f(ku.uNepR, st.nepR); gl.uniform1f(ku.uSpin, st.spin);
    gl.uniform1f(ku.uPix, st.pix); gl.uniform1f(ku.uExposure, st.skyExposure); gl.uniform1f(ku.uSkyCoc, st.skyCoc);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.noise); gl.uniform1i(ku.uNoise, 1);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);

    if (tgt.msfb) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, tgt.msfb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, tgt.fb);
      gl.blitFramebuffer(0, 0, tgt.w, tgt.h, 0, 0, tgt.w, tgt.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    // ---- shallow focus at half resolution
    const hf = this.half;
    gl.bindFramebuffer(gl.FRAMEBUFFER, hf.fb);
    gl.viewport(0, 0, hf.w, hf.h);
    gl.useProgram(this.dof.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tgt.tex); gl.uniform1i(this.dof.u.uSrc, 0);
    gl.uniform2f(this.dof.u.uTexel, 1 / tgt.w, 1 / tgt.h);
    gl.uniform1f(this.dof.u.uMaxR, st.maxBlur * tgt.h / 900);
    gl.uniform1i(this.dof.u.uTaps, this.q.taps);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- glow from the brightest things (windows, the Sun)
    const qt = this.quarter;
    gl.bindFramebuffer(gl.FRAMEBUFFER, qt.fb);
    gl.viewport(0, 0, qt.w, qt.h);
    if (this.q.glow) {
      gl.useProgram(this.glow.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hf.tex); gl.uniform1i(this.glow.u.uSrc, 0);
      gl.uniform2f(this.glow.u.uTexel, 1 / hf.w, 1 / hf.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }

    // ---- to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    const c = this.comp, cu = c.u;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tgt.tex); gl.uniform1i(cu.uScene, 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hf.tex); gl.uniform1i(cu.uBlur, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, qt.tex); gl.uniform1i(cu.uGlow, 3);
    gl.uniform1f(cu.uGlowAmt, this.q.glow ? 0.9 : 0); gl.uniform1f(cu.uStep, st.step);
    gl.uniform1f(cu.uGrain, 0.022); gl.uniform1f(cu.uDof, st.dof);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.stats.cpuMs = performance.now() - t0;
  }
}

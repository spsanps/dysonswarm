// Terraforming Venus: the renderer and its lifecycle. Loaded only after Enter.

import { createContext, program, settle, isReady, setUniforms, texture, target, freeTarget, FULLSCREEN_VS, bindTex } from './gl.js';
import * as T from './terrain.js';
import { COMMON, BAKE_FS, SCENE_FS, EARLY_UNTIL } from './glsl.js';
import { stateAt, stageAt, STAGES, YEAR_MAX, SCHEDULE, yearToStory, storyToYear, actionAt } from './timeline.js';
import { hexInfo, hexCenter } from './plan.js';
import { VIEWS, cameraFor, viewStart, buildCamera, lighting } from './world.js';
import { clamp, lerp } from './noise.js';
import { Objects } from './objects.js';
import { Dynamic } from './dynamic.js';
import { Orbit } from './orbit.js';
import { Poster } from './poster.js';

export class VenusApp {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.year = opts.year ?? 0;
    this.hour = opts.hour ?? 9;
    this.viewIndex = opts.view ?? 0;
    this.mode = 'ground';           // ground (stand and look), fly, orbit
    this.yawOff = opts.yaw ?? 0; this.pitchOff = opts.pitch ?? 0; this.fovMul = opts.fovMul ?? 1;
    this.move = { f: 0, r: 0, u: 0, boost: false };
    this.time = opts.t ?? 0;
    this.quality = opts.quality || 'auto';
    this.renderScale = (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600) ? 0.8 : 1;   // auto-quality factor
    this.stats = { frameMs: 16, fps: 0 };
    this.playing = false;
    this.yearsPerSecond = 3;
    this.hoursPerSecond = 1;        // one soletta day every 24 seconds while playing
    this.dirty = true;
    this.running = false;
    this.reducedMotion = !!opts.reducedMotion;
    this.listeners = new Set();
    this.yawTarget = this.yawOff; this.pitchTarget = this.pitchOff; this.fovTarget = this.fovMul;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind) { for (const fn of this.listeners) fn(kind, this); }

  // ── controls ──
  setYear(y) { this.year = clamp(y, 0, YEAR_MAX); this.dirty = true; this.emit('year'); }
  setHour(h) { this.hour = ((h % 24) + 24) % 24; this.dirty = true; this.emit('hour'); }
  setPlaying(p) { this.playing = p; if (!p) this.playTarget = null; if (p && this.year >= YEAR_MAX - 0.01) this.year = 0; this.dirty = true; this.emit('play'); }
  // play forward to a year and stop there
  playTo(y) { this.playTarget = y; this.playing = true; this.dirty = true; this.emit('play'); }
  setView(i) {
    this.viewIndex = i; this.mode = VIEWS[i].fly ? 'fly' : 'ground';
    this.camera = viewStart(VIEWS[i]);
    this.yawOff = this.yawTarget = 0; this.pitchOff = this.pitchTarget = 0;
    this.fovMul = this.fovTarget = 1; this.placeView(); this.dirty = true; this.emit('view');
  }
  // Fly from wherever you are; landing puts you back on the headland.
  setFly(on) {
    if (on === (this.mode === 'fly')) return;
    if (on) {
      const c = buildCamera(this.currentCam());
      this.camera = { x: c.pos[0], y: c.pos[1] + 2, z: c.pos[2], yaw: this.camera.yaw + this.yawOff, pitch: this.camera.pitch + this.pitchOff, fov: this.camera.fov };
      this.yawOff = this.yawTarget = 0; this.pitchOff = this.pitchTarget = 0;
      this.mode = 'fly';
    } else { this.setView(0); }
    this.dirty = true; this.emit('mode');
  }
  clock() { return (performance.now() - this.clock0) / 1000 + 1; }

  // The ground point under a pixel (client coordinates), or null.
  pick(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((cx - r.left) / r.width) * 2 - 1, ny = 1 - ((cy - r.top) / r.height) * 2;
    const cam = buildCamera(this.currentCam());
    const tx = this.tan[0], ty = this.tan[1];
    let d = [0, 1, 2].map(i => cam.fwd[i] + cam.right[i] * nx * tx + cam.up[i] * ny * ty);
    const l = Math.hypot(...d); d = d.map(v => v / l);
    const frozen = this.year >= SCHEDULE.FREEZE_DONE;
    const surf = (x, z) => { const h = T.heightRender(x, z, 1); return frozen && h < 0 ? Math.max(h, 0.24 * h + 3 * T.EXAGGERATION) : h; };
    let t = 1, prev = 0;
    for (let i = 0; i < 1200; i++) {
      const x = cam.pos[0] + d[0] * t, y = cam.pos[1] + d[1] * t, z = cam.pos[2] + d[2] * t;
      const curv = ((x - cam.pos[0]) ** 2 + (z - cam.pos[2]) ** 2) / (2 * T.VENUS_R);
      if (y < surf(x, z) - curv) {
        let lo = prev, hi = t;
        for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2, xm = cam.pos[0] + d[0] * m, ym = cam.pos[1] + d[1] * m, zm = cam.pos[2] + d[2] * m; if (ym < surf(xm, zm) - ((xm - cam.pos[0]) ** 2 + (zm - cam.pos[2]) ** 2) / (2 * T.VENUS_R)) hi = m; else lo = m; }
        return { x: cam.pos[0] + d[0] * hi, z: cam.pos[2] + d[2] * hi, dist: hi };
      }
      prev = t; t += Math.max(t * 0.015, 1.5);
      if (t > 160000) break;
    }
    return null;
  }

  // Work one hexagon by hand at a picked point. kind: 'pave' or 'soil'.
  work(p, kind) {
    const info = hexInfo(p.x, p.z);
    const qi = info.i - this.hexBase[0], qj = info.j - this.hexBase[1];
    if (qi < 0 || qj < 0 || qi > 255 || qj > 255) return null;
    const [cx, cz] = hexCenter(info.i, info.j);
    const sea = T.heightTrue(cx, cz) < -2;
    const ch = kind === 'soil' ? 2 : sea ? 0 : 1;
    if (kind === 'soil' && sea) return { refused: 'sea' };
    const k = (qj * 256 + qi) * 4 + ch;
    if (this.hexData[k] > 0) return { refused: 'done' };
    const now = this.clock();
    this.hexData[k] = now;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.hexTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, qi, qj, 1, 1, gl.RGBA, gl.FLOAT, this.hexData.subarray((qj * 256 + qi) * 4, (qj * 256 + qi) * 4 + 4));
    this.userHexes.push({ i: info.i, j: info.j, x: cx, z: cz, kind: ch === 0 ? 'sea' : ch === 1 ? 'land' : 'soil', t0: now });
    this.dirty = true;
    return { sea, kind: ch };
  }
  handCount(kind) { return this.userHexes.filter(h => (kind === 'soil' ? h.kind === 'soil' : h.kind !== 'soil')).length; }

  async goOrbit(preset = 'globe') {
    await this.orbit.load();
    this.prevMode = this.mode === 'orbit' ? this.prevMode : this.mode;
    this.mode = 'orbit';
    this.orbit.setPreset(preset, true);
    this.dirty = true; this.emit('mode');
  }
  goGround() { if (this.mode !== 'orbit') return; this.mode = 'ground'; this.setView(this.viewIndex === 2 ? 0 : this.viewIndex); this.emit('mode'); }
  look(dYaw, dPitch) {
    if (this.mode === 'orbit') { this.orbit.rotate(-dYaw, -dPitch); this.dirty = true; return; }
    this.yawTarget += dYaw;
    const base = this.camera.pitch;
    this.pitchTarget = clamp(this.pitchTarget + dPitch, -84 - base, 84 - base);
    this.dirty = true;
  }
  currentCam() {
    const portrait = this.canvas.clientHeight > this.canvas.clientWidth * 1.15 && this.mode === 'ground';
    const v = VIEWS[this.viewIndex];
    return { ...this.camera, yaw: this.camera.yaw + this.yawOff + (portrait ? v.portraitYaw || 0 : 0), pitch: this.camera.pitch + this.pitchOff + (portrait ? v.portraitPitch || 0 : 0), fov: this.camera.fov * this.fovMul };
  }
  // Free flight: speed grows with height above the ground.
  flyStep(dt) {
    const m = this.move;
    if (!m.f && !m.r && !m.u) return false;
    const c = buildCamera(this.currentCam());
    const ground = T.heightRender(this.camera.x, this.camera.z, 0);
    const agl = Math.max(this.camera.y - ground, 5);
    const speed = clamp(agl * 0.9, 25, 9000) * (m.boost ? 4 : 1);
    const fx = c.fwd[0], fz = c.fwd[2], fl = Math.hypot(fx, fz) || 1;
    this.camera.x += (c.fwd[0] * m.f + c.right[0] * m.r) * speed * dt;
    this.camera.z += (c.fwd[2] * m.f + c.right[2] * m.r) * speed * dt;
    this.camera.y += (c.fwd[1] * m.f + m.u) * speed * dt;
    const g2 = T.heightRender(this.camera.x, this.camera.z, 0) + 4;
    this.camera.y = clamp(this.camera.y, Math.max(g2, this.year > 60 ? 12 : -1e9), 160000);
    const R = 150000; const d = Math.hypot(this.camera.x, this.camera.z);
    if (d > R) { this.camera.x *= R / d; this.camera.z *= R / d; }
    // keep the stones and trees around the camera
    if (Math.hypot(this.camera.x - this.placedAt[0], this.camera.z - this.placedAt[2]) > 2500) this.placeView();
    return true;
  }
  zoom(f) {
    if (this.mode === 'orbit') { this.orbit.zoom(f); this.dirty = true; return; }
    this.fovTarget = clamp(this.fovTarget * f, 0.14, 1.25); this.dirty = true; this.emit('zoom');
  }
  setQuality(q) { this.quality = q; this.renderScale = 1; this.resize(); this.dirty = true; this.emit('quality'); }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.idleAccum = 0;
    const tick = now => {
      if (!this.running) return;
      requestAnimationFrame(tick);
      if (document.hidden) { this.last = now; return; }
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      // ease the camera toward its targets
      const k = 1 - Math.exp(-dt * 14);
      const moving = Math.abs(this.yawTarget - this.yawOff) + Math.abs(this.pitchTarget - this.pitchOff) + Math.abs(this.fovTarget - this.fovMul) * 40 > 0.01;
      if (moving) {
        this.yawOff += (this.yawTarget - this.yawOff) * k;
        this.pitchOff += (this.pitchTarget - this.pitchOff) * k;
        this.fovMul += (this.fovTarget - this.fovMul) * k;
        this.dirty = true;
      }
      if (this.mode === 'fly' && this.flyStep(dt)) this.dirty = true;
      if (this.mode === 'orbit' && this.orbit.step(dt)) this.dirty = true;
      if (this.playing) {
        // move through the story at a steady pace: about 90 seconds end to end
        this.year = storyToYear(Math.min(1, yearToStory(this.year) + dt / (this.playTarget ? 70 : 90)));
        if (this.playTarget && this.year >= this.playTarget) { this.year = this.playTarget; this.playing = false; this.playTarget = null; this.emit('play'); this.emit('arrived'); }
        this.hour = (this.hour + dt * this.hoursPerSecond) % 24;
        if (this.year >= YEAR_MAX) { this.year = YEAR_MAX; this.playing = false; this.emit('play'); }
        this.dirty = true;
        this.emit('year');
      }
      // the world's own slow motion (water, weather, lights) keeps time unless reduced
      if (!this.reducedMotion) this.time += dt;
      // every frame while something moves (auto quality keeps it near 60 a second); idle, about 12
      this.idleAccum += dt;
      const busy = this.userHexes.length && this.clock() - this.userHexes[this.userHexes.length - 1].t0 < 14;
      const interval = this.dirty || busy ? 0 : (this.reducedMotion ? Infinity : 1 / 12);
      if (this.idleAccum < interval) return;
      this.idleAccum = 0;
      const t0 = performance.now();
      const drawn = this.render() !== false;
      const prep = !drawn && this.preparing;
      if (prep !== !!this.waiting) { this.waiting = prep; this.emit('preparing'); }
      if (!drawn) return;   // still compiling the later years: try again next frame
      this.dirty = false;
      this.adapt(performance.now() - t0, dt);
    };
    requestAnimationFrame(tick);
  }
  stop() { this.running = false; }

  // Auto quality: steer the render scale by the time between frames.
  adapt(cpuMs, dt) {
    this.stats.frameMs = this.stats.frameMs * 0.9 + dt * 1000 * 0.1;
    if (this.quality !== 'auto' || !this.playing && !this.dirty) return;
    this.adaptT = (this.adaptT || 0) + dt;
    if (this.adaptT < 1.5) return;
    this.adaptT = 0;
    const ms = this.stats.frameMs;
    let s = this.renderScale;
    if (ms > 20.5 && s > 0.32) s *= ms > 30 ? 0.8 : 0.9;   /* below ~50 frames a second */
    else if (ms < 17.4 && s < 1) s = Math.min(1, s * 1.05);
    if (s !== this.renderScale) { this.renderScale = s; this.resize(); }
  }

  // horizontal field of view in degrees, as drawn
  frameFov() { return 2 * Math.atan(this.tan ? this.tan[0] : 0.6) * 180 / Math.PI; }

  photo() {
    this.render();
    return new Promise(res => this.canvas.toBlob(res, 'image/jpeg', 0.92));
  }

  async init(progress = () => {}) {
    const gl = this.gl = createContext(this.canvas);
    if (!gl) throw new Error('NO_WEBGL2');
    // The scene shader starts compiling first; it takes longest on Windows. Opening in the
    // first years, a smaller build (no seas, ice, paving or soil yet) is enough and compiles
    // in a few seconds; the full one compiles in the background once the view is up.
    const early = this.year < EARLY_UNTIL && !this.opts.debug;
    this.programs = {
      scene: program(gl, FULLSCREEN_VS, SCENE_FS(!!this.opts.debug, early), early ? 'scene (first years)' : 'scene'),
    };
    this.fullScene = early ? null : this.programs.scene;
    progress('Reading the radar map', 5);
    await T.loadMagellan(new URL('../data/ishtar-magellan.png', import.meta.url));
    progress('Raising the mountains', 15);
    await this.bake(progress);
    progress('Mixing the air', 70);
    this.vao = gl.createVertexArray();
    T.setStandHeight();
    progress('Placing the stones', 85);
    this.objects = new Objects(gl);
    this.dynamic = new Dynamic(gl);
    this.orbit = new Orbit(gl);
    this.poster = new Poster(gl);
    this.style = 'poster';   // the only look (the painting is in git history)
    // wait for every shader without freezing the page
    const t0 = performance.now();
    await settle(gl, null, (done, total) => {
      const s = (performance.now() - t0) / 1000;
      progress(s < 6 ? 'Mixing the inks' : `Mixing the inks · ${Math.round(s)} s · the first visit takes longest`, 85 + 14 * (1 - Math.exp(-s / 40)) * (0.3 + 0.7 * done / Math.max(1, total)));
    });
    // hexagons worked by hand (see glsl.js userHex)
    const h0 = hexInfo(0, 0);
    this.hexBase = [h0.i - 128, h0.j - 128];
    this.hexData = new Float32Array(256 * 256 * 4);
    this.hexTex = texture(gl, { w: 256, h: 256, internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, data: this.hexData, filter: gl.NEAREST });
    this.userHexes = [];
    this.clock0 = performance.now();
    this.resize();
    this.placeView();
    if (!this.fullScene) this.fullScene = program(gl, FULLSCREEN_VS, SCENE_FS(false, false), 'scene');
    progress('Ready', 100);
  }

  // Bake the terrain levels on the GPU (or the CPU when float targets are missing).
  async bake(progress) {
    const gl = this.gl;
    const L = T.LEVELS;
    const far = L[2];
    // L2 is cheap on the CPU and gives us the far field at once.
    T.bakeFar(far);
    await new Promise(r => setTimeout(r, 0));
    const useGPU = gl.ext.floatTarget;
    if (useGPU) {
      const prog = program(gl, FULLSCREEN_VS, BAKE_FS(), 'bake');
      await settle(gl, [prog]);
      const mag = texture(gl, { w: 320, h: 320, internal: gl.R32F, format: gl.RED, type: gl.FLOAT, data: T.getMagellan(), filter: gl.NEAREST });
      const shields = new Float32Array(70 * 4);
      T.SHIELDS.forEach((s, i) => shields.set(s, i * 4));
      const farTex = texture(gl, { w: far.n, h: far.n, internal: gl.R32F, format: gl.RED, type: gl.FLOAT, data: far.heights, filter: gl.NEAREST });
      const vao = gl.createVertexArray();
      let parentTex = farTex, parent = far;
      for (const idx of [1, 0]) {
        const lv = L[idx];
        const rt = target(gl, lv.n, lv.n, { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST });
        if (!rt.ok) throw new Error('bake target incomplete');
        gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
        gl.viewport(0, 0, lv.n, lv.n);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        bindTex(gl, prog, 'uMagellan', mag, 0);
        bindTex(gl, prog, 'uParent', parentTex, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        setUniforms(gl, prog, {
          uOrigin: lv.origin, uSpacing: lv.spacing, uN: lv.n, uDetail: lv.spacing * 2,
          uStandInTile: T.STAND_IN_TILE, uParentL: [parent.origin[0], parent.origin[1], parent.size, 1 / parent.n],
          uHasParent: 1, uBand: 40,
        });
        gl.uniform4fv(prog.u('uShields[0]'), shields);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const buf = new Float32Array(lv.n * lv.n * 4);
        gl.readPixels(0, 0, lv.n, lv.n, gl.RGBA, gl.FLOAT, buf);
        const H = new Float32Array(lv.n * lv.n);
        for (let i = 0; i < H.length; i++) H[i] = buf[i * 4];
        lv.heights = H;
        const pt = texture(gl, { w: lv.n, h: lv.n, internal: gl.R32F, format: gl.RED, type: gl.FLOAT, data: H, filter: gl.NEAREST });
        parentTex = pt; parent = lv;
        freeTarget(gl, rt);
        progress(idx === 1 ? 'Folding the ridges' : 'Shaping the headland', idx === 1 ? 40 : 60);
        await new Promise(r => requestAnimationFrame(r));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      // CPU fallback at lower resolution
      for (const idx of [1, 0]) {
        const lv = L[idx];
        lv.n = 384; lv.spacing *= 1024 / 384;
        lv.size = lv.n * lv.spacing; lv.origin = [lv.center[0] - lv.size / 2, lv.center[1] - lv.size / 2];
        await T.bakeLevel(lv, async f => { progress('Raising the mountains', 15 + f * 50); await new Promise(r => setTimeout(r, 0)); });
      }
      T.blendBorder(L[0], L[1]);
    }
    // Upload render-space heights and normals.
    const lin = gl.ext.floatLinear;
    // one level at a time, letting the page breathe in between (this is the slow CPU part)
    this.levelTex = [];
    for (const lv of L) {
      await new Promise(r => setTimeout(r, 0));
      const { height, nrm } = T.packLevel(lv);
      const h = texture(gl, { w: lv.n, h: lv.n, internal: lin ? gl.R32F : gl.R16F, format: gl.RED, type: gl.FLOAT, data: height, filter: gl.LINEAR });
      const n = texture(gl, { w: lv.n, h: lv.n, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: nrm, filter: gl.LINEAR });
      this.levelTex.push({ h, n });
    }
  }

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : this.quality === 'high' ? 2 : 1.25);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    // the scene (materials and light) is rendered below screen resolution; the print is full size
    const base = this.quality === 'high' ? 1 : this.quality === 'low' ? 0.42 : 0.62;
    const s = Math.min(base * this.renderScale, 1400 / Math.max(w, h) * 1.3);
    const rw = Math.max(1, Math.round(w * s)), rh = Math.max(1, Math.round(h * s));
    this.dirty = true;
    if (!this.sceneRT || this.sceneRT.w !== rw || this.sceneRT.h !== rh) {
      freeTarget(gl, this.sceneRT);
      const half = gl.ext.floatTarget || gl.ext.halfTarget;
      this.sceneRT = target(gl, rw, rh, half ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, depth: true } : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, depth: true });
    }
  }

  placeView() {
    const view = VIEWS[this.viewIndex];
    if (!this.camera) this.camera = viewStart(view);
    const c = buildCamera(this.currentCam());
    const v = this.mode === 'fly' ? { ...view, id: 'fly', yaw: this.camera.yaw, x: c.pos[0], z: c.pos[2] } : view;
    this.objects.placeRocks(v, c.pos);
    this.objects.placeLife(v, c.pos);
    this.dynamic.prepare(c.pos);
    this.placedAt = c.pos.slice();
  }

  frameState() {
    const view = VIEWS[this.viewIndex];
    const cam = buildCamera(this.currentCam());
    const st = stateAt(this.year);
    const camAltTrue = cam.pos[1] / T.EXAGGERATION;
    const L = lighting(st, this.hour, camAltTrue);
    return { view, cam, st, L };
  }

  // the scene build for this frame: the full one once compiled; before that the first-years
  // build, which is only right before the CO2 rains (null: wait for the full one)
  // The first frame drawn with a new build makes the graphics driver finish compiling it, a
  // stall of a few hundred milliseconds: switch to the full build on a still frame if we can.
  sceneProgram() {
    const full = isReady(this.gl, this.fullScene);
    const early = this.year < EARLY_UNTIL;
    if (full && (this.fullInUse || !early || !(this.dirty || this.playing))) { this.fullInUse = true; return this.fullScene; }
    return early ? this.programs.scene : null;
  }
  get preparing() { return !isReady(this.gl, this.fullScene) && this.year >= EARLY_UNTIL; }

  render() {
    if (this.mode === 'orbit' && this.orbit.ready) return this.renderOrbit();
    const gl = this.gl;
    const p = this.sceneProgram();
    if (!p) return false;   // keep the last frame until the later years have compiled
    const prof = this.prof ? [] : null;
    const mark = name => { if (prof) { const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._px || (this._px = new Uint8Array(4))); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); prof.push([name, performance.now()]); } };
    mark('start');
    const { cam, st, L } = this.fs = this.frameState();
    const rt = this.sceneRT;
    const aspect = rt.w / rt.h;
    // fov is horizontal on wide screens, vertical on tall ones
    let tx, ty;
    if (aspect >= 1) { tx = Math.tan(cam.fov * Math.PI / 360); ty = tx / aspect; }
    else { ty = Math.tan(cam.fov * 1.08 * Math.PI / 360); tx = ty * aspect; }
    this.tan = [tx, ty];
    const maxT = 700000;
    const lvU = lv => [lv.origin[0], lv.origin[1], lv.size, 1 / lv.n];
    const LV = T.LEVELS, lt = this.levelTex;
    const seaY = (st.seaLevelTrue - T.SEA_DATUM) * T.EXAGGERATION;
    const flash = this.flash(st);
    const U = {
      uL0: lvU(LV[0]), uL1: lvU(LV[1]), uL2: lvU(LV[2]),
      uCam: cam.pos, uStand: [0, 0], uStandH: T.STAND_H, uRight: cam.right, uUp: cam.up, uFwd: cam.fwd, uTan: this.tan,
      uLogK: 1 / Math.log2(1 + maxT * 4), uMaxT: maxT, uSteps: { int: this.opts.steps || (this.quality === 'low' ? 150 : this.quality === 'high' ? 280 : 220) },
      uYear: this.year, uTime: this.time, uHour: this.hour, uFineOct: this.quality === 'low' ? 3 : 5,
      uShade: st.shade, uSoletta: st.soletta, uCloudDeck: st.cloudDeck, uAcid: st.acid, uAcidRain: st.acidRain,
      uLightning: st.lightning, uCo2Rain: st.co2Rain,
      uSeaY: seaY, uSeaLiquid: st.seaLiquid ? 1 : 0, uFreeze: st.freeze, uSnow: st.snow, uSnowFall: st.snowFall,
      uWater: st.water, uWaterY: lerp(-70, 4, Math.pow(st.water, 0.7)) * T.EXAGGERATION, uGreen: st.green, uTents: st.tents, uTown: st.town, uClouds: st.clouds,
      uIceOn: st.freeze >= 1 ? 1 : 0, uGlow: st.glow * L.night, uIceY: (1240 - T.SEA_DATUM) * T.EXAGGERATION,
      uStarVis: L.starVis, uShadeVis: L.shadeVis, uNightLift: 0,
      uLightDir: L.lightDir, uLightCol: L.lightCol, uSunDir: L.sunDir,
      uSkyAmb: L.skyAmb, uGroundAmb: L.groundAmb, uNightAmb: L.nightAmb, uNightSky: L.nightSky, uDiffuse: L.diffuse,
      uBetaR: L.betaR, uBetaM: L.betaM, uHR: L.HR, uHM: L.HM, uMieG: L.mieG, uSkyLight: L.skyLight, uSkyBoost: 1.25, uAirK: L.airK,
      uFlash: flash.col, uFlashDir: flash.dir, uColonyPos: [-60000, 40000, -30000], uColonyLight: L.colonyLight,
      uCloud: this.cloudParams(st), uExposure: L.exposure, uPoster: 1, uDebug: this.opts.debug || 0, uDebugR: this.opts.debugR || 10000, uNoShadow: this.opts.noshadow ? 1 : 0,
      uVP: this.viewProj(cam, tx, ty),
    };
    this.U = U;
    const TX = { uH0: lt[0].h, uH1: lt[1].h, uH2: lt[2].h, uN0: lt[0].n, uN1: lt[1].n, uHexTex: this.hexTex };
    U.uHexBase = this.hexBase; U.uClock = this.clock();
    mark('state');
    this.dynamic.update(this.year, this.time, cam.pos, st, L, this.objects.townLights, this.userHexes, this.clock());
    mark('dynamic');
    const machines = this.dynamic.machineU;
    U.uColonyPos = [this.dynamic.colony.x, this.dynamic.colony.y, this.dynamic.colony.z];

    // 1. terrain, sea and sky
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
    gl.viewport(0, 0, rt.w, rt.h);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true);
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    let unit = 0;
    for (const k in TX) bindTex(gl, p, k, TX[k], unit++);
    setUniforms(gl, p, U);
    gl.uniform4fv(p.u('uMachines[0]'), machines);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    mark('scene');
    // 2. objects into the same colour and depth
    if (!this.opts.debug || this.opts.debug > 5.5) {
      this.objects.draw({ machines }, U, TX, () => this.dynamic.drawSolid());
      // then the transparent things and the lights on top (the poster draws rain and snow itself)
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
      gl.viewport(0, 0, rt.w, rt.h);
      this.objects.drawTransparent(U, TX);
      this.dynamic.drawLights(U, rt.h / (2 * Math.atan(ty)));
    }
    mark('objects');
    // 3. print
    this.renderPoster(rt, cam, st, L, 0);
    mark('print');
    if (prof) this.lastProf = prof.slice(1).map((p, i) => p[0] + ' ' + (p[1] - prof[i][1]).toFixed(1)).join(', ');
  }

  renderPoster(rt, cam, st, L, mode) {
    const regime = st.soletta > 0.5 ? (L.night > 0.6 ? 1 : 2) : (st.shade > 0.55 ? 1 : 0);
    this.poster.render(rt, this.canvas.width, this.canvas.height, {
      uScale: Math.min(window.devicePixelRatio || 1, 2), uFwd: cam ? cam.fwd : [0, 0, -1], uRight: cam ? cam.right : [1, 0, 0], uUp: cam ? cam.up : [0, 1, 0],
      uTan: this.tan, uSunDir: L.sunDir, uSolDir: L.lightDir, uRegime: regime, uNight: L.night,
      uShade: st.shade, uSoletta: st.soletta, uCloudDeck: st.cloudDeck, uAcidRain: st.acidRain, uCo2Rain: st.co2Rain * this.shower(),
      uSnowFall: st.snowFall, uWaterRain: st.waterRain * this.shower(), uTime: this.time, uYear: this.year, uMode: mode,
    });
  }

  renderOrbit() {
    const st = stateAt(this.year);
    const L = lighting(st, this.hour, 0);
    this.fs = { st, L, cam: null, view: null };
    const rt = this.sceneRT, aspect = rt.w / rt.h;
    const fov = lerp(42, 24, this.orbit.cam.aim || 0) * Math.PI / 360;
    const tan = aspect >= 1 ? [Math.tan(fov) * aspect, Math.tan(fov)] : [Math.tan(fov * 1.25), Math.tan(fov * 1.25) / aspect];
    this.tan = tan;
    this.orbit.render(rt, st, L, this.year, this.hour, this.time, tan);
    this.renderPoster(rt, null, st, L, 1);
  }

  viewProj(cam, tx, ty) {
    const n = 0.25, f = 3e6;
    const P = [1 / tx, 0, 0, 0, 0, 1 / ty, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
    const r = cam.right, u = cam.up, b = cam.fwd.map(v => -v), e = cam.pos;
    const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    const V = [r[0], u[0], b[0], 0, r[1], u[1], b[1], 0, r[2], u[2], b[2], 0, -dot(r, e), -dot(u, e), -dot(b, e), 1];
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
      let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + rr] * V[c * 4 + k];
      out[c * 4 + rr] = s;
    }
    return out;
  }

  // The weather of each age: coverage, darkness, base altitude (render m), kind.
  cloudParams(st) {
    const y = this.year, E = T.EXAGGERATION;
    let cov = 0, dark = 0, alt = 2600 * E;
    // CO2 rain clouds while the seas fill, snow clouds, rain clouds after the icefalls
    cov = Math.max(cov, st.co2Rain * 0.55 * this.shower() + st.co2Rain * 0.15);
    cov = Math.max(cov, st.snowFall * 0.5);
    cov = Math.max(cov, st.waterRain * (0.55 + 0.35 * this.shower()));
    if (st.co2Rain > 0 || st.snowFall > 0) dark = 0.8;
    if (st.waterRain > 0.01) dark = Math.max(dark, 0.55 * st.waterRain);
    // fair-weather cumulus once there is water
    cov = Math.max(cov, st.clouds * (0.30 + 0.08 * Math.sin(this.year * 2.3)) * (1 - st.waterRain) + st.clouds * 0.04);
    return [cov, dark, alt, 0];
  }

  // Rain comes in showers: on and off as the years and the hours pass.
  shower() {
    const v = Math.sin(this.year * 1.7 + this.time * 0.05) * 0.5 + Math.sin(this.year * 0.63 + 1.3 + this.time * 0.021) * 0.5;
    return clamp((v + 0.15) * 2.2, 0, 1);
  }

  // Lightning in the rain years: brief flashes from the clouds, a bolt now and then.
  flash(st) {
    const none = { col: [0, 0, 0], dir: [0, 1, 0], bolt: [0.5, 0.4], seed: 0 };
    if (st.lightning <= 0.01) return none;
    const rate = 1.6;
    const k = Math.floor(this.time * rate);
    const h = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const f = this.time * rate - k;
    if (h(k) < 0.45 || f > 0.35) return none;
    const flick = f < 0.05 ? 1 : f < 0.1 ? 0.3 : f < 0.16 ? 0.8 : Math.exp(-(f - 0.16) * 25);
    const v = flick * st.lightning * 0.006 * (0.5 + h(k + 3));
    return { col: [v * 0.8, v * 0.85, v], dir: [Math.cos(k), 0.6, Math.sin(k)], bolt: [0.15 + 0.7 * h(k + 7), 0.45 + 0.1 * h(k + 9)], seed: k, boltOn: h(k + 5) > 0.75 };
  }
}


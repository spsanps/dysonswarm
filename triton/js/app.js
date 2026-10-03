// Four Hours Out: boot, camera, time and the frame loop. Loaded only after Enter.
import { Renderer, QUALITY } from './render.js';
import { m4, v3 } from './gl.js';
import * as A from './astro.js';
import * as W from './world.js';
import { jobAt } from './jobs.js';
import { UI } from './ui.js';

const $ = id => document.getElementById(id);
const D = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const params = new URLSearchParams(location.search);

export async function start() {
  const boot = $('boot'), canvas = $('world');
  const progress = (text, p) => { $('bootText').textContent = text; $('bootBar').style.width = p + '%'; };
  const fail = (msg, err) => {
    console.error(msg, err || '');
    document.body.classList.add('failed');
    boot.classList.add('show');
    $('bootTitle').textContent = 'The window wouldn’t open.';
    $('bootText').textContent = msg;
    $('bootBar').parentNode.style.display = 'none';
    $('failActions').hidden = false;
    window.__ready = true; window.__error = String(err || msg);
  };
  boot.classList.add('show');
  progress('Finding a graphics card', 3);

  const gl = params.get('nogl') === '1' ? null : canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) { fail('This needs WebGL2, which this browser isn’t offering. A recent Chrome, Edge, Firefox or Safari with hardware acceleration should work. The notes still work without it.'); return; }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('The graphics context was lost. Reload the page to rebuild the campus.'); }, false);

  const R = new Renderer(gl);
  try { await R.build(progress); } catch (e) { fail('The campus couldn’t be built: ' + e.message, e); return; }

  // ---- quality -------------------------------------------------------------
  const coarse = matchMedia('(pointer: coarse)').matches;
  let qualityMode = params.get('q') || 'auto';
  let qName = qualityMode === 'auto' ? (coarse ? 'low' : 'medium') : (QUALITY[qualityMode] ? qualityMode : 'medium');
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  R.setQuality(qName, innerWidth, innerHeight, dpr());

  // ---- time ----------------------------------------------------------------
  const fixedDate = params.get('date') ? Date.parse(params.get('date')) : null;
  const fixedT = params.has('t') ? parseFloat(params.get('t')) : null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lapse = false, lapseOffset = 0;
  let earthView = params.get('earth') === '1';
  const t0Real = performance.now();
  const realNow = () => fixedDate ?? Date.now();
  const simNow = () => {
    const now = realNow() + lapseOffset;
    return earthView ? now - A.lightTime(now).ms : now;
  };
  // Reduced motion: the world holds still (the caretaker sits, the smoke stops).
  const animTime = () => fixedT ?? (reduced ? 1300 : (performance.now() - t0Real) / 1000 + 1200);

  // ---- camera --------------------------------------------------------------
  const HOME = { yaw: 14 * D, pitch: 27 * D, target: [0.8, 0.7, 2.0] };
  const cam = { yaw: HOME.yaw, pitch: HOME.pitch, dist: 40, target: [...HOME.target] };
  const goal = { yaw: cam.yaw, pitch: cam.pitch, dist: 40, target: [...cam.target] };
  let fitDist = 40, sel = null;
  if (params.get('target')) { const t = params.get('target').split(',').map(Number); if (t.length === 3 && t.every(isFinite)) { cam.target = [...t]; goal.target = [...t]; } }
  if (params.get('cam')) {
    const [y, p, d] = params.get('cam').split(',').map(Number);
    if (isFinite(y)) cam.yaw = goal.yaw = y * D;
    if (isFinite(p)) cam.pitch = goal.pitch = p * D;
    if (isFinite(d)) cam.dist = goal.dist = d;
  }
  function frame() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    const portrait = aspect < 0.9;
    const fovy = portrait ? 50 * D : (aspect < 1.3 ? 38 * D : 31 * D);
    return { w, h, aspect, fovy, portrait };
  }
  function fit() {
    const f = frame();
    const tanV = Math.tan(f.fovy / 2), tanH = tanV * f.aspect;
    const rad = f.portrait ? 10.4 : 19.2;
    const dH = rad / tanH;
    const dV = (rad * Math.sin(cam.pitch) + 3.2) / tanV;
    fitDist = Math.max(dH, dV) * (f.portrait ? 1.0 : 1.04);
    return fitDist;
  }
  fit();
  // Turn the model so Neptune sits a little right of centre, whatever the screen shape.
  function homeYaw() { const f = frame(); return Math.atan(0.5 * Math.tan(f.fovy / 2) * f.aspect); }
  HOME.yaw = homeYaw();
  if (!params.get('cam')) { cam.yaw = goal.yaw = HOME.yaw; cam.dist = goal.dist = fitDist; }

  function view() {
    const f = frame();
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const off = [Math.sin(cam.yaw) * cp, sp, Math.cos(cam.yaw) * cp];
    const eye = v3.add(cam.target, v3.mul(off, cam.dist));
    // On phones, nudge the model up so the board at the bottom doesn't cover it.
    const shiftY = params.has('shift') ? +params.get('shift') : (f.portrait ? -0.06 : -0.02);
    const P = m4.persp(f.fovy, f.aspect, 0.5, 400, 0, shiftY);
    const V = m4.lookAt(eye, cam.target, [0, 1, 0]);
    const vp = m4.mul(P, V);
    // The backdrop is held at eye level, like a painted sky behind a model: same
    // bearing as the camera, but tilted so Neptune sits above the model.
    const halfV = f.fovy / 2;
    const tilt = Math.atan(0.56 * Math.tan(halfV)) - A.NEPTUNE_ALT * D;
    const fwd = [-Math.sin(cam.yaw) * Math.cos(tilt), -Math.sin(tilt), -Math.cos(cam.yaw) * Math.cos(tilt)];
    const Vs = m4.lookAt([0, 0, 0], fwd, [0, 1, 0]);
    const skyInv = m4.invert(m4.mul(P, Vs));
    return { eye, vp, skyInv, P, V, f, pix: 2 * Math.tan(halfV) / (f.h * R.pxScale) };
  }

  // ---- state shared with the UI --------------------------------------------------
  const lamps = new Float32Array(32);
  const hallA = new Float32Array(16), hallB = new Float32Array(16);
  const palette = new Float32Array(W.PALETTE.flat());
  W.HALLS.forEach((h, i) => { hallA.set([h.x, h.z, Math.cos(h.rot), Math.sin(h.rot)], i * 4); });
  const targets = W.pickTargets();
  let hover = 0;
  let lastStep = -1, lastSunKey = '', needs = true, shadowDirty = true;
  let caretaker = null;

  const ui = new UI({
    simNow, realNow,
    select: id => select(id),
    toggleLapse: () => { lapse = !lapse; if (!lapse) lapseOffset = 0; needs = shadowDirty = true; return lapse; },
    resetLapse: () => { lapse = false; lapseOffset = 0; needs = shadowDirty = true; },
    toggleEarth: () => { earthView = !earthView; needs = shadowDirty = true; return earthView; },
    isEarth: () => earthView, isLapse: () => lapse,
    photo: () => { photoNext = true; needs = true; },
    cycleQuality: () => {
      const order = ['auto', 'high', 'medium', 'low'];
      qualityMode = order[(order.indexOf(qualityMode) + 1) % order.length];
      qName = qualityMode === 'auto' ? (coarse ? 'low' : 'medium') : qualityMode;
      R.setQuality(qName, innerWidth, innerHeight, dpr());
      autoSamples = []; needs = shadowDirty = true;
      return qualityMode;
    },
    reset: () => { select(null); goal.yaw = HOME.yaw; goal.pitch = HOME.pitch; goal.dist = fitDist; goal.target = [...HOME.target]; needs = true; },
    caretaker: () => caretaker,
  });

  function select(id) {
    sel = id ? targets.find(t => t.id === id) || null : null;
    if (sel) {
      goal.target = [sel.c[0], sel.kind === 'geyser' ? 2.5 : Math.min(sel.c[1], 1.6), sel.c[2]];
      goal.dist = Math.min(fitDist, sel.kind === 'hall' ? 21 : 19);
      if (goal.pitch > 30 * D) goal.pitch = 24 * D;
    } else {
      goal.target = [...HOME.target]; goal.dist = fitDist;
    }
    ui.showCard(sel);
    needs = true;
  }
  if (params.get('focus')) setTimeout(() => select(W.IDS.HALL0 + (+params.get('focus'))), 0);
  if (params.get('select')) setTimeout(() => select(+params.get('select')), 0);

  // ---- picking ---------------------------------------------------------------
  function pick(cx, cy) {
    const v = view();
    const inv = m4.invert(v.vp);
    const nx = (cx / innerWidth) * 2 - 1, ny = 1 - (cy / innerHeight) * 2;
    const a = m4.apply(inv, [nx, ny, -1]), b = m4.apply(inv, [nx, ny, 1]);
    const dir = v3.norm(v3.sub(b, a));
    let best = null, bestT = 1e9;
    const hits = [...targets];
    // the caretaker is small: give her a generous box
    if (caretaker && caretaker.visible) hits.push({ id: W.IDS.PERSON, kind: 'person', c: [caretaker.x, 0.45, caretaker.z], rot: 0, half: [0.7, 0.8, 0.7] });
    for (const t of hits) {
      const c = Math.cos(t.rot), s = Math.sin(t.rot);
      const o = v3.sub(a, t.c);
      const lo = [c * o[0] - s * o[2], o[1], s * o[0] + c * o[2]];
      const ld = [c * dir[0] - s * dir[2], dir[1], s * dir[0] + c * dir[2]];
      let tmin = -1e9, tmax = 1e9;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > t.half[k]) { tmin = 1e9; break; } continue; }
        let t1 = (-t.half[k] - lo[k]) / ld[k], t2 = (t.half[k] - lo[k]) / ld[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      }
      if (tmin <= tmax && tmax > 0) {
        const tt = tmin > 0 ? tmin : tmax;
        const pri = t.kind === 'person' ? -3 : 0;
        if (tt + pri < bestT) { bestT = tt + pri; best = t; }
      }
    }
    return best;
  }

  // ---- input ------------------------------------------------------------------
  const pointers = new Map();
  let downAt = null, dragged = false, pinch0 = 0, dist0 = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = { x: e.clientX, y: e.clientY };
    dragged = false;
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); dist0 = goal.dist; }
    ui.dismissHint();
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') {
        const h = pick(e.clientX, e.clientY);
        const id = h ? h.id : 0;
        if (id !== hover) { hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; needs = true; }
      }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) dragged = true;
    if (pointers.size === 1) {
      goal.yaw -= dx * 0.0055;
      goal.pitch = clamp(goal.pitch + dy * 0.0045, 6 * D, 72 * D);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) goal.dist = clamp(dist0 * pinch0 / d, 9, fitDist * 1.6);
    }
    needs = true;
  });
  const up = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!dragged && pointers.size === 0 && downAt) {
      const h = pick(e.clientX, e.clientY);
      select(h ? h.id : null);
    }
    if (pointers.size < 2) pinch0 = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = 0; needs = true; } });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.0011), 9, fitDist * 1.6);
    needs = true; ui.dismissHint();
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (ui.dialogOpen()) { if (e.key === 'Escape') ui.closeDialog(); return; }
    const k = e.key.toLowerCase();
    const step = e.shiftKey ? 0.2 : 0.08;
    if (k === 'arrowleft' || k === 'a') goal.yaw += step;
    else if (k === 'arrowright' || k === 'd') goal.yaw -= step;
    else if (k === 'arrowup' || k === 'w') goal.pitch = clamp(goal.pitch + step * 0.6, 6 * D, 72 * D);
    else if (k === 'arrowdown' || k === 's') goal.pitch = clamp(goal.pitch - step * 0.6, 6 * D, 72 * D);
    else if (k === '+' || k === '=') goal.dist = clamp(goal.dist * 0.88, 9, fitDist * 1.6);
    else if (k === '-' || k === '_') goal.dist = clamp(goal.dist / 0.88, 9, fitDist * 1.6);
    else if (k >= '1' && k <= '4') select(W.IDS.HALL0 + (+k - 1));
    else if (k === 'escape') select(null);
    else if (k === 't') ui.clickLapse();
    else if (k === 'e') ui.clickEarth();
    else if (k === 'p') ui.photo();
    else if (k === 'h') document.body.classList.toggle('ui-hidden');
    else if (k === 'r') ui.reset();
    else if (k === '?' || k === 'n') ui.openNotes();
    else return;
    needs = true;
  });
  addEventListener('resize', () => {
    R.resize(innerWidth, innerHeight, dpr());
    const oldDist = fitDist, oldYaw = HOME.yaw;
    fit(); HOME.yaw = homeYaw();
    if (Math.abs(goal.dist - oldDist) < 0.5) goal.dist = cam.dist = fitDist;
    if (Math.abs(goal.yaw - oldYaw) < 0.01) goal.yaw = cam.yaw = HOME.yaw;
    needs = true;
  });
  // Pause when the tab is hidden; resume (once) when it comes back.
  let running = false;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !running) { running = true; lastT = performance.now(); needs = true; requestAnimationFrame(loop); }
  });

  // ---- per-frame state ----------------------------------------------------------
  let photoNext = false;
  function state(simMs, tA, step) {
    const s = A.sky(simMs);
    const sunFade = smooth(-0.3, 2.2, s.sunAlt);
    const lit = s.lit;
    const sunCol = [1.0 * 1.8 * sunFade, 0.93 * 1.8 * sunFade, 0.8 * 1.8 * sunFade];
    const nk = (0.14 + 0.86 * lit) * (1.15 + (0.36 - 1.15) * sunFade);
    const nepCol = [0.5 * nk, 0.74 * nk, 0.88 * nk];
    const keyIsSun = sunFade > 0.12;
    const ambTop = [0.032 + 0.038 * sunFade, 0.027 + 0.031 * sunFade, 0.058 + 0.057 * sunFade];
    const bounce = 0.2 * sunFade * Math.sqrt(Math.max(s.sun[1], 0.02));
    const ambBottom = [0.95 * bounce + 0.02 * lit, 0.84 * bounce + 0.03 * lit, 0.84 * bounce + 0.04 * lit];
    const nightExp = 1.6 + 1.2 * (1 - lit);
    const exposure = nightExp + (1.0 - nightExp) * sunFade;
    const night = 1 - sunFade;
    // lights
    const jobs = [0, 1, 2, 3].map(h => jobAt(h, simMs));
    const busy = jobs.map(j => j.running ? (j.archive ? 0.25 : 0.95) : 0.12);
    W.HALLS.forEach((h, i) => hallB.set([h.W / 2, h.L / 2, 1, (0.3 + 0.7 * night) * (jobs[i].running ? 1 : 0.55) * 0.85], i * 4));
    const lampI = 0.15 + 0.85 * night;
    let li = 0;
    for (const [x, z] of W.LAMPS) { lamps.set([x + 0.3, 1.24, z, 0.55 * lampI], li * 4); li++; }
    const cab = (lx, lz, y, I) => { const c = Math.cos(W.CABIN.rot), s2 = Math.sin(W.CABIN.rot); lamps.set([W.CABIN.x + c * lx + s2 * lz, y, W.CABIN.z - s2 * lx + c * lz, I], li * 4); li++; };
    cab(0.42, -1.1, 0.7, 0.5 * (0.3 + 0.7 * night));
    cab(-0.38, -1.15, 0.95, 0.35 * lampI);
    lamps.set([W.REACTOR.x, 2.1, W.REACTOR.z, 0.18 * lampI], li * 4); li++;
    lamps.set([W.DISH.x, 1.0, W.DISH.z, 0], li * 4);
    // the dish points home (Earth is within 2° of the Sun from here)
    const sunKey = (Math.round(s.sun[0] * 400) + ',' + Math.round(s.sun[1] * 400) + ',' + Math.round(s.sun[2] * 400));
    if (sunKey !== lastSunKey) {
      lastSunKey = sunKey; shadowDirty = true;
      const el = Math.asin(clamp(s.sun[1], -1, 1));
      let d = s.sun;
      if (el < 6 * D) { const az = Math.atan2(s.sun[0], s.sun[2]); const e2 = el < 0 ? 64 * D : 6 * D; d = [Math.sin(az) * Math.cos(e2), Math.sin(e2), Math.cos(az) * Math.cos(e2)]; }
      R.updateDish(d);
    }
    return { sky: s, sunFade, sunCol, nepCol, keyIsSun, ambTop, ambBottom, exposure, busy, jobs };
  }

  // ---- auto quality -----------------------------------------------------------
  let autoSamples = [];
  function autoQuality(dt) {
    if (qualityMode !== 'auto' || fixedT !== null) return;
    autoSamples.push(dt);
    if (autoSamples.length < 50) return;
    const sorted = autoSamples.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    autoSamples = [];
    if (med > 26 && qName !== 'low') { qName = qName === 'high' ? 'medium' : 'low'; R.setQuality(qName, innerWidth, innerHeight, dpr()); needs = shadowDirty = true; ui.setQualityLabel('auto · ' + qName); }
    else if (med < 9 && qName === 'medium' && !coarse) { qName = 'high'; R.setQuality(qName, innerWidth, innerHeight, dpr()); needs = shadowDirty = true; ui.setQualityLabel('auto · ' + qName); }
  }

  // ---- the loop -----------------------------------------------------------------
  let lastT = performance.now(), lastUi = 0, lastRender = 0, readyFrames = 0, lastSt = null, lastLapse = performance.now(), renderedLast = false;
  const bench = params.get('bench') ? { n: +params.get('bench') || 60, times: [] } : null;
  const benchPx = new Uint8Array(4);
  function loop(now) {
    if (document.hidden) { running = false; return; }
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    // Time-lapse runs on wall-clock time, so a slow device doesn't slow Triton down.
    if (lapse) { lapseOffset += Math.min(0.5, (now - lastLapse) / 1000) * 2 * A.HOUR; needs = true; }
    lastLapse = now;
    // How long the last rendered frame really took shows up in this rAF's interval.
    if (renderedLast && !lapse && !bench && readyFrames > 8) autoQuality(dt * 1000);
    renderedLast = false;
    // ease the camera
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const key of ['yaw', 'pitch', 'dist']) { const d = goal[key] - cam[key]; if (Math.abs(d) > 1e-4) { cam[key] += d * k; moving = true; } }
    for (let i = 0; i < 3; i++) { const d = goal.target[i] - cam.target[i]; if (Math.abs(d) > 1e-4) { cam.target[i] += d * k; moving = true; } }
    // Stop-motion: things in the world move on twos, twelve steps a second.
    const tA = animTime();
    const step = Math.floor(tA * 12);
    if (step !== lastStep || moving || bench || readyFrames < 6 || now - lastRender > 20000) needs = true;
    if (needs) {
      needs = false;
      lastRender = now;
      const simMs = simNow();
      const tq = step / 12;
      if (step !== lastStep) {
        lastStep = step;
        R.updatePuffs(tq, step);
        caretaker = W.caretakerAt(tq);
        R.updatePerson(caretaker, caretaker.visible ? W.height(caretaker.x, caretaker.z) : 0);
        shadowDirty = true;
      }
      const st = lastSt = state(simMs, tq, step);
      const v = view();
      const focus = v3.len(v3.sub(v.eye, cam.target));
      const frameState = {
        vp: v.vp, eye: v.eye, skyInv: v.skyInv, pix: v.pix,
        sunDir: st.sky.sun, sunCol: st.sunCol, nepDir: st.sky.neptune, nepCol: st.nepCol, nepPole: A.NEPTUNE_POLE,
        keyDir: st.keyIsSun ? st.sky.sun : st.sky.neptune, keyIsSun: st.keyIsSun,
        ambTop: st.ambTop, ambBottom: st.ambBottom, exposure: st.exposure, skyExposure: st.exposure,
        sunVis: smooth(-0.4, 0.6, st.sky.sunAlt), nepR: Math.atan(24764 / 354759), spin: st.sky.neptuneSpin,
        t: tq, step, hover, sel: sel ? sel.id : 0, hallA, hallB, lamps, busy: st.busy, palette,
        focus, aperture: 1.25, maxBlur: v.f.portrait ? 9 : 12, skyCoc: 0.28, dof: params.get('dof') === '0' ? 0 : 1,
        shadowDirty,
        // Daylight here is about as bright as a dim room on Earth, so lit windows still glow at noon.
        windows: 1 + 1.1 * st.sunFade,
      };
      shadowDirty = false;
      const tf = performance.now();
      R.frame(frameState);
      if (bench) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, benchPx); bench.times.push(performance.now() - tf); }
      if (photoNext) { photoNext = false; ui.savePhoto(canvas); }
      if (++readyFrames === 3) { boot.classList.remove('show'); document.body.classList.add('entered'); ui.entered(); }
      if (readyFrames === 5 && !bench) window.__ready = true;
      renderedLast = true;
    }
    if (now - lastUi > 1000 || (lapse && now - lastUi > 120)) { lastUi = now; ui.update(simNow()); }
    if (bench && bench.times.length >= bench.n) {
      const s = bench.times.slice(5).sort((a, b) => a - b);
      window.__bench = { median: s[s.length >> 1], p90: s[Math.floor(s.length * 0.9)], mean: s.reduce((a, b) => a + b, 0) / s.length, w: R.w, h: R.h, q: qName };
      window.__ready = true;
      running = false;
      return;
    }
    requestAnimationFrame(loop);
  }
  ui.setQualityLabel(qualityMode === 'auto' ? 'auto' : qualityMode);
  if (params.get('ui') === '0') document.body.classList.add('ui-hidden');
  running = true;
  requestAnimationFrame(loop);
}

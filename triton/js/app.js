// A Moon That Thinks: the app. Loaded only after the visitor presses Enter.
import { Renderer } from './render.js';
import { Terrain, frustumPlanes } from './terrain.js';
import * as A from './astro.js';
import { R, GRAV, V, D2R, heightAt, setRegionMap, regionAt, tangentFrame, latLonDir, NEP_DIST } from './world.js';
import { YEARS, GROWN, calendarYear, LANDING, numbers, offset, GEYSERS, DISH } from './machine.js';
import * as G from './gl.js';
import { lookDir, perspective, mul4, invert4 } from './gl.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const FROZEN = q.has('t');

let gl, rnd, terrain, workers = [], machine = null, canvas;
const st = {
  mode: 'orbit', year: 0, playing: false, hours: num('hours', 0), time: num('t', 0), quality: q.get('q') || 'auto',
  orbit: { lat: num('olat', 7.4), lon: num('olon', -172.5), dist: num('od', 8.9e6) },
  surf: { dir: offset(LANDING, 90, 30), alt: 1.7, yaw: 0, pitch: 12, fly: false, vz: 0, speed: 60 },
  transit: null, ui: q.get('ui') !== '0', scale: 1, instReq: null, instOrigin: null, frames: 0,
};
let keys = new Set(), lastT = 0, dragging = null, pinch = null, stick = null, bench = null;

// ---------------------------------------------------------------------------
// Boot
function bootText(t, p) { $('bootText').textContent = t; if (p !== undefined) $('bootBar').style.width = Math.round(p * 100) + '%'; }
function fail(msg) {
  document.body.classList.add('failed');
  $('bootTitle').textContent = 'Triton can’t open here.';
  bootText(msg);
  $('failActions').hidden = false;
  window.__ready = true;
}
export async function start() {
  document.body.classList.add('booting');
  if (FROZEN) document.body.classList.add('frozen');
  if (!st.ui) document.body.classList.add('ui-hidden');
  canvas = $('world');
  try {
    if (q.has('nogl')) throw new Error('nogl');
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('t') });
    if (!gl) throw new Error('nogl');
  } catch (e) { fail('This needs WebGL2, which this browser doesn’t offer. The notes still work.'); return; }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('The graphics driver stopped the 3D view. Reload the page to try again.'); });
  try {
    bootText('Compiling the enamel', .1);
    await frame();
    rnd = new Renderer(gl);
    await G.settle(gl, [rnd.p.region]);
    bootText('Laying out the ice', .3);
    await frame();
    const reg = rnd.bakeRegions();
    setRegionMap(reg.data, reg.W, reg.H);
    bootText('Growing the mind', .45);
    const mk = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workers = [mk(), mk()];
    const got = new Promise((res, rej) => {
      workers[0].addEventListener('message', e => { if (e.data.type === 'machine') res(e.data); });
      workers.forEach(w => w.addEventListener('error', e => rej(e.message || 'worker failed')));
    });
    workers.forEach((w, i) => w.postMessage({ type: 'init', region: reg.data, rw: reg.W, rh: reg.H, machine: i === 0 }));
    // the other shaders finish compiling while the workers grow the machine
    await Promise.all([G.settle(gl, Object.values(rnd.p)), got.then(m => { machine = m; })]);
    rnd.setMachine(machine);
    workers[0].addEventListener('message', e => { if (e.data.type === 'inst') { rnd.setInstances(e.data.data, e.data.origin, e.data.plants); st.instOrigin = e.data.origin; st.instReq = null; } });
    terrain = new Terrain(gl, workers);
    bootText('Building the surface', .6);
  } catch (e) { console.error(e); fail('Something went wrong while building Triton: ' + (e.message || e)); return; }
  // Start with the terminator facing you: the Sun and Neptune are shown as they will be at the
  // next moment the Sun sits there (within six days). The HUD says which day that is.
  const groundStart = !q.has('view') && !q.has('night') && !q.has('descend');
  if (!q.has('hours') && groundStart) {
    // On the ground: the next moment the Sun stands about 27° up in the west at the landing site,
    // so the rose ice and the fins are lit and Neptune is about half lit.
    const now = Date.now(), fr = tangentFrame(LANDING);
    let best = 0, bs = 1e9;
    for (let h = 0; h < A.PERIOD_MS / A.HOUR; h += .25) {
      const s = A.sunBody(now + h * A.HOUR), e = Math.asin(V.dot(s, LANDING)) / D2R, east = V.dot(s, fr.east);
      const score = Math.abs(e - 27) + (east > 0 ? 50 : 0);
      if (score < bs) { bs = score; best = h; }
    }
    st.hours = best;
  } else if (!q.has('hours')) {
    const now = Date.now(), H = A.hourAngle(now), target = -100 * D2R;
    const frac = (((target - H) / (2 * Math.PI)) % 1 + 1) % 1;
    st.hours = frac * A.PERIOD_MS / A.HOUR;
  }
  // initial view and year
  // ?year= takes a calendar year (2050–2090); without it the moon is shown fully grown
  st.year = q.has('year') ? clamp((num('year', 2090) - 2050) * 15, 0, YEARS) : GROWN;
  st.playing = false;
  // the first view is the ground at the landing site, looking up the avenue at Neptune
  if (groundStart) enterSurface(st.surf.dir, 0, 12, 1.7);
  if (q.has('night')) { const f = nightField(Date.now() + st.hours * A.HOUR); enterSurface(f.dir, f.yaw + num('yaw', 0), num('pitch', 12), num('alt', 1.7)); }
  else if (q.get('view') === 'surface') enterSurface(q.has('lat') ? latLonDir(num('lat', -60), num('lon', 0)) : st.surf.dir, num('yaw', 0), num('pitch', 12), num('alt', 1.7));
  bindInputs();
  resize();
  if (q.has('descend')) { landAt(offset(LANDING, 90, 30), 0); if (st.transit) st.transit.t = num('descend', .5); }
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { lastT = 0; if (!document.hidden) requestAnimationFrame(loop); });
  if (q.has('bench')) bench = { n: num('bench', 30), times: [] };
  updateYearUI();
  window.__triton = { st, terrain: () => terrain, rnd: () => rnd };
  requestAnimationFrame(loop);
}
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------------------
// Size and quality
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const caps = { high: Math.min(dpr, 2), medium: Math.min(dpr, 1.25), low: .75, auto: Math.min(dpr, touch ? 1.25 : 1.5) * st.scale };
  const ratio = caps[st.quality] ?? caps.auto;
  const w = Math.round(innerWidth * ratio), h = Math.round(innerHeight * ratio);
  canvas.width = w; canvas.height = h;
  st.ss = ratio;
  rnd.resize(w, h);
  $('qualityBtn').textContent = 'Quality: ' + st.quality;
}

// ---------------------------------------------------------------------------
// Cameras
function orbitCam() {
  const o = st.orbit;
  const c = V.mul(latLonDir(o.lat, o.lon), o.dist);
  const toT = V.norm(V.mul(c, -1)), toN = V.norm(V.sub([NEP_DIST, 0, 0], c));
  const lead = .3 * smooth(3.5e6, 8.9e6, o.dist);
  let f = V.norm(V.add(V.mul(toT, 1 - lead), V.mul(toN, lead)));
  let up0 = [0, 0, 1];
  const r0 = V.norm(V.cross(f, up0)); up0 = V.cross(r0, f);
  const roll = 14 * D2R * smooth(3e6, 8.9e6, o.dist);
  const up = V.add(V.mul(up0, Math.cos(roll)), V.mul(r0, Math.sin(roll)));
  const aspect = innerWidth / innerHeight;
  const fov = Math.max((22 + 26 * (1 - smooth(2.4e6, 7.5e6, o.dist))) * D2R, 2 * Math.atan(Math.tan(19 * D2R / 2) / aspect));
  return { pos: c, f, up, fovy: fov };
}
function groundAt(d) { return R + heightAt(d); }
function surfCam() {
  const s = st.surf, fr = tangentFrame(s.dir);
  const pos = V.mul(s.dir, groundAt(s.dir) + s.alt);
  const h = V.add(V.mul(fr.north, Math.cos(s.yaw * D2R)), V.mul(fr.east, Math.sin(s.yaw * D2R)));
  const f = V.norm(V.add(V.mul(h, Math.cos(s.pitch * D2R)), V.mul(fr.up, Math.sin(s.pitch * D2R))));
  const aspect = innerWidth / innerHeight;
  const fovy = clamp(Math.max(num('fov', 56) * D2R, 2 * Math.atan(Math.tan(52 * D2R / 2) / aspect)), 0, 84 * D2R);
  return { pos, f, up: fr.up, fovy };
}
/** The avenue mouth of a field: a spawn point 2 km from its centre, facing up the avenue. */
function fieldSpawn(f) {
  const b = V.cross(f.a, f.c), p = V.norm(V.add(f.c, V.mul(V.add(V.mul(b, 30), V.mul(f.a, -2000)), 1 / R)));
  const fr = tangentFrame(p);
  return { dir: p, yaw: Math.atan2(V.dot(f.a, fr.east), V.dot(f.a, fr.north)) / D2R };
}
/** A big field where it is night now (Neptune up if possible). */
function nightField(ms) {
  const sun = A.sunBody(ms);
  let best = null, bs = -9;
  for (const f of machine.fields) { if (f.kind !== 1) continue; const sc = -V.dot(f.c, sun) + .25 * f.c[0]; if (sc > bs) { bs = sc; best = f; } }
  return fieldSpawn(best);
}
function enterSurface(dir, yaw, pitch, alt) {
  Object.assign(st.surf, { dir, yaw, pitch, alt, fly: alt > 3, vz: 0 });
  st.mode = 'surface'; st.transit = null;
  document.body.classList.add('on-surface'); document.body.classList.remove('in-orbit');
  updateModeUI();
}
const slerp = (a, b, t) => {
  const d = Math.acos(clamp(V.dot(a, b), -1, 1));
  if (d < 1e-7) return a;
  const s = Math.sin(d);
  return V.add(V.mul(a, Math.sin((1 - t) * d) / s), V.mul(b, Math.sin(t * d) / s));
};
/** Fly from wherever we are down to a point on the ground (or back up to orbit). */
function landAt(dir, yaw = null) {
  if (st.transit) return;
  const from = currentCam();
  if (yaw === null) {
    // face Neptune if it's up, otherwise north
    const fr = tangentFrame(dir), nep = V.norm(V.sub([NEP_DIST, 0, 0], V.mul(dir, R)));
    yaw = V.dot(nep, fr.up) > -.05 ? Math.atan2(V.dot(nep, fr.east), V.dot(nep, fr.north)) / D2R : 0;
  }
  const to = { dir, yaw, pitch: 12, alt: 1.7 };
  if (reduced) { fade(() => enterSurface(dir, yaw, 12, 1.7)); return; }
  st.transit = { kind: 'down', t: 0, T: 8.5, from, to };
  st.mode = 'transit';
  document.body.classList.add('on-surface'); document.body.classList.remove('in-orbit');
  updateModeUI();
}
function toOrbit() {
  if (st.transit) return;
  const from = currentCam(), n = V.norm(from.pos);
  st.orbit.lat = Math.asin(n[2]) / D2R; st.orbit.lon = Math.atan2(n[1], n[0]) / D2R; st.orbit.dist = 6.5e6;
  if (reduced) { fade(() => { st.mode = 'orbit'; updateModeUI(); }); return; }
  st.transit = { kind: 'up', t: 0, T: 6, from };
  st.mode = 'transit';
  document.body.classList.remove('on-surface'); document.body.classList.add('in-orbit');
  updateModeUI();
}
function fade(fn) { const v = $('veil'); v.classList.add('on'); setTimeout(() => { fn(); updateModeUI(); setTimeout(() => v.classList.remove('on'), 60); }, 260); }
function transitCam(dt) {
  const tr = st.transit;
  if (!FROZEN) tr.t = Math.min(1, tr.t + dt / tr.T);
  const t = tr.t, e = t * t * t * (t * (t * 6 - 15) + 10);
  if (tr.kind === 'down') {
    const fromDir = V.norm(tr.from.pos), d = V.norm(slerp(fromDir, tr.to.dir, smooth(0, .7, t)));
    const a0 = V.len(tr.from.pos) - groundAt(fromDir), a1 = tr.to.alt;
    // log descent, but never below a glide slope towards the landing point
    const left = Math.acos(clamp(V.dot(d, tr.to.dir), -1, 1)) * R;
    const alt = Math.max(Math.exp(Math.log(a0) + (Math.log(a1) - Math.log(a0)) * e), left * .55);
    const pos = V.mul(d, groundAt(d) + alt);
    Object.assign(st.surf, tr.to);
    const end = surfCam();
    const target = V.mul(tr.to.dir, groundAt(tr.to.dir));
    const look = V.norm(V.sub(target, pos));
    const k = smooth(.55, 1, t);
    const f = V.norm(slerp(look, end.f, k));
    const fr = tangentFrame(d), hd = V.add(V.mul(fr.north, Math.cos(tr.to.yaw * D2R)), V.mul(fr.east, Math.sin(tr.to.yaw * D2R)));
    let up = V.norm(slerp(tr.from.up, hd, smooth(0, .45, t)));
    up = V.norm(slerp(up, end.up, smooth(.55, 1, t)));
    const fovy = tr.from.fovy + (end.fovy - tr.from.fovy) * smooth(.1, .8, t);
    if (t >= 1) enterSurface(tr.to.dir, tr.to.yaw, tr.to.pitch, tr.to.alt);
    return { pos, f, up, fovy };
  }
  const end = orbitCam(), fromDir = V.norm(tr.from.pos);
  const a0 = V.len(tr.from.pos) - groundAt(fromDir), a1 = end.pos ? V.len(end.pos) - R : 6e6;
  const alt = Math.exp(Math.log(Math.max(a0, 1)) + (Math.log(a1) - Math.log(Math.max(a0, 1))) * e);
  const d = V.norm(slerp(fromDir, V.norm(end.pos), e));
  const pos = V.mul(d, R + alt);
  const f = V.norm(slerp(tr.from.f, V.norm(V.mul(pos, -1)), smooth(0, .5, t)));
  const ff = V.norm(slerp(f, end.f, smooth(.5, 1, t)));
  const up = V.norm(slerp(tr.from.up, end.up, smooth(.1, .9, t)));
  const fovy = tr.from.fovy + (end.fovy - tr.from.fovy) * smooth(.3, 1, t);
  if (t >= 1) { st.transit = null; st.mode = 'orbit'; updateModeUI(); }
  return { pos, f, up, fovy };
}
function currentCam() { return st.mode === 'orbit' ? orbitCam() : st.mode === 'surface' ? surfCam() : st.lastCam; }

// ---------------------------------------------------------------------------
// Movement on the ground and in the air
function updateSurface(dt) {
  const s = st.surf;
  let fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (stick) { fwd -= stick.y; right += stick.x; }
  const m = Math.hypot(fwd, right); if (m > 1) { fwd /= m; right /= m; }
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let speed;
  if (s.fly) speed = s.speed * (fast ? 5 : 1) * Math.max(1, s.alt / 400);
  else speed = fast ? 7 : 1.8;
  const fr = tangentFrame(s.dir);
  const h = V.add(V.mul(fr.north, Math.cos(s.yaw * D2R)), V.mul(fr.east, Math.sin(s.yaw * D2R)));
  const rt = V.cross(h, fr.up);
  const mv = V.add(V.mul(h, fwd * speed * dt), V.mul(rt, right * speed * dt));
  if (fwd || right) {
    const r = groundAt(s.dir) + s.alt;
    const nd = V.norm(V.add(s.dir, V.mul(mv, 1 / r)));
    // keep the heading steady as we move over the curve
    const nf = tangentFrame(nd), hh = V.norm(V.sub(h, V.mul(nd, V.dot(h, nd))));
    s.yaw = Math.atan2(V.dot(hh, nf.east), V.dot(hh, nf.north)) / D2R;
    s.dir = nd;
  }
  if (s.fly) {
    const up = (keys.has('Space') || keys.has('KeyE') || (stick && stick.up) ? 1 : 0) - (keys.has('KeyQ') || keys.has('KeyC') || (stick && stick.down) ? 1 : 0);
    s.alt = clamp(s.alt * Math.exp(up * dt * 1.2) + up * dt * 4, 1.7, 400e3);
    if (s.alt > 300e3) { toOrbit(); }
  } else {
    s.vz -= GRAV * dt; s.alt += s.vz * dt;
    if (s.alt <= 1.7) { s.alt = 1.7; s.vz = 0; }
  }
}
function updateOrbit(dt) {
  const o = st.orbit;
  const k = (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0) - (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0);
  const l = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
  const rate = 40 * Math.min(1, (o.dist - R) / 4e6 + .15);
  o.lon += k * rate * dt; o.lat = clamp(o.lat + l * rate * dt, -85, 85);
  const z = (keys.has('Equal') || keys.has('NumpadAdd') ? 1 : 0) - (keys.has('Minus') || keys.has('NumpadSubtract') ? 1 : 0);
  if (z) zoom(-z * dt * 1.5);
}
function zoom(amount) { const o = st.orbit; o.dist = clamp(R + (o.dist - R) * Math.exp(amount), R + 90e3, 6e7); }

// ---------------------------------------------------------------------------
// The loop
function loop(now) {
  if (document.hidden) return;
  const dt = lastT ? Math.min(.1, (now - lastT) / 1000) : 1 / 60;
  lastT = now;
  if (!FROZEN && !reduced) st.time += dt;
  if (st.playing) { st.year = Math.min(GROWN, st.year + dt * GROWN / 26); if (st.year >= GROWN) st.playing = false; updateYearUI(); }
  if (st.mode === 'orbit') updateOrbit(dt);
  if (st.mode === 'surface') updateSurface(dt);
  const c = st.mode === 'transit' ? transitCam(dt) : currentCam();
  st.lastCam = c;
  const ms = Date.now() + st.hours * A.HOUR;
  const view = lookDir([0, 0, 0], c.f, c.up);
  const proj = perspective(c.fovy, canvas.width / canvas.height, .25, 1e11);
  const vp = mul4(proj, view);
  const cam = { pos: c.pos, vp, inv: invert4(vp), fovy: c.fovy };
  const chunks = terrain.select(c.pos, frustumPlanes(vp), st.quality === 'low' ? .75 : st.quality === 'high' ? 1.2 : 1);
  const alt = V.len(c.pos) - groundAt(V.norm(c.pos));
  // 3D radiators near the camera, rebuilt as we move
  let finRing = 0;
  if (alt < 40e3) {
    const o = st.instOrigin, moved = o ? Math.acos(clamp(V.dot(V.norm(o), V.norm(c.pos)), -1, 1)) * R : 1e9;
    if (moved > 1500 && !st.instReq) { st.instReq = c.pos; workers[0].postMessage({ type: 'inst', cam: c.pos }); }
    if (o && moved < 6000) finRing = 27000;
  }
  const booting = document.body.classList.contains('booting');
  if (!booting || window.__ready) rnd.render({ cam, chunks, terrainCount: terrain.count, sun: A.sunBody(ms), nepLit: A.neptuneLit(ms), nepPole: A.neptunePole(ms),
    nepSpin: (ms / (14.46 * A.HOUR)) * 2 * Math.PI % (2 * Math.PI) + st.time * .01, year: st.year, time: st.time, ss: st.ss,
    finRing, orbit: alt > 300e3, netW: alt > 300e3 ? 1.15 : 1.9, geysers: true });
  st.frames++;
  if (st.frames % 10 === 0 || FROZEN) updateHUD(c, alt);
  if (st.mode === 'surface') updateTags(c, vp, alt);
  // ready for screenshots once the ground has arrived
  if (booting && terrain.cache.size > 0 && st.frames > 2 && (terrain.busy === 0 || (now - (st.bootT || (st.bootT = now))) > 9000)) {
    document.body.classList.remove('booting'); document.body.classList.add('running', st.mode === 'orbit' ? 'in-orbit' : 'on-surface');
  }
  const settled = !booting && terrain.busy === 0 && !st.instReq && (alt > 40e3 || st.instOrigin);
  st.settle = settled ? (st.settle || 0) + 1 : 0;
  if (st.settle > 3 && !window.__ready && (st.mode !== 'transit' || FROZEN)) window.__ready = true;
  if (bench && window.__ready) {
    bench.times.push(now);
    if (bench.times.length > bench.n) { const t = bench.times, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); window.__bench = { median: d[d.length >> 1], frames: d.length, chunks: chunks.length, inst: rnd.inst ? rnd.inst.count : 0 }; bench = null; }
  }
  if (st.quality === 'auto' && !FROZEN) autoQuality(dt);
  // frozen review frames stop once ready, so screenshots don't wait on a busy renderer
  if (FROZEN && window.__ready && !bench) { st.stopped = true; return; }
  requestAnimationFrame(loop);
}
let slow = 0, fastF = 0;
function autoQuality(dt) {
  if (dt > 1 / 28) { slow++; fastF = 0; } else if (dt < 1 / 55) { fastF++; slow = 0; }
  if (slow > 40 && st.scale > .55) { st.scale = Math.max(.55, st.scale * .85); slow = 0; resize(); }
  if (fastF > 240 && st.scale < 1) { st.scale = Math.min(1, st.scale * 1.1); fastF = 0; resize(); }
}

// ---------------------------------------------------------------------------
// Two small labels on the ground: the nearest fusion plant, and the radiators beside it.
function project(vp, rel) {
  const x = vp[0] * rel[0] + vp[4] * rel[1] + vp[8] * rel[2] + vp[12], y = vp[1] * rel[0] + vp[5] * rel[1] + vp[9] * rel[2] + vp[13];
  const w = vp[3] * rel[0] + vp[7] * rel[1] + vp[11] * rel[2] + vp[15];
  if (w <= 1) return null;
  return [(x / w * .5 + .5) * innerWidth, (.5 - y / w * .5) * innerHeight];
}
function placeTag(el, vp, cpos, P, dist, near, far) {
  const s = project(vp, V.sub(P, cpos));
  const vis = s && s[0] > 40 && s[0] < innerWidth - 40 && s[1] > 90 && s[1] < innerHeight - 40 ? 1 - smooth(near, far, dist) : 0;
  if (s) el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, calc(-100% - 30px))`;
  el.style.opacity = vis.toFixed(2);
}
function updateTags(c, vp, alt) {
  const tp = $('tagPlant'), tf = $('tagFins'), inst = rnd.inst;
  if (alt > 2500 || !inst || !inst.plantData || st.year <= 0) { tp.style.opacity = 0; tf.style.opacity = 0; return; }
  const o = inst.origin, pd = inst.plantData;
  let best = -1, bd = 1e9;
  for (let i = 0; i < pd.length; i += 16) {
    if (st.year < pd[i + 14] + .3) continue;
    const d = Math.hypot(o[0] + pd[i] - c.pos[0], o[1] + pd[i + 1] - c.pos[1], o[2] + pd[i + 2] - c.pos[2]);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) { tp.style.opacity = 0; tf.style.opacity = 0; return; }
  const up = [pd[best + 3], pd[best + 4], pd[best + 5]], base = [o[0] + pd[best], o[1] + pd[best + 1], o[2] + pd[best + 2]];
  placeTag(tp, vp, c.pos, V.add(base, V.mul(up, pd[best + 10] + 10)), bd, 3500, 9000);
  // the radiators: a panel row on the other side of the avenue, 450 m further in
  const f = machine.fields[pd[best + 15]];
  if (!f) { tf.style.opacity = 0; return; }
  const b = V.cross(f.a, f.c), side = V.dot(up, b) > 0 ? -1 : 1;
  const d = V.norm(V.add(f.c, V.mul(V.add(V.mul(b, side * 1000), V.mul(f.a, -450)), 1 / R)));
  const P = V.mul(d, groundAt(d) + 330);
  placeTag(tf, vp, c.pos, P, V.len(V.sub(P, c.pos)), 3500, 9000);
}

// ---------------------------------------------------------------------------
// Interface
const fmtInt = n => Math.round(n).toLocaleString('en-US');
function sci(x) { if (x <= 0) return '0'; const e = Math.floor(Math.log10(x)), m = x / 10 ** e; return m.toFixed(1) + ' × 10' + String(e).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c] || '').join(''); }
function power(w) { if (w >= 1e15) return (w / 1e15).toFixed(w >= 1e16 ? 0 : 1) + ' PW'; if (w >= 1e12) return (w / 1e12).toFixed(1) + ' TW'; if (w >= 1e9) return (w / 1e9).toFixed(1) + ' GW'; return (w / 1e6).toFixed(0) + ' MW'; }
function updateYearUI() {
  if (!machine) return;
  const y = st.year, n = numbers(machine.fields, y);
  $('year').value = String(Math.round(y));
  $('year').setAttribute('aria-valuetext', String(Math.floor(calendarYear(y))));
  $('yearOut').textContent = String(Math.floor(calendarYear(y)));
  $('nArea').textContent = n.radiator > 0 ? fmtInt(n.radiator / 1e6) + ' km²' : '—';
  $('nHeat').textContent = n.heat > 0 ? power(n.heat) : '—';
  $('nHuman').textContent = n.heat > 0 ? (n.heat / 19e12 >= 1 ? fmtInt(n.heat / 19e12) + '×' : (n.heat / 19e12 * 100).toFixed(1) + '%') : '—';
  $('nCompute').textContent = n.compute > 0 ? sci(n.compute) : '—';
  $('nAI').textContent = n.ai > 0 ? sci(n.ai) + '×' : '—';
  $('nShare').textContent = (n.share * 100).toFixed(n.share < .01 ? 2 : 1) + '%';
  $('growBtn').textContent = st.playing ? 'Pause' : (y >= GROWN - 1 ? 'Watch it grow' : 'Grow');
  $('growBtn').setAttribute('aria-pressed', String(st.playing));
}
function updateModeUI() {
  const surf = st.mode !== 'orbit';
  if (st.mode !== 'surface') { $('tagPlant').style.opacity = 0; $('tagFins').style.opacity = 0; }
  $('landBtn').textContent = surf ? (innerWidth < 500 ? 'Orbit' : 'Back to orbit') : 'Land';
  $('flyBtn').hidden = st.mode !== 'surface';
  $('flyBtn').textContent = st.surf.fly ? 'Walk' : 'Fly';
  $('hint').textContent = st.mode === 'orbit'
    ? (touch ? 'Drag to turn · pinch to zoom · tap to land' : 'Drag to turn · scroll to zoom · click anywhere on Triton to land')
    : st.mode === 'surface' ? (touch || innerWidth < 500 ? 'Left pad to move · drag to look' : 'Click to look around · W A S D to move · F to fly · O for orbit') : 'Descending…';
}
function updateHUD(c, alt) {
  const n = V.norm(c.pos), lat = Math.asin(n[2]) / D2R, lon = Math.atan2(n[1], n[0]) / D2R;
  $('where').textContent = `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(1)}° ${lon < 0 ? 'W' : 'E'}`;
  $('alt').textContent = alt > 20e3 ? fmtInt(alt / 1000) + ' km up' : alt > 50 ? fmtInt(alt) + ' m up' : 'on the ground';
  const now = Date.now(), lt = A.lightTime(now);
  $('sky').textContent = Math.abs(st.hours) < .05 ? 'Sky: now' : `Sky: as ${A.when(now + st.hours * A.HOUR, now)}`;
  $('delay').textContent = `Results sent home now reach Earth ${A.when(now + lt.ms, now)} (${A.span(lt.ms)} of light).`;
}
function bindInputs() {
  $('sky').addEventListener('click', () => { st.hours = Math.abs(st.hours) < .05 ? (st.savedHours || 0) : (st.savedHours = st.hours, 0); });
  $('year').addEventListener('input', e => { st.year = +e.target.value; st.playing = false; updateYearUI(); });
  $('growBtn').addEventListener('click', () => { if (st.playing) st.playing = false; else { if (st.year >= GROWN - 1) st.year = 0; st.playing = true; } updateYearUI(); });
  $('landBtn').addEventListener('click', () => (st.mode === 'orbit' ? landAt(st.surf.dir, 0) : toOrbit()));
  $('flyBtn').addEventListener('click', toggleFly);
  $('qualityBtn').addEventListener('click', () => { const o = ['auto', 'high', 'medium', 'low']; st.quality = o[(o.indexOf(st.quality) + 1) % 4]; st.scale = 1; resize(); });
  $('photoBtn').addEventListener('click', photo);
  $('atlasBtn').addEventListener('click', () => openPanel('atlas'));
  $('helpBtn').addEventListener('click', () => openPanel('notes'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  document.querySelectorAll('.overlay').forEach(el => el.addEventListener('pointerdown', e => { if (e.target === el) closePanels(); }));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.go; closePanels();
    if (g === 'landing') landAt(offset(LANDING, 90, 30), 0);
    if (g === 'dish') landAt(offset(DISH, 200, 2600), 20);
    if (g === 'geyser') landAt(offset(GEYSERS[1].p, 140, 12000), -40);
    if (g === 'night') { const f = nightField(Date.now() + st.hours * A.HOUR); landAt(f.dir, f.yaw); }
  }));
  $('map').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    const lon = ((e.clientX - r.left) / r.width - .5) * 360, lat = (.5 - (e.clientY - r.top) / r.height) * 180;
    closePanels(); landAt(latLonDir(lat, lon));
  });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Escape') { closePanels(); if (document.pointerLockElement) document.exitPointerLock(); return; }
    if (document.querySelector('.overlay.open')) return;
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyF' && st.mode === 'surface') toggleFly();
    if (e.code === 'Space' && st.mode === 'surface' && !st.surf.fly && st.surf.alt <= 1.75) st.surf.vz = 3.2;
    if (e.code === 'KeyO') { if (st.mode === 'surface') toOrbit(); }
    if (e.code === 'KeyL') { if (st.mode === 'orbit') landAt(st.surf.dir, 0); }
    if (e.code === 'KeyM') openPanel('atlas');
    if (e.code === 'KeyG') $('growBtn').click();
    if (e.code === 'KeyP') photo();
    if (e.code === 'KeyH') document.body.classList.toggle('ui-hidden');
    if (e.code === 'Slash') openPanel('notes');
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (st.mode === 'orbit') zoom(e.deltaY * .0012);
    else if (st.mode === 'surface' && st.surf.fly) st.surf.speed = clamp(st.surf.speed * Math.exp(-e.deltaY * .0015), 5, 20000);
  }, { passive: false });
  const pts = new Map();
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && st.mode === 'orbit') { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: st.orbit.dist }; }
    dragging = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  });
  canvas.addEventListener('pointermove', e => {
    if (document.pointerLockElement === canvas && st.mode === 'surface') { look(e.movementX, e.movementY); return; }
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); st.orbit.dist = clamp(R + (pinch.dist - R) * pinch.d / Math.max(d, 1), R + 90e3, 6e7); return; }
    if (!dragging || dragging.id !== e.pointerId) return;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    dragging.x = e.clientX; dragging.y = e.clientY; dragging.moved += Math.abs(dx) + Math.abs(dy);
    if (st.mode === 'orbit') {
      const k = .22 * Math.min(1, (st.orbit.dist - R) / 5e6 + .12);
      st.orbit.lon -= dx * k; st.orbit.lat = clamp(st.orbit.lat + dy * k, -85, 85);
    } else if (st.mode === 'surface') look(dx, dy);
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (dragging && dragging.id === e.pointerId) {
      if (dragging.moved < 6) click(e);
      dragging = null;
    }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  // touch joystick on the surface
  const pad = $('stick'), knob = $('knob');
  pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); stick = { x: 0, y: 0 }; moveStick(e); });
  pad.addEventListener('pointermove', e => { if (stick) moveStick(e); });
  const endStick = () => { stick = null; knob.style.transform = ''; };
  pad.addEventListener('pointerup', endStick); pad.addEventListener('pointercancel', endStick);
  function moveStick(e) { const r = pad.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, m = Math.hypot(x, y), k = m > 40 ? 40 / m : 1;
    stick.x = x * k / 40; stick.y = y * k / 40; knob.style.transform = `translate(${x * k}px,${y * k}px)`; }
  for (const [id, prop] of [['upBtn', 'up'], ['downBtn', 'down']]) {
    const b = $(id);
    b.addEventListener('pointerdown', () => { if (!st.surf.fly) toggleFly(); stick = stick || { x: 0, y: 0 }; stick[prop] = true; });
    b.addEventListener('pointerup', () => { if (stick) stick[prop] = false; });
  }
}
function look(dx, dy) { st.surf.yaw += dx * .15; st.surf.pitch = clamp(st.surf.pitch - dy * .15, -85, 85); }
function toggleFly() {
  const s = st.surf; s.fly = !s.fly; s.vz = 0;
  if (s.fly && s.alt < 30) s.alt = 30;
  updateModeUI();
}
function click(e) {
  if (st.mode === 'orbit') {
    // which point on Triton is under the pointer?
    const c = st.lastCam, r = canvas.getBoundingClientRect();
    const view = lookDir([0, 0, 0], c.f, c.up), proj = perspective(c.fovy, canvas.width / canvas.height, .25, 1e11);
    const inv = invert4(mul4(proj, view));
    const x = (e.clientX - r.left) / r.width * 2 - 1, y = 1 - (e.clientY - r.top) / r.height * 2;
    const p = [inv[0] * x + inv[4] * y - inv[8] + inv[12], inv[1] * x + inv[5] * y - inv[9] + inv[13], inv[2] * x + inv[6] * y - inv[10] + inv[14]];
    const w = inv[3] * x + inv[7] * y - inv[11] + inv[15];
    const d = V.norm([p[0] / w, p[1] / w, p[2] / w]);
    const b = V.dot(c.pos, d), cc = V.dot(c.pos, c.pos) - R * R, disc = b * b - cc;
    if (disc > 0) { const t = -b - Math.sqrt(disc); if (t > 0) landAt(V.norm(V.add(c.pos, V.mul(d, t)))); }
  } else if (st.mode === 'surface' && !touch && canvas.requestPointerLock) {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag still works */ }
  }
}
function openPanel(id) {
  closePanels();
  $(id).classList.add('open');
  if (id === 'atlas') drawAtlas();
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear();
}
function closePanels() { document.querySelectorAll('.overlay.open').forEach(el => el.classList.remove('open')); }
function photo() {
  requestAnimationFrame(() => canvas.toBlob(b => {
    if (!b) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'triton-' + Math.floor(calendarYear(st.year)) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }));
}
// The atlas: Triton unrolled, with the mind as far as it has grown.
function drawAtlas() {
  const cv = $('map'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lat = (.5 - (y + .5) / H) * 180, lon = ((x + .5) / W - .5) * 360, d = latLonDir(lat, lon);
    const cap = regionAt(d, 0), cant = regionAt(d, 1), str = regionAt(d, 2), col = regionAt(d, 3);
    let c = [218, 208, 190];
    if (cant > .5) c = [182, 192, 160];
    if (col > .55) c = [132, 188, 204];
    if (cap > .5) c = str > .5 ? [140, 74, 80] : [242, 206, 200];
    const o = (y * W + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const P = (p) => [(Math.atan2(p[1], p[0]) / (2 * Math.PI) + .5) * W, (.5 - Math.asin(p[2]) / Math.PI) * H];
  ctx.fillStyle = 'rgba(150,30,50,.85)';
  for (const f of machine.fields) { if (f.birth > st.year) continue; const [x, y] = P(f.c), g = Math.min(1, Math.sqrt((st.year - f.birth) / f.years)); const r = f.r * g / R / Math.PI * H; ctx.beginPath(); ctx.ellipse(x, y, r / Math.max(.1, Math.cos(Math.asin(f.c[2]))), r, 0, 0, 7); ctx.fill(); }
  const nd = machine.nodes;
  ctx.strokeStyle = '#c99a3a'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < nd.length / 6; i++) {
    const par = nd[i * 6 + 3]; if (par < 0 || nd[i * 6 + 4] > st.year || nd[i * 6 + 5] < 3) continue;
    const a = P([nd[par * 6], nd[par * 6 + 1], nd[par * 6 + 2]]), b = P([nd[i * 6], nd[i * 6 + 1], nd[i * 6 + 2]]);
    if (Math.abs(a[0] - b[0]) > W / 2) continue;
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  const mark = (p, label) => { const [x, y] = P(p); ctx.fillStyle = '#fff4d6'; ctx.strokeStyle = '#1b2350'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.font = '600 12px system-ui,sans-serif'; ctx.strokeText(label, x + 7, y + 4); ctx.fillText(label, x + 7, y + 4); };
  mark(LANDING, 'Landing'); mark(DISH, 'The dish'); mark(GEYSERS[1].p, 'Geyser');
  const here = V.norm(st.lastCam.pos), [hx, hy] = P(here);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.stroke();
}

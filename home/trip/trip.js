// The trip: a sticky stage behind the page's sections, whose camera travels out from the Sun as
// you scroll. Scroll position alone drives it (no scroll-jacking): each place's section holds
// the camera on that place while its card is up, and the stretch between two sections carries
// the camera to the next place with an ease in and out, smoothed a touch so wheel steps glide.
//
// Layers, back to front: the sky (stars at parallax depth, orbits) on one canvas, redrawn when
// the camera moves; the plates (what holds still at each place), printed in a worker at the
// screen's resolution around the camera only and moved by the compositor; the live layer (what
// moves) on one canvas at 30 fps, drawing only places in view. Time runs only while the stage is
// on screen and the tab is visible.
import { world, lens, STOPS, STILL_T, PORTRAIT_QUERY, LABELS } from './world.js';
import { makeSky, drawSky } from './sky.js';
import { drawLive } from './live.js';
import { swarmScene, launchTime } from './swarm.js';
import { easeInOut, clamp, smooth } from './math.js';

// where each section holds the camera, in places along the trip (for printing plates ahead and
// for the rail): the five places, then the end past Neptune with the 2050s statement
const POS = { swarm: 0, venus: 1, ring: 2, sky: 3, triton: 4, outro: 4.7 };
const MAX_STAGE_PX = 8.4e6;   // device pixels per stage canvas (a 4K screen at full resolution)
const FPS = 30;               // the live layer's rate; the camera follows scroll at the display's rate
const NEAR = 1.3, FAR = 2.4;  // print plates within NEAR places of the camera; free them beyond FAR

export function startTrip(root, { fixedT = null, onReady = () => {}, onFail = () => {} } = {}) {
  const stage = root.querySelector('[data-stage]');
  const mk = (tag, cls) => { const e = document.createElement(tag); e.className = cls; e.setAttribute('aria-hidden', 'true'); return e; };
  const skyC = mk('canvas', 'stage-layer stage-sky'), worldEl = mk('div', 'stage-layer stage-world'), liveC = mk('canvas', 'stage-layer stage-live');
  stage.append(skyC, worldEl, liveC);
  const sctx = skyC.getContext('2d'), lctx = liveC.getContext('2d');
  const portrait = matchMedia(PORTRAIT_QUERY);
  const sections = [...root.querySelectorAll('[data-frame]')];
  const rail = document.querySelector('[data-rail]'), railLinks = rail ? [...rail.querySelectorAll('a')] : [];
  const odo = document.querySelector('[data-odo]'), odoAU = odo?.querySelector('[data-au]'), odoLT = odo?.querySelector('[data-lt]');

  let S = null, keys = [], fi = 0, pos = 0, raf = 0, visible = true, last = 0, lastLive = -1e9, simT = 0, dirty = true, live = false, dead = false;
  const extras = [], plates = new Map(), queue = [], shown = new Map();
  let worker = null, printer = null, busy = false, jobs = 0;

  /* ── sizes ── */
  function measure() {
    const r = stage.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (W * H * dpr * dpr > MAX_STAGE_PX) dpr = Math.sqrt(MAX_STAGE_PX / (W * H));
    const mode = portrait.matches ? 'portrait' : 'landscape', w = world(mode), ln = lens(w, W, H);
    return { W, H, dpr, mode, w, ln, kd: ln.k * dpr, key: `${mode} ${Math.round(W)}x${Math.round(H)} ${dpr.toFixed(3)}`, cx: NaN, cy: NaN };
  }
  function setup() {
    const prev = S; S = measure();
    if (prev && prev.key === S.key) { S = prev; return false; }
    for (const c of [skyC, liveC]) { c.width = Math.round(S.W * S.dpr); c.height = Math.round(S.H * S.dpr); }
    S.sky = makeSky(S.w, S.kd);
    for (const [id] of plates) drop(id);
    queue.length = 0;
    labels();
    computeKeys();
    dirty = true;
    return true;
  }
  function labels() {
    worldEl.querySelectorAll('.stage-label').forEach(e => e.remove());
    for (const L of LABELS[S.mode]) {
      const e = document.createElement('span'); e.className = 'stage-label' + (L.cls ? ' ' + L.cls : '');
      e.textContent = L.text; e.style.left = (L.x * S.ln.k).toFixed(1) + 'px'; e.style.top = (L.y * S.ln.k).toFixed(1) + 'px';
      worldEl.appendChild(e);
    }
  }

  /* ── scroll → camera ── */
  function computeKeys() {
    const y0 = window.scrollY, vh = S.H;
    keys = sections.map((sec, j) => {
      const r = sec.getBoundingClientRect(), top = r.top + y0, h = r.height, frame = sec.dataset.frame;
      return { j, frame, pos: POS[frame], top, a: j === 0 ? 0 : top, b: Math.max(top, top + h - vh), card: sec.querySelector('[data-card]') };
    });
  }
  // scroll → a fractional index into keys: whole while a section holds, eased between them
  function target(y) {
    if (!keys.length || y <= keys[0].b) return 0;
    for (let j = 0; j < keys.length - 1; j++) {
      const A = keys[j], B = keys[j + 1];
      if (y <= A.b) return j;
      if (y < B.a) return j + easeInOut(clamp((y - A.b) / (B.a - A.b)));
    }
    return keys.length - 1;
  }
  const between = (f, get) => {
    const j = Math.max(0, Math.min(keys.length - 1, Math.floor(f))), j1 = Math.min(keys.length - 1, j + 1), u = f - j;
    return get(keys[j], keys[j1], u);
  };
  const posAt = f => keys.length ? between(f, (A, B, u) => A.pos + (B.pos - A.pos) * u) : 0;
  const frameAt = f => between(f, (A, B, u) => {
    const F0 = S.w.frames[A.frame], F1 = S.w.frames[B.frame];
    return S.ln.at([F0[0] + (F1[0] - F0[0]) * u, F0[1] + (F1[1] - F0[1]) * u]);
  });

  /* ── how far from the Sun the camera is ── */
  // At the places, their own distances; between Another Sky and Neptune, the planets passed on
  // screen set the reading; elsewhere it eases between places (in log distance).
  const AU_POS = [[0, .387], [1, .723], [2, 1], [3, 1], [4, 30.07], [4.7, 39.5]];
  const logLerp = (A, x) => {
    if (x <= A[0][0]) return A[0][1];
    for (let i = 1; i < A.length; i++) if (x <= A[i][0]) { const u = (x - A[i - 1][0]) / ((A[i][0] - A[i - 1][0]) || 1); return Math.exp(Math.log(A[i - 1][1]) + (Math.log(A[i][1]) - Math.log(A[i - 1][1])) * u); }
    return A[A.length - 1][1];
  };
  function auNow(p, view) {
    if (p > 3 && p < 4) {
      const ax = S.mode === 'landscape' ? 0 : 1, c = (view[ax] + view[ax + 2]) / 2, w = S.w;
      const cen = name => S.ln.at(w.frames[name])[ax] + (ax ? S.ln.vh : S.ln.vw) / 2;
      return logLerp([[cen('sky'), 1], [w.MARS[ax], 1.524], [(w.BELT[0] + w.BELT[1]) / 2, 2.7], [w.JUPITER[ax], 5.2], [w.SATURN[ax], 9.54], [w.URANUS[ax], 19.2], [cen('triton'), 30.07]], c);
    }
    return logLerp(AU_POS, p);
  }
  let lastOdo = '';
  function readout(p, view) {
    if (!odo) return;
    const au = auNow(p, view), sec = au * 499.005;
    const a = au < 2 ? au.toFixed(2) : au < 10 ? au.toFixed(1) : Math.round(au).toString();
    const lt = sec < 3540 ? `${Math.max(1, Math.round(sec / 60))} min` : `${Math.floor(sec / 3600)} h ${String(Math.round(sec % 3600 / 60)).padStart(2, '0')} min`;
    const key = a + lt; if (key === lastOdo) return; lastOdo = key;
    odoAU.textContent = a; odoLT.textContent = lt;
  }

  /* ── plates ── */
  function wantPlates() {
    for (const pl of S.w.plates) {
      const d = Math.abs(pl.stop - pos), rec = plates.get(pl.id);
      if (d <= NEAR && !rec) { plates.set(pl.id, { state: 'queued', key: S.key, z: pl.z }); queue.push(pl); }
      else if (d > FAR && rec) drop(pl.id);
    }
    pump();
  }
  function drop(id) {
    const rec = plates.get(id); if (!rec) return;
    if (rec.el) { rec.el.width = rec.el.height = 0; rec.el.remove(); }
    plates.delete(id);
  }
  function pump() {
    if (busy || dead || !printer) return;
    queue.sort((a, b) => Math.abs(a.stop - pos) - Math.abs(b.stop - pos));
    let pl; while ((pl = queue.shift()) && plates.get(pl.id)?.state !== 'queued');
    if (!pl) return;
    const rec = plates.get(pl.id), key = S.key, mode = S.mode, k = S.kd;
    rec.state = 'printing'; busy = true;
    printer(mode, pl.id, k).then(res => {
      busy = false;
      if (dead || key !== S.key || plates.get(pl.id) !== rec) { res.bmp?.close?.(); pump(); return; }
      place(rec, res); pump();
    }, err => { busy = false; rec.state = 'failed'; console.warn('plate', pl.id, err); if (pl.stop === 0) fail(); pump(); });
  }
  function place(rec, { bmp, canvas, rect }) {
    let c = canvas;
    if (!c) {
      c = document.createElement('canvas'); c.width = rect.w; c.height = rect.h;
      const br = c.getContext('bitmaprenderer');
      if (br) br.transferFromImageBitmap(bmp); else { c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.(); }
    }
    c.className = 'plate'; c.setAttribute('aria-hidden', 'true'); c.style.zIndex = rec.z ?? 1;
    const d = S.dpr; c.style.left = rect.x0 / d + 'px'; c.style.top = rect.y0 / d + 'px'; c.style.width = rect.w / d + 'px'; c.style.height = rect.h / d + 'px';
    worldEl.insertBefore(c, worldEl.firstChild);
    rec.el = c; rec.state = 'ready';
    if (live) requestAnimationFrame(() => c.classList.add('is-in')); else c.classList.add('is-in');
    if (!live && ['swarm-back', 'sun', 'swarm-front', 'mercury'].every(id => plates.get(id)?.state === 'ready')) goLive();
  }
  function makePrinter() {
    // a module worker with OffscreenCanvas, else the main thread (heavier, but complete)
    const main = async (mode, id, k) => {
      const { printPlate } = await import('./plates.js');
      const { canvas, rect } = await printPlate(mode, id, k);
      if (canvas.transferToImageBitmap) return { bmp: canvas.transferToImageBitmap(), rect };
      return { canvas, rect };
    };
    return new Promise(resolve => {
      try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      } catch { resolve(main); return; }
      const pending = new Map();
      const timer = setTimeout(() => { worker.terminate(); worker = null; resolve(main); }, 4000);
      worker.onmessage = ({ data }) => {
        if ('pong' in data) {
          clearTimeout(timer);
          if (!data.pong) { worker.terminate(); worker = null; resolve(main); return; }
          resolve((mode, id, k) => new Promise((ok, no) => { const job = ++jobs; pending.set(job, { ok, no }); worker.postMessage({ job, mode, id, k }); }));
          return;
        }
        const p = pending.get(data.job); if (!p) return; pending.delete(data.job);
        data.error ? p.no(new Error(data.error)) : p.ok(data);
      };
      worker.onerror = e => { e.preventDefault?.(); clearTimeout(timer); worker?.terminate(); worker = null; for (const p of pending.values()) p.no(new Error('worker')); pending.clear(); resolve(main); };
      worker.postMessage({ ping: 1 });
    });
  }

  /* ── drawing ── */
  function render(now) {
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    simT += dt;
    const y = window.scrollY, ft = target(y);
    fi += (ft - fi) * (1 - Math.exp(-dt / .1));
    if (Math.abs(ft - fi) < 2e-4) fi = ft;
    pos = posAt(fi);
    const c = frameAt(fi), cx = Math.round(c[0] * S.kd), cy = Math.round(c[1] * S.kd);
    const view = [cx / S.kd, cy / S.kd, cx / S.kd + S.ln.vw, cy / S.kd + S.ln.vh];
    const moved = dirty || cx !== S.cx || cy !== S.cy;
    const P = window.__prof, t1 = P ? performance.now() : 0;
    if (moved) {
      S.cx = cx; S.cy = cy;
      drawSky(sctx, S.w, S.sky, [view[0], view[1]], view, S.kd);
      worldEl.style.transform = `translate3d(${(-cx / S.dpr).toFixed(3)}px, ${(-cy / S.dpr).toFixed(3)}px, 0)`;
      wantPlates();
    }
    const t2 = P ? performance.now() : 0;
    if (moved || now - lastLive >= 1000 / FPS - 2) {
      lastLive = now;
      lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, liveC.width, liveC.height);
      lctx.setTransform(S.kd, 0, 0, S.kd, -cx, -cy);
      drawLive(lctx, S.w, fixedT ?? STILL_T + simT, S.kd, view, extras);
    }
    const t3 = P ? performance.now() : 0;
    page(y, ft);
    readout(pos, view);
    if (P) { P.sky = (P.sky || 0) + t2 - t1; P.live = (P.live || 0) + t3 - t2; P.page = (P.page || 0) + performance.now() - t3; P.n = (P.n || 0) + 1; }
    dirty = false;
  }
  // the page's own pieces: each card fades in as it arrives and out as the camera leaves; the
  // rail marks the nearest place
  function page(y, ft) {
    const vh = S.H;
    for (const k of keys) {
      if (!k.card) continue;
      const last = k.j === keys.length - 1;   // the end stays up as the footer comes into view
      const enter = k.j === 0 ? 1 : smooth(k.top - vh * .55, k.top - vh * .06, y), exit = last ? 1 : 1 - smooth(k.b + vh * .02, k.b + vh * .3, y);
      set(k.card, enter * exit);
    }
    document.body.classList.toggle('is-past', y > vh * .35);
    document.body.classList.toggle('is-end', keys.length > 0 && y > keys[keys.length - 1].b + vh * .04);
    const p = posAt(ft), cur = Math.round(clamp(p, 0, STOPS.length - 1));
    if (rail) {
      rail.classList.toggle('is-shown', p < STOPS.length - .45);
      railLinks.forEach((a, i) => (i === cur ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
    }
  }
  function set(el, o) {
    if (!el) return;
    o = Math.round(clamp(o) * 100) / 100;
    if (shown.get(el) === o) return;
    shown.set(el, o);
    el.style.setProperty('--o', o);
    el.classList.toggle('is-away', o < .05);
  }
  function frame(now) {
    raf = 0;
    if (dead || !visible || document.hidden) return;
    render(now);
    raf = requestAnimationFrame(frame);
  }
  const play = () => { if (!raf && !dead && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  function goLive() {
    live = true;
    root.classList.add('is-live');
    onReady(true);
  }
  function fail() {
    if (dead) return;
    dead = true; stop(); worker?.terminate();
    root.classList.remove('is-live');
    onFail();
  }

  /* ── start ── */
  setup();
  fi = target(window.scrollY); pos = posAt(fi);
  makePrinter().then(p => { printer = p; wantPlates(); });
  play();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : stop(); }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
  let rt = 0;
  const resized = () => { clearTimeout(rt); rt = setTimeout(() => { if (setup()) play(); else computeKeys(); }, 220); };
  new ResizeObserver(resized).observe(stage);
  portrait.addEventListener?.('change', resized);
  window.addEventListener('load', () => { computeKeys(); dirty = true; }, { once: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  reduce.addEventListener?.('change', () => { if (reduce.matches) fail(); });
  // a tap on the swarm fires one more piece from Mercury's mass driver
  stage.parentElement.addEventListener('pointerdown', e => {
    if (!live || pos > .12 || e.button > 0 || e.target.closest('a, button')) return;
    const sc = swarmScene(S.w), band = sc.rings.map((rg, i) => (rg.band === 0 ? i : -1)).filter(i => i >= 0);
    extras.push({ ri: band[(Math.random() * band.length) | 0], t0: STILL_T + simT, spin: Math.random() * 6.3, size: .9 + Math.random() * .25 });
    if (extras.length > 80) extras.shift();
    void launchTime;
  });
  // review hooks: wait until the plates around the camera are printed and the camera has settled
  window.__trip = {
    idle: () => new Promise(r => { const check = () => { const ft = target(window.scrollY); if (!busy && !queue.length && Math.abs(ft - fi) < 1e-3 && printer) r(true); else setTimeout(check, 60); }; check(); }),
    state: () => ({ fi, pos, key: S.key, plates: [...plates].map(([id, p]) => `${id}:${p.state}`), live }),
  };
}

/*
 * The front door of Another Sky: the view from a window in a house on the hill,
 * painted in watercolour while the 3D world is built behind it.
 *
 * Order of events on arrival:
 *   1  look out of the window (ray buffer), draw the pencil, lay the washes
 *   2  tell explorer.js it may start building (SkyFront.bootWhen resolves)
 *   3  wash the sheet in the order it was painted while the world builds;
 *      the explorer reports progress here, and draws no frames yet
 *   4  "Step outside" (or the aerial tour) hands over to the explorer: its
 *      render loop starts and the page zooms through the window and fades
 *
 * The window is 2D canvas only, so it works without WebGL. The explorer's own
 * controls, atlas and help are unchanged; the help panel has a way back here.
 *
 * Review aids: ?hour=<0-24> sets the clock (it then runs on); ?t=<s> freezes a
 * moment (deterministic, sets window.__ready); ?layer=<name>, ?nopencil.
 */
(function () {
'use strict';
const SW = window.SkyWindow;
const qs = new URLSearchParams(location.search);
const fixedT = qs.has('t') ? parseFloat(qs.get('t')) : null;
const hourQ = qs.has('hour') ? parseFloat(qs.get('hour')) : null;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const frozen = fixedT !== null && !isNaN(fixedT);
const t0 = performance.now();
const $ = id => document.getElementById(id);
const POEM = 'https://www.sankala.me/notes/nobody-owes-anything-now';
// Yield to the page between slices without setTimeout's clamping.
const chan = new MessageChannel(), waiting = []; chan.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
const tick = () => new Promise(r => { waiting.push(r); chan.port2.postMessage(0); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Handshake with explorer.js ─────────────────────────────────────────────
let releaseBoot; const bootWhen = new Promise(r => { releaseBoot = r; });
// Never hold the world back for long, whatever happens to the painting.
setTimeout(() => releaseBoot(), 2500);
const sky = { ready: false, failed: false, p: 0, queued: null, outside: false, stepping: false };
const timing = window.__skyTimings = { start: Math.round(t0) };
window.SkyFront = {
  bootWhen,
  progress(text, p) { sky.p = p; if (timing.boot === undefined) timing.boot = Math.round(performance.now() - t0); status(); },
  ready() {
    sky.ready = true; timing.world = Math.round(performance.now() - t0); status();
    if (sky.queued) { const m = sky.queued; sky.queued = null; stepOutside(m, false); }
  },
  fail(message) {
    sky.failed = true; sky.ready = false; sky.queued = null;
    document.body.classList.add('no-world');
    for (const id of ['enterButton', 'tourButton']) { const b = $(id); if (b) b.disabled = true; }
    $('frontStatus').textContent = message;
    if (sky.outside || sky.stepping) showFront();
  }
};

function status() {
  if (sky.failed) return;
  const el = $('frontStatus'), p = Math.round(sky.p);
  el.textContent = sky.ready ? 'The world outside is ready.' : (sky.queued ? 'Opening the door… ' : 'Building the world outside… ') + (p > 0 ? p + '%' : '');
}

// ── Stepping outside, and coming back ──────────────────────────────────────
// While the window is up, the world and its controls underneath can't be reached
// by keyboard or pointer.
function worldInert(v) { for (const id of ['world', 'ui']) { const el = $(id); if (el) el.inert = v; } }
function nightNow() { return SW.Light.stateAt(hourNow()).N > .6; }
function stepOutside(mode, gesture) {
  if (sky.failed || sky.stepping || sky.outside) return;
  if (!sky.ready || !window.AnotherSky) { sky.queued = mode; status(); return; }
  // Pointer lock needs the click itself; a queued entry just lets you drag to look.
  worldInert(false);
  if (!window.AnotherSky.stepOutside({ mode, night: nightNow(), capture: gesture })) { worldInert(true); return; }
  sky.stepping = true;
  const front = $('front');
  front.style.transformOrigin = zoomOrigin();
  front.inert = true;
  document.body.classList.remove('covered');
  document.body.classList.add('stepping');
  const done = () => {
    if (!sky.stepping) return;
    sky.stepping = false; sky.outside = true;
    front.hidden = true; document.body.classList.remove('at-window', 'stepping');
    pauseLive();
  };
  setTimeout(done, reduce.matches ? 60 : 1150);
}
// Zoom through the window so the painted end wall lands on the real one: scale the
// page by k about the point O that carries the painted disc (P, radius rp) onto the
// explorer's disc on screen (D, radius rd): O = (D - kP) / (1 - k).
function zoomOrigin() {
  const front = $('front'), win = $('window').getBoundingClientRect();
  let k = 2.4, ox = win.left + win.width * .6, oy = win.top + win.height * .5;
  const D = window.AnotherSky.endWallOnScreen && window.AnotherSky.endWallOnScreen();
  if (state && D && D.x > 0 && D.x < innerWidth && D.y > 0 && D.y < innerHeight) {
    const c = state.F.cap.center, rp = state.P.capRad / state.S, px = win.left + c[0], py = win.top + c[1];
    k = Math.min(3.4, Math.max(1.8, D.r / Math.max(8, rp)));
    ox = (D.x - k * px) / (1 - k); oy = (D.y - k * py) / (1 - k);
  }
  front.style.setProperty('--zoom', k.toFixed(3));
  return `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
}
function showFront() {
  const front = $('front');
  sky.outside = false; sky.stepping = false;
  worldInert(true);
  front.hidden = false; front.inert = false;
  document.body.classList.add('at-window', 'returning');
  document.body.classList.remove('stepping');
  // Lay the page out once at no opacity, then fade it back in.
  void front.offsetWidth;
  document.body.classList.remove('returning');
  if (needsRebuild) { needsRebuild = false; start(); } else resumeLive();
  if (!sky.failed) $('enterButton').focus({ preventScroll: true });
  setTimeout(() => { if (!sky.outside && !sky.stepping) document.body.classList.add('covered'); }, 700);
}
$('enterButton').addEventListener('click', e => stepOutside('walk', e.isTrusted));
$('tourButton').addEventListener('click', () => stepOutside('tour', false));
{ const back = $('windowButton'); if (back) back.addEventListener('click', () => { if (window.AnotherSky) window.AnotherSky.backToWindow(); showFront(); }); }
// 'covered': the window hides the world completely, so the browser needn't draw it.
document.body.classList.add('at-window', 'covered');
worldInert(true);

// ── The clock ──────────────────────────────────────────────────────────────
function clockSeconds() {
  if (frozen) return (hourQ ?? 15.25) * 3600 + fixedT;
  const el = (performance.now() - t0) / 1000;
  if (hourQ !== null && !isNaN(hourQ)) return hourQ * 3600 + el;
  const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
}
const hourNow = () => (clockSeconds() / 3600) % 24;

// ── The painting ───────────────────────────────────────────────────────────
// The window's bars are kept clear of the light spine: the vertical bar goes on
// whichever side of the far end wall leaves the wall and the spine in one pane.
function frameFor(w, h, cam) {
  const bw = Math.max(5, Math.min(11, w * .017)), vpx = cam.vp[0] / w;
  const mx = w * (vpx > .5 ? .3 : .7), ty = h * .21;
  return { w, h, bw, mx, ty, bars: [{ x0: mx - bw / 2, x1: mx + bw / 2, y0: -10, y1: h + 10 }, { x0: -10, x1: w + 10, y0: ty - bw / 2, y1: ty + bw / 2 }] };
}

let state = null, building = null, raf = 0, needsRebuild = false;
async function buildAll() {
  const win = $('window'), rect = win.getBoundingClientRect();
  const w = Math.round(rect.width), h = Math.round(rect.height);
  if (w < 40 || h < 40) return;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  // Washes are soft, so they stop at 1.3x; the pencil layer uses the full DPR (capped at 2).
  let S = Math.min(DPR, 1.3); if (w * h * S * S > 7.5e5) S = Math.sqrt(7.5e5 / (w * h));
  const W = Math.round(w * S), H = Math.round(h * S);
  const num = (k, d) => qs.has(k) ? +qs.get(k) : d;
  const cam = SW.View.makeCamera(w, h, { pitch: num('pitch', .47), yaw: num('yaw', -.24), vfov: num('fov', 92) * Math.PI / 180, s: num('s', undefined), z: num('z', undefined), above: num('above', undefined) });
  const frame = frameFor(w, h, cam);
  const tA = performance.now();
  const gs = Math.min(.4, 230 / Math.max(w, h) * 1.25);
  const B = await SW.View.buildBuffer(cam, Math.round(w * gs), Math.round(h * gs), frozen ? null : tick);
  const tB = performance.now();
  const F = SW.Features.build(cam, B);
  const tC = performance.now();
  if (!qs.has('nopencil')) SW.Pencil.draw($('pencil'), { cam, B, F, frame, DPR, w, h });
  if (timing.pencil === undefined) timing.pencil = Math.round(performance.now() - t0);
  const P = await SW.Paint.build({ cam, B, F, W, H, scale: S, frame, yieldFn: frozen ? null : tick });
  const tD = performance.now();
  // The heavy part is done: the world can start building behind the window now.
  releaseBoot();
  const wash = [$('wash'), $('wash2')];
  for (const c of wash) { c.width = W; c.height = H; c.classList.remove('on'); }
  const live = SW.Live.create({ cam, B, F, frame, S, W, H, glaze: $('glaze'), lift: $('lift'), P });
  state = { w, h, S, W, H, cam, B, F, P, frame, wash, front: 0, live, washedAt: null, washing: false, revealing: false };
  const slow = performance.now() - tA > 2600;
  const instant = frozen || reduce.matches || slow || revealedOnce;
  if (instant) { await rewash(true); if (timing.painted === undefined) timing.painted = Math.round(performance.now() - t0); } else reveal();
  revealedOnce = true;
  const tE = performance.now();
  window.__timings = { buffer: Math.round(tB - tA), features: Math.round(tC - tB), paint: Math.round(tD - tC), wash: Math.round(tE - tD), marks: SW.__paintMarks, W, H, gw: B.gw, gh: B.gh };
  if (timing.washStart === undefined) timing.washStart = Math.round(tD - t0);
}
let revealedOnce = false;

function stateKey(st) { return [st.I, st.N, st.gold, st.rose, st.lz * .25]; }
function needsRewash(st) {
  if (!state.washedAt) return true;
  const a = stateKey(st), b = stateKey(state.washedAt.st);
  return a.some((v, i) => Math.abs(v - b[i]) > .025) || Math.abs(st.h - state.washedAt.st.h) > .25;
}
// The first time, the sheet is washed in the order it was painted: the air, the
// end wall, the land, the lake, towns and shadows, then trees and the hour.
const STAGES = [['warm', 'cool', 'halo'], ['cap'], ['ochre', 'green', 'sienna', 'woods'], ['water'], ['town', 'front', 'side', 'sand', 'shadeA', 'shadeB', 'haze', 'glow'], ['tree', 'treeDark', 'dark', 'night']];
async function reveal() {
  state.revealing = true; const inc = new Set(), mine = state;
  $('glaze').style.opacity = $('lift').style.opacity = 0;
  for (let k = 0; k < STAGES.length; k++) {
    if (state !== mine) return;
    STAGES[k].forEach(n => inc.add(n));
    await rewash(false, k === STAGES.length - 1 ? null : inc, 320);
    await sleep(170);
  }
  for (const id of ['glaze', 'lift']) { const el = $(id); el.style.transition = 'opacity 1.4s ease'; el.style.opacity = 1; }
  state.revealing = false;
  timing.painted = Math.round(performance.now() - t0);
}
async function rewash(instant, include, fadeMs = 1600) {
  if (!state || state.washing) return; state.washing = true;
  const mine = state, st = SW.Light.stateAt(hourNow());
  const back = state.wash[1 - state.front], ctx = back.getContext('2d');
  const img = ctx.createImageData(state.W, state.H);
  await SW.Light.composite(state.P, st, img, instant ? null : tick, include);
  if (state !== mine) return;
  ctx.putImageData(img, 0, 0);
  const tr = instant || frozen ? 'none' : `opacity ${fadeMs}ms ease`;
  back.style.transition = tr; state.wash[state.front].style.transition = tr;
  clearTimeout(back._off); back.classList.add('on'); back.style.zIndex = 1; state.wash[state.front].style.zIndex = 0;
  const old = state.wash[state.front];
  clearTimeout(old._off); old._off = setTimeout(() => old.classList.remove('on'), instant ? 0 : fadeMs + 100);
  state.front = 1 - state.front; state.washing = false;
  if (instant) { for (const id of ['glaze', 'lift']) $(id).style.opacity = 1; }
  if (!include) state.washedAt = { st };
  updateCaption(true);
}

// ── The caption under the window ───────────────────────────────────────────
// The time where you are and what is happening outside. At night, a few lines
// from the poem set in a place like this.
function timeText(s) {
  const hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
}
let captionKey = '', captionAt = 0;
function updateCaption(force) {
  const now = performance.now();
  if (!force && now - captionAt < 2000) return;
  captionAt = now;
  const s = clockSeconds(), st = SW.Light.stateAt((s / 3600) % 24), el = $('caption');
  const live = state && state.live, rain = live && live.weather(s), train = live && live.trainInView && live.trainInView();
  const t = timeText(s);
  let key, html;
  if (st.N > .85) {
    key = 'night' + t;
    html = `${t} where you are.<span class="verse">“At night there are no stars above me, / only the lamps of the far shore, / and someone under them / looking up at mine.” <a class="poem" href="${POEM}">Nobody Owes Anything Now</a></span>`;
  } else {
    const words = SW.Light.describe(st, rain, train);
    key = t + words; html = `${t} where you are. ${words}`;
  }
  if (key === captionKey) return;
  captionKey = key; el.innerHTML = html;
}

// ── The slow things outside ────────────────────────────────────────────────
function draw() {
  if (!state) return;
  const s = clockSeconds(), st = SW.Light.stateAt((s / 3600) % 24);
  state.live.draw(s, st);
  if (!frozen && !state.revealing && needsRewash(st)) rewash(false);
  updateCaption(false);
}
let lastDraw = 0, liveOn = false;
function loop(now) {
  if (!liveOn) return;
  raf = requestAnimationFrame(loop);
  if (now - lastDraw < 83) return;
  lastDraw = now; draw();
}
function resumeLive() {
  if (!state) return;
  draw();
  if (frozen || reduce.matches || liveOn) return;
  liveOn = true; lastDraw = 0; raf = requestAnimationFrame(loop);
}
function pauseLive() { liveOn = false; cancelAnimationFrame(raf); }
let stillTimer = 0;
async function start() {
  pauseLive();
  if (building) await building;
  building = buildAll().catch(err => { console.warn('Another Sky window:', err); releaseBoot(); });
  await building; building = null;
  if (!state) { releaseBoot(); return; }
  window.__ready = true;
  if (sky.outside) { pauseLive(); return; }
  resumeLive();
  clearInterval(stillTimer);
  if (reduce.matches && !frozen) stillTimer = setInterval(() => { if (!document.hidden && !sky.outside) { rewash(false); draw(); } }, 10 * 60 * 1000);
}
document.addEventListener('visibilitychange', () => {
  if (frozen || reduce.matches || !state || sky.outside) return;
  if (document.hidden) pauseLive(); else resumeLive();
});
let rt = 0, lastSize = null;
addEventListener('resize', () => {
  clearTimeout(rt); rt = setTimeout(() => {
    const r = $('window').getBoundingClientRect();
    if (sky.outside) { needsRebuild = true; return; }
    if (lastSize && Math.abs(r.width - lastSize[0]) / lastSize[0] < .06 && Math.abs(r.height - lastSize[1]) / lastSize[1] < .06) return;
    lastSize = [r.width, r.height]; start();
  }, 250);
});
reduce.addEventListener?.('change', () => { if (!sky.outside) start(); });
// The window's size comes from CSS alone, so there is no need to wait for fonts.
status();
{ const r = $('window').getBoundingClientRect(); lastSize = [r.width, r.height]; start(); }
})();

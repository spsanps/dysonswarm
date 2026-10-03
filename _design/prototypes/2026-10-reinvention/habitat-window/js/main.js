/*
 * Lifecycle: lay out, look out of the window (ray buffer), draw the pencil,
 * lay the washes, wash them in the colours of the hour, then keep the slow
 * things moving. ?t=<s> freezes a moment (deterministic, sets __ready);
 * ?hour=<0-24> sets the clock; reduced motion shows a still.
 */
(function () {
'use strict';
const qs = new URLSearchParams(location.search);
const fixedT = qs.has('t') ? parseFloat(qs.get('t')) : null;
const hourQ = qs.has('hour') ? parseFloat(qs.get('hour')) : null;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const frozen = fixedT !== null && !isNaN(fixedT);
const t0 = performance.now();
const $ = id => document.getElementById(id);
// Yield to the page between slices without setTimeout's clamping.
const chan = new MessageChannel(), waiting = []; chan.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
const tick = () => new Promise(r => { waiting.push(r); chan.port2.postMessage(0); });

function clockSeconds() {
  if (frozen) return (hourQ ?? 15.25) * 3600 + fixedT;
  const el = (performance.now() - t0) / 1000;
  if (hourQ !== null && !isNaN(hourQ)) return hourQ * 3600 + el;
  const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
}
const hourNow = () => (clockSeconds() / 3600) % 24;

function frameFor(w, h) {
  const bw = Math.max(5, Math.min(11, w * .017)), mx = w * .655, ty = h * .272;
  return { w, h, bw, mx, ty, bars: [{ x0: mx - bw / 2, x1: mx + bw / 2, y0: -10, y1: h + 10 }, { x0: -10, x1: w + 10, y0: ty - bw / 2, y1: ty + bw / 2 }] };
}

let state = null, building = null, raf = 0;
async function buildAll() {
  const win = $('window'), rect = win.getBoundingClientRect();
  const w = Math.round(rect.width), h = Math.round(rect.height);
  if (w < 40 || h < 40) return;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  // Washes are soft, so they stop at 1.3x; the pencil layer uses the full DPR (capped at 2).
  let S = Math.min(DPR, 1.3); if (w * h * S * S > 7.5e5) S = Math.sqrt(7.5e5 / (w * h));
  const W = Math.round(w * S), H = Math.round(h * S);
  const frame = frameFor(w, h);
  const num = (k, d) => qs.has(k) ? +qs.get(k) : d;
  const cam = View.makeCamera(w, h, { pitch: num('pitch', .47), yaw: num('yaw', -.24), vfov: num('fov', 92) * Math.PI / 180, s: num('s', undefined), z: num('z', undefined), above: num('above', undefined) });
  const tA = performance.now();
  const gs = Math.min(.4, 230 / Math.max(w, h) * 1.25);
  const B = await View.buildBuffer(cam, Math.round(w * gs), Math.round(h * gs), frozen ? null : tick);
  const tB = performance.now();
  const F = Features.build(cam, B);
  const tC = performance.now();
  if (!qs.has('nopencil')) Pencil.draw($('pencil'), { cam, B, F, frame, DPR, w, h });
  const P = await Paint.build({ cam, B, F, W, H, scale: S, frame, yieldFn: frozen ? null : tick });
  const tD = performance.now();
  const wash = [$('wash'), $('wash2')];
  for (const c of wash) { c.width = W; c.height = H; }
  const live = Live.create({ cam, B, F, frame, S, W, H, glaze: $('glaze'), lift: $('lift'), P });
  state = { w, h, S, W, H, cam, B, F, P, frame, wash, front: 0, live, washedAt: null, washing: false, revealing: false };
  const slow = performance.now() - tA > 2600;
  if (frozen || reduce.matches || slow) await rewash(true);
  else reveal();
  const tE = performance.now();
  window.__timings = { buffer: Math.round(tB - tA), features: Math.round(tC - tB), paint: Math.round(tD - tC), wash: Math.round(tE - tD), marks: window.__paintMarks, W, H, gw: B.gw, gh: B.gh };
  console.info('habitat-window', JSON.stringify(window.__timings));
}

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
  state.revealing = true; const inc = new Set();
  $('glaze').style.opacity = $('lift').style.opacity = 0;
  for (let k = 0; k < STAGES.length; k++) {
    STAGES[k].forEach(n => inc.add(n));
    await rewash(false, k === STAGES.length - 1 ? null : inc, 420);
    await new Promise(r => setTimeout(r, 380));
  }
  for (const id of ['glaze', 'lift']) { const el = $(id); el.style.transition = 'opacity 1.4s ease'; el.style.opacity = 1; }
  state.revealing = false;
}
async function rewash(instant, include, fadeMs = 1600) {
  if (state.washing) return; state.washing = true;
  const st = Light.stateAt(hourNow());
  const back = state.wash[1 - state.front], ctx = back.getContext('2d');
  const img = ctx.createImageData(state.W, state.H);
  await Light.composite(state.P, st, img, instant ? null : tick, include);
  ctx.putImageData(img, 0, 0);
  const tr = instant || frozen ? 'none' : `opacity ${fadeMs}ms ease`;
  back.style.transition = tr; state.wash[state.front].style.transition = tr;
  clearTimeout(back._off); back.classList.add('on'); back.style.zIndex = 1; state.wash[state.front].style.zIndex = 0;
  const old = state.wash[state.front];
  clearTimeout(old._off); old._off = setTimeout(() => old.classList.remove('on'), instant ? 0 : fadeMs + 100);
  state.front = 1 - state.front; state.washing = false;
  if (!include) state.washedAt = { st };
  $('caption').textContent = caption(st);
}
function caption(st) {
  const s = clockSeconds(), hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60;
  const t = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
  return `${t} where you are. ${Light.describe(st, state.live && state.live.weather && state.live.weather(s))}`;
}

function draw() {
  const s = clockSeconds(), st = Light.stateAt((s / 3600) % 24);
  const d0 = performance.now(); state.live.draw(s, st); window.__drawMs = ((window.__drawMs || 0) * .9 + (performance.now() - d0) * .1);
  if (!frozen && !state.revealing && needsRewash(st)) rewash(false);
}
let lastDraw = 0;
function loop(now) {
  raf = requestAnimationFrame(loop);
  if (now - lastDraw < 83) return;
  lastDraw = now; draw();
}
async function start() {
  cancelAnimationFrame(raf);
  if (building) await building;
  building = buildAll(); await building; building = null;
  if (!state) return;
  draw();
  if (frozen || reduce.matches) { window.__ready = true; if (reduce.matches && !frozen) setInterval(() => { if (!document.hidden) { rewash(false); draw(); } }, 10 * 60 * 1000); return; }
  window.__ready = true;
  raf = requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => {
  if (frozen || reduce.matches || !state) return;
  if (document.hidden) cancelAnimationFrame(raf); else { lastDraw = 0; raf = requestAnimationFrame(loop); }
});
let rt = 0, lastSize = null;
addEventListener('resize', () => {
  clearTimeout(rt); rt = setTimeout(() => {
    const r = $('window').getBoundingClientRect();
    if (lastSize && Math.abs(r.width - lastSize[0]) / lastSize[0] < .06 && Math.abs(r.height - lastSize[1]) / lastSize[1] < .06) return;
    lastSize = [r.width, r.height]; start();
  }, 250);
});
reduce.addEventListener?.('change', start);
// The window's size comes from CSS alone, so there is no need to wait for fonts.
{ const r = $('window').getBoundingClientRect(); lastSize = [r.width, r.height]; start(); }
})();

/* The bureau's runtime. Posters are painted once (the slow, careful part) into a base image;
   after that each frame only lays the one living detail over it. Posters are painted in order
   of visibility, one per frame, and only visible posters animate.
   ?t=<seconds> paints every poster at that moment, freezes, and sets window.__ready.
   ?poster=<id> shows one poster alone and large. prefers-reduced-motion shows stills. */
(function (G) {
'use strict';
const specs = new Map();
const Bureau = G.Bureau = { define(spec) { specs.set(spec.id, spec); } };

const QS = new URLSearchParams(location.search);
const FIXED_T = QS.has('t') ? parseFloat(QS.get('t')) : null;
const SOLO = QS.get('poster');
const DEBUG = QS.has('debug');
const RMQ = matchMedia('(prefers-reduced-motion: reduce)');
let REDUCED = RMQ.matches;

function fontsReady() {
  const want = [`64px "${Kit.FONT_TITLE}"`, `20px "${Kit.FONT_CAPS}"`];
  const all = Promise.all(want.map((f) => document.fonts.load(f).catch(() => null)));
  return Promise.race([all, new Promise((r) => setTimeout(r, 5000))]).then(() => document.fonts.ready);
}

// the bureau's board: today's date and time, from the visitor's own clock
function board() {
  const el = document.getElementById('today'), tm = document.getElementById('now');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    el.textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    el.setAttribute('datetime', d.toISOString().slice(0, 10));
    if (tm) tm.textContent = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  tick();
  if (FIXED_T == null) setInterval(tick, 20000);
}

const items = [];
let t0 = performance.now(), raf = 0;

function setup() {
  if (SOLO) document.documentElement.classList.add('solo');
  if (FIXED_T != null) document.documentElement.classList.add('frozen');
  document.querySelectorAll('canvas[data-poster]').forEach((cv) => {
    const spec = specs.get(cv.dataset.poster);
    const card = cv.closest('.poster');
    if (SOLO && (!spec || spec.id !== SOLO)) { card && card.remove(); return; }
    if (!spec) return;
    if (SOLO && spec.id !== SOLO) { card && card.remove(); return; }
    items.push({ cv, spec, card, visible: false, base: null, L: null, built: 0, lastKey: -1 });
  });
}

function sizeOf(it) {
  const dpr = Math.min(2, G.devicePixelRatio || 1);
  const cssW = it.cv.getBoundingClientRect().width || 360;
  const W = Math.round(Math.min(1100, cssW * dpr));
  return [W, Math.round(W * 1.5)];
}

function build(it) {
  const [W, H] = sizeOf(it);
  const tb = performance.now();
  const b = new Paint.Board(W, H, { seed: it.spec.seed || 1 });
  let L = {};
  try { L = it.spec.build(b) || {}; } catch (e) { console.error(it.spec.id, e); }
  it.base = b.toCanvas();
  it.L = L; it.k = b.k; it.built = W;
  it.cv.width = W; it.cv.height = H;
  it.ctx = it.cv.getContext('2d');
  it.card && it.card.classList.add('painted');
  if (DEBUG) console.log(it.spec.id, W + 'x' + H, Math.round(performance.now() - tb) + ' ms');
}

function startTime(it) { return FIXED_T ?? (REDUCED ? (it.spec.still ?? 0) : null); }

function draw(it, t) {
  const { ctx } = it;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(it.base, 0, 0);
  if (it.spec.frame) { try { it.spec.frame(ctx, t, it.k, it.L); } catch (e) { console.error(it.spec.id, e); } }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// visible posters first, top to bottom
function order() {
  const vh = innerHeight;
  return items.slice().sort((a, b) => {
    const ra = a.cv.getBoundingClientRect(), rb = b.cv.getBoundingClientRect();
    const va = ra.bottom > 0 && ra.top < vh ? 0 : 1, vb = rb.bottom > 0 && rb.top < vh ? 0 : 1;
    return va - vb || ra.top - rb.top || ra.left - rb.left;
  });
}

async function buildAll() {
  for (const it of order()) {
    const [W] = sizeOf(it);
    if (it.built && Math.abs(W - it.built) / it.built < 0.18) continue;
    build(it);
    const st = startTime(it);
    draw(it, st ?? liveTime());
    if (FIXED_T == null) await nextFrame();
  }
}

// live time starts on the wall clock, so slow real-time things (the wheel's one turn a minute)
// line up with the visitor's clock
const CLOCK0 = (Date.now() / 1000) % 86400;
function liveTime() { return CLOCK0 + (performance.now() - t0) / 1000; }

function loop() {
  raf = 0;
  if (document.hidden || REDUCED || FIXED_T != null) return;
  const t = liveTime();
  for (const it of items) {
    if (!it.base || !it.visible || !it.spec.frame) continue;
    const key = Math.floor(t * (it.spec.fps || 24));
    if (key === it.lastKey) continue;
    it.lastKey = key; draw(it, t);
  }
  raf = requestAnimationFrame(loop);
}
function wake() { if (!raf && !document.hidden && !REDUCED && FIXED_T == null) raf = requestAnimationFrame(loop); }

async function main() {
  board();
  setup();
  const io = new IntersectionObserver((es) => es.forEach((e) => { const it = items.find((i) => i.cv === e.target); if (it) it.visible = e.isIntersecting; }), { rootMargin: '120px' });
  items.forEach((it) => io.observe(it.cv));
  await fontsReady();
  await buildAll();
  G.__ready = true;
  if (DEBUG) G.__bureau = { items, draw, liveTime, get raf() { return raf; } };
  wake();
  document.addEventListener('visibilitychange', wake);
  RMQ.addEventListener && RMQ.addEventListener('change', () => { REDUCED = RMQ.matches; items.forEach((it) => it.base && draw(it, startTime(it) ?? liveTime())); wake(); });
  let rz = 0, busy = false;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(async () => { if (busy) return; busy = true; await buildAll(); busy = false; }, 300);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main); else main();
})(window);

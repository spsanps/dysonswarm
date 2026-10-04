// The intro page. Nothing heavy loads until the visitor enters.

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : d);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// The second still loads after the page, then the two slowly trade places.
const stills = document.querySelector('.stills');
const b = document.querySelector('.still-b');
if (b && !q.has('enter')) {
  addEventListener('load', () => {
    b.src = b.dataset.src;
    b.decode?.().then(() => { if (!reduced) stills.classList.add('cycling'); }).catch(() => {});
  }, { once: true });
}

// Sheets (notes, places) open from both the intro and the interface.
let lastFocus = null;
export function openSheet(id) {
  lastFocus = document.activeElement;
  const el = $(id);
  el.hidden = false;
  el.querySelector('.close')?.focus();
}
export function closeSheets() {
  for (const el of document.querySelectorAll('.sheet')) el.hidden = true;
  lastFocus?.focus?.();
}
for (const el of document.querySelectorAll('.sheet')) {
  el.addEventListener('pointerdown', e => { if (e.target === el) closeSheets(); });
  el.querySelector('[data-close]').addEventListener('click', closeSheets);
}
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });
$('introNotes').addEventListener('click', () => openSheet('notes'));

function fail(msg) {
  $('boot').hidden = false;
  $('bootText').textContent = 'The poster could not be printed.';
  $('bootFail').hidden = false;
  $('bootFail').textContent = msg;
  window.__ready = true;
}

async function enter() {
  $('enter').disabled = true;
  $('boot').hidden = false;
  const progress = (text, p) => { $('bootText').textContent = text; $('bootBar').style.width = p + '%'; };
  progress('Reading the radar map', 2);
  let app;
  try {
    const [{ VenusApp }, { bindUI }] = await Promise.all([import('./app.js'), import('./ui.js')]);
    app = new VenusApp($('world'), {
      year: num('year', 0), hour: num('hour', 10), view: num('view', 0), t: num('t', 0),
      yaw: num('yaw', 0), pitch: num('pitch', 0), fovMul: num('fov', 1),
      quality: q.get('quality') || 'auto', debug: num('debug', 0), raw: q.has('raw'),
      steps: num('steps', 0), debugR: num('r', 10000), noshadow: q.has('noshadow'),
      reducedMotion: reduced || q.has('still'),
    });
    window.__app = app;
    $('intro').classList.add('leaving');
    await app.init(progress);
    bindUI(app, { openSheet, closeSheets, showUI: !q.has('noui') });
  } catch (e) {
    console.error(e);
    if (String(e.message).includes('NO_WEBGL2')) fail('This needs WebGL2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.');
    else fail('Something went wrong while building the world: ' + e.message + ' Reloading may help, or try a desktop browser.');
    return;
  }
  $('boot').classList.add('done');
  setTimeout(() => { $('boot').hidden = true; $('intro').hidden = true; }, 800);
  if (q.get('mode') === 'orbit') { await app.goOrbit(q.get('preset') || 'globe'); app.orbit.cam = { ...app.orbit.target }; if (q.has('dist')) app.orbit.cam.dist = num('dist', 34000); if (q.has('az')) app.orbit.cam.az = num('az', 205); if (q.has('el')) app.orbit.cam.el = num('el', 14); app.orbit.target = { ...app.orbit.cam }; }
  if (q.get('mode') === 'fly') app.setFly(true);
  // capture hooks: ?shot=1 renders one frame, measures it and reports ready
  if (q.has('shot')) {
    const gl = app.gl, px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    app.render(); sync();
    const n = num('bench', 3), times = [];
    for (let i = 0; i < n; i++) { const t0 = performance.now(); app.render(); sync(); times.push(performance.now() - t0); }
    times.sort((x, y) => x - y);
    window.__frameMs = times[Math.floor(times.length / 2)];
    $('boot').hidden = true; $('intro').hidden = true;
    window.__ready = true;
    return;
  }
  app.start();
  window.__ready = true;
}

$('enter').addEventListener('click', enter);
if (q.has('enter')) enter();

/*
 * THE ORBITAL RING: the light intro page. Nothing heavy loads until Enter.
 * On Enter this loads ride.js (and with it the renderer), shows the boot screen,
 * and wires the controls, the read-outs, the notes and the roll of film to the ride.
 */
const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || q.get('rm') === '1';
const body = document.body;
let ride = null;

/* ---------------- boot and failure ---------------- */
function bootProgress(p, label) {
  $('bootBar').style.width = Math.round(p * 100) + '%';
  if (label) $('bootText').textContent = label;
}
function fail(e) {
  body.classList.add('failed');
  body.classList.remove('booting');
  const why = e && e.code === 'lost'
    ? 'The graphics context was interrupted, perhaps by sleep or a driver reset. Reload the page to board again.'
    : e && e.code === 'no-webgl2'
    ? 'This ride needs WebGL2, and this browser isn’t offering it. A recent Chrome, Edge, Firefox or Safari with hardware acceleration should work.'
    : e && e.code === 'no-float'
      ? 'This device’s graphics can’t draw the sky with enough precision. A desktop browser should manage.'
      : 'Something went wrong while building the sky. Reloading may help.';
  $('failText').textContent = why;
  $('boot').classList.add('show');
}
async function enter() {
  if (ride || body.classList.contains('booting')) return;
  body.classList.add('booting');
  $('boot').classList.add('show');
  bootProgress(.02, 'LOADING THE CAR');
  let mod;
  try { mod = await import('./ride.js'); } catch (e) { console.error(e); fail(e); return; }
  ride = await mod.start({ boot: bootProgress, fail, reducedMotion: reduce, ui: UI, departure: currentDep });
  if (!ride) return;
  body.classList.remove('booting');
  body.classList.add('riding');
  if (reduce) body.classList.add('reduced');
  setTimeout(() => $('boot').classList.remove('show'), 80);
  if (!q.has('freeze') && reduce) note('Motion is reduced, so the car waits for you. Pick a height under Stills, or press Depart.', 9000);
  $('ride').focus({ preventScroll: true });
}

/* ---------------- read-outs and notes ---------------- */
const fmtAlt = a => a < 1 ? Math.round(a * 1000) + ' m' : a < 100 ? a.toFixed(1) + ' km' : Math.round(a) + ' km';
const fmtT = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtAir = p => p >= .1 ? Math.round(p * 100) + '%' : p >= .001 ? (p * 100).toFixed(1).replace(/\.0$/, '') + '%' : p >= 1e-6 ? (p * 100).toPrecision(1) + '%' : 'none';
let noteT = null;
function note(text, ms = 7500) {
  const n = $('note');
  n.classList.remove('show');
  clearTimeout(noteT);
  setTimeout(() => { n.textContent = text; n.classList.add('show'); noteT = setTimeout(() => n.classList.remove('show'), ms); }, 260);
}
let lastPhase = '';
const UI = {
  busy(on) { $('boot').classList.toggle('show', on); if (on) bootProgress(.92, 'COMPILING THE SKY'); },
  hud(h) {
    $('rAlt').textContent = fmtAlt(h.alt);
    $('rSpeed').textContent = h.v < 1 ? 'standing' : Math.round(h.v) + ' m/s';
    $('rSpeedK').textContent = h.v < 1 ? '' : Math.round(h.v * 3.6).toLocaleString('en') + ' km/h';
    $('rWeight').textContent = Math.round(h.weight * 100) + '%';
    $('rAir').textContent = fmtAir(h.air);
    $('rClock').textContent = h.clock;
    const atTop = h.phase === 'gallery' || h.phase === 'docked';
    $('rRideLabel').textContent = atTop ? 'Over' : 'Ride';
    $('rRide').textContent = atTop ? Math.abs(h.lat).toFixed(1) + '°' + (h.lat >= 0 ? 'N ' : 'S ') + Math.abs(h.lon).toFixed(1) + '°' + (h.lon >= 0 ? 'E' : 'W') : fmtT(h.rideT) + ' of ' + fmtT(h.rideTotal);
    $('rClockLabel').textContent = atTop ? 'Local time below' : 'At the platform';
    $('railCar').style.bottom = (Math.sqrt(Math.min(h.alt, 300) / 300) * 100).toFixed(2) + '%';
    $('pauseBtn').textContent = h.paused ? 'Play' : 'Pause';
    $('pauseBtn').setAttribute('aria-pressed', h.paused ? 'true' : 'false');
    $('departBtn').hidden = h.phase !== 'platform';
    $('departBtn').querySelector('span').textContent = h.countdown != null && h.countdown >= 1 && h.countdown < 60 ? ' in ' + Math.ceil(h.countdown) : '';
    const top = h.phase === 'docked' || h.phase === 'gallery';
    $('arrive').hidden = !top;
    $('stepOutBtn').hidden = h.phase !== 'docked';
    $('travelSeg').hidden = h.phase !== 'gallery';
    if (top && h.station) {
      const st = h.station, lon = Math.abs(h.lon).toFixed(1) + '°' + (h.lon >= 0 ? 'E' : 'W');
      $('stationLabel').textContent = h.phase === 'gallery' && !st.here
        ? (h.gliding ? 'Slowing for station ' + st.k + ' · ' : 'Travelling · ') + lon + ' · ' + Math.round(Math.abs(h.travel) * 3.6).toLocaleString('en') + ' km/h'
        : 'Station ' + st.k + ' · ' + lon + ' · over ' + st.place;
      const can = h.phase === 'docked' || (st.here && st.water);
      $('downBtn').disabled = !can;
      $('downBtn').textContent = can ? 'Ride this cable down' : st.here ? 'This cable comes down on land' : 'Go to a station to ride down';
    }
    if (h.phase !== lastPhase) { body.dataset.phase = h.phase; lastPhase = h.phase; }
  },
  note,
  onPhase(p) {
    if (p === 'docked') note('Docked, 300 km up and standing still. You weigh 91% of what you weigh at home.', 9000);
    if (p === 'gallery') {
      updateRoll();
      if (ride && ride.roll.length) $('rollBtn').hidden = false;
    }
  },
  onLook(auto) { $('followBtn').hidden = auto; },
};

/* ---------------- departure ---------------- */
let currentDep = ['dawn', 'day', 'dusk', 'night', 'now'].includes(q.get('dep')) ? q.get('dep') : 'dawn';
const depNames = { dawn: 'dawn', day: 'midday', dusk: 'dusk', night: 'night', now: 'now' };
function setDep(key) {
  currentDep = key;
  $('depLabel').textContent = depNames[key];
  document.querySelectorAll('[data-dep]').forEach(b => b.setAttribute('aria-checked', b.dataset.dep === key ? 'true' : 'false'));
  if (ride) ride.setDeparture(key);
}
{ /* the real hour at the platform, for the "Now" option */
  const d = new Date(); const h = ((d.getUTCHours() + d.getUTCMinutes() / 60 + 73.3 / 15) % 24 + 24) % 24;
  $('nowHint').textContent = String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0') + ' there';
}
setDep(currentDep);
$('depBtn').addEventListener('click', e => {
  e.stopPropagation(); const m = $('depMenu'); const open = !m.classList.contains('open');
  m.classList.toggle('open', open); $('depBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) m.querySelector('[aria-checked="true"]').focus();
});
document.querySelectorAll('[data-dep]').forEach(b => b.addEventListener('click', () => { setDep(b.dataset.dep); closeDep(); }));
function closeDep() { $('depMenu').classList.remove('open'); $('depBtn').setAttribute('aria-expanded', 'false'); }
document.addEventListener('click', e => { if (!e.target.closest('.dep-wrap')) closeDep(); });

/* ---------------- controls ---------------- */
$('enterButton').addEventListener('click', enter);
/* reaching for the button starts the shaders compiling (see prepare() in ride.js) */
const warm = () => { import('./ride.js').then(m => m.prepare()).catch(() => {}); };
for (const ev of ['pointerenter', 'focus', 'touchstart']) $('enterButton').addEventListener(ev, warm, { once: true, passive: true });
$('departBtn').addEventListener('click', () => ride && ride.depart());
$('pauseBtn').addEventListener('click', () => ride && ride.togglePause());
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
  if (!ride) return; ride.setSpeed(+b.dataset.speed);
  document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
}));
document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
  if (!ride) return; ride.setQuality(b.dataset.q);
  document.querySelectorAll('[data-q]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
}));
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => {
  if (!ride) return; const v = b.dataset.jump; ride.jumpTo(v === 'gallery' ? 'gallery' : +v); closePanels();
}));
$('followBtn').addEventListener('click', () => ride && ride.follow());
$('stepOutBtn').addEventListener('click', () => ride && ride.stepOut());
$('downBtn').addEventListener('click', () => ride && ride.rideDown());
document.querySelectorAll('[data-travel]').forEach(b => b.addEventListener('click', () => ride && ride.travel(+b.dataset.travel)));
$('againBtn').addEventListener('click', () => { if (ride) { ride.rideAgain(); note('Back on the platform.'); } });
UI.onSpeed = k => document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.speed === k ? 'true' : 'false'));
UI.onStation = st => note('Station ' + st.k + ', over ' + st.place + '.' + (st.water ? ' You can ride this cable down.' : ' This cable comes down on land.'));
$('rail').addEventListener('click', e => {
  if (!ride) return;
  const r = $('rail').getBoundingClientRect(); const y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
  ride.jumpTo(Math.max(0, Math.min(299.6, y * y * 300)));
});

/* ---------------- photographs ---------------- */
async function shoot() {
  if (!ride || ride.roll.length >= 12) return;
  const f = $('flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  const shot = await ride.takePhoto();
  $('shotsLeft').textContent = 12 - ride.roll.length;
  if (ride.roll.length >= 12) $('shutterBtn').disabled = true;
  $('rollBtn').hidden = false;
  if (shot && ride.roll.length === 1) note('One photograph taken. Your roll is under “Your roll” when you arrive.', 5000);
}
$('shutterBtn').addEventListener('click', shoot);
$('rollBtn').addEventListener('click', () => { updateRoll(); openPanel('roll'); });
function updateRoll() {
  if (!ride) return;
  const strip = $('strip'); strip.textContent = '';
  for (let i = 0; i < 12; i++) {
    const s = ride.roll[i]; const fig = document.createElement('figure');
    if (s) { const c = document.createElement('canvas'); c.width = c.height = 240; c.getContext('2d').drawImage(s.canvas, 0, 0, 240, 240); fig.append(c); }
    else { const e = document.createElement('div'); e.className = 'empty'; fig.append(e); }
    const cap = document.createElement('figcaption'); cap.textContent = s ? (i + 1) + ' · ' + fmtAlt(s.alt) + ' · ' + s.clock : String(i + 1);
    fig.append(cap); strip.append(fig);
  }
  $('rollHint').textContent = ride.roll.length ? ride.roll.length + ' of 12 taken. Each one is square, like the 6×6 frames from the capsule cameras.' : 'Press P, or the shutter button, during the ride.';
  $('saveRoll').disabled = !ride.roll.length;
}
$('saveRoll').addEventListener('click', () => {
  if (!ride || !ride.roll.length) return;
  const n = 12, cols = 4, rows = 3, fs = 520, gap = 44, pad = 70;
  const c = document.createElement('canvas'); c.width = pad * 2 + cols * fs + (cols - 1) * gap; c.height = pad * 2 + rows * (fs + 70) + 90;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d3'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2b241b'; g.font = '34px "Courier Prime", monospace'; g.fillText('THE ORBITAL RING · CONTACT SHEET · ' + new Date().toISOString().slice(0, 10), pad, pad + 10);
  for (let i = 0; i < n; i++) {
    const x = pad + (i % cols) * (fs + gap), y = pad + 60 + Math.floor(i / cols) * (fs + 70);
    g.fillStyle = '#100c09'; g.fillRect(x - 14, y - 14, fs + 28, fs + 28);
    const s = ride.roll[i];
    if (s) g.drawImage(s.canvas, x, y, fs, fs);
    g.fillStyle = '#2b241b'; g.font = '24px "Courier Prime", monospace';
    g.fillText((i + 1) + (s ? '   ' + fmtAlt(s.alt) + '   ' + s.clock : ''), x - 14, y + fs + 50);
  }
  g.font = '22px "Courier Prime", monospace'; g.fillStyle = '#6f6352';
  g.fillText('dysonswarm.com/orbital-ring · San Kala', pad, c.height - pad + 20);
  c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'orbital-ring-contact-sheet.jpg'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/jpeg', .9);
});

/* ---------------- panels ---------------- */
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.open)));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
document.querySelectorAll('.panel-wrap').forEach(w => w.addEventListener('click', e => { if (e.target === w) closePanels(); }));
let lastFocus = null;
function openPanel(id) {
  lastFocus = document.activeElement; closePanels(false);
  const p = $(id); p.classList.add('open');
  p.querySelectorAll('img[data-src]').forEach(img => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
  p.querySelector('[data-close]')?.focus();
}
function closePanels(restore = true) {
  const any = document.querySelector('.panel-wrap.open');
  document.querySelectorAll('.panel-wrap.open').forEach(p => p.classList.remove('open'));
  if (restore && any && lastFocus && lastFocus.focus) lastFocus.focus();
}
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePanels(); closeDep(); if (!$('slides').hidden) closeSlides(); return; }
  if (!ride || e.target.closest('input,textarea') || document.querySelector('.panel-wrap.open')) return;
  if (e.key === ' ') { e.preventDefault(); ride.togglePause(); }
  else if (e.key === '1') document.querySelector('[data-speed="1"]').click();
  else if (e.key === '2') document.querySelector('[data-speed="5"]').click();
  else if (e.key === '3') document.querySelector('[data-speed="20"]').click();
  else if (e.key === 'r' || e.key === 'R') ride.follow();
  else if (e.key === 'h' || e.key === 'H') body.classList.toggle('ui-hidden');
  else if (e.key === 'p' || e.key === 'P') shoot();
  else if (e.key === '?') openPanel('help');
});

/* ---------------- without WebGL2: the ride in stills ---------------- */
const SLIDES = [
  ['1-platform', 'On the platform before dawn. The thin line rising from the horizon is the ring.'],
  ['2-five-km', '5 km. Above the low clouds.'],
  ['3-twenty-km', '20 km. The sky is going indigo.'],
  ['4-fifty-km', '50 km. Sunrise, and the sky has stopped being blue.'],
  ['5-space', '150 km. Space, by any definition.'],
  ['6-station', '300 km. The station, from underneath.'],
  ['7-gallery', 'The gallery. The ring runs east, on round the world.'],
];
let slide = 0;
function showSlide(i) {
  slide = (i + SLIDES.length) % SLIDES.length;
  $('slideImg').src = './images/stills/' + SLIDES[slide][0] + '.jpg';
  $('slideImg').alt = SLIDES[slide][1];
  $('slideCap').textContent = (slide + 1) + ' / ' + SLIDES.length + ' · ' + SLIDES[slide][1];
}
function closeSlides() { $('slides').hidden = true; }
$('failStills').addEventListener('click', () => { $('slides').hidden = false; showSlide(0); $('slideNext').focus(); });
$('slidePrev').addEventListener('click', () => showSlide(slide - 1));
$('slideNext').addEventListener('click', () => showSlide(slide + 1));
$('slidesClose').addEventListener('click', closeSlides);

if (q.get('enter') === '1') enter();
if (q.get('ui') === '0') body.classList.add('ui-hidden');
/* test hook: the intro page is ready once its picture has loaded */
if (q.get('enter') !== '1') { const im = document.querySelector('.still img'); const done = () => { window.__ready = true; }; if (im.complete) done(); else { im.addEventListener('load', done); im.addEventListener('error', done); } }

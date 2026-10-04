// The interface around the painting: the years, the hour, places, notes, photo.

import { STAGES, STORY, YEAR_MAX, CAPTIONS, SCHEDULE as S, stateAt, yearToStory, storyToYear, actionAt } from './timeline.js';
import { VIEWS } from './world.js';
import { getMagellan, STAND_IN_TILE } from './terrain.js';
import { clamp } from './noise.js';

const $ = id => document.getElementById(id);

export function bindUI(app, { openSheet, closeSheets, showUI = true }) {
  const ui = $('ui');
  ui.hidden = !showUI;
  const yearIn = $('year'), hourIn = $('hour');
  yearIn.min = 0; yearIn.max = 1000; yearIn.step = 1;

  // Stage labels laid out along the timeline, each a button that jumps there.
  const stagesEl = $('stages');
  const ticks = document.querySelector('.ticks');
  ticks.innerHTML = '';
  for (const s of STORY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name;
    b.style.left = (s.u0 * 100) + '%';
    b.style.width = ((s.u1 - s.u0) * 100) + '%';
    const t = document.createElement('span');
    t.textContent = s.start;
    t.style.left = (s.u0 * 100) + '%';
    ticks.appendChild(t);
    b.title = s.name + ' · from year ' + s.start;
    b.addEventListener('click', () => { app.setPlaying(false); app.setYear(s.start + 0.6); });
    b.dataset.id = s.id;
    stagesEl.appendChild(b);
  }

  const fmtHour = h => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
  const fmtBar = p => p >= 10 ? Math.round(p) + ' bar' : p >= 1 ? p.toFixed(1) + ' bar' : p.toFixed(2) + ' bar';

  let lastStage = null;
  function lightWord(st) {
    const L = app.fs?.L;
    if (st.soletta > 0.5) return L && L.night > 0.6 ? 'night' : 'the soletta';
    if (st.shade < 0.2) return 'orange haze';
    if (st.shade < 0.95) return 'fading';
    if (st.year > S.PAVE_SEA_START - 2 && st.year < S.SOLETTA) return 'work lamps';
    if (st.cloudDeck > 0.5) return 'lightning';
    return 'starlight';
  }
  function refresh() {
    const y = app.year, st = stateAt(y);
    $('yearNum').textContent = Math.floor(y);
    const u = yearToStory(y);
    yearIn.value = Math.round(u * 1000);
    yearIn.setAttribute('aria-valuetext', 'Year ' + Math.floor(y) + ', ' + st.stage.name);
    yearIn.style.setProperty('--fill', (u * 100) + '%');
    $('stageName').textContent = st.stage.name;
    $('factAir').textContent = fmtBar(st.P);
    $('factTemp').textContent = Math.round(st.T - 273.15) + ' °C';
    $('factLight').textContent = lightWord(st);
    for (const b of stagesEl.children) b.classList.toggle('now', b.dataset.id === st.stage.id);
    if (st.stage.id !== lastStage) {
      const cap = $('caption');
      if (lastStage === null) cap.textContent = CAPTIONS[st.stage.id];
      else { cap.classList.add('fading'); setTimeout(() => { cap.textContent = CAPTIONS[st.stage.id]; cap.classList.remove('fading'); }, 300); }
      lastStage = st.stage.id;
    }
    // the hour only means something once the soletta gives Venus a day, or before the shade
    const dayless = st.shade > 0.02 && st.soletta < 0.5;
    hourIn.disabled = dayless;
    $('hourNote').textContent = dayless ? 'No day until the soletta, year ' + Math.ceil(S.SOLETTA) : st.soletta < 0.5 ? 'A Venus day lasts 117 Earth days' : 'A 24-hour day from the soletta';
    $('hourNum').textContent = dayless ? '—' : fmtHour(app.hour);
    hourIn.value = app.hour;
    hourIn.style.setProperty('--fill', (app.hour / 24 * 100) + '%');
    refreshAct();
    $('playBtn').classList.toggle('on', app.playing);
    $('playBtn').setAttribute('aria-label', app.playing ? 'Pause' : 'Play the years');
  }
  // ── doing it: one action per stage; paving and soil are done by hand ──
  const actBtn = $('actBtn'), actNote = $('actNote'), finishBtn = $('finishBtn');
  let hand = null, handAction = null;
  function refreshAct() {
    if (hand) {
      const n = app.handCount(hand);
      actBtn.textContent = hand === 'pave' ? 'Paving by hand' : 'Spreading soil by hand';
      actBtn.classList.add('on'); actBtn.classList.remove('pulse'); actBtn.disabled = true;
      actNote.textContent = (hand === 'pave' ? 'Tap the frozen sea or the snow to pave a hexagon, 1.2 km across.' : 'Tap the paved land to spread soil on a hexagon.') + (n ? ` ${n} done by hand.` : '');
      finishBtn.hidden = false; finishBtn.textContent = handAction.finish;
      return;
    }
    finishBtn.hidden = true;
    actBtn.classList.remove('on');
    const a = actionAt(app.year);
    if (!a || app.year >= YEAR_MAX - 0.05) { actBtn.textContent = 'Start again'; actBtn.disabled = false; actBtn.classList.remove('pulse'); actNote.textContent = ''; return; }
    actBtn.textContent = a.verb;
    actBtn.disabled = app.playing;
    actBtn.classList.toggle('pulse', !app.playing);
    actNote.textContent = app.playing ? 'Watching the years go by…' : '';
  }
  actBtn.addEventListener('click', async () => {
    const a = actionAt(app.year);
    if (!a || app.year >= YEAR_MAX - 0.05) { app.setYear(0); app.goGround(); return; }
    if (a.orbit) await fade(async () => { await app.goOrbit(a.orbit); orbitUI(); });
    else if (app.mode === 'orbit') await fade(async () => { app.goGround(); orbitUI(); });
    if (a.hand) {
      hand = a.hand; handAction = a;
      app.setPlaying(false); app.setYear(a.hold);
      document.body.classList.add('hand');
      if (app.mode === 'fly') { /* fine: paint from the air */ }
      toast(a.hand === 'pave' ? 'The colonies are waiting for you. Lay the first hexagons.' : 'The mirror is on. Spread the first soil.');
      refresh();
      return;
    }
    app.playTo(a.play);
  });
  finishBtn.addEventListener('click', () => {
    const a = handAction; hand = null; handAction = null;
    document.body.classList.remove('hand');
    app.playTo(a.play);
    refresh();
  });
  function tryWork(cx, cy) {
    const p = app.pick(cx, cy);
    if (!p) return;
    const r = app.work(p, hand);
    if (!r) { toast('Too far away to reach from here.'); return; }
    if (r.refused === 'sea') { toast('That is the old sea. Soil goes on the land.'); return; }
    if (r.refused === 'done') return;
    refreshAct();
  }

  app.on(kind => { if (kind === 'year' || kind === 'hour' || kind === 'play' || kind === 'view' || kind === 'arrived' || kind === 'mode') refresh(); });
  refresh();

  yearIn.addEventListener('input', () => { app.setPlaying(false); app.setYear(storyToYear(Number(yearIn.value) / 1000)); });
  hourIn.addEventListener('input', () => app.setHour(Number(hourIn.value)));
  $('playBtn').addEventListener('click', () => app.setPlaying(!app.playing));

  // toast
  let toastT = 0;
  const toast = text => { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); };
  // the later years compile in the background; if you get there first, say so until they're ready
  app.on(kind => {
    if (kind !== 'preparing') return;
    const t = $('toast'); clearTimeout(toastT);
    if (app.waiting) { t.textContent = 'Mixing the paints for the later years… a few seconds, only on the first visit.'; t.classList.add('show'); }
    else t.classList.remove('show');
  });

  // places
  const list = $('viewList');
  VIEWS.forEach((v, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="num">0${i + 1}</span><span class="vname">${v.name}</span><span class="vsub">${v.sub}</span>`;
    b.addEventListener('click', () => { goView(i); closeSheets(); });
    list.appendChild(b);
  });
  function goView(i) {
    app.setView(i);
    [...list.children].forEach((b, j) => b.classList.toggle('now', j === i));
    toast(VIEWS[i].name);
  }
  [...list.children].forEach((b, j) => b.classList.toggle('now', j === app.viewIndex));
  let locatorDrawn = false;
  $('placesBtn').addEventListener('click', () => { if (!locatorDrawn) { drawLocator(); locatorDrawn = true; } openSheet('places'); });
  $('notesBtn').addEventListener('click', () => openSheet('notes'));

  // photo, quality, hide
  $('photoBtn').addEventListener('click', photo);
  async function photo() {
    const blob = await app.photo();
    if (!blob) { toast('This browser could not save the picture.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `terraforming-venus-year-${Math.floor(app.year)}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Saved. H hides the interface for a clean view.');
  }
  const qualities = ['auto', 'high', 'medium', 'low'];
  $('qualityBtn').addEventListener('click', () => {
    const q = qualities[(qualities.indexOf(app.quality) + 1) % qualities.length];
    app.setQuality(q);
    $('qualityBtn').textContent = 'Quality: ' + q;
  });
  let hidden = false;
  const setHidden = h => { hidden = h; ui.classList.toggle('hiding', h); if (h) toast('H or a tap brings it back'); };
  $('hideBtn').addEventListener('click', () => setHidden(true));

  // flying and orbit
  function orbitUI() {
    $('orbitBtn').classList.toggle('on', app.mode === 'orbit');
    $('flyBtn').classList.toggle('on', app.mode === 'fly');
    document.body.classList.toggle('flying', app.mode === 'fly');
    $('orbitBtn').textContent = app.mode === 'orbit' ? 'Land' : 'Orbit';
  }
  $('flyBtn').addEventListener('click', () => { if (app.mode === 'orbit') app.goGround(); app.setFly(app.mode !== 'fly'); orbitUI(); toast(app.mode === 'fly' ? 'Flying. W A S D or the arrows to move, Q and E to climb and sink.' : 'Back on the headland.'); });
  const fade = async fn => { const f = $('fade'); f.classList.add('on'); await new Promise(r => setTimeout(r, 360)); await fn(); app.render(); f.classList.remove('on'); };
  $('orbitBtn').addEventListener('click', () => fade(async () => { if (app.mode === 'orbit') app.goGround(); else await app.goOrbit('globe'); orbitUI(); }));
  app.on(k => { if (k === 'mode' || k === 'view') orbitUI(); });
  orbitUI();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  const keys = new Set();
  const flyKeys = () => {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const u = (keys.has('KeyE') || keys.has('Space') ? 1 : 0) - (keys.has('KeyQ') || keys.has('ShiftLeft') && false ? 1 : 0);
    app.move.f = f; app.move.r = r; app.move.u = u; app.move.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (f || r || u) app.dirty = true;
  };
  addEventListener('keyup', e => { keys.delete(e.code); flyKeys(); });
  addEventListener('blur', () => { keys.clear(); flyKeys(); });
  // touch: a stick to move, buttons to climb and sink
  const stick = $('stick'), knob = $('knob'); let stickId = null;
  const stickMove = e => { const r = stick.getBoundingClientRect(); let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); const m = Math.hypot(x, y), k = m > 40 ? 40 / m : 1; x *= k; y *= k; knob.style.transform = `translate(${x}px, ${y}px)`; app.move.f = -y / 40; app.move.r = x / 40; app.dirty = true; };
  stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); e.preventDefault(); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
  const stickUp = () => { stickId = null; knob.style.transform = ''; app.move.f = app.move.r = 0; };
  stick.addEventListener('pointerup', stickUp); stick.addEventListener('pointercancel', stickUp);
  const hold = (id, v) => { const b = $(id); b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); app.move.u = v; app.dirty = true; e.preventDefault(); }); const off = () => { app.move.u = 0; }; b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); };
  hold('flyUp', 1); hold('flyDown', -1);

  // looking: drag (mouse or one finger), zoom: wheel or pinch
  const canvas = app.canvas;
  const pointers = new Map();
  let pinch0 = 0, dragged = 0;
  const degPerPx = () => app.frameFov() / canvas.clientWidth;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    hint();
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      const k = degPerPx();
      app.look(-dx * k, dy * k);
      dragged += Math.abs(dx) + Math.abs(dy);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) app.zoom(pinch0 / d);
      pinch0 = d;
    }
  });
  const up = e => { const was = pointers.has(e.pointerId); pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (hidden && dragged < 6) setHidden(false); else if (was && hand && dragged < 6) tryWork(e.clientX, e.clientY); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); app.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

  let hintGone = false;
  function hint() { if (!hintGone) { hintGone = true; $('hint').classList.add('gone'); } }
  setTimeout(hint, 9000);

  addEventListener('keydown', e => {
    if (document.querySelector('.sheet:not([hidden])')) return;
    if (e.target.tagName === 'INPUT' && !['Space', 'KeyH', 'KeyP'].includes(e.code)) return;
    const flying = app.mode === 'fly';
    if (flying && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      e.preventDefault(); keys.add(e.code); flyKeys(); hint(); return;
    }
    const step = e.shiftKey ? 10 : 1;
    switch (e.code) {
      case 'Space': e.preventDefault(); app.setPlaying(!app.playing); break;
      case 'ArrowRight': e.preventDefault(); app.setPlaying(false); app.setYear(Math.floor(app.year) + step); break;
      case 'ArrowLeft': e.preventDefault(); app.setPlaying(false); app.setYear(Math.ceil(app.year) - step); break;
      case 'BracketRight': app.setHour(app.hour + 0.5); break;
      case 'BracketLeft': app.setHour(app.hour - 0.5); break;
      case 'Digit1': case 'Digit2': case 'Digit3': if (app.mode === 'orbit') app.goGround(); goView(Number(e.code.slice(-1)) - 1); break;
      case 'KeyF': $('flyBtn').click(); break;
      case 'KeyO': $('orbitBtn').click(); break;
      case 'KeyW': case 'KeyA': case 'KeyD': $('flyBtn').click(); keys.add(e.code); flyKeys(); break;
      case 'KeyH': setHidden(!hidden); break;
      case 'KeyP': photo(); break;
      case 'Slash': openSheet('notes'); break;
      case 'Equal': app.zoom(0.8); break;
      case 'Minus': app.zoom(1.25); break;
      default: return;
    }
    hint();
  });
  addEventListener('resize', () => app.resize());
}

// A small hillshaded map of the Magellan tile with the standpoint.
function drawLocator() {
  const data = getMagellan();
  const cv = $('locator'), ctx = cv.getContext('2d');
  const N = 320, img = ctx.createImageData(N, N);
  let lo = 1e9, hi = -1e9;
  for (const v of data) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const sea = 1500;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, h = data[k];
    const dx = data[j * N + Math.min(N - 1, i + 1)] - data[j * N + Math.max(0, i - 1)];
    const dz = data[Math.min(N - 1, j + 1) * N + i] - data[Math.max(0, j - 1) * N + i];
    const shade = clamp(0.62 + (-dx + dz) / 1600, 0.15, 1.15);
    const t = clamp((h - lo) / (hi - lo), 0, 1);
    let c = h < sea ? [70 + 40 * t, 80 + 50 * t, 92 + 50 * t] : [118 + 120 * t, 86 + 110 * t, 56 + 90 * t];
    img.data[k * 4] = c[0] * shade; img.data[k * 4 + 1] = c[1] * shade; img.data[k * 4 + 2] = c[2] * shade; img.data[k * 4 + 3] = 255;
  }
  const off = document.createElement('canvas'); off.width = N; off.height = N;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, cv.width, cv.height);
  const s = cv.width / N;
  const sx = (N / 2 + STAND_IN_TILE[0] / 4000) * s, sz = (N / 2 + STAND_IN_TILE[1] / 4000) * s;
  // view direction
  ctx.strokeStyle = '#efe4cf'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(sx, sz); ctx.lineTo(sx + Math.sin(258 * Math.PI / 180) * 40, sz - Math.cos(258 * Math.PI / 180) * 40); ctx.stroke();
  ctx.fillStyle = '#efe4cf'; ctx.strokeStyle = '#24180f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sx, sz, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = '13px Jost, sans-serif'; ctx.fillStyle = '#efe4cf'; ctx.textAlign = 'left';
  const label = (t, x, y) => { ctx.fillStyle = 'rgba(20,13,8,0.6)'; const w = ctx.measureText(t).width; ctx.fillRect(x - 4, y - 13, w + 8, 18); ctx.fillStyle = '#efe4cf'; ctx.fillText(t, x, y); };
  label('You are here', sx + 10, sz + 4);
  label('Maxwell Montes', cv.width * 0.71, cv.height * 0.2);
  label('Lakshmi Planum ↖', cv.width * 0.06, cv.height * 0.08);
  ctx.fillStyle = 'rgba(239,228,207,0.75)'; ctx.font = '11px Jost, sans-serif';
  ctx.fillText('N ↑   1280 km across', 10, cv.height - 10);
}

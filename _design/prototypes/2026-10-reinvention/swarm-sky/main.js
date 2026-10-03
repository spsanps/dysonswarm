/* Page wiring: the clock, the plate, the log, stepping back through the stack.
   ?date=<ISO>  view the swarm at any moment (no zone given means Pacific time;
                a bare date means noon Pacific)
   ?t=<seconds> freeze: render that many seconds after the start, stop, and set
                window.__ready (the blink is held at that phase too) */
(function () {
  'use strict';
  const C = window.SwarmClock, P = window.SwarmPlate;
  const $ = id => document.getElementById(id);
  const stage = $('stage'), desk = $('desk'), curC = $('plateCur'), prevC = $('platePrev'), inkCv = $('plateInk'), sleeveC = $('sleeve');
  const qs = new URLSearchParams(location.search);
  const tParam = qs.has('t') ? parseFloat(qs.get('t')) : null;
  const frozen = tParam !== null && !isNaN(tParam);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const BLINK = 7;

  function parseDate(s) {
    if (!s) return null;
    if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) { const v = Date.parse(s); return isNaN(v) ? null : v; }
    const m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/);
    if (!m) { const v = Date.parse(s); return isNaN(v) ? null : v; }
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    const hh = m[4] != null ? +m[4] : 12, mm = m[5] != null ? +m[5] : 0, ss = m[6] != null ? +m[6] : 0;
    const guess = Date.UTC(y, mo - 1, d, hh, mm, ss);
    return guess - C.pacificOffset(guess + 8 * C.HOUR) * C.HOUR;
  }
  const base = parseDate(qs.get('date'));
  const perf0 = performance.now(), wall0 = Date.now();
  function now() {
    if (frozen) return (base != null ? base : wall0) + tParam * 1000;
    if (base != null) return base + (performance.now() - perf0);
    return Date.now();
  }

  const state = { k: 1, followToday: true, blink: !reduce.matches && !frozen, L: null, dpr: 1, result: null };
  if (frozen) state.blink = true;

  function today() { return Math.max(0, C.dayIndex(now())); }

  /* ------------------------------------------------------------ text */
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function renderText(k, t) {
    if (k < 1) return renderBefore(t);
    $('range').disabled = false;
    const sum = C.summary(k, t);
    const d = C.dayDate(k);
    const isToday = k === today();
    $('eyebrow').innerHTML = `Plate <b>${k}</b> · ${C.fmtDateLong(d)}${isToday && sum.live ? ` · <span>${C.fmtTime(t)} Pacific</span>` : ''}`;
    const T = today();
    $('range').min = '1'; $('range').max = String(T); $('range').value = String(k);
    $('rangeLabel').textContent = isToday ? `Plate ${k}, today` : `Plate ${k} of ${T}`;
    $('prev').disabled = k <= 1; $('next').disabled = k >= T;
    $('today').hidden = isToday;
    $('blink').textContent = state.blink ? (k > 1 ? `Blinking against plate ${k - 1}` : 'Blinking against the bare sky') : 'Blink against yesterday';
    $('blink').setAttribute('aria-pressed', String(state.blink));
    $('logTitle').textContent = `Plate log · ${C.fmtDate(d)}`;
    const entries = C.logFor(k, t);
    const linkFor = id => id === 'swarm' ? ' <a href="/swarm/">Open the swarm ↗</a>' : id === 'sky' ? ' <a href="/another-sky/">Go inside ↗</a>' : '';
    const rows = entries.map(e => {
      if (e.kind === 'event') return `<li class="event"><time>${e.time}</time><span>${esc(e.text)}${linkFor(e.link)}</span></li>`;
      return `<li class="${e.live ? 'live' : ''}"><time>${e.time}</time><span>Ring ${e.ring}: ${esc(e.text)}<span class="note">${esc(e.note)}</span></span></li>`;
    });
    if (k === 1) rows.push(`<li class="event"><time>Jan</time><span>Before plate 1: on 6 January 2026 I made the first swarm sketch, Mercury taken apart to build it.${linkFor('swarm')}</span></li>`);
    $('log').innerHTML = rows.join('');
    $('logTotal').innerHTML = `${sum.live ? 'So far' : 'By the end of the day'}: <b>${C.fmtNum(sum.total)}</b> collectors in <b>${sum.rings}</b> ring${sum.rings === 1 ? '' : 's'}. ${sum.launchers} launcher${sum.launchers === 1 ? '' : 's'} on Mercury.`;
    curC.setAttribute('aria-label', `Glass plate ${k}, ${C.fmtDate(d)}: the Sun burnt out to a grey disc, ${sum.rings} rings of collectors around it, ${C.fmtNum(sum.total)} in all. Ring ${k} is ${sum.live ? Math.floor(100 * sum.ringPlaced / sum.ringSize) + '% of the way round' : 'closed'}. Mercury and Another Sky are circled in ink.`);
  }

  function renderBefore(t) {
    const d = C.pacificParts(t);
    d.wd = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay();
    $('eyebrow').innerHTML = `Before the swarm · ${C.fmtDateLong(d)}`;
    $('range').min = '0'; $('range').max = '0'; $('range').value = '0'; $('range').disabled = true;
    $('rangeLabel').textContent = 'No plates yet';
    $('prev').disabled = true; $('next').disabled = true; $('today').hidden = true;
    $('blink').textContent = 'Nothing to blink yet';
    $('logTitle').textContent = `Plate log · ${C.fmtDate(d)}`;
    $('log').innerHTML = `<li class="event"><time>—</time><span>Nothing built yet. The first ring goes up on Sunday 6 September 2026.</span></li>
      <li class="event"><time>Jan</time><span>On 6 January 2026 I made the first swarm sketch, Mercury taken apart to build it. <a href="/swarm/">Open the swarm ↗</a></span></li>`;
    $('logTotal').innerHTML = 'Just the Sun, Mercury and Another Sky.';
    curC.setAttribute('aria-label', 'A glass plate of the Sun before the swarm: the burnt-out disc, stars, Mercury and Another Sky circled in ink.');
  }

  /* ---------------------------------------------------------- layout */
  function layout() {
    stage.style.height = '';
    let r = stage.getBoundingClientRect();
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    state.L = P.computeLayout(Math.round(r.width), Math.round(r.height));
    // a tall stage around a narrow plate would leave an acre of empty sleeve: fit it
    const oneColumn = matchMedia('(max-width: 900px)').matches;
    if (r.height > state.L.fitH * (oneColumn ? 1.01 : 1.25)) {
      stage.style.height = state.L.fitH + 'px';
      r = stage.getBoundingClientRect();
      state.L = P.computeLayout(Math.round(r.width), Math.round(r.height));
    }
    const L = state.L;
    for (const c of [curC, prevC, inkCv]) {
      c.style.left = (L.cx - L.pw / 2) + 'px'; c.style.top = (L.cy - L.ph / 2) + 'px';
      c.style.width = L.pw + 'px'; c.style.height = L.ph + 'px';
      c.style.transform = `rotate(${L.rot}deg)`;
    }
    desk.style.left = '0px'; desk.style.top = '0px'; desk.style.width = L.W + 'px'; desk.style.height = L.H + 'px';
    const S = L.sleeve;
    sleeveC.style.left = S.x + 'px'; sleeveC.style.top = S.y + 'px'; sleeveC.style.width = S.w + 'px'; sleeveC.style.height = S.h + 'px';
    sleeveC.style.transformOrigin = '50% 0'; sleeveC.style.transform = `rotate(${S.rot}deg)`;
  }
  function blit(dst, src) {
    dst.width = src.width; dst.height = src.height;
    dst.getContext('2d').drawImage(src, 0, 0);
  }
  function placeHot(res) {
    const L = state.L, a = L.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (const id of ['swarm', 'sky']) {
      const el = $('hot-' + id), h = res.hot.find(q => q.id === id);
      if (!h) { el.hidden = true; continue; }
      // the label box and the circled object, both clickable; use their union
      const x0 = Math.min(h.x, h.px - h.r), y0 = Math.min(h.y, h.py - h.r), x1 = Math.max(h.x + h.w, h.px + h.r), y1 = Math.max(h.y + h.h, h.py + h.r);
      const mx = ((x0 + x1) / 2 - L.PW / 2) * L.s, my = ((y0 + y1) / 2 - L.PH / 2) * L.s;
      const sx = L.cx + mx * ca - my * sa, sy = L.cy + mx * sa + my * ca;
      const w = (x1 - x0) * L.s, hh = (y1 - y0) * L.s;
      el.style.left = (sx - w / 2) + 'px'; el.style.top = (sy - hh / 2) + 'px'; el.style.width = w + 'px'; el.style.height = hh + 'px';
      el.style.transform = `rotate(${L.rot}deg)`;
      el.hidden = false;
    }
  }

  /* ---------------------------------------------------------- render */
  let renderToken = 0;
  function render(opts) {
    opts = opts || {};
    const t = now();
    const k = state.k;
    renderText(k, t);
    const tok = ++renderToken;
    const go = () => {
      if (tok !== renderToken) return;
      const L = state.L;
      const t0 = performance.now();
      const res = P.renderPlate({ k, now: t, L, dpr: state.dpr });
      const t1 = performance.now();
      blit(curC, res.cur); blit(prevC, res.cur); blit(inkCv, res.ink);
      const dk = P.renderDesk({ L, dpr: state.dpr, k });
      blit(desk, dk);
      const sl = P.renderSleeve({ L, dpr: state.dpr, k, info: res.info, now: t });
      blit(sleeveC, sl);
      state.result = res;
      window.__renderMs = { plate: Math.round(t1 - t0), all: Math.round(performance.now() - t0) };
      placeHot(res);
      stage.classList.remove('developing');   // first paint: the plate comes up like a print in the tray
      if (opts.swap) for (const c of [curC, prevC, inkCv]) c.classList.remove('swap');
      // the blink's earlier version is built after the first paint
      const finishPrev = () => {
        if (tok !== renderToken) return;
        blit(prevC, res.makePrev());
        applyBlink();
        window.__ready = true;
      };
      if (frozen) finishPrev();
      else { curC.classList.remove('blinking'); setTimeout(finishPrev, 60); }
      scheduleLive();
    };
    if (opts.swap && !reduce.matches && !frozen) {
      for (const c of [curC, prevC, inkCv]) c.classList.add('swap');
      setTimeout(go, 140);
    } else go();
  }

  function applyBlink() {
    curC.classList.remove('blinking');
    curC.style.animationDelay = ''; curC.style.animationPlayState = '';
    if (!state.blink || reduce.matches && !frozen) return;
    void curC.offsetWidth;
    curC.classList.add('blinking');
    if (frozen) {
      curC.style.animationDelay = `${-(tParam % BLINK)}s`;
      curC.style.animationPlayState = 'paused';
    }
  }

  /* ------------------------------------------------------- live clock */
  let liveTimer = 0;
  function scheduleLive() {
    clearTimeout(liveTimer);
    if (frozen || document.hidden) return;
    const t = now();
    const T = today();
    const viewingToday = state.k === T;
    let wait = 60000;
    if (viewingToday) wait = Math.max(25000, Math.min(10 * 60000, C.nextPlacement(t) - t + 200));
    // and always wake at midnight so a new plate can start
    wait = Math.min(wait, C.dayEnd(T) - t + 500);
    liveTimer = setTimeout(() => {
      const T2 = today();
      if (state.followToday) state.k = T2;
      if (state.k === T2 || T2 !== T) render({ swap: T2 !== T && state.followToday });
      else { renderText(state.k, now()); scheduleLive(); }
    }, wait);
  }

  function setPlate(k) {
    const T = today();
    k = Math.max(Math.min(1, T), Math.min(T, k));
    if (k === state.k) return;
    state.k = k;
    state.followToday = k === T;
    render({ swap: true });
  }

  /* ------------------------------------------------------------ input */
  $('prev').addEventListener('click', () => setPlate(state.k - 1));
  $('next').addEventListener('click', () => setPlate(state.k + 1));
  $('today').addEventListener('click', () => setPlate(today()));
  let rangeTimer = 0;
  $('range').addEventListener('input', e => {
    const k = +e.target.value;
    renderText(k, now());
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(() => setPlate(k), 120);
  });
  $('blink').addEventListener('click', () => { state.blink = !state.blink; applyBlink(); renderText(state.k, now()); });
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowLeft') setPlate(state.k - 1);
    if (e.key === 'ArrowRight') setPlate(state.k + 1);
  });
  document.addEventListener('visibilitychange', () => {
    stage.classList.toggle('paused', document.hidden);
    if (document.hidden) clearTimeout(liveTimer);
    else if (!frozen) { if (state.followToday && state.k !== today()) { state.k = today(); render({ swap: true }); } else render(); }
  });
  let rt = 0, lastW = 0, lastH = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const w = stage.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 2 && Math.abs(innerHeight - lastH) < 2) return;
      lastH = innerHeight;
      lastW = w; layout(); render();
    }, 160);
  });
  reduce.addEventListener && reduce.addEventListener('change', () => { state.blink = !reduce.matches; applyBlink(); });

  /* ------------------------------------------------------------- boot */
  if (frozen) stage.classList.add('frozen');
  state.k = today();
  renderText(state.k, now());
  const fontsReady = Promise.all([
    document.fonts.load('20px "La Belle Aurore"'),
    document.fonts.load('20px "Reenie Beanie"'),
    document.fonts.load('20px "Old Standard TT"'),
    document.fonts.load('italic 20px "Old Standard TT"'),
    document.fonts.load('700 20px "Old Standard TT"')
  ]).catch(() => {});
  const timeout = new Promise(r => setTimeout(r, 2500));
  Promise.race([fontsReady, timeout]).then(() => {
    layout();
    lastW = stage.getBoundingClientRect().width;
    render();
  });
})();

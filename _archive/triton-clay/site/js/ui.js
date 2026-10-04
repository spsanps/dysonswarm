// The board, the cards and the notes. Plain DOM.
import * as A from './astro.js';
import { HALLS, jobAt, messagesInFlight } from './jobs.js';
import { IDS } from './world.js';
import { openDialog, closeDialog } from './dialog.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = f => Math.round(f * 100) + '%';
const HELLO_KEY = 'four-hours-out:hello';

export class UI {
  constructor(api) {
    this.api = api;
    this.card = $('card');
    this.sel = null;
    this.hello = null;
    try { const h = JSON.parse(localStorage.getItem(HELLO_KEY) || 'null'); if (h && h.sent) this.hello = h; } catch (e) { /* storage may be blocked */ }

    $('lapseBtn').addEventListener('click', () => this.clickLapse());
    $('earthBtn').addEventListener('click', () => this.clickEarth());
    $('photoBtn').addEventListener('click', () => this.photo());
    $('qualityBtn').addEventListener('click', () => this.setQualityLabel(api.cycleQuality()));
    $('notesBtn').addEventListener('click', () => this.openNotes());
    $('cardClose').addEventListener('click', () => api.select(null));
    $('lapseBack').addEventListener('click', () => { api.resetLapse(); $('lapseBtn').setAttribute('aria-pressed', 'false'); this.update(api.simNow()); });
    $('earthBack').addEventListener('click', () => this.clickEarth());
    $('helloBtn').addEventListener('click', () => this.sendHello());
    $('boardToggle').addEventListener('click', () => {
      const open = document.body.classList.toggle('board-open');
      $('boardToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    const rows = $('halls');
    rows.innerHTML = HALLS.map((h, i) => `<li><button type="button" data-hall="${i}"><i style="background:${h.colour}"></i><span class="hn">${esc(h.name)}</span><span class="hj" id="hj${i}"></span><span class="hp" id="hp${i}"></span><span class="bar"><b id="hb${i}"></b></span></button></li>`).join('');
    rows.addEventListener('click', e => { const b = e.target.closest('button[data-hall]'); if (b) api.select(IDS.HALL0 + +b.dataset.hall); });
  }

  entered() {
    if (matchMedia('(pointer: coarse)').matches) $('hint').textContent = 'Drag to turn · pinch to zoom · tap a building';
    document.body.classList.add('show-hint');
    this.hintTimer = setTimeout(() => this.dismissHint(), 9000);
  }
  dismissHint() { document.body.classList.remove('show-hint'); clearTimeout(this.hintTimer); }
  setQualityLabel(q) { $('qualityBtn').textContent = 'Quality: ' + q; }
  clickLapse() { const on = this.api.toggleLapse(); $('lapseBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); document.body.classList.toggle('lapse', on); this.update(this.api.simNow()); }
  clickEarth() { const on = this.api.toggleEarth(); $('earthBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); document.body.classList.toggle('earth', on); this.update(this.api.simNow()); }
  photo() { this.api.photo(); }
  reset() { this.api.reset(); }
  savePhoto(canvas) {
    try {
      canvas.toBlob(b => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'four-hours-out-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    } catch (e) { console.warn(e); }
  }

  // ---- notes dialog -------------------------------------------------------------
  openNotes() { openDialog('notes'); }
  dialogOpen() { return !!document.querySelector('.overlay.open'); }
  closeDialog() { closeDialog(); }

  // ---- hello ----------------------------------------------------------------------
  sendHello() {
    const now = this.api.realNow();
    this.hello = { sent: now };
    try { localStorage.setItem(HELLO_KEY, JSON.stringify(this.hello)); } catch (e) { /* fine without storage */ }
    this.update(this.api.simNow());
  }
  helloLine(now) {
    const h = this.hello;
    if (!h) return '';
    const land = h.sent + A.lightTime(h.sent).ms;
    const back = land + 3 * A.MINUTE + A.lightTime(land).ms;
    if (back < now - 2 * A.DAY) return '';
    if (now < land) return `Your hello lands on Triton <b>${A.when(land, now)}</b>. A reply would reach you <b>${A.when(back, now)}</b>.`;
    if (now < back) return `Your hello landed ${A.when(land, now)}. The caretaker’s reply is on its way, home <b>${A.when(back, now)}</b>.`;
    const s = A.sky(land + 3 * A.MINUTE);
    const what = s.sunUp ? `The Sun is ${Math.round(s.sunAlt)}° up` : 'The Sun is down';
    return `Her reply came in ${A.when(back, now)}: “Hello from Triton. ${what}, and Neptune is ${pct(s.lit)} lit.”`;
  }

  // ---- the board ------------------------------------------------------------------
  update(simMs) {
    const real = this.api.realNow();
    const now = this.api.isLapse() ? simMs : real;
    const { lt, arrive, home } = A.delayLines(now);
    $('ltSpan').textContent = A.span(lt.ms);
    $('ltAu').textContent = lt.au.toFixed(1);
    $('arrive').textContent = A.when(arrive, now);
    $('home').textContent = A.when(home, now);
    // the strip: checkpoints in flight towards Earth
    const msgs = messagesInFlight(simMs + (this.api.isEarth() ? lt.ms : 0), lt.ms);
    const strip = $('flight');
    let html = '';
    for (const m of msgs) {
      const hall = HALLS[m.hall];
      const x = (1 - m.f) * 100;
      html += `<i class="msg" style="left:${x.toFixed(2)}%;background:${hall.colour}" title="${esc(hall.name)}: sent ${A.clock(m.sent)}, lands ${A.clock(m.sent + lt.ms)}"></i>`;
    }
    if (this.hello) {
      const h = this.hello, land = h.sent + A.lightTime(h.sent).ms, back = land + 3 * A.MINUTE + A.lightTime(land).ms;
      if (now < land) html += `<i class="msg hello" style="left:${((now - h.sent) / (land - h.sent) * 100).toFixed(2)}%" title="Your hello"></i>`;
      else if (now > land + 3 * A.MINUTE && now < back) html += `<i class="msg hello" style="left:${((1 - (now - land - 3 * A.MINUTE) / (back - land - 3 * A.MINUTE)) * 100).toFixed(2)}%" title="The reply"></i>`;
    }
    strip.innerHTML = html;
    $('flightCount').textContent = msgs.length === 0 ? 'nothing on its way home right now' : msgs.length === 1 ? 'one message on its way home' : msgs.length + ' messages on their way home';
    $('helloLine').innerHTML = this.helloLine(now);
    $('helloBtn').hidden = !!(this.hello && now < this.hello.sent + 9 * A.HOUR);
    // halls
    for (let i = 0; i < 4; i++) {
      const j = jobAt(i, simMs);
      $('hj' + i).textContent = j.running ? j.title : (j.archive ? 'Archive, resting' : 'Between jobs');
      $('hp' + i).textContent = j.running ? pct(j.progress) : '';
      $('hb' + i).style.width = (j.running ? j.progress * 100 : 0).toFixed(1) + '%';
    }
    // the sky
    const s = A.sky(simMs);
    let sun;
    if (s.sunUp) { const set = A.nextSunEvent(simMs, -1); sun = `Sun ${Math.round(s.sunAlt)}° up, sets ${set ? A.when(set, simMs) : 'later'}`; }
    else { const rise = A.nextSunEvent(simMs, 1); sun = `Sun down, rises ${rise ? A.when(rise, simMs) : 'later'}`; }
    $('skyLine').textContent = `${sun} · Neptune ${pct(s.lit)} lit, ${s.waxing ? 'filling' : 'thinning'}`;
    // modes
    if (this.api.isLapse()) $('lapseText').textContent = `Time-lapse · ${A.span(simMs - real)} ahead`;
    if (this.api.isEarth()) $('earthText').textContent = `As Earth sees it: this light left Triton at ${A.clock(simMs)}.`;
    if (this.sel) this.fillCard(this.sel, simMs);
  }

  // ---- cards ------------------------------------------------------------------------
  showCard(sel) {
    this.sel = sel;
    document.body.classList.toggle('card-open', !!sel);
    if (sel) { this.fillCard(sel, this.api.simNow()); this.card.focus({ preventScroll: true }); }
  }
  fillCard(sel, simMs) {
    const real = this.api.realNow();
    const now = this.api.isLapse() ? simMs : real;
    const lt = A.lightTime(now);
    let h = '';
    if (sel.kind === 'hall') {
      const hall = HALLS[sel.i], j = jobAt(sel.i, simMs);
      h += `<p class="kicker"><i style="background:${hall.colour}"></i>Hall ${hall.n} · ${esc(hall.name)}</p>`;
      h += `<h2>${esc(j.title)}</h2><p>${esc(j.line)}</p>`;
      if (j.archive) {
        h += `<div class="meter"><b style="width:${(j.progress * 100).toFixed(1)}%"></b></div>`;
        const next = simMs < j.start ? j.start : j.start + A.DAY;
        h += `<p class="facts">${j.running ? `Taking in today’s copy: ${pct(j.progress)}. Done ${A.when(j.end, now)}.` : `Resting. The next night’s copy starts arriving ${A.when(next, now)}.`}</p>`;
        h += `<p class="facts">Storage at rest barely warms, so this hall has only three small fins on its roof.</p>`;
      } else if (j.running) {
        const day = Math.floor((simMs - j.start) / A.DAY) + 1, days = Math.round((j.end - j.start) / A.DAY);
        h += `<div class="meter"><b style="width:${(j.progress * 100).toFixed(1)}%"></b></div>`;
        h += `<p class="facts"><b>${pct(j.progress)}</b> · day ${day} of about ${days}. Started ${A.date(j.start)}, done around ${A.date(j.end)}.</p>`;
        if (j.lastCheckpoint) {
          const lands = j.lastCheckpoint + lt.ms;
          const inFlight = lands > simMs + (this.api.isEarth() ? lt.ms : 0);
          h += `<p class="facts">Its last ${esc(j.unit)} left Triton ${A.when(j.lastCheckpoint, now)}. ${inFlight ? `It’s still on its way, and reaches Earth <b>${A.when(lands, now)}</b>.` : `It reached Earth ${A.when(lands, now)}.`}</p>`;
        }
        if (j.nextCheckpoint) h += `<p class="facts">The next one leaves ${A.when(j.nextCheckpoint, now)}.</p>`;
      } else {
        h += `<p class="facts">Between jobs. The next one starts ${A.when(j.end + j.gap, now)}.</p>`;
      }
      h += `<p class="named"><span>The name</span>${esc(hall.named)}</p>`;
    } else if (sel.kind === 'reactor') {
      h += `<p class="kicker">Power</p><h2>The reactor</h2>`;
      h += `<p>Sunlight here is about 1/900 of what Earth gets. Solar panels the size of a small town would barely run one hall. So this is a fission plant: NASA has ground-tested small space reactors (Kilopower, 2018), and this is that idea scaled up a long way.</p>`;
      h += `<p>Fusion would suit Triton better, since its ice holds deuterium. Nobody can build that yet.</p>`;
      h += `<p class="facts">The petals are its own radiators. Turning heat into electricity throws most of the heat away, and out here it can only go as light.</p>`;
    } else if (sel.kind === 'dish') {
      const s = A.sky(simMs);
      const rise = !s.sunUp ? A.nextSunEvent(simMs, 1) : null;
      h += `<p class="kicker">Talking to Earth</p><h2>The dish</h2>`;
      h += `<p>From Neptune, Earth never strays more than 2° from the Sun. So the dish pointed home is pointed, almost, at the Sun.</p>`;
      h += `<p class="facts">Earth is <b>${lt.au.toFixed(1)} AU</b> away today: <b>${A.span(lt.ms)}</b> of light each way.</p>`;
      h += s.sunUp ? `<p class="facts">The Sun is ${Math.round(s.sunAlt)}° up, so Earth is too. The dish is tracking it.</p>`
        : `<p class="facts">The Sun has set, and Earth with it. The dish is parked. Messages would go through a relay in orbit, or wait until Earth rises ${A.when(rise, now)}.</p>`;
    } else if (sel.kind === 'cabin' || sel.kind === 'person') {
      const c = this.api.caretaker();
      const doing = !c || !c.visible ? 'She’s inside the cabin.' : c.sitting ? 'She’s on the bench, looking at Neptune.' : c.looking ? 'She’s stopped to look at something.' : 'She’s doing her rounds.';
      h += `<p class="kicker">The one person here</p><h2>The caretaker</h2>`;
      h += `<p>Machines break, even very good ones. Someone has to walk the rounds, look in at the halls, check the dish and replace what fails.</p>`;
      h += `<p class="facts">${doing}</p>`;
      h += `<p class="facts">Her bench faces Neptune. Triton keeps one face to its planet, so from here Neptune never moves. It only fills and thins, every 5.9 days.</p>`;
    } else if (sel.kind === 'geyser') {
      h += `<p class="kicker">Not ours</p><h2>A geyser</h2>`;
      h += `<p>Voyager 2 saw plumes like this in 1989: dark columns rising about 8 km, then trailing more than 100 km downwind and laying dark streaks on the frost.</p>`;
      h += `<p>The usual explanation is sunlight warming nitrogen ice from underneath until gas breaks through. This one is drawn much smaller than the real thing.</p>`;
    }
    $('cardBody').innerHTML = h;
  }
}

// The intro page: a still from the real renderer, the light-delay line, and Enter.
// No renderer loads until the visitor chooses to go.
import { delayLines, when } from './astro.js';
import { openDialog, closeDialog } from './dialog.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const fixed = params.get('date') ? Date.parse(params.get('date')) : null;

function tick() {
  const now = fixed ?? Date.now();
  const d = delayLines(now);
  $('introArrive').textContent = when(d.arrive, now);
  $('introHome').textContent = when(d.home, now);
}
tick();
setInterval(tick, 15000);

let entering = false;
async function enter() {
  if (entering) return;
  entering = true;
  document.body.classList.add('entering');
  $('enter').disabled = true;
  try {
    const app = await import('./app.js');
    await app.start();
  } catch (e) {
    console.error(e);
    document.body.classList.add('failed');
    $('boot').classList.add('show');
    $('bootTitle').textContent = 'The window wouldn’t open.';
    $('bootText').textContent = 'Something went wrong while loading: ' + e.message;
    $('failActions').hidden = false;
    window.__ready = true; window.__error = String(e);
  }
}
$('enter').addEventListener('click', enter);
$('introNotes').addEventListener('click', () => openDialog('notes'));
$('failNotes').addEventListener('click', () => openDialog('notes'));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeDialog));
document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeDialog(); }));
addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.overlay.open')) closeDialog(); });
if (params.get('notes') === '1') openDialog('notes');
if (params.get('board') === '1') document.body.classList.add('board-open');
if (params.get('enter') === '1') enter();
else window.__ready = true;

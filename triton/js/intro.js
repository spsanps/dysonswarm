// The front page: a still from the real renderer, the light-delay line, and the notes.
// The renderer loads only when the visitor presses Enter.
import { lightTime, span } from './astro.js';

const $ = id => document.getElementById(id);
const lt = lightTime(Date.now());
$('introDelay').textContent = `Today Triton is ${span(lt.ms)} from Earth by light.`;

let opener = null;
function openNotes() { opener = document.activeElement; $('notes').classList.add('open'); $('notes').querySelector('.close').focus(); }
function closeAll() { document.querySelectorAll('.overlay.open').forEach(el => el.classList.remove('open')); if (opener && opener.focus) opener.focus(); }
$('introNotes').addEventListener('click', openNotes);
$('failNotes').addEventListener('click', openNotes);
document.querySelectorAll('[data-open-notes]').forEach(b => b.addEventListener('click', openNotes));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAll));
document.querySelectorAll('.overlay').forEach(el => el.addEventListener('pointerdown', e => { if (e.target === el) closeAll(); }));
addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

let entered = false;
async function enter() {
  if (entered) return;
  entered = true;
  document.body.classList.add('entered');
  try {
    const app = await import('./app.js');
    await app.start();
  } catch (e) {
    console.error(e);
    document.body.classList.add('failed');
    $('bootTitle').textContent = 'Triton can’t open here.';
    $('bootText').textContent = 'The 3D part didn’t load. The notes still work.';
    $('failActions').hidden = false;
    window.__ready = true;
  }
}
$('enter').addEventListener('click', enter);
if (new URLSearchParams(location.search).has('enter')) enter();
else window.__ready = true;

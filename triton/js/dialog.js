// Opening and closing the notes. Tiny, so the intro page can use it without the renderer.
let lastFocus = null;
export function openDialog(id) {
  lastFocus = document.activeElement;
  const o = document.getElementById(id);
  o.classList.add('open');
  const c = o.querySelector('[data-close]');
  if (c) c.focus();
}
export function closeDialog() {
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

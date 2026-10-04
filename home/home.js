// Dyson Swarm homepage. Optional: the page reads and works without it (each place then shows a
// still print). Where the <head> script chose the live trip, start it (home/trip/trip.js); if it
// cannot run, fall back to the stills.
//
// Review aids: ?t=<seconds> freezes the moving things at that moment; ?still shows the stills
// layout. window.__ready is set once the first place is showing live (or the stills are up), and
// window.__trip.idle() resolves when the plates around the camera are printed.
const html = document.documentElement;
const q = new URLSearchParams(location.search), fixedT = q.has('t') ? Number(q.get('t')) || 0 : null;
const root = document.querySelector('[data-trip]');
const ready = () => { window.__ready = true; };
const fallback = () => { html.classList.remove('trip-live'); document.body.classList.remove('is-past'); ready(); };

if (root && html.classList.contains('trip-live')) {
  import('./trip/trip.js')
    .then(m => m.startTrip(root, { fixedT, onReady: ready, onFail: fallback }))
    .catch(e => { console.warn(e); fallback(); });
} else if (document.readyState === 'complete') ready();
else window.addEventListener('load', ready, { once: true });

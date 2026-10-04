// What the halls are doing. Made up, but on real clocks: every job has a start time,
// a length and checkpoints, all worked out from the date, so everyone who visits at
// the same moment sees the same thing.
import { HOUR, DAY } from './astro.js';

export const HALLS = [
  { key: 'leverrier', name: 'Le Verrier', n: 1, colour: '#c8674a',
    named: 'Urbain Le Verrier worked out where Neptune had to be, using only arithmetic and Uranus’s wobble, in 1846.' },
  { key: 'adams', name: 'Adams', n: 2, colour: '#d39a3e',
    named: 'John Couch Adams did the same sum in Cambridge, at the same time, and nobody looked.' },
  { key: 'galle', name: 'Galle', n: 3, colour: '#7f9c74',
    named: 'Johann Galle pointed Berlin’s telescope where Le Verrier said, and found Neptune within a degree on 23 September 1846.' },
  { key: 'lassell', name: 'Lassell', n: 4, colour: '#8d7bb0',
    named: 'William Lassell, a brewer who ground his own telescope mirrors, found Triton seventeen days later.' },
];

// Long jobs only. Nothing here needs an answer within the hour.
const POOL = [
  { title: 'Training a language model', line: 'A big one. It reads for weeks and says nothing until it’s done.', days: [34, 58], every: 6, unit: 'checkpoint' },
  { title: 'Teaching robot hands', line: 'Ten thousand simulated hands practise picking things up. Years of practice, played fast.', days: [12, 24], every: 4, unit: 'policy snapshot' },
  { title: 'A climate ensemble', line: 'Five hundred versions of Earth’s next century, each nudged a little.', days: [20, 36], every: 8, unit: 'batch of results' },
  { title: 'Folding proteins', line: 'Searching the shapes of proteins nobody has made yet.', days: [8, 16], every: 3, unit: 'set of structures' },
  { title: 'Neptune’s weather', line: 'A model of the planet outside the window. The data is right here.', days: [12, 20], every: 5, unit: 'forecast' },
  { title: 'Galaxies forming', line: 'A small universe, a few million years every hour.', days: [26, 44], every: 12, unit: 'snapshot' },
  { title: 'Checking a proof', line: 'Every step of a very long proof, checked by machine.', days: [4, 9], every: 6, unit: 'progress report' },
  { title: 'Rereading telescope archives', line: 'Old radio surveys from Earth, searched again for anything we missed.', days: [10, 18], every: 6, unit: 'list of candidates' },
  { title: 'Rendering a film', line: 'Frame by frame, slowly, the way films used to be made.', days: [6, 11], every: 4, unit: 'reel' },
];
// Which pool entries each hall prefers (the archive hall has its own job).
const PREFS = [[0, 1, 0, 5, 1, 0], [2, 4, 3, 2, 6, 4], [1, 3, 8, 7, 1, 3]];

function rng(a, b) {
  let t = (Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 7, 0x85EBCA77)) >>> 0;
  return () => { t = (t + 0x6D2B79F5) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

const EPOCH = Date.UTC(2026, 0, 1);
const cache = new Map();

/** The job running in hall `h` at time `ms` (and the next one). */
export function jobAt(h, ms) {
  if (h === 3) return archiveJob(ms);
  // Walk forward from the epoch. Jobs are days to weeks long, so this is a short loop;
  // cache the last position per hall so frames don't repeat it.
  let c = cache.get(h);
  if (!c || c.start > ms) {
    const r = rng(h, 0);
    c = { k: 0, start: EPOCH - r() * 30 * DAY };
  }
  for (;;) {
    const job = describe(h, c.k, c.start);
    if (ms < job.end + job.gap) { cache.set(h, c); return finish(job, ms); }
    c = { k: c.k + 1, start: job.end + job.gap };
  }
}
function describe(h, k, start) {
  const r = rng(h, k + 1);
  const pick = PREFS[h][Math.floor(r() * PREFS[h].length)];
  const p = POOL[pick];
  const days = p.days[0] + (p.days[1] - p.days[0]) * r();
  // Start on a round minute so the times read nicely.
  start = Math.round(start / 6e4) * 6e4;
  const end = start + days * DAY;
  return { hall: h, k, ...p, start, end, gap: (2 + r() * 6) * HOUR };
}
function finish(job, ms) {
  const running = ms >= job.start && ms < job.end;
  const progress = Math.max(0, Math.min(1, (ms - job.start) / (job.end - job.start)));
  const every = job.every * HOUR;
  const n = Math.floor((Math.min(ms, job.end) - job.start) / every);
  const lastCheckpoint = n >= 1 ? job.start + n * every : null;
  const nextCheckpoint = running ? job.start + (n + 1) * every : null;
  return { ...job, running, progress, lastCheckpoint, nextCheckpoint, number: n,
    state: running ? 'running' : 'between jobs' };
}
function archiveJob(ms) {
  // Every night (by UTC on Earth) the day's new writing is sent out to be kept here.
  // It takes about nine hours to arrive in full and be checked.
  const day = Math.floor(ms / DAY) * DAY;
  const start = day + 2 * HOUR, end = start + 9 * HOUR;
  const running = ms >= start && ms < end;
  const progress = running ? (ms - start) / (end - start) : (ms >= end ? 1 : 0);
  return { hall: 3, title: 'Keeping the archive', unit: 'night’s copy',
    line: 'A copy of our libraries, kept four light-hours from home. Each night, the new day’s writing arrives and is checked.',
    start, end, running, progress, every: 24, lastCheckpoint: ms >= end ? end : end - DAY, nextCheckpoint: ms < end ? end : end + DAY,
    state: running ? 'taking in today’s copy' : 'resting', archive: true };
}

/** Recent checkpoint messages from every hall, for the light-delay strip. */
export function messagesInFlight(ms, delayMs) {
  const out = [];
  // The archive hall sends one receipt home when each night's copy is checked.
  for (let d = -1; d <= 0; d++) {
    const end = Math.floor(ms / DAY) * DAY + d * DAY + 11 * HOUR;
    if (end > ms - delayMs && end <= ms) out.push({ hall: 3, sent: end, f: (ms - end) / delayMs });
  }
  for (let h = 0; h < 3; h++) {
    // Look back far enough to catch anything still travelling.
    const seen = new Set();
    for (const t of [ms, ms - delayMs * 0.5, ms - delayMs]) {
      const j = jobAt(h, t);
      const every = j.every * HOUR;
      for (let c = j.start + every; c <= Math.min(ms, j.end); c += every) {
        if (c > ms - delayMs && c <= ms && !seen.has(c)) { seen.add(c); out.push({ hall: h, sent: c, f: (ms - c) / delayMs }); }
      }
    }
  }
  return out;
}

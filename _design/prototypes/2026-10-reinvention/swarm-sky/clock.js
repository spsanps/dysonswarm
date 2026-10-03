/* The swarm's clock. Everything on the page comes from these functions and the
   real date, so every visitor at the same minute sees the same swarm.

   The rule, in words:
   - Construction started at midnight Pacific on Sunday 6 September 2026, the day
     the collection launched on dysonswarm.com.
   - One ring of collectors goes up each day (Pacific calendar days). Ring 1 was
     6 September, ring 2 was 7 September, and so on.
   - Launchers on Mercury each place 10 collectors an hour, one at a time.
     There was one launcher on day one, and a new one starts every Sunday.
   - So a ring holds 240 collectors per launcher, placed evenly through its day,
     and it fills around its orbit in the order they were placed.
   It is a fiction kept by the clock, not a claim about anything in space. */

(function (root) {
  'use strict';
  const HOUR = 3600000, DAY = 86400000;
  const PER_LAUNCHER_HOUR = 10;
  const EPOCH_Y = 2026, EPOCH_M = 9, EPOCH_D = 6; // Pacific calendar date
  const SKETCH_MS = Date.UTC(2026, 0, 7, 6, 2, 16); // 6 Jan 2026 22:02 PST, first swarm commit

  /* ---------------------------------------------------------- Pacific time */
  // US rule since 2007: DST from the second Sunday in March, 2:00 local,
  // to the first Sunday in November, 2:00 local.
  function nthSunday(y, m, n) { // m 1..12, returns day of month
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (n - 1);
  }
  function pacificOffset(ms) { // hours to add to UTC
    const y = new Date(ms).getUTCFullYear();
    const start = Date.UTC(y, 2, nthSunday(y, 3, 2), 10); // 2:00 PST = 10:00 UTC
    const end = Date.UTC(y, 10, nthSunday(y, 11, 1), 9);  // 2:00 PDT = 09:00 UTC
    return (ms >= start && ms < end) ? -7 : -8;
  }
  function pacificMidnight(y, m, d) { // UTC ms of 00:00 Pacific on that date
    const guess = Date.UTC(y, m - 1, d, 8);
    const off = pacificOffset(guess);
    return Date.UTC(y, m - 1, d) - off * HOUR;
  }
  function pacificParts(ms) {
    const t = new Date(ms + pacificOffset(ms) * HOUR);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
      hh: t.getUTCHours(), mm: t.getUTCMinutes(), ss: t.getUTCSeconds(), wd: t.getUTCDay() };
  }
  const EPOCH_MS = pacificMidnight(EPOCH_Y, EPOCH_M, EPOCH_D);
  const EPOCH_DAYNUM = Date.UTC(EPOCH_Y, EPOCH_M - 1, EPOCH_D) / DAY;

  function dayIndex(ms) { // 1 on 6 Sep 2026; 0 or less before
    const p = pacificParts(ms);
    return Date.UTC(p.y, p.m - 1, p.d) / DAY - EPOCH_DAYNUM + 1;
  }
  function dayDate(k) { // Pacific calendar date of day k
    const t = new Date((EPOCH_DAYNUM + k - 1) * DAY);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
  }
  function dayStart(k) { const c = dayDate(k); return pacificMidnight(c.y, c.m, c.d); }
  function dayEnd(k) { return dayStart(k + 1); }

  /* ------------------------------------------------------------ the rule */
  function launchers(k) { return k < 1 ? 0 : 1 + Math.floor((k - 1) / 7); }
  function ringSize(k) { return 24 * PER_LAUNCHER_HOUR * launchers(k); }
  function placedInRing(k, ms) {
    if (k < 1) return 0;
    const s = dayStart(k), e = dayEnd(k);
    if (ms <= s) return 0;
    if (ms >= e) return ringSize(k);
    return Math.floor(ringSize(k) * (ms - s) / (e - s));
  }
  function totalPlaced(ms) {
    const k = dayIndex(ms);
    if (k < 1) return 0;
    // full rings before today: sum over weeks
    let total = 0;
    const full = k - 1;
    const weeks = Math.floor(full / 7), rem = full % 7;
    const perWeekDay = 24 * PER_LAUNCHER_HOUR;
    total += 7 * perWeekDay * (weeks * (weeks + 1) / 2);
    total += rem * perWeekDay * (weeks + 1);
    return total + placedInRing(k, ms);
  }
  // time the n-th collector (0-based) of ring k is placed
  function placementTime(k, n) {
    const s = dayStart(k), e = dayEnd(k);
    return s + (e - s) * (n + 1) / ringSize(k);
  }
  function nextPlacement(ms) {
    const k = dayIndex(ms);
    if (k < 1) return dayStart(1);
    const n = placedInRing(k, ms);
    return n >= ringSize(k) ? dayStart(k + 1) : placementTime(k, n);
  }

  /* ------------------------------------------------- deterministic noise */
  function hash32(a, b = 0) {
    let h = (a | 0) * 374761393 + (b | 0) * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return h >>> 0;
  }
  function rng(seed) { // mulberry32
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const frac = x => x - Math.floor(x);

  /* ------------------------------------------------- ring geometry (3D)
     Units: solar radii from the Sun's centre. Orbits are circles.
     Rings are laid in courses, like growth rings: within a course each day's
     ring goes about 5% further out than the day before, so you can count the
     days. After 30 rings the course is full and the next one starts
     back near the Sun in a new orbital plane, so over months the courses
     weave into a shell. */
  const COURSE = 30;
  const COURSE_INC = [0, 58, 31, 77, 46, 66, 19, 86, 38, 54, 71, 26]; // degrees from the ecliptic pole
  // The plate camera sits 30 degrees above the planets' plane. Courses are
  // laid in planes it sees open, never edge-on (an edge-on course of thirty
  // rings would print as one black bar through the Sun).
  const CAMERA = [0.6824, 0.5332, 0.5];
  const courseCache = [];
  function courseNormal(c) {
    if (courseCache[c]) return courseCache[c];
    let n;
    if (c === 0) n = norm([0.295, 0.077, 0.953]); // near the planets' plane, the first course
    else {
      let inc = (COURSE_INC[c % COURSE_INC.length] + 3 * Math.floor(c / COURSE_INC.length)) * Math.PI / 180;
      let node = (0.4 + c * 2.39996) % (2 * Math.PI);  // golden angle
      for (let tries = 0; tries < 24; tries++) {
        n = norm([Math.sin(inc) * Math.sin(node), -Math.sin(inc) * Math.cos(node), Math.cos(inc)]);
        const open = Math.abs(n[0] * CAMERA[0] + n[1] * CAMERA[1] + n[2] * CAMERA[2]);
        if (open >= 0.38) break;
        node += 0.37; inc *= 0.93;
      }
    }
    courseCache[c] = n;
    return n;
  }
  function ringGeometry(k) {
    const r = rng(hash32(k, 77));
    const c = Math.floor((k - 1) / COURSE), j = (k - 1) % COURSE;
    const radius = 3.4 * Math.pow(1.052, j) * (1 + (c % 3) * 0.012) + (r() - 0.5) * 0.05;
    // each ring sits a couple of degrees off its course's plane
    const base = courseNormal(c);
    let t1 = cross(base, Math.abs(base[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]); t1 = norm(t1);
    const t2 = cross(base, t1);
    const wob = 0.035 + 0.02 * r(), ph = 2 * Math.PI * (j * 0.618 + r() * 0.15);
    const n = norm([base[0] + wob * (Math.cos(ph) * t1[0] + Math.sin(ph) * t2[0]),
      base[1] + wob * (Math.cos(ph) * t1[1] + Math.sin(ph) * t2[1]),
      base[2] + wob * (Math.cos(ph) * t1[2] + Math.sin(ph) * t2[2])]);
    let a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let e1 = cross(n, a); e1 = norm(e1);
    const e2 = cross(n, e1);
    return {
      k, course: c, index: j, radius, n, e1, e2,
      start: 2 * Math.PI * r(),        // where placement began
      dir: n[2] >= 0 ? 1 : -1,         // prograde, like everything else round the Sun
      width: 0.006 + r() * 0.01,       // radial scatter (fraction)
      seed: hash32(k, 991)
    };
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  // Mercury and Another Sky move on real-ish periods (88 days, one year).
  function mercury(ms) {
    const ang = 2 * Math.PI * ((ms - EPOCH_MS) / (87.969 * DAY)) + 2.1;
    const inc = 7 * Math.PI / 180;
    const rad = 15.2;
    return { x: rad * Math.cos(ang), y: rad * Math.sin(ang) * Math.cos(inc), z: rad * Math.sin(ang) * Math.sin(inc), ang, rad };
  }
  function anotherSky(ms) {
    const ang = 2 * Math.PI * ((ms - EPOCH_MS) / (365.25 * DAY)) + 4.0;
    const inc = 3 * Math.PI / 180;
    const rad = 17.6;
    return { x: rad * Math.cos(ang), y: rad * Math.sin(ang) * Math.cos(inc), z: rad * Math.sin(ang) * Math.sin(inc), ang, rad };
  }

  /* ----------------------------------------------------------- the log */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = n => String(n).padStart(2, '0');
  const fmtNum = n => n.toLocaleString('en-US');
  function fmtDate(c) { return `${c.d} ${MONTHS[c.m - 1]} ${c.y}`; }
  function fmtDateLong(c) { return `${WEEKDAYS[c.wd]} ${c.d} ${MONTHS_LONG[c.m - 1]} ${c.y}`; }
  function fmtTime(ms) { const p = pacificParts(ms); return `${pad(p.hh)}:${pad(p.mm)}`; }

  // Entries for plate k as seen at time `now` (newest first).
  function logFor(k, now) {
    const out = [];
    if (k < 1) return out;
    const s = dayStart(k), e = dayEnd(k);
    const end = Math.min(now, e);
    const size = ringSize(k);
    const date = dayDate(k);
    const L = launchers(k);
    const hours = Math.round((e - s) / HOUR);
    for (let h = 0; h < hours; h++) {
      const hs = s + h * HOUR;
      if (hs >= end) break;
      const he = Math.min(s + (h + 1) * HOUR, e);
      const a = placedInRing(k, hs), b = placedInRing(k, Math.min(he, end));
      const live = end < he;
      const pct = Math.floor(100 * b / size);
      out.push({ t: hs, time: fmtTime(hs), kind: 'batch', live, ring: k, placed: b - a, pct,
        text: live ? `${fmtNum(b - a)} placed so far` : `${fmtNum(b - a)} placed`,
        note: b >= size ? 'ring closed' : `ring ${pct}% round` });
    }
    // milestones
    if (k === 1) {
      out.push({ t: s - 1, time: fmtTime(s), kind: 'event', text: 'Plate 1. Construction starts. One launcher on Mercury.', link: 'swarm' });
      out.push({ t: s - 2, time: fmtTime(s), kind: 'event', text: 'Another Sky, an O’Neill cylinder, already in orbit.', link: 'sky' });
    } else if (date.wd === 0) {
      out.push({ t: s - 1, time: fmtTime(s), kind: 'event', text: `Sunday. Launcher ${L} starts on Mercury: ${fmtNum(size)} collectors for this ring.`, link: 'swarm' });
    }
    if (now >= e) {
      out.unshift({ t: e - 1, time: fmtTime(e - 60000), kind: 'event', text: `Ring ${k} closed with ${fmtNum(size)} collectors.` });
    }
    out.sort((p, q) => q.t - p.t);
    return out;
  }

  function summary(k, now) {
    const at = Math.min(now, dayEnd(k) - 1);
    return {
      k, date: dayDate(k), rings: Math.max(0, Math.min(k, dayIndex(at))),
      total: totalPlaced(at), ringPlaced: placedInRing(k, at), ringSize: ringSize(k),
      launchers: launchers(k), live: now < dayEnd(k)
    };
  }

  root.SwarmClock = {
    HOUR, DAY, EPOCH_MS, SKETCH_MS, PER_LAUNCHER_HOUR,
    pacificOffset, pacificParts, dayIndex, dayDate, dayStart, dayEnd,
    launchers, ringSize, placedInRing, totalPlaced, placementTime, nextPlacement,
    ringGeometry, COURSE, mercury, anotherSky, logFor, summary,
    hash32, rng, fmtNum, fmtDate, fmtDateLong, fmtTime, MONTHS, MONTHS_LONG
  };
})(typeof window !== 'undefined' ? window : globalThis);

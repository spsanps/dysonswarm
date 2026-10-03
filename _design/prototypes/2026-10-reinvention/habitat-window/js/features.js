/*
 * Things in Another Sky that a painter would draw as shapes rather than washes:
 * the light spine, the end wall, the transit rings and their trains, the
 * luminaire lines, the Longwater Bridge, the Meridian buildings, the trees on
 * the overlook hill, the trail, the sailboats and every lamp. All positions come
 * from the explorer's geometry; buildings, trees and boats follow its placement
 * rules with a per-cell seed so only what is in view is generated.
 *
 * Output is in the window's CSS pixels (camera space), sorted far to near.
 */
(function (G) {
'use strict';
const Wd = G.World, { R, HALF, CIRC, TAU, clamp, smooth, wrap, deltaS, hash, terrain, urban, lakeField, pos, upAt, tangentAt, RING_Z, RING_R, HOOP_R, BRIDGES, bridgeH, LUMINAIRE_S, LUMINAIRE_Z, AXIAL_COLLARS, TRAIL, FRAME_TREES, LAKES } = Wd;
const { sub, add, mul, dot, cross, norm } = G.View.vec;

function cellRng(a, b, salt) { return Wd.rng((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) | 0); }

// Visibility against the ray buffer: is a world point in front of the land?
function makeVisibility(cam, B) {
  return (p, slack = 0) => {
    const q = cam.project(p); if (q[2] <= 1) return null;
    const gx = Math.floor(q[0] / cam.w * B.gw), gy = Math.floor(q[1] / cam.h * B.gh);
    if (gx < 0 || gy < 0 || gx >= B.gw || gy >= B.gh) return null;
    const d = cam.dist(p), t = B.t[gy * B.gw + gx];
    if (d > t * 1.015 + 25 + slack) return null;
    return q;
  };
}

// Project a 3D polyline, splitting it where it leaves the front of the camera.
function projectPolyline(cam, pts) {
  const runs = []; let run = [];
  for (const p of pts) { const q = cam.project(p); if (q[2] > 5) run.push([q[0], q[1], q[2]]); else { if (run.length > 1) runs.push(run); run = []; } }
  if (run.length > 1) runs.push(run);
  return runs;
}
function circlePts(z, radius, n, a0 = 0, a1 = TAU) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([Math.sin(a) * radius, -Math.cos(a) * radius, z]); } return out; }

// A box standing on the cylinder at (s, z), base height h, size w (around), d (along), ht.
function boxCorners(s, z, h, w, d, ht) {
  const t = tangentAt(s), u = upAt(s), o = pos(s, z, h), c = [];
  for (const [a, b, e] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]])
    c.push(add(add(add(o, mul(t, a * w / 2)), [0, 0, b * d / 2]), mul(u, e * ht)));
  return { c, t, u, o };
}

function build(cam, B) {
  const visible = makeVisibility(cam, B), F = { solids: [], lines: {}, lamps: [], pencil: [] };
  const inView = (q, m = 40) => q && q[0] > -m && q[0] < cam.w + m && q[1] > -m && q[1] < cam.h + m;
  const eye = cam.eye;

  // ── The light spine along the axis, and its lamp collars ──────────────────
  {
    const pts = []; for (let z = -HALF + 100; z <= cam.z0 - 30; z += 400) pts.push([0, 0, z]);
    F.lines.spine = projectPolyline(cam, pts);
    F.collars = AXIAL_COLLARS.filter(z => z < cam.z0 - 200).map(z => ({ z, runs: projectPolyline(cam, circlePts(z, 95, 40)), q: cam.project([0, 0, z]) }));
  }
  // ── The far end wall: rim, rings, seams, hub and spokes ──────────────────
  {
    const z = -HALF;
    F.cap = { rim: projectPolyline(cam, circlePts(z, R, 220)), rings: [], seams: [], spokes: [], hub: projectPolyline(cam, circlePts(z + 45, 500, 60)), center: cam.project([0, 0, z]) };
    for (let k = 1; k < 12; k++) F.cap.rings.push(projectPolyline(cam, circlePts(z, R * k / 12, 160)));
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + .26; F.cap.seams.push(projectPolyline(cam, [[Math.sin(a) * 300, -Math.cos(a) * 300, z], [Math.sin(a) * R, -Math.cos(a) * R, z]])); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; F.cap.spokes.push(projectPolyline(cam, [[Math.sin(a) * 700, -Math.cos(a) * 700, z + 25], [Math.sin(a) * (R - 380), -Math.cos(a) * (R - 380), z + 25]])); }
    F.cap.rims = [60, 185, 370].map(off => projectPolyline(cam, circlePts(z + 60, R - off, 220)));
  }
  // ── Transit rings 1 km up, the hoops on the ground, the radial ties ───────
  F.rings = [];
  for (const z of RING_Z) {
    if (z > cam.z0 - 300) continue;
    const ring = { z, tube: [], light: [], hoop: [], ties: [] };
    // Only the arcs not hidden by land.
    const N = 720; let run = [];
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU, p = [Math.sin(a) * RING_R, -Math.cos(a) * RING_R, z], q = visible(p, 400);
      if (q) run.push([q[0], q[1], q[2], a]); else { if (run.length > 1) ring.tube.push(run); run = []; }
    }
    if (run.length > 1) ring.tube.push(run);
    ring.light = projectPolyline(cam, circlePts(z - 34, RING_R, 360));
    run = [];
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU, s = a * R, h = Math.max(.35, terrain(wrap(s), z)) + 30, p = pos(s, z, h), q = visible(p, 60);
      if (q) run.push([q[0], q[1], q[2]]); else { if (run.length > 1) ring.hoop.push(run); run = []; }
    }
    if (run.length > 1) ring.hoop.push(run);
    for (let i = 0; i < 18; i++) {
      const s = i / 18 * CIRC, a = pos(s, z, 110), b = pos(s, z, 1048), qa = cam.project(a), qb = cam.project(b);
      if (qa[2] > 5 && qb[2] > 5) ring.ties.push([[qa[0], qa[1], qa[2]], [qb[0], qb[1], qb[2]]]);
    }
    F.rings.push(ring);
  }
  // ── Luminaire lines: 1030 m fixtures, 125 m up ────────────────────────────
  F.luminaires = [];
  for (const s of LUMINAIRE_S) for (const z of LUMINAIRE_Z) {
    if (z - 515 > cam.z0) continue;
    const z1 = Math.min(z + 515, cam.z0 - 20), z0 = z - 515;
    const t = tangentAt(s), mid = pos(s, (z0 + z1) / 2, 125), q = visible(mid, 200);
    if (!q) continue;
    const quad = [pos(s - 27, z0, 125), pos(s + 27, z0, 125), pos(s + 27, z1, 125), pos(s - 27, z1, 125)].map(p => cam.project(p));
    if (quad.some(p => p[2] <= 5)) continue;
    F.luminaires.push({ s, z, quad, depth: q[2], d: cam.dist(mid) });
    F.lamps.push({ kind: 'lum', a: cam.project(pos(s, z0, 125)), b: cam.project(pos(s, z1, 125)), d: cam.dist(mid), on: 0, off: 99 });
  }
  // ── Bridges ───────────────────────────────────────────────────────────────
  F.bridges = [];
  for (const br of BRIDGES) {
    const steps = 132, ds = (br.s1 - br.s0) / steps, deck = [], rails = [[], []], towers = [], cables = [];
    for (let i = 0; i <= steps; i++) {
      const s = br.s0 + i * ds, h = bridgeH(br, s);
      const a = pos(s, br.z - br.width / 2, h), b = pos(s, br.z + br.width / 2, h), c = pos(s, br.z, h - 3.2);
      const qa = cam.project(a), qb = cam.project(b), qc = cam.project(c);
      if (qa[2] > 5 && qb[2] > 5) deck.push({ a: qa, b: qb, c: qc, d: cam.dist(c), vis: !!visible(c, 120) });
      if (i % 2 === 0) for (const sign of [-1, 1]) {
        const lp = pos(s, br.z + sign * (br.width / 2 - 3), h + 10.6), ql = visible(lp, 120);
        if (ql) F.lamps.push({ kind: 'bridge', q: ql, d: cam.dist(lp), on: 18.7 + hash(i, sign + 3) * 0.25, off: 99 });
      }
    }
    const tS = [br.s0 + 100, (br.s0 + br.s1) / 2 - (br.s1 - br.s0) * .21, (br.s0 + br.s1) / 2 + (br.s1 - br.s0) * .21, br.s1 - 100];
    tS.forEach((s, j) => {
      const dh = bridgeH(br, s), th = j === 0 || j === 3 ? 180 : 350;
      for (const sign of [-1, 1]) {
        const z = br.z + sign * (br.width / 2 - 2), bx = boxCorners(s, z, dh - 24, 15, 19, th + 48);
        const vis = visible(pos(s, z, dh + th * .5), 150);
        if (vis) towers.push({ corners: bx.c.map(p => cam.project(p)), d: cam.dist(pos(s, z, dh + th / 2)), s, z, top: dh + th });
      }
    });
    for (let j = 0; j < tS.length - 1; j++) {
      const a = tS[j], c = tS[j + 1], ha = bridgeH(br, a) + (j === 0 ? 180 : 350), hc = bridgeH(br, c) + (j === 2 ? 180 : 350);
      for (const sign of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 36; i++) { const t = i / 36, s = a + (c - a) * t, h = ha + (hc - ha) * t - Math.sin(Math.PI * t) * Math.min(230, (ha + hc) / 2 - bridgeH(br, s) - 24); pts.push(pos(s, br.z + sign * (br.width / 2 - 2), h)); }
        cables.push(...projectPolyline(cam, pts));
      }
    }
    if (deck.length) F.bridges.push({ br, deck, towers, cables, d: cam.dist(pos((br.s0 + br.s1) / 2, br.z, br.h)) });
  }
  // ── Buildings: the explorer's placement rule, per 160 m cell ──────────────
  F.buildings = [];
  const maxD = 9000;
  for (let iz = -174; iz < 174; iz++) {
    const z = (iz + .5) * 160; if (z > cam.z0 + 100 || cam.z0 - z > maxD) continue;
    for (let ix = -235; ix <= 235; ix++) {
      const s = (ix + .5) * 160, dsr = deltaS(s, cam.s0);
      if (Math.abs(dsr) > maxD) continue;
      const u = urban(s, z); if (u < 0.05) continue;
      const cq = cam.project(pos(s, z, 60)); if (!inView(cq, 60)) continue;
      const h = terrain(s, z); if (h < 11 || Math.abs(z) > HALF - 600) continue;
      if (Math.hypot(deltaS(s, 1550), z - 4250) < 430) continue;
      if (Math.hypot(s - 3040, z - 1580) < 130) continue;
      if (Math.abs(z - 1600) < 80 && s > -5800 && s < 2600) continue;
      const r = cellRng(ix, iz, 11), rr = (a, b) => a + (b - a) * r();
      const threshold = .045 + smooth(.19, .9, u) * .83; if (r() > threshold) continue;
      const multi = u > .45 && r() < .68 ? 2 : 1;
      for (let k = 0; k < multi; k++) {
        const bs = s + (multi === 2 ? (k - .5) * 66 : rr(-16, 16)), bz = z + rr(-12, 12), w = multi === 2 ? rr(26, 47) : rr(38, 77), d = rr(30, 83), base = terrain(bs, bz);
        if (base < 8) continue;
        let ht = rr(12, 39) + Math.pow(u, 1.7) * rr(12, 110); if (u > .76 && r() < .075) ht = rr(155, 340);
        const pad = Math.max(base, terrain(bs + w / 2, bz + d / 2), terrain(bs - w / 2, bz - d / 2));
        const mid = pos(bs, bz, pad + ht * .6), vq = visible(mid, 40) || visible(pos(bs, bz, pad + ht), 40);
        if (!vq) continue;
        F.buildings.push(makeBox(cam, bs, bz, pad, w, d, ht, r(), 'b'));
        // Windows that light up in the evening, more in the dense middle.
        const nl = Math.min(3, Math.floor(ht / 25) + (r() < .5 ? 1 : 0));
        for (let l = 0; l < nl; l++) {
          const fz = bz + d / 2 + 0.5, fs = bs + (r() - .5) * w * .8, fh = pad + 4 + r() * (ht - 6), lp = pos(fs, fz, fh), lq = cam.project(lp);
          if (lq[2] > 5) F.lamps.push({ kind: 'win', q: lq, d: cam.dist(lp), on: 18.55 + r() * 1.9 - u * .4, off: 22.2 + r() * 3.8 + (r() < .2 ? 9 : 0), warm: r() });
        }
      }
    }
  }
  // Meridian Waterfront: colonnade, terrace and the clock tower.
  { const s = 3040, z = 1580, h = terrain(s, z) + 2; F.buildings.push(makeBox(cam, s + 48, z + 15, h, 12, 12, 74, .5, 'tower')); F.buildings.push(makeBox(cam, s, z - 25, h + 22, 108, 12, 3, .2, 'b')); }

  // ── Trees: the overlook's deliberate trees and its grove ─────────────────
  F.trees = [];
  const addTree = (s, z, size, variant, seed, bush = false) => {
    const h = terrain(s, z); if (h < 1) return;
    const top = pos(s, z, h + size * .99), base = pos(s, z, h), mid = pos(s, z, h + size * .77);
    const qm = cam.project(mid); if (qm[2] < 4 || !inView(qm, 80)) return;
    const qb = visible(base, size * 2) || visible(mid, size * 2); if (!qb) return;
    const qt = cam.project(top), qbs = cam.project(base);
    const t = tangentAt(s), qr = cam.project(add(mid, mul(t, size * .26)));
    F.trees.push({ s, z, size, variant, seed, bush, d: cam.dist(mid), mid: qm, top: qt, base: qbs, rx: Math.abs(qr[0] - qm[0]), ry: Math.abs(qt[1] - qm[1]) * 1.05 });
  };
  for (const [s, z, size] of FRAME_TREES) addTree(s, z, size, 0, s);
  {
    const r = Wd.rng(4401);
    for (let i = 0; i < 1400; i++) {
      const s = 1550 + (r() - .5) * 1760 * 1.4, z = 4250 + (r() - .5) * 1800 * 1.6, h = terrain(s, z), size = 8 + r() * 13 + (i % 7 === 0 ? 10 : 0), variant = r() < .15 ? 1 : 0;
      if (h < 9 || Math.hypot(s - 1515, z - 4290) < 36 || urban(s, z) > .55) continue;
      let close = false; for (let k = 0; k < TRAIL.length; k += 2) if (Math.hypot(TRAIL[k][0] - s, TRAIL[k][1] - z) < 18) { close = true; break; }
      if (close) continue;
      if (Math.hypot(s - cam.s0, z - cam.z0) < 40) continue;
      if (r() < .55) continue;
      addTree(s, z, size, variant, i);
    }
    // The explorer's sparse woods (22,000 trees over the whole world); nearby ones only.
    for (let i = 0; i < 1300; i++) {
      const s = cam.s0 + (r() - .5) * 9000, z = cam.z0 - r() * 7000, h = terrain(s, z);
      if (h < 13 || urban(s, z) > .47) continue;
      addTree(s, z, 13 + r() * 20, r() < .24 ? 1 : 0, 9000 + i);
    }
  }
  // Street trees on the near boulevard.
  for (let i = 0; i < 70; i += 4) { const s = 3372 + 12, z = -1200 + i * 64; if (terrain(s, z) > 4) addTree(s, z, 14, 0, 7000 + i); }

  // ── The trail down from the overlook, and its lamps ──────────────────────
  F.trail = [];
  for (let i = 0; i < TRAIL.length; i++) {
    const [s, z] = TRAIL[i], prev = TRAIL[Math.max(0, i - 1)], next = TRAIL[Math.min(TRAIL.length - 1, i + 1)];
    const ds = next[0] - prev[0], dz = next[1] - prev[1], len = Math.hypot(ds, dz) || 1, wdt = 7.5;
    const a = [s - dz / len * wdt / 2, z + ds / len * wdt / 2], b = [s + dz / len * wdt / 2, z - ds / len * wdt / 2];
    const pa = pos(a[0], a[1], terrain(a[0], a[1]) + .4), pb = pos(b[0], b[1], terrain(b[0], b[1]) + .4);
    const qa = visible(pa, 8), qb = visible(pb, 8);
    F.trail.push(qa && qb ? [cam.project(pa), cam.project(pb)] : null);
  }
  for (let i = 0; i < TRAIL.length; i += 16) { const [s, z] = TRAIL[i], lp = pos(s + 6, z, terrain(s + 6, z) + 4.6), q = visible(lp, 5); if (q) F.lamps.push({ kind: 'trail', q, d: cam.dist(lp), on: 18.6 + i * .002, off: 99 }); }
  // Street lamps on the near boulevard (every 64 m).
  for (let i = 0; i < 70; i++) { const s = 3372, z = -1200 + i * 64, h = terrain(s, z); if (h > 4) { const lp = pos(s, z, h + 9), q = visible(lp, 10); if (q) F.lamps.push({ kind: 'street', q, d: cam.dist(lp), on: 18.6 + hash(i, 5) * .2, off: 99 }); } }

  // ── Sailboats on the lakes in view ───────────────────────────────────────
  F.boats = [];
  {
    const r = Wd.rng(19);
    for (let i = 0; i < 520; i++) {
      const l = LAKES[Math.floor(r() * LAKES.length)], s = l[0] + (r() - .5) * l[2] * 1.7, z = l[1] + (r() - .5) * l[3] * 1.6;
      if (terrain(s, z) > -10) continue;
      const sz = 7 + r() * 13, p = pos(s, z, 1), top = pos(s, z, sz * 1.1), q = visible(p, 10);
      if (!q || !inView(q, 0) || cam.dist(p) > 12000) continue;
      const qt = cam.project(top), t = tangentAt(s), qr = cam.project(add(p, mul(t, sz * .45)));
      F.boats.push({ q, top: qt, w: Math.abs(qr[0] - q[0]), d: cam.dist(p), copper: i % 6 === 0, seed: i });
    }
  }
  // ── Lamps in the far towns: the far shore at night ───────────────────────
  {
    const r = Wd.rng(733);
    let made = 0;
    for (let k = 0; k < 90000 && made < 4200; k++) {
      const c = Wd.CITY[Math.floor(r() * Wd.CITY.length)], a = r() * TAU, rad = Math.sqrt(r()) * c[2] * 1.5;
      let s = c[0] + Math.cos(a) * rad, z = c[1] + Math.sin(a) * rad;
      // On the streets: snap one coordinate to the 160 m block grid.
      if (r() < .5) s = Math.round(s / 160) * 160 + (r() - .5) * 8; else z = Math.round(z / 160) * 160 + (r() - .5) * 8;
      const u = urban(s, z) + (Wd.worldNoise(s, z, 900) - .5) * .7;
      if (r() > u * 1.1) continue;
      const h = terrain(s, z); if (h < 11) continue;
      const p = pos(s, z, h + 10 + r() * 40), d = cam.dist(p); if (d < 7000) continue;
      const q = visible(p, 200); if (!q || !inView(q, 0)) continue;
      F.lamps.push({ kind: 'far', q, d, on: 18.5 + r() * 2.1 - u * .35, off: 22 + r() * 4.5 + (r() < .3 ? 9 : 0), warm: r() });
      made++;
    }
  }
  // The six fixtures of the axial collars glow at night too.
  for (const c of F.collars) if (c.q[2] > 5) F.lamps.push({ kind: 'collar', q: c.q, d: cam.dist([0, 0, c.z]), on: 19.4, off: 99 });

  F.solids.push(...F.buildings);
  F.solids.sort((a, b) => b.d - a.d);
  F.trees.sort((a, b) => b.d - a.d);
  return F;
}

// A projected building with its visible faces classified for the washes.
function makeBox(cam, s, z, pad, w, d, ht, seed, kind) {
  const bx = boxCorners(s, z, pad, w, d, ht), q = bx.c.map(p => cam.project(p));
  const faces = [];
  const def = [
    { idx: [4, 5, 6, 7], n: bx.u, cls: 'roof' },
    { idx: [3, 2, 6, 7], n: [0, 0, 1], cls: 'front' },   // facing +z, toward the house
    { idx: [0, 1, 5, 4], n: [0, 0, -1], cls: 'back' },
    { idx: [1, 2, 6, 5], n: bx.t, cls: 'side+' },
    { idx: [0, 3, 7, 4], n: mul(bx.t, -1), cls: 'side-' }
  ];
  for (const f of def) {
    const cen = f.idx.reduce((acc, i) => add(acc, mul(bx.c[i], .25)), [0, 0, 0]);
    if (dot(f.n, sub(cam.eye, cen)) <= 0) continue;
    if (f.idx.some(i => q[i][2] <= 3)) continue;
    faces.push({ cls: f.cls, pts: f.idx.map(i => [q[i][0], q[i][1]]) });
  }
  return { kind, s, z, w, dep: d, ht, pad, seed, faces, d: cam.dist(pos(s, z, pad + ht / 2)), top: q[6], corners: q };
}

G.Features = { build, projectPolyline, circlePts, boxCorners };
})(typeof window !== 'undefined' ? window : globalThis);

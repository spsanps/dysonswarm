/*
 * The slow living things, drawn over the washes on two thin layers:
 *   glaze (multiplied, like a transparent wash): cloud shadow sides, the
 *     shower and its rain, trains by day
 *   lift (laid on top): cloud tops lifted back toward paper with a damp
 *     tissue, lamps and train windows at night, reserved and touched with yellow
 *
 * Clouds sit 1.5 to 3 km above their own ground and drift along the axis.
 * Each is lit on the side facing the spine and shaded on the side facing its
 * own ground, so the ones overhead show their bright tops and the near ones
 * their grey bellies. Rain falls outward, toward its own ground: overhead, up.
 * Trains run the transit rings at the explorer's speeds; where they are is a
 * function of the clock. Every lamp has its own hour to come on and go off.
 */
(function (G) {
'use strict';
const Wd = G.World, { R, HALF, CIRC, TAU, clamp, wrap, hash, pos, upAt, tangentAt, TRAINS, RING_R } = Wd;
const { rng } = G.Paper;

function create(o) {
  const { cam, B, F, frame, S, W, H, glaze, lift } = o;
  glaze.width = lift.width = W; glaze.height = lift.height = H;
  const gx = glaze.getContext('2d'), lx = lift.getContext('2d');
  const PAPER = 'rgb(246,241,231)';
  const panes = new Path2D();
  { const { mx, ty, bw, w, h } = frame; for (const [a, b, c, d] of [[0, 0, mx - bw / 2, ty - bw / 2], [mx + bw / 2, 0, w, ty - bw / 2], [0, ty + bw / 2, mx - bw / 2, h], [mx + bw / 2, ty + bw / 2, w, h]]) panes.rect(a * S, b * S, (c - a) * S, (d - b) * S); }
  const visibleAt = (p, slack) => {
    const q = cam.project(p); if (q[2] <= 5) return null;
    const ix = Math.floor(q[0] / cam.w * B.gw), iy = Math.floor(q[1] / cam.h * B.gh);
    if (ix < 0 || iy < 0 || ix >= B.gw || iy >= B.gh) return null;
    if (cam.dist(p) > B.t[iy * B.gw + ix] * 1.02 + slack) return null;
    return q;
  };

  // ── Clouds ───────────────────────────────────────────────────────────────
  const clouds = [];
  {
    const r = rng(2026);
    for (let i = 0; i < 115; i++) {
      const s = (r() - .5) * CIRC, z = (r() - .5) * (2 * HALF - 6000), h = 1550 + r() * 1350, size = 650 + r() * 1500;
      if (Math.hypot(Wd.deltaS(s, cam.s0), z - cam.z0) < 1800) continue;
      clouds.push({ s, z0: z, h, size, flat: .26 + r() * .22, v: 4 + r() * 4, seed: i, blobs: 3 + Math.floor(r() * 4), sprite: null, key: '' });
    }
  }
  const zMin = -HALF + 2500, zMax = HALF - 2500, zSpan = zMax - zMin;
  function cloudAt(c, t) {
    const z = zMin + ((((c.z0 - zMin) + c.v * t) % zSpan) + zSpan) % zSpan;
    const fade = Math.min(1, (z - zMin) / 2500, (zMax - z) / 2500);
    return { z, fade };
  }
  function softened(src, k) {
    // A cheap blur that works everywhere: shrink, then let the browser smooth it back up.
    const w = Math.max(1, Math.round(src.width / k)), h = Math.max(1, Math.round(src.height / k));
    const a = document.createElement('canvas'); a.width = w; a.height = h; const ax = a.getContext('2d'); ax.imageSmoothingQuality = 'high'; ax.drawImage(src, 0, 0, w, h);
    const b = document.createElement('canvas'); b.width = src.width; b.height = src.height; const bx = b.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(a, 0, 0, src.width, src.height);
    return b;
  }
  function sprite(c, rx, ry, ang) {
    // One cumulus: a lumpy mask, flattened on the side facing its own ground.
    const pad = Math.ceil(rx * .5) + 4, w = Math.ceil(rx * 2.4 + pad * 2), h = w;
    const r = rng(c.seed * 13 + 1), cx = w / 2, cy = h / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const mk = () => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
    const M = mk(), mx = M.getContext('2d');
    mx.translate(cx, cy); mx.rotate(ang - Math.PI / 2); // +y now points toward its ground
    mx.fillStyle = '#fff';
    const n = 4 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      const u = (r() - .5) * 2 * rx * .78, v = -Math.abs(r()) * ry * .5;
      const br = rx * (.22 + r() * .26) * (1 - Math.abs(u) / rx * .45);
      mx.beginPath(); mx.ellipse(u, v, br, br * (.75 + r() * .3), 0, 0, TAU); mx.fill();
    }
    // A flat base, toward its ground.
    mx.beginPath(); mx.ellipse(0, ry * .05, rx * .9, ry * .42, 0, 0, TAU); mx.fill();
    mx.setTransform(1, 0, 0, 1, 0, 0);
    const soft = softened(M, Math.max(2, rx / 7)), firm = softened(M, Math.max(1.2, rx / 22));
    // Lift: crisp on the lit side, wet and soft elsewhere.
    const L = mk(), lx2 = L.getContext('2d');
    lx2.globalAlpha = .42; lx2.drawImage(soft, 0, 0);
    lx2.globalAlpha = .28; lx2.drawImage(firm, -ca * rx * .08, -sa * rx * .08);
    lx2.globalAlpha = 1; lx2.globalCompositeOperation = 'source-in'; lx2.fillStyle = PAPER; lx2.fillRect(0, 0, w, h);
    lx2.globalCompositeOperation = 'destination-out'; for (let k = 0; k < w * h / 9; k++) { lx2.fillStyle = `rgba(0,0,0,${r() * .3})`; lx2.fillRect(r() * w, r() * h, 1, 1); }
    // Belly: a cool grey glaze on the side toward its ground, kept inside the cloud.
    const Gc = mk(), g = Gc.getContext('2d');
    g.drawImage(soft, ca * rx * .22, sa * rx * .22); g.globalCompositeOperation = 'destination-in'; g.drawImage(soft, 0, 0);
    g.globalCompositeOperation = 'source-in'; const grd = g.createLinearGradient(cx - ca * rx, cy - sa * rx, cx + ca * rx * .7, cy + sa * rx * .7);
    grd.addColorStop(0, 'rgba(150,156,178,0)'); grd.addColorStop(.55, 'rgba(132,138,164,.35)'); grd.addColorStop(1, 'rgba(118,124,152,.55)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-atop'; for (let k = 0; k < w * h / 16; k++) { g.fillStyle = `rgba(80,86,116,${.04 + r() * .1})`; g.fillRect(r() * w, r() * h, 1, 1); }
    return { L, G: Gc, w, h };
  }

  // ── The shower ───────────────────────────────────────────────────────────
  // One rain cell wanders the far side; it rains for part of every 100 minutes.
  // It wanders the left-hand wall, so its rain runs sideways, toward that ground.
  // Its home is the land seen on the left wall of the window, so its rain runs sideways.
  const home = (() => {
    const { mx, bw, ty, w, h } = frame, capC = F.cap.center;
    let capR = 0; for (const run of F.cap.rim) for (const p of run) capR = Math.max(capR, Math.hypot(p[0] - capC[0], p[1] - capC[1]));
    let best = null, bestScore = 0;
    for (let j = 0; j < B.gh; j++) for (let i = 0; i < B.gw; i++) {
      const k = j * B.gw + i, x = (i + .5) / B.gw * w, y = (j + .5) / B.gh * h;
      if (B.kind[k] === 2 || B.t[k] < 6000 || B.t[k] > 15000) continue;
      if (y < ty + bw + h * .06 || y > h * .72 || Math.abs(x - mx) < w * .1 || x < w * .05 || x > w * .95) continue;
      if (Math.hypot(x - capC[0], y - capC[1]) < capR * 1.25) continue;
      const s = B.s[k] + cam.s0, z = B.z[k], g = cam.projectHab(s, z, Math.max(0, B.h[k])), c = cam.projectHab(s, z, B.h[k] + 2300);
      if (g[2] <= 5 || c[2] <= 5) continue;
      const score = Math.hypot(g[0] - c[0], g[1] - c[1]) * (x > mx ? 1.3 : 1);
      if (score > bestScore) { bestScore = score; best = { s, z }; }
    }
    return best || { s: cam.s0 - CIRC * .17, z: cam.z0 - 9000 };
  })();
  const shower = { s: home.s, z0: home.z, h: 2300, size: 4600, v: 3.2 };
  // It rains for about 45 minutes in every 100.
  function rainAmount(t) { const ph = (t / 6000 + .15) % 1; return clamp(Math.sin(ph * TAU) * 1.6 - .2, 0, 1); }

  // ── Lamps (cached image; rebuilt when the set of lit lamps changes) ──────
  const lampCanvas = document.createElement('canvas'); lampCanvas.width = W; lampCanvas.height = H;
  const lc = lampCanvas.getContext('2d');
  let lampKey = '';
  function lampOn(l, hr) {
    const on = l.on, off = l.off;
    if (off >= 24) { const o2 = off - 24; return hr >= on || hr < Math.min(o2, 6.2); }
    return hr >= on && hr < off;
  }
  function drawLamps(hr, st) {
    const N = st.N, key = Math.round(hr * 60) + ':' + Math.round(N * 20);
    if (key === lampKey) return; lampKey = key;
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, W, H);
    const dusk = clamp((N - .05) / .5, 0, 1); if (dusk <= 0) return;
    lc.setTransform(S, 0, 0, S, 0, 0);
    // Luminaire lines and ring running lights come on together.
    for (const L of F.lamps) {
      if (L.kind !== 'lum') continue;
      const fade = clamp(1.2 - L.d / 30000, .35, 1);
      lc.strokeStyle = `rgba(255,226,170,${.1 * dusk * fade})`; lc.lineWidth = 2.2; lc.beginPath(); lc.moveTo(L.a[0], L.a[1]); lc.lineTo(L.b[0], L.b[1]); lc.stroke();
      lc.strokeStyle = `rgba(255,240,206,${.42 * dusk * fade})`; lc.lineWidth = .6; lc.stroke();
    }
    // The end wall's gold rim and its hub ring glow faintly.
    for (const run of F.cap.rims[1]) { lc.strokeStyle = `rgba(240,196,120,${.4 * dusk})`; lc.lineWidth = .8; lc.beginPath(); run.forEach((p, i) => i ? lc.lineTo(p[0], p[1]) : lc.moveTo(p[0], p[1])); lc.stroke(); }
    for (const run of F.cap.hub) { lc.strokeStyle = `rgba(255,214,140,${.8 * dusk})`; lc.lineWidth = 1.1; lc.beginPath(); run.forEach((p, i) => i ? lc.lineTo(p[0], p[1]) : lc.moveTo(p[0], p[1])); lc.stroke(); }
    for (const ring of F.rings) for (const run of ring.light) { lc.strokeStyle = `rgba(250,214,140,${.38 * dusk})`; lc.lineWidth = .8; lc.beginPath(); run.forEach((p, i) => i ? lc.lineTo(p[0], p[1]) : lc.moveTo(p[0], p[1])); lc.stroke(); }
    // Streets in the far towns: faint lines of light under their lamps.
    lc.lineCap = 'round';
    for (const L of F.lamps) {
      if (!L.link || !lampOn(L, hr)) continue;
      lc.strokeStyle = `rgba(255,214,150,${.16 * dusk * (L.dim ?? 1)})`; lc.lineWidth = .9;
      lc.beginPath(); lc.moveTo(L.link[0], L.link[1]); lc.lineTo(L.q[0], L.q[1]); lc.stroke();
    }
    for (const L of F.lamps) {
      if (L.kind === 'lum' || !lampOn(L, hr)) continue;
      const q = L.q, near = L.d < 3500, far = L.kind === 'far';
      const warm = L.warm ?? .5, col = warm > .6 ? '255,214,140' : warm > .2 ? '255,230,178' : '252,242,214';
      const dim = L.dim ?? 1, halo = far ? 1.25 : near ? 2.6 : 1.8, core = far ? .5 : near ? .85 : .65;
      const g = lc.createRadialGradient(q[0], q[1], 0, q[0], q[1], halo);
      g.addColorStop(0, `rgba(${col},${(far ? .22 : .4) * dusk * dim})`); g.addColorStop(1, `rgba(${col},0)`);
      lc.fillStyle = g; lc.beginPath(); lc.arc(q[0], q[1], halo, 0, TAU); lc.fill();
      lc.fillStyle = `rgba(${col},${(far ? .78 : .9) * dusk * dim})`; lc.beginPath(); lc.arc(q[0], q[1], core, 0, TAU); lc.fill();
    }
  }

  let showerSprite = { key: '' }, showerCloud = { key: '' };
  function showerPaint(rad, len, ang) {
    // Painted once per size: the cell, then the rain run out of it with the sheet tipped toward its ground.
    const ext = Math.ceil(Math.max(rad * 2.4, len + rad) + 8), c = document.createElement('canvas'); c.width = c.height = ext * 2;
    const x = c.getContext('2d'), r = rng(31), ca = Math.cos(ang), sa = Math.sin(ang), ox = ext, oy = ext;
    x.translate(ox, oy); x.rotate(ang - Math.PI / 2); // +y toward its ground
    for (let k = 0; k < 6; k++) {
      const cx = (r() - .5) * rad * 1.1, cy = (r() - .5) * rad * .2, cr = rad * (.35 + r() * .35);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, cr);
      g.addColorStop(0, 'rgba(96,102,132,.5)'); g.addColorStop(.6, 'rgba(116,122,148,.24)'); g.addColorStop(1, 'rgba(150,154,172,0)');
      x.save(); x.translate(cx, cy); x.scale(1, .5); x.translate(-cx, -cy); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, cr, 0, TAU); x.fill(); x.restore();
    }
    for (let k = 0; k < 110; k++) {
      const u = (r() - .5) * 1.6 * rad, y0 = rad * .04 + r() * rad * .1, l = len * (.45 + r() * .55), w = .9 + r() * 1.8 * Math.max(1, rad / 40);
      const gr = x.createLinearGradient(0, y0, 0, y0 + l);
      gr.addColorStop(0, `rgba(92,100,132,${.13 + r() * .13})`); gr.addColorStop(.6, `rgba(108,116,144,${.07 + r() * .07})`); gr.addColorStop(1, 'rgba(130,136,158,0)');
      const spread = u * .35;
      x.fillStyle = gr; x.beginPath(); x.moveTo(u - w / 2, y0); x.lineTo(u + w / 2, y0); x.lineTo(u + spread + w * .3, y0 + l); x.lineTo(u + spread - w * .3, y0 + l); x.closePath(); x.fill();
    }
    const soft = softened(c, Math.max(1.4, rad / 26));
    return { c: soft, ox, oy };
  }
  function weather(t) { return rainAmount(t) > .25 && !!showerScreen(t); }
  function showerScreen(t) {
    const z = clamp(shower.z0 + Math.sin(t / 9000) * 900, -HALF + 6000, cam.z0 - 4000);
    const p = pos(shower.s + Math.sin(t / 5200) * 500, z, shower.h), q = cam.project(p);
    if (q[2] <= 5 || q[0] < -60 || q[0] > cam.w + 60 || q[1] < -60 || q[1] > cam.h + 60) return null;
    return { p, q, z, s: shower.s + Math.sin(t / 5200) * 500 };
  }

  function draw(t, st) {
    const hr = ((t / 3600) % 24 + 24) % 24, N = st.N, day = 1 - N;
    gx.setTransform(1, 0, 0, 1, 0, 0); lx.setTransform(1, 0, 0, 1, 0, 0);
    gx.clearRect(0, 0, W, H); lx.clearRect(0, 0, W, H);
    gx.save(); lx.save(); gx.clip(panes); lx.clip(panes);
    gx.setTransform(S, 0, 0, S, 0, 0); lx.setTransform(S, 0, 0, S, 0, 0);

    // Clouds, far to near.
    const vis = [];
    for (const c of clouds) {
      const { z, fade } = cloudAt(c, t); if (fade <= 0) continue;
      const p = pos(c.s, z, c.h), q = visibleAt(p, 300); if (!q) continue;
      const d = cam.dist(p), rx = c.size * cam.f / d * .5; if (rx < 2.6) continue;
      const out = cam.project(pos(c.s, z, c.h - c.size)), ang = Math.atan2(out[1] - q[1], out[0] - q[0]);
      // Do we look up at its belly, or down onto its lit top (the far side)?
      const tt = c.s / R, ox = Math.sin(tt), oy = -Math.cos(tt), vx = (p[0] - cam.eye[0]) / d, vy = (p[1] - cam.eye[1]) / d;
      const belly = clamp(.5 - (vx * ox + vy * oy) * 1.4, 0, 1);
      vis.push({ c, q, d, rx, ry: rx * c.flat, ang, fade, belly });
    }
    vis.sort((a, b) => b.d - a.d);
    for (const v of vis) {
      const key = Math.round(v.rx * 8) + ':' + Math.round(v.ang * 10);
      if (v.c.key !== key) { v.c.sprite = sprite(v.c, v.rx * S, v.ry * S, v.ang); v.c.key = key; }
      const sp = v.c.sprite, x0 = v.q[0] - sp.w / 2 / S, y0 = v.q[1] - sp.h / 2 / S;
      const a = v.fade * (.55 + .45 * day);
      gx.globalAlpha = a * (.75 + .25 * day) * (.18 + .82 * v.belly); gx.drawImage(sp.G, x0, y0, sp.w / S, sp.h / S);
      lx.globalAlpha = Math.min(1, a * (day * .95 + .1) * (1.25 - .45 * v.belly) * (.5 + .5 * Math.min(1, v.rx / 12))); lx.drawImage(sp.L, x0, y0, sp.w / S, sp.h / S);
    }
    gx.globalAlpha = 1; lx.globalAlpha = 1;
    // Clouds catch the colour of the light: peach and rose as the spine dims.
    const warmC = clamp(st.gold * .8 + st.rose * .9, 0, 1) * (1 - N);
    if (warmC > .02 && vis.length) { lx.save(); lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-atop'; lx.fillStyle = `rgba(250,${190 - st.rose * 40 | 0},${150 - st.rose * 20 | 0},${.55 * warmC})`; lx.fillRect(0, 0, W, H); lx.restore(); }

    // The shower: a dark cell and rain falling toward its own ground, as soft runs.
    const ra = rainAmount(t), sh = ra > 0 ? showerScreen(t) : null;
    if (sh) {
      const d = cam.dist(sh.p), rad = shower.size * cam.f / d * .5;
      const ground = cam.project(pos(sh.s, sh.z, 0)), ang = Math.atan2(ground[1] - sh.q[1], ground[0] - sh.q[0]), len = Math.hypot(ground[0] - sh.q[0], ground[1] - sh.q[1]);
      const key = Math.round(rad * 4) + ':' + Math.round(ang * 12) + ':' + Math.round(len);
      if (showerSprite.key !== key) { showerSprite = showerPaint(rad * S, len * S, ang); showerSprite.key = key; }
      const sp = showerSprite;
      gx.globalAlpha = ra; gx.drawImage(sp.c, sh.q[0] - sp.ox / S, sh.q[1] - sp.oy / S, sp.c.width / S, sp.c.height / S); gx.globalAlpha = 1;
      // The rain cloud itself, lifted pale above its curtain.
      const ck = Math.round(rad * 6) + ':' + Math.round(ang * 10);
      if (showerCloud.key !== ck) { showerCloud = sprite({ seed: 77, blobs: 6 }, rad * S * .8, rad * S * .3, ang); showerCloud.key = ck; }
      const sc = showerCloud, cx0 = sh.q[0] - Math.cos(ang) * rad * .15 - sc.w / 2 / S, cy0 = sh.q[1] - Math.sin(ang) * rad * .15 - sc.h / 2 / S;
      lx.globalAlpha = .85 * ra * day; lx.drawImage(sc.L, cx0, cy0, sc.w / S, sc.h / S); lx.globalAlpha = 1;
      gx.globalAlpha = Math.min(1, 1.1 * ra); gx.drawImage(sc.G, cx0, cy0, sc.w / S, sc.h / S); gx.globalAlpha = 1;
    }
    // Trains on the transit rings. Drawn about twice their length and a little
    // heavier than life (a painter's licence), so they can be found.
    trainsSeen = 0;
    for (const tr of TRAINS) {
      const s = tr.s + t * tr.speed, dir = Math.sign(tr.speed), head = pos(s, tr.z, 1068), q = visibleAt(head, 500); if (!q) continue;
      if (q[0] < 2 || q[0] > cam.w - 2 || q[1] < 2 || q[1] > cam.h - 2) continue;
      const tail = cam.project(pos(s - dir * 380, tr.z, 1068)), wake = cam.project(pos(s - dir * 1300, tr.z, 1068)); if (tail[2] <= 5) continue;
      const wpx = Math.max(2.2, 18 * cam.f / q[2]), len = Math.hypot(tail[0] - q[0], tail[1] - q[1]);
      if (len < 2) continue;
      trainsSeen++;
      if (wake[2] > 5) { const g = gx.createLinearGradient(tail[0], tail[1], wake[0], wake[1]); g.addColorStop(0, `rgba(96,92,100,${.22 * day})`); g.addColorStop(1, 'rgba(96,92,100,0)'); gx.strokeStyle = g; gx.lineWidth = wpx * .6; gx.beginPath(); gx.moveTo(tail[0], tail[1]); gx.lineTo(wake[0], wake[1]); gx.stroke(); }
      gx.lineCap = 'round'; gx.strokeStyle = `rgba(74,44,32,${.9 * day + .1})`; gx.lineWidth = wpx; gx.beginPath(); gx.moveTo(q[0], q[1]); gx.lineTo(tail[0], tail[1]); gx.stroke();
      // Its roof catches the spine: a thin line lifted toward the axis.
      const c = cam.project([0, 0, tr.z]), vx = c[0] - q[0], vy = c[1] - q[1], vl = Math.hypot(vx, vy) || 1, ox = vx / vl * wpx * .45, oy = vy / vl * wpx * .45;
      if (day > .3) { lx.strokeStyle = `rgba(250,244,226,${.8 * day})`; lx.lineWidth = Math.max(.6, wpx * .3); lx.beginPath(); lx.moveTo(q[0] + ox, q[1] + oy); lx.lineTo(tail[0] + ox, tail[1] + oy); lx.stroke(); }
      if (N > .2) for (let k = 0; k < 5; k++) { const u = (k + .5) / 5, X = q[0] + (tail[0] - q[0]) * u, Y = q[1] + (tail[1] - q[1]) * u; lx.fillStyle = `rgba(255,232,180,${.95 * N})`; lx.beginPath(); lx.arc(X, Y, Math.max(.7, wpx * .45), 0, TAU); lx.fill(); }
    }
    gx.restore(); lx.restore();

    // Lamps (cached), laid on last.
    drawLamps(hr, st);
    if (N > .05) { lx.save(); lx.clip(panes); lx.drawImage(lampCanvas, 0, 0); lx.restore(); }
  }
  let trainsSeen = 0;
  return { draw, weather, trainInView: () => trainsSeen > 0 };
}

G.Live = { create };
})(window.SkyWindow = window.SkyWindow || {});

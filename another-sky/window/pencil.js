/*
 * The underdrawing, in graphite, done before any paint.
 *
 * First a little construction: the eye line and the vanishing point down the
 * axis, with the spine ruled out of it. Then the drawing proper, kept sparse so
 * the washes carry the picture: the end wall's rim and hub, the near transit
 * rings, shores, the hill's brow, the bridge, the near buildings and trees.
 * Then the window, ruled: casing, bars, sill and the latch.
 * Lines overshoot their corners, some are restated, a few were wrong and
 * rubbed out. Graphite catches the tops of the paper's tooth.
 * The canvas sits above the washes with multiply, as graphite shows through.
 */
(function (G) {
'use strict';
const { rng, sampleTile, noiseTile, paperTile, clamp } = G.Paper;

function draw(canvas, o) {
  const { cam, B, F, frame, DPR, w, h } = o;
  const cw = w * 1.14, ch = h * 1.175, ox = w * .07, oy = h * .045;
  canvas.width = Math.round(cw * DPR); canvas.height = Math.round(ch * DPR);
  const x = canvas.getContext('2d');
  x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, cw, ch); x.lineCap = 'round'; x.lineJoin = 'round';
  const R = rng(1207), nT = noiseTile(128, 24, 3, 77);
  const GR = (a) => `rgba(62,58,57,${a})`;

  // One pencil line: a few restated passes, hand tremor, pressure, overshoot.
  function stroke(pts, opt = {}) {
    if (pts.length < 2) return;
    const a = opt.a ?? .35, wd = opt.w ?? .7, passes = opt.passes ?? 1, jit = opt.jit ?? .35, over = opt.over ?? 0;
    for (let p = 0; p < passes; p++) {
      const seed = R() * 100, off = (R() - .5) * jit * 1.6;
      let q = pts.slice();
      if (over) {
        const e0 = q[0], e1 = q[1], z0 = q[q.length - 1], z1 = q[q.length - 2];
        const d0 = Math.hypot(e0[0] - e1[0], e0[1] - e1[1]) || 1, d1 = Math.hypot(z0[0] - z1[0], z0[1] - z1[1]) || 1;
        const k0 = over * (.4 + R()), k1 = over * (.4 + R());
        q = [[e0[0] + (e0[0] - e1[0]) / d0 * k0, e0[1] + (e0[1] - e1[1]) / d0 * k0], ...q, [z0[0] + (z0[0] - z1[0]) / d1 * k1, z0[1] + (z0[1] - z1[1]) / d1 * k1]];
      }
      // Resample into short segments so pressure can vary along the line.
      let acc = 0, segs = [], prev = q[0];
      for (let i = 1; i < q.length; i++) {
        const cur = q[i], d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]), n = Math.max(1, Math.ceil(d / 7));
        for (let k = 1; k <= n; k++) { const t = k / n, X = prev[0] + (cur[0] - prev[0]) * t, Y = prev[1] + (cur[1] - prev[1]) * t; segs.push([X, Y, acc + d * t, (cur[0] - prev[0]) / (d || 1), (cur[1] - prev[1]) / (d || 1)]); }
        acc += d; prev = cur;
      }
      const total = acc || 1;
      x.lineWidth = wd * (.85 + R() * .3);
      let lx = q[0][0], ly = q[0][1];
      for (let i = 0; i < segs.length; i++) {
        const [X, Y, s, dx, dy] = segs[i];
        const tremor = (sampleTile(nT, s * .05 + seed, seed) - .5) * jit * 2 + off;
        const px = X - dy * tremor, py = Y + dx * tremor;
        const taper = Math.min(1, s / 10, (total - s) / 10 + .2);
        const pressure = .55 + .45 * sampleTile(nT, s * .02 + seed * 3, 7.3);
        x.strokeStyle = GR(a * pressure * Math.max(.15, taper));
        x.beginPath(); x.moveTo(lx, ly); x.lineTo(px, py); x.stroke();
        lx = px; ly = py;
      }
    }
  }
  const at = p => [p[0] + ox, p[1] + oy];
  const runs = (rs, opt) => { for (const r of rs) stroke(r.map(at), opt); };

  // ── The view, clipped to the panes ───────────────────────────────────────
  x.save();
  x.beginPath();
  const bars = frame.bars, mx = frame.mx, ty = frame.ty, bw = frame.bw;
  const panes = [[0, 0, mx - bw / 2, ty - bw / 2], [mx + bw / 2, 0, w, ty - bw / 2], [0, ty + bw / 2, mx - bw / 2, h], [mx + bw / 2, ty + bw / 2, w, h]];
  for (const [a, b, c, d] of panes) x.rect(a + ox - .6, b + oy - .6, c - a + 1.2, d - b + 1.2);
  x.clip();

  // Construction: a faint eye line and the vanishing point.
  const vp = cam.vp, vpc = at(vp);
  stroke([[ox - 10, vpc[1]], [ox + w * .35, vpc[1] + (R() - .5) * 1.5]], { a: .1, w: .55, jit: .2 });
  stroke([[vpc[0] - 6, vpc[1] - 6], [vpc[0] + 6, vpc[1] + 6]], { a: .22, w: .55, jit: .1 }); stroke([[vpc[0] - 6, vpc[1] + 6], [vpc[0] + 6, vpc[1] - 6]], { a: .22, w: .55, jit: .1 });
  // The axis through the end wall's centre, and the spine on it.
  if (F.lines.spine.length) {
    const sp = F.lines.spine.flat(), a = at(sp[0]), b = at(sp[sp.length - 1]);
    stroke([a, b], { a: .34, w: .75, jit: .12, passes: 2, over: 12 });
  }
  // The end wall: its rim, drawn firmly, one inner ring and the hub.
  runs(F.cap.rim, { a: .55, w: .85, passes: 2, jit: .35 });
  F.cap.rings.forEach((r, k) => { if (k === 8) runs(r, { a: .08, w: .5, jit: .3 }); });
  runs(F.cap.hub, { a: .42, w: .7, passes: 2 });
  // The transit rings that sit in front of the end wall, once each; far ones lighter.
  for (const ring of F.rings) {
    const near = ring.z > -10000; runs(ring.tube, { a: near ? .26 : .12, w: .6, jit: .3 });
  }

  // Shores and the hill's brow, from the ray buffer.
  const contour = contours(B, cam);
  for (const c of contour) stroke(c.pts.map(at), { a: c.a, w: .65, jit: .4, passes: c.a > .25 ? 2 : 1 });
  const brow = browLine(B, cam);
  for (const run of brow) stroke(run.map(at), { a: .42, w: .75, jit: .5, passes: 2, over: 6 });
  // Field lines nearby: the survey grid in perspective, fading out.
  for (let k = -8; k <= 8; k++) {
    const s = Math.round((cam.s0 + k * 280) / 280) * 280, pts = [];
    for (let z = cam.z0 - 250; z > cam.z0 - 5200; z -= 120) { const hh = G.World.terrain(s, z); if (hh < 1) break; pts.push(cam.projectHab(s, z, hh)); }
    const vis = pts.filter(p => p[2] > 5);
    if (vis.length > 2 && R() < .3) stroke(vis.map(at), { a: .05 + R() * .05, w: .5, jit: .25 });
  }

  // Bridge.
  for (const br of F.bridges) {
    const top = br.deck.map(s => at([s.a[0], s.a[1]])), bot = br.deck.map(s => at([s.c[0], s.c[1]]));
    stroke(top, { a: .38, w: .65, passes: 2, jit: .3 }); stroke(bot, { a: .22, w: .55, jit: .3 });
    for (const run of br.cables) stroke(run.map(at), { a: .2, w: .5, jit: .2 });
    for (const t of br.towers) { const c = t.corners; stroke([at(c[3]), at(c[7])], { a: .35, w: .6, over: 3 }); stroke([at(c[2]), at(c[6])], { a: .35, w: .6, over: 3 }); stroke([at(c[7]), at(c[6])], { a: .3, w: .6 }); }
  }
  // Buildings: the nearer ones outlined, quickly.
  for (const b of F.buildings) {
    const sz = Math.abs(b.corners[6][1] - b.corners[2][1]), wd = Math.abs(b.corners[2][0] - b.corners[3][0]);
    if (sz * Math.max(wd, 3) < 90 || b.d > 5200) continue;
    // A few quick lines, not a wireframe: the visible verticals and the roof line.
    const a = clamp(.1 + sz * .008, .1, .32), c = b.corners;
    stroke([at(c[3]), at(c[7]), at(c[6]), at(c[2])], { a, w: .55, jit: .3, over: sz > 14 ? 2.5 : 0 });
    if (sz > 16) { const side = b.faces.find(f => f.cls.startsWith('side')); if (side) stroke(side.pts.slice(1, 3).map(at), { a: a * .8, w: .5, jit: .3 }); }
  }
  // Trees: a loose scribble for the canopy, a line for the trunk.
  for (const t of F.trees) {
    if (t.rx < 3) continue;
    const r = rng(t.seed + 5), pts = [], n = 14 + Math.floor(t.rx);
    for (let i = 0; i <= n; i++) { const a = -Math.PI * .9 + i / n * Math.PI * 2.1, rr = 1 + .18 * Math.sin(a * 5 + t.seed) + (r() - .5) * .14; pts.push(at([t.mid[0] + Math.cos(a) * t.rx * 1.35 * rr, t.mid[1] + Math.sin(a) * t.ry * 1.25 * rr])); }
    stroke(pts, { a: .26, w: .6, jit: .5 });
    if (t.rx > 6) stroke([at([t.mid[0], t.mid[1] + t.ry * .5]), at([t.base[0], t.base[1]])], { a: .3, w: .6, jit: .3 });
  }
  // Trail edges.
  { const L = [], Rr = []; for (const seg of F.trail) { if (!seg) { if (L.length > 1) { stroke(L.map(at), { a: .28, w: .6, jit: .4 }); stroke(Rr.map(at), { a: .28, w: .6, jit: .4 }); } L.length = 0; Rr.length = 0; continue; } L.push(seg[0]); Rr.push(seg[1]); } if (L.length > 1) { stroke(L.map(at), { a: .28, w: .6, jit: .4 }); stroke(Rr.map(at), { a: .28, w: .6, jit: .4 }); } }
  x.restore();

  // ── The window, ruled ────────────────────────────────────────────────────
  const X0 = ox, Y0 = oy, X1 = ox + w, Y1 = oy + h, cas = Math.max(9, w * .045);
  const ruled = (a, b, opt = {}) => stroke([a, b], { a: .5, w: .75, jit: .12, over: 9, passes: 2, ...opt });
  // Inner edge of the opening (the tape line) and the casing around it.
  ruled([X0, Y0], [X1, Y0]); ruled([X1, Y0], [X1, Y1]); ruled([X0, Y1], [X1, Y1]); ruled([X0, Y0], [X0, Y1]);
  ruled([X0 - cas, Y0 - cas], [X1 + cas, Y0 - cas], { a: .4 }); ruled([X0 - cas, Y0 - cas], [X0 - cas, Y1], { a: .4 }); ruled([X1 + cas, Y0 - cas], [X1 + cas, Y1], { a: .4 });
  // The reveal: the wall's depth, foreshortened toward the view.
  for (const [a, b] of [[[X0 - cas, Y0 - cas], [X0, Y0]], [[X1 + cas, Y0 - cas], [X1, Y0]]]) stroke([a, b], { a: .3, w: .6, jit: .1, over: 2 });
  // Bars.
  for (const v of [mx - bw / 2, mx + bw / 2]) ruled([ox + v, Y0], [ox + v, Y1], { a: .42, over: 4 });
  for (const v of [ty - bw / 2, ty + bw / 2]) ruled([X0, oy + v], [X1, oy + v], { a: .42, over: 4 });
  // Sill: its top seen from above, the nose, and its thickness.
  const sd = h * .045, so = cas * 1.5;
  ruled([X0 - so, Y1 + sd], [X1 + so, Y1 + sd], { a: .5 });
  ruled([X0 - so, Y1 + sd * 1.7], [X1 + so, Y1 + sd * 1.7], { a: .42 });
  stroke([[X0 - so, Y1 + sd], [X0 - so, Y1 + sd * 1.7]], { a: .42, w: .7 }); stroke([[X1 + so, Y1 + sd], [X1 + so, Y1 + sd * 1.7]], { a: .42, w: .7 });
  stroke([[X0 - cas, Y1], [X0 - so, Y1 + sd]], { a: .35, w: .6 }); stroke([[X1 + cas, Y1], [X1 + so, Y1 + sd]], { a: .35, w: .6 });
  // A shadow under the sill's nose, washed in pale grey with the side of the lead.
  {
    const g = x.createLinearGradient(0, Y1 + sd * 1.7, 0, Y1 + sd * 2.6);
    g.addColorStop(0, 'rgba(90,88,96,.16)'); g.addColorStop(1, 'rgba(90,88,96,0)');
    x.fillStyle = g; x.fillRect(X0 - so + 2, Y1 + sd * 1.7, X1 - X0 + so * 2 - 4, sd * .9);
    // Hatching on the sill's front.
    for (let X = X0 - so + 4; X < X1 + so - 2; X += 3.2 + R() * 1.5) stroke([[X, Y1 + sd + 1.5], [X - 2.5, Y1 + sd * 1.7 - 1]], { a: .12, w: .5, jit: .1 });
  }
  // The latch on the mullion, and two hinges on the opening casement.
  {
    const lx = ox + mx, ly = oy + ty + (h - ty) * .48;
    stroke([[lx - 2.2, ly - 6], [lx + 2.2, ly - 6], [lx + 2.2, ly + 6], [lx - 2.2, ly + 6], [lx - 2.2, ly - 6]], { a: .5, w: .6, jit: .05 });
    stroke([[lx, ly], [lx + bw * 1.6, ly + 9]], { a: .55, w: .9, jit: .05, passes: 2 });
    for (const yy of [oy + ty + 18, Y1 - 22]) stroke([[X1 - 1, yy], [X1 + 3, yy], [X1 + 3, yy + 9], [X1 - 1, yy + 9]], { a: .38, w: .6, jit: .05 });
  }

  // Graphite only sits on the peaks of the paper.
  const pt = paperTile(256, 6, 91), tile = document.createElement('canvas'); tile.width = tile.height = 256;
  const tx = tile.getContext('2d'), im = tx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = pt.data[i]; im.data[i * 4 + 3] = clamp((.55 - v) * 2.2, 0, 1) * 255 * .8; }
  tx.putImageData(im, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.fillStyle = x.createPattern(tile, 'repeat'); x.fillRect(0, 0, canvas.width, canvas.height); x.globalCompositeOperation = 'source-over';
  return { ox, oy, cw, ch };
}

// Shorelines: marching squares on (height - water level) within continuous land.
function contours(B, cam) {
  const { gw, gh } = B, sx = cam.w / gw, sy = cam.h / gh, segs = [];
  const v = (i, j) => B.h[j * gw + i] - .35;
  for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
    const k = j * gw + i, ks = [k, k + 1, k + gw + 1, k + gw];
    if (ks.some(q => B.kind[q] === 2)) continue;
    const ts = ks.map(q => B.t[q]); if (Math.max(...ts) / Math.min(...ts) > 1.4) continue;
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    const pts = [];
    const edge = (p, q, P, Q) => { if ((p < 0) !== (q < 0)) { const t = p / (p - q); pts.push([(P[0] + (Q[0] - P[0]) * t) * sx, (P[1] + (Q[1] - P[1]) * t) * sy]); } };
    const c0 = [i + .5, j + .5], c1 = [i + 1.5, j + .5], c2 = [i + 1.5, j + 1.5], c3 = [i + .5, j + 1.5];
    edge(a, b, c0, c1); edge(b, c, c1, c2); edge(c, d, c2, c3); edge(d, a, c3, c0);
    if (pts.length >= 2) segs.push([pts[0], pts[1], ts[0]]);
    if (pts.length === 4) segs.push([pts[2], pts[3], ts[0]]);
  }
  // Chain segments into lines.
  const key = p => Math.round(p[0] * 4) + ',' + Math.round(p[1] * 4), map = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); if (!map.has(k)) map.set(k, []); map.get(k).push(i); } });
  const used = new Uint8Array(segs.length), lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1;
    let line = [segs[i][0], segs[i][1]], tsum = segs[i][2], n = 1;
    for (const dir of [1, 0]) {
      let end = dir ? line[line.length - 1] : line[0];
      for (;;) {
        const cand = (map.get(key(end)) || []).find(q => !used[q]); if (cand === undefined) break;
        used[cand] = 1; const s = segs[cand], nxt = key(s[0]) === key(end) ? s[1] : s[0];
        if (dir) line.push(nxt); else line.unshift(nxt); end = nxt; tsum += s[2]; n++;
      }
    }
    if (line.length < 4) continue;
    const t = tsum / n, a = t < 4000 ? .4 : t < 9000 ? .24 : t < 16000 ? .12 : .06;
    lines.push({ pts: line, a });
  }
  return lines;
}

// The brow of the hill: where near ground gives way to far land, column by column.
function browLine(B, cam) {
  const { gw, gh } = B, sx = cam.w / gw, sy = cam.h / gh, runs = []; let run = [];
  for (let i = 0; i < gw; i++) {
    let found = -1;
    for (let j = gh - 2; j > 0; j--) { const k = j * gw + i; if (B.t[k] < 1600 && B.t[k - gw] > B.t[k] * 2.2) { found = j; break; } }
    if (found > 0) run.push([(i + .5) * sx, (found) * sy]); else { if (run.length > 2) runs.push(run); run = []; }
  }
  if (run.length > 2) runs.push(run);
  // Thin out and smooth a little.
  return runs.map(r => r.filter((_, i) => i % 2 === 0 || i === r.length - 1));
}

G.Pencil = { draw };
})(window.SkyWindow = window.SkyWindow || {});

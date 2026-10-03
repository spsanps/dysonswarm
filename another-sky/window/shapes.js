/*
 * Shapes into density maps. Three scratch canvases, each holding three
 * channels of "how much paint, or how much paper kept, here":
 *   A: R reserve (roofs, bridge deck, sails, rims), G trail sand, B luminaires
 *   B: R walls facing the house, G side walls, B dark accents
 *   C: R tree canopy, G canopy shadow side, B trunks
 * Shapes are laid far to near. Each one paints its own channels and wipes the
 * others under it, so a near tree hides the roofs behind it, as paint would.
 */
(function (G) {
'use strict';
const { hash2, rng } = G.Paper;

function rasterize(ctx, W, H, S) {
  const { F, cam } = ctx;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.setTransform(S, 0, 0, S, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; return { c, x }; };
  const CA = mk(), CB = mk(), CC = mk(), all = [CA.x, CB.x, CC.x];
  const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

  // Paint a path: mats[k] = colour for canvas k, or null to wipe it there.
  function fillPath(path, mats, additive) {
    for (let k = 0; k < 3; k++) {
      const x = all[k];
      if (mats[k]) { x.globalCompositeOperation = additive ? 'lighter' : 'source-over'; x.fillStyle = mats[k]; x.fill(path); }
      else if (mats[k] === null) { x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(path); }
    }
  }
  function strokePath(path, k, color, width, additive) { const x = all[k]; x.globalCompositeOperation = additive ? 'lighter' : 'source-over'; x.strokeStyle = color; x.lineWidth = width; x.stroke(path); }
  const poly = pts => { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath(); return p; };
  const line = pts => { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); return p; };
  const pxPerM = d => cam.f / Math.max(1, d);

  // ── The air first: rings, luminaires, end-wall rim and hub ───────────────
  const capC = F.cap.center;
  for (const run of F.cap.rims[0]) strokePath(line(run), 0, rgb(255, 0, 0, .9), 1.5, false);
  for (const run of F.cap.hub) { strokePath(line(run), 0, rgb(255, 0, 0), 1.6, false); strokePath(line(run.map(p => [p[0], p[1] + 1.2])), 1, rgb(0, 0, 150, .7), .8, false); }
  for (const ring of F.rings) {
    for (const run of ring.tube) {
      const d = run[(run.length / 2) | 0][2], w = Math.max(.9, 44 * pxPerM(d));
      const c = cam.project([0, 0, ring.z]);
      // Lit on the side facing the spine, shaded away from it.
      const lit = run.map(p => { const vx = c[0] - p[0], vy = c[1] - p[1], l = Math.hypot(vx, vy) || 1; return [p[0] + vx / l * w * .35, p[1] + vy / l * w * .35]; });
      const dk = run.map(p => { const vx = c[0] - p[0], vy = c[1] - p[1], l = Math.hypot(vx, vy) || 1; return [p[0] - vx / l * w * .45, p[1] - vy / l * w * .45]; });
      strokePath(line(dk), 1, rgb(0, 0, 255, .32), Math.max(.7, w * .5), false);
      strokePath(line(lit), 0, rgb(255, 0, 0), Math.max(.8, w * .6), false);
    }
    for (const run of ring.hoop) strokePath(line(run), 1, rgb(0, 0, 200, .2), .8, false);
    if (ring.z > -10000) for (const [a, b] of ring.ties) { const p = line([a, b]); strokePath(p, 1, rgb(0, 0, 255, .22), Math.max(.5, 9 * pxPerM((a[2] + b[2]) / 2)), false); }
  }
  for (const L of F.luminaires) {
    const p = poly(L.quad);
    fillPath(p, [rgb(0, 0, 255), undefined, undefined], false);
    const w = Math.max(.7, 54 * pxPerM(L.d) * .5); strokePath(line([L.quad[0], L.quad[3]]), 0, rgb(0, 0, 255), w, true);
  }

  // ── Everything standing on the land, far to near ─────────────────────────
  const items = [];
  for (const b of F.buildings) items.push({ d: b.d, draw: () => drawBuilding(b) });
  for (const br of F.bridges) items.push({ d: br.d * .92, draw: () => drawBridge(br) });
  for (const t of F.trees) items.push({ d: t.d, draw: () => drawTree(t) });
  for (const b of F.boats) items.push({ d: b.d, draw: () => drawBoat(b) });
  for (let i = 0; i + 1 < F.trail.length; i++) { const a = F.trail[i], b = F.trail[i + 1]; if (a && b) items.push({ d: (a[0][2] + b[0][2]) / 2 + 30, draw: () => fillPath(poly([a[0], a[1], b[1], b[0]]), [rgb(0, 255, 0), null, null], false) }); }
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.draw();

  function drawBuilding(b) {
    const sz = Math.abs(b.corners[6][1] - b.corners[2][1]), hv = hash2(b.seed * 1e4, 1, 2);
    for (const f of b.faces) {
      const p = poly(f.pts);
      if (f.cls === 'roof') fillPath(p, [rgb(255, 0, 0), null, null], false);
      else if (f.cls === 'front') fillPath(p, [null, rgb(90 + 165 * hv, 0, 0), null], false);
      else fillPath(p, [null, rgb(0, 190 + 65 * hv, 0), null], false);
    }
    // Only a suggestion of floors on the big near ones, and a dark foot.
    if (sz > 20) {
      const f = b.faces.find(q => q.cls === 'front');
      if (f) {
        const [p0, p1, p2, p3] = f.pts, rows = Math.min(9, Math.floor(b.ht / 12)), x = all[1];
        x.globalCompositeOperation = 'source-over'; x.strokeStyle = rgb(0, 0, 255, .5); x.lineWidth = .6;
        for (let k = 1; k <= rows; k++) {
          if (hash2(b.seed * 1e4 + k, 3, 5) < .4) continue;
          const v = k / (rows + 1), u0 = hash2(k, b.seed * 1e4, 7) * .3, u1 = .55 + hash2(k, b.seed * 1e4, 8) * .4;
          const L = (u) => [p3[0] + (p0[0] - p3[0]) * v + ((p2[0] + (p1[0] - p2[0]) * v) - (p3[0] + (p0[0] - p3[0]) * v)) * u, p3[1] + (p0[1] - p3[1]) * v + ((p2[1] + (p1[1] - p2[1]) * v) - (p3[1] + (p0[1] - p3[1]) * v)) * u];
          x.beginPath(); const a = L(u0), c = L(u1); x.moveTo(a[0], a[1]); x.lineTo(c[0], c[1]); x.stroke();
        }
      }
    }
    if (sz > 5) { const c = b.corners; strokePath(line([c[3], c[2]]), 1, rgb(0, 0, 255, .55), Math.max(.6, sz * .04), false); }
    if (b.kind === 'tower') { const t = b.top; fillPath(poly([[t[0] - 1.5, t[1] - 1], [t[0] + 1.5, t[1] - 1], [t[0] + 1.5, t[1] + 1], [t[0] - 1.5, t[1] + 1]]), [rgb(255, 0, 0), null, null], false); }
  }
  function drawBridge(br) {
    // Deck: paper on top, a dark line of shadow under it.
    const top = [], bot = [];
    for (const s of br.deck) { top.push([s.a[0], s.a[1]]); bot.push([s.b[0], s.b[1]]); }
    if (top.length > 1) {
      const p = poly(top.concat(bot.slice().reverse()));
      fillPath(p, [rgb(255, 0, 0), null, null], false);
      strokePath(line(top), 0, rgb(255, 0, 0), 1.3, false);
      const under = br.deck.map(s => [s.c[0], s.c[1] + Math.max(1.2, 6 * pxPerM(s.d))]);
      strokePath(line(under), 1, rgb(0, 0, 255, .95), 1.1, false);
    }
    for (const run of br.cables) strokePath(line(run), 1, rgb(0, 0, 255, .75), Math.max(.6, 2.4 * pxPerM(run[0][2])), false);
    for (const t of br.towers) {
      const c = t.corners, front = poly([c[3], c[2], c[6], c[7]]), side = poly([c[1], c[2], c[6], c[5]]);
      fillPath(side, [null, rgb(0, 255, 0), null], false);
      fillPath(front, [rgb(255, 0, 0), null, null], false);
      strokePath(line([c[2], c[6]]), 1, rgb(0, 0, 255, .6), .7, false);
    }
  }
  function drawTree(t) {
    const r = rng(t.seed * 7 + 3);
    const rx = Math.max(.7, t.rx * 1.8), ry = Math.max(.7, t.ry * 1.7);
    const cx = t.mid[0], cy = t.bush ? t.base[1] - ry * .45 : t.mid[1] + t.ry * .35;
    const near = rx > 5, mid = rx > 2;
    // The canopy is one wash with a lumpy edge: a union of leaf clumps.
    const sil = new Path2D(), darkP = new Path2D(), holes = [];
    if (t.variant === 1) {
      const topY = t.top[1] - ry * .25, botY = cy + ry * 1.0, n = near ? 9 : 4, L = [], Rr = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, y = topY + (botY - topY) * f, half = rx * .62 * Math.pow(f, .85) * (1 + .18 * (r() - .5));
        L.push([cx - half, y], [cx - half * .55, y + (botY - topY) / n * .35]); Rr.push([cx + half, y], [cx + half * .55, y + (botY - topY) / n * .35]);
      }
      const pts = [[cx, topY], ...Rr, ...L.reverse()];
      pts.forEach((q, i) => i ? sil.lineTo(q[0], q[1]) : sil.moveTo(q[0], q[1])); sil.closePath();
      if (near) { darkP.moveTo(cx + rx * .05, topY + (botY - topY) * .3); darkP.lineTo(cx + rx * .55, botY); darkP.lineTo(cx, botY); darkP.closePath(); }
    } else {
      const n = near ? 14 + Math.min(26, Math.floor(rx * .9)) : mid ? 7 : 3;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, rho = Math.sqrt(r()) * .6;
        const px = cx + Math.cos(a) * rx * rho, py = cy + Math.sin(a) * ry * rho * .92 - ry * .06;
        const cr = Math.max(.5, rx * (.26 + r() * .2) * (1 - rho * .35));
        sil.moveTo(px + cr, py); sil.arc(px, py, cr, 0, Math.PI * 2);
        // Clumps on the shadow side (below, away from the spine) get a second, darker wash.
        const side = ((py - cy) / ry + (px - cx) / rx * .45) + (r() - .5) * .5;
        if (near && side > .05) { const dr = cr * (.45 + r() * .4) * Math.min(1, side * 2); darkP.moveTo(px + dr + cr * .2, py + cr * .25); darkP.arc(px + cr * .2, py + cr * .25, dr, 0, Math.PI * 2); }
      }
    }
    const x = all[2];
    // Its shadow on the grass: a flat, ragged stroke at the foot.
    if (near && !t.bush) {
      const sh = new Path2D(), bx = t.base[0], by = t.base[1], sw = rx * 1.05, sht = Math.max(1, rx * .16);
      for (let k = 0; k < 7; k++) { const u = (k / 6 - .5) * 2, cr = sht * (1 - u * u * .5) * (.8 + r() * .4); sh.moveTo(bx + u * sw * .8 + cr * 1.6, by + rx * .04); sh.ellipse(bx + u * sw * .8, by + rx * .04, cr * 1.6, cr, 0, 0, Math.PI * 2); }
      x.globalCompositeOperation = 'lighter'; x.fillStyle = rgb(0, 75, 0); x.fill(sh);
    }
    // Trunk below the canopy, tapering, with a fork into the leaves.
    if (near && !t.bush) {
      const tw = Math.max(.6, rx * .075), p = new Path2D(), topT = cy + ry * .35;
      p.moveTo(t.base[0] - tw * .5, t.base[1]); p.lineTo(cx - tw * .3, topT); p.lineTo(cx + tw * .3, topT); p.lineTo(t.base[0] + tw * .5, t.base[1]); p.closePath();
      const br = new Path2D(); br.moveTo(cx, topT + (t.base[1] - topT) * .1); br.lineTo(cx - rx * .3, cy); br.moveTo(cx, topT + (t.base[1] - topT) * .05); br.lineTo(cx + rx * .25, cy - ry * .1);
      x.globalCompositeOperation = 'source-over'; x.fillStyle = rgb(0, 0, 230); x.fill(p); x.strokeStyle = rgb(0, 0, 200); x.lineWidth = Math.max(.5, tw * .45); x.stroke(br);
      for (const k of [0, 1]) { const xa = all[k]; xa.globalCompositeOperation = 'destination-out'; xa.fillStyle = '#000'; xa.fill(p); }
    }
    for (let k = 0; k < 2; k++) { const xa = all[k]; xa.globalCompositeOperation = 'destination-out'; xa.fillStyle = '#000'; xa.fill(sil); }
    // Under the canopy the trunk is hidden; the canopy replaces whatever was there.
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(sil);
    x.globalCompositeOperation = 'lighter';
    const dens = near ? 150 : mid ? 165 : 175;
    x.fillStyle = rgb(dens, t.variant === 1 ? 70 : 0, 0); x.fill(sil);
    if (near) { x.fillStyle = rgb(0, 120, 0); x.fill(darkP); }
    for (const [hx, hy, hr] of holes) { x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(hx, hy, hr, 0, Math.PI * 2); x.fill(); }
  }
  function drawBoat(b) {
    const w = Math.max(.8, b.w), h = Math.max(1.2, b.q[1] - b.top[1]);
    const sail = poly([[b.q[0], b.q[1] - h], [b.q[0] + w * .9, b.q[1] - h * .08], [b.q[0] - w * .15, b.q[1] - h * .08]]);
    fillPath(sail, [rgb(255, 0, 0), null, null], false);
    if (b.d < 7000) strokePath(line([[b.q[0] - w * .6, b.q[1]], [b.q[0] + w * .7, b.q[1]]]), 1, rgb(0, 0, 255, .6), Math.max(.5, w * .2), false);
  }

  // ── The meadow below the window: broad strokes, laid flat across the slope ──
  const CD = mk();
  {
    const B = ctx.B, gw = B.gw, gh = B.gh, sxg = cam.w / gw, syg = cam.h / gh, top = new Float32Array(gw);
    for (let i = 0; i < gw; i++) { let j = gh - 1; while (j > 0 && B.t[j * gw + i] < 900 && B.kind[j * gw + i] === 0) j--; top[i] = (j + 1) * syg; }
    const topAt = X => top[Math.max(0, Math.min(gw - 1, Math.floor(X / sxg)))];
    const r = rng(612), x = CD.x;
    x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 34; k++) {
      const len = cam.w * (.18 + r() * .5), x0 = -cam.w * .1 + r() * cam.w * 1.05, x1 = x0 + len;
      const yTop = Math.max(topAt(x0), topAt(x1)), span = cam.h - yTop; if (span < 8) continue;
      const fy = Math.pow(r(), .8), y0 = yTop + 4 + fy * (span - 4), tilt = (topAt(x1) - topAt(x0)) * (1 - fy) * .8 + (r() - .5) * 6;
      const th = (3 + r() * 8) * (.6 + fy * 1.3);
      const which = r(), col = which < .5 ? [1, 0, 0] : which < .88 ? [0, 1, 0] : [0, 0, 1];
      const a = .16 + r() * .22;
      // The stroke breaks where the brush ran dry.
      let u = 0; const pieces = [];
      while (u < 1) { const l = .25 + r() * .6, g = r() < .5 ? .04 + r() * .12 : 0; pieces.push([u, Math.min(1, u + l)]); u += l + g; }
      for (const [u0, u1] of pieces) {
        const p = new Path2D(), n = Math.max(4, Math.round(len * (u1 - u0) / 5)), up = [], dn = [];
        for (let i = 0; i <= n; i++) {
          const uu = u0 + (u1 - u0) * i / n, X = x0 + len * uu, Y = y0 + tilt * uu + Math.sin(uu * 3 + k) * 2;
          const taper = Math.min(1, (i / n) * 4, (1 - i / n) * 3 + .3), half = th * .5 * taper;
          up.push([X, Y - half * (1 + (r() - .5) * .5)]); dn.push([X, Y + half * (1 + (r() - .5) * .5)]);
        }
        [...up, ...dn.reverse()].forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath();
        x.fillStyle = rgb(col[0] * 255, col[1] * 255, col[2] * 255, a); x.fill(p);
      }
    }
  }

  // ── Read back ────────────────────────────────────────────────────────────
  const N = W * H, out = {};
  const names = [['res', 'sand', 'lum'], ['front', 'side', 'dark'], ['canopy', 'canopyDark', 'trunk'], ['mGreen', 'mOchre', 'mSienna']];
  [CA, CB, CC, CD].forEach((C, k) => {
    const d = C.x.getImageData(0, 0, W, H).data, a = new Float32Array(N), b = new Float32Array(N), c = new Float32Array(N);
    for (let i = 0; i < N; i++) { const al = d[i * 4 + 3] / 65025; a[i] = d[i * 4] * al; b[i] = d[i * 4 + 1] * al; c[i] = d[i * 4 + 2] * al; }
    out[names[k][0]] = a; out[names[k][1]] = b; out[names[k][2]] = c;
  });
  // Front walls are encoded with a little dark in B for variety; split it out.
  for (let i = 0; i < N; i++) { if (out.front[i] > .02) out.dark[i] *= .35; }
  return out;
}

G.Shapes = { rasterize };
})(window.SkyWindow = window.SkyWindow || {});

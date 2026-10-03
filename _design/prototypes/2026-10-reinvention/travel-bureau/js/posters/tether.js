/* No. 05 · The Tether (not open yet). A space elevator: a ribbon from an ocean platform on
   the equator, straight up, past geostationary orbit. The scene is just before sunrise: the
   sea is still in dusk, but high up the ribbon is already in sunlight. Living thing: a climber
   rides up out of the shadow and catches the Sun as it crosses into the light. */
(function () {
'use strict';
const { clamp, lerp, smooth, fbm, vnoise, rng, TAU, mixc } = Paint;
const { ART, INK } = Kit;

const HZ = 812;                 // horizon
const RX = 612;                 // the ribbon's x
const BASE = 878;               // top of the anchor tower, where the ribbon leaves the platform
const SHADOW = 560;             // below this the ribbon is still in the Earth's shadow
const DAWN = 250;               // where the Sun will rise, just below the horizon

function build(b) {
  const W = Kit.windowMask(b);
  const bx = [ART.x0, ART.y0, ART.x1, ART.y1];
  // ---- the dawn sky, coat over coat from the top down ----
  b.spray('#3f5a6b', W, { grain: 0.06 });
  b.spray('#6f8d92', b.mulF(W, (u, v) => smooth(ART.y0, 520, v)), { grain: 0.1 });
  b.spray('#c39a96', b.mulF(W, (u, v) => smooth(380, 700, v)), { grain: 0.1 });
  b.spray('#eba985', b.mulF(W, (u, v) => smooth(560, HZ, v) * (0.75 + 0.25 * Math.exp(-(((u - DAWN) / 380) ** 2)))), { grain: 0.1 });
  b.spray('#f8d29a', b.mulF(W, (u, v) => smooth(680, HZ, v) * Math.exp(-(((u - DAWN) / 300) ** 2))), { grain: 0.1 });
  b.spray('#fff0cf', b.mulF(W, (u, v) => Math.exp(-((Math.hypot((u - DAWN) / 2.2, v - HZ) / 52) ** 2)) * (v < HZ ? 1 : 0)), { grain: 0.1 });
  // the last stars, high up
  b.spatter('#fff6e4', bx, 300, 0.7, 2.2, { accept: (u, v) => smooth(420, ART.y0, v) * 0.9, aMin: 0.5, aMax: 1, pow: 3 });
  b.glint(832, 154, 7, '#fff8ea', { bloom: 0.45, rays: 4, rot: 0.785, width: 0.06 });

  // ---- long thin clouds, pink underneath where the coming Sun lights them ----
  const clouds = [[180, 646, 300, 13, 0.75], [720, 694, 360, 10, 0.7], [430, 740, 520, 8, 0.65], [880, 604, 240, 9, 0.55], [100, 528, 190, 7, 0.45]];
  for (const [x, y, len, th, a] of clouds) {
    const C = b.mulF(W, (u, v) => {
      const dx = (u - x) / len, dy = (v - y - Math.sin((u - x) / 70) * 2) / th;
      return a * smooth(1, 0.55, Math.abs(dx)) * smooth(1, 0.2, Math.abs(dy)) * (0.7 + 0.3 * fbm(u / 40, v / 10, 7, 2));
    });
    b.spray('#7f6f80', C, { grain: 0.2 });
    b.spray('#f6b493', b.mulF(C, (u, v) => smooth(y - th * 0.2, y + th, v) * Math.exp(-(((u - DAWN) / 520) ** 2)) * 1.2), { grain: 0.25 });
  }

  // ---- the sea: a dusk-teal plate, lighter toward the horizon, glitter under the glow ----
  const SEA = b.mulF(W, (u, v) => clamp((v - HZ) * b.k + 0.5));
  b.spray('#2b4c55', SEA, { grain: 0.05 });
  b.spray('#5f7f86', b.mulF(SEA, (u, v) => smooth(HZ + 120, HZ, v) * 0.8), { grain: 0.15 });
  b.spray('#c79a8c', b.mulF(SEA, (u, v) => smooth(HZ + 60, HZ, v) * Math.exp(-(((u - DAWN) / 260) ** 2)) * 0.8), { grain: 0.15 });
  b.spray('#1c3740', b.mulF(SEA, (u, v) => smooth(HZ + 80, ART.y1, v) * 0.6), { grain: 0.2 });
  // wave strokes: short horizontal gouache dashes, denser and brighter in the glitter path
  const r = rng(55), dashes = [];
  for (let i = 0; i < 1400; i++) {
    const v = HZ + 4 + Math.pow(r(), 1.6) * (ART.y1 - HZ - 4), persp = (v - HZ) / (ART.y1 - HZ);
    const u = lerp(ART.x0, ART.x1, r());
    const path = Math.exp(-(((u - DAWN) / (60 + persp * 260)) ** 2));
    if (r() > 0.07 + path * 0.9) continue;
    const L = (4 + r() * 10) * (0.4 + persp * 1.6), th = 0.5 + persp * 1.6;
    dashes.push([u, v, L, th, path]);
  }
  const DL = b.mul(b.strokeMask(dashes.filter((d) => d[4] > 0.3).map(([u, v, L, th]) => [[u - L / 2, v, th], [u + L / 2, v, th * 0.8]])), SEA);
  const DD = b.mul(b.strokeMask(dashes.filter((d) => d[4] <= 0.3).map(([u, v, L, th]) => [[u - L / 2, v, th * 0.9], [u + L / 2, v, th * 0.7]])), SEA);
  b.gouache('#ffe1b4', DL, { op: 0.85 });
  b.gouache('#6f8f93', DD, { op: 0.45 });

  // ---- the platform: a dark silhouette with a warm rim from the eastern glow ----
  const plat = b.mul(b.raster((c) => {
    c.fillRect(470, 852, 270, 12);                          // main deck
    c.fillRect(492, 864, 8, 30); c.fillRect(560, 864, 8, 34); c.fillRect(640, 864, 8, 34); c.fillRect(708, 864, 8, 30); // legs
    c.fillRect(500, 836, 70, 16); c.fillRect(510, 822, 32, 14);  // blocks
    c.fillRect(660, 840, 60, 12);
    c.beginPath(); c.moveTo(RX - 22, 852); c.lineTo(RX - 7, BASE - 70); c.lineTo(RX + 7, BASE - 70); c.lineTo(RX + 22, 852); c.closePath(); c.fill(); // anchor tower
    c.fillRect(RX - 14, BASE - 76, 28, 8);
    c.fillRect(700, 800, 3, 40); c.beginPath(); c.moveTo(701, 802); c.lineTo(752, 828); c.lineTo(750, 831); c.lineTo(701, 808); c.fill(); // crane
  }), W);
  b.spray('#1f2c35', plat, { grain: 0.06 });
  b.spray('#3e4a55', b.mulF(plat, (u, v) => smooth(900, 840, v) * 0.6), { grain: 0.2 });
  b.gouache('#f4b48a', b.mulF(b.ridge(plat, 1.1), (u, v) => smooth(RX + 40, 470, u)), { op: 0.75 });
  // reflection of the platform, broken by the swell
  const refl = b.mul(b.raster((c) => {
    for (let y = 896; y < 990; y += 5) { const w = 270 * (1 - (y - 896) / 120); c.globalAlpha = 0.6 * (1 - (y - 896) / 94); c.fillRect(605 - w / 2 + Math.sin(y) * 6, y, w, 2.4); }
  }), SEA);
  b.spray('#16262d', refl, { grain: 0.2, op: 0.7 });
  // working lights
  for (const [x, y, s] of [[520, 820, 4], [700, 798, 4], [RX, BASE - 78, 6], [480, 852, 3], [738, 852, 3]]) b.glint(x, y, s, '#ffe1aa', { bloom: 0.6, rays: 4, rot: 0.785, width: 0.07 });

  // ---- the ribbon: dusky below the shadow line, sunlit gold above, fading into the sky ----
  const rib = b.mul(b.strokeMask([[[RX, BASE - 74, 3.4], [RX, 600, 2.6], [RX, ART.y0 - 4, 1.6]]]), W);
  b.gouache('#3a3b4a', b.mulF(rib, (u, v) => smooth(SHADOW - 30, SHADOW + 40, v)), { op: 0.9 });
  b.gouache('#ffd593', b.mulF(rib, (u, v) => smooth(SHADOW + 30, SHADOW - 30, v) * (0.55 + 0.45 * smooth(ART.y0, SHADOW, v))), { op: 0.95 });
  b.spray('#ffd9a0', b.mul(b.blur(b.mulF(rib, (u, v) => smooth(SHADOW + 20, SHADOW - 40, v)), 2.2), W), { op: 0.35, grain: 0.2 });
  // where the light begins: a small sprayed glow on the ribbon
  b.spray('#fff0cf', b.field((u, v) => 0.35 * Math.exp(-(((u - RX) / 6) ** 2 + ((v - SHADOW + 6) / 14) ** 2)), [RX - 30, SHADOW - 60, RX + 30, SHADOW + 40]), { grain: 0.2 });

  Kit.band(b, {
    no: '05', open: false, title: 'The Tether',
    titleStyle: { top: '#4f8f95', bottom: '#2c3f52', band: '#f2b48e', shadow: INK.plum },
    line: 'A SPACE ELEVATOR FROM THE EQUATOR',
  });
  return { climber: climberSprites(b) };
}

function climberSprites(b) {
  const make = (lit) => {
    const size = Math.max(24, Math.round(40 * b.k * 2)) | 0;
    const g = new Paint.Board(size, size, { transparent: true, unit: 100, seed: lit ? 9 : 8, grainScale: b.gs });
    if (lit) g.spray('#ffe7b8', g.field((u, v) => 0.7 * Math.exp(-((u - 50) ** 2 + (v - 50) ** 2) / 300)), { grain: 0.3 });
    const body = g.raster((c) => { c.fillRect(42, 38, 16, 22); c.fillRect(38, 46, 24, 6); });
    g.spray(lit ? '#c27a4f' : '#2a2c3a', body, { grain: 0.05 });
    if (lit) g.spray('#fff0cf', g.mulF(body, (u) => smooth(48, 42, u)), { grain: 0.1 });
    g.dotPx(50 * g.k, 36 * g.k, 2.2 * g.k, lit ? '#fff6e0' : '#ff9a6a', 1);
    if (lit) g.glint(46, 40, 26, '#fffaf0', { bloom: 0, rays: 4, rot: 0.785, width: 0.05 });
    return g.toCanvas();
  };
  return { dark: make(false), lit: make(true) };
}

const PERIOD = 64, CLIMB = 54;
function frame(ctx, t, k, L) {
  const ph = ((t % PERIOD) + PERIOD) % PERIOD;
  if (ph > CLIMB) return;
  const u = ph / CLIMB;
  // the climb looks slower the higher it gets
  const y = lerp(BASE - 80, ART.y0 + 40, 1 - Math.pow(1 - u, 1.7));
  const a = smooth(0, 0.03, u) * (1 - smooth(0.92, 1, u));
  const sz = lerp(40, 22, u) * k;
  const lit = smooth(SHADOW + 12, SHADOW - 12, y);
  ctx.save();
  ctx.beginPath(); ctx.rect(ART.x0 * k, ART.y0 * k, ART.w * k, ART.h * k); ctx.clip();
  ctx.globalAlpha = a * (1 - lit); ctx.drawImage(L.climber.dark, RX * k - sz / 2, y * k - sz / 2, sz, sz);
  ctx.globalAlpha = a * lit; ctx.drawImage(L.climber.lit, RX * k - sz / 2, y * k - sz / 2, sz, sz);
  // the beacon blinks once every two seconds
  const blink = (t % 2) < 0.12 ? 1 : 0;
  if (blink) { ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,150,100,.95)'; ctx.beginPath(); ctx.arc(RX * k, (y - 0.3 * sz / k / 2) * k, 2.2 * k, 0, TAU); ctx.fill(); }
  ctx.restore();
}

Bureau.define({ id: 'tether', seed: 505, still: 30, fps: 20, build, frame });
})();

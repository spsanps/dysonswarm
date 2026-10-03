/*
 * The hour. Another Sky is lit by a spine of light along its axis (the
 * explorer's "axial daylight spine"); there is no sun, no mirrors, no stars.
 * Here the spine follows the visitor's own clock: it comes up from about 5:30,
 * is full from 8, warms after 4:30, goes amber, and is dark by about 8:40 pm.
 * Morning light leans from the far end wall (so the view is against the light);
 * evening light comes from behind the house.
 *
 * The hour never filters the picture. It decides which pigment goes into each
 * of the painting's washes and how heavily, and the sheet is then re-washed:
 * the same brush marks, new colour. Glazes combine as transparent layers
 * (Beer–Lambert), so overlaps darken and paper stays the only white.
 */
(function (G) {
'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const gauss = (h, c, w) => { let d = Math.abs(h - c); if (d > 12) d = 24 - d; return Math.exp(-((d / w) ** 2)); };

// Masstone of each pigment at unit density on white paper.
const PIG = {
  aureolin: [.99, .89, .55], rawSienna: [.93, .70, .46], orange: [.98, .66, .40], rose: [.95, .66, .70], potters: [.86, .72, .76],
  cerulean: [.62, .79, .86], cobalt: [.56, .64, .86], ultra: [.50, .52, .80], indigo: [.44, .47, .58], payne: [.48, .52, .60],
  ochre: [.92, .78, .50], sap: [.66, .75, .42], hooker: [.44, .58, .40], teal: [.47, .72, .70], viridian: [.50, .74, .68],
  neutral: [.66, .62, .62], burnt: [.86, .58, .44], sepia: [.50, .45, .44], gamboge: [.99, .82, .40], sage: [.74, .84, .80]
};
const PAPER = [.965, .945, .906];
const ab = c => c.map(v => -Math.log(Math.max(.03, v)));

function stateAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  const up = sm(5.3, 7.7, h), down = 1 - sm(17.6, 20.4, h);
  const I = Math.min(up, down);
  const N = Math.max(1 - sm(4.8, 6.7, h), sm(19.0, 20.9, h));
  const gold = gauss(h, 7.0, .95) + gauss(h, 18.5, 1.05);
  const rose = gauss(h, 6.15, .65) + gauss(h, 19.55, .75);
  const lz = clamp((h - 13) / 6.2, -1, 1);
  return { h, I, N, gold, rose, lz, noon: gauss(h, 13, 3) };
}

// Words for the caption under the window. Plain, and only what is true of the picture.
function describe(st, weather, train) {
  const h = st.h;
  if (st.N > .85) return h >= 19 || h < .75 ? 'Night. The lamps on the far side are on.' : 'Night. Most of the far side has gone to bed.';
  if (h < 7.2) return 'Early. The light along the middle is coming up from the far end.';
  const extra = weather ? 'Rain on the far side.' : train ? 'A train is going round.' : '';
  if (h < 11.5) return 'Morning' + (extra ? '. ' + extra : ', against the light.');
  if (h < 14) return 'Midday. ' + (extra || 'The light is straight up.');
  if (h < 17.6) return 'Afternoon.' + (extra ? ' ' + extra : '');
  if (h < 19.3) return 'Evening. Lamps are coming on across the way.';
  return 'Dusk. The light along the middle has gone amber.';
}

function palette(st) {
  const { I, N, gold, rose, lz } = st, D = 1 - N, back = sm(0, 1, -lz), front = sm(0, 1, lz);
  const c = {};
  // The light itself: barely there at noon, amber and orange as the spine dims.
  c.halo = [mix(mix(PIG.aureolin, PIG.orange, clamp(gold * 1.2, 0, 1)), PIG.rose, clamp(rose * .5, 0, 1)), (.7 * (1 - gold) + 1.5 * gold + .9 * rose) * (1 - N)];
  c.warm = [mix(mix(PIG.aureolin, PIG.orange, clamp(gold, 0, 1)), PIG.rose, clamp(rose * .6, 0, 1)), (1 + .45 * gold + .2 * rose) * (1 - .6 * N)];
  c.cool = [mix(mix(PIG.cerulean, mix(PIG.ultra, PIG.rose, .12), clamp(rose + gold * .5, 0, 1)), PIG.indigo, N), (1 + .6 * rose + .3 * gold + .4 * N)];
  c.cap = [mix(mix(mix(PIG.sage, PIG.cerulean, .35), PIG.potters, clamp(rose * 1.1 + gold * .3, 0, 1)), PIG.indigo, N), 1 + .3 * rose + 1.6 * N];
  c.ochre = [mix(PIG.ochre, PIG.rawSienna, clamp(gold * .8, 0, 1)), 1 - .25 * N];
  c.green = [mix(PIG.sap, PIG.ochre, clamp(gold * .3, 0, 1)), 1.1 - .2 * N];
  c.woods = [PIG.hooker, 1.15];
  c.water = [mix(mix(PIG.teal, PIG.cobalt, .3 + .35 * rose), PIG.indigo, N * .8), 1.3 + .3 * N];
  c.town = [mix(PIG.neutral, PIG.potters, clamp(rose + gold * .4, 0, 1) * .5), 1.25];
  c.front = [mix(PIG.neutral, PIG.rawSienna, front * gold * .6), .55 + .65 * back * I - .3 * front * I + .25 * N];
  c.side = [PIG.neutral, .8];
  const violet = mix(PIG.ultra, PIG.rose, .32 + .2 * rose);
  c.shadeA = [violet, .12 + 1.05 * back * I];
  c.shadeB = [violet, .12 + 1.05 * front * I];
  c.haze = [mix(mix(PIG.cerulean, mix(PIG.ultra, PIG.potters, .45), clamp(rose * 1.2 + gold * .45, 0, 1)), PIG.indigo, N), .95 + .25 * rose + .2 * N];
  c.dark = [PIG.sepia, 1.25];
  const dim = clamp((1 - I) * (1 - N), 0, 1);
  c.tree = [mix(mix(PIG.sap, PIG.hooker, .5), PIG.indigo, Math.max(N * .5, dim * .55)), 1.9 + .9 * N + 1.3 * dim];
  c.treeDark = [mix(PIG.hooker, PIG.indigo, .4 + .4 * Math.max(N, dim)), 1.6 + .8 * N + .8 * dim];
  c.sand = [PIG.rawSienna, 1];
  c.sienna = [PIG.burnt, 1 - .2 * N];
  c.glow = [PIG.gamboge, .9 * N];
  c.night = [mix(PIG.indigo, PIG.payne, .4), 1.5 * N + 1.05 * (1 - I) * (1 - N)];
  return c;
}

/*
 * Wash the sheet: out = paper * exp(-sum(density * absorption)) * cockle.
 * Written into an ImageData, a band of rows at a time.
 */
async function composite(P, st, img, yieldFn, include) {
  const pal = palette(st), names = P.names, nL = names.length, coef = new Float32Array(nL * 3), isNight = new Uint8Array(nL);
  const only = (typeof location !== 'undefined') && new URLSearchParams(location.search).get('layer');
  if (only) for (const n of names) pal[n] = n === only ? [[.35, .35, .35], 1] : [[1, 1, 1], 0];
  if (include) for (const n of names) if (!include.has(n)) pal[n] = [[1, 1, 1], 0];
  names.forEach((n, k) => { const [col, s] = pal[n] || [[1, 1, 1], 0], a = ab(col); coef[k * 3] = a[0] * s * .01; coef[k * 3 + 1] = a[1] * s * .01; coef[k * 3 + 2] = a[2] * s * .01; isNight[k] = n === 'night' ? 1 : 0; });
  const layers = names.map(n => P.layers[n]), keep = P.keep, glow = P.glow, ck = P.cockle, data = img.data, W = P.W, H = P.H;
  // How much the spine's glow lifts the land: full by day, none at night.
  const gl = .62 * st.I / 255, noGlow = new Uint8Array(nL); names.forEach((n, k) => { noGlow[k] = (n === 'night' || n === 'dark' || n === 'tree' || n === 'treeDark' || n === 'front' || n === 'side' || n === 'halo') ? 1 : 0; });
  // While the spine is on, its glow keeps the dark glaze off the air around it.
  const ngl = .9 * clamp(st.I * 1.6, 0, 1) / 255;
  let last = performance.now();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let r = 0, g = 0, b = 0, nr = 0, ng = 0, nb = 0;
      const lift = 1 - glow[i] * gl;
      for (let k = 0; k < nL; k++) {
        const d = layers[k][i]; if (!d) continue;
        if (isNight[k]) { const nl = 1 - glow[i] * ngl; nr += d * coef[k * 3] * nl; ng += d * coef[k * 3 + 1] * nl; nb += d * coef[k * 3 + 2] * nl; }
        else if (noGlow[k]) { nr += d * coef[k * 3]; ng += d * coef[k * 3 + 1]; nb += d * coef[k * 3 + 2]; }
        else { r += d * coef[k * 3] * lift; g += d * coef[k * 3 + 1] * lift; b += d * coef[k * 3 + 2] * lift; }
      }
      const kp = keep[i] / 255, c = ck[i] * 255, j = i * 4;
      data[j] = PAPER[0] * c * Math.exp(-(r * kp + nr));
      data[j + 1] = PAPER[1] * c * Math.exp(-(g * kp + ng));
      data[j + 2] = PAPER[2] * c * Math.exp(-(b * kp + nb));
      data[j + 3] = 255;
    }
    if (yieldFn && (y & 15) === 15 && performance.now() - last > 12) { await yieldFn(); last = performance.now(); }
  }
  return img;
}

G.Light = { stateAt, palette, composite, describe, PIG, PAPER, sm, mix, gauss };
})(window.SkyWindow = window.SkyWindow || {});

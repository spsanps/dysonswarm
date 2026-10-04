/*
 * THE ORBITAL RING: map labels on the world outside the window.
 * Small labels for what you can see: cities, coastlines, bays, lakes, ranges, states,
 * countries and the other stations. Each fades with distance (the farther, the more
 * important it must be to show), hides below the horizon and behind the car's frame,
 * and gives way to a more important neighbour instead of overlapping it.
 */
const D2R = Math.PI / 180;
const RG = 6371, RING_ALT = 300;

/* [name, lat, lon, kind, tier]. Tiers: 0 seen from anywhere up high, 4 only close by.
   kinds: c city, w water, r region, s state, n country, f feature (a point) */
const PLACES = [
  ['Pacific Ocean', 33.5, -131, 'w', 0], ['United States', 40.2, -110.5, 'n', 0], ['Mexico', 28.6, -109.6, 'n', 0], ['Canada', 51.3, -118.5, 'n', 0],
  ['California', 37.0, -119.2, 's', 1], ['Nevada', 39.6, -116.6, 's', 1], ['Oregon', 43.9, -120.6, 's', 1], ['Arizona', 34.4, -111.8, 's', 1],
  ['Utah', 39.0, -111.2, 's', 1], ['Idaho', 44.2, -114.8, 's', 1], ['Washington', 47.4, -120.3, 's', 1], ['Baja California', 29.8, -114.6, 's', 1],
  ['Los Angeles', 34.05, -118.25, 'c', 1], ['San Francisco', 37.775, -122.42, 'c', 1], ['San Diego', 32.72, -117.16, 'c', 1], ['San Jose', 37.34, -121.89, 'c', 1],
  ['Sacramento', 38.58, -121.49, 'c', 1], ['Las Vegas', 36.17, -115.14, 'c', 1], ['Phoenix', 33.45, -112.07, 'c', 1], ['Salt Lake City', 40.76, -111.89, 'c', 1],
  ['Portland', 45.52, -122.68, 'c', 1], ['Seattle', 47.61, -122.33, 'c', 1], ['Vancouver', 49.28, -123.12, 'c', 1], ['Tijuana', 32.51, -117.04, 'c', 1],
  ['Denver', 39.74, -104.99, 'c', 1], ['Gulf of California', 28.3, -112.3, 'w', 1], ['Great Salt Lake', 41.15, -112.55, 'w', 1],
  ['San Francisco Bay', 37.68, -122.24, 'w', 1], ['Monterey Bay', 36.82, -121.98, 'w', 1], ['Lake Tahoe', 39.09, -120.04, 'w', 1], ['Salton Sea', 33.30, -115.83, 'w', 1],
  ['Oakland', 37.80, -122.27, 'c', 2], ['Fresno', 36.74, -119.79, 'c', 2], ['Bakersfield', 35.37, -119.02, 'c', 2], ['Stockton', 37.96, -121.29, 'c', 2],
  ['Modesto', 37.64, -120.99, 'c', 2], ['Reno', 39.53, -119.81, 'c', 2], ['Santa Barbara', 34.42, -119.70, 'c', 2], ['Santa Rosa', 38.44, -122.71, 'c', 2],
  ['Eureka', 40.80, -124.16, 'c', 2], ['Redding', 40.59, -122.39, 'c', 2], ['Tucson', 32.22, -110.97, 'c', 2], ['Boise', 43.62, -116.20, 'c', 2],
  ['Eugene', 44.05, -123.09, 'c', 2], ['Ensenada', 31.87, -116.60, 'c', 2], ['Mexicali', 32.62, -115.45, 'c', 2], ['Palm Springs', 33.83, -116.55, 'c', 2],
  ['Sierra Nevada', 37.6, -119.0, 'r', 2], ['Central Valley', 36.6, -120.2, 'r', 2], ['Great Basin', 39.8, -117.0, 'r', 2], ['Mojave Desert', 35.0, -116.1, 'r', 2],
  ['Death Valley', 36.45, -117.05, 'r', 2], ['Cascade Range', 44.6, -121.9, 'r', 2], ['Sonoran Desert', 32.3, -113.3, 'r', 2], ['Coast Ranges', 39.7, -123.3, 'r', 2],
  ['Channel Islands', 33.98, -119.75, 'f', 2], ['Point Reyes', 38.00, -122.98, 'f', 2], ['Big Sur', 36.27, -121.81, 'f', 2], ['Cape Mendocino', 40.44, -124.41, 'f', 2],
  ['Mount Shasta', 41.41, -122.19, 'f', 2], ['Yosemite Valley', 37.74, -119.59, 'f', 2], ['Point Conception', 34.45, -120.47, 'f', 2], ['Puget Sound', 47.6, -122.55, 'w', 2],
  ['Santa Cruz', 36.97, -122.03, 'c', 3], ['Monterey', 36.60, -121.89, 'c', 3], ['Palo Alto', 37.44, -122.14, 'c', 3], ['Berkeley', 37.87, -122.27, 'c', 3],
  ['San Mateo', 37.56, -122.32, 'c', 3], ['Golden Gate', 37.81, -122.48, 'f', 3], ['Half Moon Bay', 37.46, -122.43, 'c', 3], ['Pacifica', 37.62, -122.49, 'c', 3],
  ['Silicon Valley', 37.39, -122.03, 'r', 3], ['Santa Cruz Mountains', 37.17, -122.10, 'r', 3], ['Marin Headlands', 37.84, -122.53, 'f', 3],
  ['Farallon Islands', 37.70, -123.00, 'f', 4], ['Pillar Point', 37.495, -122.50, 'f', 4], ['Año Nuevo', 37.11, -122.33, 'f', 4],
];
/* how far (km) each tier stays readable */
const FAR = [4200, 2300, 1050, 300, 95];

/* the other stations: short names (index = station number) */
const STATION_SHORT = ['off Half Moon Bay', 'New Mexico', 'Alabama', 'the Atlantic', 'the Atlantic', 'the Atlantic', 'the Atlantic',
  'the South Atlantic', 'the South Atlantic', 'the South Atlantic', 'South Africa', 'the Indian Ocean', 'the Indian Ocean', 'the Indian Ocean',
  'the Indian Ocean', 'the Indian Ocean', 'Western Australia', 'the Arafura Sea', 'the Pacific', 'the Pacific', 'the Pacific', 'the Pacific',
  'the Pacific', 'the Pacific'];

/* the car's cabin (twin of carInterior in shaders.js): can you see out along d? */
const CAB_R = 1.45, CAB_FLOOR = -1.48, DOME_Y = .95;
const sdRoundRect = (x, y, bx, by, r) => { const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
function windowSDF(s, y) { const az = s / CAB_R, da = az - Math.floor(az / 1.0471976 + .5) * 1.0471976; return sdRoundRect(da * CAB_R, y - .16, .40 * CAB_R, .72, .2); }
function seenFromCar(d) {
  const dd = d[0] * d[0] + d[2] * d[2], tW = dd > 1e-8 ? CAB_R / Math.sqrt(dd) : 1e9, yW = d[1] * tW;
  if (yW > DOME_Y) {
    const b = d[1] * DOME_Y, c = DOME_Y * DOME_Y - CAB_R * CAB_R, t = b + Math.sqrt(Math.max(b * b - c, 0));
    const Q = [d[0] * t, d[1] * t - DOME_Y, d[2] * t];
    const az = Math.atan2(Q[2], Q[0]), el = Math.asin(Math.min(1, Math.max(0, Q[1] / CAB_R))), ca = Math.cos(el) * CAB_R;
    const m = ((az % 1.0472) + 1.0472) % 1.0472;
    const frame = Math.min(Math.min(Math.abs(m - .5236) * ca - .03, Math.abs(el - .72) * CAB_R - .025), Math.min(el * CAB_R - .07, (1.5708 - el) * CAB_R - .025));
    return frame > .01;
  }
  if (yW < CAB_FLOOR) { const t = CAB_FLOOR / d[1]; return Math.hypot(d[0] * t - .55, d[2] * t) < .33; }
  const P = [d[0] * tW, d[1] * tW, d[2] * tW], s = Math.atan2(P[2], P[0]) * CAB_R;
  const tO = (CAB_R + .12) / Math.sqrt(dd), PO = [d[0] * tO, d[1] * tO, d[2] * tO];
  return windowSDF(s, P[1]) < -.02 && windowSDF(Math.atan2(PO[2], PO[0]) * CAB_R, PO[1]) < -.02;
}
/* the gallery pod (twin of galleryInterior): glazed all round but for its floor plates and hatch */
function seenFromPod(d0, podAng) {
  const ca = Math.cos(podAng), sa = Math.sin(podAng);
  const d = [ca * d0[0] - sa * d0[1], sa * d0[0] + ca * d0[1], d0[2]];
  if (d[1] < 0) { const t = -1.6 / d[1], r = Math.hypot(d[0] * t + .6, d[2] * t); if (r < 2.3 && r >= 1.5) return false; }
  const el = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const b = [0, 42 / Math.hypot(42, 30), -30 / Math.hypot(42, 30)];
  return el > -1.5 && d[0] * b[0] + d[1] * b[1] + d[2] * b[2] < .955;
}

export function createLabels(root, geoToFrame) {
  const els = [];
  const make = (text, kind, sub) => {
    const el = document.createElement('div');
    el.className = 'lab lab-' + kind;
    el.innerHTML = '<div class="in">' + (kind === 'c' || kind === 'f' || kind === 'x' ? '<i></i>' : '') + '<span></span>' + (sub ? '<small></small>' : '') + '</div>';
    el.querySelector('span').textContent = text;
    if (sub) el.querySelector('small').textContent = sub;
    root.appendChild(el);
    return el;
  };
  const items = PLACES.map(([name, lat, lon, kind, tier]) => ({ name, lat, lon, kind, tier, el: make(name, kind), a: 0, w: 0 }));
  const stations = [];
  for (let j = -3; j <= 3; j++) if (j) stations.push({ j, kind: 'x', tier: 1, el: make('Station', 'x', ' '), a: 0, w: 0, K: null });
  let cacheK = null;

  function update(v) {
    /* v: { camE (km, frame K), K, project(dirArray) -> [u, v] | null, mode, podAng, hidden } */
    const W = innerWidth, H = innerHeight;
    if (cacheK !== v.K) {   /* positions of everything in this station's frame */
      cacheK = v.K;
      for (const it of items) it.P = geoToFrame(it.lat, it.lon, 0, v.K);
      for (const s of stations) {
        const th = s.j * 15 * D2R, r = RG + RING_ALT, k = (((v.K + s.j) % 24) + 24) % 24;
        s.P = [Math.sin(th) * r, Math.cos(th) * r, 0];
        s.el.querySelector('span').textContent = 'Station ' + k;
        s.el.querySelector('small').textContent = STATION_SHORT[k];
      }
    }
    const C = v.camE, cr = Math.hypot(C[0], C[1], C[2]), alt = cr - RG;
    const cand = [];
    const consider = (it, isStation) => {
      const P = it.P, d = [P[0] - C[0], P[1] - C[1], P[2] - C[2]], dist = Math.hypot(d[0], d[1], d[2]);
      let vis = !v.hidden && dist > .8;
      /* below the horizon? (a surface point is visible when the camera is above its horizon plane;
         a station when the line to it clears the Earth) */
      if (vis && !isStation) vis = (C[0] * P[0] + C[1] * P[1] + C[2] * P[2]) / RG > RG + .02;
      if (vis && isStation) {
        const t = -(C[0] * d[0] + C[1] * d[1] + C[2] * d[2]) / (dist * dist);
        if (t > 0 && t < 1) { const q = [C[0] + d[0] * t, C[1] + d[1] * t, C[2] + d[2] * t]; vis = Math.hypot(q[0], q[1], q[2]) > RG + 20; }
      }
      const far = isStation ? 4500 : FAR[it.tier] * (it.tier >= 3 ? 1 : Math.min(1, .35 + alt / 60));
      let target = vis ? 1 - Math.min(1, Math.max(0, (dist - far * .55) / (far * .45))) : 0;
      if (target > 0) {
        const n = [d[0] / dist, d[1] / dist, d[2] / dist];
        if (!(v.mode === 1 ? seenFromPod(n, v.podAng) : seenFromCar(n))) target = 0;
        const s = target > 0 ? v.project(n) : null;
        if (!s || s[0] < .01 || s[0] > .99 || s[1] < .04 || s[1] > .96) target = 0;
        else { it.x = s[0] * W; it.y = (1 - s[1]) * H; }
      }
      it.target = target; it.dist = dist;
      if (target > 0 || it.a > .01) cand.push(it);
    };
    for (const it of items) consider(it, false);
    for (const s of stations) consider(s, true);
    /* more important (then nearer) labels claim their space first */
    cand.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
    const boxes = [];
    for (const it of cand) {
      if (it.target > 0) {
        if (!it.w) { const r = it.el.getBoundingClientRect(); it.w = r.width || 80; it.h = r.height || 14; }
        const x0 = it.x - (it.kind === 'c' || it.kind === 'f' || it.kind === 'x' ? 4 : it.w / 2), y0 = it.y - it.h / 2;
        const box = [x0 - 6, y0 - 3, x0 + it.w + 6, y0 + it.h + 3];
        if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) it.target = 0;
        else boxes.push(box);
      }
      it.a += (it.target - it.a) * .12;
      if (it.a < .01 && it.target === 0) { if (it.shown) { it.el.style.opacity = '0'; it.shown = false; } continue; }
      it.shown = true;
      it.el.style.opacity = it.a.toFixed(3);
      if (it.target > 0) it.el.style.transform = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)`;
    }
    for (const it of items.concat(stations)) if (it.shown && !cand.includes(it)) { it.el.style.opacity = '0'; it.shown = false; it.a = 0; }
  }
  return { update };
}

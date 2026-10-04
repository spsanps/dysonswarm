// The mind: an imagined computer grown across Triton.
// A network grows from a dish near the south pole (where Earth never sets at this season):
// hubs linked home by trunk lines, then branching dendrites. Radiator fields grow round the
// hubs and along the branches. Everything has a birth year, so time can run backwards.
import { R, FIN, V, rng, latLonDir, tangentFrame, heightAt, D2R } from './world.js';

// Time. Internally growth runs in steps 0..YEARS (birth times, build times and the shaders all
// use these); on screen they are calendar years: the first hall in 2050, the whole moon wired by
// about 2087 (step GROWN), fifteen steps a year.
export const YEARS = 600;                       // the slider runs from the first hall to here
export const GROWN = 560;                       // the last branch is built
export const YEAR0 = 2050, STEPS_PER_YEAR = 15;
export const calendarYear = step => YEAR0 + step / STEPS_PER_YEAR;
export const DISH = latLonDir(-64, 172);         // the dish that sends results home
export const LANDING = latLonDir(-60, 0);        // where you land first: Neptune due north, 30° up
export const LANDING_HEADING = 0;               // look north, up the avenue

const KM = R / 1000;
const slerp = (a, b, t) => {
  const d = Math.acos(Math.max(-1, Math.min(1, V.dot(a, b))));
  if (d < 1e-9) return a;
  const s = Math.sin(d);
  return V.add(V.mul(a, Math.sin((1 - t) * d) / s), V.mul(b, Math.sin(t * d) / s));
};
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(a, b))));
/** Move `d` metres from point p along bearing az (degrees clockwise from north). */
export function offset(p, az, d) {
  const { east, north } = tangentFrame(p);
  const t = V.add(V.mul(north, Math.cos(az * D2R)), V.mul(east, Math.sin(az * D2R)));
  return V.norm(V.add(V.mul(p, Math.cos(d / R)), V.mul(t, Math.sin(d / R))));
}

// Two nitrogen geysers like the ones Voyager 2 saw near 50° S: 8 km columns, trails ~150 km
// long carried west by the thin wind. One is in view of the landing site.
const LAND_FIELD = offset(LANDING, 0, 2000);
export const GEYSERS = [
  { p: offset(LANDING, -10.5, 19000), wind: -78 },
  { p: latLonDir(-50, 26), wind: -96 },
];

// ---------------------------------------------------------------------------
export function growNetwork() {
  const r = rng(4242);
  const randDir = () => { const z = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(t), s * Math.sin(t), z]; };
  const root = DISH;
  // 1. hubs (the dish first, the landing field second)
  const hubSep = 330 / KM;
  const hubs = [root, LAND_FIELD];
  for (let tries = 0; tries < 20000 && hubs.length < 70; tries++) {
    const p = randDir();
    if (hubs.every(h => ang(h, p) > hubSep * (.85 + .3 * r()))) hubs.push(p);
  }
  // 2. trunks: a spanning tree from the dish, subdivided every ~22 km
  const seg = 22 / KM;
  const nodes = [{ p: root, parent: -1, birth: 0, path: 0, kind: 2 }];
  const hubNode = new Int32Array(hubs.length).fill(-1); hubNode[0] = 0;
  const inTree = new Uint8Array(hubs.length); inTree[0] = 1;
  const best = hubs.map(h => ang(h, root)), from = new Int32Array(hubs.length);
  for (let k = 1; k < hubs.length; k++) {
    let bi = -1, bd = 9;
    for (let i = 0; i < hubs.length; i++) if (!inTree[i] && best[i] < bd) { bd = best[i]; bi = i; }
    inTree[bi] = 1;
    const a = hubs[from[bi]], b = hubs[bi];
    const n = Math.max(1, Math.round(ang(a, b) / seg));
    let prev = hubNode[from[bi]];
    const b0 = nodes[prev].birth;
    for (let s = 1; s <= n; s++) {
      const p = V.norm(slerp(a, b, s / n));
      nodes.push({ p, parent: prev, birth: b0 + s * .6, path: nodes[prev].path + ang(nodes[prev].p, p) * R, kind: s === n ? 2 : 1, hub: bi });
      prev = nodes.length - 1;
    }
    hubNode[bi] = prev;
    for (let i = 0; i < hubs.length; i++) if (!inTree[i]) { const d = ang(hubs[i], b); if (d < best[i]) { best[i] = d; from[i] = bi; } }
  }
  // 3. dendrites by space colonisation, towards attractors clustered round the hubs
  const step = 18 / KM, infl = 170 / KM, kill = 28 / KM;
  const att = [];
  while (att.length < 9000) {
    if (r() < .78) {
      const h = hubs[Math.floor(r() * hubs.length)], d = randDir();
      const t = V.norm(V.sub(d, V.mul(h, V.dot(d, h)))), a = Math.pow(r(), .7) * hubSep * .7;
      att.push(V.norm(V.add(V.mul(h, Math.cos(a)), V.mul(t, Math.sin(a)))));
    } else att.push(randDir());
  }
  const cs = infl, grid = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const addNode = i => { const p = nodes[i].p, k = key(Math.floor(p[0] / cs), Math.floor(p[1] / cs), Math.floor(p[2] / cs)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); };
  nodes.forEach((_, i) => addNode(i));
  const near = (p, rad) => {
    const out = [], n = Math.ceil(rad / cs), bx = Math.floor(p[0] / cs), by = Math.floor(p[1] / cs), bz = Math.floor(p[2] / cs);
    for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) { const l = grid.get(key(bx + x, by + y, bz + z)); if (l) for (const i of l) out.push(i); }
    return out;
  };
  const alive = att.map(() => true);
  for (let it = 0; it < 400 && nodes.length < 24000; it++) {
    const pull = new Map();
    let any = false;
    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      const p = att[a];
      let bi = -1, bd = infl;
      for (const i of near(p, infl)) { const d = V.len(V.sub(nodes[i].p, p)); if (d < bd) { bd = d; bi = i; } }
      if (bi < 0) continue;
      any = true;
      if (bd < kill) { alive[a] = false; continue; }
      const dir = V.norm(V.sub(p, nodes[bi].p)), acc = pull.get(bi) || [0, 0, 0];
      acc[0] += dir[0]; acc[1] += dir[1]; acc[2] += dir[2];
      pull.set(bi, acc);
    }
    if (!any) break;
    for (const [i, acc] of pull) {
      const n0 = nodes[i].p;
      let d = V.norm(acc);
      d = V.norm(V.sub(d, V.mul(n0, V.dot(d, n0))));
      const j = randDir(); d = V.norm(V.add(d, V.mul(V.sub(j, V.mul(n0, V.dot(j, n0))), .35)));
      const p = V.norm(V.add(n0, V.mul(d, step)));
      let clash = false;
      for (const k of near(p, step)) if (V.len(V.sub(nodes[k].p, p)) < step * .6) { clash = true; break; }
      if (clash) continue;
      nodes.push({ p, parent: i, birth: nodes[i].birth + 1, path: nodes[i].path + step * R, kind: 0 });
      addNode(nodes.length - 1);
    }
  }
  const leaves = new Float32Array(nodes.length).fill(1);
  for (let i = nodes.length - 1; i > 0; i--) leaves[nodes[i].parent] += leaves[i];
  let maxBirth = 0;
  nodes.forEach((n, i) => { n.leaves = leaves[i]; maxBirth = Math.max(maxBirth, n.birth); });
  const ys = (YEARS - 40) / maxBirth;
  nodes.forEach(n => { n.year = n.birth * ys; });
  return { nodes, hubs, hubNode };
}

// ---------------------------------------------------------------------------
/** Radiator fields round the hubs and along the branches. */
export function makeFields(net) {
  const r = rng(77);
  const fields = [];
  const tooClose = (c, rad) => fields.some(f => ang(f.c, c) * R < f.r + rad + 2500)
    || GEYSERS.some(g => ang(g.p, c) * R < rad + 3500);
  const avenueTo = (c, q) => { const t = V.sub(q, V.mul(c, V.dot(q, c))); return V.len(t) > 1e-9 ? V.norm(t) : tangentFrame(c).north; };
  net.nodes.forEach((n, i) => {
    let rad, kind = 0, years = 16;
    if (i === 0) { rad = 30000; kind = 2; years = 60; }
    else if (n.kind === 2) { rad = n.hub === 1 ? 15000 : 26000 + 18000 * r(); kind = n.hub === 1 ? 3 : 1; years = 45; }
    else if (n.kind === 0 && i % 5 === 0) rad = 7000 + 9000 * r();
    else return;
    const c = kind === 3 ? LAND_FIELD : n.p;
    if (kind === 0 && tooClose(c, rad)) return;
    const par = n.parent >= 0 ? net.nodes[n.parent].p : (net.nodes[1] ? net.nodes[1].p : V.add(c, [0, 0, 1]));
    const a = kind === 3 ? tangentFrame(c).north : avenueTo(c, par);
    fields.push({ c, r: rad, a, birth: kind === 2 ? 0 : n.year, years, kind, seed: r(), node: i });
  });
  return fields;
}

/** Field ids on an equirectangular map: each texel holds the nearest field that could cover it. */
export function fieldMap(fields, W = 2048, H = 1024) {
  const map = new Uint8Array(W * H * 4), dist = new Float32Array(W * H).fill(1e9);
  fields.forEach((f, idx) => {
    const id = idx + 1, rr = f.r * 1.08 / R;
    const lat = Math.asin(f.c[2]), lon = Math.atan2(f.c[1], f.c[0]);
    const y0 = Math.max(0, Math.floor((lat - rr) / Math.PI * H + H / 2) - 1), y1 = Math.min(H - 1, Math.ceil((lat + rr) / Math.PI * H + H / 2) + 1);
    for (let y = y0; y <= y1; y++) {
      const la = (y + .5 - H / 2) / H * Math.PI, dl = Math.min(Math.PI, rr / Math.max(.02, Math.cos(la)) + 2 * Math.PI / W);
      const x0 = Math.floor((lon - dl) / (2 * Math.PI) * W + W / 2) - 1, x1 = Math.ceil((lon + dl) / (2 * Math.PI) * W + W / 2) + 1;
      for (let xx = x0; xx <= x1; xx++) {
        const x = ((xx % W) + W) % W, lo = (x + .5 - W / 2) / W * 2 * Math.PI;
        const p = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
        // texel-sized margin so the exact disc test in the shader never misses an edge
        const d = ang(p, f.c) - rr - 1.5 * Math.PI / H;
        if (d < 0 && d < dist[y * W + x]) { dist[y * W + x] = d; const o = (y * W + x) * 4; map[o] = id & 255; map[o + 1] = id >> 8; }
      }
    }
  });
  return { map, W, H };
}
/** Field data for the GPU: an RGBA32F texture, one column per field, three rows. */
export function fieldData(fields) {
  const n = fields.length, d = new Float32Array(n * 12);
  fields.forEach((f, i) => {
    d.set([f.c[0] * R, f.c[1] * R, f.c[2] * R, f.r], (0 * n + i) * 4);
    d.set([f.a[0], f.a[1], f.a[2], f.birth], (1 * n + i) * 4);
    d.set([f.years, f.kind, f.seed, i], (2 * n + i) * 4);
  });
  return d;
}

/** The lattice: trunk and branch lines on pylons 470 m up, three spans per edge. Per span:
 *  A xyz, B xyz, width class, birth year, path at A, path at B, leaves (11 floats). */
export function lattice(net) {
  const out = [];
  const lift = p => { const h = heightAt(p); return V.mul(p, R + Math.max(h, 0) + FIN.conduit + Math.min(0, h) * .3); };
  net.nodes.forEach(n => {
    if (n.parent < 0) return;
    const p = net.nodes[n.parent];
    const w = (n.kind === 1 ? 1.3 : .8) + Math.min(4.4, Math.log2(n.leaves) * .5);
    let prev = lift(p.p);
    for (let s = 1; s <= 3; s++) {
      const q = s === 3 ? n.p : V.norm(slerp(p.p, n.p, s / 3)), Q = lift(q);
      const pa = p.path + (n.path - p.path) * (s - 1) / 3, pb = p.path + (n.path - p.path) * s / 3;
      out.push(prev[0], prev[1], prev[2], Q[0], Q[1], Q[2], w, n.year, pa / 1000, pb / 1000, n.leaves);
      prev = Q;
    }
  });
  return new Float32Array(out);
}

// ---------------------------------------------------------------------------
// The numbers. All imagined, but worked out from the radiators on screen (the notes show the method).
// Power is fusion; every watt of it ends up as heat, and in a vacuum the only way to lose heat is to
// glow, so the radiators set the power. Panels both sides, 390 m tall, 500 m long with 80 m gaps,
// rows 250 m apart. At 330 K with emissivity 0.9 each face glows σT⁴·ε ≈ 605 W/m², but neighbouring
// rows fill 55% of its view (parallel plates: √(1+(250/390)²) − 250/390), so it sheds about 45% of
// that net: ≈ 272 W/m² per face.
export const RADIATOR = { T: 330, emissivity: .9, escape: .45 };
export const FLUX = RADIATOR.emissivity * 5.670e-8 * RADIATOR.T ** 4 * RADIATOR.escape;   // W per m² of panel face
export const ELECTRIC = .5;        // the plants turn about half their heat into electricity
export const J_PER_OP = 1e-20;     // cold superconducting reversible logic, 2080s, all in
export const AI_CLUSTER = 1e20;    // operations a second, today's largest AI clusters
export const FIN_AREA_PER_GROUND = 2 * FIN.height * FIN.len / (FIN.len + FIN.gap) / FIN.rowGap;
export function numbers(fields, year) {
  let ground = 0, active = 0;
  for (const f of fields) {
    if (year <= f.birth) continue;
    active++;
    const g = Math.min(1, (year - f.birth) / f.years);
    ground += Math.PI * f.r * f.r * .82 * g;
  }
  const radiator = ground * FIN_AREA_PER_GROUND, heat = radiator * FLUX, compute = heat * ELECTRIC / J_PER_OP;
  return { ground, radiator, heat, compute, share: ground / (4 * Math.PI * R * R), active,
    ai: compute / AI_CLUSTER, solarRatio: heat / 2.08e12 };   // Triton absorbs about 2 TW of sunlight
}

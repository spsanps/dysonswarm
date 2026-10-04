// The trip's world: one screenprinted solar system laid out as a strip that runs out from the
// Sun. Landscape screens travel left to right; portrait screens travel top to bottom, so a
// phone's scroll goes the way the trip goes. Every place is a frame (FW × FH scene units) shown
// like CSS object-fit: cover around a focal point; the camera glides from frame to frame.
//
// The strip is a map, not a scale model: the order is true and each card gives the real
// distance, but the gaps are drawn to fit a screen.
import { norm } from './math.js';

export const PORTRAIT_QUERY = '(max-aspect-ratio: 19/20)';
export const STILL_T = 16;   // the moment the stills show, in seconds

export const INK = {
  NAVY: '#151b32', DEEP: '#0e1226', CREAM: '#f2e7cb', PAPER: '#ebe1c8', YELLOW: '#f6c444', ORANGE: '#ff6b2f',
  // Venus poster
  RED: '#cf2f25', GOLD: '#e2a62f', SLATE: '#7f9ba1', BLACK: '#1c1816',
  // Orbital Ring poster
  CERISE: '#e3346b', TEAL: '#16a0b2', OCEAN: '#1b5c97',
  // Another Sky poster
  SEA: '#5f9f92', SKY: '#a9cfc5', SAND: '#e2bd74', CORAL: '#de6848', MOSS: '#2b6b68', OLIVE: '#86955a',
  // Triton poster
  COBALT: '#3068ce', AZURE: '#62aaec', ICE: '#efc9c2', WIRE: '#f0c35a', AMBER: '#ffb84a', ABYSS: '#17225a',
};

export const STOPS = ['swarm', 'venus', 'ring', 'sky', 'triton'];

const L = {
  FW: 1600, FH: 1000, fx: .6, fy: .4,
  frames: { swarm: [0, 0], statement: [400, 575], venus: [1900, 0], ring: [3800, 0], sky: [5600, 0], triton: [9300, 0], outro: [10900, 0] },
  SUN: [1100, 400], SR: 250,
  MERCURY: [292, 548], MR: 86,
  VENUS: [3160, 430], VR: 152,
  EARTH: [4815, 440], ER: 248, MOON: [5255, 160], MOR: 34,
  HAB: [6680, 420], HL: 420, HR: 180, HA: -.2,
  MARS: [7180, 300], MAR: 26,
  BELT: [7520, 7820],
  JUPITER: [8020, 650], JR: 112,
  SATURN: [8560, 270], SAR: 74,
  URANUS: [8980, 660], UR: 44,
  NEPTUNE: [10360, 410], NR: 268,
  TRITON: [9880, 215], TR: 70,
  // on the way: a comet near the Sun, an asteroid under tow and a convoy past Venus, traffic from
  // the Moon to the cylinder, the Kuiper belt past Neptune
  COMET: [2120, 1040], CR: 10,
  SAIL: [1720, 745], SAILR: 46,
  TUG: [3630, 240], TGR: 42,
  CONVOY: [[3200, 860], [3420, 760], [3780, 640]],
  TRAFFIC: [[5290, 175], [5700, 40], [6150, 180], [6420, 455]],
  KUIPER: [12000, 12450],
  q: .72,
};
const P = {
  FW: 1000, FH: 1800, fx: .5, fy: .34,
  frames: { swarm: [0, 0], statement: [0, 760], venus: [0, 2150], ring: [0, 4300], sky: [0, 6400], triton: [0, 10500], outro: [0, 12300] },
  SUN: [585, 600], SR: 262,
  MERCURY: [232, 1105], MR: 84,
  VENUS: [520, 2150 + 900], VR: 150,
  EARTH: [520, 4300 + 660], ER: 232, MOON: [850, 4300 + 250], MOR: 30,
  HAB: [500, 6400 + 650], HL: 360, HR: 154, HA: -1.25,
  MARS: [300, 8200], MAR: 24,
  BELT: [8480, 8760],
  JUPITER: [680, 9150], JR: 105,
  SATURN: [290, 9640], SAR: 66,
  URANUS: [720, 10080], UR: 40,
  NEPTUNE: [560, 10500 + 700], NR: 250,
  TRITON: [250, 10500 + 330], TR: 62,
  COMET: null, CR: 8,
  SAIL: [835, 1010], SAILR: 34,
  TUG: [720, 4110], TGR: 36,
  CONVOY: [[260, 3930], [420, 4080], [640, 4270]],
  TRAFFIC: [[960, 6420], [880, 6560], [700, 6690], [530, 6760]],
  KUIPER: [12360, 12640],
  q: .72,
};

const cache = new Map();
export function world(mode) {
  if (cache.has(mode)) return cache.get(mode);
  const b = mode === 'portrait' ? P : L;
  const w = { mode, ...b };
  // light comes from the Sun: unit vector from a body toward the Sun
  w.light = p => norm([b.SUN[0] - p[0], b.SUN[1] - p[1]]);
  // planet orbits: ellipses about the Sun (semi-axes r and q·r) through each planet
  const orbit = (name, p, extra = {}) => {
    const dx = p[0] - b.SUN[0], dy = (p[1] - b.SUN[1]) / b.q;
    return { name, r: Math.hypot(dx, dy), a: Math.atan2(dy, dx), ...extra };
  };
  w.orbits = [
    orbit('mercury', b.MERCURY), orbit('venus', b.VENUS), orbit('earth', b.EARTH),
    orbit('mars', b.MARS), orbit('jupiter', b.JUPITER), orbit('saturn', b.SATURN),
    orbit('uranus', b.URANUS), orbit('neptune', b.NEPTUNE),
  ];
  w.plates = plates(w);
  cache.set(mode, w);
  return w;
}

// The camera for a W × H CSS-pixel stage: k CSS px per unit, and the view's top-left corner in
// world units when it shows frame origin F (cover framing around the focal point).
export function lens(w, W, H) {
  const k = Math.max(W / w.FW, H / w.FH);
  const vw = W / k, vh = H / k;
  return { k, vw, vh, at: F => [F[0] + (w.FW - vw) * w.fx, F[1] + (w.FH - vh) * w.fy] };
}

// A plate's pixel rectangle at k device px per unit: its box snapped outward to whole pixels.
export function plateRect(box, k) {
  const x0 = Math.floor(box[0] * k), y0 = Math.floor(box[1] * k), x1 = Math.ceil(box[2] * k), y1 = Math.ceil(box[3] * k);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// Plates: what holds still, printed once per screen size in a worker. Each has a box in world
// units and the stop it belongs to (so it can be printed ahead of the camera).
function plates(w) {
  const box = (c, rx, ry = rx) => [c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry];
  const { SUN, SR, MERCURY, MR, VENUS, VR, EARTH, ER, MOON, HAB, HL, HR, MARS, MAR, JUPITER, JR, SATURN, SAR, URANUS, UR, NEPTUNE, NR, TRITON, TR } = w;
  const land = w.mode === 'landscape';
  const vbox = land ? [VENUS[0] - VR * 5, VENUS[1] - VR * 2.6, VENUS[0] + VR * 1.3, VENUS[1] + VR * 2.6]
    : [VENUS[0] - VR * 2.65, VENUS[1] - VR * 4.6, VENUS[0] + VR * 2.65, VENUS[1] + VR * 1.3];
  // the swarm's orbit lines and far stipple: behind the Sun (z 0) and in front of it (z 2)
  const sw = [Math.min(SUN[0] - SR * 3.45, MERCURY[0] - MR * 1.3), Math.min(SUN[1] - SR * 1.34, MERCURY[1] - MR * 1.3), Math.max(SUN[0] + SR * 3.45, MERCURY[0] + MR * 1.3), Math.max(SUN[1] + SR * 1.34, MERCURY[1] + MR * 1.3)];
  return [
    { id: 'swarm-back', stop: 0, box: sw, z: 0 },
    { id: 'sun', stop: 0, box: box(SUN, SR + 300, SR + 300) },
    { id: 'swarm-front', stop: 0, box: sw, z: 2 },
    { id: 'mercury', stop: 0, box: box(MERCURY, MR + 70, MR + 70) },
    { id: 'venus', stop: 1, box: vbox },
    { id: 'earth', stop: 2, box: [Math.min(EARTH[0] - ER * 1.25, MOON[0] - 60), Math.min(EARTH[1] - ER * 1.25, MOON[1] - 60), Math.max(EARTH[0] + ER * 1.25, MOON[0] + 60), Math.max(EARTH[1] + ER * 1.25, MOON[1] + 60)] },
    { id: 'habitat', stop: 3, box: box(HAB, HL + HR + 60, HL + HR + 60) },
    { id: 'mars', stop: 3.5, box: box(MARS, MAR * 2.4) },
    { id: 'jupiter', stop: 3.6, box: box(JUPITER, JR * 1.5) },
    { id: 'saturn', stop: 3.75, box: box(SATURN, SAR * 2.5, SAR * 1.5) },
    { id: 'uranus', stop: 3.9, box: box(URANUS, UR * 2.2) },
    ...(w.COMET ? [{ id: 'comet', stop: .6, box: [w.COMET[0] - 60, w.COMET[1] - 60, w.COMET[0] + 480, w.COMET[1] + 380] }] : []),
    { id: 'sail', stop: .5, box: box(w.SAIL, w.SAILR * 2.2) },
    { id: 'tug', stop: 1.5, box: box(w.TUG, w.TGR * 5) },
    { id: 'neptune', stop: 4, box: [Math.min(NEPTUNE[0] - NR * 2.05, TRITON[0] - TR * 3), Math.min(NEPTUNE[1] - NR * 1.35, TRITON[1] - TR * 3), NEPTUNE[0] + NR * 2.05, NEPTUNE[1] + NR * 1.35] },
  ];
}

// Small captions printed on the world beside the planets the trip passes (world units).
export const LABELS = Object.fromEntries([['landscape', L], ['portrait', P]].map(([mode, b]) => {
  const at = (c, r, text, side = 1) => ({ x: c[0] + r * 1.35 * side, y: c[1], text, cls: side < 0 ? 'is-left' : '' });
  const land = mode === 'landscape';
  return [mode, [
    at(b.MARS, b.MAR, 'Mars · 1.5 AU'),
    { x: land ? (b.BELT[0] + b.BELT[1]) / 2 : 70, y: land ? 150 : (b.BELT[0] + b.BELT[1]) / 2, text: 'Asteroid belt', cls: land ? 'is-centre' : '' },
    ...(land ? [at(b.SAIL, b.SAILR * 1.15, 'Solar sail')] : []),
    { x: b.TUG[0], y: b.TUG[1] + b.TGR * 1.5, text: 'Asteroid under tow', cls: 'is-centre' },
    ...(b.COMET ? [{ x: b.COMET[0] - b.CR * 3, y: b.COMET[1] - b.CR * 2.5, text: 'Comet', cls: 'is-left' }] : []),
    at(b.JUPITER, b.JR, 'Jupiter · 5.2 AU', land ? 1 : -1),
    at(b.SATURN, b.SAR * 1.9, 'Saturn · 9.5 AU'),
    at(b.URANUS, b.UR * 1.4, 'Uranus · 19 AU', land ? 1 : -1),
    { x: land ? (b.KUIPER[0] + b.KUIPER[1]) / 2 : 70, y: land ? 150 : (b.KUIPER[0] + b.KUIPER[1]) / 2, text: 'Kuiper belt', cls: land ? 'is-centre' : '' },
  ]];
}));

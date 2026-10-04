// Print one plate (what holds still around a place) at k device pixels per world unit. Used by
// the print worker (home/trip/worker.js), the stills (_design/trip/) and, without workers, the page.
import { world, plateRect } from './world.js';
export { plateRect };
import { inker } from './ink.js';
import { makeCanvas } from './tone.js';
import { drawSun, drawMercury, drawSwarmBack, drawSwarmFront } from './swarm.js';
import { drawVenus } from './venus.js';
import { drawEarth } from './earth.js';
import { drawHabitat } from './habitat.js';
import { drawMars, drawJupiter, drawSaturn, drawUranus } from './passage.js';
import { drawNeptune } from './neptune.js';
import { drawComet, drawTug, drawSail } from './legs.js';

const DRAW = { 'swarm-back': drawSwarmBack, 'swarm-front': drawSwarmFront, sun: drawSun, mercury: drawMercury, venus: drawVenus, earth: drawEarth, habitat: drawHabitat, mars: drawMars, jupiter: drawJupiter, saturn: drawSaturn, uranus: drawUranus, neptune: drawNeptune, comet: drawComet, tug: drawTug, sail: drawSail };

export async function printPlate(mode, id, k) {
  const w = world(mode), pl = w.plates.find(p => p.id === id);
  const r = plateRect(pl.box, k), c = makeCanvas(r.w, r.h), ctx = c.getContext('2d');
  ctx.setTransform(k, 0, 0, k, -r.x0, -r.y0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  await DRAW[id](inker(ctx, k), w);
  return { canvas: c, rect: r };
}

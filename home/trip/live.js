// What moves, drawn over the plates on one canvas: each place's living detail, only where the
// view can see it. ctx is scaled to world units; t in seconds; k device px per unit.
import { drawSwarmLive } from './swarm.js';
import * as venus from './venus.js';
import * as earth from './earth.js';
import * as habitat from './habitat.js';
import * as neptune from './neptune.js';
import { drawLegsLive } from './legs.js';

const meets = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

export function drawLive(ctx, w, t, k, view, extras) {
  const P = id => w.plates.find(p => p.id === id).box;
  const sunBox = [w.SUN[0] - w.SR * 3.8, w.SUN[1] - w.SR * 2, w.SUN[0] + w.SR * 3.8, w.SUN[1] + w.SR * 2];
  if (meets(view, [Math.min(sunBox[0], w.MERCURY[0] - 200), sunBox[1], sunBox[2], Math.max(sunBox[3], w.MERCURY[1] + 200)])) drawSwarmLive(ctx, w, t, k, extras);
  if (venus.drawVenusLive && meets(view, P('venus'))) venus.drawVenusLive(ctx, w, t, k);
  if (earth.drawEarthLive && meets(view, P('earth'))) earth.drawEarthLive(ctx, w, t, k);
  if (habitat.drawHabitatLive && meets(view, P('habitat'))) habitat.drawHabitatLive(ctx, w, t, k);
  if (neptune.drawNeptuneLive && meets(view, P('neptune'))) neptune.drawNeptuneLive(ctx, w, t, k);
  drawLegsLive(ctx, w, t, k, view);
}

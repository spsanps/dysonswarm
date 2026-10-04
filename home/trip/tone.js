// Tone maps: draw a tone with ordinary canvas strokes and gradients at low resolution, then read
// it back as a smooth function of world position for a halftone screen to sample.
export const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

// box: [x0, y0, x1, y1] in world units; res: samples per unit; draw(g) draws alpha in world units.
export function toneMap(box, res, draw) {
  const [x0, y0, x1, y1] = box;
  const W = Math.max(2, Math.ceil((x1 - x0) * res)), H = Math.max(2, Math.ceil((y1 - y0) * res));
  const c = makeCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
  g.fillStyle = g.strokeStyle = '#000';
  draw(g);
  const d = g.getImageData(0, 0, W, H).data, a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  return (x, y) => {
    let fx = (x - x0) * res - .5, fy = (y - y0) * res - .5;
    if (fx < 0) fx = 0; else if (fx > W - 1.001) fx = W - 1.001;
    if (fy < 0) fy = 0; else if (fy > H - 1.001) fy = H - 1.001;
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, q = iy * W + ix;
    const p = a[q] + (a[q + 1] - a[q]) * tx, r = a[q + W] + (a[q + W + 1] - a[q + W]) * tx;
    return p + (r - p) * ty;
  };
}

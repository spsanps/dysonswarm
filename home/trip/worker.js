// Prints the trip's plates off the main thread, one job at a time, and hands each back as an
// ImageBitmap. A long-lived worker, so modules and the Earth's land mask load once.
import { printPlate } from './plates.js';

self.onmessage = async ({ data }) => {
  if (data.ping) {
    let ok = false;
    try { ok = !!new OffscreenCanvas(4, 4).getContext('2d'); } catch { ok = false; }
    self.postMessage({ pong: ok });
    return;
  }
  try {
    const t0 = performance.now();
    const { canvas, rect } = await printPlate(data.mode, data.id, data.k);
    const bmp = canvas.transferToImageBitmap();
    self.postMessage({ job: data.job, bmp, rect, ms: Math.round(performance.now() - t0) }, [bmp]);
  } catch (e) {
    self.postMessage({ job: data.job, error: String((e && e.message) || e) });
  }
};

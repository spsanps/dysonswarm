// A lit sphere in orthographic view, for planets drawn as prints: screen → latitude/longitude and
// the surface normal, and a daylight term from the Sun's direction.
import { clamp } from './math.js';

// C centre, R radius, l unit vector toward the Sun (screen), roll: the axis's tilt on screen,
// tilt: how far the north pole leans toward us, front: how much the Sun is in front of the view.
export function globe(C, R, l, { roll = 0, tilt = 0, front = .3, lon0 = 0 } = {}) {
  const cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tilt), st = Math.sin(tilt);
  const sv = [l[0], -l[1], front], sn = Math.hypot(...sv), sun = sv.map(v => v / sn);
  const inv = (x, y) => {
    const X = (x - C[0]) / R, Y = (y - C[1]) / R, rr = X * X + Y * Y; if (rr >= 1) return null;
    const u = X * cr + Y * sr, v = -(-X * sr + Y * cr), z = Math.sqrt(1 - rr);
    const gy = v * ct + z * st, gz = -v * st + z * ct;
    return { lat: Math.asin(clamp(gy, -1, 1)), lon: lon0 + Math.atan2(u, gz), n: [X, -Y, z], r: Math.sqrt(rr) };
  };
  const fwd = (lon, lat, r = 1) => {
    const gx = Math.cos(lat) * Math.sin(lon - lon0), gy = Math.sin(lat), gz = Math.cos(lat) * Math.cos(lon - lon0);
    const v = gy * ct - gz * st, z = gy * st + gz * ct, u = gx;
    const X = u * cr + v * sr, Yup = -u * sr + v * cr;
    return [C[0] + X * R * r, C[1] - Yup * R * r, z];
  };
  const day = n => n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
  return { C, R, inv, fwd, day, sun };
}

// Venus from space: the planet, Birch's sunshade between it and the Sun, the soletta,
// and the surface changing with the years. Units: km. Venus at the origin, its pole
// along +y, the Sun far along +x. Painted by the same brush as the ground.

import { program, settle, setUniforms, texture, FULLSCREEN_VS, bindTex } from './gl.js';
import { COMMON } from './glsl.js';
import { SCHEDULE } from './timeline.js';
import { clamp, lerp, smoothstep } from './noise.js';

const RV = 6051.8;
const SHADE_DIST = 250000, SHADE_R = 7700;   // Birch §9: a quarter of the way to L1, 1.27 Venus diameters
const D2R = Math.PI / 180;

const FS = () => `#version 300 es
${COMMON()}
in vec2 vUV; out vec4 o;
uniform vec3 uCam, uFwd, uRight, uUp; uniform vec2 uTan;
uniform sampler2D uTopo;
uniform float uYear, uTime, uExposure;
uniform float uShade, uSoletta, uCloudDeck, uGlow, uSeaLevel, uLiquid, uFreeze, uSnow;
uniform float uPaveSea, uPaveLand, uSoil, uWater, uGreen, uClouds, uTown, uIcefall, uNight;
uniform vec3 uSolDir; uniform float uSunVis;
uniform vec3 uMarker; uniform float uAim;
const float RV = ${RV.toFixed(1)};
const vec3 SUN = vec3(1.0, 0.0, 0.0);
const float SD = ${SHADE_DIST.toFixed(1)};
const float SR = ${SHADE_R.toFixed(1)};

vec2 sphere(vec3 ro, vec3 rd, float r){ float b = dot(ro, rd), c = dot(ro, ro) - r*r, h = b*b - c; if (h < 0.0) return vec2(-1.0); h = sqrt(h); return vec2(-b - h, -b + h); }

float elev(vec3 n){
  float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.z, n.x);
  // longitude 0 faces the camera's default side; the tile's east longitude runs -180..180
  vec2 uv = vec2(lon/(2.0*PI) + 0.5, 0.5 - lat/PI);
  return texture(uTopo, uv).r*255.0*56.0 - 3000.0;
}

vec3 stars(vec3 rd){
  vec3 a = abs(rd); vec2 uv; float face;
  if (a.x > a.y && a.x > a.z){ uv = rd.yz/a.x; face = rd.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y > a.z){ uv = rd.xz/a.y; face = rd.y > 0.0 ? 2.0 : 3.0; }
  else { uv = rd.xy/a.z; face = rd.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = uv*300.0 + face*1000.0; vec2 cell = floor(g), f = fract(g);
  vec3 col = vec3(0.0);
  if (hash21(cell) > 0.82){
    vec2 c = hash22(cell + 7.0)*0.7 + 0.15;
    float m = pow(hash21(cell + 31.0), 6.0);
    col += mix(vec3(1.0, 0.75, 0.55), vec3(0.75, 0.85, 1.0), hash21(cell + 91.0)) * (0.0003 + m*0.03) * smoothstep(0.3, 0.0, length(f - c));
  }
  vec3 gN = normalize(vec3(0.3, 0.6, -0.74));
  float lat = dot(rd, gN);
  col += vec3(0.6, 0.58, 0.55) * exp(-lat*lat*30.0) * (0.6 + 0.4*fbm(rd.xz*8.0 + rd.y*3.0, 4)) * 0.002;
  return col;
}

// The shade, seen from anywhere: an inner cone and rings of slats, mirror on both faces.
// Returns colour and coverage; t is the hit distance.
vec4 shade(vec3 ro, vec3 rd, out float t){
  t = -1.0;
  if (uShade <= 0.001) return vec4(0.0);
  float denom = dot(rd, SUN);
  if (abs(denom) < 1e-5) return vec4(0.0);
  t = (SD - dot(ro, SUN)) / denom;
  if (t <= 0.0) { t = -1.0; return vec4(0.0); }
  vec3 p = ro + rd*t;
  vec2 q = vec2(p.y, p.z);
  float r = length(q);
  float R = SR * smoothstep(0.0, 0.7, uShade);           // it unfolds outward
  if (r > R) { t = -1.0; return vec4(0.0); }
  float rn = r / SR;
  float a = atan(q.y, q.x);
  bool sunSide = dot(ro, SUN) > SD;
  vec3 col;
  float cone = step(rn, 0.357);
  float ring = fract(rn*14.0);
  float gap = smoothstep(0.0, 0.05, ring) * smoothstep(1.0, 0.9, ring);
  float spokes = smoothstep(0.02, 0.0, abs(fract(a*12.0/(2.0*PI)) - 0.5) - 0.48);
  if (sunSide){
    // the sunlit face: bright mirror throwing light past the planet
    col = vec3(1.0, 0.97, 0.9) * (cone > 0.5 ? 2.2 : 1.4 + 0.6*gap);
  } else {
    // the back, faintly lit by the support mirror on the far side of Venus
    col = vec3(0.55, 0.57, 0.62) * (cone > 0.5 ? 0.020 + 0.012*max(0.0, sin(a*2.0)) : 0.010 + 0.010*gap);
    col += vec3(1.0, 0.95, 0.85) * 0.012 * smoothstep(0.03, 0.0, abs(ring - 0.5) - 0.47) * (1.0 - cone);   // light leaking between slats
  }
  col = mix(col, col*0.4, spokes*0.6);
  col += vec3(1.0, 0.95, 0.85) * (sunSide ? 1.5 : 0.08) * smoothstep(R - SR*0.012, R, r);   // the rim
  return vec4(col, 1.0);
}

// The soletta (Birch §10): a mirror 8,900 km in radius in a 24-hour polar orbit.
vec4 soletta(vec3 ro, vec3 rd){
  if (uSoletta <= 0.001) return vec4(0.0);
  float ang = uTime*0.02;
  vec3 c = vec3(0.0, sin(ang), cos(ang)) * 38000.0;
  vec3 n = normalize(normalize(-c) + SUN);               // facing between Venus and the Sun
  float d = dot(rd, n); if (abs(d) < 1e-5) return vec4(0.0);
  float t = dot(c - ro, n) / d; if (t <= 0.0) return vec4(0.0);
  vec3 p = ro + rd*t; float r = length(p - c);
  if (r > 8900.0) return vec4(0.0);
  float rim = smoothstep(8800.0, 8900.0, r);
  float glint = pow(max(dot(reflect(rd, n), SUN), 0.0), 40.0);
  vec3 col = vec3(0.10, 0.11, 0.13) + vec3(1.0, 0.95, 0.85) * (glint*3.0 + rim*0.8) + vec3(0.6, 0.65, 0.75)*0.08;
  return vec4(col, 0.85 * uSoletta);
}

vec3 surface(vec3 n, vec3 L, float sunAmt, out float spec){
  float e = elev(n);
  float hi = smoothstep(500.0, 4000.0, e);
  float m = fbm(n.xz*9.0 + n.y*4.0, 4)*0.5 + 0.5;
  vec3 land = mix(vec3(0.06, 0.055, 0.05), vec3(0.13, 0.11, 0.09), hi*0.6 + m*0.4);
  spec = 0.0;
  float sea = smoothstep(uSeaLevel + 30.0, uSeaLevel - 30.0, e);
  float oldSea = smoothstep(1530.0, 1470.0, e);     // where the CO2 sea was, once it is full
  vec3 col = land;
  // CO2 sea: dark and glassy, then freezing white
  if (uLiquid > 0.5 || uFreeze > 0.0){
    vec3 liq = vec3(0.012, 0.014, 0.02);
    vec3 ice = vec3(0.70, 0.74, 0.78) * (0.9 + 0.1*m);
    vec3 s = mix(liq, ice, smoothstep(0.0, 1.0, uFreeze*1.2 - m*0.2));
    col = mix(col, s, sea);
    spec = sea * (1.0 - uFreeze) * 0.6;
  }
  float seed0 = fbm(n.xz*3.0 + n.y*7.0 + 2.0, 3)*0.5 + 0.5;
  float snowLeft = uSnow * (1.0 - smoothstep(seed0 - 0.05, seed0 + 0.05, uPaveLand));
  col = mix(col, vec3(0.80, 0.83, 0.88), snowLeft * (1.0 - sea) * smoothstep(0.2, 0.6, m + 0.2));
  // paving spreads out from the colonies over the frozen seas, then over the land
  float seed = fbm(n.xz*3.0 + n.y*7.0 + 2.0, 3)*0.5 + 0.5;
  float pavedSea = smoothstep(seed - 0.05, seed + 0.05, uPaveSea) * oldSea;
  float pavedLand = smoothstep(seed - 0.05, seed + 0.05, uPaveLand) * (1.0 - oldSea);
  float hexes = 0.9 + 0.1*step(0.5, fract(n.x*900.0 + 0.5*floor(n.z*780.0)))*step(0.5, fract(n.z*780.0));
  col = mix(col, vec3(0.55, 0.53, 0.48) * hexes, pavedSea);
  col = mix(col, vec3(0.19, 0.19, 0.19) * hexes, pavedLand);
  float soiled = smoothstep(seed - 0.05, seed + 0.05, uSoil) * (1.0 - oldSea);
  col = mix(col, vec3(0.09, 0.065, 0.045), soiled);
  // water fills over the paved seas; then green
  float wet = oldSea * uWater;
  vec3 ocean = mix(vec3(0.008, 0.03, 0.065), vec3(0.015, 0.055, 0.09), m);
  col = mix(col, ocean, wet);
  spec = max(spec, wet*0.5);
  float greenAmt = uGreen * (1.0 - oldSea) * smoothstep(0.1, 0.6, seed + 0.3 - hi*0.4);
  col = mix(col, mix(vec3(0.04, 0.07, 0.025), vec3(0.10, 0.10, 0.04), m), greenAmt);
  // hexagon islands speckle the new seas
  float isl = step(0.82, hash21(floor(n.xz*400.0 + n.y*170.0))) * wet * smoothstep(0.0, 1.0, uGreen*1.5);
  col = mix(col, vec3(0.08, 0.10, 0.04), isl);
  return col;
}

void main(){
  vec2 ndc = vUV*2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight*ndc.x*uTan.x + uUp*ndc.y*uTan.y);
  vec3 ro = uCam;
  // light on Venus: the Sun (until the shade), then the soletta's 24-hour light
  vec3 L = normalize(mix(SUN, uSolDir, uSoletta));
  float sunAmt = (1.0 - uShade)*(1.0 - uSoletta) + uSoletta*0.5;

  vec3 col = stars(rd) * uNight;
  // the Sun and its glare, unless the shade or the planet is in the way
  float st; vec4 sh = shade(ro, rd, st);
  float cs = dot(rd, SUN);
  float open = 1.0 - uShade;
  vec3 sun = vec3(1.0, 0.96, 0.88) * (smoothstep(0.99997, 0.99998, cs)*60.0 + pow(max(cs, 0.0), 20000.0)*1.5*open + pow(max(cs, 0.0), 2500.0)*0.25*open + pow(max(cs, 0.0), 200.0)*0.02*open);
  vec3 corona = vec3(0.95, 0.92, 0.85) * (pow(max(cs, 0.0), 6000.0)*0.6 + pow(max(cs, 0.0), 1500.0)*0.08);
  vec2 hv = sphere(ro, rd, RV);
  vec2 ha = sphere(ro, rd, RV + 90.0);
  bool behindVenus = hv.x > 0.0;
  if (!behindVenus) col += sun;
  if (st > 0.0 && (!behindVenus || st < hv.x)) col = mix(col, sh.rgb, sh.a);
  if (!behindVenus) col += corona * uShade * (1.0 - sh.a*0.9);
  // the soletta
  vec4 so = soletta(ro, rd);
  if (so.a > 0.0 && !behindVenus) col = mix(col, so.rgb, so.a);

  if (hv.x > 0.0){
    vec3 p = ro + rd*hv.x; vec3 n = normalize(p);
    float ndl = dot(n, L);
    float spec;
    vec3 alb = surface(n, L, sunAmt, spec);
    float lit = max(ndl, 0.0) * sunAmt;
    // the cloud deck of today: creamy, with faint drifting bands
    vec3 cloud = vec3(0.92, 0.85, 0.66) * (0.9 + 0.1*fbm(vec2(atan(n.z, n.x)*3.0 + uTime*0.01, n.y*12.0), 4));
    vec3 c = alb * (lit*2.2 + 0.0);
    c += alb * vec3(0.5, 0.55, 0.75) * 0.16 * uNight * (1.0 - 0.85*uAim);   // the painter's night light
    vec3 H = normalize(L - rd);
    c += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, H), 0.0), 700.0) * spec * lit * 2.5;
    c = mix(c, cloud * (lit*2.2 + 0.03*uNight*(1.0 - 0.85*uAim)), uCloudDeck);
    // the hot planet glows in the dark, fading as it cools
    c += vec3(0.9, 0.2, 0.04) * 0.035 * uGlow * (0.6 + 0.4*fbm(n.xz*6.0 + n.y*3.0, 4)) * (1.0 - smoothstep(0.0, 0.3, lit));
    // floating colonies, lit by their own small mirrors in the dark years
    if (uShade > 0.5 && uSoletta < 0.5){
      for (int i=0;i<14;i++){
        float fi = float(i);
        float la = (hash21(vec2(fi, 3.0)) - 0.5)*2.2, lo = hash21(vec2(fi, 7.0))*6.2832;
        vec3 cn = vec3(cos(la)*cos(lo), sin(la), cos(la)*sin(lo));
        float d = acos(clamp(dot(n, cn), -1.0, 1.0)) * RV;
        c += vec3(1.0, 0.85, 0.6) * 0.35 * exp(-d*d/(120.0*120.0));
      }
    }
    // late clouds and town lights
    float cl = smoothstep(0.62, 0.8, fbm(vec2(atan(n.z, n.x)*4.0 + uTime*0.02, n.y*9.0), 5)*0.5 + 0.5) * uClouds;
    c = mix(c, vec3(0.9)*(lit*2.2 + 0.01*uNight), cl*0.8);
    float night = smoothstep(0.05, -0.15, ndl);
    float towns = step(0.985, hash21(floor(n.xz*260.0 + n.y*90.0))) * uTown * night * (1.0 - cl);
    c += vec3(1.0, 0.7, 0.35) * towns * 0.2;
    // you are here
    float mk = acos(clamp(dot(n, normalize(uMarker)), -1.0, 1.0)) * RV;
    c = mix(c, vec3(1.0, 0.85, 0.6) * (0.25 + lit*1.5), smoothstep(150.0, 120.0, mk) * smoothstep(70.0, 100.0, mk) * 0.9);
    col = c;
  }
  // the atmosphere at the limb: thick and yellow today, thin and blue at the end
  if (ha.x > 0.0 || ha.y > 0.0){
    float b = dot(ro, rd); float dmin = sqrt(max(dot(ro, ro) - b*b, 0.0));
    float limb = pow(smoothstep(RV + 70.0, RV, dmin), 3.0) * smoothstep(RV - 120.0, RV, dmin) * (hv.x > 0.0 ? 0.5 : 1.0);
    // looking toward the Sun through the limb: forward scattering lights a thin crescent
    float fwdS = pow(max(dot(rd, SUN), 0.0), 12.0) * (1.0 - uShade) * 1.2;
    vec3 pl = normalize(ro + rd*max(-b, 0.0));
    float day = clamp(dot(pl, L)*1.6 + 0.15, 0.0, 1.0) * sunAmt;
    vec3 thick = vec3(1.0, 0.86, 0.6), thin = vec3(0.35, 0.55, 1.0);
    vec3 ac = mix(thin, thick, max(uCloudDeck, 0.2*(1.0 - uWater)));
    col += ac * limb * (day*0.9 + fwdS + 0.01*uNight) * mix(0.25, 1.0, max(uCloudDeck, uWater));
  }
  o = vec4(col * uExposure, 1.0);
  gl_FragDepth = 0.999;
}`;

export class Orbit {
  constructor(gl) {
    this.gl = gl;
    this.ready = false;
    this.cam = { dist: 34000, az: 205, el: 14, aim: 0 };
    this.target = { ...this.cam };
    this.preset = 'globe';
    this.vao = gl.createVertexArray();
  }
  async load() {
    if (this.ready) return;
    const gl = this.gl;
    const res = await fetch(new URL('../data/venus-globe.png', import.meta.url));
    if (!res.ok) throw new Error('Could not load the globe.');
    const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const v = new Uint8Array(bmp.width * bmp.height);
    for (let i = 0; i < v.length; i++) v[i] = px[i * 4];
    this.topo = texture(gl, { w: bmp.width, h: bmp.height, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: v, filter: gl.LINEAR, wrap: gl.REPEAT });
    this.prog = program(gl, FULLSCREEN_VS, FS(), 'orbit');
    await settle(gl, [this.prog]);
    this.ready = true;
  }
  // globe: around the planet; shade: just behind Venus's limb, looking at the Sun
  setPreset(name, fromGround) {
    this.preset = name;
    if (name === 'shade') {
      // beside the night side, looking past the limb at the Sun and the shade
      this.target = { dist: 26000, az: 168, el: 10, aim: 1 };
      this.cam = fromGround ? { dist: 7800, az: -5, el: 62, aim: 0 } : { ...this.target };
    } else {
      this.target = { dist: 30000, az: 28, el: 34, aim: 0 };
      if (fromGround) this.cam = { dist: 7800, az: -5, el: 62, aim: 0 };
    }
  }
  rotate(dAz, dEl) { this.target.az += dAz; this.target.el = clamp(this.target.el + dEl, -80, 80); }
  zoom(f) { this.target.dist = clamp(this.target.dist * f, 7600, 420000); }
  step(dt) {
    const k = 1 - Math.exp(-dt * 6);
    let moving = false;
    for (const key of ['dist', 'az', 'el', 'aim']) {
      const d = this.target[key] - this.cam[key];
      if (Math.abs(d) > (key === 'dist' ? 1 : 0.01)) { this.cam[key] += d * k; moving = true; }
    }
    return moving;
  }
  // camera looking at Venus (or at the shade when far out)
  camera() {
    const { dist, az, el } = this.cam;
    const a = az * D2R, e = el * D2R;
    const pos = [Math.cos(e) * Math.cos(a) * dist, Math.sin(e) * dist, Math.cos(e) * Math.sin(a) * dist];
    // aim between Venus and, when far away, toward the shade so both stay in frame
    const toV = [-pos[0], -pos[1], -pos[2]]; const tl = Math.hypot(...toV);
    const sunward = [1, 0.03, 0.06];
    const aim = this.cam.aim || 0;
    const f = [0, 1, 2].map(i => toV[i] / tl * (1 - aim) + sunward[i] * aim); const fl = Math.hypot(...f);
    const fwd = f.map(x => x / fl);
    let right = [fwd[2] * 0 - 0, 0, 0];
    right = [-fwd[2], 0, fwd[0]]; const rl = Math.hypot(...right) || 1; right = right.map(x => x / rl);
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    return { pos, fwd, right, up };
  }
  render(target, st, L, year, hour, time, tan) {
    const gl = this.gl, p = this.prog;
    const cam = this.camera();
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    bindTex(gl, p, 'uTopo', this.topo, 0);
    const S = SCHEDULE;
    const solA = (hour / 24) * Math.PI * 2 + Math.PI;   // noon at the standpoint's longitude
    const lat = 61.6 * D2R, lon = -5.0 * D2R;
    // the 'you are here' marker (the globe's longitude runs from -180 at u=0)
    const mlon = lon;
    const marker = [Math.cos(lat) * Math.cos(mlon), Math.sin(lat), Math.cos(lat) * Math.sin(mlon)];
    const sunVis = 1 - st.shade;
    setUniforms(gl, p, {
      uCam: cam.pos, uFwd: cam.fwd, uRight: cam.right, uUp: cam.up, uTan: tan,
      uYear: year, uTime: time, uAim: this.cam.aim || 0,
      uExposure: lerp(lerp(1.2, 5.0, smoothstep(0.3, 1, st.shade) * (1 - st.soletta)), 1.5, this.cam.aim || 0) * lerp(1, 2.2, st.soletta * (1 - (this.cam.aim || 0))),
      uShade: st.shade, uSoletta: st.soletta, uCloudDeck: st.cloudDeck, uGlow: st.glow,
      uSeaLevel: st.seaLevelTrue, uLiquid: st.seaLiquid ? 1 : 0, uFreeze: st.freeze, uSnow: st.snow,
      uPaveSea: smoothstep(S.PAVE_SEA_START, S.PAVE_SEA_START + S.PAVE_SEA_SPAN, year) * 1.1 - 0.05,
      uPaveLand: smoothstep(S.PAVE_LAND_START, S.PAVE_LAND_START + S.PAVE_LAND_SPAN, year) * 1.1 - 0.05,
      uSoil: smoothstep(S.SOIL_START, S.SOIL_START + S.SOIL_SPAN, year) * 1.1 - 0.05,
      uWater: st.water, uGreen: st.green, uClouds: st.clouds, uTown: st.town, uIcefall: st.icefall,
      uNight: 1, uSolDir: [Math.cos(solA), 0.15, Math.sin(solA)], uSunVis: sunVis, uMarker: marker,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export { RV, SHADE_DIST, SHADE_R };

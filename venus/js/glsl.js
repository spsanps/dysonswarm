// GLSL sources. The scene is one raymarched heightfield (terrain + frozen sea + paving),
// a liquid plane (CO2, later water), an atmosphere whose parameters follow the years,
// and a night sky; objects are drawn after it, sharing the same light and air.

import { SCHEDULE } from './timeline.js';
import { HEX_S, HEX_ROT, ICE_TRUE, SEA_ORIGIN, LANE, LAND_DUR, SOIL_DUR } from './plan.js';
import { EXAGGERATION, VENUS_R } from './terrain.js';

const defs = () => {
  const lines = Object.entries(SCHEDULE).map(([k, v]) => `#define ${k} ${v.toFixed(3)}`);
  lines.push(`#define HEX_S ${HEX_S.toFixed(1)}`, `#define HEX_ROT ${HEX_ROT.toFixed(5)}`, `#define ICE_TRUE ${ICE_TRUE.toFixed(1)}`);
  lines.push(`#define SEA_ORIGIN vec2(${SEA_ORIGIN[0].toFixed(1)}, ${SEA_ORIGIN[1].toFixed(1)})`);
  lines.push(`#define COLONY_XZ vec2(-31486.3, 17453.1)`, `#define TOWN_XZ vec2(-6847.0, -1455.4)`);
  lines.push(`#define LANE ${LANE.toFixed(1)}`, `#define LAND_DUR ${LAND_DUR.toFixed(1)}`, `#define SOIL_DUR ${SOIL_DUR.toFixed(1)}`);
  lines.push(`#define EXAG ${EXAGGERATION.toFixed(3)}`, `#define PLANET_R ${VENUS_R.toFixed(1)}`);
  return lines.join('\n');
};

export const COMMON = () => `
precision highp float;
precision highp int;
// Never set, so always 0. Loops written i<N+uZero can't be unrolled by Direct3D's shader
// compiler (Chrome and Edge on Windows), which otherwise copies their bodies N times and
// takes minutes over this file.
uniform int uZero;
${defs()}
#define PI 3.14159265359
#define S_TOWN0 0.05
#define S_TOWN1 0.3
#define TAU 6.28318530718

uint hashU(ivec2 p){
  uint h = (uint(p.x) * 0x8da6b343u) ^ (uint(p.y) * 0xd8163841u);
  h = (h ^ (h >> 16)) * 0x7feb352du;
  h = (h ^ (h >> 15)) * 0x846ca68bu;
  return h ^ (h >> 16);
}
float hash2(ivec2 p){ return float(hashU(p)) * (1.0/4294967296.0); }
float hash21(vec2 p){ return hash2(ivec2(floor(p))); }
vec2 hash22(vec2 p){ ivec2 i = ivec2(floor(p)); return vec2(hash2(i), hash2(i + ivec2(1931, -733))); }

float vnoise(vec2 x){
  vec2 i = floor(x), f = x - i;
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  ivec2 ii = ivec2(i);
  float a = hash2(ii), b = hash2(ii+ivec2(1,0)), c = hash2(ii+ivec2(0,1)), d = hash2(ii+ivec2(1,1));
  return (a + (b-a)*u.x + (c-a)*u.y + (a-b-c+d)*u.x*u.y) * 2.0 - 1.0;
}
float gnoise(vec2 x){
  vec2 i = floor(x), f = x - i;
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  ivec2 ii = ivec2(i);
  #define GR(o, d) (cos(float(hashU(ii+o) & 255u)/256.0*TAU)*(d).x + sin(float(hashU(ii+o) & 255u)/256.0*TAU)*(d).y)
  float a = GR(ivec2(0,0), f), b = GR(ivec2(1,0), f-vec2(1,0));
  float c = GR(ivec2(0,1), f-vec2(0,1)), d = GR(ivec2(1,1), f-vec2(1,1));
  return (a + (b-a)*u.x + (c-a)*u.y + (a-b-c+d)*u.x*u.y) * 1.4;
}
float fbm(vec2 p, int oct){ float s = 0.0, a = 0.5; for (int i=0;i<8+uZero;i++){ if(i>=oct) break; s += a*vnoise(p); p = p*2.03 + vec2(17.1,-9.3); a *= 0.5; } return s; }
// Fine relief near the viewer, render metres. Mirrors noise.js fineDetail().
float fineDetail(vec2 p, int oct){
  float h = 0.0, amp = 9.0, f = 1.0/160.0;
  for (int i=0;i<5+uZero;i++){ if(i>=oct) break; h += vnoise(p*f + vec2(float(i)*17.3, -float(i)*9.1))*amp; amp *= 0.45; f *= 2.13; }
  return h;
}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
// The ledge we stand on: relative to the standpoint's ground height, a near-level
// platform with an irregular drop-off toward the view (yaw 268). Mirrors noise.js.
float nearField(vec2 p){
  float a = p.x*(-0.97815) + p.y*(0.20791);   // metres ahead (view yaw 258)
  float b = p.x*(-0.20791) + p.y*(-0.97815);   // metres to the right
  // a rocky platform about 11 m deep; its lip wraps back on both sides
  float edge = 3.0 + 0.7*vnoise(vec2(b/4.0, 3.7)) + 0.35*vnoise(vec2(b/1.5, 9.1)) - 0.015*b*b + 0.12*max(-b, 0.0);
  float beyond = a - edge;
  float h = 0.35*vnoise(p/9.0) + 0.15*vnoise(p/3.0) - 0.02*max(a, 0.0);
  h += 0.4*smoothstep(2.0, -8.0, a);                       // rising gently behind us
  h += -14.0*smoothstep(-0.8, 2.6, beyond);                // the drop
  h += -9.0*smoothstep(7.0, 13.0, beyond + 3.0*vnoise(vec2(b/9.0, 1.3)));
  h += -0.65*max(beyond - 3.0, 0.0);                       // the talus below
  return h;
}
// Low plates of basalt with soft steps, like the Venera 13 and 14 panoramas.
float slabs(vec2 p){
  float n = vnoise(p/6.0) + 0.45*vnoise(p/2.2 + 4.0);
  float k = n*2.4;
  float f = fract(k);
  return (floor(k) + smoothstep(0.35, 0.8, f))*0.07 + vnoise(p*1.9)*0.02;
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Voronoi: x = distance to the nearest cell edge, y = cell hash, z = distance to centre
vec3 voronoi(vec2 x){
  vec2 n = floor(x), f = x - n; vec2 mg, mr; float md = 8.0;
  for (int j=-1;j<=1+uZero;j++) for (int i=-1;i<=1+uZero;i++){
    vec2 g = vec2(float(i), float(j)); vec2 o = hash22(n + g)*0.85 + 0.075;
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < md){ md = d; mr = r; mg = g; }
  }
  float ed = 8.0;
  for (int j=-2;j<=2+uZero;j++) for (int i=-2;i<=2+uZero;i++){
    vec2 g = mg + vec2(float(i), float(j)); vec2 o = hash22(n + g)*0.85 + 0.075;
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 1e-5) ed = min(ed, dot(0.5*(mr + r), normalize(r - mr)));
  }
  return vec3(ed, hash21(n + mg + 0.5), sqrt(md));
}
`;

// ── GPU bake of one terrain level (mirrors terrain.js bakeHeight) ──────────────
export const BAKE_FS = () => `#version 300 es
${COMMON()}
in vec2 vUV;
out vec4 outH;
uniform sampler2D uMagellan;   // true m above 6051 km, 320², 4 km/px
uniform vec2 uOrigin; uniform float uSpacing; uniform float uN; uniform float uDetail;
uniform vec2 uStandInTile;
uniform sampler2D uParent; uniform vec4 uParentL; uniform float uHasParent; uniform float uBand;
uniform vec4 uShields[70];

float mag(ivec2 p){ return texelFetch(uMagellan, clamp(p, ivec2(0), ivec2(319)), 0).r; }
float magellanAt(vec2 xz){
  vec2 g = (xz + uStandInTile) / 4000.0 + 160.0 - 0.5;
  vec2 i = floor(g), f = g - i;
  vec4 wx = vec4(((-f.x+2.0)*f.x-1.0)*f.x/2.0, ((3.0*f.x-5.0)*f.x*f.x+2.0)/2.0, ((-3.0*f.x+4.0)*f.x+1.0)*f.x/2.0, (f.x-1.0)*f.x*f.x/2.0);
  vec4 wz = vec4(((-f.y+2.0)*f.y-1.0)*f.y/2.0, ((3.0*f.y-5.0)*f.y*f.y+2.0)/2.0, ((-3.0*f.y+4.0)*f.y+1.0)*f.y/2.0, (f.y-1.0)*f.y*f.y/2.0);
  ivec2 b = ivec2(i) - 1;
  float s = 0.0;
  for (int j=0;j<4+uZero;j++){
    float row = 0.0;
    for (int k=0;k<4+uZero;k++) row += mag(b + ivec2(k,j)) * wx[k];
    s += row * wz[j];
  }
  return s;
}
float ridged(float v){ return 1.0 - abs(v); }
float sstep(float a, float b, float x){ return smoothstep(a, b, x); }

// The headland we stand on. Magellan shows a spur here, but at 4.6 km per pixel it
// can't say more; the crest, the point and its cliffs are invented.
// Returns the spur's crest height (true m) and, in w, how strongly the bay pulls down.
float headland(vec2 p, out float bayW){
  vec2 A = vec2(9500.0, -15000.0), B = vec2(0.0, 0.0);
  vec2 v = B - A; float t = dot(p - A, v) / dot(v, v);
  float tc = clamp(t, 0.0, 1.0);
  float d = length(p - (A + v*tc));
  float crestH = mix(1500.0, 660.0, smoothstep(0.0, 1.0, tc));
  float width = mix(3400.0, 1500.0, tc);
  float beyond = max(t - 1.0, 0.0) * length(v);
  float r = sqrt(d*d + beyond*beyond*2.2);
  float flank = pow(clamp(1.0 - r/width, 0.0, 1.0), 1.25);
  float kd = length(p - B);
  float spur = crestH*flank + 50.0*exp(-(kd*kd)/(240.0*240.0));
  // the bay comes in close to the south-west of the point
  float bd = length((p - vec2(-7000.0, 6500.0)) * vec2(0.8, 1.0));
  bayW = smoothstep(11000.0, 5500.0, bd) * (1.0 - smoothstep(0.0, 0.25, flank));
  return spur;
}

float bakeHeight(vec2 p, float detail){
  float base = magellanAt(p) - ${(1500).toFixed(1)};
  float slopeBand = sstep(-40.0, 600.0, base) * (1.0 - sstep(2600.0, 3400.0, base));
  float plateau = sstep(2500.0, 3200.0, base);
  float plains = 1.0 - sstep(-200.0, 500.0, base);
  float wx = gnoise(p/23000.0 + vec2(3.1, 0.0)) * 5200.0;
  float wz = gnoise(p/23000.0 + vec2(-7.7, 1.3)) * 5200.0;
  vec2 P = p + vec2(wx, wz);
  float h = base;
  float fold = 0.0, a = 1.0;
  for (int o=0;o<3+uZero;o++){
    float fo = float(o) + 1.0;
    fold += (pow(ridged(gnoise(vec2(P.x/(16000.0/pow(fo,1.6)) + float(o)*13.1, P.y/(5200.0/pow(fo,1.6)) - float(o)*4.7))), 2.0) - 0.45) * a;
    a *= 0.5;
  }
  h += fold * (90.0 + 380.0*slopeBand + 140.0*plateau);
  if (detail < 900.0){
    float g = pow(ridged(gnoise(vec2(P.x/2600.0 + 5.0, P.y/7800.0 - 1.0))), 3.0) - 0.3;
    float g2 = pow(ridged(gnoise(vec2(P.x/1100.0 - 2.0, P.y/3600.0 + 4.0))), 3.0) - 0.3;
    h -= (g*150.0 + g2*60.0) * slopeBand;
  }
  float wr = pow(ridged(gnoise(vec2(P.x/9000.0 + 11.0, P.y/26000.0))), 6.0);
  h += wr * (60.0*plateau + 45.0*plains);
  for (int i=0;i<70+uZero;i++){
    vec4 s = uShields[i];
    vec2 d = p - s.xy; float d2 = dot(d,d)/(s.z*s.z);
    if (d2 < 9.0) h += s.w * exp(-d2) * plains;
  }
  // Ridged multifractal relief: crisp crests, smoother hollows.
  float rough = 0.06*plains + 1.0*slopeBand + 0.45*plateau + 0.12;
  float f = 1.0/9000.0, amp = 1.0, wgt = 1.0, rmf = 0.0, norm = 0.0;
  for (int i=0;i<12+uZero;i++){
    if (1.0/f <= detail*1.6) break;
    float n = 1.0 - abs(gnoise(P*f + vec2(31.7 + float(i)*7.1, -12.9)));
    n *= n; n *= wgt; wgt = clamp(n*1.8, 0.0, 1.0);
    rmf += (n - 0.32)*amp; norm += amp;
    f *= 2.03; amp *= 0.52;
  }
  h += rmf * 330.0 * rough;
  // Fault scarps: Venus is cut by long straight fractures.
  for (int i=0;i<4+uZero;i++){
    float a = 0.62 + float(i)*0.37 + sin(float(i)*3.1)*0.2;
    vec2 dir = vec2(cos(a), sin(a)), nrm = vec2(-dir.y, dir.x);
    vec2 o = vec2(-30000.0 + float(i)*9000.0, -18000.0 + sin(float(i)*1.7)*14000.0);
    float sd = dot(p - o, nrm), al = dot(p - o, dir);
    float mask = smoothstep(26000.0, 9000.0, abs(al)) * (0.4 + 0.6*slopeBand + 0.5*plains);
    h += (smoothstep(-90.0, 90.0, sd + gnoise(p/2500.0)*120.0) - 0.5) * 80.0 * mask * (1.0 - plains*0.8) * (mod(float(i), 2.0) < 0.5 ? 1.0 : -1.0);
  }
  float bayW; float spur = headland(p, bayW);
  // the spur stands above the land around it; the bay floor is pulled down and smoothed
  h = mix(h, max(h, spur + (h - base)*0.5), smoothstep(0.0, 60.0, spur));
  float bayFloor = -300.0 + 60.0*gnoise(p/9000.0) + 25.0*gnoise(p/2500.0);
  h = mix(h, min(h, bayFloor + (h - base)*0.15), bayW);
  return h;
}

void main(){
  vec2 ij = floor(gl_FragCoord.xy);
  vec2 p = uOrigin + (ij + 0.5) * uSpacing;
  float h = bakeHeight(p, uDetail);
  if (uHasParent > 0.5){
    float e = min(min(ij.x, ij.y), min(uN-1.0-ij.x, uN-1.0-ij.y));
    float w = smoothstep(0.0, uBand, e);
    vec2 uv = (p - uParentL.xy) / uParentL.z;
    h = mix(texture(uParent, uv).r, h, w);
  }
  outH = vec4(h, 0.0, 0.0, 1.0);
}`;

// ── Shared scene functions: terrain lookup, hexagons, sky ────────────────────
export const SCENE_COMMON = () => `
uniform sampler2D uH0, uH1, uH2;      // render-space heights
uniform sampler2D uN0, uN1;           // normals (xz) + concavity
uniform vec4 uL0, uL1, uL2;           // origin.xy, size, texel
uniform vec3 uCam;                    // camera position (render metres)
uniform vec2 uStand;                  // the standpoint's xz (near field origin)
uniform float uStandH;                // terrain height there (render m)
uniform float uYear, uTime, uHour;
uniform float uFineOct;

// stage state
uniform float uShade, uSoletta, uCloudDeck, uAcid, uAcidRain, uLightning, uCo2Rain;
uniform float uSeaY, uSeaLiquid, uFreeze, uSnow, uSnowFall;
uniform float uWater, uWaterY, uGreen, uTents, uTown, uClouds;
uniform vec4 uCloud;    // coverage, darkness, altitude (render m), kind (0 cumulus, 1 overcast)
uniform float uIceOn, uIceY;
uniform float uGlow;
uniform float uStarVis, uShadeVis, uNightLift;

// light and air
uniform vec3 uLightDir, uLightCol;    // main light (soletta sun, or none)
uniform vec3 uSunDir;                 // the real Sun (behind the shade in the dark years)
uniform vec3 uSkyAmb, uGroundAmb, uNightAmb, uNightSky;
uniform vec3 uDiffuse;                // isotropic radiance of thick haze (Venus today)
uniform vec3 uBetaR, uBetaM;          // scattering coefficients at the sea datum, per true metre
uniform float uHR, uHM, uMieG;
uniform vec3 uSkyLight;               // irradiance driving the sky's single scattering
uniform float uSkyBoost;              // painter's lift of the sky against the land
uniform float uAirK;                  // painter's thinning of the air at night
uniform vec3 uFlash; uniform vec3 uFlashDir;
uniform vec3 uColonyPos; uniform float uColonyLight;
uniform float uExposure;
int gMat = 0; float gAux = 0.0;

float trueAlt(float y){ return y / EXAG; }

bool inLevel(vec4 L, vec2 xz, out vec2 uv){ uv = (xz - L.xy) / L.z; return all(greaterThan(uv, vec2(2.0*L.w))) && all(lessThan(uv, vec2(1.0 - 2.0*L.w))); }
float baseHeight(vec2 xz){
  vec2 uv;
  if (inLevel(uL0, xz, uv)) return textureLod(uH0, uv, 0.0).r;
  if (inLevel(uL1, xz, uv)) return textureLod(uH1, uv, 0.0).r;
  uv = (xz - uL2.xy) / uL2.z;
  return textureLod(uH2, uv, 0.0).r;
}
// Cubic B-spline sample from 4 bilinear taps: no creases along texel edges near the eye.
float bicubicTex(sampler2D t, vec2 uv, float n){
  vec2 st = uv*n - 0.5; vec2 i = floor(st); vec2 f = st - i;
  vec2 w0 = (1.0 - f)*(1.0 - f)*(1.0 - f)/6.0, w1 = (4.0 - 6.0*f*f + 3.0*f*f*f)/6.0;
  vec2 w2 = (1.0 + 3.0*f + 3.0*f*f - 3.0*f*f*f)/6.0, w3 = f*f*f/6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (w1/g0 - 1.0 + i + 0.5)/n, h1 = (w3/g1 + 1.0 + i + 0.5)/n;
  return g0.y*(g0.x*textureLod(t, vec2(h0.x, h0.y), 0.0).r + g1.x*textureLod(t, vec2(h1.x, h0.y), 0.0).r)
       + g1.y*(g0.x*textureLod(t, vec2(h0.x, h1.y), 0.0).r + g1.x*textureLod(t, vec2(h1.x, h1.y), 0.0).r);
}
float baseHeightSmooth(vec2 xz){
  vec2 uv;
  if (inLevel(uL0, xz, uv)) return bicubicTex(uH0, uv, 1.0/uL0.w);
  return baseHeight(xz);
}
vec3 baseNormal(vec2 xz, out float cav){
  vec2 uv; vec4 n;
  if (inLevel(uL0, xz, uv)) n = textureLod(uN0, uv, 0.0);
  else if (inLevel(uL1, xz, uv)) n = textureLod(uN1, uv, 0.0);
  else { n = vec4(0.5, 0.5, 0.5, 1.0); }
  cav = n.b;
  vec2 nxz = n.rg * 2.0 - 1.0;
  return normalize(vec3(nxz.x, sqrt(max(0.0, 1.0 - dot(nxz, nxz))), nxz.y));
}
float curvature(vec2 xz){ vec2 d = xz - uCam.xz; return dot(d, d) / (2.0 * PLANET_R); }

// ── hexagons (mirrors plan.js) ──
struct Hex { ivec2 id; vec2 c; vec2 l; float edge; };
Hex hexInfo(vec2 p){
  float cr = cos(HEX_ROT), sr = sin(HEX_ROT);
  vec2 q = vec2(p.x*cr + p.y*sr, -p.x*sr + p.y*cr);
  float fq = (0.57735027*q.x - q.y/3.0)/HEX_S, fr = (2.0/3.0*q.y)/HEX_S;
  vec3 c = vec3(fq, fr, -fq-fr), r = floor(c + 0.5), d = abs(r - c);
  if (d.x > d.y && d.x > d.z) r.x = -r.y - r.z; else if (d.y > d.z) r.y = -r.x - r.z;
  Hex h; h.id = ivec2(r.xy);
  vec2 cc = vec2(HEX_S*1.7320508*(r.x + r.y*0.5), HEX_S*1.5*r.y);
  h.l = q - cc;
  vec2 a = abs(h.l);
  h.edge = HEX_S*0.8660254 - max(a.x, a.x*0.5 + a.y*0.8660254);
  h.c = vec2(cc.x*cr - cc.y*sr, cc.x*sr + cc.y*cr);
  return h;
}
uniform sampler2D uHexTex; uniform vec2 uHexBase; uniform float uClock;
// hexagons the visitor has worked by hand: r = sea paving, g = land sheet, b = soil
// (the clock time, in seconds, when they started; 0 = not touched)
vec4 userHex(ivec2 id){
  ivec2 q = id - ivec2(uHexBase);
  if (q.x < 0 || q.y < 0 || q.x > 255 || q.y > 255) return vec4(0.0);
  return texelFetch(uHexTex, q, 0);
}
float h01(ivec2 id, int k){ return float(hashU(ivec2(id.x*7 + k*131, id.y*13 - k*71))) * (1.0/4294967296.0); }
struct Sched { bool sea; bool island; float pave; float soil; float seaPave; float islandT; float laneA; float soilA; float r1; float r2; float r3; float town; vec4 user; };
Sched hexSchedule(Hex h){
  Sched s;
  float r0 = h01(h.id,0); s.r1 = h01(h.id,1); s.r2 = h01(h.id,2); s.r3 = h01(h.id,3);
  float floorTrue = baseHeight(h.c) / EXAG;
  s.sea = floorTrue < -2.0;
  s.town = 0.0; s.island = false; s.islandT = 1e9;
  // the frozen sea (in any hexagon) is paved outward from our shore
  float seaRank = clamp(pow(clamp(length(h.c - SEA_ORIGIN)/95000.0, 0.0, 1.0), 0.8) + (r0-0.5)*0.08, 0.0, 1.0);
  s.seaPave = PAVE_SEA_START + PAVE_SEA_SPAN*seaRank;
  // the land (in any hexagon) is sheeted and soiled from the shore upward
  float rank = clamp(pow(clamp(max(floorTrue, 0.0)/2600.0, 0.0, 1.0), 0.7) + (r0-0.5)*0.12, 0.0, 1.0);
  s.pave = PAVE_LAND_START + (PAVE_LAND_SPAN - LAND_DUR)*rank;
  s.soil = SOIL_START + (SOIL_SPAN - SOIL_DUR)*clamp(rank + (s.r2-0.5)*0.1, 0.0, 1.0);
  if (s.sea){
    // Birch's colonies come down onto the water and spread out as islands of hexagons
    float cluster = vnoise(h.c/7000.0 + vec2(3.3, -1.7)) + 0.35*vnoise(h.c/2500.0 + 9.0);
    s.island = cluster > 0.18 && floorTrue < -40.0;
    float dl = length(h.c - COLONY_XZ);
    s.islandT = ISLANDS_START + ISLANDS_SPAN*clamp(dl/70000.0, 0.0, 1.0) + s.r2*2.0;
  } else {
    float dt = length(h.c - TOWN_XZ);
    s.town = (floorTrue < 260.0 ? 1.0 : 0.0) * smoothstep(6000.0, 2500.0, dt + s.r1*1500.0);
  }
  s.laneA = HEX_ROT + PI*0.5 + floor(s.r2*3.0)*PI/3.0;
  s.soilA = s.laneA + PI/3.0;
  s.user = userHex(h.id);
  return s;
}
bool seaPaved(Sched s){ return uYear > s.seaPave || (s.user.r > 0.0 && uClock > s.user.r + 3.2); }
// A front of machines crossing a land hexagon, one per 60 m strip, each a little ahead
// or behind its neighbours. Returns 1 where covered; gives this strip's machine.
float laneCoverT(Hex h, vec2 p, float t, float ang, out vec2 machine, out float isActive){
  float A = HEX_S*0.8660254;
  vec2 u = vec2(cos(ang), sin(ang)), v = vec2(-u.y, u.x);
  vec2 l = p - h.c;
  float uu = dot(l, u), vv = dot(l, v);
  float k = floor((vv + A)/LANE);
  float jit = (h01(h.id, 10 + int(k)) - 0.5)*0.08;
  float front = -HEX_S + (t - jit)*2.0*HEX_S;
  machine = h.c + u*front + v*(-A + (k + 0.5)*LANE);
  isActive = (t > 0.0 && t < 1.0 + 0.05) ? 1.0 : 0.0;
  return uu < front ? 1.0 : 0.0;
}
float laneCover(Hex h, vec2 p, float start, float dur, float ang, out vec2 machine, out float isActive){
  return laneCoverT(h, p, (uYear - start)/dur, ang, machine, isActive);
}
// Floating islands: unit hexagons riding on the new sea with a few metres of freeboard.
float islandTop(Hex h, Sched s){
  if (!s.island || uYear < s.islandT) return -1e9;
  float bevel = smoothstep(0.0, 40.0, h.edge);
  return uWaterY + (3.0 + 2.0*bevel)*EXAG - (1.0 - bevel)*30.0;
}

// The solid surface over the old sea. Dry ice is denser than the liquid, so a sea that
// freezes in place sinks by about a quarter of its depth: ice, then paving, then raised
// hexagons. floorY is the terrain (render m).
float iceTopFrom(vec2 xz, float floorY){
#ifdef VENUS_EARLY
  return -1e9;   // no ice before the seas
#endif
  if (uIceOn < 0.5 || floorY >= 0.0) return -1e9;
  float y = 0.24*floorY;
#ifndef VENUS_NOHEX
  if (uYear > PAVE_SEA_START){
    Hex h = hexInfo(xz); Sched s = hexSchedule(h);
    if (seaPaved(s)) y = max(y + 3.0*EXAG, islandTop(h, s));
  }
#endif
  return y;
}
// the same, for the hit point, whose hexagon is already known (shared with the albedos)
float iceTopHex(float floorY, Hex h, Sched s){
  if (uIceOn < 0.5 || floorY >= 0.0) return -1e9;
  float y = 0.24*floorY;
  if (uYear > PAVE_SEA_START && seaPaved(s)) y = max(y + 3.0*EXAG, islandTop(h, s));
  return y;
}

// ── sky ──
float phaseR(float c){ return 3.0/(16.0*PI)*(1.0 + c*c); }
float phaseHG(float c, float g){ float g2 = g*g; return (1.0-g2)/(4.0*PI*pow(max(1.0 + g2 - 2.0*g*c, 1e-4), 1.5)); }
float airmass(float mu){ float a = degrees(acos(clamp(mu, -1.0, 1.0))); return 1.0/(max(mu, 0.0) + 0.15*pow(max(93.885 - a, 0.5), -1.253)); }

// Optical depth (per channel) from altitude y0 (true m) along mu to space.
vec3 tauToSpace(float y0, float mu){
  float m = airmass(mu);
  return (uBetaR*uHR*exp(-y0/uHR) + uBetaM*uHM*exp(-y0/uHM)) * m;
}
// Optical depth along a straight segment of length t (render metres) from the camera.
vec3 tauSegment(vec3 ro, vec3 rd, float t){
  float y0 = trueAlt(ro.y), dy = rd.y / EXAG; // true metres per render metre along the ray
  vec3 tau = vec3(0.0);
  for (int k=0;k<2+uZero;k++){
    float H = k==0 ? uHR : uHM; vec3 b = k==0 ? uBetaR : uBetaM;
    float a = dy*t/H;
    float integ = abs(a) < 1e-3 ? t*(1.0 - a*0.5) : t*(1.0 - exp(-a))/a;
    tau += b * exp(-y0/H) * integ;
  }
  return tau;
}

// Stars, the Milky Way and the zodiacal light. Direction-fixed (Venus turns very slowly).
vec3 nightSky(vec3 rd){
  vec3 col = vec3(0.0);
  // stars: cells on a cube-ish grid of directions
  vec3 a = abs(rd); vec2 uv; float face;
  if (a.x > a.y && a.x > a.z){ uv = rd.yz/a.x; face = rd.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y > a.z){ uv = rd.xz/a.y; face = rd.y > 0.0 ? 2.0 : 3.0; }
  else { uv = rd.xy/a.z; face = rd.z > 0.0 ? 4.0 : 5.0; }
  float scale = 260.0;
  vec2 g = uv*scale + face*1000.0;
  vec2 cell = floor(g), f = fract(g);
  float h = hash21(cell);
  if (h > 0.86){
    vec2 c = hash22(cell + 7.0)*0.7 + 0.15;
    float d = length(f - c);
    float mag = pow(hash21(cell + 31.0), 6.0);
    float b = (0.00004 + mag*0.004) * smoothstep(0.32, 0.0, d);
    float temp = hash21(cell + 91.0);
    vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.75, 0.85, 1.0), temp);
    col += tint * b;
  }
  // Milky Way: a band around a tilted great circle
  vec3 gN = normalize(vec3(0.32, 0.55, -0.77));
  float lat = dot(rd, gN);
  float band = exp(-lat*lat*28.0);
  float lon = atan(dot(rd, normalize(cross(gN, vec3(0,1,0)))), dot(rd, normalize(cross(gN, cross(gN, vec3(0,1,0))))));
  float clump = 0.55 + 0.45*fbm(vec2(lon*3.0, lat*14.0), 4) + 0.4*fbm(vec2(lon*9.0, lat*30.0) + 3.0, 3);
  float dust = smoothstep(0.1, 0.6, fbm(vec2(lon*6.0, lat*40.0) + 11.0, 4) + 0.2) * exp(-lat*lat*200.0);
  col += vec3(0.62, 0.6, 0.55) * band * clump * 0.00030 * (1.0 - dust*0.8);
  // zodiacal light along the ecliptic, brightest toward the hidden Sun
  vec3 eclN = normalize(cross(uSunDir, vec3(0.0, 0.0, 1.0)));
  float el = dot(rd, eclN);
  float toSun = dot(rd, uSunDir);
  col += vec3(0.62, 0.62, 0.66) * exp(-el*el*14.0) * pow(max(toSun, 0.0), 3.0) * 0.00012;
  return col;
}

// The sunshade (Birch §9): a cone and rings of slats about 3.5° across, seen from
// its back, with the hidden Sun's corona leaking round the edge.
vec3 shadeDisc(vec3 rd){
  float c = dot(rd, uSunDir);
  float ang = degrees(acos(clamp(c, -1.0, 1.0)));
  float R = 1.75;
  vec3 col = vec3(0.0);
  // corona and the inner zodiacal glow
  col += vec3(0.9, 0.88, 0.85) * 0.0005 * exp(-(ang - R)*1.6) * step(R, ang);
  if (ang < R){
    float r = ang / R;
    vec3 side = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
    vec3 up2 = cross(side, uSunDir);
    float az = atan(dot(rd, up2), dot(rd, side));
    // dark body: inner cone shaded with faint support light, slats as rings
    float cone = step(r, 0.36);
    float ring = fract(r*11.0);
    float slat = smoothstep(0.0, 0.08, ring) * smoothstep(1.0, 0.86, ring);
    float lit = cone > 0.5 ? 0.012 + 0.02*max(0.0, sin(az*2.0 + 0.6)) : 0.004 + 0.01*slat*(0.6 + 0.4*sin(az*3.0 + r*20.0));
    col = vec3(0.7, 0.72, 0.8) * lit * 0.02;
    // hairline leaks of sunlight between slats
    col += vec3(1.0, 0.92, 0.8) * 0.0009 * (1.0 - cone) * smoothstep(0.05, 0.0, abs(ring - 0.5)) * (0.4 + 0.6*hash21(vec2(floor(r*11.0), floor(az*6.0))));
    // bright rim
    col += vec3(1.0, 0.95, 0.85) * 0.006 * smoothstep(0.965, 1.0, r);
  }
  return col;
}

// Single-scattering sky for thin atmospheres, plus the thick-haze glow of today.
vec3 skyScatter(vec3 rd, float y0){
  vec3 L = uLightDir;
  float mu = rd.y;
  float c = dot(rd, L);
  vec3 tauV = tauToSpace(y0, max(mu, 0.02));
  vec3 tauS = tauToSpace(y0, L.y);
  vec3 bR = uBetaR*exp(-y0/uHR), bM = uBetaM*exp(-y0/uHM);
  vec3 bExt = bR + bM;
  vec3 frac = (1.0 - exp(-tauV)) / max(bExt, vec3(1e-9));
  vec3 sunT = exp(-tauS * 0.6);
  vec3 ss = (bR*phaseR(c) + bM*0.92*phaseHG(c, uMieG)) * frac * sunT * uSkyLight;
  // multiple scattering, roughly: a softer copy without the phase function
  vec3 ms = (bR*vec3(0.75, 0.88, 1.0) + bM*0.4) * frac * 0.02 * uSkyLight * exp(-tauS*0.25) * (0.4 + 0.6*clamp(L.y*3.0 + 0.3, 0.0, 1.0));
  // thick haze (Venus today): uniform glow, a little brighter overhead and sunward
  float sunward = pow(max(dot(rd, uSunDir), 0.0), 4.0);
  vec3 haze = uDiffuse * (0.82 + 0.18*clamp(mu*2.0+0.4, 0.0, 1.0)) * (1.0 + 0.45*sunward);
  // night: a luminous band low in the sky, darker overhead, as in a nocturne
  float nb = 0.32 + 0.68*exp(-max(mu, 0.0)*5.0);
  return (ss + ms)*mix(1.0, uSkyBoost, smoothstep(0.0, 0.45, mu)) + haze + uNightSky*nb;
}

vec3 skyColor(vec3 rd, bool withDisc){
  float y0 = trueAlt(uCam.y);
  vec3 col = skyScatter(rd, y0);   // includes the night skyglow
  vec3 tauV = tauToSpace(y0, max(rd.y, 0.015));
  vec3 Tv = exp(-tauV) * (1.0 - uCloudDeck);
  // stars and the shade, dimmed and reddened by the air
  col += nightSky(rd) * uStarVis * Tv;
  if (uShadeVis > 0.001) col += shadeDisc(rd) * uShadeVis * Tv;
  // the soletta's image of the Sun: a full-size disc, 40% wider than Earth's Sun
#ifndef VENUS_NOHEX
  if (withDisc && uSoletta > 0.0){
    float c = dot(rd, uLightDir);
    float r = 0.75*0.0174533*0.5*1.0;   // angular radius (rad)
    float d = acos(clamp(c, -1.0, 1.0));
    float disc = smoothstep(r, r*0.92, d);
    col += uLightCol * disc * 9000.0 * uSoletta * (1.0 - uClouds*0.0);
    col += uLightCol * exp(-d*60.0) * 1.2 * uSoletta;
  }
#endif
  return col;
}

// ── clouds: one painted layer with flat bases, drifting ──
float cloudDensity(vec2 xz){
  vec2 wind = vec2(9.0, 3.0) * uTime;
  vec2 q = (xz + wind) / 5200.0;
  vec2 w = vec2(fbm(q*0.5 + 3.1, 3), fbm(q*0.5 - 1.7, 3));
  // billowy: sums of rounded bumps, so the clouds come in heaps with clear sky between
  float n = 0.0, a = 0.55, f = 1.0;
  for (int i=0;i<4+uZero;i++){ n += a*(1.0 - abs(vnoise(q*f + w*0.8 + float(i)*7.3))); f *= 2.1; a *= 0.5; }
  n = n*0.62 + 0.28*(fbm(q*0.35 + 11.0, 2)*0.5 + 0.5);
  float cov = uCloud.x;
  return smoothstep(1.0 - cov*0.9, 1.0 - cov*0.9 + 0.16, n);
}
// colour (premultiplied) and alpha of the cloud layer along a ray, up to tMax
vec4 cloudLayer(vec3 ro, vec3 rd, float tMax){
#ifdef VENUS_EARLY
  return vec4(0.0);   // no cloud layer before the CO2 rains (uCloud.x is 0 then)
#endif
  if (uCloud.x <= 0.001) return vec4(0.0);
  float cy = uCloud.z;
  float t = (cy - ro.y) / rd.y;
  if (t <= 0.0 || t > tMax || abs(rd.y) < 1e-4) return vec4(0.0);
  vec3 p = ro + rd*t;
  if (t > 260000.0) return vec4(0.0);
  // the density here, a little toward the light (edges toward it are lit), and a little
  // toward us (the side of each heap facing us is its shaded base): one call site
  vec2 lxz = normalize(uLightDir.xz + 1e-4), vxz = normalize(rd.xz + 1e-4);
  float d = 0.0, dl = 0.0, dn = 0.0;
  for (int k=0;k<3+uZero;k++){
    float dk = cloudDensity(p.xz + (k == 1 ? lxz*600.0 : k == 2 ? -vxz*500.0 : vec2(0.0)));
    if (k == 0){ d = dk; if (d <= 0.001) return vec4(0.0); }
    else if (k == 1) dl = dk; else dn = dk;
  }
  float lit = clamp(0.55 + (d - dl)*1.8, 0.0, 1.0);
  float base = clamp((d - dn)*2.0, 0.0, 1.0);
  lit *= 1.0 - 0.55*base;
  float below = ro.y < cy ? 1.0 : 0.0;     // seen from below: the dark base dominates
  float thick = smoothstep(0.2, 1.0, d);
  vec3 sun = uLightCol * (below > 0.5 ? mix(1.1, 0.35, thick) * (0.6 + 0.6*lit) : (0.8 + 0.6*lit));
  vec3 amb = uSkyAmb * 0.9 + uNightAmb*1.5 + uDiffuse;
  vec3 col = (sun + amb) * mix(0.95, 0.75, uCloud.y) * mix(1.0, 0.45, uCloud.y*thick);
  // silver lining when looking toward the light through thin edges
  float c = max(dot(rd, uLightDir), 0.0);
  col += uLightCol * pow(c, 12.0) * (1.0 - thick) * 2.5;
  float a = clamp(d*1.15, 0.0, 1.0) * smoothstep(260000.0, 60000.0, t);
  // the air between us and the cloud
  vec3 T = exp(-tauSegment(ro, rd, t) * uAirK);
  vec3 fogCol = skyScatter(normalize(vec3(rd.x, max(rd.y, 0.02), rd.z)), trueAlt(ro.y));
  col = col*T + fogCol*(1.0 - T);
  return vec4(col*a, a);
}
float cloudShadow(vec3 p){
  if (uCloud.x <= 0.001 || uLightDir.y <= 0.02) return 1.0;
  float t = (uCloud.z - p.y) / uLightDir.y;
  if (t <= 0.0) return 1.0;
  vec2 q = p.xz + uLightDir.xz * t;
  return 1.0 - 0.75*cloudDensity(q);
}

// the full surface height the ray sees (before curvature)
// The branches below are written as switches on purpose. Direct3D's shader compiler
// (FXC, which Chrome and Edge use on Windows) flattens plain if-blocks: it computes
// every arm and selects, which makes this function enormous wherever it is inlined,
// and inside the shadow loop it ran out of stack and crashed the browser's GPU
// process. A switch keeps a real branch. Same arithmetic, same picture.
float surfaceH(vec2 xz, float t, out float terrainOnly){
  float h = t < 1800.0 ? baseHeightSmooth(xz) : baseHeight(xz);
  float fineFade = 1.0 - smoothstep(600.0, 4000.0, t);
  switch (int(fineFade > 0.0)) { case 1: h += fineDetail(xz, int(uFineOct)) * fineFade; break; default: break; }
  vec2 sp = xz - uStand; float sr = length(sp);
  switch (int(sr < 230.0)) { case 1: h = mix(uStandH + nearField(sp), h, smoothstep(70.0, 230.0, sr)); break; default: break; }
  switch (int(t < 260.0)) { case 1: h += slabs(xz) * (1.0 - smoothstep(120.0, 260.0, t)); break; default: break; }
  terrainOnly = h;
  switch (int(uIceOn > 0.5 && h < 70.0*EXAG)) { case 1: h = max(h, iceTopFrom(xz, h)); break; default: break; }
  return h;
}

float shadowRay(vec3 p, vec3 L){
  float res = 1.0, t = 0.8;
  for (int i=0;i<30+uZero;i++){
    vec3 q = p + L*t;
    float d = 0.0;
    float h = surfaceH(q.xz, length(q - uCam), d) - curvature(q.xz);
    float k = (q.y - h) / t;
    res = min(res, smoothstep(0.0, 0.05, k + 0.01));
    if (res < 0.01 || q.y > 14000.0) break;
    t *= 1.38;
  }
  return res;
}

// Light a surface with everything the year provides (shared by terrain and objects).
uniform vec4 uMachines[8];   // nearest work lights: xyz render, w intensity
uniform float uNoShadow;
vec3 lightSurface(vec3 p, vec3 N, vec3 alb, float spec, float sheen, float ao, bool shadows){
  float ndl = max(dot(N, uLightDir), 0.0);
  float sh = 1.0;
  if (shadows && uNoShadow < 0.5 && ndl > 0.0 && luma(uLightCol) > 1e-5) sh = shadowRay(p + N*0.6, uLightDir);
  sh *= cloudShadow(p);
  vec3 V = normalize(uCam - p);
  vec3 Hh = normalize(uLightDir + V);
  float specT = pow(max(dot(N, Hh), 0.0), mix(18.0, 90.0, sheen)) * spec * 2.0;
  vec3 light = uLightCol * (ndl * sh) * (1.0 + specT);
  vec3 amb = mix(uGroundAmb, uSkyAmb, N.y*0.5 + 0.5) * ao + uNightAmb * ao * (0.2 + 0.55*max(N.y, 0.0) + 0.35*max(dot(N, normalize(vec3(-0.55, 0.75, 0.35))), 0.0));
  amb += uFlash * (0.4 + 0.6*max(dot(N, uFlashDir), 0.0));
  amb += vec3(1.0, 0.78, 0.5) * uColonyLight * max(dot(N, normalize(uColonyPos - p)), 0.0) * ao;
  vec3 c = alb * (light + amb);
  for (int i=0;i<8+uZero;i++){
    vec4 m = uMachines[i]; if (m.w <= 0.0) continue;
    vec3 dl = m.xyz - p; float d2 = dot(dl, dl);
    c += alb * vec3(1.0, 0.66, 0.36) * m.w * max(dot(N, normalize(dl)), 0.0) * 9000.0 / (d2 + 900.0);
  }
  return c;
}
vec3 airPerspective(vec3 col, vec3 p){
  vec3 ro = uCam; vec3 d = p - ro; float t = length(d); vec3 rd = d / max(t, 1e-3);
  vec3 skyRd = normalize(vec3(rd.x, max(rd.y, 0.02), rd.z));
  vec3 fogCol = skyScatter(skyRd, trueAlt(ro.y));
  vec3 T = exp(-tauSegment(ro, rd, t) * uAirK);
  return col * T + fogCol * (1.0 - T);
}
`;

// Debug views (?debug=1..7) are compiled in only when asked for: each one is another copy of
// the terrain functions for Direct3D's compiler. The scene is also built in three tiers, so the
// first view opens quickly while the rest compiles in the background (see app.js):
//   0 EARLY  the years before the CO2 rains: no seas, ice, clouds, paving or soil;
//   1 MID    seas, freezing and snow, before the paving: no hexagons, water or soletta;
//   2 FULL   everything.
export const TIER_UNTIL = [19.9, 109.3, Infinity];
export const SCENE_FS = (debug = false, tier = 2) => `#version 300 es
${debug ? '#define VENUS_DEBUG 1' : ''}
${tier === 0 ? '#define VENUS_EARLY 1' : ''}
${tier === 1 ? '#define VENUS_MID 1' : ''}
${tier < 2 ? '#define VENUS_NOHEX 1' : ''}
${COMMON()}
${SCENE_COMMON()}
in vec2 vUV;
layout(location=0) out vec4 outColor;
uniform vec3 uRight, uUp, uFwd; uniform vec2 uTan;
uniform float uLogK; uniform float uMaxT; uniform int uSteps;
uniform float uDebug; uniform float uDebugR;

// Rock, frost, sheeting, soil, grass: what the land is at this year.
vec3 landAlbedo(vec3 p, vec3 N, float cav, float slope, Hex hxIn, Sched scIn, out float spec, out float sheen, out vec2 machine, out float workLight, out vec2 bump){
  vec2 xz = p.xz;
  bump = vec2(0.0);
  float dNear = length(p - uCam);
  float near = 1.0 - smoothstep(60.0, 220.0, dNear);
  float n1 = fbm(xz/37.0, 4), n2 = fbm(xz/430.0, 4), n3 = vnoise(xz/9.0);
  // basalt: dark grey, with flaggy plates and finer soil in the hollows
  vec3 rock = mix(vec3(0.050, 0.046, 0.043), vec3(0.105, 0.092, 0.078), smoothstep(-0.4, 0.6, n1 + 0.3*n2));
  rock = mix(rock, vec3(0.036, 0.032, 0.030), smoothstep(0.55, 0.85, cav) * 0.5);
  rock *= 0.9 + 0.2*n3;
  // sulphate crusts after the acid rain
  float crust = smoothstep(0.15, 0.6, fbm(xz/140.0 + 4.0, 4) + cav*0.6 - 0.25) * uAcid;
  rock = mix(rock, vec3(0.34, 0.30, 0.17), crust*0.55);
  // near the eye: plates of basalt split by cracks full of dark grit
  float dEye = length(p - uCam);
  if (dEye < 320.0){
    vec3 v = voronoi(xz/1.6 + vec2(vnoise(xz/5.0), vnoise(xz/5.0 + 3.0))*0.6);
    float fadeN = 1.0 - smoothstep(120.0, 320.0, dEye);
    float plate = 0.75 + 0.55*v.y;
    float crack = 1.0 - smoothstep(0.03, 0.12, v.x);
    vec3 plated = rock * plate * (1.0 + 0.35*smoothstep(0.3, 0.05, v.z));
    // fine grit collects in the cracks: paler and warmer than the plates
    plated = mix(plated, vec3(0.085, 0.07, 0.055), crack*0.9);
    plated *= 0.92 + 0.16*vnoise(xz*3.1);
    rock = mix(rock, plated, fadeN);
  }
  vec3 col = rock;
  spec = 0.03; sheen = 0.0; workLight = 0.0; machine = vec2(1e9);

  // CO2 frost and snow: drifts in hollows and on gentle ground first
  float drift = smoothstep(0.25, 0.75, uSnow*1.25 - slope*0.8 + (cav - 0.5)*0.9 + n2*0.25);
  float frost = uSnow * 0.5 + uFreeze * 0.25 * smoothstep(0.4, 0.8, cav);
  float snow = clamp(max(drift, frost*smoothstep(0.2, 0.7, n1 + 0.5)), 0.0, 1.0);
  vec3 snowCol = vec3(0.80, 0.83, 0.88) * (0.92 + 0.08*n3);

#ifdef VENUS_NOHEX
  // nothing is laid on the land before the paving years
  vec2 mPave = vec2(1e9), mSoil = vec2(1e9); float aPave = 0.0, aSoil = 0.0, covered = 0.0, soiled = 0.0;
  Hex hx; Sched sc;
#else
  Hex hx = hxIn; Sched sc = scIn;   // this point's hexagon, from main()
  vec2 mPave, mSoil; float aPave, aSoil;
  float covered = uYear > sc.pave ? laneCover(hx, xz, sc.pave, LAND_DUR, sc.laneA, mPave, aPave) : 0.0;
  if (uYear > sc.pave + LAND_DUR) { covered = 1.0; aPave = 0.0; }
  float soiled = uYear > sc.soil ? laneCover(hx, xz, sc.soil, SOIL_DUR, sc.soilA, mSoil, aSoil) : 0.0;
  if (uYear > sc.soil + SOIL_DUR) { soiled = 1.0; aSoil = 0.0; }
  if (uYear <= sc.pave) aPave = 0.0;
  if (uYear <= sc.soil) aSoil = 0.0;
  // the visitor's own hexagons, worked in real seconds
  if (sc.user.g > 0.0 && covered < 0.5){ vec2 m; float a; covered = laneCoverT(hx, xz, (uClock - sc.user.g)/5.0, sc.laneA, m, a); if (a > 0.5){ mPave = m; aPave = 1.0; } }
  if (sc.user.b > 0.0 && soiled < 0.5){ vec2 m; float a; soiled = laneCoverT(hx, xz, (uClock - sc.user.b)/5.0, sc.soilA, m, a); if (a > 0.5){ mSoil = m; aSoil = 1.0; } }
#endif

  // snow lies until it is covered (the cover goes over it), the rock stays bare elsewhere
  float snowLeft = snow * (1.0 - smoothstep(SOLETTA, SOLETTA + 10.0, uYear) * (1.0 - covered));
  col = mix(col, snowCol, snowLeft);
  if (snow > 0.5) spec = 0.02;
  gMat = snowLeft > 0.5 ? 2 : 1; gAux = crust;

  if (covered > 0.5 && soiled < 0.5){
    // plastic sheet over the CO2 snow: 60 m strips, each laid from rolls 5 m wide,
    // welded at the seams, slack and creased, weighted with ballast along the joints
    vec2 u = vec2(cos(sc.laneA), sin(sc.laneA)), v = vec2(-u.y, u.x);
    float vv = dot(xz - hx.c, v), uu = dot(xz - hx.c, u);
    float strip = fract(vv / LANE);
    float seam = smoothstep(0.035, 0.0, min(strip, 1.0 - strip));
    float fold = 0.5 + 0.5*sin(uu/7.0 + vnoise(xz/23.0)*3.0);
    float tone = hash2(ivec2(floor(vv/LANE), hx.id.x*31 + hx.id.y));
    // a warm grey insulating membrane, so it reads against the white snow
    col = mix(vec3(0.17, 0.17, 0.17), vec3(0.23, 0.22, 0.21), tone) * (0.9 + 0.1*fold);
    col = mix(col, vec3(0.62, 0.62, 0.60), seam * 0.8);
    col = mix(col, vec3(0.55, 0.55, 0.53), smoothstep(14.0, 4.0, hx.edge));
    spec = 0.45; sheen = 0.5 + 0.5*fold;
    gMat = 3; gAux = max(seam, smoothstep(14.0, 4.0, hx.edge));
    if (near > 0.0){
      float roll = fract(vv/5.0);
      float weld = smoothstep(0.06, 0.02, min(roll, 1.0 - roll));
      float rollTone = hash21(vec2(floor(vv/5.0), float(hx.id.y)));
      // creases: long soft ridges across the roll, wandering
      float cr = vnoise(vec2(uu/1.6, vv/0.7)) + 0.5*vnoise(vec2(uu/0.6, vv/0.25) + 7.0);
      float crX = vnoise(vec2((uu + 0.05)/1.6, vv/0.7)) + 0.5*vnoise(vec2((uu + 0.05)/0.6, vv/0.25) + 7.0);
      float crY = vnoise(vec2(uu/1.6, (vv + 0.05)/0.7)) + 0.5*vnoise(vec2(uu/0.6, (vv + 0.05)/0.25) + 7.0);
      vec2 g = vec2(crX - cr, crY - cr) / 0.05;
      bump += (u*g.x + v*g.y) * 0.05 * near;
      vec3 nc = col * (0.95 + 0.1*rollTone);
      nc = mix(nc, vec3(0.66, 0.66, 0.63), weld*0.85);
      // ballast: dark stones laid along each weld
      vec2 bc = vec2(uu/1.6, vv/5.0 + 0.5); float stone = step(0.55, hash21(floor(bc) + 3.0)) * smoothstep(0.42, 0.3, length((fract(bc) - 0.5)*vec2(1.0, 8.0)));
      nc = mix(nc, vec3(0.05, 0.045, 0.04), stone);
      col = mix(col, nc, near);
    }
  }
  if (soiled > 0.5){
    vec2 u = vec2(cos(sc.soilA), sin(sc.soilA)), v = vec2(-u.y, u.x);
    float vv = dot(xz - hx.c, v), uu = dot(xz - hx.c, u);
    float furrow = 0.5 + 0.5*sin(vv*TAU/4.0 + vnoise(xz/11.0));
    float age = smoothstep(sc.soil, sc.soil + 25.0, uYear);
    vec3 soil = mix(vec3(0.055, 0.038, 0.026), vec3(0.115, 0.085, 0.055), age*0.7 + 0.3*n1);
    soil *= 0.88 + 0.12*furrow;
    if (near > 0.0){
      // crumbly ground: clods, ridges left by the spreader, pale grit
      float clod = vnoise(xz*2.3) + 0.5*vnoise(xz*6.1 + 3.0);
      float ridge = sin(vv*TAU/0.9 + vnoise(xz*0.7)*2.0);
      bump += v * cos(vv*TAU/0.9) * 0.35 * near * (1.0 - age);
      vec3 ns = soil * (0.82 + 0.25*clod) * (0.92 + 0.08*ridge);
      float grit = smoothstep(0.55, 0.85, vnoise(xz*7.0) * vnoise(xz*2.3 + 4.0) + 0.3);
      ns = mix(ns, vec3(0.16, 0.13, 0.10), grit*0.35);
      soil = mix(soil, ns, near);
    }
    col = soil; spec = 0.02; sheen = 0.0;
    // what grows: grass first, then farms, woods and the town by hexagon
    float g = uGreen;
    float kind = sc.r3;     // 0..0.45 farm, 0.45..0.75 wood, 0.75..1 meadow
    float start = smoothstep(0.0, 1.0, g*1.6 - sc.r1*0.5);
    vec3 grass = mix(vec3(0.055, 0.085, 0.026), vec3(0.11, 0.13, 0.04), n2*0.5 + 0.5);
    if (near > 0.0){
      float tuft = vnoise(xz*1.7) + 0.6*vnoise(xz*5.3 + 2.0);
      vec3 ng = grass * (0.75 + 0.45*tuft);
      ng = mix(ng, vec3(0.16, 0.15, 0.06), smoothstep(0.6, 1.1, vnoise(xz*0.4 + 8.0) + tuft*0.3)*0.5);  // dry patches
      float flower = smoothstep(0.75, 0.95, vnoise(xz*1.3) * 0.5 + vnoise(xz*0.2 + 3.0) * 0.6);
      ng = mix(ng, vec3(0.42, 0.38, 0.14), flower*0.5);
      bump += vec2(vnoise(xz*4.0) - 0.5, vnoise(xz*4.0 + 5.0) - 0.5) * 0.25 * near;
      grass = mix(grass, ng, near);
    }
    vec3 green = grass;
    if (sc.town > 0.5){
      // streets and yards (houses are objects); streets fade out with distance
      vec2 fu = rot2(sc.soilA) * (xz - hx.c);
      vec2 cellD = (0.5 - abs(fract(fu/vec2(110.0, 70.0)) - 0.5)) * vec2(110.0, 70.0);
      float dStreet = min(cellD.x, cellD.y);
      float aa = max(fwidth(dStreet), 0.5);
      float street = (1.0 - smoothstep(3.0 - aa, 3.0 + aa, dStreet)) * (1.0 - smoothstep(1500.0, 6000.0, dNear));
      vec3 yard = mix(grass*0.85, vec3(0.13, 0.11, 0.07), 0.25 + 0.2*hash21(floor(fu/vec2(110.0, 70.0))));
      green = mix(yard, vec3(0.20, 0.18, 0.15), street * smoothstep(S_TOWN0, S_TOWN1, uTown + sc.r1*0.1));
    } else if (kind < 0.45){
      vec2 fu = rot2(sc.soilA + floor(sc.r2*2.0)*PI*0.5) * (xz - hx.c);
      float field = floor(fu.x / 140.0) + floor(fu.y / 260.0)*7.0;
      float ft = hash21(vec2(field, float(hx.id.x)));
      vec3 crop = ft < 0.33 ? vec3(0.17, 0.15, 0.06) : ft < 0.66 ? vec3(0.07, 0.10, 0.03) : vec3(0.12, 0.13, 0.045);
      float rows = 0.85 + 0.15*sin(fu.y*TAU/6.0);
      float hedge = smoothstep(4.0, 0.0, min(abs(fract(fu.x/140.0)-0.5)*140.0 - 66.0 + 4.0, abs(fract(fu.y/260.0)-0.5)*260.0 - 126.0 + 4.0));
      green = mix(crop*rows, vec3(0.03, 0.05, 0.02), hedge*0.6);
    } else if (kind < 0.75){
      float canopy = fbm(xz/18.0 + 3.0, 4);
      green = mix(vec3(0.020, 0.040, 0.017), vec3(0.05, 0.075, 0.03), canopy*0.5 + 0.5);
    }
    col = mix(col, green, start);
    gMat = 4; gAux = 0.0;
    if (start > 0.5){ gMat = sc.town > 0.5 ? 8 : kind < 0.45 ? 6 : kind < 0.75 ? 7 : 5; if (gMat == 6){ vec2 fu2 = rot2(sc.soilA + floor(sc.r2*2.0)*PI*0.5) * (xz - hx.c); gAux = hash21(vec2(floor(fu2.x/140.0) + floor(fu2.y/260.0)*7.0, float(hx.id.x))); } }
  }
  // work light pools from the machines laying sheet or soil on this hexagon
  if (aPave > 0.5){ machine = mPave; workLight = 1.0; }
  if (aSoil > 0.5){ machine = mSoil; workLight = 1.0; }
  return col;
}

// The old sea floor's cover: ice, hexagon paving, soil on the raised hexagons.
vec3 seaAlbedo(vec3 p, Hex hx, Sched sc, out float spec, out float sheen, out float seamLight){
  vec2 xz = p.xz;
  float n1 = fbm(xz/60.0, 4), n2 = fbm(xz/700.0, 3);
  // CO2 ice: white, cracked into plates
  vec2 cr = xz/180.0 + vec2(vnoise(xz/400.0), vnoise(xz/400.0+5.0))*0.6;
  vec2 cf = fract(cr) - 0.5; float crack = smoothstep(0.03, 0.0, min(abs(cf.x), abs(cf.y)) - 0.46 + 0.46);
  vec3 col = mix(vec3(0.70, 0.75, 0.80), vec3(0.86, 0.88, 0.90), n1*0.5 + 0.5);
  col *= 1.0 - 0.25*smoothstep(0.46, 0.5, max(abs(cf.x), abs(cf.y)));
  col = mix(col, vec3(0.92, 0.93, 0.95), uSnow*0.6);
  spec = 0.25; sheen = 0.0; seamLight = 0.0;
  gMat = 9; gAux = smoothstep(0.46, 0.5, max(abs(cf.x), abs(cf.y)));
#ifndef VENUS_NOHEX
  {
    float dc = length(xz - hx.c);
    float tu = sc.user.r > 0.0 ? uClock - sc.user.r : -1.0;
    float ta = (uYear - (sc.seaPave - 1.4)) / 1.4;          // the colonies' floaters, by year
    float pool = 0.0;
    if (tu >= 0.0 && tu < 5.0) pool = smoothstep(0.0, 0.4, tu) * (1.0 - smoothstep(3.6, 5.0, tu));
    if (ta > 0.0 && ta < 1.15) pool = max(pool, (1.0 - smoothstep(0.95, 1.15, ta)) * 0.8);
    seamLight += pool * exp(-dc*dc/(820.0*820.0)) * 0.6;
  }
  {
    if (seaPaved(sc)){
      // a hexagon of hollow blocks, foamed rock and sheeting
      float tone = sc.r2;
      vec3 block = mix(vec3(0.52, 0.50, 0.46), vec3(0.66, 0.64, 0.58), tone);
      if (sc.r1 > 0.62) block = mix(block, vec3(0.62, 0.66, 0.70), 0.6);  // reflective film
      vec2 bl = rot2(HEX_ROT) * (xz - hx.c);
      // blocks: small hexagons (about 70 m) of foamed rock inside the big one, each a
      // slightly different pour; joints filled with dark sealant
      vec2 sg = bl / 40.0;
      vec3 sc3 = vec3(0.57735027*sg.x - sg.y/3.0, 2.0/3.0*sg.y, 0.0); sc3.z = -sc3.x - sc3.y;
      vec3 sr = floor(sc3 + 0.5), sd = abs(sr - sc3);
      if (sd.x > sd.y && sd.x > sd.z) sr.x = -sr.y - sr.z; else if (sd.y > sd.z) sr.y = -sr.x - sr.z;
      vec2 scc = vec2(1.7320508*(sr.x + sr.y*0.5), 1.5*sr.y);
      vec2 sl = abs(sg - scc);
      float sedge = 0.8660254 - max(sl.x, sl.x*0.5 + sl.y*0.8660254);
      float aa = max(fwidth(sedge), 0.01);
      float joint = 1.0 - smoothstep(0.02, 0.02 + aa*1.5, sedge);
      joint *= 1.0 - smoothstep(1500.0, 7000.0, length(p - uCam));
      float bt = hash21(sr.xy + vec2(float(hx.id.x)*17.0, float(hx.id.y)*29.0));
      block *= 0.90 + 0.18*bt;
      block = mix(block, vec3(0.13, 0.12, 0.11), joint*0.75);
      float edge = smoothstep(26.0, 6.0, hx.edge);
      block = mix(block, vec3(0.16, 0.16, 0.17), edge);
      col = block; spec = sc.r1 > 0.62 ? 0.6 : 0.12; sheen = sc.r1 > 0.62 ? 1.0 : 0.2;
      gMat = 10; gAux = max(joint, edge) + (sc.r1 > 0.62 ? 2.0 : 0.0);
      // fresh seams are welded under lights for a few years
      float fresh = max(1.0 - smoothstep(sc.seaPave, sc.seaPave + 3.0, uYear), sc.user.r > 0.0 ? 1.0 - smoothstep(3.2, 14.0, uClock - sc.user.r) : 0.0);
      seamLight = edge * fresh * step(uYear, SOLETTA + 8.0) * 3.0;
      if (sc.island && uYear > sc.islandT){
        float t = 1.0;
        float age = smoothstep(sc.islandT, sc.islandT + 15.0, uYear);
        vec3 soil = mix(vec3(0.06, 0.042, 0.028), vec3(0.10, 0.075, 0.05), age);
        float g2 = smoothstep(0.0, 1.0, uGreen*1.6 - sc.r1*0.3) * (0.6 + 0.4*age);
        vec3 grass = mix(vec3(0.05, 0.085, 0.025), vec3(0.10, 0.12, 0.035), n2*0.5+0.5);
        if (sc.r3 < 0.5){
          vec2 fu = rot2(sc.soilA) * (xz - hx.c);
          float ft = hash21(vec2(floor(fu.x/120.0), floor(fu.y/220.0)) + vec2(float(hx.id.x)));
          grass = ft < 0.4 ? vec3(0.16, 0.14, 0.055) : ft < 0.7 ? vec3(0.065, 0.10, 0.03) : vec3(0.12, 0.125, 0.04);
        } else if (sc.r3 < 0.7) {
          grass = mix(vec3(0.02, 0.04, 0.017), vec3(0.045, 0.07, 0.03), fbm(xz/18.0, 4)*0.5+0.5);
        }
        soil = mix(soil, grass, g2);
        // the island's edge: a pale quay of blocks where it meets the water
        soil = mix(soil, vec3(0.42, 0.40, 0.35), smoothstep(45.0, 25.0, hx.edge));
        col = mix(col, soil, t * smoothstep(8.0, 30.0, hx.edge));
        if (hx.edge > 30.0){ gMat = g2 > 0.5 ? (sc.r3 < 0.5 ? 6 : sc.r3 < 0.7 ? 7 : 5) : 4; gAux = gMat == 6 ? hash21(floor(rot2(sc.soilA)*(xz - hx.c)/vec2(120.0, 220.0)) + vec2(float(hx.id.x))) : 0.0; } else { gMat = 10; gAux = 1.0; }
        spec = mix(spec, 0.02, t); sheen *= 1.0 - t;
      }
    }
  }
#endif
  return col;
}

void main(){
  vec2 ndc = vUV*2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight*ndc.x*uTan.x + uUp*ndc.y*uTan.y);
#ifdef VENUS_DEBUG
  if (uDebug > 4.5 && uDebug < 5.5){
    // top-down map at kilometre scale: +-uDebugR metres; blue below the old sea, white below the ice level
    vec2 q = uStand + (vUV - 0.5) * vec2(2.0*uDebugR * uTan.x/uTan.y, 2.0*uDebugR) * vec2(1.0, -1.0);
    float h = baseHeight(q) / EXAG;
    vec3 col = h < -260.0 ? vec3(0.85, 0.9, 1.0) : h < 0.0 ? vec3(0.2, 0.35, 0.7) : mix(vec3(0.45, 0.4, 0.3), vec3(0.95, 0.9, 0.8), clamp(h/1500.0, 0.0, 1.0));
    if (fract(h/100.0) < 0.03) col *= 0.6;
    Hex hx = hexInfo(q); if (hx.edge < uDebugR*0.002) col *= 0.7;
    if (length(q - uStand) < uDebugR*0.01) col = vec3(1.0, 0.0, 0.0);
    vec2 fwdp = uStand + normalize(uFwd.xz) * clamp(dot(q - uStand, normalize(uFwd.xz)), 0.0, uDebugR);
    if (length(q - fwdp) < uDebugR*0.004) col = vec3(1.0, 1.0, 0.0);
    outColor = vec4(col, 1.0); gl_FragDepth = 0.5; return;
  }
#endif
#ifdef VENUS_DEBUG
  if (uDebug > 3.5 && uDebug < 4.5){
    // top-down map of the surface around the standpoint: +-120 m, contours every metre
    vec2 q = uStand + (vUV - 0.5) * vec2(240.0 * uTan.x/uTan.y, 240.0) * vec2(1.0, -1.0);
    float d0; float h = surfaceH(q, length(q - uCam.xz), d0) - uCam.y;
    float c = fract(h) < 0.08 ? 0.0 : 1.0; float c10 = fract(h/10.0) < 0.02 ? 0.0 : 1.0;
    vec3 col = h > -1.7 ? vec3(0.9, 0.5, 0.3) : mix(vec3(0.2, 0.3, 0.6), vec3(0.8, 0.9, 0.7), clamp((h + 40.0)/40.0, 0.0, 1.0));
    if (length(q - uStand) < 1.0) col = vec3(1.0, 0.0, 0.0);
    vec2 fwdp = uStand + normalize(uFwd.xz) * clamp(dot(q - uStand, normalize(uFwd.xz)), 0.0, 60.0);
    if (length(q - fwdp) < 0.5) col = vec3(1.0, 1.0, 0.0);
    outColor = vec4(col * c * mix(0.5, 1.0, c10), 1.0); gl_FragDepth = 0.5; return;
  }
#endif
#ifdef VENUS_DEBUG
  if (uDebug > 2.5 && uDebug < 3.5){ float tt0; outColor = vec4(baseHeight(uCam.xz), baseHeightSmooth(uCam.xz), surfaceH(uCam.xz, 0.0, tt0), uCam.y); gl_FragDepth = 0.5; return; }
#endif
  vec3 ro = uCam;

  // liquid surface (CO2 sea, later water over the paving) on the sphere
#if defined(VENUS_EARLY)
  float liquidY = -1e9;   // no seas yet
#elif defined(VENUS_MID)
  float liquidY = uSeaLiquid > 0.5 ? uSeaY : -1e9;   // no water yet
#else
  float liquidY = uSeaLiquid > 0.5 ? uSeaY : (uWater > 0.001 ? uWaterY : -1e9);
#endif
  float tLiquid = 1e9;
  if (liquidY > -1e8){
    float a = dot(rd.xz, rd.xz)/(2.0*PLANET_R), b = rd.y, c = ro.y - liquidY;
    float disc = b*b - 4.0*a*c;
    if (disc > 0.0){ float t0 = (-b - sqrt(disc))/(2.0*a); if (t0 > 0.0) tLiquid = t0; }
  }

  // march the heightfield
  float t = 0.6, tPrev = 0.0, dPrev = 1e9, terr = 0.0;
  bool hit = false;
  float tMax = min(uMaxT, tLiquid);
  // past the distance where the air is opaque, it is all fog: stop there
  float y0c = trueAlt(ro.y);
  float bExt0 = (uBetaR.g*exp(-y0c/uHR) + uBetaM.g*exp(-y0c/uHM)) * uAirK;
  float tFog = 9.0 / max(bExt0, 1e-9) * (rd.y > 0.0 ? 1.0 + rd.y*30.0 : 1.0);
  tMax = min(tMax, tFog);
  // One loop, one call site for surfaceH (Direct3D's compiler inlines every call): march;
  // after the first step under the ground, bisect six times between the last two steps; then
  // read the surface where the ray ends (ground or liquid); then, near the eye on land, the
  // four neighbours for the fine-relief normal.
  int refine = -1, phase = 0; float lo = 0.0, hi = 0.0;
  bool onLiquid = false, sea = false;
  float tt = 0.0, hitH = 0.0, hitTerr = 0.0, fdE = 0.0;
  Hex hxHit; Sched scHit;   // the hexagon where the ray ends (paving, ice, albedos)
  float fd[4]; fd[0] = 0.0; fd[1] = 0.0; fd[2] = 0.0; fd[3] = 0.0;
  for (int i=0;i<416+uZero;i++){
    if (phase == 0 && refine < 0 && i >= uSteps) phase = 1;
    if (phase == 1){
      onLiquid = (!hit || t > tLiquid) && tLiquid < 1e8;
      if (!hit && !onLiquid) break;
      tt = onLiquid ? tLiquid : t;
    }
    vec2 xz; float tq;
    if (phase == 0){ tq = refine < 0 ? t : 0.5*(lo+hi); xz = (ro + rd*tq).xz; }
    else { tq = tt; vec2 o = phase == 2 ? vec2(fdE, 0.0) : phase == 3 ? vec2(-fdE, 0.0) : phase == 4 ? vec2(0.0, fdE) : phase == 5 ? vec2(0.0, -fdE) : vec2(0.0); xz = (ro + rd*tt).xz + o; }
    float tOnly;
    float h = surfaceH(xz, tq, tOnly);
    if (phase == 0){
      terr = tOnly;
      vec3 p = ro + rd*tq;
      float d = p.y - (h - curvature(p.xz));
      if (refine >= 0){
        if (d < 0.0) hi = tq; else lo = tq;
        refine++;
        if (refine == 6){ t = hi; hit = true; phase = 1; }
        continue;
      }
      if (d < 0.0){ lo = tPrev; hi = t; refine = 0; continue; }
      if (t > tMax || (rd.y > 0.0 && p.y > 26000.0)){ phase = 1; continue; }
      tPrev = t; dPrev = d;
      t += max(d*0.45, 0.004*t + 0.15);
      continue;
    }
    if (phase == 1){
      hitH = h; hitTerr = tOnly;
#if defined(VENUS_MID)
      vec2 pxz = (ro + rd*tt).xz;
      sea = !onLiquid && (uIceOn > 0.5) && iceTopFrom(pxz, baseHeight(pxz)) >= hitTerr - 0.01;
#elif !defined(VENUS_EARLY)
      vec2 pxz = (ro + rd*tt).xz;
      hxHit = hexInfo(pxz); scHit = hexSchedule(hxHit);
      sea = !onLiquid && (uIceOn > 0.5) && iceTopHex(baseHeight(pxz), hxHit, scHit) >= hitTerr - 0.01;
#endif
      if (onLiquid || sea || tt >= 420.0) break;
      fdE = max(0.04, tt*0.0025);
      phase = 2; continue;
    }
    fd[phase - 2] = h;
    if (phase == 5) break;
    phase++;
  }

  // Expensive functions are called from one place each: the sky and the cloud layer are read
  // once per ray at the end (the view, and the sea's reflection), and the paving once.
  float depthT;
  vec3 surfCol = vec3(0.0);
  vec3 cO = ro, cD = rd; float fresC = 0.0;

  if (!hit && !onLiquid){
#ifdef VENUS_DEBUG
    if (uDebug > 0.5 && uDebug < 5.5){ outColor = vec4(0.55, 0.65, 0.8, 1.0); gl_FragDepth = 1.0; return; }
#endif
    depthT = uMaxT * 4.0;
  } else {
    tt = onLiquid ? tLiquid : t;
    vec3 p = ro + rd*tt;
    depthT = tt;
    float hFloor = hitH - curvature(p.xz);
    float seaSpec = 0.0, seaSheen = 0.0, seaSeam = 0.0; vec3 seaAlb = vec3(0.05, 0.045, 0.04);
    if (sea || (onLiquid && uIceOn > 0.5)) seaAlb = seaAlbedo(onLiquid ? vec3(p.x, hFloor, p.z) : p, hxHit, scHit, seaSpec, seaSheen, seaSeam);
    if (onLiquid){
      // a clear liquid: CO2 (nearly colourless, IOR 1.2) or water over the paving
      bool water = uSeaLiquid < 0.5;
      gAux = 0.0;
      // waves, filtered by distance so they never alias into speckle
      float fNear = 1.0 - smoothstep(150.0, 1500.0, tt), fMid = 1.0 - smoothstep(1500.0, 16000.0, tt);
      vec2 wv = vec2(0.0);
      wv += vec2(vnoise(p.xz/900.0 + uTime*0.004), vnoise(p.xz/900.0 + 7.0 - uTime*0.003)) * 0.03;
      wv += vec2(vnoise(p.xz/140.0 + uTime*0.02), vnoise(p.xz/140.0 + 3.0)) * 0.05 * fMid;
      wv += vec2(vnoise(p.xz/23.0 + vec2(uTime*0.12, 0.0)), vnoise(p.xz/19.0 - vec2(0.0, uTime*0.1) + 5.0)) * 0.05 * fNear;
      vec3 Nw = normalize(vec3(wv.x, 1.0, wv.y));
      vec3 refl = reflect(rd, Nw);
      // a rough sea reflects a blurred, higher piece of sky
      refl.y = abs(refl.y) * 0.75 + 0.07; refl = normalize(refl);
      float cosI = max(dot(-rd, Nw), 0.0);
      float R0 = water ? 0.02 : 0.0083;
      float fres = R0 + (1.0 - R0)*pow(1.0 - cosI, 5.0);
      cO = p + vec3(0.0, 0.5, 0.0); cD = refl;   // the reflected sky is added below
      // what lies under: the floor seen through the liquid, dimmed with depth
      float depth = max(0.0, p.y - hFloor) / EXAG;
      vec3 absorb = water ? vec3(0.42, 0.075, 0.035) : vec3(0.004, 0.003, 0.002);
      vec3 floorLight = uSkyAmb*0.5 + uLightCol*max(uLightDir.y, 0.0) + uNightAmb;
      vec3 floorAlb = seaAlb;
      vec3 under = floorAlb * floorLight * exp(-absorb * depth * (1.0 + 1.0/max(cosI, 0.15)) * 0.25);
      if (water) under += vec3(0.010, 0.040, 0.050) * (uSkyAmb + uLightCol*max(uLightDir.y,0.0)) * (1.0 - exp(-depth*0.06));
      if (!water && uFreeze > 0.0){
        // freezing: pale slush and plates spreading over the surface
        float plates = smoothstep(0.55 - uFreeze*0.9, 0.62 - uFreeze*0.9, fbm(p.xz/900.0, 4)*0.5 + 0.5 + vnoise(p.xz/90.0)*0.08);
        under = mix(under, vec3(0.75, 0.80, 0.86) * (uSkyAmb + uNightAmb + uLightCol*max(uLightDir.y,0.0)), plates);
        if (plates > 0.5) gAux = -1.0;
        fres *= 1.0 - plates*0.8;
      }
      surfCol = under*(1.0 - fres); fresC = fres;   // + fres * the reflected sky, below
      gMat = gAux < -0.5 ? 9 : (water ? 13 : 12); gAux = fres;
      // the soletta's glitter path
      float gl = pow(max(dot(reflect(rd, Nw), uLightDir), 0.0), 600.0);
      surfCol += uLightCol * gl * 40.0 * uSoletta;
    } else {
      float cav; vec3 N = baseNormal(p.xz, cav);
      // fine-relief normal by finite differences near the viewer
      float fineFade = 1.0 - smoothstep(600.0, 4000.0, tt);
      if (sea) N = vec3(0.0, 1.0, 0.0);
      if (tt < 420.0 && !sea){
        // the four neighbours were read in the march loop above
        float e = fdE;
        vec3 nn = normalize(vec3(-(fd[0] - fd[1])/(2.0*e), 1.0, -(fd[2] - fd[3])/(2.0*e)));
        N = normalize(mix(nn, N, smoothstep(250.0, 420.0, tt)));
      } else if (fineFade > 0.0 && !sea){
        float e = max(0.25, tt*0.0018);
        float hx = fineDetail(p.xz + vec2(e, 0.0), int(uFineOct)) - fineDetail(p.xz - vec2(e, 0.0), int(uFineOct));
        float hz = fineDetail(p.xz + vec2(0.0, e), int(uFineOct)) - fineDetail(p.xz - vec2(0.0, e), int(uFineOct));
        vec3 nf = normalize(vec3(-hx/(2.0*e), 1.0, -hz/(2.0*e)));
        N = normalize(N + (nf - vec3(0,1,0)) * fineFade);
      }
      float slope = 1.0 - N.y;
      float spec, sheen, workLight = 0.0, seamLight = 0.0; vec2 machine;
      vec3 alb;
      if (sea){ alb = seaAlb; spec = seaSpec; sheen = seaSheen; seamLight = seaSeam; machine = vec2(1e9); }
      else { vec2 bump; alb = landAlbedo(p, N, cav, slope, hxHit, scHit, spec, sheen, machine, workLight, bump); N = normalize(N - vec3(bump.x, 0.0, bump.y)); }
      float ao = clamp(0.35 + cav*0.9, 0.0, 1.0);
      surfCol = lightSurface(p, N, alb, spec, sheen, ao, true);
#ifdef VENUS_DEBUG
      if (uDebug > 5.5){ outColor = vec4(uDebug > 6.5 ? N*0.5 + 0.5 : alb*4.0, 1.0); gl_FragDepth = 0.5; return; }
#endif
      // work lights: sodium-orange pools around the machine on this hexagon
      vec3 wl = vec3(0.0);
      if (workLight > 0.5){
        float d = length(p.xz - machine);
        wl += vec3(1.0, 0.62, 0.30) * 0.035 * exp(-d*d/(140.0*140.0));
        wl += vec3(1.0, 0.75, 0.45) * 0.015 * exp(-d/400.0);
      }
      surfCol += alb * wl;
      surfCol += vec3(1.0, 0.68, 0.36) * seamLight * 0.012;
      // hot rock glowing faintly in the first dark years; lower ground is hotter
      if (uGlow > 0.0 && !sea){
        float hot = uGlow * (1.0 + clamp(-p.y/2500.0, -0.5, 1.0)*0.8) * (0.7 + 0.3*cav);
        surfCol += vec3(0.55, 0.075, 0.012) * 0.0016 * hot * (0.8 + 0.4*fbm(p.xz/30.0, 3));
      }
    }
#ifdef VENUS_DEBUG
    if (uDebug > 1.5 && uDebug < 2.5){ outColor = vec4(tt/20.0, tt/200.0, tt/2000.0, 1.0); gl_FragDepth = 0.5; return; }
#endif
#ifdef VENUS_DEBUG
    if (uDebug > 0.5 && uDebug < 1.5){
      float cav; vec3 N = baseNormal(p.xz, cav);
      float hh = trueAlt(p.y + curvature(p.xz));
      vec3 band = hh < 0.0 ? vec3(0.1,0.2,0.5) : mix(vec3(0.3,0.25,0.15), vec3(0.9,0.85,0.7), clamp(hh/3500.0,0.0,1.0));
      if (onLiquid) band = vec3(0.1, 0.25, 0.6);
      float c = fract(hh/100.0) < 0.04 ? 0.6 : 1.0;
      outColor = vec4(band * (0.35 + 0.65*max(dot(N, normalize(vec3(-0.4,0.6,-0.3))),0.0)) * c * mix(1.0, 0.5, smoothstep(0.0, 80000.0, tt)), 1.0);
      gl_FragDepth = 0.5; return;
    }
#endif
  }
  // The sky and the cloud layer, each from one call site: k = 0 the sea's reflection (only on
  // the liquid), k = 1 the view ray (the sky only where no ground is hit; the clouds always,
  // up to the surface).
  bool open = !hit && !onLiquid;
  vec3 skyR = vec3(0.0), skyV = vec3(0.0); vec4 clR = vec4(0.0), clV = vec4(0.0);
  for (int k = 0; k < 2 + uZero; k++){
    if (k == 0 && !onLiquid) continue;
    vec3 o = k == 0 ? cO : ro, d = k == 0 ? cD : rd;
    vec3 sk = (k == 0 || open) ? skyColor(d, true) : vec3(0.0);
    vec4 c = cloudLayer(o, d, (k == 1 && !open) ? tt : 1e9);
    if (k == 0){ skyR = sk; clR = c; } else { skyV = sk; clV = c; }
  }
  vec3 col;
  if (open) col = skyV*(1.0 - clV.a) + clV.rgb;
  else {
    if (onLiquid){
      // a rough sea reflects a blurred, higher piece of sky, and its clouds
      vec3 reflCol = (skyR + uNightSky*1.5)*(1.0 - clR.a*0.55) + clR.rgb*0.55;
      surfCol += reflCol*fresC;
    }
    // aerial perspective, then the clouds in front
    vec3 T = exp(-tauSegment(ro, rd, tt) * uAirK);
    vec3 fogCol = skyScatter(normalize(vec3(rd.x, max(rd.y, 0.02), rd.z)), trueAlt(ro.y));
    col = surfCol * T + fogCol * (1.0 - T);
    col = col*(1.0 - clV.a) + clV.rgb;
  }
  outColor = vec4(col * uExposure, 1.0);
  // log depth so objects can be drawn into the same depth buffer
  float viewZ = depthT * dot(rd, uFwd);
  gl_FragDepth = clamp(log2(1.0 + viewZ) * uLogK, 0.0, 1.0);
}`;

// ── Instanced objects: rocks, machines, the colony, tents, towns, trees ─────────
export const OBJECT_VS = () => `#version 300 es
${COMMON()}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 iPosYaw;
layout(location=3) in vec4 iScaleKind;
layout(location=4) in vec4 iColSeed;
layout(location=5) in vec4 iLife;      // year in, year out, grow years, extra
uniform mat4 uVP; uniform vec3 uCam; uniform vec3 uFwd; uniform float uYear;
out vec3 vWorld; out vec3 vNrm; out vec3 vLocal; out vec4 vCol; flat out float vKind; out float vViewZ; out float vGrow; out float vExtra;
void main(){
  float grow = max(iLife.z, 0.01);
  float g = smoothstep(iLife.x, iLife.x + grow, uYear) * (1.0 - smoothstep(iLife.y, iLife.y + grow*0.5 + 0.01, uYear));
  vKind = iScaleKind.w;
  if (g <= 0.001 && !(vKind < 0.5 && uYear < iLife.y + grow)){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 s = iScaleKind.xyz;
  bool rises = vKind > 5.5 && vKind < 7.5;     // houses rise from the ground
  vec3 sc = rises ? vec3(s.x, s.y*g, s.z) : (vKind < 0.5 ? s : s*g);
  float sink = vKind < 0.5 ? (1.0 - g)*s.y*1.05 : 0.0;     // rocks sink under the soil
  float c = cos(iPosYaw.w), sn = sin(iPosYaw.w);
  vec3 p = aPos*sc; p = vec3(p.x*c - p.z*sn, p.y, p.x*sn + p.z*c);
  vec3 n = aNrm/max(sc, vec3(1e-4)); n = normalize(vec3(n.x*c - n.z*sn, n.y, n.x*sn + n.z*c));
  vec3 w = iPosYaw.xyz + p; w.y -= sink;
  vec2 d = w.xz - uCam.xz; w.y -= dot(d, d)/(2.0*PLANET_R);
  vWorld = w; vNrm = n; vLocal = aPos; vCol = iColSeed; vGrow = g; vExtra = iLife.w;
  vViewZ = dot(w - uCam, uFwd);
  gl_Position = uVP * vec4(w, 1.0);
}`;

export const OBJECT_FS = () => `#version 300 es
${COMMON()}
${SCENE_COMMON()}
in vec3 vWorld; in vec3 vNrm; in vec3 vLocal; in vec4 vCol; flat in float vKind; in float vViewZ; in float vGrow; in float vExtra;
layout(location=0) out vec4 outColor;
uniform float uLogK; uniform vec3 uFwd; uniform float uTransparent;
void main(){
  vec3 p = vWorld; vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
  float kind = vKind;
  vec3 alb = vCol.rgb; float spec = 0.04, sheen = 0.0, ao = 1.0; vec3 emit = vec3(0.0);
  vec3 tentCol = vec3(0.0); float alpha = -1.0;   // tents: their own colour and coverage
  float n1 = fbm(p.xz/3.0 + vLocal.y*2.0 + vCol.a*31.0, 3);
  if (kind < 0.5){
    // rock: dark basalt, flaggy faces, the years written on its surface
    alb = mix(vec3(0.045, 0.041, 0.038), vec3(0.11, 0.095, 0.08), clamp(vCol.r + n1*0.35, 0.0, 1.0));
    float top = smoothstep(0.35, 0.85, N.y);
    alb = mix(alb, vec3(0.34, 0.30, 0.17), uAcid * smoothstep(0.1, 0.6, fbm(p.xz*0.7 + 3.0, 3) + (1.0 - N.y)*0.3) * 0.5);
    float snowy = clamp(uSnow*1.4 - 0.2, 0.0, 1.0) * top * smoothstep(-0.2, 0.3, n1 + 0.2);
    snowy *= 1.0 - smoothstep(SOLETTA, SOLETTA + 12.0, uYear);
    alb = mix(alb, vec3(0.82, 0.85, 0.9), snowy);
    // half-buried in soil later, with moss on the shaded side
    float base = smoothstep(0.25, -0.35, vLocal.y) * smoothstep(SOIL_START, SOIL_START + 15.0, uYear);
    alb = mix(alb, vec3(0.07, 0.05, 0.033), base);
    float moss = uGreen * smoothstep(0.2, 0.7, fbm(p.xz*0.9 + 9.0, 3) + (1.0 - N.y)*0.3);
    alb = mix(alb, vec3(0.06, 0.09, 0.03), moss*0.7);
    spec = 0.05 + snowy*0.1;
    ao = 0.65 + 0.35*smoothstep(-0.4, 0.6, vLocal.y);
    // the plastic sheet goes over the rocks too, draped and creased
    if (uYear > vCol.g){
      float crease = 0.5 + 0.5*sin(dot(p.xz, vec2(1.7, 0.6))*3.0 + fbm(p.xz*0.8, 3)*4.0);
      alb = mix(vec3(0.16, 0.16, 0.16), vec3(0.24, 0.23, 0.22), crease);
      spec = 0.45; sheen = 0.6;
      if (uYear > vCol.b) alb = mix(alb, vec3(0.08, 0.058, 0.04), smoothstep(vCol.b, vCol.b + 0.4, uYear));
    }
    emit = vec3(0.55, 0.075, 0.012) * 0.0016 * uGlow * (0.8 + 0.4*n1);
  }
  else if (kind < 1.5){
    // machines: painted steel, cream with soot, tracks dark
    float band = step(0.62, vLocal.y);
    alb = mix(vec3(0.55, 0.50, 0.40), vec3(0.08, 0.075, 0.07), step(vLocal.y, 0.18));
    alb = mix(alb, vec3(0.62, 0.36, 0.12), band*0.6);
    spec = 0.25; sheen = 0.4;
  } else if (kind < 3.5){
    // the floating colony seen from below: a dark ceiling of hollow blocks, its rim lit
    // by the small solettas that give it daylight (Birch §8)
    vec2 g = vLocal.xz*24.0;
    float joint = smoothstep(0.08, 0.0, min(abs(fract(g.x)-0.5), abs(fract(g.y)-0.5)) - 0.42);
    alb = mix(vec3(0.30, 0.29, 0.27), vec3(0.16, 0.15, 0.14), joint*0.5);
    float rimR = length(vLocal.xz);
    float top = step(0.5, vLocal.y);
    float dark = 1.0 - uSoletta;
    emit = vec3(1.0, 0.86, 0.62) * (0.03*top + 0.012*smoothstep(0.9, 1.0, rimR)) * dark;
    emit += vec3(1.0, 0.8, 0.55) * 0.0012 * dark;
    spec = 0.05;
  } else if (kind < 4.5){
    // the colony's glass domes: dark, reflecting the sky, warm lights inside at night
    vec3 R = reflect(normalize(p - uCam), N);
    alb = vec3(0.10, 0.11, 0.12); spec = 0.9; sheen = 1.0;
    emit = vec3(1.0, 0.75, 0.45) * 0.006 * (0.5 + 0.5*fbm(vLocal.xz*30.0, 3)) * (1.0 - smoothstep(0.0, 0.3, luma(uLightCol)*4.0));
    emit += skyColor(R, false) * 0.25;
  } else if (kind > 12.5 && kind < 13.5){
    // heat pipe: a ribbed tower of pale ceramic, faintly warm where it is hot inside
    float rib = 0.85 + 0.15*sin(atan(vLocal.z, vLocal.x)*24.0);
    alb = vec3(0.52, 0.50, 0.47) * rib;
    spec = 0.1;
    alb *= 0.5;
  } else if (kind > 13.5 && kind < 14.5){
    // manufacturing floater: a quilted envelope over a lit gondola
    float quilt = 0.9 + 0.1*sin(vLocal.x*40.0)*sin(vLocal.z*40.0);
    alb = vec3(0.62, 0.60, 0.56) * quilt;
    spec = 0.2; sheen = 0.5;
    // its own work lamps light the underside of the envelope
    emit = vec3(1.0, 0.68, 0.36) * 0.02 * smoothstep(0.2, -0.7, N.y) * (1.0 - smoothstep(0.0, 0.3, luma(uLightCol)*4.0));
  } else if (kind > 14.5 && kind < 15.5){
    // a hexagon of cover blocks being lowered
    alb = mix(vec3(0.55, 0.53, 0.48), vec3(0.18), smoothstep(0.92, 1.0, length(vLocal.xz)));
    spec = 0.1;
  } else if (kind > 15.5 && kind < 16.5){
    alb = vec3(0.1); spec = 0.0;   // cables
  } else if (kind > 5.5 && kind < 6.5){
    // house walls: limewash, a band of windows lit at night
    alb = vCol.rgb * (0.9 + 0.1*n1);
    float win = step(0.35, vLocal.y) * step(vLocal.y, 0.7) * step(0.5, fract(vLocal.x*3.0 + vLocal.z*3.0 + 0.25)) * step(abs(N.y), 0.5);
    alb = mix(alb, vec3(0.08, 0.09, 0.1), win*0.7);
    float lit = step(0.35, hash21(vec2(vCol.a*91.0, 3.0)));
    emit = vec3(1.0, 0.70, 0.38) * win * lit * 0.012 * (1.0 - smoothstep(0.0, 0.3, luma(uLightCol)*4.0));
  } else if (kind > 6.5 && kind < 7.5){
    alb = vCol.rgb * (0.85 + 0.2*n1); spec = 0.08;    // roof tiles
  } else if (kind > 7.5 && kind < 9.5){
    // trees: deep green, a little warmer in the sunlit crowns
    alb = mix(vec3(0.020, 0.040, 0.018), vec3(0.055, 0.075, 0.030), vCol.r*0.6 + 0.4*n1);
    if (kind > 8.5) alb = mix(vec3(0.030, 0.050, 0.020), vec3(0.075, 0.090, 0.030), vCol.r*0.6 + 0.4*n1);
    if (vLocal.y < 0.25 && length(vLocal.xz) < 0.1) alb = vec3(0.05, 0.035, 0.025);
    ao = 0.55 + 0.45*clamp(vLocal.y, 0.0, 1.0);
  } else if (kind > 9.5 && kind < 10.5){
    alb = vCol.rgb * (0.7 + 0.5*vLocal.y);   // grass and flowers
    ao = 0.5 + 0.5*vLocal.y;
  } else if (kind > 16.5 && kind < 17.5){
    alb = vCol.rgb * (0.85 + 0.15*sin(vLocal.x*40.0)); spec = 0.05;   // the bench
  } else if (kind > 4.5 && kind < 5.5){
    // tents: a thin clear membrane; mostly reflection, a faint milky tint, lit at night
    vec3 V = normalize(uCam - p);
    float fr = 0.04 + 0.96*pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 refl = skyColor(R, true);
    vec3 milk = (uSkyAmb + uLightCol*max(dot(N, uLightDir), 0.0)) * vec3(0.55, 0.57, 0.6);
    vec3 glow = vec3(1.0, 0.75, 0.45) * 0.003 * (1.0 - smoothstep(0.0, 0.3, luma(uLightCol)*4.0));
    float rib = smoothstep(0.03, 0.0, abs(fract(atan(vLocal.z, vLocal.x)/PI*3.0) - 0.5) - 0.47);
    vec3 c = refl*fr + milk*0.12 + glow + vec3(0.1)*rib*luma(uLightCol + uSkyAmb);
    float a = clamp(fr*0.8 + 0.05 + rib*0.25, 0.0, 1.0) * vGrow;
    tentCol = c; alpha = a;
  }
  // (one call site each for lighting and the air: Direct3D's compiler inlines every call)
  vec3 col = alpha < 0.0 ? lightSurface(p, N, alb, spec, sheen, ao, kind < 0.5 || kind > 5.5 && kind < 12.5) + emit : tentCol;
  col = airPerspective(col, p);
  outColor = alpha < 0.0 ? vec4(col * uExposure, 1.0) : vec4(col * uExposure * alpha, alpha);
  gl_FragDepth = clamp(log2(1.0 + max(vViewZ, 0.0)) * uLogK, 0.0, 1.0);
}`;

// ── Lights: points that keep a minimum size on screen, added into the frame ────
export const LIGHT_VS = () => `#version 300 es
${COMMON()}
layout(location=0) in vec4 aPos;      // xyz, size (m)
layout(location=1) in vec4 aCol;      // rgb intensity, flicker seed
uniform mat4 uVP; uniform vec3 uCam; uniform vec3 uFwd; uniform float uLogK; uniform float uPxPerRad; uniform float uTime;
uniform vec3 uBetaR, uBetaM; uniform float uHR, uHM;
out vec3 vCol; out float vSize;
void main(){
  vec3 w = aPos.xyz;
  vec2 d = w.xz - uCam.xz; w.y -= dot(d, d)/(2.0*PLANET_R);
  vec4 clip = uVP * vec4(w, 1.0);
  float dist = length(w - uCam);
  float px = aPos.w / dist * uPxPerRad;
  vSize = max(px, 2.2);
  // air dims far lights (true altitudes, a straight path)
  vec3 rd = (w - uCam)/dist;
  float y0 = uCam.y/EXAG, dy = rd.y/EXAG;
  vec3 tau = vec3(0.0);
  for (int k=0;k<2+uZero;k++){
    float H = k==0 ? uHR : uHM; vec3 b = k==0 ? uBetaR : uBetaM;
    float a = dy*dist/H;
    float integ = abs(a) < 1e-3 ? dist : dist*(1.0 - exp(-a))/a;
    tau += b * exp(-y0/H) * integ;
  }
  float flick = 0.85 + 0.15*sin(uTime*3.0 + aCol.w*50.0);
  // in thick air a light spreads into a dim glow rather than vanishing
  float tg = dot(tau, vec3(0.33));
  float halo = 1.0 + min(tg, 3.0)*0.9;
  vCol = aCol.rgb * flick * clamp(px/1.6, 0.2, 1.0) * (exp(-tau) + 0.5*(1.0 - exp(-tg))*exp(-tg*0.3)) / (halo*halo);
  vSize = max(vSize, 1.6) * halo;
  gl_PointSize = min(vSize, 48.0);
  gl_Position = clip;
  float vz = max(dot(w - uCam, uFwd), 0.0);
  gl_Position.z = (clamp(log2(1.0 + vz)*uLogK, 0.0, 1.0)*2.0 - 1.0) * clip.w;
}`;
export const LIGHT_FS = () => `#version 300 es
precision highp float;
in vec3 vCol; in float vSize;
uniform float uExposure;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord*2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float core = exp(-r*7.0), halo = exp(-r*2.2)*0.35;
  if (vSize > 20.0) { core = exp(-r*3.0)*0.4; halo = exp(-r*1.2)*0.6; }
  o = vec4(vCol * (core + halo) * uExposure, 1.0);
}`;

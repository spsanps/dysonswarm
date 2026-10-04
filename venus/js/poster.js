// The poster look: the same world printed as a 1920s constructivist lithograph in four
// inks (scarlet, black, gold, slate) on cream paper, after the collection's Venus poster.
// The renderer writes, per pixel, a material, a light level and the air's transmittance;
// this pass chooses inks by material and light, lets distance fall into a halftone,
// draws the sky (the shade and its rays, the sun, stars, weather) as cut paper, and
// prints each ink a little out of register with its own grain and voids.

import { program, setUniforms, FULLSCREEN_VS, bindTex } from './gl.js';

const FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uMat;            // r: material, g: light, b: air transmittance, a: detail
uniform vec2 uRes; uniform float uScale;
uniform vec3 uFwd, uRight, uUp; uniform vec2 uTan;
uniform vec3 uSunDir, uSolDir;     // the shaded Sun; the soletta's sun
uniform float uRegime;             // 0 today (gold), 1 the long night, 2 soletta day
uniform float uNight, uShade, uSoletta, uCloudDeck, uAcidRain, uCo2Rain, uSnowFall, uWaterRain, uTime, uYear;
uniform float uMode;               // 0 ground, 1 orbit (sky drawn by the orbit pass)

const vec3 PAPER = vec3(0.918, 0.859, 0.733);
const vec3 RED   = vec3(0.812, 0.184, 0.145);
const vec3 BLACK = vec3(0.110, 0.094, 0.086);
const vec3 GOLD  = vec3(0.886, 0.651, 0.184);
const vec3 SLATE = vec3(0.498, 0.608, 0.631);

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return 0.5*vn(p) + 0.25*vn(p*2.1 + 3.0) + 0.125*vn(p*4.3 + 7.0); }

// halftone: coverage of a dot screen at density d, screen angle a, cell size s (px)
float halftone(vec2 px, float d, float a, float s){
  if (d <= 0.001) return 0.0;
  if (d >= 0.999) return 1.0;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * px / s;
  vec2 f = fract(q) - 0.5;
  float r = length(f);
  float rad = sqrt(d / 3.14159) * 1.05;
  return 1.0 - smoothstep(rad - 0.08, rad + 0.08, r);
}

// Inks for a material: x red, y black, z gold, w slate (1 solid, fractions = halftone)
vec4 inks(int m, float L, float aux, float regime){
  // light bands: lit, half, dark
  bool night = regime > 0.5 && regime < 1.5;
  float t1 = night ? 0.13 : 0.42, t0 = night ? 0.055 : 0.16;
  float lit = step(t1, L), mid = step(t0, L) * (1.0 - lit);
  bool gold = regime < 0.5;
  vec4 k = vec4(0.0, 1.0, 0.0, 0.0);
  if (m == 1 || m == 14){             // basalt
    if (gold) k = lit > 0.5 ? vec4(1.0, 0.0, 0.35, 0.0) : mid > 0.5 ? vec4(1.0, 0.45, 0.0, 0.0) : vec4(0.0, 1.0, 0.0, 0.0);
    else if (night) k = lit > 0.5 ? vec4(0.0, 0.0, 0.0, 1.0) : mid > 0.5 ? vec4(0.0, 0.35, 0.0, 1.0) : vec4(0.0, 1.0, 0.0, 0.0);
    else k = lit > 0.5 ? vec4(0.55, 0.0, 0.5, 0.0) : mid > 0.5 ? vec4(0.8, 0.5, 0.0, 0.0) : vec4(0.0, 1.0, 0.0, 0.0);
    if (aux > 0.5) k += vec4(0.0, 0.0, 0.5, 0.0);          // sulphate crust
  } else if (m == 2 || m == 9){       // CO2 snow and ice: paper, with slate shadows and cracks
    float li = L * (1.0 + 2.0*uSnowFall);
    k = li > t1 ? vec4(0.0) : li > t0 ? vec4(0.0, 0.0, 0.0, 0.55) : vec4(0.0, 0.0, 0.0, 1.0);
    if (night && lit < 0.5) k = vec4(0.0, 0.25, 0.0, 1.0);
    if (aux > 0.5) k.w = max(k.w, 0.8);
  } else if (m == 3){                 // the sheet over the land: slate panels, paper seams
    k = lit > 0.5 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(0.0, 0.55, 0.0, 1.0);
    if (aux > 0.3) k = vec4(0.0);
  } else if (m == 4){                 // soil
    k = lit > 0.5 ? vec4(0.6, 0.0, 1.0, 0.0) : mid > 0.5 ? vec4(1.0, 0.25, 0.6, 0.0) : vec4(0.5, 1.0, 0.0, 0.0);
  } else if (m == 5 || m == 23){      // grass: gold over slate makes the green
    k = lit > 0.5 ? vec4(0.0, 0.0, 1.0, 0.55) : mid > 0.5 ? vec4(0.0, 0.2, 1.0, 1.0) : vec4(0.0, 0.7, 0.4, 1.0);
  } else if (m == 6){                 // fields in three crops
    float f = aux;
    k = f < 0.33 ? vec4(0.15, 0.0, 1.0, 0.0) : f < 0.66 ? vec4(0.0, 0.0, 1.0, 0.7) : vec4(0.0, 0.0, 0.55, 0.3);
    if (lit < 0.5) k += vec4(0.0, 0.45, 0.0, 0.0);
  } else if (m == 7 || m == 22){      // woods and trees
    k = lit > 0.5 ? vec4(0.0, 0.25, 0.6, 1.0) : vec4(0.0, 0.85, 0.3, 1.0);
  } else if (m == 8){                 // town ground
    k = vec4(0.0, 0.2, 0.5, 0.25);
  } else if (m == 10){                // paving: slate panels, the seams in black or paper
    float seam = fract(aux); bool film = aux > 1.5;
    k = film ? vec4(0.0, 0.0, 0.0, 0.35) : lit > 0.5 ? vec4(0.0, 0.0, 0.0, 0.75) : vec4(0.0, 0.3, 0.0, 1.0);
    if (night && lit < 0.5) k = vec4(0.0, 0.5, 0.0, 1.0);
    if (seam > 0.35) k = gold ? vec4(0.0, 1.0, 0.0, 0.0) : vec4(0.0, 1.0, 0.0, 0.0);
  } else if (m == 12){                // liquid carbon dioxide: black, with slate light on it
    k = L > 0.5 ? vec4(0.0, 0.3, 0.0, 1.0) : vec4(0.0, 1.0, 0.0, 0.25);
  } else if (m == 13){                // water: slate, darker far out, paper glitter
    k = L > 1.6 ? vec4(0.0) : L > 0.55 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(0.0, 0.35, 0.0, 1.0);
  } else if (m == 15){ k = lit > 0.5 ? vec4(1.0, 0.0, 0.0, 0.0) : vec4(1.0, 0.5, 0.0, 0.0); }     // machines: the red tractor
  else if (m == 16 || m == 17 || m == 19 || m == 24 || m == 27){ k = vec4(0.0, 1.0, 0.0, 0.0); } // black things
  else if (m == 18){ k = vec4(1.0, 0.0, 0.0, 0.0); if (lit < 0.5) k.y = 0.4; }                  // floaters
  else if (m == 20){ k = lit > 0.5 ? vec4(0.0) : vec4(0.0, 0.0, 0.0, 0.6); }                      // house walls: paper
  else if (m == 21){ k = vec4(1.0, lit > 0.5 ? 0.0 : 0.5, 0.0, 0.0); }                           // roofs
  else if (m == 25){ k = vec4(0.0, 0.0, 0.0, 0.0); }                                               // tent ribs: paper
  else if (m == 26){ k = vec4(0.0, 0.0, 1.0, 0.0); }                                               // lights and flowers: gold
  else if (m == 28){ k = vec4(0.0, 1.0, 0.4, 0.0); }                                               // domes
  else if (m == 29){                  // clouds: paper, slate underneath
    k = L > 0.5 ? vec4(0.0) : vec4(0.0, 0.0, 0.0, 0.8);
    if (night) k = vec4(0.0, 0.3, 0.0, 0.9);
    if (gold) k = vec4(0.25, 0.0, 0.6, 0.0);
  }
  return clamp(k, 0.0, 1.0);
}

// what the air turns into with distance: the sky's own ink
vec4 hazeInk(float regime){
  if (regime < 0.5) return vec4(0.25, 0.0, 1.0, 0.0);
  if (regime < 1.5) return vec4(0.0, 0.5, 0.0, 1.0);
  return vec4(0.0, 0.0, 0.0, 0.45);
}

// The sky, as cut paper.
vec4 skyInks(vec3 rd, vec2 px){
  vec4 k;
  float h = rd.y;
  if (uRegime < 0.5){
    // Venus today: gold, a red band of haze low down, paper slits
    k = vec4(0.0, 0.0, 1.0, 0.0);
    k.x = h < 0.06 ? 0.55 : 0.0;
    if (abs(h - 0.13 - 0.015*sin(rd.x*7.0)) < 0.0035 || abs(h - 0.17 - 0.012*sin(rd.x*5.0 + 1.0)) < 0.002) k = vec4(0.0);
  } else if (uRegime < 1.5){
    // the long night: black; slate low down; stars in paper
    k = vec4(0.0, 1.0, 0.0, 0.0);
    if (h < 0.05) k = vec4(0.0, 0.55, 0.0, 1.0);
    vec2 sc = vec2(atan(rd.x, rd.z), asin(clamp(rd.y, -1.0, 1.0))) * 120.0;
    vec2 cell = floor(sc), f = fract(sc) - 0.5;
    float star = step(0.93, hash(cell)) * smoothstep(0.22, 0.1, length(f + (vec2(hash(cell + 3.0), hash(cell + 9.0)) - 0.5)*0.5));
    if (star > 0.5 && h > 0.04 && uCloudDeck < 0.5) k = vec4(0.0);
  } else {
    // soletta day: paper, slate high up in bold bands
    k = vec4(0.0);
    if (h > 0.26) k.w = 1.0; else if (h > 0.14) k.w = 0.5;
  }
  // the shade over the hidden Sun: a black trussed disc with red and gold rays, drawn big
  if (uShade > 0.01 && uSoletta < 0.5){
    vec3 s = normalize(uSunDir);
    vec3 sx = normalize(cross(s, vec3(0.0, 1.0, 0.0))), sy = cross(sx, s);
    vec2 q = vec2(dot(rd, sx), dot(rd, sy)) / max(dot(rd, s), 0.05);
    float r = length(q), a = atan(q.y, q.x);
    float R = 0.092 * smoothstep(0.0, 0.8, uShade) + 0.008;
    float sunR = 0.07;
    // rays (only where the sky is open)
    float ray = 0.0;
    float sector = floor(a / 6.28318 * 34.0);
    float w = fract(a / 6.28318 * 34.0);
    float hw = hash(vec2(sector, 4.0));
    float width = (mod(sector, 2.0) < 0.5 ? 0.14 : 0.38) * (0.7 + 0.6*hw);
    float len = mod(sector, 5.0) < 0.5 ? 0.22 + hw*0.15 : 3.0;
    ray = step(abs(w - 0.5), width*0.5) * step(sunR + 0.02, r) * step(r, len);
    vec4 rayInk = mod(sector, 4.0) > 2.5 ? vec4(0.0, 0.0, 1.0, 0.0) : vec4(1.0, 0.0, 0.0, 0.0);
    float show = max(1.0 - uCloudDeck, 0.85);
    if (ray > 0.5 && show > 0.5) k = rayInk * min(1.0, uShade*1.5) + k * (1.0 - min(1.0, uShade*1.5));
    // a pale gold halo
    if (r < sunR*1.6 && r > sunR) k.z = max(k.z, 0.35);
    // the red sun itself, eaten by the shade as it opens
    if (r < sunR) k = vec4(1.0, 0.0, 0.0, 0.0);
    float disc = step(r, R);
    float truss = step(abs(r - R*1.05), R*0.03) + step(abs(r - R*0.93), R*0.015);
    float zig = step(abs(fract(a/6.28318*48.0) - 0.5) - 0.5 + 0.5*abs((r - R*0.93)/(R*0.12) - 0.5)*2.0, 0.03) * step(R*0.93, r) * step(r, R*1.05);
    if (disc > 0.5){
      k = vec4(0.0, 1.0, 0.0, 0.0);
      // louvres, and stars seen through nothing at all
      float lou = step(0.84, fract(dot(q, vec2(0.2, 0.98)) * 110.0));
      if (lou > 0.5) k = vec4(0.0, 0.6, 0.0, 0.5);
    }
    if (truss + zig > 0.5 && r < R*1.1) k = vec4(0.0, 1.0, 0.0, 0.0);
  }
  // the soletta's sun: a red disc with fine gold rays
  if (uSoletta > 0.5){
    vec3 s = normalize(uSolDir);
    float c = dot(rd, s);
    float ang = acos(clamp(c, -1.0, 1.0));
    if (ang < 0.035) k = vec4(1.0, 0.0, 0.0, 0.0);
    else if (ang < 0.3){
      vec3 sx = normalize(cross(s, vec3(0.0, 1.0, 0.0))), sy = cross(sx, s);
      float a = atan(dot(rd, sy), dot(rd, sx));
      if (step(abs(fract(a/6.28318*28.0) - 0.5), 0.08) > 0.5 && ang > 0.045) k = vec4(0.0, 0.0, 1.0, 0.0) + k*0.0;
    }
  }
  return k;
}

// ink texture: mottle and small voids where the ink did not take
float inkTex(vec2 px, float salt, float voids){
  float m = 0.88 + 0.12*fbm(px/7.0 + salt);
  // a few single-dot voids, and rare larger worn patches
  float v = step(1.0 - voids*0.06, hash(floor(px) + salt*13.0)) + step(0.97, vn(px/26.0 + salt*5.0)) * step(0.6, vn(px/1.7 + salt));
  v = min(v, 1.0);
  return m * (1.0 - v);
}

// orbit: the painted colours sorted into the four inks
vec4 colourInks(vec3 c){
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 n = c / max(max(c.r, max(c.g, c.b)), 1e-4);
  if (l < 0.035) return vec4(0.0, 1.0, 0.0, 0.0);
  float warm = n.r - n.b, green = n.g - 0.5*(n.r + n.b), blue = n.b - n.r;
  vec4 k;
  if (l > 0.55 && abs(warm) < 0.25) k = vec4(0.0);                       // white: paper
  else if (blue > 0.12) k = vec4(0.0, l < 0.15 ? 0.6 : 0.0, 0.0, 1.0);     // sea: slate
  else if (green > 0.05) k = vec4(0.0, l < 0.12 ? 0.5 : 0.0, 1.0, 0.7);    // green: gold over slate
  else if (warm > 0.3) k = vec4(l < 0.3 ? 1.0 : 0.3, l < 0.1 ? 0.5 : 0.0, 1.0, 0.0);   // cloud deck, soil: gold and red
  else k = vec4(0.0, l < 0.2 ? 0.8 : 0.3, 0.0, l > 0.2 ? 0.6 : 0.3);      // grey: slate and black
  if (l < 0.08) k.y = max(k.y, 0.85);
  return k;
}

vec4 inkAt(vec2 uv, vec2 px, vec3 rd){
  vec4 e = texture(uMat, uv);
  if (uMode > 0.5) return colourInks(e.rgb);
  int m = int(e.r + 0.5);
  if (m == 0 && uMode < 0.5) return skyInks(rd, px);
  vec4 k = inks(m, e.g, e.a, uRegime);
  // distance: the air takes the shapes into the sky's ink, by halftone
  float far = 1.0 - clamp(e.b, 0.0, 1.0);
  vec4 hz = hazeInk(uRegime);
  float steps = floor(pow(far, 1.6) * 4.0) / 4.0;   // flat planes of recession
  k = mix(k, hz, steps);
  return k;
}

void main(){
  vec2 px = gl_FragCoord.xy / uScale;
  vec2 ndc = vUV*2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight*ndc.x*uTan.x + uUp*ndc.y*uTan.y);
  vec2 texel = 1.0 / uRes;
  // misregistration: each ink plate a little off
  vec4 kR = inkAt(vUV + vec2(0.9, -0.6)*texel*uScale, px, rd);
  vec4 kG = inkAt(vUV + vec2(-0.7, 0.7)*texel*uScale, px, rd);
  vec4 kS = inkAt(vUV + vec2(0.6, 0.9)*texel*uScale, px, rd);
  vec4 kK = inkAt(vUV, px, rd);
  float r = halftone(px, kR.x, 1.31, 4.2) * inkTex(px, 1.0, 0.10);
  float g = halftone(px, kG.z, 0.0, 4.2) * inkTex(px, 2.0, 0.08);
  float s = halftone(px, kS.w, 0.26, 4.2) * inkTex(px, 3.0, 0.10);
  float b = halftone(px, kK.y, 0.79, 4.2) * inkTex(px, 4.0, 0.06);
  // weather printed over everything: rain as fine diagonal rules, snow as paper flecks
  float rain = max(max(uAcidRain, uCo2Rain), uWaterRain);
  vec3 col = PAPER * (0.96 + 0.04*fbm(px/40.0)) * (0.97 + 0.03*vn(px*0.9));
  col *= mix(vec3(1.0), RED/PAPER, r);
  col *= mix(vec3(1.0), GOLD/PAPER, g);
  col *= mix(vec3(1.0), SLATE/PAPER, s);
  col *= mix(vec3(1.0), BLACK/PAPER, b);
  if (rain > 0.05 && uMode < 0.5){
    vec2 q = px + vec2(0.0, uTime*220.0);
    float lane = fract((q.x + q.y*0.35) / 9.0);
    float seg = step(0.55, vn(vec2(floor((q.x + q.y*0.35)/9.0), q.y/40.0)));
    float line = step(abs(lane - 0.5), 0.045) * seg * step(0.6, vn(vec2(floor((q.x + q.y*0.35)/9.0)*3.1, 2.0))) * rain;
    col = mix(col, uRegime > 0.5 && uRegime < 1.5 ? SLATE : BLACK, line * 0.55);
  }
  if (uSnowFall > 0.05 && uMode < 0.5){
    vec2 q = px/11.0 + vec2(uTime*0.4, uTime*1.4);
    vec2 cell = floor(q), f = fract(q) - 0.5;
    float fl = step(0.8, hash(cell)) * smoothstep(0.2, 0.1, length(f + (vec2(hash(cell + 1.0), hash(cell + 2.0)) - 0.5)*0.6));
    col = mix(col, PAPER, fl * uSnowFall);
  }
  // the edge of the sheet: a faint plate mark
  vec2 c = vUV - 0.5;
  col *= 1.0 - 0.18*dot(c*c, vec2(1.0));
  o = vec4(col, 1.0);
}`;

export class Poster {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, FULLSCREEN_VS, FS, 'poster');
    this.vao = gl.createVertexArray();
  }
  render(scene, w, h, u) {
    const gl = this.gl, p = this.prog;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    bindTex(gl, p, 'uMat', scene.tex, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    setUniforms(gl, p, { ...u, uRes: [w, h] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
}

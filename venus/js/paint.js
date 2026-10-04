// The painting: the rendered frame is graded, then repainted with an anisotropic
// Kuwahara filter (paint patches that follow the forms), then given bristle marks,
// a little impasto and the weave of a gessoed board. One style for every stage.
//
// Kyprianidis, Kang & Döllner, "Image and Video Abstraction by Anisotropic Kuwahara
// Filtering" (2009), with the polynomial sector weights of Kyprianidis et al. (2010).

import { program, setUniforms, target, freeTarget, FULLSCREEN_VS, bindTex } from './gl.js';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 o;
`;

// 1. Grade and tone-map the HDR frame into a painter's range of values.
const GRADE_FS = HEAD + `
uniform sampler2D uScene;
uniform vec3 uLift; uniform float uGain, uSat, uWarm, uContrast;
vec3 filmic(vec3 x){ x = max(x, 0.0); return (x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14); }
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  c = filmic(c * uGain);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0/2.2));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = c + uLift*(1.0 - c);
  // a painter's value plan: gentle S-curve, a little more contrast in the middle values
  c = mix(c, c*c*(3.0 - 2.0*c), uContrast);
  // a slightly warm, limited palette: cool shadows nudged toward umber, highlights toward cream
  c = mix(c, c*vec3(1.04, 1.0, 0.93), uWarm);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// 2. Structure tensor from the graded image.
const TENSOR_FS = HEAD + `
uniform sampler2D uSrc;
void main(){
  vec2 d = 1.0 / vec2(textureSize(uSrc, 0));
  vec3 u = (-1.0*texture(uSrc, vUV + vec2(-d.x,-d.y)).rgb - 2.0*texture(uSrc, vUV + vec2(-d.x,0)).rgb - 1.0*texture(uSrc, vUV + vec2(-d.x,d.y)).rgb
           + 1.0*texture(uSrc, vUV + vec2(d.x,-d.y)).rgb + 2.0*texture(uSrc, vUV + vec2(d.x,0)).rgb + 1.0*texture(uSrc, vUV + vec2(d.x,d.y)).rgb) / 4.0;
  vec3 v = (-1.0*texture(uSrc, vUV + vec2(-d.x,-d.y)).rgb - 2.0*texture(uSrc, vUV + vec2(0,-d.y)).rgb - 1.0*texture(uSrc, vUV + vec2(d.x,-d.y)).rgb
           + 1.0*texture(uSrc, vUV + vec2(-d.x,d.y)).rgb + 2.0*texture(uSrc, vUV + vec2(0,d.y)).rgb + 1.0*texture(uSrc, vUV + vec2(d.x,d.y)).rgb) / 4.0;
  o = vec4(dot(u,u), dot(v,v), dot(u,v), 1.0);
}`;

// 3. Smooth the tensor (separable Gaussian) so strokes follow broad forms.
const BLUR_FS = HEAD + `
uniform sampler2D uSrc; uniform vec2 uDir; uniform float uSigma;
void main(){
  vec2 d = uDir / vec2(textureSize(uSrc, 0));
  float twoS2 = 2.0*uSigma*uSigma;
  int R = int(ceil(2.0*uSigma));
  vec4 s = vec4(0.0); float w = 0.0;
  for (int i=-12;i<=12;i++){
    if (abs(i) > R) continue;
    float k = exp(-float(i*i)/twoS2);
    s += texture(uSrc, vUV + d*float(i)) * k; w += k;
  }
  o = s / w;
}`;

// 4. Turn the tensor into a flow field: angle and anisotropy, with a gentle fallback
//    to horizontal strokes where the image is flat (sky, sea).
const FLOW_FS = HEAD + `
uniform sampler2D uSrc; uniform float uTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 g = texture(uSrc, vUV).xyz;
  float lambda1 = 0.5*(g.y + g.x + sqrt(g.y*g.y - 2.0*g.x*g.y + g.x*g.x + 4.0*g.z*g.z));
  float lambda2 = 0.5*(g.y + g.x - sqrt(g.y*g.y - 2.0*g.x*g.y + g.x*g.x + 4.0*g.z*g.z));
  vec2 v = vec2(lambda1 - g.x, -g.z);
  vec2 t = length(v) > 0.0 ? normalize(v) : vec2(0.0, 1.0);
  float phi = -atan(t.y, t.x);
  float A = (lambda1 + lambda2 > 0.0) ? (lambda1 - lambda2)/(lambda1 + lambda2) : 0.0;
  float strength = smoothstep(0.002, 0.02, lambda1);
  // fallback flow: long, nearly horizontal sweeps that wander a little
  vec2 res = vec2(textureSize(uSrc, 0));
  float wander = (vn(vUV*res/180.0) - 0.5)*0.7 + (vn(vUV*res/60.0 + 9.0) - 0.5)*0.25;
  float phiF = wander;
  vec2 a = vec2(cos(phi), sin(phi)), b = vec2(cos(phiF), sin(phiF));
  // blend as doubled-angle vectors so opposite directions agree
  vec2 da = vec2(cos(2.0*phi), sin(2.0*phi)), db = vec2(cos(2.0*phiF), sin(2.0*phiF));
  vec2 dm = mix(db, da, strength);
  float phiM = 0.5*atan(dm.y, dm.x);
  o = vec4(cos(phiM), sin(phiM), phiM, mix(0.65, A, strength));
}`;

// 5. Anisotropic Kuwahara with polynomial weights. Fixed 9x9 taps (stretched to the
//    ellipse) and named accumulators: GPUs and shader translators handle this well.
const AKF_FS = HEAD + `
uniform sampler2D uSrc, uFlow;
uniform float uRadius, uQ, uAlpha, uStride;
void acc(inout vec4 m, inout vec3 q, vec3 c, vec3 cc, float w){ m += vec4(c*w, w); q += cc*w; }
float sectorW(vec4 m, vec3 q, out vec3 mean){
  mean = m.rgb / max(m.w, 1e-6);
  vec3 v = abs(q / max(m.w, 1e-6) - mean*mean);
  return 1.0 / (1.0 + pow(1000.0*(v.r + v.g + v.b), 0.5*uQ));
}
void main(){
  vec2 size = vec2(textureSize(uSrc, 0));
  vec4 t = texture(uFlow, vUV);
  float a = uRadius * clamp((uAlpha + t.w)/uAlpha, 0.1, 2.0);
  float b = uRadius * clamp(uAlpha/(uAlpha + t.w), 0.1, 2.0);
  float c = cos(t.z), s = sin(t.z);
  // the 9x9 taps cover the ellipse: unit grid -> ellipse (rotated), v in [-0.5, 0.5]
  mat2 E = mat2(c, s, -s, c) * mat2(a, 0.0, 0.0, b);
  float zeta = 2.0/uRadius;
  float zc = 0.58, szc = sin(zc);
  float eta = (zeta + cos(zc))/(szc*szc);
  vec4 m0 = vec4(0.0), m1 = vec4(0.0), m2 = vec4(0.0), m3 = vec4(0.0), m4 = vec4(0.0), m5 = vec4(0.0), m6 = vec4(0.0), m7 = vec4(0.0);
  vec3 q0 = vec3(0.0), q1 = vec3(0.0), q2 = vec3(0.0), q3 = vec3(0.0), q4 = vec3(0.0), q5 = vec3(0.0), q6 = vec3(0.0), q7 = vec3(0.0);
  for (int j = -4; j <= 4; j++){
    for (int i = -4; i <= 4; i++){
      vec2 v = vec2(float(i), float(j)) / 8.0;        // in the unit disc of radius 0.5
      if (dot(v, v) > 0.26) continue;
      vec2 off = E * v * 2.0;
      vec3 col = texture(uSrc, vUV + off/size).rgb;
      vec3 cc = col*col;
      float vxx = zeta - eta*v.x*v.x, vyy = zeta - eta*v.y*v.y;
      float w0 = max(0.0, v.y + vxx); w0 *= w0;
      float w2 = max(0.0, -v.x + vyy); w2 *= w2;
      float w4 = max(0.0, -v.y + vxx); w4 *= w4;
      float w6 = max(0.0, v.x + vyy); w6 *= w6;
      vec2 r = 0.70710678*vec2(v.x - v.y, v.x + v.y);
      vxx = zeta - eta*r.x*r.x; vyy = zeta - eta*r.y*r.y;
      float w1 = max(0.0, r.y + vxx); w1 *= w1;
      float w3 = max(0.0, -r.x + vyy); w3 *= w3;
      float w5 = max(0.0, -r.y + vxx); w5 *= w5;
      float w7 = max(0.0, r.x + vyy); w7 *= w7;
      float sum = w0 + w1 + w2 + w3 + w4 + w5 + w6 + w7;
      float g = exp(-3.125*dot(v, v)) / max(sum, 1e-6);
      acc(m0, q0, col, cc, w0*g); acc(m1, q1, col, cc, w1*g); acc(m2, q2, col, cc, w2*g); acc(m3, q3, col, cc, w3*g);
      acc(m4, q4, col, cc, w4*g); acc(m5, q5, col, cc, w5*g); acc(m6, q6, col, cc, w6*g); acc(m7, q7, col, cc, w7*g);
    }
  }
  vec3 mean; float w; vec4 outc = vec4(0.0);
  w = sectorW(m0, q0, mean); outc += vec4(mean*w, w);
  w = sectorW(m1, q1, mean); outc += vec4(mean*w, w);
  w = sectorW(m2, q2, mean); outc += vec4(mean*w, w);
  w = sectorW(m3, q3, mean); outc += vec4(mean*w, w);
  w = sectorW(m4, q4, mean); outc += vec4(mean*w, w);
  w = sectorW(m5, q5, mean); outc += vec4(mean*w, w);
  w = sectorW(m6, q6, mean); outc += vec4(mean*w, w);
  w = sectorW(m7, q7, mean); outc += vec4(mean*w, w);
  o = vec4(outc.rgb/outc.w, 1.0);
}`;

// 6. Brush strokes laid over the painted image. Each stroke sits in a jittered cell,
//    takes its direction from the flow at its centre and its colour from the paint
//    there, and has bristle grooves in its own frame. Light rakes across the relief.
const FINAL_FS = HEAD + `
uniform sampler2D uPaint, uFlow, uFine;
uniform vec2 uRes; uniform float uScale, uGrain, uWeave, uImpasto, uVignette, uFineMix, uStroke, uCarry;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
vec2 hash2(vec2 p){ return vec2(hash(p), hash(p + 19.19)); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }

// One layer of strokes of size S (board px). Returns colour (rgb) and coverage (a),
// and writes the relief height of the top stroke.
vec4 strokes(vec2 px, float S, float layer, vec3 here, out float height){
  vec2 g = px / S;
  vec2 cell = floor(g);
  vec4 best = vec4(0.0); float bestZ = -1.0; height = 0.0;
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
    vec2 c = cell + vec2(float(i), float(j));
    vec2 h2 = hash2(c + layer*37.0);
    vec2 centre = (c + 0.1 + 0.8*h2) * S;
    vec2 uvC = centre * uScale / uRes;
    vec4 fl = texture(uFlow, clamp(uvC, 0.0, 1.0));
    float jitter = (hash(c + 13.0 + layer) - 0.5) * 0.35;
    vec2 d0 = normalize(vec2(fl.x, -fl.y) + 1e-5);
    vec2 d = vec2(d0.x*cos(jitter) - d0.y*sin(jitter), d0.x*sin(jitter) + d0.y*cos(jitter));
    vec2 n = vec2(-d.y, d.x);
    float len = S * (1.3 + 1.4*hash(c + 3.1 + layer)) * (layer < 0.5 ? 1.6 : 1.0);
    float wid = S * (0.45 + 0.35*hash(c + 7.7 + layer));
    vec2 q = px - centre;
    float u = dot(q, d), v = dot(q, n);
    v -= (hash(c + 5.0) - 0.5) * 2.0 * u*u/len;      // a gentle curve
    float halfW = wid*0.5 * (1.0 - 0.45*smoothstep(0.1, 0.5, abs(u)/len));
    float cov = smoothstep(0.0, 2.5, len*0.5 - abs(u)) * smoothstep(0.0, 1.5, halfW - abs(v));
    if (cov <= 0.0) continue;
    vec3 col = texture(uPaint, clamp(uvC, 0.0, 1.0)).rgb;
    // a stroke does not cross into a region of a different colour (it stops at edges)
    vec3 dc = col - here;
    float diff = sqrt(dot(dc, dc)) / (0.08 + 0.5*max(max(here.r, here.g), here.b));
    cov *= 1.0 - smoothstep(0.35, 0.9, diff);
    if (cov <= 0.0) continue;
    float z = hash(c + 11.3 + layer);
    if (z > bestZ){
      bestZ = z;
      // paint is never mixed evenly: each stroke a shade lighter or darker, warmer or cooler
      float tv = (hash(c + 17.0 + layer) - 0.5);
      float tw = (hash(c + 23.0 + layer) - 0.5);
      col *= 1.0 + tv*(0.035 + 0.035*layer);
      col += vec3(0.012, 0.004, -0.012) * tw * 2.0;
      best = vec4(col, cov);
      float bristle = vn(vec2(u/(S*1.4), v/0.9 + hash(c)*50.0));
      height = cov * (0.5 + 0.5*bristle) * (1.0 - 0.6*smoothstep(0.2, 0.5, abs(u)/len));
    }
  }
  return best;
}

void main(){
  vec2 px = gl_FragCoord.xy / uScale;           // board coordinates, about CSS pixels
  vec3 base = texture(uPaint, vUV).rgb;
  vec3 fine = texture(uFine, vUV).rgb;
  // detail: where the frame has edges, keep smaller strokes and more of the original
  vec4 fl = texture(uFlow, vUV);
  float detail = smoothstep(0.35, 0.9, fl.w);
  float hB, hD;
  vec4 big = strokes(px, uStroke*2.6, 0.0, base, hB);
  vec4 small = strokes(px, uStroke*0.9, 1.0, base, hD);
  vec3 col = base;
  col = mix(col, big.rgb, big.a * uCarry * (1.0 - detail*0.7));
  col = mix(col, small.rgb, small.a * uCarry * (0.15 + 0.85*detail));
  // a touch of the unfiltered frame keeps small bright things (lights) legible
  float fineEdge = smoothstep(0.08, 0.3, length(fine - col));
  col = mix(col, fine, fineEdge * uFineMix);
  // impasto: relief of the top strokes lit from the upper left
  float hgt = max(hB*(1.0 - detail), hD);
  // relief slope from screen derivatives (cheap; a 2x2 quad is plenty for paint)
  float rake = (-dFdx(hD)*0.7 + dFdy(hD)*0.7) * 2.0 / max(uScale, 0.5);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col *= 1.0 + (hgt - 0.5) * uGrain;
  col += rake * uImpasto * (0.3 + 0.7*smoothstep(0.25, 0.9, l));
  // the board: gesso weave, very fine
  vec2 w = px * 0.9;
  float weave = sin(w.x*3.1416) * sin(w.y*3.1416);
  float thread = (vn(w*vec2(0.25, 3.0)) - 0.5) + (vn(w*vec2(3.0, 0.25) + 3.0) - 0.5);
  col += (weave*0.5 + thread*0.6) * uWeave;
  vec2 c = vUV - 0.5;
  col *= 1.0 - uVignette*dot(c*vec2(1.1, 1.3), c*vec2(1.1, 1.3));
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Painter {
  constructor(gl) {
    this.gl = gl;
    this.p = {
      grade: program(gl, FULLSCREEN_VS, GRADE_FS, 'grade'),
      tensor: program(gl, FULLSCREEN_VS, TENSOR_FS, 'tensor'),
      blur: program(gl, FULLSCREEN_VS, BLUR_FS, 'blur'),
      flow: program(gl, FULLSCREEN_VS, FLOW_FS, 'flow'),
      akf: program(gl, FULLSCREEN_VS, AKF_FS, 'akf'),
      final: program(gl, FULLSCREEN_VS, FINAL_FS, 'final'),
    };
    this.vao = gl.createVertexArray();
    this.w = 0; this.h = 0;
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    for (const k of ['ldr', 'ten', 'ten2', 'flow', 'akf']) freeTarget(gl, this[k]);
    const f16 = gl.ext.floatTarget || gl.ext.halfTarget;
    const rgba8 = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    const half = f16 ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : rgba8;
    this.ldr = target(gl, w, h, half);
    this.ten = target(gl, w, h, half);
    this.ten2 = target(gl, w, h, half);
    this.flow = target(gl, w, h, half);
    this.akf = target(gl, w, h, rgba8);
    this.w = w; this.h = h;
  }

  pass(prog, out, uniforms, textures) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    if (out) gl.viewport(0, 0, out.w, out.h);
    gl.useProgram(prog);
    gl.bindVertexArray(this.vao);
    let unit = 0;
    for (const k in textures) bindTex(gl, prog, k, textures[k], unit++);
    setUniforms(gl, prog, uniforms);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // scene: HDR target; screen: {w,h} of the canvas; look: grading/brush settings
  render(scene, screenW, screenH, look) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.resize(scene.w, scene.h);
    this.pass(this.p.grade, this.ldr, { uLift: look.lift, uGain: look.gain, uSat: look.sat, uWarm: look.warm, uContrast: look.contrast }, { uScene: scene.tex });
    if (look.radius > 0.5) {
      this.pass(this.p.tensor, this.ten, {}, { uSrc: this.ldr.tex });
      this.pass(this.p.blur, this.ten2, { uDir: [1, 0], uSigma: look.tensorSigma }, { uSrc: this.ten.tex });
      this.pass(this.p.blur, this.ten, { uDir: [0, 1], uSigma: look.tensorSigma }, { uSrc: this.ten2.tex });
      this.pass(this.p.flow, this.flow, {}, { uSrc: this.ten.tex });
      this.pass(this.p.akf, this.akf, { uRadius: look.radius, uQ: look.q, uAlpha: 1.0, uStride: look.stride || 1 }, { uSrc: this.ldr.tex, uFlow: this.flow.tex });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, screenW, screenH);
    const painted = look.radius > 0.5 ? this.akf.tex : this.ldr.tex;
    this.pass(this.p.final, null, {
      uRes: [screenW, screenH], uScale: look.boardScale, uGrain: look.grain, uWeave: look.weave,
      uImpasto: look.impasto, uVignette: look.vignette, uFineMix: look.fineMix, uStroke: look.stroke, uCarry: look.carry,
    }, { uPaint: painted, uFlow: look.radius > 0.5 ? this.flow.tex : this.ldr.tex, uFine: this.ldr.tex });
  }
}

export const DEFAULT_LOOK = {
  lift: [0.016, 0.012, 0.009], gain: 1.0, sat: 1.08, warm: 0.3, contrast: 0.5,
  radius: 5, q: 8, tensorSigma: 2.2,
  grain: 0.05, impasto: 0.025, weave: 0.008, vignette: 0.42, fineMix: 0.2, boardScale: 1, stroke: 10, carry: 0.85,
};

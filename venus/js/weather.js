// Rain, snow and lightning, added into the frame before it is painted. Layers of
// streaks at a few depths, hidden behind anything nearer (read from the depth buffer).

import { program, setUniforms, FULLSCREEN_VS, bindTex } from './gl.js';

const FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uDepth;
uniform float uLogK, uTime, uAspect;
uniform float uRain, uSnow, uRainKind;   // kind: 0 acid, 1 liquid CO2, 2 water
uniform vec3 uLight;                     // light falling on the drops (already exposed)
uniform float uFlash; uniform vec2 uBolt; uniform float uBoltSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }

float rainLayer(vec2 uv, float scale, float speed, float seed){
  // short slanted streaks, many and faint
  vec2 p = uv*vec2(scale*0.9, scale*0.22);
  p.x += p.y*0.18;
  p.y += uTime*speed*1.6;
  vec2 cell = floor(p), f = fract(p);
  float h = hash(cell + seed);
  if (h < 0.55) return 0.0;
  float x = 0.2 + 0.6*hash(cell + seed + 7.0);
  float len = 0.25 + 0.3*hash(cell + seed + 3.0);
  float y0 = hash(cell + seed + 11.0)*(1.0 - len);
  float line = smoothstep(0.06, 0.0, abs(f.x - x)) * smoothstep(0.0, 0.1, f.y - y0) * smoothstep(0.0, 0.1, y0 + len - f.y);
  return line * (0.4 + 0.6*hash(cell + seed + 5.0));
}
float snowLayer(vec2 uv, float scale, float speed, float seed){
  vec2 p = uv*scale;
  p.y += uTime*speed;
  p.x += sin(p.y*0.7 + seed)*0.35 + uTime*0.05;
  vec2 cell = floor(p), f = fract(p);
  float h = hash(cell + seed);
  if (h < 0.62) return 0.0;
  vec2 c = vec2(hash(cell + seed + 1.0), hash(cell + seed + 2.0))*0.7 + 0.15;
  vec2 q = f - c; q.y *= 0.6;                // a short smear as it falls
  return smoothstep(0.07, 0.0, length(q)) * (0.4 + 0.6*h);
}
float bolt(vec2 uv){
  // a jagged path from the top of the frame down toward the horizon
  float x = uBolt.x, w = 0.0, best = 1.0;
  for (int i=0;i<14;i++){
    float y0 = 1.05 - float(i)*0.06, y1 = y0 - 0.06;
    float x1 = x + (hash(vec2(float(i), uBoltSeed)) - 0.5)*0.06;
    if (uv.y < y1 - 0.02 || uv.y > y0 + 0.02 || y1 < uBolt.y){ x = x1; continue; }
    float t = clamp((uv.y - y0)/(y1 - y0), 0.0, 1.0);
    float dx = abs((uv.x - mix(x, x1, t))*uAspect);
    best = min(best, dx);
    x = x1;
  }
  return smoothstep(0.0018, 0.0, best) + 0.15*smoothstep(0.012, 0.0, best);
}
void main(){
  float d = texture(uDepth, vUV).r;
  float viewZ = exp2(d / uLogK) - 1.0;
  vec2 uv = vec2(vUV.x*uAspect, vUV.y);
  vec3 col = vec3(0.0);
  if (uRain > 0.0){
    float r = 0.0;
    if (viewZ > 3.0)  r += rainLayer(uv, 9.0, 3.2, 1.0) * 1.0;
    if (viewZ > 10.0) r += rainLayer(uv, 17.0, 2.4, 2.0) * 0.7;
    if (viewZ > 30.0) r += rainLayer(uv, 31.0, 1.8, 3.0) * 0.45;
    if (viewZ > 90.0) r += rainLayer(uv, 55.0, 1.3, 4.0) * 0.3;
    vec3 tint = uRainKind < 0.5 ? vec3(1.0, 0.93, 0.7) : uRainKind < 1.5 ? vec3(0.9, 0.95, 1.0) : vec3(0.85, 0.92, 1.0);
    col += tint * r * uRain * (uLight + vec3(uFlash)) * 0.12;
  }
  if (uSnow > 0.0){
    float s = 0.0;
    if (viewZ > 3.0)  s += snowLayer(uv, 22.0, 0.22, 1.0);
    if (viewZ > 12.0) s += snowLayer(uv, 40.0, 0.15, 2.0) * 0.7;
    if (viewZ > 40.0) s += snowLayer(uv, 75.0, 0.10, 3.0) * 0.45;
    col += vec3(0.92, 0.95, 1.0) * s * uSnow * (uLight + vec3(uFlash)) * 0.45;
  }
  if (uFlash > 0.0 && uBoltSeed > 0.0 && viewZ > 5000.0) col += vec3(0.85, 0.88, 1.0) * bolt(vUV) * uFlash * 2.0;
  o = vec4(col, 1.0);
}`;

export class Weather {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, FULLSCREEN_VS, FS, 'weather');
    this.vao = gl.createVertexArray();
    this.fb = null; this.forTex = null;
  }
  // A framebuffer that writes the scene colour without its depth attached.
  colorOnly(rt) {
    const gl = this.gl;
    if (this.forTex === rt.tex) return this.fb;
    if (this.fb) gl.deleteFramebuffer(this.fb);
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt.tex, 0);
    this.forTex = rt.tex;
    return this.fb;
  }
  draw(rt, u) {
    if (u.uRain <= 0 && u.uSnow <= 0 && u.uFlash <= 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorOnly(rt));
    gl.viewport(0, 0, rt.w, rt.h);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    bindTex(gl, this.prog, 'uDepth', rt.depthTex, 0);
    setUniforms(gl, this.prog, { ...u, uAspect: rt.w / rt.h });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
}

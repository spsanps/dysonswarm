// GLSL for Four Hours Out. The look: a plasticine model photographed on a small set.
// Matte clay with a waxy sheen and thumb-pressed unevenness, one hard little sun,
// Neptune as a pale blue fill, warm lit windows, cotton-wool smoke, shallow focus.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DShadow;
`;

const NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
`;

// ---------------------------------------------------------------------------
export const SCENE_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aExt;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
layout(location=7) in vec4 aCol;
layout(location=8) in vec4 aPar;
uniform mat4 uVP;
uniform vec3 uCam;
uniform sampler3D uNoise;
uniform float uStep;
out vec3 vW; out vec3 vN; out vec3 vL; out vec3 vNL; out vec3 vLC;
out vec4 vCol; out vec4 vPar; out vec3 vExt;
flat out int vMat; flat out float vId;
void main(){
  mat4 M = mat4(aM0, aM1, aM2, aM3);
  vec3 p = aPos, n = aNrm;
  int mat = int(aExt.x + 0.5);
  if (mat == 7) {
    // cotton wool: a lumpy ball, re-teased a little every stop-motion step
    vec3 q = p * 1.1 + vec3(aPar.y * 3.1, aPar.y * 1.7, aPar.y * 2.3);
    float d = texture(uNoise, q * 0.18).r * 2.0 - 1.0;
    d += 0.6 * (texture(uNoise, q * 0.42 + 0.31).g * 2.0 - 1.0);
    d += 0.25 * (texture(uNoise, q * 0.9 + vec3(0.0, uStep * 0.013, 0.0)).b * 2.0 - 1.0);
    p *= 1.0 + 0.3 * d;
  }
  vec4 w = M * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(M) * n);
  vL = p; vNL = n;
  vLC = (inverse(M) * vec4(uCam, 1.0)).xyz;
  vCol = aCol; vPar = aPar; vExt = aExt.yzw; vMat = mat;
  vId = aExt.w > 0.5 ? aExt.w : aPar.x;
  gl_Position = uVP * w;
}`;

export const SCENE_FS = HEAD + NOISE + `
in vec3 vW; in vec3 vN; in vec3 vL; in vec3 vNL; in vec3 vLC;
in vec4 vCol; in vec4 vPar; in vec3 vExt;
flat in int vMat; flat in float vId;
uniform vec3 uCam;
uniform vec3 uSunDir, uSunCol, uNepDir, uNepCol, uKeyDir;
uniform float uKeyIsSun;
uniform mat4 uShadowVP;
uniform sampler2DShadow uShadow;
uniform float uShadowSoft, uShadowOn;
uniform int uShadowTaps;
uniform sampler2D uGround;
uniform sampler3D uNoise;
uniform float uGroundS;
uniform vec3 uAmbTop, uAmbBottom;
uniform float uExposure, uLights, uWindows, uTime, uStep, uHover, uSel, uHW;
uniform vec4 uHallA[4];
uniform vec4 uHallB[4];
uniform vec4 uLamp[8];
uniform vec4 uBusy;
uniform vec3 uPal[22];
uniform float uFocus, uAperture;
out vec4 frag;

const vec2 PD[12] = vec2[](vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696,0.457), vec2(-0.203,0.621), vec2(0.962,-0.195), vec2(0.473,-0.480),
  vec2(0.519,0.767), vec2(0.185,-0.893), vec2(0.507,0.064), vec2(0.896,0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));

float shadowAt(vec3 w, vec3 n){
  if (uShadowOn < 0.5) return 1.0;
  vec3 pw = w + n * 0.05;
  vec4 s = uShadowVP * vec4(pw, 1.0);
  vec3 sc = s.xyz / s.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.y < 0.0 || sc.x > 1.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float a = hash12(gl_FragCoord.xy) * 6.2832;
  mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  float sum = 0.0;
  for (int i = 0; i < 12; i++) { if (i >= uShadowTaps) break; sum += texture(uShadow, vec3(sc.xy + R * PD[i] * uShadowSoft, sc.z - 0.0012)); }
  return sum / float(uShadowTaps);
}

// The clay itself: thumb smudges and fine grain bend the normal a little.
vec3 thumb(vec3 N, vec3 p, float amt){
  vec3 g = texture(uNoise, p * 0.11).rgb * 2.0 - 1.0;
  vec3 g2 = texture(uNoise, p * 0.47 + 0.5).rgb * 2.0 - 1.0;
  vec3 g3 = texture(uNoise, p * 1.9 + 0.2).rgb * 2.0 - 1.0;
  vec3 b = g * 0.55 + g2 * 0.35 + g3 * 0.18;
  b -= N * dot(b, N);
  return normalize(N + b * amt);
}

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 finish(vec3 c){
  c *= uExposure;
  c = aces(c * 0.92);
  return pow(c, vec3(1.0 / 2.2));
}

// Light on clay: wrapped diffuse, a warm terminator, a soft waxy sheen.
vec3 clay(vec3 base, vec3 N, vec3 V, float ao, float sh, float gloss){
  float shS = uKeyIsSun > 0.5 ? sh : 1.0;
  float shN = uKeyIsSun > 0.5 ? mix(1.0, sh, 0.0) : sh;
  float nlS = dot(N, uSunDir), nlN = dot(N, uNepDir);
  float dS = max((nlS + 0.28) / 1.28, 0.0); dS *= dS * 0.35 + 0.65;
  float dN = max((nlN + 0.45) / 1.45, 0.0);
  vec3 c = base * uSunCol * dS * shS;
  float term = exp(-pow((nlS - 0.05) / 0.2, 2.0));
  c += base * base * uSunCol * term * 0.32 * shS;
  c += base * uNepCol * dN * mix(uKeyIsSun > 0.5 ? 0.55 : 0.18, 1.0, shN);
  float up = N.y * 0.5 + 0.5;
  c += base * mix(uAmbBottom, uAmbTop, up) * ao;
  vec3 H = normalize(uSunDir + V);
  c += uSunCol * pow(max(dot(N, H), 0.0), 22.0) * 0.07 * gloss * shS;
  vec3 Hn = normalize(uNepDir + V);
  c += uNepCol * pow(max(dot(N, Hn), 0.0), 16.0) * 0.05 * gloss * shN;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  c += (uAmbTop * 1.6 + uNepCol * 0.12) * rim * 0.45 * ao;
  return c * mix(1.0, ao, 0.85);
}

// Light thrown on the ground by windows, doors and lamps.
vec3 pools(vec3 W){
  vec3 warm = vec3(1.0, 0.6, 0.28);
  float s = 0.0;
  for (int i = 0; i < 4; i++){
    vec4 A = uHallA[i], B = uHallB[i];
    vec2 d = W.xz - A.xy;
    if (dot(d, d) > (B.y + 4.0) * (B.y + 4.0)) continue;
    vec2 l = vec2(A.z * d.x - A.w * d.y, A.w * d.x + A.z * d.y);
    float ax = abs(l.x) - B.x;
    float inLen = smoothstep(B.y + 0.1, B.y - 0.5, abs(l.y));
    float n = floor((B.y * 2.0 - 1.0));
    float ph = mod(n, 2.0) < 0.5 ? 3.14159 : 0.0;
    float win = pow(0.5 + 0.5 * cos(6.28318 * l.y + ph), 2.0);
    s += B.w * exp(-max(ax, 0.0) * 1.7) * smoothstep(-0.05, 0.08, ax) * inLen * (0.25 + 0.75 * win) * 0.7;
    float az = l.y - B.y;
    s += B.w * exp(-max(az, 0.0) * 0.9) * smoothstep(-0.05, 0.1, az) * smoothstep(1.4, 0.3, abs(l.x)) * 1.0;
  }
  for (int i = 0; i < 8; i++){
    vec4 L = uLamp[i];
    vec2 d = W.xz - L.xz;
    float r2 = dot(d, d), k = 0.5 + L.y * 1.6;
    if (L.w > 0.0 && r2 < k * 9.0) s += L.w * exp(-r2 / k);
  }
  return warm * s * uLights;
}

// Looking in through a window: two rows of racks, a warm ceiling strip, depth.
vec3 interior(vec3 ro, vec3 rd, float W2, float L2, float seed, float busy){
  vec3 bmin = vec3(-W2 + 0.14, 0.04, -L2 + 0.14), bmax = vec3(W2 - 0.14, uHW + 0.6, L2 - 0.14);
  vec3 t1 = (bmin - ro) / rd, t2 = (bmax - ro) / rd;
  vec3 tf = max(t1, t2);
  float tHit = min(min(tf.x, tf.y), tf.z);
  int what = 0; vec3 nh = vec3(0.0);
  if (tHit == tf.y) nh = vec3(0.0, -sign(rd.y), 0.0); else if (tHit == tf.x) nh = vec3(-sign(rd.x), 0.0, 0.0); else nh = vec3(0.0, 0.0, -sign(rd.z));
  for (int r = 0; r < 2; r++){
    float cx = r == 0 ? -0.5 : 0.5;
    vec3 rmin = vec3(cx - 0.17, 0.0, -L2 + 0.55), rmax = vec3(cx + 0.17, 0.96, L2 - 0.55);
    vec3 a = (rmin - ro) / rd, b = (rmax - ro) / rd;
    vec3 tn = min(a, b), tx = max(a, b);
    float tN = max(max(tn.x, tn.y), tn.z), tX = min(min(tx.x, tx.y), tx.z);
    if (tN < tX && tN > 0.0 && tN < tHit){
      tHit = tN; what = 1;
      nh = tN == tn.x ? vec3(-sign(rd.x), 0.0, 0.0) : (tN == tn.y ? vec3(0.0, -sign(rd.y), 0.0) : vec3(0.0, 0.0, -sign(rd.z)));
    }
  }
  vec3 hp = ro + rd * tHit;
  vec3 col;
  // the light: a warm strip down the middle of the ceiling
  float lightFall = 0.55 + 0.45 * smoothstep(1.4, 0.0, abs(hp.x)) ;
  if (what == 1){
    col = vec3(0.075, 0.058, 0.055);
    if (abs(nh.x) > 0.5){
      vec2 cell = vec2(hp.z * 15.0, hp.y * 19.0);
      vec2 id = floor(cell), f = fract(cell) - 0.5;
      float h = hash12(id + seed * 17.0);
      float on = step(0.42, h) * step(0.07, hp.y) * step(hp.y, 0.9);
      float rate = mix(0.6, 5.0, busy) * (0.4 + h);
      float blink = step(0.3, hash12(id * 1.37 + floor(uStep / 12.0 * rate) + seed));
      vec3 led = h > 0.93 ? vec3(0.55, 1.0, 0.45) : (h > 0.86 ? vec3(1.0, 0.92, 0.75) : vec3(1.0, 0.55, 0.16));
      float dotm = smoothstep(0.34, 0.12, length(f * vec2(1.0, 1.25)));
      col += led * on * mix(0.25, 1.0, blink) * dotm * 3.2;
      col *= 0.85 + 0.15 * step(0.08, abs(fract(hp.y * 9.5) - 0.5));
      col *= 0.9 + 0.1 * step(0.04, abs(fract(hp.z * 1.6) - 0.5)) ;
    } else col += vec3(0.32, 0.22, 0.15) * lightFall;
  } else {
    if (nh.y > 0.5) { col = vec3(0.36, 0.28, 0.22) * lightFall; col *= 0.9 + 0.1 * step(0.03, abs(fract(hp.z * 1.2) - 0.5)); }
    else if (nh.y < -0.5) { col = vec3(0.55, 0.42, 0.3) + vec3(2.4, 1.6, 0.9) * smoothstep(0.14, 0.08, abs(hp.x)); }
    else col = vec3(0.62, 0.48, 0.34) * lightFall;
  }
  col *= vec3(1.25, 0.95, 0.68);
  // warm haze with depth, so the far end of the hall falls away
  col = mix(col, vec3(0.42, 0.24, 0.12), 1.0 - exp(-tHit * 0.12));
  return col * 1.9;
}

float archWin(vec2 q, float hw, float y0, float y1){
  float yc = y1 - hw;
  if (q.y > yc) return length(q - vec2(0.0, yc)) - hw;
  return max(abs(q.x) - hw, y0 - q.y);
}

void main(){
  vec3 V = normalize(uCam - vW);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing && vMat != 0) N = -N;
  float dist = length(uCam - vW);
  float cocS = clamp(uAperture * (dist - uFocus) / dist, -1.0, 1.0);
  vec3 col;
  float ao = vExt.x;
  int mat = vMat;
  float palI = vExt.y;
  vec3 base = (palI > 0.5 && mat != 0) ? uPal[int(palI + 0.5)] : vCol.rgb;
  base = pow(base, vec3(2.2));
  float hover = (abs(vId - uHover) < 0.5 && vId > 0.5) ? 1.0 : 0.0;
  float sel = (abs(vId - uSel) < 0.5 && vId > 0.5) ? 1.0 : 0.0;

  if (mat == 0){
    // ---- the ground: frost cap, cantaloupe dimples, and the cut side of the core
    vec4 g = texture(uGround, vW.xz / (2.0 * uGroundS) + 0.5);
    float zone = vExt.y;
    vec3 frost = vec3(0.93, 0.83, 0.82);
    vec3 melon = vec3(0.80, 0.78, 0.70);
    float c = g.a;
    vec3 top = mix(frost, melon, c);
    top = mix(top, top * vec3(0.86, 0.88, 0.84), c * smoothstep(0.02, -0.22, vW.y));
    float big = texture(uNoise, vW * 0.045).a;
    top *= 0.95 + 0.1 * big;
    top = mix(top, vec3(0.64, 0.6, 0.68), g.g * 0.9);
    top = mix(top, vec3(0.36, 0.29, 0.27), g.b * 0.88);
    // the cut side: frost, a pink methane band, water-ice bedrock, wire-cut lines
    float ang = atan(vW.z, vW.x);
    float wob = 0.1 * sin(ang * 7.0 + 1.3) + 0.06 * sin(ang * 17.0) + 0.12 * (texture(uNoise, vW * 0.09).a - 0.5);
    float y = vW.y + wob;
    float fold = 0.18 * sin(ang * 3.0 + 0.7) + 0.1 * sin(ang * 11.0 + 2.0);
    float y2 = y + fold * smoothstep(-0.6, -2.0, vW.y);
    vec3 sc = vec3(0.95, 0.87, 0.85);
    sc = mix(sc, vec3(0.87, 0.6, 0.5), smoothstep(-0.30, -0.36, y));
    sc = mix(sc, vec3(0.94, 0.79, 0.72), smoothstep(-0.50, -0.53, y) * (1.0 - smoothstep(-0.57, -0.60, y)));
    sc = mix(sc, vec3(0.77, 0.81, 0.86), smoothstep(-0.68, -0.76, y));
    sc = mix(sc, vec3(0.56, 0.51, 0.51), smoothstep(-1.36, -1.40, y2) * (1.0 - smoothstep(-1.47, -1.51, y2)));
    sc = mix(sc, vec3(0.66, 0.73, 0.83), smoothstep(-1.52, -1.6, y2));
    sc = mix(sc, vec3(0.82, 0.86, 0.91), smoothstep(-2.02, -2.06, y2) * (1.0 - smoothstep(-2.3, -2.34, y2)));
    sc = mix(sc, vec3(0.5, 0.56, 0.69), smoothstep(-2.55, -3.0, y2));
    float spk = step(0.992, hash13(floor(vW * 11.0)));
    sc = mix(sc, vec3(0.38, 0.33, 0.33), spk * smoothstep(-0.8, -1.2, y) * 0.6);
    float wire = sin(vW.y * 46.0 + 6.0 * texture(uNoise, vW * vec3(0.04, 0.5, 0.04)).r);
    float drag = smoothstep(0.62, 0.8, texture(uNoise, vec3(ang * 2.2, vW.y * 2.5, 0.37)).g);
    sc *= (0.95 + 0.05 * wire) * (1.0 - 0.07 * drag);
    base = pow(mix(top, sc, smoothstep(0.15, 0.85, zone)), vec3(2.2));
    float aoG = mix(g.r, 1.0, smoothstep(0.2, 0.6, zone));
    vec3 Nb = thumb(N, vW * 1.2, mix(0.2, 0.34, zone));
    float sh = shadowAt(vW, N);
    col = clay(base, Nb, V, aoG, sh, 0.5);
    col += base * pools(vW) * (1.0 - zone) * aoG;
    // frost glitter (salt on a model set)
    if (zone < 0.5){
      vec3 cell = floor(vW * 26.0);
      float h = hash13(cell);
      if (h > 0.972){
        vec3 jn = normalize(N + (hash33(cell) - 0.5) * 1.3);
        float s = pow(max(dot(reflect(-V, jn), uKeyDir), 0.0), 300.0);
        col += (uKeyIsSun > 0.5 ? uSunCol : uNepCol * 1.5) * s * 3.0 * sh * (1.0 - g.b);
      }
    }
  } else if (mat == 7){
    // ---- cotton wool smoke
    float dark = vCol.r;
    vec3 sm = pow(mix(vec3(0.8, 0.76, 0.75), vec3(0.42, 0.38, 0.38), dark), vec3(2.2));
    vec3 fib = texture(uNoise, vL * 2.6 + vPar.y).rgb;
    sm *= 0.85 + 0.3 * fib.r;
    vec3 Nb = thumb(N, vL * 3.0 + vPar.y, 0.5);
    float sh = shadowAt(vW, N);
    float nl = dot(Nb, uSunDir);
    float wrapD = max((nl + 0.6) / 1.6, 0.0);
    col = sm * uSunCol * wrapD * (uKeyIsSun > 0.5 ? sh : 1.0) * 0.9;
    col += sm * uNepCol * max((dot(Nb, uNepDir) + 0.6) / 1.6, 0.0) * (uKeyIsSun > 0.5 ? 1.0 : sh);
    col += sm * mix(uAmbBottom, uAmbTop, Nb.y * 0.5 + 0.5);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    col += uSunCol * rim * pow(max(dot(-V, uSunDir), 0.0), 2.0) * 0.6 * (uKeyIsSun > 0.5 ? sh : 1.0);
    col += sm * rim * 0.35;
    // fuzzy edge: dithered, re-teased every step like real cotton between frames
    float edge = smoothstep(0.05, 0.42, dot(N, V) + 0.18 * (fib.g - 0.5)) * vCol.g;
    float th = hash12(floor(gl_FragCoord.xy) + mod(uStep, 7.0) * 13.1);
    if (edge < th * 0.9 + 0.02) discard;
  } else if (mat == 8){
    // ---- a hall: clay shell with windows you can look into
    float L2 = vPar.z * 0.5, W2 = vPar.w * 0.5;
    vec3 lp = vL, ln = normalize(vNL);
    float busy = vPar.y < 0.5 ? uBusy.x : (vPar.y < 1.5 ? uBusy.y : (vPar.y < 2.5 ? uBusy.z : uBusy.w));
    int nwin = int(floor(vPar.z - 1.0));
    float glass = 0.0, frame = 0.0, door = 0.0, bar = 0.0;
    float dWin = 1e3;
    if (abs(ln.x) > 0.55 && lp.y < uHW + 0.1){
      float k = clamp(floor(lp.z + float(nwin) * 0.5), 0.0, float(nwin - 1));
      float zc = k - float(nwin - 1) * 0.5;
      dWin = archWin(vec2(lp.z - zc, lp.y), 0.25, 0.3, 1.1);
    } else if (abs(ln.z) > 0.55){
      if (lp.z > 0.0){
        dWin = archWin(vec2(lp.x, lp.y), 0.62, 0.2, uHW + 0.56);
        bar = max(step(abs(lp.x), 0.024), max(step(abs(abs(lp.x) - 0.31), 0.02), step(abs(lp.y - 0.98), 0.02)));
      } else {
        float dd = max(abs(lp.x) - 0.27, lp.y - 0.88);
        door = 1.0 - smoothstep(-0.005, 0.005, dd);
        frame = max(frame, (1.0 - smoothstep(0.035, 0.045, dd)) * (1.0 - door));
        dWin = length(vec2(lp.x, lp.y - 1.62)) - 0.2;
      }
    }
    glass = 1.0 - smoothstep(-0.006, 0.006, dWin);
    frame = max(frame, (1.0 - smoothstep(0.035, 0.05, dWin)) * (1.0 - glass));
    vec3 Nb = thumb(N, vL * 1.6 + vPar.y * 7.0, 0.26);
    float sh = shadowAt(vW, N);
    vec3 wall = base * (0.92 + 0.16 * texture(uNoise, vL * 0.35 + vPar.y).a);
    wall = mix(wall, base * 0.62, frame);
    wall = mix(wall, pow(uPal[5], vec3(2.2)), door);
    col = clay(wall, Nb, V, ao, sh, 0.7);
    if (glass > 0.0 && bar < 0.5){
      vec3 rd = normalize(lp - vLC);
      vec3 inside = interior(lp - rd * 0.0, rd, W2, L2, vPar.y, busy);
      float fres = 0.04 + 0.6 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 refl = uAmbTop * 2.0 + uNepCol * 0.25 * pow(max(dot(reflect(-V, N), uNepDir), 0.0), 8.0);
      vec3 g = mix(inside * uWindows, refl, fres);
      col = mix(col, g, glass);
    } else if (glass > 0.0) col = mix(col, clay(base * 0.5, N, V, ao, sh, 0.3), glass);
  } else if (mat == 4){
    // ---- lit glass (the cabin's porthole, the rover's windscreen): a warm room behind
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 room = vec3(1.0, 0.62, 0.3) * (1.05 + 0.25 * texture(uNoise, vW * 2.0).a);
    col = mix(room * uWindows, uAmbTop * 2.0 + uNepCol * 0.2, fres * 0.6);
  } else if (mat == 6){
    // ---- lamps and beacons
    float on = uLights;
    if (abs(vId - 5.0) < 0.5) on *= step(0.5, fract(uStep / 24.0)) * 0.8 + 0.2;
    col = vec3(1.0, 0.72, 0.36) * (0.6 + 2.6 * on);
  } else if (mat == 5){
    // ---- the visor: dark glass with a sharp glint
    vec3 R = reflect(-V, N);
    col = base * 0.3 + uAmbTop * 0.6;
    col += uSunCol * pow(max(dot(R, uSunDir), 0.0), 80.0) * 2.0 * shadowAt(vW, N);
    col += uNepCol * pow(max(dot(R, uNepDir), 0.0), 30.0) * 0.8;
    col += vec3(1.0, 0.6, 0.3) * 0.15 * uLights;
  } else {
    // ---- everything else: plain clay (2), radiator fins (3), cable (9)
    float amt = mat == 3 ? 0.14 : 0.32;
    vec3 Nb = thumb(N, vW * 1.4, amt);
    float sh = shadowAt(vW, N);
    float gloss = mat == 3 ? 0.9 : 0.6;
    base *= 0.92 + 0.16 * texture(uNoise, vW * 0.4).a;
    if (mat == 3) base *= mix(0.78, 1.0, smoothstep(0.0, 0.06, abs(fract(vW.y * 2.2) - 0.5)));
    col = clay(base, Nb, V, ao, sh, gloss);
    if (mat == 9){
      float h = hash13(floor(vW * 30.0));
      if (h > 0.95) col += uSunCol * pow(max(dot(reflect(-V, normalize(N + (hash33(floor(vW * 30.0)) - 0.5))), uKeyDir), 0.0), 120.0) * 1.5 * sh;
    }
    // warm spill from nearby lamps and windows on the lower parts of things
    if (vW.y < 1.6) col += base * pools(vec3(vW.x, 0.0, vW.z)) * 0.35 * smoothstep(1.6, 0.0, vW.y);
  }
  vec3 warmRim = vec3(1.0, 0.75, 0.45);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  col += warmRim * (hover * 0.35 + sel * 0.25) * (0.25 + rim);
  frag = vec4(finish(col), 0.5 + 0.5 * cocS);
}`;

// ---------------------------------------------------------------------------
export const SHADOW_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 aExt;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
layout(location=8) in vec4 aPar;
uniform mat4 uVP;
uniform sampler3D uNoise;
uniform float uStep;
void main(){
  mat4 M = mat4(aM0, aM1, aM2, aM3);
  vec3 p = aPos;
  if (int(aExt.x + 0.5) == 7){
    vec3 q = p * 1.1 + vec3(aPar.y * 3.1, aPar.y * 1.7, aPar.y * 2.3);
    float d = texture(uNoise, q * 0.18).r * 2.0 - 1.0;
    d += 0.6 * (texture(uNoise, q * 0.42 + 0.31).g * 2.0 - 1.0);
    p *= 1.0 + 0.3 * d;
    p *= 0.85;
  }
  gl_Position = uVP * (M * vec4(p, 1.0));
}`;
export const SHADOW_FS = HEAD + `out vec4 frag; void main(){ frag = vec4(1.0); }`;

// ---------------------------------------------------------------------------
export const QUAD_VS = HEAD + `
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}`;

// The sky behind the model: a painted backdrop held at eye level. Neptune is drawn at
// its true size (8°) and true phase; the Sun is a hard little bulb.
export const SKY_FS = HEAD + NOISE + `
in vec2 vUv;
uniform mat4 uSkyInv;
uniform vec3 uSunDir, uNepDir, uNepPole;
uniform float uSunVis, uNepR, uSpin, uPix, uExposure, uSkyCoc, uNight;
uniform sampler3D uNoise;
out vec4 frag;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec4 p = uSkyInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(p.xyz / p.w);
  float e = d.y;
  // backdrop: deep plum at the top, a warmer violet band at eye level
  vec3 top = vec3(0.060, 0.047, 0.098), mid = vec3(0.135, 0.100, 0.185), low = vec3(0.085, 0.066, 0.125);
  vec3 col = mix(mid, top, smoothstep(-0.02, 0.55, e));
  col = mix(col, low, smoothstep(-0.02, -0.45, e));
  // a soft halo of Neptune-light on the backdrop around the planet
  float cn = dot(d, uNepDir);
  float lit = 0.5 - 0.5 * dot(uSunDir, uNepDir);
  col += vec3(0.11, 0.17, 0.2) * exp(-(1.0 - cn) * 70.0) * (0.25 + 0.75 * lit) * 0.6;
  // pinhole stars
  vec2 sc = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  float cs = 0.021;
  vec2 id = floor(sc / cs), f = sc / cs - id;
  float h = hash12(id);
  if (h > 0.8){
    vec2 sp = vec2(hash12(id + 1.3), hash12(id + 2.7)) * 0.8 + 0.1;
    float dd = length((f - sp) * cs) / uPix;
    float b = pow(hash12(id + 5.1), 4.0);
    vec3 sc3 = mix(vec3(1.0, 0.85, 0.7), vec3(0.85, 0.9, 1.0), hash12(id + 9.0));
    col += sc3 * (0.12 + 0.9 * b) * exp(-dd * dd * 0.9);
  }
  // the Sun: a bright point with a soft warm halo
  float ca = dot(d, uSunDir);
  float ang = acos(clamp(ca, -1.0, 1.0));
  col += vec3(1.0, 0.93, 0.78) * uSunVis * (exp(-pow(ang / (uPix * 1.6), 2.0)) * 3.0 + exp(-ang * 70.0) * 0.5 + exp(-ang * 9.0) * 0.06);
  // Neptune
  vec3 right = normalize(cross(uNepDir, vec3(0.0, 1.0, 0.0)));
  vec3 upv = cross(right, uNepDir);
  float tr = tan(uNepR);
  vec2 q = vec2(dot(d, right), dot(d, upv)) / max(cn, 1e-4) / tr;
  float r2 = dot(q, q);
  float edgeW = uPix / uNepR * 1.5;
  if (cn > 0.0 && r2 < (1.0 + edgeW) * (1.0 + edgeW)){
    float mu = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
    vec3 n = normalize(q.x * right + q.y * upv - mu * uNepDir);
    float lat = asin(clamp(dot(n, uNepPole), -1.0, 1.0));
    vec3 e1 = normalize(cross(uNepPole, uNepDir));
    vec3 e2 = cross(uNepPole, e1);
    float lon = atan(dot(n, e2), dot(n, e1)) + uSpin;
    // pale cyan, as Neptune really looks (Irwin et al. 2024), with soft bands
    vec3 nb = vec3(0.40, 0.64, 0.74);
    float band = sin(lat * 8.0 + 0.5 * sin(lon * 2.0 + lat * 3.0)) * 0.11 + sin(lat * 21.0 + 1.0) * 0.05;
    nb *= 1.0 + band;
    nb = mix(nb, vec3(0.42, 0.66, 0.72), smoothstep(-0.9, -1.3, lat) * 0.6);
    // a dark spot and its bright companion cloud
    vec2 spot = vec2(mod(lon + 3.14159, 6.28318) - 3.14159, lat + 0.36);
    float ds = length(spot * vec2(0.62, 2.3));
    nb = mix(nb, vec3(0.24, 0.42, 0.62), smoothstep(0.24, 0.14, ds) * 0.85);
    vec2 cl = vec2(mod(lon + 2.9, 6.28318) - 3.14159, lat + 0.24);
    nb = mix(nb, vec3(0.95, 0.98, 1.0), smoothstep(0.12, 0.0, length(cl * vec2(0.5, 5.0))) * 0.9);
    // methane cirrus streaks
    float streak = smoothstep(0.035, 0.0, abs(lat - 0.46 - 0.03 * sin(lon * 3.0))) * smoothstep(0.4, 0.7, texture(uNoise, vec3(lon * 0.8, lat * 2.0, 0.3)).r);
    streak += smoothstep(0.03, 0.0, abs(lat + 0.78)) * smoothstep(0.45, 0.75, texture(uNoise, vec3(lon * 0.9 + 2.0, 1.0, 0.7)).g);
    nb = mix(nb, vec3(0.92, 0.97, 1.0), clamp(streak, 0.0, 1.0) * 0.8);
    float nl = dot(n, uSunDir);
    float day = smoothstep(-0.12, 0.28, nl);
    float limb = 0.55 + 0.45 * pow(mu, 0.5);
    vec3 c = nb * (0.3 + 1.0 * max(nl, 0.0)) * day * limb;
    c += vec3(0.75, 0.9, 1.0) * pow(1.0 - mu, 5.0) * 0.35 * smoothstep(-0.1, 0.3, nl);
    c = pow(aces(c * (1.0 + (uExposure - 1.0) * 0.35) * 0.95), vec3(1.0 / 2.2));
    vec3 nightSide = vec3(0.07, 0.072, 0.115) + vec3(0.03, 0.04, 0.05) * pow(1.0 - mu, 3.0);
    c = max(c, nightSide * (1.0 - day * 0.0));
    c = mix(nightSide, c, day);
    float a = 1.0 - smoothstep(1.0 - edgeW, 1.0 + edgeW, sqrt(r2));
    col = mix(col, c, a);
  }
  frag = vec4(col, 0.5 + 0.5 * uSkyCoc);
}`;

// ---------------------------------------------------------------------------
// Shallow focus, gathered at half resolution. Signed circle of confusion in alpha.
export const DOF_FS = HEAD + `
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uMaxR;
uniform int uTaps;
out vec4 frag;
void main(){
  vec4 c0 = texture(uSrc, vUv);
  float s0 = c0.a * 2.0 - 1.0, r0 = abs(s0) * uMaxR;
  vec3 acc = c0.rgb; float wsum = 1.0; float cAcc = abs(s0);
  for (int i = 0; i < 40; i++){
    if (i >= uTaps) break;
    float fi = float(i) + 0.5;
    float rr = sqrt(fi / float(uTaps));
    float th = fi * 2.39996;
    float dist = rr * uMaxR;
    vec4 s = texture(uSrc, vUv + vec2(cos(th), sin(th)) * dist * uTexel);
    float ss = s.a * 2.0 - 1.0;
    float rs = abs(ss) * uMaxR;
    float w = smoothstep(dist - 1.0, dist + 1.0, rs);
    // something behind a sharper pixel can't spread over it
    if (ss > s0) w *= smoothstep(dist - 1.0, dist + 1.0, r0);
    acc += s.rgb * w; wsum += w; cAcc += abs(ss) * w;
  }
  frag = vec4(acc / wsum, cAcc / wsum);
}`;

export const GLOW_FS = HEAD + `
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 frag;
void main(){
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 24; i++){
    float fi = float(i) + 0.5;
    float rr = sqrt(fi / 24.0) * 9.0;
    float th = fi * 2.39996;
    vec3 c = texture(uSrc, vUv + vec2(cos(th), sin(th)) * rr * uTexel).rgb;
    float w = exp(-rr * 0.22);
    vec3 b = max(c - vec3(0.86), vec3(0.0));
    acc += b * w; ws += w;
  }
  frag = vec4(acc / ws * 2.2, 1.0);
}`;

export const COMPOSITE_FS = HEAD + NOISE + `
in vec2 vUv;
uniform sampler2D uScene, uBlur, uGlow;
uniform float uGlowAmt, uStep, uGrain, uDof;
out vec4 frag;
void main(){
  vec4 s = texture(uScene, vUv);
  vec4 b = texture(uBlur, vUv);
  vec3 g = texture(uGlow, vUv).rgb;
  float coc = abs(s.a * 2.0 - 1.0);
  float m = smoothstep(0.03, 0.2, max(coc, b.a * 0.95)) * uDof;
  vec3 col = mix(s.rgb, b.rgb, m);
  col += g * uGlowAmt;
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.32 * dot(q, q) * 1.6;
  col += (hash12(floor(gl_FragCoord.xy) + mod(uStep, 13.0) * 17.0) - 0.5) * uGrain;
  frag = vec4(col, 1.0);
}`;

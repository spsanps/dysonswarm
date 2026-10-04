/*
 * THE ORBITAL RING: the WebGL2 renderer.
 * Builds the atmosphere tables and noise once, then draws each frame in passes:
 * two small sky maps, the main ray-traced view (HDR), a bloom chain, metering,
 * and the film pass. No libraries. Loaded only after the visitor presses Enter.
 */
import * as S from './shaders.js';

export function createRenderer(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance',
  });
  if (!gl) throw Object.assign(new Error('no-webgl2'), { code: 'no-webgl2' });
  const extF = gl.getExtension('EXT_color_buffer_float');
  const extH = extF ? null : gl.getExtension('EXT_color_buffer_half_float');
  if (!extF && !extH) throw Object.assign(new Error('no-float'), { code: 'no-float' });
  gl.getExtension('OES_texture_float_linear');
  const parallel = gl.getExtension('KHR_parallel_shader_compile');

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  /* ---------- programs ---------- */
  function compile(type, src, label) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }
  const pending = [];
  function program(fs, label) {
    const p = gl.createProgram();
    const v = compile(gl.VERTEX_SHADER, S.VS), f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    const rec = { p, v, f, label, u: {} };
    pending.push(rec);
    return rec;
  }
  function check(rec) {
    if (!gl.getProgramParameter(rec.p, gl.LINK_STATUS)) {
      const log = gl.getShaderInfoLog(rec.f) || gl.getProgramInfoLog(rec.p) || 'unknown';
      throw Object.assign(new Error('Shader "' + rec.label + '" failed: ' + log.slice(0, 600)), { code: 'shader' });
    }
    const n = gl.getProgramParameter(rec.p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(rec.p, i);
      rec.u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(rec.p, info.name);
    }
  }
  async function linkAll(progress, list = pending) {
    if (parallel) {
      const K = parallel.COMPLETION_STATUS_KHR;
      for (;;) {
        const done = list.filter(r => gl.getProgramParameter(r.p, K)).length;
        progress && progress(done / list.length);
        if (done === list.length) break;
        await new Promise(r => setTimeout(r, 30));
      }
    }
    list.forEach(check);
  }

  const P = {
    trans: program(S.FS_TRANS, 'transmittance'),
    ms: program(S.FS_MS, 'multiple scattering'),
    irr: program(S.FS_IRR, 'irradiance'),
    env: program(S.FS_ENV, 'environment'),
    noise: program(S.FS_NOISE3D, 'noise'),
    weather: program(S.FS_WEATHER, 'weather'),
    main: program(S.FS_MAIN_LOW, 'main'),
    down: program(S.FS_DOWN, 'downsample'),
    up: program(S.FS_UP, 'upsample'),
    meter: program(S.FS_METER, 'meter'),
    final: program(S.FS_FINAL, 'film'),
    acc: program(S.FS_ACC, 'accumulate'),
  };

  /* ---------- textures and targets ---------- */
  function tex2D(w, h, internal, format, type, filter, wrap, data = null) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }
  function target(w, h, opts2 = {}) {
    const t = tex2D(w, h, opts2.internal || gl.RGBA16F, gl.RGBA, opts2.type || gl.HALF_FLOAT, gl.LINEAR, opts2.wrap || gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok) throw Object.assign(new Error('framebuffer incomplete'), { code: 'no-float' });
    return { t, fb, w, h };
  }
  const R = gl.LINEAR, CL = gl.CLAMP_TO_EDGE, RP = gl.REPEAT;
  const T = {
    trans: target(256, 64), ms: target(32, 32), irr: target(64, 32),
    env: target(64, 32, { wrap: RP }), envSea: target(64, 32, { wrap: RP }),
  };
  gl.bindTexture(gl.TEXTURE_2D, T.env.t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, CL);
  gl.bindTexture(gl.TEXTURE_2D, T.envSea.t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, CL);
  /* weather map: RGBA8, tiling, mipmapped */
  const WN = 512;
  const weather = tex2D(WN, WN, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR_MIPMAP_LINEAR, RP);
  const weatherFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, weatherFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, weather, 0);
  /* 3D noise */
  const NN = 64;
  const noise3 = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, noise3);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, NN, NN, NN, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, RP], [gl.TEXTURE_WRAP_T, RP], [gl.TEXTURE_WRAP_R, RP]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
  const noiseFb = gl.createFramebuffer();
  /* geography (filled after load; ocean until then) */
  const black = new Uint8Array([0, 0, 0, 255]);
  const region = tex2D(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, R, CL, black);
  const inset = tex2D(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, R, CL, black);
  const band = tex2D(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, R, CL, black);
  /* metering ping-pong (1x1) */
  const meter = [target(1, 1), target(1, 1)];
  let meterIdx = 0;

  let W = 0, H = 0, scene = null, chain = [], accT = [null, null], accIdx = 0;
  function resize(w, h) {
    w = Math.max(16, w | 0); h = Math.max(16, h | 0);
    if (w === W && h === H) return;
    W = w; H = h;
    const del = x => { if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); } };
    del(scene); chain.forEach(c => { del(c.down); del(c.up); }); accT.forEach(del);
    scene = target(W, H);
    accT = [target(W, H), target(W, H)];
    chain = [];
    let cw = W, ch = H;
    for (let i = 0; i < 6; i++) {
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
      chain.push({ down: target(cw, ch), up: target(cw, ch), w: cw, h: ch });
    }
  }

  /* ---------- drawing helpers ---------- */
  let unit = 0;
  function use(rec) { gl.useProgram(rec.p); unit = 0; return rec; }
  function bindTex(rec, name, t, is3D = false) {
    const loc = rec.u[name]; if (loc == null) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(is3D ? gl.TEXTURE_3D : gl.TEXTURE_2D, t);
    gl.uniform1i(loc, unit); unit++;
  }
  const u1 = (r, n, v) => r.u[n] != null && gl.uniform1f(r.u[n], v);
  const u1i = (r, n, v) => r.u[n] != null && gl.uniform1i(r.u[n], v);
  const u2 = (r, n, a, b) => r.u[n] != null && gl.uniform2f(r.u[n], a, b);
  const u3 = (r, n, v) => r.u[n] != null && gl.uniform3f(r.u[n], v[0], v[1], v[2]);
  const m3 = (r, n, v) => r.u[n] != null && gl.uniformMatrix3fv(r.u[n], false, v);
  function draw(fb, w, h) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  /* The view shader for high up and the gallery compiles after boot, in the background (it is
     not needed for the first minute of the ride). */
  let high = null, highOK = false;
  function startHigh() {
    if (high) return;
    high = program(S.FS_MAIN_HIGH, 'main (high)');
    pending.splice(pending.indexOf(high), 1);
  }
  function pollHigh() {
    if (highOK || !high) return highOK;
    if (parallel && !gl.getProgramParameter(high.p, parallel.COMPLETION_STATUS_KHR)) return false;
    check(high); highOK = true; return true;
  }
  /* which build a frame needs: high up (40 km+) or in the gallery, the station and the pod */
  const wantsHigh = st => st.mode === 1 || st.camH >= 40;
  const needsHigh = st => st.mode === 1 || st.camH >= 240;

  /* ---------- one-time precomputation ---------- */
  async function build(progress) {
    const step = (p, label) => progress && progress(p, label);
    /* the small programs finish first; the tables are built while the view shader compiles */
    step(.05, 'COMPILING THE SKY');
    await linkAll(null, pending.filter(r => r !== P.main));
    const geo = loadGeo(opts.base || './');
    step(.2, 'MEASURING THE AIR');
    await frameYield();
    use(P.trans); draw(T.trans.fb, 256, 64);
    use(P.ms); bindTex(P.ms, 'uTrans', T.trans.t); draw(T.ms.fb, 32, 32);
    await frameYield();
    use(P.irr); bindTex(P.irr, 'uTrans', T.trans.t); bindTex(P.irr, 'uMS', T.ms.t); draw(T.irr.fb, 64, 32);
    step(.4, 'GROWING CLOUDS');
    await frameYield();
    use(P.weather); u1(P.weather, 'uN', WN); draw(weatherFb, WN, WN);
    gl.bindTexture(gl.TEXTURE_2D, weather); gl.generateMipmap(gl.TEXTURE_2D);
    /* choose where the platform sits in the weather: fair sky overhead, a storm off to the east */
    wxOffset = pickWeatherSpot();
    use(P.noise); u1(P.noise, 'uN', NN);
    gl.bindFramebuffer(gl.FRAMEBUFFER, noiseFb);
    for (let z = 0; z < NN; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, noise3, 0, z);
      u1(P.noise, 'uSlice', z); gl.viewport(0, 0, NN, NN); gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (z % 16 === 15) await frameYield();
    }
    gl.bindTexture(gl.TEXTURE_3D, noise3);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_3D);
    step(.6, 'COMPILING THE SKY');
    await geo;
    const t0 = performance.now();
    await linkAll(() => step(.6 + .35 * (1 - Math.exp(-(performance.now() - t0) / 4000)), 'COMPILING THE SKY'), [P.main]);
    step(.97, 'CLOSING THE DOORS');
  }
  let wxOffset = [0, 0];
  function pickWeatherSpot() {
    const px = new Uint8Array(WN * WN * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, weatherFb);
    gl.readPixels(0, 0, WN, WN, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const km = 320 / WN, at = (x, y, c) => px[(((y % WN + WN) % WN) * WN + ((x % WN + WN) % WN)) * 4 + c] / 255;
    let best = null, bestScore = -1e9;
    for (let y = 0; y < WN; y += 16) for (let x = 0; x < WN; x += 16) {
      /* storm within 25 km is bad; cumulus overhead should be light but present */
      let near = 0, east = 0;
      /* no storm within ~120 km (200 px); one 150-250 km east, seen from high up */
      for (let dy = -200; dy <= 200; dy += 10) for (let dx = -200; dx <= 200; dx += 10) if (dx * dx + dy * dy < 40000) near = Math.max(near, at(x + dx, y + dy, 1));
      for (let dy = -40; dy <= 40; dy += 8) for (let dx = 240; dx <= 400; dx += 8) east = Math.max(east, at(x + dx, y + dy, 1));
      let local = 0, cnt = 0;
      for (let dy = -24; dy <= 24; dy += 8) for (let dx = -24; dx <= 24; dx += 8) { local += at(x + dx, y + dy, 0); cnt++; }
      local /= cnt;
      const score = -near * 4 + east * 2 - Math.abs(local - .3) * 3;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    /* weather is sampled at (xz + wind)/320 with xz = (east, north) km; y in the texture is north */
    return [best[0] * km, best[1] * km];
  }
  function frameYield() { return new Promise(r => setTimeout(r, 0)); }
  async function loadImg(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url);
    const blob = await res.blob();
    return await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  }
  async function loadGeo(base) {
    try {
      const [a, b, c] = await Promise.all([loadImg(base + 'data/pacific-coast.png'), loadImg(base + 'data/bay-area.png'), loadImg(base + 'data/ring-band.png')]);
      for (const [t, img] of [[region, a], [inset, b], [band, c]]) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
      }
    } catch (e) { console.warn('Geography could not load; the sea will be empty.', e); }
  }

  /* ---------- per frame ---------- */
  function render(st) {
    const m = wantsHigh(st) && pollHigh() ? high : P.main;
    /* sky maps */
    use(P.env); bindTex(P.env, 'uTrans', T.trans.t); bindTex(P.env, 'uMS', T.ms.t); bindTex(P.env, 'uIrr', T.irr.t);
    u3(P.env, 'uSun', st.sun); u2(P.env, 'uSize', 64, 32);
    u3(P.env, 'uPos', st.camE); draw(T.env.fb, 64, 32);
    const r = Math.hypot(...st.camE), sea = st.camE.map(v => v / r * (6371.0 + 0.002));
    u3(P.env, 'uPos', sea); draw(T.envSea.fb, 64, 32);

    use(m);
    bindTex(m, 'uTrans', T.trans.t); bindTex(m, 'uMS', T.ms.t); bindTex(m, 'uIrr', T.irr.t);
    bindTex(m, 'uEnv', T.env.t); bindTex(m, 'uEnvSea', T.envSea.t); bindTex(m, 'uWeather', weather);
    bindTex(m, 'uRegion', region); bindTex(m, 'uInset', inset); bindTex(m, 'uBand', band); bindTex(m, 'uNoise', noise3, true);
    u2(m, 'uRes', W, H); u1(m, 'uTime', st.time); u1(m, 'uFrame', st.frame % 4096);
    u3(m, 'uCamE', st.camE); u1(m, 'uCamH', st.camH); m3(m, 'uView', st.view); u2(m, 'uTanHalf', st.tanHalf[0], st.tanHalf[1]);
    u3(m, 'uSun', st.sun); m3(m, 'uStarRot', st.starRot); u1(m, 'uPixAng', 2 * st.tanHalf[1] / H);
    u1i(m, 'uMode', st.mode); u1(m, 'uSpeed', st.speed); u1(m, 'uDock', st.dock); u1(m, 'uCabinLamp', st.cabinLamp);
    u3(m, 'uC', st.C); u1(m, 'uRingU0', st.ringU0); u3(m, 'uStation', st.station); u3(m, 'uPlatform', st.platform);
    u2(m, 'uWind', st.wind[0] + wxOffset[0], st.wind[1] + wxOffset[1]); u1(m, 'uEvolve', st.evolve); u1(m, 'uQual', st.qual); u1(m, 'uNight', st.night); u1i(m, 'uDbg', st.dbgMask || 0); u1(m, 'uLon0', st.lon0); u1(m, 'uLonRel', st.lonRel); u1(m, 'uPodAng', st.podAng || 0); bindTex(m, 'uMeter', meter[meterIdx].t);
    draw(scene.fb, W, H);

    /* still frames accumulate; moving frames pass straight through */
    use(P.acc);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.t); gl.uniform1i(P.acc.u.uCur, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, accT[accIdx].t); gl.uniform1i(P.acc.u.uPrev, 1);
    u1(P.acc, 'uW', 1 / Math.max(1, st.accumN || 1));
    draw(accT[1 - accIdx].fb, W, H);
    accIdx = 1 - accIdx;
    const img = accT[accIdx];

    /* bloom chain */
    let src = img, sw = W, sh = H;
    use(P.down);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, meter[meterIdx].t); if (P.down.u.uMeter != null) gl.uniform1i(P.down.u.uMeter, 1);
    for (let i = 0; i < chain.length; i++) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(P.down.u.uSrc, 0);
      u2(P.down, 'uTexel', 1 / sw, 1 / sh); u1(P.down, 'uFirst', i === 0 ? 1 : 0);
      draw(chain[i].down.fb, chain[i].w, chain[i].h);
      src = chain[i].down; sw = chain[i].w; sh = chain[i].h;
    }
    use(P.up);
    for (let i = chain.length - 2; i >= 0; i--) {
      const lower = i === chain.length - 2 ? chain[i + 1].down : chain[i + 1].up;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lower.t); gl.uniform1i(P.up.u.uSrc, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, chain[i].down.t); gl.uniform1i(P.up.u.uBase, 1);
      u2(P.up, 'uTexel', 1 / chain[i + 1].w, 1 / chain[i + 1].h); u1(P.up, 'uMix', 1.0);
      draw(chain[i].up.fb, chain[i].w, chain[i].h);
    }
    /* meter on the 1/16 level */
    use(P.meter);
    const lvl = chain[Math.min(3, chain.length - 1)].down;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lvl.t); gl.uniform1i(P.meter.u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, meter[meterIdx].t); gl.uniform1i(P.meter.u.uPrev, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, chain[1].down.t); if (P.meter.u.uSrcHi != null) gl.uniform1i(P.meter.u.uSrcHi, 2);
    u1(P.meter, 'uRate', st.meterRate); u1(P.meter, 'uMinMean', st.minMean || .0006);
    draw(meter[1 - meterIdx].fb, 1, 1);
    meterIdx = 1 - meterIdx;

    /* film */
    const f = use(P.final);
    const tx = [['uScene', img.t], ['uB1', chain[0].up.t], ['uB2', chain[1].up.t], ['uB3', chain[2].up.t], ['uB4', chain[3].up.t], ['uMeter', meter[meterIdx].t]];
    tx.forEach(([n, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); if (f.u[n] != null) gl.uniform1i(f.u[n], i); });
    u2(f, 'uRes', canvas.width, canvas.height); u1(f, 'uGrainSeed', st.grainSeed); u1(f, 'uExpBias', st.expBias);
    u2(f, 'uSunUv', st.sunUv[0], st.sunUv[1]); u1(f, 'uSunOn', st.sunOn); u1(f, 'uGrainAmt', st.grain); u1(f, 'uAspect', canvas.width / canvas.height); u1(f, 'uDebug', st.debug || 0);
    draw(null, canvas.width, canvas.height);
  }

  /* test hook: percentiles of the cloud base shape at a mip level */
  function noiseStats(level = 0) {
    const n = NN >> level, px = new Uint8Array(n * n * 4), vals = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, noiseFb);
    for (let z = 0; z < n; z += Math.max(1, n >> 3)) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, noise3, level, z);
      gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < n * n; i += 3) {
        const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255, a = px[i * 4 + 3] / 255;
        const lf = g * .625 + b * .25 + a * .125; vals.push((r + 1 - lf) / (2 - lf));
      }
    }
    vals.sort((x, y) => x - y);
    const pc = p => vals[Math.floor(p * (vals.length - 1))].toFixed(3);
    return { p05: pc(.05), p25: pc(.25), p50: pc(.5), p75: pc(.75), p90: pc(.9), p97: pc(.97), p995: pc(.995) };
  }
  function lose() { const e = gl.getExtension('WEBGL_lose_context'); e && e.loseContext(); }
  return { gl, build, resize, render, lose, noiseStats, startHigh, waiting: st => needsHigh(st) && !pollHigh(), variant: st => (wantsHigh(st) && pollHigh() ? 1 : 0), get size() { return [W, H]; } };
}

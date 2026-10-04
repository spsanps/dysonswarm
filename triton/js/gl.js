// WebGL2 helpers, vectors and matrices. No libraries.

// Programs compile in the background: program() only starts the work, and settle() waits for
// it with KHR_parallel_shader_compile, so the page never blocks on the GPU process (on Windows
// the Direct3D compiler is slow, and asking for a status early freezes the tab until it's done).
export function program(gl, vs, fs, name = 'program') {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f);
  gl.linkProgram(p);
  return { p, u: {}, name, pending: { v, f, vs, fs } };
}
function finish(gl, prog) {
  const { v, f, vs, fs } = prog.pending, p = prog.p;
  prog.pending = null;
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    for (const [s, src] of [[v, vs], [f, fs]]) {
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) continue;
      const log = gl.getShaderInfoLog(s) || '';
      const m = /0:(\d+)/.exec(log);
      const lines = src.split('\n');
      const near = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 2).map((l, i) => (Math.max(1, +m[1] - 2) + i) + ': ' + l).join('\n') : '';
      throw new Error(`${prog.name}: ${log}\n${near}`);
    }
    throw new Error(`${prog.name}: ${gl.getProgramInfoLog(p) || (gl.isContextLost() ? 'the graphics context was lost' : 'link failed')}`);
  }
  gl.deleteShader(v); gl.deleteShader(f);
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    prog.u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
}
/** Wait (without blocking) until these programs have compiled, then read their uniforms. */
export async function settle(gl, progs) {
  const list = progs.filter(x => x.pending);
  const par = gl.getExtension('KHR_parallel_shader_compile');
  if (par) {
    while (list.some(x => !gl.getProgramParameter(x.p, par.COMPLETION_STATUS_KHR))) {
      if (gl.isContextLost()) throw new Error('the graphics context was lost');
      await new Promise(r => setTimeout(r, 16));
    }
  }
  list.forEach(x => finish(gl, x));
}

/** Set uniforms by name from a plain object; numbers, arrays (by length), textures as {tex, unit, target}. */
export function uniforms(gl, prog, obj) {
  for (const k in obj) {
    const loc = prog.u[k];
    if (loc === undefined || loc === null) continue;
    const v = obj[k];
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (v && v.tex !== undefined) {
      gl.activeTexture(gl.TEXTURE0 + v.unit);
      gl.bindTexture(v.target || gl.TEXTURE_2D, v.tex);
      gl.uniform1i(loc, v.unit);
    } else if (v && v.int !== undefined) gl.uniform1i(loc, v.int);
    else if (v && v.iv3) gl.uniform3iv(loc, v.iv3);
    else if (v && v.mat4) gl.uniformMatrix4fv(loc, false, v.mat4);
    else if (v && v.mat3) gl.uniformMatrix3fv(loc, false, v.mat3);
    else if (v && v.v4) gl.uniform4fv(loc, v.v4);
    else if (v && v.v3) gl.uniform3fv(loc, v.v3);
    else if (v && v.v2) gl.uniform2fv(loc, v.v2);
    else if (v && v.v1) gl.uniform1fv(loc, v.v1);
    else if (typeof v === 'boolean') gl.uniform1i(loc, v ? 1 : 0);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
    else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
  }
}

/** A mesh: attributes {name: {data, size, loc, divisor}} and optional indices. */
export function mesh(gl, attrs, indices) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bufs = {};
  for (const name in attrs) {
    const a = attrs[name];
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, a.data, gl.STATIC_DRAW);
    const size = a.size, stride = (a.stride || 0);
    if (size === 16) {
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(a.loc + i);
        gl.vertexAttribPointer(a.loc + i, 4, gl.FLOAT, false, 64, i * 16);
        if (a.divisor) gl.vertexAttribDivisor(a.loc + i, a.divisor);
      }
    } else {
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, size, gl.FLOAT, false, stride, 0);
      if (a.divisor) gl.vertexAttribDivisor(a.loc, a.divisor);
    }
    bufs[name] = b;
  }
  let count = 0, type = 0;
  if (indices) {
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const big = indices.length > 0 && Math.max(...sampleMax(indices)) > 65535;
    const arr = big ? new Uint32Array(indices) : new Uint16Array(indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    count = indices.length; type = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }
  gl.bindVertexArray(null);
  return { vao, bufs, count, type, instances: 0 };
}
function sampleMax(a) { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return [m]; }

export function texture(gl, w, h, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const internal = opts.internal || gl.RGBA8, format = opts.format || gl.RGBA, type = opts.type || gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, opts.data || null);
  const filter = opts.filter || gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  const wrap = opts.wrap || gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrapS || wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrapT || wrap);
  if (opts.mip) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

/** Framebuffer with colour attachments [{internal, format, type, filter}] and optional depth. */
export function target(gl, w, h, colours, depth = false, depthTex = false) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const tex = colours.map((c, i) => {
    const t = texture(gl, w, h, c);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    return t;
  });
  let dtex = null;
  if (depth) {
    if (depthTex) {
      dtex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, dtex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, w, h, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dtex, 0);
    } else {
      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
  }
  if (colours.length) gl.drawBuffers(colours.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  else { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete: 0x' + st.toString(16));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, dtex, w, h };
}

// ---------------------------------------------------------------------------
// Vectors (plain arrays) and column-major 4×4 matrices.
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const D2R = Math.PI / 180;

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
}
export function ortho(l, r, b, t, n, f) {
  return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);
}
/** View matrix looking along `dir` from `eye` with `up`. */
export function lookDir(eye, dir, up) {
  const f = V.norm(dir), r = V.norm(V.cross(f, up)), u = V.cross(r, f);
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -V.dot(r, eye), -V.dot(u, eye), V.dot(f, eye), 1]);
}
export function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
export function invert4(m) {
  const a = m, o = new Float32Array(16);
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  det = 1 / det;
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
  o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
  o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
  o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
  o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
  return o;
}

/** Deterministic random numbers. */
export function rng(seed) {
  let s = seed | 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

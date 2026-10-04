// Small WebGL2 helpers: programs, textures, framebuffers, full-screen passes.
// Nothing here knows about Venus.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: true, stencil: false,
    preserveDrawingBuffer: true, powerPreference: 'high-performance',
  });
  if (!gl) return null;
  const ext = {
    floatTarget: !!gl.getExtension('EXT_color_buffer_float'),
    halfTarget: !!gl.getExtension('EXT_color_buffer_half_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    parallel: !!gl.getExtension('KHR_parallel_shader_compile'),
  };
  gl.ext = ext;
  return gl;
}

// Programs are compiled and linked without asking for their status straight away.
// Asking blocks the page until the GPU process has finished compiling, and on Windows
// (Direct3D) the big shaders here take many seconds. settle() waits for them with
// KHR_parallel_shader_compile, so the page keeps painting its progress meanwhile.
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function failure(gl, p) {
  const label = p.label || 'shader';
  for (const [s, src, kind] of [[p.fsh, p.fsrc, 'fragment'], [p.vsh, p.vsrc, 'vertex']]) {
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) continue;
    const log = gl.getShaderInfoLog(s) || '';
    const lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log);
    let ctx = '';
    if (m) { const n = +m[1]; ctx = lines.slice(Math.max(0, n - 3), n + 2).map((l, i) => (n - 2 + i) + ': ' + l).join('\n'); }
    return new Error(`${label} (${kind}): ${log}\n${ctx}`);
  }
  return new Error(label + ': ' + (gl.getProgramInfoLog(p) || (gl.isContextLost() ? 'the graphics context was lost' : 'link failed')));
}

function finish(gl, p) {
  if (p.settled) return;
  p.settled = true;
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw failure(gl, p);
  gl.deleteShader(p.vsh); gl.deleteShader(p.fsh);
  p.vsh = p.fsh = p.vsrc = p.fsrc = null;
}

export function program(gl, vs, fs, label) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f);
  gl.linkProgram(p);
  Object.assign(p, { label, vsh: v, fsh: f, vsrc: vs, fsrc: fs, settled: false });
  (gl.pendingPrograms || (gl.pendingPrograms = [])).push(p);
  // cache uniform locations lazily (only after the program has settled)
  const cache = new Map();
  p.u = name => {
    if (!cache.has(name)) { finish(gl, p); cache.set(name, gl.getUniformLocation(p, name)); }
    return cache.get(name);
  };
  return p;
}

// Has this program finished compiling? (Never blocks; settles it when it has.)
export function isReady(gl, p) {
  if (p.settled) return true;
  const par = gl.getExtension('KHR_parallel_shader_compile');
  if (par && !gl.getProgramParameter(p, par.COMPLETION_STATUS_KHR)) return false;
  finish(gl, p);
  if (gl.pendingPrograms) gl.pendingPrograms = gl.pendingPrograms.filter(q => q !== p);
  return true;
}

// Wait until the given programs (default: all pending) have compiled, without blocking.
// onTick(doneCount, total) is called while waiting. Throws if one failed to build.
export async function settle(gl, list, onTick) {
  const progs = (list || gl.pendingPrograms || []).filter(p => !p.settled);
  const par = gl.getExtension('KHR_parallel_shader_compile');
  if (par) {
    for (;;) {
      if (gl.isContextLost()) throw new Error('the graphics context was lost while preparing the shaders');
      const done = progs.filter(p => gl.getProgramParameter(p, par.COMPLETION_STATUS_KHR)).length;
      onTick && onTick(done, progs.length);
      if (done === progs.length) break;
      await new Promise(r => setTimeout(r, 50));
    }
  }
  for (const p of progs) finish(gl, p);
  if (gl.pendingPrograms) gl.pendingPrograms = gl.pendingPrograms.filter(p => !p.settled);
}

// Upload helpers that tolerate missing uniforms.
export function setUniforms(gl, p, values) {
  for (const k in values) {
    const loc = p.u(k);
    if (loc === null) continue;
    const v = values[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (typeof v === 'boolean') gl.uniform1i(loc, v ? 1 : 0);
    else if (v.int !== undefined) gl.uniform1i(loc, v.int);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
    else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
    else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    else gl.uniform1fv(loc, v);
  }
}

export function texture(gl, { w, h, internal, format, type, data = null, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, mips = false }) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  t.w = w; t.h = h;
  return t;
}

// A colour target (+ optional depth) for one render pass.
export function target(gl, w, h, { internal, format, type, depth = false, filter = gl.LINEAR }) {
  const tex = texture(gl, { w, h, internal, format, type, filter });
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let depthTex = null;
  if (depth) {
    depthTex = texture(gl, { w, h, internal: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT, filter: gl.NEAREST });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, depthTex, w, h, ok };
}

export function freeTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); if (t.depthTex) gl.deleteTexture(t.depthTex);
}

export const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUV;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUV = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;

export function bindTex(gl, p, name, tex, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const loc = p.u(name);
  if (loc !== null) gl.uniform1i(loc, unit);
}

// Geometry for instanced meshes.
export function mesh(gl, { positions, normals, indices }, instanceLayout) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = (data, loc, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  };
  buf(new Float32Array(positions), 0, 3);
  buf(new Float32Array(normals), 1, 3);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  const stride = instanceLayout.reduce((s, n) => s + n, 0) * 4;
  let off = 0;
  instanceLayout.forEach((n, i) => {
    gl.enableVertexAttribArray(2 + i);
    gl.vertexAttribPointer(2 + i, n, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(2 + i, 1);
    off += n * 4;
  });
  gl.bindVertexArray(null);
  return { vao, inst, count: indices.length, stride, instances: 0, floatsPer: stride / 4 };
}

export function setInstances(gl, m, data, count) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.inst);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  m.instances = count;
}

export function drawMesh(gl, m) {
  if (!m.instances) return;
  gl.bindVertexArray(m.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, m.instances);
}

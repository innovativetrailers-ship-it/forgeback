// WebGL fragment-shader colour/exposure grading on a live video frame.
// Real-time (<16ms) — runs every animation frame while editing.

import type { LiveGradeParams } from './interactiveTypes'
import { GRADE_KEYS } from './interactiveTypes'

export const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord  = a_texCoord;
  }
`

export const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform float u_exposure;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_temperature;
  uniform float u_tint;
  uniform float u_shadows;
  uniform float u_highlights;
  uniform float u_vignette;
  varying vec2 v_texCoord;

  vec3 adjustSaturation(vec3 col, float sat) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(lum), col, sat);
  }
  vec3 adjustContrast(vec3 col, float c) {
    return clamp((col - 0.5) * (1.0 + c) + 0.5, 0.0, 1.0);
  }
  vec3 adjustTemp(vec3 col, float temp, float tint) {
    col.r += temp * 0.1;
    col.b -= temp * 0.1;
    col.g += tint * 0.05;
    return clamp(col, 0.0, 1.0);
  }
  float luminance(vec3 col) { return dot(col, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 adjustZones(vec3 col, float shadows, float highlights) {
    float lum = luminance(col);
    float s_mask = 1.0 - smoothstep(0.0, 0.4, lum);
    float h_mask = smoothstep(0.6, 1.0, lum);
    return clamp(col + s_mask * shadows * 0.15 + h_mask * highlights * 0.15, 0.0, 1.0);
  }

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    vec3 col   = color.rgb;
    col *= pow(2.0, u_exposure);
    col  = adjustZones(col, u_shadows, u_highlights);
    col  = adjustContrast(col, u_contrast);
    col  = adjustSaturation(col, u_saturation);
    col  = adjustTemp(col, u_temperature, u_tint);
    if (u_vignette > 0.0) {
      vec2 uv = v_texCoord - 0.5;
      float vig = 1.0 - u_vignette * smoothstep(0.3, 0.8, length(uv) * 1.4);
      col *= vig;
    }
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), color.a);
  }
`

export interface GradeRenderer {
  render: (params: LiveGradeParams) => void
  dispose: () => void
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

// Returns null if WebGL is unavailable or shader compilation fails, so callers
// can fall back to the ungraded video without breaking playback.
export function initGradeGL(canvas: HTMLCanvasElement, videoEl: HTMLVideoElement): GradeRenderer | null {
  const gl = canvas.getContext('webgl')
  if (!gl) return null

  let lost = false
  const onLost = (event: Event) => {
    event.preventDefault()
    lost = true
  }
  const onRestored = () => {
    lost = false
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vs || !fs) {
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }

  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)

  const quad = new Float32Array([
    -1, -1, 0, 1,   1, -1, 1, 1,   -1, 1, 0, 0,
    -1,  1, 0, 0,   1, -1, 1, 1,    1, 1, 1, 0,
  ])
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)

  const aPos = gl.getAttribLocation(prog, 'a_position')
  const aTex = gl.getAttribLocation(prog, 'a_texCoord')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(aTex)
  gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const uniforms: Record<keyof LiveGradeParams, WebGLUniformLocation | null> = {
    exposure:    gl.getUniformLocation(prog, 'u_exposure'),
    contrast:    gl.getUniformLocation(prog, 'u_contrast'),
    saturation:  gl.getUniformLocation(prog, 'u_saturation'),
    temperature: gl.getUniformLocation(prog, 'u_temperature'),
    tint:        gl.getUniformLocation(prog, 'u_tint'),
    shadows:     gl.getUniformLocation(prog, 'u_shadows'),
    highlights:  gl.getUniformLocation(prog, 'u_highlights'),
    vignette:    gl.getUniformLocation(prog, 'u_vignette'),
  }

  const render = (params: LiveGradeParams) => {
    if (lost || gl.isContextLost()) return
    if (videoEl.readyState < 2) return // no frame yet
    canvas.width  = videoEl.videoWidth  || 1920
    canvas.height = videoEl.videoHeight || 1080
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl)
    for (const k of GRADE_KEYS) {
      gl.uniform1f(uniforms[k], params[k])
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  const dispose = () => {
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
    gl.deleteTexture(tex)
    gl.deleteBuffer(buf)
    gl.deleteProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  return { render, dispose }
}

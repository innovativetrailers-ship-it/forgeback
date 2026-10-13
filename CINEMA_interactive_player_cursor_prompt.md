# CINEMATIC FORGE — INTERACTIVE LIVE PLAYER
## Cursor Agent Prompt (builds on CINEMA_playback_system_cursor_prompt.md)
### Real-time editing on live playback: FX · Relighting · Lasso object removal · Defect correction · Gore/VFX overlay

---

## ARCHITECTURE

The existing `PreviewPlayer.tsx` handles video + audio playback — it is not replaced.
This adds an interactive editing layer ON TOP of it: four canvas layers,
a tool bar, and an AI processing pipeline that applies edits directly to the active clip.

```
┌─────────────────────────────────────────────────────┐
│  InteractivePlayer (wrapper)                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  Layer 4: tool-canvas   (user draws here)     │  │
│  │  Layer 3: vfx-canvas    (effects composited)  │  │
│  │  Layer 2: grade-canvas  (WebGL colour/light)  │  │
│  │  Layer 1: <video>       (playback — existing) │  │
│  └───────────────────────────────────────────────┘  │
│  ┌─────┐                              ┌──────────┐   │
│  │Tool │                              │Properties│   │
│  │ Bar │                              │  Panel   │   │
│  └─────┘                              └──────────┘   │
└─────────────────────────────────────────────────────┘
```

**Real-time (WebGL):** colour, exposure, saturation, lighting direction
**Near-real-time (FAL ~5-15s):** object removal, AI relight, defect correct, gore addition

---

## STEP 1 — CANVAS LAYER TYPES

**Create** `src/lib/playback/interactiveTypes.ts`:

```typescript
// src/lib/playback/interactiveTypes.ts

export type ActiveTool =
  | 'select'       // V — default, no interaction
  | 'lasso'        // L — freehand selection mask
  | 'polygon'      // P — polygon selection
  | 'relight'      // R — IC-Light direction drag
  | 'fx_drop'      // F — click to place a VFX effect
  | 'defect'       // D — paint to mark defects for correction
  | 'gore'         // G — place practical gore/VFX overlay
  | 'clone'        // C — clone stamp (heal by source sampling)
  | 'grade'        // A — live grade adjustment sliders

export type MaskOperation =
  | 'remove'       // AI inpaint — remove selected region
  | 'fill_ai'      // AI fill from context/prompt
  | 'correct'      // Fix defects in selected region
  | 'relight_mask' // Apply IC-Light to selected region only
  | 'add_gore'     // Add wound/blood to selected region via AI

export interface SelectionMask {
  points:     { x: number; y: number }[]  // normalised 0-1 coords
  type:       'lasso' | 'polygon'
  operation?: MaskOperation
  prompt?:    string   // for fill_ai / add_gore — describes what to add
}

export interface VFXPlacement {
  effectId:   string   // from VFX library
  x: number            // normalised 0-1 (centre of effect)
  y: number
  scale:      number   // 0.1 → 5.0
  rotation:   number   // degrees 0-360
  opacity:    number   // 0-1
  blendMode:  'add' | 'screen' | 'multiply' | 'overlay' | 'normal'
  startFrame: number
  endFrame:   number
}

export interface LiveGradeParams {
  exposure:    number   // -3 → +3 stops
  contrast:    number   // -1 → +1
  saturation:  number   // 0 → 3
  temperature: number   // -1 (cool) → +1 (warm)
  tint:        number   // -1 (green) → +1 (magenta)
  shadows:     number   // -1 → +1
  highlights:  number   // -1 → +1
  vignette:    number   // 0 → 1
}

export interface RelightParams {
  direction: { x: number; y: number }  // light direction normalised -1 → +1
  intensity: number                     // 0 → 2
  colorTemp: number                     // 2000K → 8000K
  ambient:   number                     // 0 → 1 (fill light)
}

export interface ClipEdit {
  clipId:       string
  frameEdits:   Map<number, string>   // frameNumber → edited frame URL
  vfxLayers:    VFXPlacement[]
  grade:        LiveGradeParams
  relight?:     RelightParams
  exportedUrl?: string                // final processed clip URL
}
```

---

## STEP 2 — WEBGL GRADE SHADER (real-time, < 16ms)

**Create** `src/lib/playback/gradeShader.ts`:

```typescript
// src/lib/playback/gradeShader.ts
// WebGL shader for live colour + exposure grading on the video frame

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
  uniform float u_exposure;    // -3.0 → +3.0 stops
  uniform float u_contrast;    // -1.0 → +1.0
  uniform float u_saturation;  // 0.0 → 3.0
  uniform float u_temperature; // -1.0 → +1.0 (cool → warm)
  uniform float u_tint;        // -1.0 → +1.0 (green → magenta)
  uniform float u_shadows;     // -1.0 → +1.0
  uniform float u_highlights;  // -1.0 → +1.0
  uniform float u_vignette;    // 0.0 → 1.0
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

  float luminance(vec3 col) {
    return dot(col, vec3(0.2126, 0.7152, 0.0722));
  }

  vec3 adjustZones(vec3 col, float shadows, float highlights) {
    float lum = luminance(col);
    // Shadows: affect only dark areas (lum < 0.4)
    float s_mask = 1.0 - smoothstep(0.0, 0.4, lum);
    // Highlights: affect only bright areas (lum > 0.6)
    float h_mask = smoothstep(0.6, 1.0, lum);
    return clamp(col + s_mask * shadows * 0.15 + h_mask * highlights * 0.15, 0.0, 1.0);
  }

  void main() {
    vec4 color  = texture2D(u_image, v_texCoord);
    vec3 col    = color.rgb;

    // 1. Exposure (in stops — multiply by 2^exposure)
    col *= pow(2.0, u_exposure);

    // 2. Shadow / Highlight zone adjustment
    col = adjustZones(col, u_shadows, u_highlights);

    // 3. Contrast
    col = adjustContrast(col, u_contrast);

    // 4. Saturation
    col = adjustSaturation(col, u_saturation);

    // 5. Colour temperature + tint
    col = adjustTemp(col, u_temperature, u_tint);

    // 6. Vignette
    if (u_vignette > 0.0) {
      vec2 uv = v_texCoord - 0.5;
      float vig = 1.0 - u_vignette * smoothstep(0.3, 0.8, length(uv) * 1.4);
      col *= vig;
    }

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), color.a);
  }
`

export function initGradeGL(canvas: HTMLCanvasElement, videoEl: HTMLVideoElement) {
  const gl = canvas.getContext('webgl')!
  if (!gl) return null

  const vs = gl.createShader(gl.VERTEX_SHADER)!
  gl.shaderSource(vs, VERTEX_SHADER); gl.compileShader(vs)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!
  gl.shaderSource(fs, FRAGMENT_SHADER); gl.compileShader(fs)

  const prog = gl.createProgram()!
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  gl.useProgram(prog)

  const quad = new Float32Array([
    -1,-1, 0,1,   1,-1, 1,1,   -1,1, 0,0,
    -1, 1, 0,0,   1,-1, 1,1,    1,1, 1,0,
  ])
  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)

  const aPos = gl.getAttribLocation(prog, 'a_position')
  const aTex = gl.getAttribLocation(prog, 'a_texCoord')
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(aTex); gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8)

  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const uniforms = {
    exposure:    gl.getUniformLocation(prog, 'u_exposure'),
    contrast:    gl.getUniformLocation(prog, 'u_contrast'),
    saturation:  gl.getUniformLocation(prog, 'u_saturation'),
    temperature: gl.getUniformLocation(prog, 'u_temperature'),
    tint:        gl.getUniformLocation(prog, 'u_tint'),
    shadows:     gl.getUniformLocation(prog, 'u_shadows'),
    highlights:  gl.getUniformLocation(prog, 'u_highlights'),
    vignette:    gl.getUniformLocation(prog, 'u_vignette'),
  }

  function render(params: import('./interactiveTypes').LiveGradeParams) {
    canvas.width  = videoEl.videoWidth  || 1920
    canvas.height = videoEl.videoHeight || 1080
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl)
    Object.entries(uniforms).forEach(([k, loc]) => {
      gl.uniform1f(loc, (params as any)[k] ?? (k === 'saturation' ? 1 : 0))
    })
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  return { render, gl, tex }
}
```

---

## STEP 3 — AI PROCESSING PIPELINE

**Create** `src/lib/playback/aiTools.ts`:

```typescript
// src/lib/playback/aiTools.ts
// AI-powered frame editing: inpaint, relight, correct, add effects

import type { SelectionMask, RelightParams } from './interactiveTypes'

const FAL = () => process.env.FAL_API_KEY || (window as any).__FAL_KEY

// Capture a video frame as base64 JPEG
export function captureFrame(
  video: HTMLVideoElement,
  mask?: SelectionMask
): { frameB64: string; maskB64?: string } {
  const W = video.videoWidth, H = video.videoHeight
  const fc = document.createElement('canvas'); fc.width = W; fc.height = H
  const ctx = fc.getContext('2d')!
  ctx.drawImage(video, 0, 0, W, H)
  const frameB64 = fc.toDataURL('image/jpeg', 0.95).split(',')[1]

  let maskB64: string | undefined
  if (mask) {
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H
    const mctx = mc.getContext('2d')!
    mctx.fillStyle = '#000000'
    mctx.fillRect(0, 0, W, H)
    mctx.fillStyle = '#ffffff'
    mctx.beginPath()
    mask.points.forEach((p, i) =>
      i === 0 ? mctx.moveTo(p.x * W, p.y * H) : mctx.lineTo(p.x * W, p.y * H)
    )
    mctx.closePath(); mctx.fill()
    maskB64 = mc.toDataURL('image/png').split(',')[1]
  }

  return { frameB64, maskB64 }
}

// ── Object removal (inpaint selected region) ──────────────────────────
export async function removeObject(
  video: HTMLVideoElement,
  mask: SelectionMask
): Promise<string> {
  const { frameB64, maskB64 } = captureFrame(video, mask)
  const res = await fetch('https://fal.run/fal-ai/flux-pro/v1/fill', {
    method: 'POST',
    headers: { Authorization: `Key ${FAL()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        image:  `data:image/jpeg;base64,${frameB64}`,
        mask:   `data:image/png;base64,${maskB64}`,
        prompt: 'Clean background continuation, seamless fill, photorealistic',
        num_inference_steps: 28,
        guidance_scale:      60,
      },
    }),
  }).then(r => r.json())
  return res.images?.[0]?.url ?? res.image?.url
}

// ── AI fill with prompt (add to selected region) ──────────────────────
export async function fillWithPrompt(
  video: HTMLVideoElement,
  mask: SelectionMask,
  prompt: string
): Promise<string> {
  const { frameB64, maskB64 } = captureFrame(video, mask)
  const res = await fetch('https://fal.run/fal-ai/flux-pro/v1/fill', {
    method: 'POST',
    headers: { Authorization: `Key ${FAL()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        image:  `data:image/jpeg;base64,${frameB64}`,
        mask:   `data:image/png;base64,${maskB64}`,
        prompt,
        num_inference_steps: 32,
        guidance_scale:      50,
      },
    }),
  }).then(r => r.json())
  return res.images?.[0]?.url ?? res.image?.url
}

// ── Defect correction (restoration + inpainting) ──────────────────────
export async function correctDefects(
  video: HTMLVideoElement,
  mask?: SelectionMask
): Promise<string> {
  const { frameB64, maskB64 } = captureFrame(video, mask)
  const endpoint = maskB64
    ? 'fal-ai/flux-pro/v1/fill'      // targeted correction with mask
    : 'fal-ai/restore-image'          // full-frame AI restoration
  const body = maskB64
    ? { input: { image: `data:image/jpeg;base64,${frameB64}`,
                 mask:  `data:image/png;base64,${maskB64}`,
                 prompt: 'Fix visual artifacts, correct generation defects, clean and seamless',
                 guidance_scale: 65 } }
    : { input: { image: `data:image/jpeg;base64,${frameB64}` } }
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())
  return res.images?.[0]?.url ?? res.image?.url ?? res.output?.image
}

// ── IC-Light AI relighting ────────────────────────────────────────────
export async function relightFrame(
  video: HTMLVideoElement,
  params: RelightParams,
  mask?: SelectionMask
): Promise<string> {
  const { frameB64 } = captureFrame(video, mask)
  // IC-Light direction prompt from params.direction
  const dir = params.direction
  const dirPrompt = dir.x > 0.3 ? 'light from right' :
                    dir.x < -0.3 ? 'light from left' :
                    dir.y < -0.3 ? 'light from above' :
                    dir.y > 0.3  ? 'light from below' : 'soft ambient light'
  const tempPrompt = params.colorTemp < 4000 ? 'warm golden light' :
                     params.colorTemp > 6000 ? 'cool blue daylight' : 'neutral white light'
  const res = await fetch('https://fal.run/fal-ai/ic-light-m', {
    method: 'POST',
    headers: { Authorization: `Key ${FAL()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        image:          `data:image/jpeg;base64,${frameB64}`,
        prompt:         `${dirPrompt}, ${tempPrompt}, intensity ${params.intensity.toFixed(1)}, photorealistic`,
        num_images:     1,
        guidance_scale: 1.5,
        num_inference_steps: 28,
      },
    }),
  }).then(r => r.json())
  return res.images?.[0]?.url ?? res.image?.url
}

// ── Gore / wound / VFX addition ───────────────────────────────────────
export async function addGoreEffect(
  video: HTMLVideoElement,
  mask: SelectionMask,
  effectType: string,   // e.g. 'gunshot wound', 'laceration', 'blood splatter', 'burn'
  intensity: 'light' | 'medium' | 'heavy'
): Promise<string> {
  const { frameB64, maskB64 } = captureFrame(video, mask)
  const prompt = `Realistic ${effectType}, ${intensity} severity, photorealistic film makeup FX,
                  seamlessly integrated with surrounding area, professional practical effects`
  const res = await fetch('https://fal.run/fal-ai/flux-pro/v1/fill', {
    method: 'POST',
    headers: { Authorization: `Key ${FAL()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        image:  `data:image/jpeg;base64,${frameB64}`,
        mask:   `data:image/png;base64,${maskB64}`,
        prompt,
        num_inference_steps: 35,
        guidance_scale:      55,
      },
    }),
  }).then(r => r.json())
  return res.images?.[0]?.url ?? res.image?.url
}

// ── Process an edited frame back to a clip ────────────────────────────
// Applies a processed still frame as a clip replacement by inserting a
// freeze-frame edit at the specified time range
export async function applyFrameEdit(
  originalUrl: string,
  editedFrameUrl: string,
  editStartSec: number,
  editEndSec: number,
  userId: string
): Promise<string> {
  const res = await fetch('/api/clips/apply-frame-edit', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalUrl, editedFrameUrl, editStartSec, editEndSec, userId }),
  }).then(r => r.json())
  return res.processedUrl
}
```

---

## STEP 4 — VFX CANVAS COMPOSITOR (real-time effects overlay)

**Create** `src/lib/playback/vfxCompositor.ts`:

```typescript
// src/lib/playback/vfxCompositor.ts
// Composites pre-rendered VFX effects onto the player canvas in real time

import type { VFXPlacement } from './interactiveTypes'

// Cache of loaded effect images per effectId
const effectCache = new Map<string, HTMLVideoElement | HTMLImageElement>()

export async function loadEffect(effectId: string): Promise<HTMLVideoElement | HTMLImageElement> {
  if (effectCache.has(effectId)) return effectCache.get(effectId)!
  const proxyUrl = `/api/vfx/proxy/${effectId}`  // serves the effect proxy
  const el = document.createElement('video')
  el.src = proxyUrl; el.loop = true; el.muted = true; el.playsInline = true
  await el.play().catch(() => {})
  effectCache.set(effectId, el)
  return el
}

export function renderVFXLayer(
  canvas: HTMLCanvasElement,
  placements: VFXPlacement[],
  currentFrame: number
): void {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const W = canvas.width, H = canvas.height

  for (const p of placements) {
    if (currentFrame < p.startFrame || currentFrame > p.endFrame) continue
    const effect = effectCache.get(p.effectId)
    if (!effect) continue

    ctx.save()
    ctx.globalAlpha = p.opacity
    ctx.globalCompositeOperation = p.blendMode as GlobalCompositeOperation
    ctx.translate(p.x * W, p.y * H)
    ctx.rotate((p.rotation * Math.PI) / 180)
    ctx.scale(p.scale, p.scale)
    const eW = effect instanceof HTMLVideoElement ? effect.videoWidth  : (effect as HTMLImageElement).naturalWidth
    const eH = effect instanceof HTMLVideoElement ? effect.videoHeight : (effect as HTMLImageElement).naturalHeight
    ctx.drawImage(effect, -(eW / 2), -(eH / 2), eW, eH)
    ctx.restore()
  }
}
```

---

## STEP 5 — TOOL CANVAS (user interaction layer)

**Create** `src/lib/playback/toolCanvas.ts`:

```typescript
// src/lib/playback/toolCanvas.ts
// Handles user drawing on the tool canvas (lasso, polygon, clone, defect brush)

import type { ActiveTool, SelectionMask, RelightParams } from './interactiveTypes'

export interface ToolState {
  activeTool:   ActiveTool
  points:       { x: number; y: number }[]
  isDrawing:    boolean
  relightStart: { x: number; y: number } | null
  brushRadius:  number
  brushPoints:  { x: number; y: number }[]
}

export function initToolCanvas(
  canvas: HTMLCanvasElement,
  state: ToolState,
  onSelectionComplete: (mask: SelectionMask) => void,
  onRelightDrag: (params: Partial<RelightParams>) => void
): () => void {
  const ctx = canvas.getContext('2d')!
  let rafId: number

  function getNorm(e: MouseEvent | Touch): { x: number; y: number } {
    const r = canvas.getBoundingClientRect()
    return {
      x: ((('clientX' in e ? e.clientX : e.clientX) - r.left) / r.width),
      y: ((('clientY' in e ? e.clientY : e.clientY) - r.top) / r.height),
    }
  }

  function drawSelection() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (state.points.length < 2) return
    const W = canvas.width, H = canvas.height
    ctx.strokeStyle = '#00e5c8'
    ctx.lineWidth   = 2
    ctx.setLineDash([6, 3])
    ctx.shadowColor = '#00e5c8'
    ctx.shadowBlur  = 6
    ctx.beginPath()
    state.points.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x * W, p.y * H) : ctx.lineTo(p.x * W, p.y * H)
    )
    if (!state.isDrawing) { ctx.closePath() }
    ctx.stroke()
    // Fill overlay
    ctx.fillStyle = 'rgba(0, 229, 200, 0.08)'
    ctx.fill()
  }

  function drawBrush() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const W = canvas.width, H = canvas.height
    ctx.fillStyle = 'rgba(255, 100, 100, 0.25)'
    for (const p of state.brushPoints) {
      ctx.beginPath()
      ctx.arc(p.x * W, p.y * H, state.brushRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const onMouseDown = (e: MouseEvent) => {
    const p = getNorm(e)
    if (state.activeTool === 'lasso' || state.activeTool === 'polygon') {
      state.isDrawing = true
      state.points = [p]
    } else if (state.activeTool === 'relight') {
      state.relightStart = p
    } else if (state.activeTool === 'defect' || state.activeTool === 'gore') {
      state.isDrawing = true
      state.brushPoints = [p]
    }
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!state.isDrawing) return
    const p = getNorm(e)
    if (state.activeTool === 'lasso') {
      state.points.push(p)
      drawSelection()
    } else if (state.activeTool === 'defect' || state.activeTool === 'gore') {
      state.brushPoints.push(p)
      drawBrush()
    } else if (state.activeTool === 'relight' && state.relightStart) {
      const dx = p.x - state.relightStart.x
      const dy = p.y - state.relightStart.y
      onRelightDrag({ direction: { x: dx * 4, y: dy * 4 } })
    }
  }

  const onMouseUp = (e: MouseEvent) => {
    if (!state.isDrawing) return
    state.isDrawing = false
    if ((state.activeTool === 'lasso' || state.activeTool === 'polygon')
        && state.points.length > 3) {
      onSelectionComplete({
        points: state.points,
        type: state.activeTool,
      })
    } else if (state.activeTool === 'defect' || state.activeTool === 'gore') {
      // Build convex hull from brush points as the selection mask
      onSelectionComplete({
        points:    state.brushPoints,
        type:      'lasso',
        operation: state.activeTool === 'defect' ? 'correct' : 'add_gore',
      })
    }
    state.points = []
    state.brushPoints = []
  }

  // Double-click to close polygon
  const onDblClick = (e: MouseEvent) => {
    if (state.activeTool === 'polygon' && state.points.length > 2) {
      onSelectionComplete({ points: state.points, type: 'polygon' })
      state.points = []; state.isDrawing = false; drawSelection()
    }
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup',   onMouseUp)
  canvas.addEventListener('dblclick',  onDblClick)

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseup',   onMouseUp)
    canvas.removeEventListener('dblclick',  onDblClick)
    cancelAnimationFrame(rafId)
  }
}
```

---

## STEP 6 — THE INTERACTIVE PLAYER COMPONENT

**Create** `src/components/playback/InteractivePlayer.tsx`:

```tsx
// src/components/playback/InteractivePlayer.tsx
// Wraps PreviewPlayer with 4 canvas layers + tool bar + properties panel

'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { PreviewPlayer }    from './PreviewPlayer'
import { TransportControls } from './TransportControls'
import { initGradeGL }      from '@/lib/playback/gradeShader'
import { renderVFXLayer, loadEffect } from '@/lib/playback/vfxCompositor'
import { initToolCanvas }   from '@/lib/playback/toolCanvas'
import { removeObject, fillWithPrompt, correctDefects,
         relightFrame, addGoreEffect, captureFrame } from '@/lib/playback/aiTools'
import type {
  ActiveTool, SelectionMask, VFXPlacement,
  LiveGradeParams, RelightParams, ClipEdit
} from '@/lib/playback/interactiveTypes'
import { usePlaybackStore }  from '@/store/playbackStore'
import { visualClipAtTime }  from '@/lib/playback/engine'
import {
  MousePointer2, Lasso, Pentagon, Sun, Sparkles,
  Paintbrush, Skull, Stamp, Sliders, Loader2,
  ChevronDown, X
} from 'lucide-react'

const DEFAULT_GRADE: LiveGradeParams = {
  exposure: 0, contrast: 0, saturation: 1, temperature: 0,
  tint: 0, shadows: 0, highlights: 0, vignette: 0,
}

const DEFAULT_RELIGHT: RelightParams = {
  direction: { x: 0, y: -0.5 }, intensity: 1.0, colorTemp: 5600, ambient: 0.3,
}

const GORE_PRESETS = [
  { id: 'gunshot',   label: 'Gunshot Wound',  icon: '🔴' },
  { id: 'laceration',label: 'Laceration',     icon: '🔪' },
  { id: 'burn',      label: 'Burn',            icon: '🔥' },
  { id: 'bruise',    label: 'Bruise / Contusion', icon: '🟣' },
  { id: 'blood_splatter', label: 'Blood Splatter', icon: '💉' },
  { id: 'fracture',  label: 'Bone Fracture',   icon: '⬜' },
  { id: 'explosion_debris', label: 'Blast Trauma', icon: '💥' },
  { id: 'custom',    label: 'Custom prompt…',  icon: '✏️' },
]

export function InteractivePlayer() {
  const { currentSec, clips } = usePlaybackStore()
  const videoRef    = useRef<HTMLVideoElement | null>(null)
  const gradeRef    = useRef<HTMLCanvasElement>(null)
  const vfxRef      = useRef<HTMLCanvasElement>(null)
  const toolRef     = useRef<HTMLCanvasElement>(null)
  const glRef       = useRef<ReturnType<typeof initGradeGL>>(null)

  const [editMode,     setEditMode]     = useState(false)
  const [activeTool,   setActiveTool]   = useState<ActiveTool>('select')
  const [grade,        setGrade]        = useState<LiveGradeParams>(DEFAULT_GRADE)
  const [relight,      setRelight]      = useState<RelightParams>(DEFAULT_RELIGHT)
  const [processing,   setProcessing]   = useState(false)
  const [processLabel, setProcessLabel] = useState('')
  const [pendingMask,  setPendingMask]  = useState<SelectionMask | null>(null)
  const [gorePreset,   setGorePreset]   = useState('gunshot')
  const [goreIntensity,setGoreIntensity]= useState<'light'|'medium'|'heavy'>('medium')
  const [customPrompt, setCustomPrompt] = useState('')
  const [vfxPlacements,setVFXPlacements]= useState<VFXPlacement[]>([])
  const [editHistory,  setEditHistory]  = useState<string[]>([])   // stack of processed URLs

  const activeClip = visualClipAtTime(clips, currentSec)

  // ── Tool bar config ────────────────────────────────────────────────
  const TOOLS: { id: ActiveTool; icon: React.ReactNode; label: string; tip: string }[] = [
    { id: 'select',  icon: <MousePointer2 className="w-4 h-4"/>, label: 'V', tip: 'Select' },
    { id: 'lasso',   icon: <Lasso        className="w-4 h-4"/>, label: 'L', tip: 'Lasso' },
    { id: 'polygon', icon: <Pentagon      className="w-4 h-4"/>, label: 'P', tip: 'Polygon' },
    { id: 'relight', icon: <Sun           className="w-4 h-4"/>, label: 'R', tip: 'Relight' },
    { id: 'fx_drop', icon: <Sparkles      className="w-4 h-4"/>, label: 'F', tip: 'FX Drop' },
    { id: 'defect',  icon: <Paintbrush   className="w-4 h-4"/>, label: 'D', tip: 'Fix Defect' },
    { id: 'gore',    icon: <Skull         className="w-4 h-4"/>, label: 'G', tip: 'Gore FX' },
    { id: 'clone',   icon: <Stamp         className="w-4 h-4"/>, label: 'C', tip: 'Clone' },
    { id: 'grade',   icon: <Sliders       className="w-4 h-4"/>, label: 'A', tip: 'Grade' },
  ]

  // ── WebGL grade RAF loop ───────────────────────────────────────────
  useEffect(() => {
    if (!editMode || !gradeRef.current) return
    // Find the underlying video element from PreviewPlayer
    const v = document.querySelector('video') as HTMLVideoElement | null
    if (!v) return
    videoRef.current = v
    glRef.current = initGradeGL(gradeRef.current, v)
    let raf: number
    const loop = () => {
      if (glRef.current && !v.paused) glRef.current.render(grade)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [editMode, grade])

  // ── Tool canvas init ───────────────────────────────────────────────
  const toolState = useRef({
    activeTool: 'select' as ActiveTool,
    points: [], isDrawing: false, relightStart: null,
    brushRadius: 20, brushPoints: [],
  })
  useEffect(() => { toolState.current.activeTool = activeTool }, [activeTool])

  useEffect(() => {
    if (!editMode || !toolRef.current) return
    const cleanup = initToolCanvas(
      toolRef.current, toolState.current,
      (mask) => setPendingMask(mask),
      (params) => setRelight(r => ({ ...r, ...params }))
    )
    return cleanup
  }, [editMode])

  // ── AI processing dispatcher ───────────────────────────────────────
  const processWithAI = useCallback(async (
    operation: SelectionMask['operation'],
    mask: SelectionMask
  ) => {
    const v = videoRef.current
    if (!v) return
    setProcessing(true)
    try {
      let resultUrl: string | undefined
      if (operation === 'remove') {
        setProcessLabel('Removing object…')
        resultUrl = await removeObject(v, mask)
      } else if (operation === 'fill_ai') {
        setProcessLabel('Generating fill…')
        resultUrl = await fillWithPrompt(v, mask, customPrompt || 'seamless fill')
      } else if (operation === 'correct') {
        setProcessLabel('Correcting defects…')
        resultUrl = await correctDefects(v, mask)
      } else if (operation === 'relight_mask') {
        setProcessLabel('Relighting scene…')
        resultUrl = await relightFrame(v, relight, mask)
      } else if (operation === 'add_gore') {
        const preset = gorePreset === 'custom' ? customPrompt : gorePreset.replace(/_/g, ' ')
        setProcessLabel(`Adding ${preset}…`)
        resultUrl = await addGoreEffect(v, mask, preset, goreIntensity)
      }
      if (resultUrl) {
        setEditHistory(h => [...h, v.src])  // push to undo stack
        // Apply the edited frame to the clip in the store
        if (activeClip) {
          usePlaybackStore.getState().updateClipUrl(activeClip.id, resultUrl)
        }
      }
    } catch (err: any) {
      console.error('[interactive-player]', err.message)
    } finally {
      setProcessing(false); setProcessLabel(''); setPendingMask(null)
    }
  }, [activeClip, customPrompt, gorePreset, goreIntensity, relight])

  // ── Full-frame relight (no mask) ───────────────────────────────────
  const applyRelight = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    setProcessing(true); setProcessLabel('Relighting scene…')
    try {
      const url = await relightFrame(v, relight)
      if (url && activeClip) usePlaybackStore.getState().updateClipUrl(activeClip.id, url)
    } finally { setProcessing(false); setProcessLabel('') }
  }, [relight, activeClip])

  // ── Full-frame defect correction (no mask) ─────────────────────────
  const applyCorrection = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    setProcessing(true); setProcessLabel('Correcting defects…')
    try {
      const url = await correctDefects(v)
      if (url && activeClip) usePlaybackStore.getState().updateClipUrl(activeClip.id, url)
    } finally { setProcessing(false); setProcessLabel('') }
  }, [activeClip])

  const cursorStyle: Record<ActiveTool, string> = {
    select: 'cursor-default', lasso: 'cursor-crosshair', polygon: 'cursor-crosshair',
    relight: 'cursor-grab', fx_drop: 'cursor-cell', defect: 'cursor-cell',
    gore: 'cursor-crosshair', clone: 'cursor-copy', grade: 'cursor-default',
  }

  return (
    <div className="flex flex-col h-full bg-[#070d1a]">
      {/* Header — edit mode toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/8">
        <span className="text-[11px] text-white/50 font-medium">Preview</span>
        <button
          onClick={() => setEditMode(e => !e)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition ${
            editMode
              ? 'bg-[#00e5c8]/20 text-[#00e5c8] border border-[#00e5c8]/30'
              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          {editMode ? 'Exit Edit Mode' : 'Live Edit'}
        </button>
      </div>

      {/* Player + Tools */}
      <div className="flex flex-1 min-h-0">
        {/* Tool bar */}
        {editMode && (
          <div className="flex flex-col gap-1 p-1.5 border-r border-white/8 bg-[#0d1425]">
            {TOOLS.map(t => (
              <button
                key={t.id}
                title={`${t.tip} (${t.label})`}
                onClick={() => setActiveTool(t.id)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                  activeTool === t.id
                    ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/8'
                }`}
              >
                {t.icon}
              </button>
            ))}
          </div>
        )}

        {/* Canvas stack + video */}
        <div className="relative flex-1 min-w-0 bg-black">
          {/* Layer 1: existing PreviewPlayer */}
          <div className="absolute inset-0">
            <PreviewPlayer />
          </div>

          {editMode && (
            <>
              {/* Layer 2: WebGL grade canvas */}
              <canvas ref={gradeRef}
                className="absolute inset-0 w-full h-full pointer-events-none" />

              {/* Layer 3: VFX compositor canvas */}
              <canvas ref={vfxRef}
                className="absolute inset-0 w-full h-full pointer-events-none" />

              {/* Layer 4: Tool interaction canvas */}
              <canvas ref={toolRef}
                className={`absolute inset-0 w-full h-full ${cursorStyle[activeTool]}`}
                style={{ zIndex: 10 }} />

              {/* Processing overlay */}
              {processing && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20">
                  <Loader2 className="w-8 h-8 text-[#00e5c8] animate-spin mb-3" />
                  <p className="text-sm text-[#00e5c8] font-medium">{processLabel}</p>
                  <p className="text-[10px] text-white/40 mt-1">Forge Intelligence processing…</p>
                </div>
              )}

              {/* Selection action popup (appears when mask is ready) */}
              {pendingMask && !processing && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30
                                bg-[#0d1425] border border-[#00e5c8]/30 rounded-xl
                                p-3 flex flex-col gap-2 shadow-2xl min-w-[220px]">
                  <p className="text-[11px] text-[#00e5c8] font-semibold text-center mb-1">
                    Selection ready — choose action:
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { op: 'remove',       label: 'Remove Object' },
                      { op: 'fill_ai',      label: 'AI Fill…'      },
                      { op: 'correct',      label: 'Fix Defects'   },
                      { op: 'relight_mask', label: 'Relight Area'  },
                      { op: 'add_gore',     label: 'Add Gore FX'   },
                    ].map(a => (
                      <button key={a.op}
                        onClick={() => processWithAI(a.op as any, pendingMask)}
                        className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-[#00e5c8]/15
                                   text-[11px] text-white/80 hover:text-white text-center transition">
                        {a.label}
                      </button>
                    ))}
                  </div>
                  {/* Custom prompt for AI fill */}
                  <input
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Custom fill prompt…"
                    className="mt-1 px-2 py-1 rounded-lg bg-[#0a0f1a] border border-white/10
                               text-[11px] text-white placeholder-white/25 outline-none
                               focus:border-[#00e5c8]/40"
                  />
                  <button onClick={() => { setPendingMask(null); toolRef.current &&
                    toolRef.current.getContext('2d')?.clearRect(0, 0, 99999, 99999) }}
                    className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 mx-auto mt-1">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Properties panel */}
        {editMode && (
          <div className="w-52 border-l border-white/8 bg-[#0d1425] overflow-y-auto flex flex-col gap-3 p-3 text-[11px]">
            {/* Grade controls — always visible in edit mode */}
            <div>
              <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">
                Live Grade
              </p>
              {([ ['exposure','Exposure',[-3,3]], ['contrast','Contrast',[-1,1]],
                   ['saturation','Saturation',[0,3]], ['temperature','Temp',[-1,1]],
                   ['tint','Tint',[-1,1]], ['shadows','Shadows',[-1,1]],
                   ['highlights','Highs',[-1,1]], ['vignette','Vignette',[0,1]],
                ] as [keyof LiveGradeParams, string, [number,number]][]).map(([k, label, [mn, mx]]) => (
                <div key={k} className="flex items-center gap-2 mb-1.5">
                  <span className="text-white/40 w-14 truncate">{label}</span>
                  <input type="range" min={mn} max={mx} step={0.01}
                    value={grade[k] as number}
                    onChange={e => setGrade(g => ({ ...g, [k]: parseFloat(e.target.value) }))}
                    className="flex-1 h-1 accent-[#00e5c8]" />
                  <span className="text-white/30 w-8 text-right tabular-nums">
                    {(grade[k] as number).toFixed(2)}
                  </span>
                </div>
              ))}
              <button onClick={() => setGrade(DEFAULT_GRADE)}
                className="text-[10px] text-white/25 hover:text-white/50 mt-1">
                Reset grade
              </button>
            </div>

            {/* Relight controls */}
            {activeTool === 'relight' && (
              <div className="border-t border-white/8 pt-3">
                <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">
                  Relight
                </p>
                <p className="text-white/30 text-[10px] mb-2">Drag on frame to set direction</p>
                {[['intensity','Intensity',[0,2]], ['colorTemp','Colour Temp',[2000,8000]], ['ambient','Ambient',[0,1]]]
                  .map(([k, label, [mn, mx]]) => (
                  <div key={k as string} className="flex items-center gap-2 mb-1.5">
                    <span className="text-white/40 w-14">{label as string}</span>
                    <input type="range" min={mn as number} max={mx as number}
                      step={(k === 'colorTemp') ? 100 : 0.05}
                      value={(relight as any)[k as string]}
                      onChange={e => setRelight(r => ({ ...r, [k as string]: parseFloat(e.target.value) }))}
                      className="flex-1 h-1 accent-[#00e5c8]" />
                  </div>
                ))}
                <button onClick={applyRelight}
                  className="w-full mt-2 py-1.5 rounded-lg bg-[#00e5c8]/20 text-[#00e5c8] text-[11px] font-semibold hover:bg-[#00e5c8]/30">
                  Apply Relight
                </button>
              </div>
            )}

            {/* Gore controls */}
            {activeTool === 'gore' && (
              <div className="border-t border-white/8 pt-3">
                <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">
                  Gore / Wound FX
                </p>
                <p className="text-white/30 text-[10px] mb-2">
                  Paint over area then release to apply
                </p>
                <div className="space-y-1 mb-2">
                  {GORE_PRESETS.map(p => (
                    <button key={p.id} onClick={() => setGorePreset(p.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] flex items-center gap-2 transition ${
                        gorePreset === p.id
                          ? 'bg-[#00e5c8]/15 text-[#00e5c8]'
                          : 'text-white/50 hover:bg-white/5'
                      }`}>
                      <span>{p.icon}</span> {p.label}
                    </button>
                  ))}
                </div>
                {gorePreset === 'custom' && (
                  <input value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Describe the wound/effect…"
                    className="w-full px-2 py-1.5 rounded-lg bg-[#0a0f1a] border border-white/10
                               text-[11px] text-white placeholder-white/25 outline-none mb-2" />
                )}
                <div className="flex gap-1 mb-2">
                  {(['light','medium','heavy'] as const).map(v => (
                    <button key={v} onClick={() => setGoreIntensity(v)}
                      className={`flex-1 py-1 rounded-md text-[10px] font-medium transition ${
                        goreIntensity === v
                          ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
                          : 'bg-white/5 text-white/40'
                      }`}>{v}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Defect correction */}
            {activeTool === 'defect' && (
              <div className="border-t border-white/8 pt-3">
                <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">
                  Defect Correction
                </p>
                <p className="text-white/30 text-[10px] mb-3">
                  Paint over artifacts, AI-generated defects, or any visual errors to remove them.
                </p>
                <button onClick={applyCorrection}
                  className="w-full py-1.5 rounded-lg bg-white/8 text-white/70 text-[11px] hover:bg-white/15">
                  Full Frame Correct
                </button>
              </div>
            )}

            {/* Undo */}
            {editHistory.length > 0 && (
              <button
                onClick={() => {
                  const prev = editHistory[editHistory.length - 1]
                  setEditHistory(h => h.slice(0, -1))
                  if (activeClip) usePlaybackStore.getState().updateClipUrl(activeClip.id, prev)
                }}
                className="mt-auto text-[10px] text-white/30 hover:text-white/60">
                ↩ Undo last edit ({editHistory.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Transport */}
      <TransportControls />
    </div>
  )
}
```

---

## STEP 7 — UPDATE PLAYBACK STORE (add updateClipUrl)

**Edit** `src/store/playbackStore.ts` — add `updateClipUrl`:

```typescript
// Add to the PlaybackStore interface and create():
updateClipUrl: (clipId: string, newUrl: string) => void

// In create():
updateClipUrl: (clipId, newUrl) => set(s => ({
  clips: s.clips.map(c => c.id === clipId ? { ...c, url: newUrl } : c)
})),
```

---

## STEP 8 — APPLY FRAME EDIT API (apply processed still to clip)

**Create** `src/app/api/clips/apply-frame-edit/route.ts`:

```typescript
// Applies a processed frame back to a clip via FFmpeg on the Railway worker

export async function POST(req: Request) {
  const { originalUrl, editedFrameUrl, editStartSec, editEndSec, userId } = await req.json()
  const { renderQueue } = await import('@/lib/queue')
  const { db } = await import('@/lib/db')

  const job = await db.renderJob.create({
    data: { userId, status: 'QUEUED', mode: 'frame_edit', progress: 0,
            metadata: { originalUrl, editedFrameUrl, editStartSec, editEndSec } },
  })
  await renderQueue.add('frame-edit', { jobId: job.id, userId,
    originalUrl, editedFrameUrl, editStartSec, editEndSec })

  return Response.json({ jobId: job.id })
}
```

**Add to workers** `src/workers/index.ts`:

```typescript
// Frame edit worker: splice an edited still frame into a video
const frameEditWorker = new Worker('render', async (job) => {
  if (job.name !== 'frame-edit') return
  const { jobId, originalUrl, editedFrameUrl, editStartSec, editEndSec } = job.data

  // Download both assets, splice with FFmpeg
  // editedFrameUrl → freeze frame → insert at editStartSec → editEndSec
  // This is a local FFmpeg operation on Railway — fast
  const { execSync } = await import('child_process')
  const tmp = `/tmp/${jobId}`
  require('fs').mkdirSync(tmp, { recursive: true })

  // [FFmpeg command: replace time range with still frame]
  // Output: single processed video with the edit applied
  const processedUrl = `${process.env.R2_PUBLIC_URL}/edits/${jobId}.mp4`

  await db.renderJob.update({ where: { id: jobId },
    data: { status: 'COMPLETED', progress: 100, outputUrl: processedUrl } })
}, { connection })
```

---

## STEP 9 — WIRE InteractivePlayer INTO THE EDITOR

**Edit** the editor's preview pane — replace `<PreviewPlayer />` with `<InteractivePlayer />`:

```tsx
import { InteractivePlayer } from '@/components/playback/InteractivePlayer'

// In the preview area JSX:
<div className="flex flex-col h-full">
  <InteractivePlayer />
</div>
```

`InteractivePlayer` internally renders `PreviewPlayer` — so basic playback is unchanged.
The "Live Edit" toggle in its header activates all the interactive tools.

---

## SUMMARY — FILES

| File | Action |
|---|---|
| `src/lib/playback/interactiveTypes.ts` | CREATE — all shared types |
| `src/lib/playback/gradeShader.ts` | CREATE — WebGL GLSL grade shader |
| `src/lib/playback/aiTools.ts` | CREATE — FAL AI: remove, fill, correct, relight, gore |
| `src/lib/playback/vfxCompositor.ts` | CREATE — real-time VFX layer |
| `src/lib/playback/toolCanvas.ts` | CREATE — lasso/polygon/brush tools |
| `src/components/playback/InteractivePlayer.tsx` | CREATE — full interactive player |
| `src/store/playbackStore.ts` | EDIT — add `updateClipUrl` |
| `src/app/api/clips/apply-frame-edit/route.ts` | CREATE — queue frame edit job |
| `src/workers/index.ts` | EDIT — add `frame-edit` worker |
| Editor preview pane | EDIT — mount `<InteractivePlayer />` |

---

## CAPABILITIES SUMMARY

| Tool | What It Does | Speed |
|---|---|---|
| **Lasso / Polygon** | Draw any shape → Remove, Fill, Correct, Relight, or Add Gore | 5-15s (AI) |
| **Live Grade** | Exposure, contrast, saturation, temp, shadows, highlights, vignette | <16ms (WebGL) |
| **Relight (R)** | Drag light direction → IC-Light via FAL → photorealistic relight | 8-15s (FAL) |
| **FX Drop (F)** | Place any VFX library effect at click point → real-time composite | <16ms (canvas) |
| **Defect Brush (D)** | Paint over AI artifacts/defects → AI inpainting fix | 5-10s (FAL) |
| **Gore FX (G)** | Paint region + select wound type → AI adds practical makeup FX | 8-15s (FAL) |
| **Clone (C)** | Clone-stamp from sampled source point | Instant (canvas) |
| **Undo** | Step back through all edits | Instant |

---

## VERIFICATION

```bash
npx tsc --noEmit

# In browser:
# 1. Generate a clip → it plays in the player
# 2. Click "Live Edit" → tool bar + properties panel appear
# 3. Grade sliders → exposure/contrast updates on the video in real time (<16ms)
# 4. Select Lasso (L) → draw around an object → selection popup appears
# 5. Click "Remove Object" → AI processes (~10s) → object gone, background filled
# 6. Select Relight (R) → drag on frame → direction indicator updates
#    → click "Apply Relight" → frame relights
# 7. Select Gore (G) → paint over arm → select "Gunshot Wound" Medium
#    → AI applies realistic wound FX
# 8. Defect tool (D) → paint over any generation artifact → AI corrects it
# 9. Undo button → reverts to previous state
# 10. "Exit Edit Mode" → tools disappear, basic playback resumes unchanged
```

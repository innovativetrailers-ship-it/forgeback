// User-drawing on the tool canvas: lasso / polygon selection, defect & gore
// brush, and relight direction drag. Emits a normalised SelectionMask.

import type { ActiveTool, Point, SelectionMask, RelightParams } from './interactiveTypes'

export interface ToolState {
  activeTool:   ActiveTool
  points:       Point[]
  isDrawing:    boolean
  relightStart: Point | null
  brushRadius:  number
  brushPoints:  Point[]
}

export function createToolState(): ToolState {
  return {
    activeTool: 'select',
    points: [],
    isDrawing: false,
    relightStart: null,
    brushRadius: 20,
    brushPoints: [],
  }
}

export function initToolCanvas(
  canvas: HTMLCanvasElement,
  state: ToolState,
  onSelectionComplete: (mask: SelectionMask) => void,
  onRelightDrag: (params: Pick<RelightParams, 'direction'>) => void,
): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const getNorm = (e: MouseEvent): Point => {
    const r = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    }
  }

  const drawSelection = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (state.points.length < 2) return
    const W = canvas.width, H = canvas.height
    ctx.strokeStyle = '#00e5c8'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.shadowColor = '#00e5c8'
    ctx.shadowBlur = 6
    ctx.beginPath()
    state.points.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x * W, p.y * H) : ctx.lineTo(p.x * W, p.y * H),
    )
    if (!state.isDrawing) ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = 'rgba(0, 229, 200, 0.08)'
    ctx.fill()
  }

  const drawBrush = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const W = canvas.width, H = canvas.height
    ctx.fillStyle = 'rgba(255, 100, 100, 0.25)'
    for (const p of state.brushPoints) {
      ctx.beginPath()
      ctx.arc(p.x * W, p.y * H, state.brushRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height)

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
    if (!state.isDrawing && state.activeTool !== 'relight') return
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

  const onMouseUp = () => {
    if (state.activeTool === 'relight') { state.relightStart = null; return }
    if (!state.isDrawing) return
    state.isDrawing = false
    if ((state.activeTool === 'lasso' || state.activeTool === 'polygon') && state.points.length > 3) {
      onSelectionComplete({ points: state.points, type: state.activeTool })
    } else if (state.activeTool === 'defect' || state.activeTool === 'gore') {
      onSelectionComplete({
        points: state.brushPoints,
        type: 'lasso',
        operation: state.activeTool === 'defect' ? 'correct' : 'add_gore',
      })
    }
    state.points = []
    state.brushPoints = []
  }

  const onDblClick = () => {
    if (state.activeTool === 'polygon' && state.points.length > 2) {
      onSelectionComplete({ points: state.points, type: 'polygon' })
      state.points = []
      state.isDrawing = false
      clear()
    }
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('dblclick', onDblClick)

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('dblclick', onDblClick)
  }
}

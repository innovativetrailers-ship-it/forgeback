// Shared types for the interactive live-editing layer that sits on top of the
// existing video preview. Kept lean — only the tools that have working handlers.

export type ActiveTool =
  | 'select'   // V — default, no interaction
  | 'lasso'    // L — freehand selection mask
  | 'polygon'  // P — polygon selection
  | 'relight'  // R — IC-Light direction drag
  | 'defect'   // D — paint to mark defects for correction
  | 'gore'     // G — paint region for practical gore/wound FX
  | 'grade'    // A — live WebGL grade sliders

export type MaskOperation =
  | 'remove'       // AI inpaint — remove selected region
  | 'fill_ai'      // AI fill from prompt
  | 'correct'      // fix defects in selected region
  | 'relight_mask' // apply IC-Light relight
  | 'add_gore'     // add wound/blood via AI

export interface Point {
  x: number // normalised 0-1
  y: number
}

export interface SelectionMask {
  points:     Point[]
  type:       'lasso' | 'polygon'
  operation?: MaskOperation
  prompt?:    string
}

export interface LiveGradeParams {
  exposure:    number // -3 → +3 stops
  contrast:    number // -1 → +1
  saturation:  number // 0 → 3
  temperature: number // -1 (cool) → +1 (warm)
  tint:        number // -1 (green) → +1 (magenta)
  shadows:     number // -1 → +1
  highlights:  number // -1 → +1
  vignette:    number // 0 → 1
}

export interface RelightParams {
  direction: Point  // light direction normalised -1 → +1
  intensity: number // 0 → 2
  colorTemp: number // 2000K → 8000K
  ambient:   number // 0 → 1 (fill light)
}

export const GRADE_KEYS: (keyof LiveGradeParams)[] = [
  'exposure', 'contrast', 'saturation', 'temperature',
  'tint', 'shadows', 'highlights', 'vignette',
]

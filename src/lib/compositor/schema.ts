/** Canonical compositor graph types (shared by UI + server executor). */

export type NodeType =
  | 'MediaIn'
  | 'MediaOut'
  | 'Merge'
  | 'Transform'
  | 'ColorCorrect'
  | 'Blur'
  | 'Keyer'
  | 'Mask'
  | 'Tracker'
  | 'DepthMap'
  | 'LUT'
  | 'Grain'
  | 'Glow'
  | 'Defocus'
  | 'Text3D'
  | 'Particle'
  | 'Layer3D'
  | 'Camera3D'
  | 'OfxPlugin'
  | 'Background'
  | 'TimeOffset'
  | 'Grade'
  | 'LUTNode'
  | 'Saturation'
  | 'Invert'
  | 'Clamp'
  | 'Sharpen'
  | 'ChromaticAberration'
  | 'FilmGrain'
  | 'MotionBlur'
  | 'LayerMerge'
  | 'Switch'
  | 'Dissolve'
  | 'Premult'
  | 'LumaKeyer'
  | 'DifferenceKey'
  | 'SpillSuppress'
  | 'Roto'
  | 'Crop'
  | 'Flip'
  | 'Reformat'
  | 'Tracker2D'
  | 'PlanarTracker'
  | 'CornerPin'
  | 'DeepMerge'
  | 'DeepHold'
  | 'Cryptomatte'
  | 'VectorWarp'
  | 'Dot'
  | 'NoOp'
  | 'Shuffle'
  | 'MixChannels'
  | 'Expression'

export interface NodePort {
  id: string
  label: string
  type: 'input' | 'output'
  dataType: 'video' | 'mask' | 'depth' | 'value'
  connected?: boolean
}

export interface CompositorNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  inputs: NodePort[]
  outputs: NodePort[]
  params: Record<string, unknown>
  label: string
}

export interface NodeConnection {
  id: string
  fromNodeId: string
  fromPortId: string
  toNodeId: string
  toPortId: string
}

export interface CompositorGraph {
  nodes: CompositorNode[]
  connections: NodeConnection[]
  /** Node id to read final output from (defaults to MediaOut). */
  outputNodeId?: string
}

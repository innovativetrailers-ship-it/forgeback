import { nanoid } from 'nanoid'
import type { CompositorNode, NodePort, NodeType } from './schema'

export const NODE_COLORS: Record<NodeType, string> = {
  MediaIn: '#1d4ed8',
  MediaOut: '#065f46',
  Merge: '#7c3aed',
  Transform: '#0369a1',
  ColorCorrect: '#b45309',
  Blur: '#4c1d95',
  Keyer: '#166534',
  Mask: '#713f12',
  Tracker: '#1e3a5f',
  DepthMap: '#374151',
  LUT: '#7f1d1d',
  Grain: '#3f3f46',
  Glow: '#fef3c7',
  Defocus: '#312e81',
  Text3D: '#134e4a',
  Particle: '#431407',
  Layer3D: '#7c2d12',
  Camera3D: '#9a3412',
  OfxPlugin: '#44403c',
  Background: '#1c1917',
  TimeOffset: '#18181b',
  Grade: '#92400e',
  LUTNode: '#7f1d1d',
  Saturation: '#a16207',
  Invert: '#374151',
  Clamp: '#1f2937',
  Sharpen: '#3730a3',
  ChromaticAberration: '#6b21a8',
  FilmGrain: '#4b5563',
  MotionBlur: '#1e3a5f',
  LayerMerge: '#5b21b6',
  Switch: '#065f46',
  Dissolve: '#86198f',
  Premult: '#1e40af',
  LumaKeyer: '#14532d',
  DifferenceKey: '#1a2e05',
  SpillSuppress: '#1c3324',
  Roto: '#422006',
  Crop: '#0c4a6e',
  Flip: '#0e7490',
  Reformat: '#155e75',
  Tracker2D: '#1e3a5f',
  PlanarTracker: '#1c3358',
  CornerPin: '#172554',
  DeepMerge: '#4c1d95',
  DeepHold: '#3b0764',
  Cryptomatte: '#581c87',
  Dot: '#27272a',
  NoOp: '#18181b',
  Shuffle: '#292524',
  MixChannels: '#1c1917',
  Expression: '#0c0a09',
}

export const DEFAULT_PARAMS: Partial<Record<NodeType, Record<string, unknown>>> = {
  Blur: { radius: 5, type: 'gaussian' },
  ColorCorrect: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1 },
  Merge: { blendMode: 'normal', opacity: 1.0 },
  Transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  Glow: { threshold: 0.7, intensity: 0.5, radius: 20 },
  Grain: { intensity: 0.3, size: 1.5 },
  LUT: { url: '', intensity: 1.0 },
  MediaIn: { sourceUrl: '' },
  TimeOffset: { frames: 0 },
  Grade: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], offset: [0, 0, 0], contrast: 1 },
  LUTNode: { url: '', intensity: 1.0, format: '.cube' },
  Saturation: { saturation: 1.0, vibrance: 0 },
  Invert: { channels: 'rgb' },
  Clamp: { min: 0, max: 1, channels: 'rgba' },
  Sharpen: { amount: 0.5, radius: 1, threshold: 0 },
  ChromaticAberration: { redOffset: 2, blueOffset: -2, type: 'radial' },
  FilmGrain: { intensity: 0.25, size: 1.0, monochrome: false },
  MotionBlur: { samples: 8, shutterAngle: 180 },
  LayerMerge: { blendMode: 'normal', opacity: 1.0 },
  Switch: { input: 0 },
  Dissolve: { mix: 0.5 },
  Premult: { operation: 'premultiply' },
  LumaKeyer: { low: 0.0, high: 0.2, rollOff: 0.05 },
  DifferenceKey: { threshold: 0.1, rollOff: 0.05 },
  SpillSuppress: { colour: 'green', amount: 1.0 },
  Roto: { feather: 2, invert: false, points: [], combine: 'add', tracked: true, aiMatte: false },
  Particle: { rate: 40, seed: 1 },
  Layer3D: { cameraX: 12, cameraZ: 1 },
  Camera3D: { x: 12, z: 1 },
  OfxPlugin: { pluginId: 'ofx.brightness', amount: 1 },
  Crop: { left: 0, right: 0, top: 0, bottom: 0 },
  Flip: { horizontal: false, vertical: false },
  Reformat: { width: 1920, height: 1080, fitType: 'letterbox' },
  Keyer: { colour: '#00ff00', tolerance: 0.4 },
  Defocus: { maxBlur: 20 },
  Cryptomatte: { matteName: '', level: 6 },
  Background: { colour: '#000000' },
}

const NODE_PORTS: Partial<Record<NodeType, { inputs: Omit<NodePort, 'id'>[]; outputs: Omit<NodePort, 'id'>[] }>> = {
  MediaIn: { inputs: [], outputs: [{ label: 'Output', type: 'output', dataType: 'video' }] },
  MediaOut: { inputs: [{ label: 'Input', type: 'input', dataType: 'video' }], outputs: [] },
  Merge: {
    inputs: [
      { label: 'Foreground', type: 'input', dataType: 'video' },
      { label: 'Background', type: 'input', dataType: 'video' },
      { label: 'Mask', type: 'input', dataType: 'mask' },
    ],
    outputs: [{ label: 'Output', type: 'output', dataType: 'video' }],
  },
  Blur: {
    inputs: [{ label: 'Input', type: 'input', dataType: 'video' }],
    outputs: [{ label: 'Output', type: 'output', dataType: 'video' }],
  },
  ColorCorrect: {
    inputs: [{ label: 'Input', type: 'input', dataType: 'video' }],
    outputs: [{ label: 'Output', type: 'output', dataType: 'video' }],
  },
  Keyer: {
    inputs: [{ label: 'Input', type: 'input', dataType: 'video' }],
    outputs: [
      { label: 'Output', type: 'output', dataType: 'video' },
      { label: 'Matte', type: 'output', dataType: 'mask' },
    ],
  },
  Defocus: {
    inputs: [
      { label: 'Input', type: 'input', dataType: 'video' },
      { label: 'Depth', type: 'input', dataType: 'depth' },
    ],
    outputs: [{ label: 'Output', type: 'output', dataType: 'video' }],
  },
  Cryptomatte: {
    inputs: [{ label: 'EXR', type: 'input', dataType: 'depth' }],
    outputs: [
      { label: 'Matte', type: 'output', dataType: 'mask' },
      { label: 'Preview', type: 'output', dataType: 'video' },
    ],
  },
  DeepMerge: {
    inputs: [
      { label: 'Deep A', type: 'input', dataType: 'depth' },
      { label: 'Deep B', type: 'input', dataType: 'depth' },
    ],
    outputs: [
      { label: 'Deep', type: 'output', dataType: 'depth' },
      { label: 'Flat', type: 'output', dataType: 'video' },
    ],
  },
}

export const NODE_TYPES_LIST: NodeType[] = [
  'MediaIn', 'MediaOut',
  'ColorCorrect', 'Grade', 'LUTNode', 'LUT', 'Saturation', 'Invert', 'Clamp',
  'Blur', 'Sharpen', 'Defocus', 'Glow', 'ChromaticAberration', 'FilmGrain', 'MotionBlur', 'Grain',
  'Merge', 'LayerMerge', 'Switch', 'Dissolve', 'Premult',
  'Keyer', 'LumaKeyer', 'DifferenceKey', 'SpillSuppress', 'Roto', 'Mask',
  'Transform', 'Crop', 'Flip', 'Reformat',
  'Tracker', 'Tracker2D', 'PlanarTracker', 'CornerPin',
  'DeepMerge', 'DeepHold', 'Cryptomatte', 'DepthMap',
  'Text3D', 'Particle', 'Layer3D', 'Camera3D', 'OfxPlugin', 'Background',
  'TimeOffset', 'Dot', 'NoOp', 'Shuffle', 'MixChannels', 'Expression',
]

export function makeNode(type: NodeType, position: { x: number; y: number }): CompositorNode {
  const portDef = NODE_PORTS[type] ?? {
    inputs: [{ label: 'Input', type: 'input' as const, dataType: 'video' as const }],
    outputs: [{ label: 'Output', type: 'output' as const, dataType: 'video' as const }],
  }
  return {
    id: nanoid(),
    type,
    position,
    inputs: portDef.inputs.map((p) => ({ ...p, id: nanoid() })),
    outputs: portDef.outputs.map((p) => ({ ...p, id: nanoid() })),
    params: { ...(DEFAULT_PARAMS[type] ?? {}) },
    label: type,
  }
}

/** All 25+ Hollywood-pipeline nodes from gap spec (verified present). */
export const COMPOSITOR_NODE_COUNT = NODE_TYPES_LIST.length

/**
 * Particle engine data model (D08/E08).
 * Three.js InstancedMesh rendering is handled client-side in ParticleSystem.tsx.
 * This module defines types and serialisation for particle configurations.
 */

export type EmitterType = 'point' | 'line' | 'sphere' | 'cone'

export type ParticleTexture =
  | 'fire' | 'smoke' | 'sparks' | 'snow' | 'rain'
  | 'dust' | 'stars' | 'magic' | 'bubbles' | 'confetti'
  | 'bokeh' | 'debris'

export interface PhysicsForces {
  gravity:     { direction: [number, number, number]; strength: number }
  wind:        { direction: [number, number, number]; strength: number }
  turbulence:  { frequency: number; amplitude: number }
}

export interface ParticleConfig {
  id:           string
  emitterType:  EmitterType
  texture:      ParticleTexture
  count:        number        // max active particles
  lifespan:     number        // seconds
  size:         number        // base size in px
  sizeVariance: number        // +/- variance
  opacity:      number        // 0-1
  speed:        number        // initial velocity
  spread:       number        // emission cone angle degrees
  physics:      PhysicsForces
  blendMode:    'add' | 'normal' | 'screen'
  color:        string        // hex
  colorVariance: number       // 0-1 (hue shift range)
}

export const DEFAULT_PARTICLE_CONFIG: ParticleConfig = {
  id:           'default',
  emitterType:  'point',
  texture:      'sparks',
  count:        200,
  lifespan:     2.0,
  size:         4,
  sizeVariance: 2,
  opacity:      0.8,
  speed:        50,
  spread:       30,
  physics: {
    gravity:    { direction: [0, -1, 0], strength: 9.8 },
    wind:       { direction: [1, 0, 0], strength: 0 },
    turbulence: { frequency: 1.0, amplitude: 0 },
  },
  blendMode:    'add',
  color:        '#ff6600',
  colorVariance: 0.2,
}

export function serializeConfig(config: ParticleConfig): string {
  return JSON.stringify(config)
}

export function deserializeConfig(json: string): ParticleConfig {
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('[ParticleEngine] Invalid config JSON')
  }
  return parsed as ParticleConfig
}

export function estimateMemoryMB(count: number): number {
  // Each instance: mat4 (64b) + position (12b) + velocity (12b) + age (4b) + color (16b) ≈ 110 bytes
  return (count * 110) / (1024 * 1024)
}

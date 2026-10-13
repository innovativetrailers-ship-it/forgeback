import type { ModelControlSurface, Provider } from '../types/provider'

export type { Provider }

export interface RegistryEntry {
  falEndpoint: string
  i2vEndpoint?: string
  provider?: Provider
  isExternal?: boolean
  supportsSeed: boolean
  supportsCharRef: boolean
  /** Multi-image endpoint. Seedance and Veo read image_urls. Grok reads reference_image_urls. */
  referenceEndpoint?: string
  /** Reference-to-video accepts a video file. Wan 3.0, Seedance 2.0, and Gemini Omni. */
  videoReferenceCapable?: boolean
  control: ModelControlSurface
}

export function entryProvider(key: string, entry: RegistryEntry): Provider {
  if (entry.provider) return entry.provider
  if (entry.isExternal) {
    if (key === 'grok-imagine-video' || key.startsWith('grok')) return 'fal'
    if (key.startsWith('runway')) return 'runway'
  }
  return 'fal'
}

/**
 * Pool ids plus sealed models that are not auto-selected.
 * HappyHorse 1.0 is registered and stays out of the council until one clean generation.
 * HappyHorse 1.1 is a separate live endpoint set and is not this id.
 */
export const VIDEO_MODEL_REGISTRY: Record<string, RegistryEntry> = {
  'veo-3.1': {
    falEndpoint: 'fal-ai/veo3.1',
    i2vEndpoint: 'fal-ai/veo3.1/image-to-video',
    referenceEndpoint: 'fal-ai/veo3.1/reference-to-video',
    supportsSeed: true,
    supportsCharRef: true,
    control: {
      referenceClass: 'true_reference',
      maxReferenceImages: 3,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: true,
      referenceField: 'image_urls',
    },
  },
  'kling-3.0': {
    falEndpoint: 'fal-ai/kling-video/v3/pro/text-to-video',
    i2vEndpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    // v3 OpenAPI input has no seed. Elements are a field on image-to-video, not a separate endpoint.
    supportsSeed: false,
    supportsCharRef: true,
    control: {
      referenceClass: 'first_frame',
      maxReferenceImages: 3,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: true,
    },
  },
  'seedance-2.0': {
    falEndpoint: 'bytedance/seedance-2.0/text-to-video',
    i2vEndpoint: 'bytedance/seedance-2.0/image-to-video',
    referenceEndpoint: 'bytedance/seedance-2.0/reference-to-video',
    videoReferenceCapable: true,
    // 2.0 OpenAPI input has no seed. 2.5 reference does; 2.5 is not this pool id.
    supportsSeed: false,
    supportsCharRef: true,
    control: {
      referenceClass: 'true_reference',
      maxReferenceImages: 9,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: true,
      referenceField: 'image_urls',
    },
  },
  'runway-gen4': {
    falEndpoint: 'runway-gen4',
    provider: 'runway',
    isExternal: true,
    supportsSeed: false,
    supportsCharRef: false,
    control: {
      referenceClass: 'first_frame',
      maxReferenceImages: 0,
      firstLastFrame: false,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: false,
    },
  },
  'grok-imagine-video': {
    falEndpoint: 'xai/grok-imagine-video/v1.5/text-to-video',
    i2vEndpoint: 'xai/grok-imagine-video/v1.5/image-to-video',
    referenceEndpoint: 'xai/grok-imagine-video/v1.5/reference-to-video',
    supportsSeed: false,
    supportsCharRef: true,
    control: {
      referenceClass: 'true_reference',
      maxReferenceImages: 7,
      firstLastFrame: false,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: true,
      referenceField: 'reference_image_urls',
    },
  },
  'pixverse-v5.6': {
    falEndpoint: 'fal-ai/pixverse/v5.6/text-to-video',
    i2vEndpoint: 'fal-ai/pixverse/v5.6/image-to-video',
    supportsSeed: true,
    supportsCharRef: false,
    control: {
      referenceClass: 'none',
      maxReferenceImages: 0,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: false,
    },
  },
  'wan-2.7': {
    falEndpoint: 'fal-ai/wan/v2.7/text-to-video',
    i2vEndpoint: 'fal-ai/wan/v2.7/image-to-video',
    referenceEndpoint: 'fal-ai/wan/v2.7/reference-to-video',
    supportsSeed: true,
    supportsCharRef: true,
    control: {
      referenceClass: 'true_reference',
      maxReferenceImages: 4,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: false,
      referenceField: 'reference_image_urls',
    },
  },
  'wan-3.0': {
    falEndpoint: 'alibaba/wan-3.0/text-to-video',
    i2vEndpoint: 'alibaba/wan-3.0/image-to-video',
    referenceEndpoint: 'alibaba/wan-3.0/reference-to-video',
    videoReferenceCapable: true,
    supportsSeed: true,
    supportsCharRef: true,
    control: {
      referenceClass: 'true_reference',
      maxReferenceImages: 10,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: false,
      referenceField: 'reference_image_urls',
    },
  },
  'ltx-2.3-fast': {
    falEndpoint: 'fal-ai/ltx-2.3/text-to-video/fast',
    i2vEndpoint: 'fal-ai/ltx-2.3/image-to-video',
    supportsSeed: false,
    supportsCharRef: false,
    control: {
      referenceClass: 'first_frame',
      maxReferenceImages: 0,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: false,
    },
  },
  'hailuo-02': {
    falEndpoint: 'fal-ai/minimax/hailuo-02/pro/text-to-video',
    i2vEndpoint: 'fal-ai/minimax/hailuo-02/pro/image-to-video',
    supportsSeed: false,
    supportsCharRef: false,
    control: {
      referenceClass: 'none',
      maxReferenceImages: 0,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: false,
    },
  },
  'happyhorse-1.0': {
    falEndpoint: 'alibaba/happy-horse/text-to-video',
    i2vEndpoint: 'alibaba/happy-horse/image-to-video',
    referenceEndpoint: 'alibaba/happy-horse/reference-to-video',
    supportsSeed: true,
    supportsCharRef: true,
    control: {
      referenceClass: 'true_reference',
      maxReferenceImages: 9,
      firstLastFrame: false,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: true,
    },
  },
  'gemini-omni': {
    falEndpoint: 'google/gemini-omni-flash/v1.1/text-to-video',
    i2vEndpoint: 'google/gemini-omni-flash/v1.1/image-to-video',
    referenceEndpoint: 'google/gemini-omni-flash/v1.1/reference-to-video',
    videoReferenceCapable: true,
    supportsSeed: false,
    supportsCharRef: true,
    control: {
      referenceClass: 'true_reference',
      maxReferenceImages: 10,
      firstLastFrame: true,
      cameraControl: 'prompt_only',
      motionBrush: false,
      nativeAudio: true,
      referenceField: 'image_urls',
    },
  },
}

export const MODEL_REGISTRY_ALIASES: Record<string, string> = {
  kling: 'kling-3.0',
  'kling-pro': 'kling-3.0',
  'kling-standard': 'kling-3.0',
  seedance: 'seedance-2.0',
  veo3: 'veo-3.1',
  'veo-3': 'veo-3.1',
  'veo3.1': 'veo-3.1',
  'veo-3-1': 'veo-3.1',
  grok: 'grok-imagine-video',
  'grok-imagine': 'grok-imagine-video',
  imagine: 'grok-imagine-video',
  'grok-video': 'grok-imagine-video',
  runway: 'runway-gen4',
  'runway-gen4.5': 'runway-gen4',
  'gen4.5': 'runway-gen4',
  'gen-4.5': 'runway-gen4',
  'gen-4-5': 'runway-gen4',
  ltx: 'ltx-2.3-fast',
  'ltx-fast': 'ltx-2.3-fast',
  'ltx-2.3': 'ltx-2.3-fast',
  omni: 'gemini-omni',
  'gemini-omni-flash': 'gemini-omni',
  'omni-flash': 'gemini-omni',
  'gemini-omni-flash-1.1': 'gemini-omni',
}

const MODEL_ROLES: Record<string, string> = {
  'gemini-omni': 'QUALITY',
  'veo-3.1': 'LONG-4K',
  'kling-3.0': 'MOTION',
  'seedance-2.0': 'DIALOGUE',
  'runway-gen4': 'CONTROL',
  'grok-imagine-video': 'AUDIO-NATIVE',
  'wan-2.7': 'BUDGET',
  'ltx-2.3-fast': 'DRAFT',
  'hailuo-02': 'DRAFT',
  'pixverse-v5.6': 'STYLIZED',
}

export function modelRole(id: string): string {
  return MODEL_ROLES[id] ?? 'UNSPECIFIED'
}

export function modelTier(id: string): 'draft' | 'studio' | 'blockbuster' {
  if (id === 'ltx-2.3-fast' || id === 'hailuo-02' || id.endsWith('-fast')) return 'draft'
  if (id === 'gemini-omni' || id === 'veo-3.1' || id === 'runway-gen4') return 'blockbuster'
  return 'studio'
}

import type { ModelControlSurface, Provider } from '../types/provider';
export type { Provider };
export interface RegistryEntry {
    falEndpoint: string;
    i2vEndpoint?: string;
    provider?: Provider;
    isExternal?: boolean;
    supportsSeed: boolean;
    supportsCharRef: boolean;
    /** Multi-image endpoint. Seedance and Veo read image_urls. Grok reads reference_image_urls. */
    referenceEndpoint?: string;
    /** Reference-to-video accepts a video file. Wan 3.0, Seedance 2.0, and Gemini Omni. */
    videoReferenceCapable?: boolean;
    control: ModelControlSurface;
}
export declare function entryProvider(key: string, entry: RegistryEntry): Provider;
/**
 * Pool ids plus sealed models that are not auto-selected.
 * HappyHorse 1.0 is registered and stays out of the council until one clean generation.
 * HappyHorse 1.1 is a separate live endpoint set and is not this id.
 */
export declare const VIDEO_MODEL_REGISTRY: Record<string, RegistryEntry>;
export declare const MODEL_REGISTRY_ALIASES: Record<string, string>;
export declare function modelRole(id: string): string;
export declare function modelTier(id: string): 'draft' | 'studio' | 'blockbuster';

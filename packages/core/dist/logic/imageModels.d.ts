/**
 * Image models from OpenAPI on 2026-09-25. These are not video models.
 * fal-ai/nano-banana — 200. google/nano-banana — 404.
 * fal-ai/nano-banana/lite — 404. fal-ai/nano-banana-lite — 200.
 * fal-ai/nano-banana-2 and fal-ai/nano-banana-2/edit — 200.
 * Edit image_urls has no maxItems. The live cap is 14.
 * fal-ai/flux/dev, fal-ai/flux/schnell, and fal-ai/flux-general — 200.
 * Flux general IP-Adapter requires image_encoder_path. Character refs use the edit endpoint.
 * Seedream 5.0 ids that were probed returned 404. fal-ai/gpt-image-2 returned 200 and is not this path.
 */
export declare const NANO_BANANA = "fal-ai/nano-banana";
export declare const NANO_BANANA_LITE = "fal-ai/nano-banana-lite";
export declare const NANO_BANANA_2 = "fal-ai/nano-banana-2";
export declare const NANO_BANANA_2_EDIT = "fal-ai/nano-banana-2/edit";
export declare const FLUX_DEV = "fal-ai/flux/dev";
export declare const FLUX_SCHNELL = "fal-ai/flux/schnell";
export declare const FLUX_GENERAL = "fal-ai/flux-general";
export declare const NANO_BANANA_ASPECT: readonly ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];
export declare const NANO_BANANA_2_ASPECT: readonly ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "4:1", "1:4", "8:1", "1:8"];
export declare const NANO_BANANA_2_RESOLUTION: readonly ["0.5K", "1K", "2K", "4K"];
export declare const FLUX_IMAGE_SIZE: readonly ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];
export declare const IMAGE_REF_CAP = 14;
export declare const NANO_BANANA_PROMPT_MAX = 50000;
export type ImageModelId = 'nano-banana' | 'nano-banana-lite' | 'nano-banana-2' | 'nano-banana-2-edit' | 'flux-dev' | 'flux-schnell' | 'flux-general';
export interface ImageModelEntry {
    endpoint: string;
    maxRefs: number;
    supportsLora: boolean;
}
export declare const IMAGE_MODELS: Record<ImageModelId, ImageModelEntry>;
export type ImageUse = 'keyframe' | 'character' | 'location';
export declare function imageModelForUse(use: ImageUse, hasRefs: boolean): ImageModelId;
export declare function buildImagePayload(args: {
    model: ImageModelId;
    prompt: string;
    aspectRatio?: string;
    resolution?: string;
    imageUrls?: string[];
    numImages?: number;
    seed?: number;
    loraPath?: string;
}): {
    endpoint: string;
    input: Record<string, unknown>;
};

import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Grok Imagine video field map from OpenAPI on 2026-09-25.
 * xai/grok-imagine-video/v1.5/text-to-video, image-to-video, and reference-to-video — 200.
 * The unversioned text, image, and reference endpoints also returned 200.
 * v1.5 is the registry target: text and image accept 1080p, and reference duration goes to 15.
 * fal-ai/grok-imagine-video/text-to-video — 404.
 * xai/grok-imagine-video with no mode, and xai/grok-imagine-video/edit, are image APIs. Not video.
 * Text is prompt only. Image requires image_url and has no aspect and no last frame.
 * Reference requires reference_image_urls, max 7. Tags are <IMAGE_0>, zero-indexed.
 * The unversioned reference schema uses @Image1 and caps duration at 10. That is not this id.
 * Duration is an integer 1-15. Prompt maxLength is 4096. No seed.
 * None of the video inputs have an audio field. Native audio stays on because it cannot be switched off.
 * The direct xAI client stays retired.
 */
export declare const GROK_V15_TEXT = "xai/grok-imagine-video/v1.5/text-to-video";
export declare const GROK_V15_IMAGE = "xai/grok-imagine-video/v1.5/image-to-video";
export declare const GROK_V15_REFERENCE = "xai/grok-imagine-video/v1.5/reference-to-video";
export declare const GROK_BASE_TEXT = "xai/grok-imagine-video/text-to-video";
export declare const GROK_BASE_IMAGE = "xai/grok-imagine-video/image-to-video";
export declare const GROK_BASE_REFERENCE = "xai/grok-imagine-video/reference-to-video";
export declare const GROK_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const GROK_TEXT_RESOLUTION: readonly ["480p", "720p", "1080p"];
export declare const GROK_REFERENCE_RESOLUTION: readonly ["480p", "720p"];
export declare const GROK_ASPECT: readonly ["16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"];
export declare const GROK_PROMPT_MAX = 4096;
export declare const GROK_REFERENCE_CAP = 7;
export declare const GROK_FIELDS: FamilyFieldMap;
export declare function grokModeModel(): ModeModel;
export declare function grokDuration(seconds: number | undefined, reference?: boolean): number;
export declare function buildGrokPayload(args: {
    mode: 'text' | 'first_frame' | 'reference';
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    imageUrl?: string;
    imageUrls?: string[];
    names?: string[];
    camera?: PromptCamera | null;
}): Record<string, unknown>;

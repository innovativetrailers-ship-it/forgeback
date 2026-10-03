import type { FamilyFieldMap, Mode } from '../types/provider';
import { type DurationConstraint, type PayloadBuildOptions } from './payload';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Kling 3.0 field map from OpenAPI on 2026-09-24.
 * fal-ai/kling-video/v3/pro/text-to-video — 200.
 * fal-ai/kling-video/v3/pro/image-to-video — 200. Required start_image_url.
 *   end_image_url is optional. elements is a field on this input, not its own endpoint.
 * fal-ai/kling-video/v3/pro/elements — 404. Do not register that id.
 * fal-ai/kling-video/o3/standard/video-to-video/edit — 200. Required prompt + video_url.
 * Prompt maxLength is 2500. Duration enum is "3".."15" with no "auto".
 * No resolution field. No seed. aspect_ratio is on text-to-video only.
 * generate_audio exists and stays false on submit.
 * The schema tells the prompt to name elements as @Element1, @Element2.
 * v2.5-turbo and v2.1 ids were checked and are not pool models, so they are not registered.
 */
export declare const KLING_V3_TEXT = "fal-ai/kling-video/v3/pro/text-to-video";
export declare const KLING_V3_IMAGE = "fal-ai/kling-video/v3/pro/image-to-video";
export declare const KLING_O3_EDIT = "fal-ai/kling-video/o3/standard/video-to-video/edit";
export declare const KLING_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const KLING_DURATION: readonly ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];
/** v2.x and v1. v3/o3 use KLING_DURATION. */
export declare const KLING_V2_DURATION: readonly ["5", "10"];
export declare const KLING_ASPECT: readonly ["16:9", "9:16", "1:1"];
export declare const KLING_PROMPT_MAX = 2500;
export declare const KLING_REFERENCE_IMAGES = 3;
export declare const KLING_FIELDS: FamilyFieldMap;
export declare function klingModeModel(): ModeModel;
export interface KlingElement {
    frontal_image_url?: string;
    reference_image_urls?: string[];
    video_url?: string;
}
export interface KlingElementSource {
    frontal: string;
    angles?: string[];
    videoUrl?: string;
}
export declare function klingDurationValues(endpoint?: string): readonly string[];
export declare function klingDurationConstraint(endpoint?: string): DurationConstraint;
export declare function klingDuration(seconds: number | undefined, endpoint?: string, onClamp?: PayloadBuildOptions['onClamp']): string;
export declare function klingElements(sources: KlingElementSource[]): KlingElement[];
export declare function klingElementTags(count: number): string[];
export declare function withKlingElementTags(prompt: string, count: number): string;
export declare function buildKlingPayload(args: {
    mode: 'text' | 'first_frame' | 'first_last' | 'reference' | 'video_edit';
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    negativePrompt?: string;
    imageUrl?: string;
    endImageUrl?: string;
    videoUrl?: string;
    camera?: PromptCamera | null;
    elements?: KlingElement[];
}): Record<string, unknown>;

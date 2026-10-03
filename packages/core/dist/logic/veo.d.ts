import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Veo 3.1 field map from OpenAPI on 2026-09-24.
 * fal-ai/veo3.1 — 200. This is text. fal-ai/veo3.1/text-to-video — 404.
 * fal-ai/veo3.1/image-to-video — 200. Required prompt + image_url.
 * fal-ai/veo3.1/reference-to-video — 200. Required prompt + image_urls.
 *   Duration is const "8s". No seed. No negative_prompt. No @ tags.
 * fal-ai/veo3.1/first-last-frame-to-video — 200.
 *   Required first_frame_url + last_frame_url. Not image_url / end_image_url.
 * fal-ai/veo3.1/extend-video — 200. Required prompt + video_url.
 *   Duration is const "7s". Resolution is const "720p".
 * Prompt maxLength is 20000. Duration elsewhere is "4s" | "6s" | "8s".
 * generate_audio exists and stays false on submit.
 * auto_fix rewrites the prompt, so it is not sent.
 * Lite base and lite image, reference, and first-last returned 200.
 * Lite text-to-video and lite extend returned 404. Lite is not the pool model.
 */
export declare const VEO_TEXT = "fal-ai/veo3.1";
export declare const VEO_IMAGE = "fal-ai/veo3.1/image-to-video";
export declare const VEO_REFERENCE = "fal-ai/veo3.1/reference-to-video";
export declare const VEO_FIRST_LAST = "fal-ai/veo3.1/first-last-frame-to-video";
export declare const VEO_EXTEND = "fal-ai/veo3.1/extend-video";
export declare const VEO_LITE_VERIFIED: {
    readonly text: "fal-ai/veo3.1/lite";
    readonly first_frame: "fal-ai/veo3.1/lite/image-to-video";
    readonly reference: "fal-ai/veo3.1/lite/reference-to-video";
    readonly first_last: "fal-ai/veo3.1/lite/first-last-frame-to-video";
};
export declare const VEO_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const VEO_DURATION: readonly ["4s", "6s", "8s"];
export declare const VEO_RESOLUTION: readonly ["720p", "1080p", "4k"];
export declare const VEO_PROMPT_MAX = 20000;
export declare const VEO_REFERENCE_CAP = 3;
export declare const VEO_FIELDS: FamilyFieldMap;
export declare function veoModeModel(): ModeModel;
export declare function veoDuration(seconds: number | undefined): (typeof VEO_DURATION)[number];
export declare function buildVeoPayload(args: {
    mode: 'text' | 'first_frame' | 'first_last' | 'reference' | 'video_edit';
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    negativePrompt?: string;
    imageUrl?: string;
    endImageUrl?: string;
    videoUrl?: string;
    imageUrls?: string[];
    seed?: number;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

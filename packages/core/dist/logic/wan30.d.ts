import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Wan 3.0 field map from OpenAPI on 2026-09-24.
 * alibaba/wan-3.0/text-to-video, image-to-video, and reference-to-video — 200.
 * fal-ai/wan-3.0/text-to-video, fal-ai/wan/v3/text-to-video, and fal-ai/wan/v3.0/text-to-video — 404.
 * Prime text, image, and reference also returned 200. Prime is not this registry id.
 * Edit, extend, and text-to-image ids that were probed returned 404.
 * Wan 2.6 text ids returned 404 again. Wan 2.7 stays the pool model.
 * First frame is start_image_url. Last frame is end_image_url on the same image endpoint.
 * Reference files are reference_image_urls (max 10) and reference_video_urls (max 5).
 * There is no reference_media field and no # tag.
 * Reference videos are described as totaling at most 15 seconds. Duration is an integer 2-30.
 * Prompt maxLength is 20000. Reference prompt is optional.
 * audio defaults true and only controls whether the track is returned. Submit sends false.
 * enable_prompt_expansion defaults true and rewrites the prompt, so submit sends false.
 * enable_thinking stays omitted. enable_safety_checker stays omitted.
 * Reference mode and first/last frames are separate endpoints, so a payload never sends both.
 */
export declare const WAN30_TEXT = "alibaba/wan-3.0/text-to-video";
export declare const WAN30_IMAGE = "alibaba/wan-3.0/image-to-video";
export declare const WAN30_REFERENCE = "alibaba/wan-3.0/reference-to-video";
export declare const WAN30_PRIME_TEXT = "alibaba/wan-3.0-prime/text-to-video";
export declare const WAN30_PRIME_IMAGE = "alibaba/wan-3.0-prime/image-to-video";
export declare const WAN30_PRIME_REFERENCE = "alibaba/wan-3.0-prime/reference-to-video";
export declare const WAN30_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const WAN30_RESOLUTION: readonly ["480p", "720p", "1080p"];
export declare const WAN30_ASPECT: readonly ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"];
export declare const WAN30_PROMPT_MAX = 20000;
export declare const WAN30_IMAGE_CAP = 10;
export declare const WAN30_VIDEO_CAP = 5;
export declare const WAN30_DURATION_MIN = 2;
export declare const WAN30_DURATION_MAX = 30;
export declare const WAN30_FIELDS: FamilyFieldMap;
export declare function wan30ModeModel(): ModeModel;
export declare function wan30Duration(seconds: number | undefined): number;
export declare function buildWan30Payload(args: {
    mode: 'text' | 'first_frame' | 'first_last' | 'reference';
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    imageUrl?: string;
    endImageUrl?: string;
    imageUrls?: string[];
    videoUrls?: string[];
    seed?: number;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

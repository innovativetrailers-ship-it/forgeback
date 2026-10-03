import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Gemini Omni Flash 1.1 field map from OpenAPI on 2026-09-25.
 * google/gemini-omni-flash/v1.1/text-to-video — 200. Required prompt.
 * google/gemini-omni-flash/v1.1/image-to-video — 200. Required prompt + image_url.
 *   Optional end_image_url on the same endpoint is first-last. Not start_image_url.
 * google/gemini-omni-flash/v1.1/reference-to-video — 200. Required prompt.
 *   image_urls maxItems 10. reference_video_urls maxItems 3, each described as ≤3s.
 *   Example tags are <IMAGE_REF_0> and <VIDEO_REF_0>.
 * google/gemini-omni-flash/v1.1/edit — 200. Required prompt + video_url.
 *   Optional resolution. No duration. No aspect_ratio.
 * google/gemini-omni-flash/v1.1 (unified) — 404.
 * google/gemini-omni-flash-1.1-video-edit — 404.
 * fal-ai/gemini-omni-flash/* — 404.
 * Unversioned google/gemini-omni-flash text, image, reference, and edit returned 200
 * with a thinner schema (no 4k / end_image_url / reference videos). Not this id.
 * Omni Audio and Omni Character trainer/inference guesses all 404. They are not wired.
 * Duration is an integer 3-10, default 8. Prompt maxLength is 20000.
 * Resolution is 360p|720p|1080p|4k, default 720p. Aspect is 16:9|9:16.
 * No generate_audio field, no seed, no voice_id, no character ids.
 * Native synced audio stays on because it cannot be switched off.
 * llms.txt bills every mode $0.03/s 360p, $0.10/s 720p, $0.15/s 1080p, $0.30/s 4k.
 * This is the primary quality t2v. Veo 3.1 stays in the pool for 4K and long takes.
 */
export declare const OMNI_TEXT = "google/gemini-omni-flash/v1.1/text-to-video";
export declare const OMNI_IMAGE = "google/gemini-omni-flash/v1.1/image-to-video";
export declare const OMNI_REFERENCE = "google/gemini-omni-flash/v1.1/reference-to-video";
export declare const OMNI_EDIT = "google/gemini-omni-flash/v1.1/edit";
export declare const OMNI_BASE_TEXT = "google/gemini-omni-flash/text-to-video";
export declare const OMNI_BASE_IMAGE = "google/gemini-omni-flash/image-to-video";
export declare const OMNI_BASE_REFERENCE = "google/gemini-omni-flash/reference-to-video";
export declare const OMNI_BASE_EDIT = "google/gemini-omni-flash/edit";
export declare const OMNI_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const OMNI_RESOLUTION: readonly ["360p", "720p", "1080p", "4k"];
export declare const OMNI_ASPECT: readonly ["16:9", "9:16"];
export declare const OMNI_PROMPT_MAX = 20000;
export declare const OMNI_IMAGE_CAP = 10;
export declare const OMNI_VIDEO_CAP = 3;
export declare const OMNI_DURATION_MIN = 3;
export declare const OMNI_DURATION_MAX = 10;
export declare const OMNI_DURATION_DEFAULT = 8;
/** Guessed Omni Audio / Character / unified ids. OpenAPI 404 on 2026-09-25. Do not submit. */
export declare const OMNI_UNVERIFIED_IDS: readonly ["google/gemini-omni-flash/v1.1", "google/gemini-omni-flash-1.1-video-edit", "fal-ai/gemini-omni-flash/text-to-video", "fal-ai/gemini-omni-flash/image-to-video", "fal-ai/gemini-omni-flash/reference-to-video", "fal-ai/gemini-omni-flash/edit", "google/gemini-omni-audio", "google/gemini-omni-character", "google/gemini-omni-flash/v1.1/audio", "google/gemini-omni-flash/v1.1/character", "google/gemini-omni-flash/audio", "google/gemini-omni-flash/character"];
export declare const OMNI_FIELDS: FamilyFieldMap;
export declare function omniModeModel(): ModeModel;
export declare function omniDuration(seconds: number | undefined): number;
export type OmniPayloadMode = 'text' | 'first_frame' | 'first_last' | 'reference' | 'video_edit';
export declare function buildOmniPayload(args: {
    mode: OmniPayloadMode;
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    imageUrl?: string;
    endImageUrl?: string;
    imageUrls?: string[];
    names?: string[];
    videoUrls?: string[];
    videoUrl?: string;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

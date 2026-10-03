import type { FamilyFieldMap, Mode } from '../types/provider';
import { type DurationConstraint, type PayloadBuildOptions } from './payload';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Wan 2.7 field map from OpenAPI on 2026-09-24.
 * fal-ai/wan/v2.7/text-to-video, image-to-video, and reference-to-video — 200.
 * Every guessed Wan 2.6 id (fal-ai/wan-2.6/... and fal-ai/wan/v2.6/...) — 404.
 * 2.7 is the pool model. 2.6 is not registered.
 * Duration is an integer enum (2-15, reference 2-10). Not num_frames. Not "5s".
 * Prompt text says max 5000 characters. The property has no maxLength.
 * Negative prompt text says max 500 characters.
 * Reference files are reference_image_urls and reference_video_urls. No # tags.
 * The schema declares no maxItems; the live control cap stays 4.
 * image-to-video has no aspect_ratio. end_image_url is the last frame on that same endpoint.
 * There is no generate_audio field. audio_url is an optional file. Text-to-video
 * says that omitting it lets the model write background music. There is no off switch.
 * enable_prompt_expansion defaults true and rewrites the prompt, so submit sends false
 * on text and image-to-video. Reference has no such field.
 * fal-ai/wan/v2.7/edit — 200, but it is an image edit (image_urls, num_images), not video.
 * It is not the video_edit mode. wan/v2.7/edit without the fal-ai prefix — 404.
 * Older i2v ids (2.5 preview, 2.2-5b, 2.2-a14b, wan-pro, wan-i2v) returned 200
 * and are not pool models.
 */
export declare const WAN_TEXT = "fal-ai/wan/v2.7/text-to-video";
export declare const WAN_IMAGE = "fal-ai/wan/v2.7/image-to-video";
export declare const WAN_REFERENCE = "fal-ai/wan/v2.7/reference-to-video";
export declare const WAN_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const WAN_DURATION: readonly [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export declare const WAN_REFERENCE_DURATION: readonly [2, 3, 4, 5, 6, 7, 8, 9, 10];
export declare const WAN_RESOLUTION: readonly ["720p", "1080p"];
export declare const WAN_ASPECT: readonly ["16:9", "9:16", "1:1", "4:3", "3:4"];
export declare const WAN_PROMPT_MAX = 5000;
export declare const WAN_NEGATIVE_MAX = 500;
export declare const WAN_REFERENCE_CAP = 4;
export declare const WAN_FIELDS: FamilyFieldMap;
export declare function wanModeModel(): ModeModel;
export declare function wanDurationConstraint(reference?: boolean): DurationConstraint;
export declare function wanDuration(seconds: number | undefined, reference?: boolean, onClamp?: PayloadBuildOptions['onClamp']): number;
export declare function buildWanPayload(args: {
    mode: 'text' | 'first_frame' | 'first_last' | 'reference';
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    negativePrompt?: string;
    imageUrl?: string;
    endImageUrl?: string;
    imageUrls?: string[];
    videoUrls?: string[];
    seed?: number;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

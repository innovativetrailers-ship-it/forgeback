import type { FamilyFieldMap, Mode } from '../types/provider';
import { type DurationConstraint, type PayloadBuildOptions } from './payload';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * LTX 2.3 field map from OpenAPI on 2026-09-25.
 * fal-ai/ltx-2.3/text-to-video and image-to-video — 200.
 * fal-ai/ltx-2.3/text-to-video/fast and image-to-video/fast — 200.
 * The draft registry id stays ltx-2.3-fast. Its text endpoint is the fast one.
 * Its image endpoint stays fal-ai/ltx-2.3/image-to-video. Fast image is verified and sealed.
 * fal-ai/ltx-2.3/audio-to-video — 200 and requires audio_url. Normal shots are not routed to it.
 * multi-keyframe, reference-to-video, and ltx-2.5 text and image — 404.
 * Duration is an integer enum. Full model: 6|8|10. Fast model: 6 through 20 in steps of 2.
 * Fast durations above 10 require 25 fps and 1080p.
 * Resolution is 1080p|1440p|2160p. There is no 720p.
 * Text aspect is 16:9|9:16. Image aspect also allows auto. Last frame is end_image_url on image-to-video.
 * Prompt maxLength is 5000. No seed. No reference field.
 * generate_audio defaults true. Submit sends false.
 */
export declare const LTX_TEXT = "fal-ai/ltx-2.3/text-to-video";
export declare const LTX_IMAGE = "fal-ai/ltx-2.3/image-to-video";
export declare const LTX_FAST_TEXT = "fal-ai/ltx-2.3/text-to-video/fast";
export declare const LTX_FAST_IMAGE = "fal-ai/ltx-2.3/image-to-video/fast";
export declare const LTX_AUDIO = "fal-ai/ltx-2.3/audio-to-video";
export declare const LTX_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const LTX_DURATION: readonly [6, 8, 10];
export declare const LTX_FAST_DURATION: readonly [6, 8, 10, 12, 14, 16, 18, 20];
export declare const LTX_RESOLUTION: readonly ["1080p", "1440p", "2160p"];
export declare const LTX_ASPECT: readonly ["16:9", "9:16"];
export declare const LTX_IMAGE_ASPECT: readonly ["auto", "16:9", "9:16"];
export declare const LTX_PROMPT_MAX = 5000;
export declare const LTX_FIELDS: FamilyFieldMap;
export declare function ltxModeModel(): ModeModel;
export declare function ltxDurationConstraint(fast: boolean): DurationConstraint;
export declare function ltxDuration(seconds: number | undefined, fast: boolean, onClamp?: PayloadBuildOptions['onClamp'], endpoint?: string): number;
export type LtxPayloadKind = 'fast_text' | 'text' | 'fast_image' | 'image';
export declare function buildLtxPayload(args: {
    kind: LtxPayloadKind;
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    imageUrl?: string;
    endImageUrl?: string;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

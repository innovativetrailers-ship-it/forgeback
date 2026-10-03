import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PayloadBuildOptions } from './payload';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Hailuo 02 field map from OpenAPI on 2026-09-24.
 * fal-ai/minimax/hailuo-02/pro/text-to-video — 200. prompt maxLength 2000.
 *   No duration, resolution, seed, or audio_url.
 * fal-ai/minimax/hailuo-02/pro/image-to-video — 200. Required prompt + image_url.
 *   end_image_url is optional. No separate first-last endpoint (that id 404s).
 * fal-ai/minimax/hailuo-02/standard/text-to-video and standard/image-to-video — 200.
 * fal-ai/minimax/hailuo-02-fast/image-to-video — 200. Duration enum "6"|"10".
 *   fast text-to-video — 404. fast has no end_image_url and no resolution.
 * Reference-to-video — 404. No reference field.
 * prompt_optimizer defaults true and rewrites the prompt, so submit sends false.
 * Hailuo 2.3 pro and standard text and image returned 200. 2.3 pro has no last
 * frame and no duration. It stays off this registry id. The existing 2.3 client
 * still hits those endpoints; the sealer strips fields the schema does not list.
 * H3-style ids that were probed returned 404.
 */
export declare const HAILUO_PRO_TEXT = "fal-ai/minimax/hailuo-02/pro/text-to-video";
export declare const HAILUO_PRO_IMAGE = "fal-ai/minimax/hailuo-02/pro/image-to-video";
export declare const HAILUO_FAST_IMAGE = "fal-ai/minimax/hailuo-02-fast/image-to-video";
export declare const HAILUO_23_STANDARD_TEXT = "fal-ai/minimax/hailuo-2.3/standard/text-to-video";
export declare const HAILUO_23_STANDARD_IMAGE = "fal-ai/minimax/hailuo-2.3/standard/image-to-video";
export declare const HAILUO_23_PRO_TEXT = "fal-ai/minimax/hailuo-2.3/pro/text-to-video";
export declare const HAILUO_23_PRO_IMAGE = "fal-ai/minimax/hailuo-2.3/pro/image-to-video";
export declare const HAILUO_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const HAILUO_DURATION: readonly ["6", "10"];
export declare const HAILUO_PROMPT_MAX = 2000;
export declare const HAILUO_FIELDS: FamilyFieldMap;
export declare function hailuoModeModel(): ModeModel;
export declare function hailuoDuration(seconds: number | undefined, onClamp?: PayloadBuildOptions['onClamp']): (typeof HAILUO_DURATION)[number];
export type HailuoPayloadKind = 'pro_text' | 'pro_image' | 'fast_image' | 'standard_text' | 'standard_image';
export declare function buildHailuoPayload(args: {
    kind: HailuoPayloadKind;
    prompt: string;
    durationSec?: number;
    imageUrl?: string;
    endImageUrl?: string;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

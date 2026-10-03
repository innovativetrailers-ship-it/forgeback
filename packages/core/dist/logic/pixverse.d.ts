import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * PixVerse field map from OpenAPI on 2026-09-25.
 * fal-ai/pixverse/v5.6/text-to-video and image-to-video — 200.
 * fal-ai/pixverse/v5.6/transition — 200. Required first_image_url and end_image_url.
 * fal-ai/pixverse/v5.6/effects and reference-to-video — 404.
 * v5.5 text, image, and effects — 200. v5 and v3.5 text and image — 200.
 * v4.5 text and v4 image — 200. Those are what the old pixverse-v6 key still calls.
 * C1 text — 200 and is not this registry id. The pool stays the existing seven.
 * Duration is the string enum "5"|"8"|"10". 1080p cannot be "10".
 * Prompt and negative prompt are capped at 2048 UTF-8 bytes. There is no maxLength.
 * Audio field is generate_audio_switch. Submit sends false. There is no generate_audio.
 * thinking_type rewrites the prompt. Submit sends "disabled".
 * Image-to-video has no aspect_ratio and no last frame. There is no fusion field and no motion_mode.
 */
export declare const PIXVERSE_V56_TEXT = "fal-ai/pixverse/v5.6/text-to-video";
export declare const PIXVERSE_V56_IMAGE = "fal-ai/pixverse/v5.6/image-to-video";
export declare const PIXVERSE_V56_TRANSITION = "fal-ai/pixverse/v5.6/transition";
export declare const PIXVERSE_V55_TEXT = "fal-ai/pixverse/v5.5/text-to-video";
export declare const PIXVERSE_V55_IMAGE = "fal-ai/pixverse/v5.5/image-to-video";
export declare const PIXVERSE_V55_EFFECTS = "fal-ai/pixverse/v5.5/effects";
export declare const PIXVERSE_V45_TEXT = "fal-ai/pixverse/v4.5/text-to-video";
export declare const PIXVERSE_V4_IMAGE = "fal-ai/pixverse/v4/image-to-video";
export declare const PIXVERSE_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const PIXVERSE_DURATION: readonly ["5", "8", "10"];
export declare const PIXVERSE_RESOLUTION: readonly ["360p", "540p", "720p", "1080p"];
export declare const PIXVERSE_ASPECT: readonly ["16:9", "4:3", "1:1", "3:4", "9:16"];
export declare const PIXVERSE_PROMPT_BYTES = 2048;
export declare const PIXVERSE_FIELDS: FamilyFieldMap;
export declare function pixverseModeModel(): ModeModel;
export declare function capUtf8Bytes(text: string, maxBytes: number): string;
export declare function pixverseDuration(seconds: number | undefined, resolution: string, long?: boolean): string;
export type PixversePayloadKind = 'v56_text' | 'v56_image' | 'v56_transition' | 'v55_text' | 'v55_image' | 'v45_text' | 'v4_image';
export declare function buildPixversePayload(args: {
    kind: PixversePayloadKind;
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    imageUrl?: string;
    endImageUrl?: string;
    negativePrompt?: string;
    seed?: number;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * HappyHorse 1.0 field map from OpenAPI on 2026-09-25.
 * alibaba/happy-horse/text-to-video, image-to-video, reference-to-video, and video-edit — 200.
 * alibaba/happy-horse/v1.1/text-to-video, image-to-video, and reference-to-video — 200.
 * v1.1/video-edit — 404. v1.1 does not replace 1.0. It is not this registry id.
 * fal-ai/happy-horse/text-to-video — 200 and matches the unversioned text schema. The registry uses alibaba/.
 * Text has no image_url. Image requires image_url and has no aspect.
 * Reference files are image_urls, described as 1-9. The prompt names them character1, character2.
 * Video edit requires video_url and prompt. Reference images are reference_image_urls, up to 5, named @Image1.
 * Duration is an integer enum 3-15. There is no duration on video edit.
 * Prompt text says max 2500 characters. The property has no maxLength.
 * Text, image, and reference have no audio field. Video edit audio_setting is auto|origin.
 * Submit sends origin on an edit so the model does not regenerate the track.
 * enable_safety_checker stays omitted.
 * This id is not in the default council. It joins the routing pool only after one clean generation.
 */
export declare const HAPPYHORSE_TEXT = "alibaba/happy-horse/text-to-video";
export declare const HAPPYHORSE_IMAGE = "alibaba/happy-horse/image-to-video";
export declare const HAPPYHORSE_REFERENCE = "alibaba/happy-horse/reference-to-video";
export declare const HAPPYHORSE_EDIT = "alibaba/happy-horse/video-edit";
export declare const HAPPYHORSE_11_TEXT = "alibaba/happy-horse/v1.1/text-to-video";
export declare const HAPPYHORSE_11_IMAGE = "alibaba/happy-horse/v1.1/image-to-video";
export declare const HAPPYHORSE_11_REFERENCE = "alibaba/happy-horse/v1.1/reference-to-video";
export declare const HAPPYHORSE_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const HAPPYHORSE_DURATION: readonly [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export declare const HAPPYHORSE_RESOLUTION: readonly ["720p", "1080p"];
export declare const HAPPYHORSE_ASPECT: readonly ["16:9", "9:16", "1:1", "4:3", "3:4"];
export declare const HAPPYHORSE_PROMPT_MAX = 2500;
export declare const HAPPYHORSE_REFERENCE_CAP = 9;
export declare const HAPPYHORSE_EDIT_CAP = 5;
export declare const HAPPYHORSE_FIELDS: FamilyFieldMap;
export declare function happyhorseModeModel(): ModeModel;
export declare function happyhorseDuration(seconds: number | undefined): number;
export type HappyHorsePayloadKind = 'text' | 'first_frame' | 'reference' | 'video_edit';
export declare function buildHappyHorsePayload(args: {
    kind: HappyHorsePayloadKind;
    prompt: string;
    durationSec?: number;
    aspectRatio?: string;
    resolution?: string;
    imageUrl?: string;
    imageUrls?: string[];
    names?: string[];
    videoUrl?: string;
    seed?: number;
    camera?: PromptCamera | null;
}): Record<string, unknown>;

import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
import type { ModeModel } from './modePipeline';
/**
 * Seedance 2.0 field map from OpenAPI 200 on 2026-09-24.
 * Duration is a string enum of whole seconds ("4".."15" or "auto"), not "5s".
 * Prompt has no maxLength. The 2.0 input has no seed and no negative_prompt.
 * generate_audio exists on the schema. Live submit still forces it false.
 * Reference files are image_urls (≤9), video_urls (≤3), audio_urls (≤3), total ≤12.
 * Tags in the prompt are @ImageN / @VideoN / @AudioN.
 *
 * Seedance 2.5 text-to-video and reference-to-video also returned 200.
 * They are not the pool id. Fast variants returned 200 and are not the pool id.
 */
export declare const SEEDANCE_ENDPOINTS: Partial<Record<Mode, string>>;
export declare const SEEDANCE_25_VERIFIED: {
    readonly text: "bytedance/seedance-2.5/text-to-video";
    readonly reference: "bytedance/seedance-2.5/reference-to-video";
};
export declare const SEEDANCE_DURATION: readonly ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];
export declare const SEEDANCE_RESOLUTION: readonly ["480p", "720p", "1080p", "4k"];
export declare const SEEDANCE_ASPECT: readonly ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
export declare const SEEDANCE_CAPS: {
    readonly images: 9;
    readonly videos: 3;
    readonly audios: 3;
    readonly total: 12;
};
export declare const SEEDANCE_FIELDS: FamilyFieldMap;
export declare function seedanceModeModel(): ModeModel;
export type SeedanceImageRole = 'character' | 'location' | 'style' | 'prop';
export type SeedanceVideoRole = 'motion_ref' | 'style_ref' | 'continuation';
export type SeedanceAudioRole = 'dialogue' | 'music' | 'sfx';
export interface SeedanceImageSlot {
    tag: string;
    role: SeedanceImageRole;
    assetId: string;
    label?: string;
}
export interface SeedanceVideoSlot {
    tag: string;
    role: SeedanceVideoRole;
    assetId: string;
    label?: string;
}
export interface SeedanceAudioSlot {
    tag: string;
    role: SeedanceAudioRole;
    assetId: string;
    label?: string;
}
export interface SeedanceComposition {
    images: SeedanceImageSlot[];
    videos: SeedanceVideoSlot[];
    audios: SeedanceAudioSlot[];
}
export interface SeedanceCandidate {
    url: string;
    label?: string;
    bucket: 'image' | 'video' | 'audio';
    role: SeedanceImageRole | SeedanceVideoRole | SeedanceAudioRole;
    primary?: boolean;
}
/**
 * Pick within 9 images, 3 videos, 3 audio, and 12 total.
 * There is no per-shot angle retriever in the repo, so the primary stored
 * reference for each character is the one the caller marks primary.
 */
export declare function selectReferences(candidates: SeedanceCandidate[]): SeedanceComposition;
export declare function composeSeedanceReference(args: {
    prompt: string;
    camera?: PromptCamera | null;
    composition: SeedanceComposition;
    maxPromptChars?: number;
}): {
    prompt: string;
    image_urls: string[];
    video_urls: string[];
    audio_urls: string[];
};
export declare function seedanceDuration(seconds: number | undefined): string;
export declare function buildSeedancePayload(args: {
    mode: 'text' | 'first_frame' | 'first_last' | 'reference';
    prompt: string;
    durationSec?: number;
    imageUrl?: string;
    endImageUrl?: string;
    resolution?: string;
    aspectRatio?: string;
    camera?: PromptCamera | null;
    composition?: SeedanceComposition;
}): Record<string, unknown>;
/** Council preference. Exact-frame continuation stays on first-frame, not reference. */
export declare function prefersSeedanceReference(shot: {
    hasDialogue?: boolean;
    charactersPresent?: string[];
    locationsPresent?: string[];
    characterIds?: string[];
    locationId?: string | null;
    continueExactFrame?: boolean;
    anchorSource?: string;
    hasStyleOrMotionRef?: boolean;
}): boolean;

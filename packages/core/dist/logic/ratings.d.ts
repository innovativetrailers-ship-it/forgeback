import type { ShotPurpose } from './premiseLock';
type CostTier = 'draft' | 'standard' | 'premium';
export declare const RATING_DIMENSIONS: readonly ["character_held", "move_landed", "quality", "lipsync_natural", "motion_natural", "matched_intent"];
export type RatingDimension = (typeof RATING_DIMENSIONS)[number];
export declare const FAIL_REASONS: readonly ["character_drifted", "wrong_motion", "bad_lighting", "off_prompt", "artifacts", "content_flagged", "wrong_style", "audio_off", "other"];
export type FailReason = (typeof FAIL_REASONS)[number];
export interface ShotRating {
    shotId: string;
    model: string;
    mode?: string;
    purpose: ShotPurpose;
    score: number;
    dimension?: RatingDimension;
    worked: boolean;
    reason?: FailReason;
    note?: string;
    filmId?: string;
    sceneId?: string;
    ratedAt?: string;
}
export interface TasteProfile {
    modelPreference: Record<string, number>;
    dimensionSensitivity: Record<string, number>;
    qualityVsSpeedLean: number;
}
export declare function emptyTaste(): TasteProfile;
export declare function isFailReason(value: string): value is FailReason;
export declare function isRatingDimension(value: string): value is RatingDimension;
/** 👍 = +2, 👎 = -2. 1–5 maps onto the same scale. */
export declare function signalFromScore(score: number): number;
export declare function scoreFromThumbs(thumbs: 'up' | 'down'): number;
export declare function ratingWorked(score: number): boolean;
export declare function ratingPromptFor(purpose: ShotPurpose): string;
export declare function failReasonsFor(purpose: ShotPurpose): Array<{
    id: FailReason;
    label: string;
}>;
export declare function foldTaste(profile: TasteProfile, rating: {
    model: string;
    worked: boolean;
    reason?: string;
    score: number;
}, costTier: CostTier): TasteProfile;
export declare function tasteBoost(modelId: string, costTier: CostTier, purpose: ShotPurpose, taste: TasteProfile | undefined): number;
export {};

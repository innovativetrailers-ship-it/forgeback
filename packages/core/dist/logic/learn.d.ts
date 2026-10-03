import { type ShotPurpose } from './premiseLock';
/**
 * RLAIF learning. Behavioural (and later rating) outcomes update Layer 3
 * per (model, purpose). queryModelRAG blends this with static knowledge.
 */
export type OutcomeSource = 'behaviour' | 'rating';
export interface ShotOutcome {
    shotId?: string;
    model: string;
    mode?: string;
    purpose: ShotPurpose;
    signal: number;
    source: OutcomeSource;
    reason?: string;
}
export interface PurposeScore {
    worked: number;
    total: number;
    score: number;
}
export declare const CIRCUIT_BREAK_SCORE = 0.25;
export declare const CIRCUIT_BREAK_N = 4;
export declare const LEARNED_HALF_LIFE = 8;
export declare const RATING_ALPHA = 0.55;
export declare const BEHAVIOUR_SIGNAL: Record<string, number>;
/** OR-05 reasons map onto a purpose so a penalty is not universal. */
export declare const RATING_REASON_PURPOSE: Record<string, ShotPurpose>;
export declare function purposeForRatingReason(reason: string | undefined, fallback: ShotPurpose): ShotPurpose;
export declare function signalForKind(kind: string, source?: OutcomeSource): number;
export declare function unitScore(signal: number): number;
export declare function learnedBlendWeight(n: number): number;
export declare function isCircuitOpen(cell: PurposeScore): boolean;
export declare function applyOutcome(cell: PurposeScore, signal: number, source?: OutcomeSource): PurposeScore;
export declare function emptyPurposeScore(): PurposeScore;

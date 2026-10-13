export declare const QUALITY_VERDICTS: readonly ["pass", "soft_fail", "fail"];
export type QualityVerdict = (typeof QUALITY_VERDICTS)[number];
export declare const QUALITY_SOURCES: readonly ["vision", "rating"];
export type QualitySource = (typeof QUALITY_SOURCES)[number];
export declare const QUALITY_DIMENSIONS: readonly ["character_drifted", "camera", "location", "off_prompt", "artifacts", "unexplained"];
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];
export interface QualityIntent {
    prompt: string;
    characterIds?: string[];
    cameraIntent?: string;
    locationId?: string | null;
}
export interface QualityChecks {
    onIntent: boolean;
    characterMatch?: number;
    cameraMatch?: boolean;
    locationMatch?: number;
    artifacts: boolean;
}
export interface QualityCheck {
    shotId?: string;
    model?: string;
    purpose?: string;
    intent: QualityIntent;
    checks: QualityChecks;
    verdict: QualityVerdict;
    reason?: string;
    dimension?: QualityDimension;
}
export declare function isQualityVerdict(value: string): value is QualityVerdict;
export declare function isQualitySource(value: string): value is QualitySource;
export declare function isQualityDimension(value: string): value is QualityDimension;
/** Cosine in 0–1. Empty or mismatched vectors return 0. */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/**
 * Numeric first pass when both embeddings exist (reference vs output face).
 * Undefined when either vector is missing — Vision is then the live check.
 */
export declare function firstPassCharacterMatch(referenceEmbedding: number[] | undefined, outputEmbedding: number[] | undefined): number | undefined;
export declare function blendCharacterMatch(visionMatch: number | undefined, numericMatch: number | undefined): number | undefined;
export declare function verdictFromChecks(checks: QualityChecks): QualityVerdict;
export declare function dimensionFromChecks(checks: QualityChecks): QualityDimension;
export declare function reasonFromChecks(checks: QualityChecks, verdict: QualityVerdict): string | undefined;
export declare function qualityCheckFromChecks(checks: QualityChecks, intent: QualityIntent, meta?: {
    shotId?: string;
    model?: string;
    purpose?: string;
    reason?: string;
}): QualityCheck;
export declare function isUnexplainedQuality(verdict: QualityVerdict, reason?: string | null): boolean;
export declare function qualityPassed(verdict: QualityVerdict): boolean;
/** Map a QualityCheck onto the legacy Job-4 / chain score shape. */
export declare function qualityScoreFromCheck(check: QualityCheck): {
    overall: number;
    facialFidelity: number;
    motionSmoothness: number;
    artifactLevel: number;
    passed: boolean;
};
export declare function dimensionFromRatingReason(reason: string | undefined): QualityDimension;

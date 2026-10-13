"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUALITY_DIMENSIONS = exports.QUALITY_SOURCES = exports.QUALITY_VERDICTS = void 0;
exports.isQualityVerdict = isQualityVerdict;
exports.isQualitySource = isQualitySource;
exports.isQualityDimension = isQualityDimension;
exports.cosineSimilarity = cosineSimilarity;
exports.firstPassCharacterMatch = firstPassCharacterMatch;
exports.blendCharacterMatch = blendCharacterMatch;
exports.verdictFromChecks = verdictFromChecks;
exports.dimensionFromChecks = dimensionFromChecks;
exports.reasonFromChecks = reasonFromChecks;
exports.qualityCheckFromChecks = qualityCheckFromChecks;
exports.isUnexplainedQuality = isUnexplainedQuality;
exports.qualityPassed = qualityPassed;
exports.qualityScoreFromCheck = qualityScoreFromCheck;
exports.dimensionFromRatingReason = dimensionFromRatingReason;
exports.QUALITY_VERDICTS = ['pass', 'soft_fail', 'fail'];
exports.QUALITY_SOURCES = ['vision', 'rating'];
exports.QUALITY_DIMENSIONS = [
    'character_drifted',
    'camera',
    'location',
    'off_prompt',
    'artifacts',
    'unexplained',
];
const FAIL_CHARACTER = 0.4;
const SOFT_CHARACTER = 0.7;
const FAIL_LOCATION = 0.4;
const SOFT_LOCATION = 0.7;
function isQualityVerdict(value) {
    return exports.QUALITY_VERDICTS.includes(value);
}
function isQualitySource(value) {
    return exports.QUALITY_SOURCES.includes(value);
}
function isQualityDimension(value) {
    return exports.QUALITY_DIMENSIONS.includes(value);
}
/** Cosine in 0–1. Empty or mismatched vectors return 0. */
function cosineSimilarity(a, b) {
    if (a.length === 0 || a.length !== b.length)
        return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    if (denom === 0)
        return 0;
    return Math.max(0, Math.min(1, dot / denom));
}
/**
 * Numeric first pass when both embeddings exist (reference vs output face).
 * Undefined when either vector is missing — Vision is then the live check.
 */
function firstPassCharacterMatch(referenceEmbedding, outputEmbedding) {
    if (!referenceEmbedding?.length || !outputEmbedding?.length)
        return undefined;
    if (referenceEmbedding.length !== outputEmbedding.length)
        return undefined;
    return cosineSimilarity(referenceEmbedding, outputEmbedding);
}
function blendCharacterMatch(visionMatch, numericMatch) {
    if (numericMatch == null)
        return visionMatch;
    if (visionMatch == null)
        return numericMatch;
    return Math.min(visionMatch, numericMatch);
}
function verdictFromChecks(checks) {
    const character = checks.characterMatch;
    const location = checks.locationMatch;
    if (!checks.onIntent || checks.artifacts)
        return 'fail';
    if (character != null && character < FAIL_CHARACTER)
        return 'fail';
    if (location != null && location < FAIL_LOCATION)
        return 'fail';
    if (checks.cameraMatch === false)
        return 'soft_fail';
    if (character != null && character < SOFT_CHARACTER)
        return 'soft_fail';
    if (location != null && location < SOFT_LOCATION)
        return 'soft_fail';
    return 'pass';
}
function dimensionFromChecks(checks) {
    if (checks.characterMatch != null && checks.characterMatch < SOFT_CHARACTER)
        return 'character_drifted';
    if (checks.cameraMatch === false)
        return 'camera';
    if (checks.locationMatch != null && checks.locationMatch < SOFT_LOCATION)
        return 'location';
    if (!checks.onIntent)
        return 'off_prompt';
    if (checks.artifacts)
        return 'artifacts';
    return 'unexplained';
}
function reasonFromChecks(checks, verdict) {
    if (verdict === 'pass')
        return undefined;
    if (checks.characterMatch != null && checks.characterMatch < SOFT_CHARACTER) {
        return `character face drifted (${checks.characterMatch.toFixed(2)})`;
    }
    if (checks.cameraMatch === false)
        return 'camera static, requested move did not land';
    if (checks.locationMatch != null && checks.locationMatch < SOFT_LOCATION) {
        return `location mismatch (${checks.locationMatch.toFixed(2)})`;
    }
    if (!checks.onIntent)
        return 'output is off prompt';
    if (checks.artifacts)
        return 'warping/jitter/degradation';
    return undefined;
}
function qualityCheckFromChecks(checks, intent, meta) {
    const verdict = verdictFromChecks(checks);
    const reason = verdict === 'pass' ? undefined : (meta?.reason?.trim() || reasonFromChecks(checks, verdict));
    const dimension = verdict === 'pass' ? undefined : (reason ? dimensionFromChecks(checks) : 'unexplained');
    return {
        shotId: meta?.shotId,
        model: meta?.model,
        purpose: meta?.purpose,
        intent,
        checks,
        verdict,
        reason,
        dimension,
    };
}
function isUnexplainedQuality(verdict, reason) {
    return verdict !== 'pass' && !reason?.trim();
}
function qualityPassed(verdict) {
    return verdict === 'pass';
}
/** Map a QualityCheck onto the legacy Job-4 / chain score shape. */
function qualityScoreFromCheck(check) {
    const c = check.checks;
    const facial = c.characterMatch ?? (c.onIntent ? 0.85 : 0.4);
    const motion = c.cameraMatch === false ? 0.4 : 0.85;
    const artifactLevel = c.artifacts ? 0.3 : 0.9;
    const location = c.locationMatch ?? 0.85;
    const overall = ((c.onIntent ? 0.9 : 0.3) + facial + motion + artifactLevel + location) / 5;
    return {
        overall,
        facialFidelity: facial,
        motionSmoothness: motion,
        artifactLevel,
        passed: qualityPassed(check.verdict),
    };
}
function dimensionFromRatingReason(reason) {
    if (reason === 'character_drifted')
        return 'character_drifted';
    if (reason === 'wrong_motion')
        return 'camera';
    if (reason === 'off_prompt')
        return 'off_prompt';
    if (reason === 'artifacts')
        return 'artifacts';
    if (reason === 'bad_lighting' || reason === 'wrong_style')
        return 'location';
    return 'unexplained';
}
//# sourceMappingURL=qualityNet.js.map
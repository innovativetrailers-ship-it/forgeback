"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAIL_REASONS = exports.RATING_DIMENSIONS = void 0;
exports.emptyTaste = emptyTaste;
exports.isFailReason = isFailReason;
exports.isRatingDimension = isRatingDimension;
exports.signalFromScore = signalFromScore;
exports.scoreFromThumbs = scoreFromThumbs;
exports.ratingWorked = ratingWorked;
exports.ratingPromptFor = ratingPromptFor;
exports.failReasonsFor = failReasonsFor;
exports.foldTaste = foldTaste;
exports.tasteBoost = tasteBoost;
exports.RATING_DIMENSIONS = [
    'character_held',
    'move_landed',
    'quality',
    'lipsync_natural',
    'motion_natural',
    'matched_intent',
];
exports.FAIL_REASONS = [
    'character_drifted',
    'wrong_motion',
    'bad_lighting',
    'off_prompt',
    'artifacts',
    'content_flagged',
    'wrong_style',
    'audio_off',
    'other',
];
function emptyTaste() {
    return { modelPreference: {}, dimensionSensitivity: {}, qualityVsSpeedLean: 0 };
}
function isFailReason(value) {
    return exports.FAIL_REASONS.includes(value);
}
function isRatingDimension(value) {
    return exports.RATING_DIMENSIONS.includes(value);
}
/** 👍 = +2, 👎 = -2. 1–5 maps onto the same scale. */
function signalFromScore(score) {
    const clamped = Math.max(1, Math.min(5, Math.round(score)));
    return clamped - 3;
}
function scoreFromThumbs(thumbs) {
    return thumbs === 'up' ? 5 : 1;
}
function ratingWorked(score) {
    return score >= 4;
}
function ratingPromptFor(purpose) {
    switch (purpose) {
        case 'consistency':
            return 'Did the character look consistent?';
        case 'camera':
            return 'Did the camera move land?';
        case 'dialogue':
            return 'Did the speech feel natural?';
        case 'motion':
            return 'Did the motion look right?';
        case 'continuity':
            return 'Did this continue the previous shot?';
        case 'hero':
            return 'Did this shot match the intent?';
        case 'draft':
            return 'Was this draft usable?';
        case 'stylized':
            return 'Did the stylized look land?';
        default:
            return 'Was this shot usable?';
    }
}
function failReasonsFor(purpose) {
    const extra = [
        { id: 'off_prompt', label: 'Off prompt' },
        { id: 'artifacts', label: 'Artifacts' },
        { id: 'other', label: 'Other' },
    ];
    const primary = {
        consistency: [{ id: 'character_drifted', label: 'Character drifted' }],
        camera: [{ id: 'wrong_motion', label: "Move didn't land" }],
        dialogue: [{ id: 'audio_off', label: 'Audio off' }],
        motion: [{ id: 'wrong_motion', label: 'Wrong motion' }],
        continuity: [{ id: 'other', label: "Didn't continue" }],
        hero: [{ id: 'off_prompt', label: 'Missed the intent' }],
        fill: [{ id: 'bad_lighting', label: 'Bad lighting' }, { id: 'wrong_style', label: 'Wrong style' }],
        draft: [{ id: 'artifacts', label: 'Too rough' }],
        stylized: [{ id: 'wrong_style', label: 'Wrong style' }],
    };
    const seen = new Set();
    return [...(primary[purpose] ?? []), ...extra].filter((chip) => {
        if (seen.has(chip.id))
            return false;
        seen.add(chip.id);
        return true;
    });
}
function foldTaste(profile, rating, costTier) {
    const next = {
        modelPreference: { ...profile.modelPreference },
        dimensionSensitivity: { ...profile.dimensionSensitivity },
        qualityVsSpeedLean: profile.qualityVsSpeedLean,
    };
    const delta = rating.worked ? 1 : -1;
    next.modelPreference[rating.model] = (next.modelPreference[rating.model] ?? 0) + delta;
    if (rating.reason) {
        next.dimensionSensitivity[rating.reason] = (next.dimensionSensitivity[rating.reason] ?? 0) + (rating.worked ? 0 : 1);
    }
    if (!rating.worked && costTier === 'premium')
        next.qualityVsSpeedLean -= 0.25;
    if (!rating.worked && costTier === 'draft')
        next.qualityVsSpeedLean += 0.25;
    if (rating.worked && costTier === 'premium')
        next.qualityVsSpeedLean += 0.1;
    if (rating.worked && costTier === 'draft')
        next.qualityVsSpeedLean -= 0.1;
    next.qualityVsSpeedLean = Math.max(-1, Math.min(1, next.qualityVsSpeedLean));
    return next;
}
function tasteBoost(modelId, costTier, purpose, taste) {
    if (!taste)
        return 0;
    const pref = taste.modelPreference[modelId] ?? 0;
    const prefNorm = Math.max(-1, Math.min(1, pref / 4));
    const tierSign = costTier === 'premium' ? 1 : costTier === 'draft' ? -1 : 0;
    const lean = taste.qualityVsSpeedLean * tierSign * 0.1;
    const sensitivity = purpose === 'consistency'
        ? (taste.dimensionSensitivity.character_drifted ?? 0) * 0.03
        : purpose === 'motion'
            ? (taste.dimensionSensitivity.wrong_motion ?? 0) * 0.03
            : purpose === 'dialogue'
                ? (taste.dimensionSensitivity.audio_off ?? 0) * 0.03
                : 0;
    return prefNorm * 0.2 + lean + Math.min(0.15, sensitivity);
}
//# sourceMappingURL=ratings.js.map
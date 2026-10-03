"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATING_REASON_PURPOSE = exports.BEHAVIOUR_SIGNAL = exports.RATING_ALPHA = exports.LEARNED_HALF_LIFE = exports.CIRCUIT_BREAK_N = exports.CIRCUIT_BREAK_SCORE = void 0;
exports.purposeForRatingReason = purposeForRatingReason;
exports.signalForKind = signalForKind;
exports.unitScore = unitScore;
exports.learnedBlendWeight = learnedBlendWeight;
exports.isCircuitOpen = isCircuitOpen;
exports.applyOutcome = applyOutcome;
exports.emptyPurposeScore = emptyPurposeScore;
const premiseLock_1 = require("./premiseLock");
exports.CIRCUIT_BREAK_SCORE = 0.25;
exports.CIRCUIT_BREAK_N = 4;
exports.LEARNED_HALF_LIFE = 8;
exports.RATING_ALPHA = 0.55;
exports.BEHAVIOUR_SIGNAL = {
    export: 1,
    exported: 1,
    kept: 1,
    regenerate: -1,
    regenerated: -1,
    approved_at_gate: 0.5,
    failed: -1,
    watch_complete: 0.5,
    watched_through: 0.5,
    discard: -0.5,
    discarded: -0.5,
    thumbs_up: 0.8,
    thumbs_down: -0.8,
};
/** OR-05 reasons map onto a purpose so a penalty is not universal. */
exports.RATING_REASON_PURPOSE = {
    character_drifted: 'consistency',
    identity_break: 'consistency',
    face_inconsistent: 'consistency',
    wrong_motion: 'motion',
    motion_fail: 'motion',
    camera_miss: 'camera',
    framing: 'camera',
    audio_miss: 'dialogue',
    lip_sync: 'dialogue',
    audio_off: 'dialogue',
    continuity_break: 'continuity',
    cut_jump: 'continuity',
    bad_lighting: 'fill',
    off_prompt: 'hero',
    artifacts: 'hero',
    content_flagged: 'draft',
    wrong_style: 'fill',
};
function purposeForRatingReason(reason, fallback) {
    if (!reason)
        return fallback;
    const mapped = exports.RATING_REASON_PURPOSE[reason];
    if (mapped)
        return mapped;
    if ((0, premiseLock_1.isShotPurpose)(reason))
        return reason;
    return fallback;
}
function signalForKind(kind, source = 'behaviour') {
    if (source === 'rating') {
        if (kind === 'thumbs_up' || kind === 'up')
            return 2;
        if (kind === 'thumbs_down' || kind === 'down')
            return -2;
        const n = Number(kind);
        if (Number.isFinite(n) && n >= 1 && n <= 5)
            return n - 3;
    }
    return exports.BEHAVIOUR_SIGNAL[kind] ?? 0;
}
function unitScore(signal) {
    return Math.max(0, Math.min(1, (signal + 1) / 2));
}
function learnedBlendWeight(n) {
    if (n <= 0)
        return 0;
    return n / (n + exports.LEARNED_HALF_LIFE);
}
function isCircuitOpen(cell) {
    return cell.total >= exports.CIRCUIT_BREAK_N && cell.score < exports.CIRCUIT_BREAK_SCORE;
}
function applyOutcome(cell, signal, source = 'behaviour') {
    const sample = unitScore(signal);
    const n = cell.total + 1;
    const alpha = source === 'rating' ? exports.RATING_ALPHA : Math.max(0.3, 1 / n);
    const prior = cell.total > 0 ? cell.score : 0.5;
    const score = Number((alpha * sample + (1 - alpha) * prior).toFixed(4));
    return {
        worked: cell.worked + (signal > 0 ? 1 : 0),
        total: n,
        score,
    };
}
function emptyPurposeScore() {
    return { worked: 0, total: 0, score: 0 };
}
//# sourceMappingURL=learn.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAILUO_FIELDS = exports.HAILUO_PROMPT_MAX = exports.HAILUO_DURATION = exports.HAILUO_ENDPOINTS = exports.HAILUO_23_PRO_IMAGE = exports.HAILUO_23_PRO_TEXT = exports.HAILUO_23_STANDARD_IMAGE = exports.HAILUO_23_STANDARD_TEXT = exports.HAILUO_FAST_IMAGE = exports.HAILUO_PRO_IMAGE = exports.HAILUO_PRO_TEXT = void 0;
exports.hailuoModeModel = hailuoModeModel;
exports.hailuoDuration = hailuoDuration;
exports.buildHailuoPayload = buildHailuoPayload;
const payload_1 = require("./payload");
const identity_1 = require("./identity");
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
exports.HAILUO_PRO_TEXT = 'fal-ai/minimax/hailuo-02/pro/text-to-video';
exports.HAILUO_PRO_IMAGE = 'fal-ai/minimax/hailuo-02/pro/image-to-video';
exports.HAILUO_FAST_IMAGE = 'fal-ai/minimax/hailuo-02-fast/image-to-video';
exports.HAILUO_23_STANDARD_TEXT = 'fal-ai/minimax/hailuo-2.3/standard/text-to-video';
exports.HAILUO_23_STANDARD_IMAGE = 'fal-ai/minimax/hailuo-2.3/standard/image-to-video';
exports.HAILUO_23_PRO_TEXT = 'fal-ai/minimax/hailuo-2.3/pro/text-to-video';
exports.HAILUO_23_PRO_IMAGE = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video';
exports.HAILUO_ENDPOINTS = {
    text: exports.HAILUO_PRO_TEXT,
    first_frame: exports.HAILUO_PRO_IMAGE,
    first_last: exports.HAILUO_PRO_IMAGE,
};
exports.HAILUO_DURATION = ['6', '10'];
exports.HAILUO_PROMPT_MAX = 2000;
exports.HAILUO_FIELDS = {
    firstFrame: 'image_url',
    lastFrame: 'end_image_url',
    references: { mode: 'field', max: 0 },
    duration: { field: 'duration', kind: 'enum', values: [...exports.HAILUO_DURATION] },
    audio: { field: 'audio_url', kind: 'native_always' },
    resolution: { field: 'resolution', values: ['512P', '768P'] },
};
function hailuoModeModel() {
    return {
        id: 'hailuo-02',
        provider: 'fal',
        endpoints: exports.HAILUO_ENDPOINTS,
        fields: exports.HAILUO_FIELDS,
        limits: { maxPromptChars: exports.HAILUO_PROMPT_MAX },
        nativeAudio: false,
    };
}
function hailuoDuration(seconds, onClamp = payload_1.logPayloadClamp) {
    const picked = seconds == null || !Number.isFinite(seconds) || Math.round(seconds) <= 6
        ? exports.HAILUO_DURATION[0]
        : exports.HAILUO_DURATION[1];
    onClamp?.('duration', seconds, picked, 'fal-ai/minimax/hailuo-02-fast/image-to-video');
    return picked;
}
function hailuoPrompt(prompt, camera) {
    const line = (0, identity_1.cameraSentence)(camera)?.trim() ?? '';
    return (0, identity_1.capPromptText)([prompt.trim(), line].filter(Boolean).join(' '), exports.HAILUO_PROMPT_MAX);
}
function buildHailuoPayload(args) {
    const prompt = hailuoPrompt(args.prompt, args.camera);
    if (prompt.length < 3)
        throw new payload_1.PayloadError('hailuo shot has no prompt');
    const base = { prompt, prompt_optimizer: false };
    if (args.kind === 'pro_text' || args.kind === 'standard_text') {
        if (args.kind === 'pro_text')
            return base;
        return { ...base, duration: hailuoDuration(args.durationSec) };
    }
    const imageUrl = args.imageUrl?.trim();
    if (!imageUrl)
        throw new payload_1.PayloadError('hailuo image-to-video requires image_url');
    if (args.kind === 'fast_image') {
        return { ...base, image_url: imageUrl, duration: hailuoDuration(args.durationSec) };
    }
    if (args.kind === 'standard_image') {
        return { ...base, image_url: imageUrl, duration: hailuoDuration(args.durationSec) };
    }
    const payload = { ...base, image_url: imageUrl };
    const endImageUrl = args.endImageUrl?.trim();
    if (endImageUrl)
        payload.end_image_url = endImageUrl;
    return payload;
}
//# sourceMappingURL=hailuo.js.map
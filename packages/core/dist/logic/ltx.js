"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LTX_FIELDS = exports.LTX_PROMPT_MAX = exports.LTX_IMAGE_ASPECT = exports.LTX_ASPECT = exports.LTX_RESOLUTION = exports.LTX_FAST_DURATION = exports.LTX_DURATION = exports.LTX_ENDPOINTS = exports.LTX_AUDIO = exports.LTX_FAST_IMAGE = exports.LTX_FAST_TEXT = exports.LTX_IMAGE = exports.LTX_TEXT = void 0;
exports.ltxModeModel = ltxModeModel;
exports.ltxDurationConstraint = ltxDurationConstraint;
exports.ltxDuration = ltxDuration;
exports.buildLtxPayload = buildLtxPayload;
const payload_1 = require("./payload");
const identity_1 = require("./identity");
/**
 * LTX 2.3 field map from OpenAPI on 2026-09-25.
 * fal-ai/ltx-2.3/text-to-video and image-to-video — 200.
 * fal-ai/ltx-2.3/text-to-video/fast and image-to-video/fast — 200.
 * The draft registry id stays ltx-2.3-fast. Its text endpoint is the fast one.
 * Its image endpoint stays fal-ai/ltx-2.3/image-to-video. Fast image is verified and sealed.
 * fal-ai/ltx-2.3/audio-to-video — 200 and requires audio_url. Normal shots are not routed to it.
 * multi-keyframe, reference-to-video, and ltx-2.5 text and image — 404.
 * Duration is an integer enum. Full model: 6|8|10. Fast model: 6 through 20 in steps of 2.
 * Fast durations above 10 require 25 fps and 1080p.
 * Resolution is 1080p|1440p|2160p. There is no 720p.
 * Text aspect is 16:9|9:16. Image aspect also allows auto. Last frame is end_image_url on image-to-video.
 * Prompt maxLength is 5000. No seed. No reference field.
 * generate_audio defaults true. Submit sends false.
 */
exports.LTX_TEXT = 'fal-ai/ltx-2.3/text-to-video';
exports.LTX_IMAGE = 'fal-ai/ltx-2.3/image-to-video';
exports.LTX_FAST_TEXT = 'fal-ai/ltx-2.3/text-to-video/fast';
exports.LTX_FAST_IMAGE = 'fal-ai/ltx-2.3/image-to-video/fast';
exports.LTX_AUDIO = 'fal-ai/ltx-2.3/audio-to-video';
exports.LTX_ENDPOINTS = {
    text: exports.LTX_FAST_TEXT,
    first_frame: exports.LTX_IMAGE,
    first_last: exports.LTX_IMAGE,
};
exports.LTX_DURATION = [6, 8, 10];
exports.LTX_FAST_DURATION = [6, 8, 10, 12, 14, 16, 18, 20];
exports.LTX_RESOLUTION = ['1080p', '1440p', '2160p'];
exports.LTX_ASPECT = ['16:9', '9:16'];
exports.LTX_IMAGE_ASPECT = ['auto', '16:9', '9:16'];
exports.LTX_PROMPT_MAX = 5000;
exports.LTX_FIELDS = {
    firstFrame: 'image_url',
    lastFrame: 'end_image_url',
    references: { mode: 'field', max: 0 },
    duration: { field: 'duration', kind: 'enum', values: [...exports.LTX_FAST_DURATION] },
    audio: { field: 'generate_audio', kind: 'bool' },
    resolution: { field: 'resolution', values: [...exports.LTX_RESOLUTION] },
    aspect: { field: 'aspect_ratio', values: [...exports.LTX_ASPECT] },
};
function ltxModeModel() {
    return {
        id: 'ltx-2.3-fast',
        provider: 'fal',
        endpoints: exports.LTX_ENDPOINTS,
        fields: exports.LTX_FIELDS,
        limits: { maxPromptChars: exports.LTX_PROMPT_MAX },
        nativeAudio: false,
    };
}
function ltxDurationConstraint(fast) {
    return { shape: 'set', values: fast ? exports.LTX_FAST_DURATION : exports.LTX_DURATION, fallback: 6 };
}
function ltxDuration(seconds, fast, onClamp = payload_1.logPayloadClamp, endpoint) {
    return Number((0, payload_1.clampDuration)(seconds, ltxDurationConstraint(fast), endpoint ?? (fast ? exports.LTX_FAST_TEXT : exports.LTX_TEXT), onClamp));
}
function snap(value, allowed, fallback) {
    if (value && allowed.includes(value))
        return value;
    return fallback;
}
function ltxPrompt(prompt, camera) {
    const line = (0, identity_1.cameraSentence)(camera)?.trim() ?? '';
    const scene = prompt.trim();
    const cameraLine = line && !scene.includes('Camera:') ? line : '';
    return (0, identity_1.capPromptText)([scene, cameraLine].filter(Boolean).join(' '), exports.LTX_PROMPT_MAX);
}
function buildLtxPayload(args) {
    const prompt = ltxPrompt(args.prompt, args.camera);
    if (prompt.length < 1)
        throw new payload_1.PayloadError('ltx shot has no prompt');
    const fast = args.kind.startsWith('fast_');
    const duration = ltxDuration(args.durationSec, fast);
    const long = fast && duration > 10;
    const resolution = long ? '1080p' : snap(args.resolution, exports.LTX_RESOLUTION, '1080p');
    const payload = {
        prompt,
        duration,
        resolution,
        generate_audio: false,
    };
    if (long)
        payload.fps = 25;
    const image = args.kind === 'fast_image' || args.kind === 'image';
    if (!image) {
        payload.aspect_ratio = snap(args.aspectRatio, exports.LTX_ASPECT, '16:9');
        return payload;
    }
    const imageUrl = args.imageUrl?.trim();
    if (!imageUrl)
        throw new payload_1.PayloadError('ltx image-to-video requires image_url');
    payload.image_url = imageUrl;
    payload.aspect_ratio = snap(args.aspectRatio, exports.LTX_IMAGE_ASPECT, 'auto');
    const endImageUrl = args.endImageUrl?.trim();
    if (endImageUrl)
        payload.end_image_url = endImageUrl;
    return payload;
}
//# sourceMappingURL=ltx.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIXVERSE_FIELDS = exports.PIXVERSE_PROMPT_BYTES = exports.PIXVERSE_ASPECT = exports.PIXVERSE_RESOLUTION = exports.PIXVERSE_DURATION = exports.PIXVERSE_ENDPOINTS = exports.PIXVERSE_V4_IMAGE = exports.PIXVERSE_V45_TEXT = exports.PIXVERSE_V55_EFFECTS = exports.PIXVERSE_V55_IMAGE = exports.PIXVERSE_V55_TEXT = exports.PIXVERSE_V56_TRANSITION = exports.PIXVERSE_V56_IMAGE = exports.PIXVERSE_V56_TEXT = void 0;
exports.pixverseModeModel = pixverseModeModel;
exports.capUtf8Bytes = capUtf8Bytes;
exports.pixverseDuration = pixverseDuration;
exports.buildPixversePayload = buildPixversePayload;
const payload_1 = require("./payload");
const identity_1 = require("./identity");
/**
 * PixVerse field map from OpenAPI on 2026-09-25.
 * fal-ai/pixverse/v5.6/text-to-video and image-to-video — 200.
 * fal-ai/pixverse/v5.6/transition — 200. Required first_image_url and end_image_url.
 * fal-ai/pixverse/v5.6/effects and reference-to-video — 404.
 * v5.5 text, image, and effects — 200. v5 and v3.5 text and image — 200.
 * v4.5 text and v4 image — 200. Those are what the old pixverse-v6 key still calls.
 * C1 text — 200 and is not this registry id. The pool stays the existing seven.
 * Duration is the string enum "5"|"8"|"10". 1080p cannot be "10".
 * Prompt and negative prompt are capped at 2048 UTF-8 bytes. There is no maxLength.
 * Audio field is generate_audio_switch. Submit sends false. There is no generate_audio.
 * thinking_type rewrites the prompt. Submit sends "disabled".
 * Image-to-video has no aspect_ratio and no last frame. There is no fusion field and no motion_mode.
 */
exports.PIXVERSE_V56_TEXT = 'fal-ai/pixverse/v5.6/text-to-video';
exports.PIXVERSE_V56_IMAGE = 'fal-ai/pixverse/v5.6/image-to-video';
exports.PIXVERSE_V56_TRANSITION = 'fal-ai/pixverse/v5.6/transition';
exports.PIXVERSE_V55_TEXT = 'fal-ai/pixverse/v5.5/text-to-video';
exports.PIXVERSE_V55_IMAGE = 'fal-ai/pixverse/v5.5/image-to-video';
exports.PIXVERSE_V55_EFFECTS = 'fal-ai/pixverse/v5.5/effects';
exports.PIXVERSE_V45_TEXT = 'fal-ai/pixverse/v4.5/text-to-video';
exports.PIXVERSE_V4_IMAGE = 'fal-ai/pixverse/v4/image-to-video';
exports.PIXVERSE_ENDPOINTS = {
    text: exports.PIXVERSE_V56_TEXT,
    first_frame: exports.PIXVERSE_V56_IMAGE,
    first_last: exports.PIXVERSE_V56_TRANSITION,
};
exports.PIXVERSE_DURATION = ['5', '8', '10'];
exports.PIXVERSE_RESOLUTION = ['360p', '540p', '720p', '1080p'];
exports.PIXVERSE_ASPECT = ['16:9', '4:3', '1:1', '3:4', '9:16'];
exports.PIXVERSE_PROMPT_BYTES = 2048;
exports.PIXVERSE_FIELDS = {
    firstFrame: 'image_url',
    firstFrameForLast: 'first_image_url',
    lastFrame: 'end_image_url',
    references: { mode: 'field', max: 0 },
    duration: { field: 'duration', kind: 'enum', values: [...exports.PIXVERSE_DURATION] },
    audio: { field: 'generate_audio_switch', kind: 'switch' },
    resolution: { field: 'resolution', values: [...exports.PIXVERSE_RESOLUTION] },
    aspect: { field: 'aspect_ratio', values: [...exports.PIXVERSE_ASPECT] },
    negative: 'negative_prompt',
    seed: 'seed',
};
function pixverseModeModel() {
    return {
        id: 'pixverse-v5.6',
        provider: 'fal',
        endpoints: exports.PIXVERSE_ENDPOINTS,
        fields: exports.PIXVERSE_FIELDS,
        limits: { maxPromptChars: exports.PIXVERSE_PROMPT_BYTES },
        nativeAudio: false,
    };
}
function capUtf8Bytes(text, maxBytes) {
    const trimmed = text.trim();
    if (Buffer.byteLength(trimmed, 'utf8') <= maxBytes)
        return trimmed;
    let low = 0;
    let high = trimmed.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (Buffer.byteLength(trimmed.slice(0, mid), 'utf8') <= maxBytes)
            low = mid;
        else
            high = mid - 1;
    }
    const slice = trimmed.slice(0, low);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace >= Math.floor(slice.length * 0.6)) {
        const word = slice.slice(0, lastSpace).trim();
        if (word && Buffer.byteLength(word, 'utf8') <= maxBytes)
            return word;
    }
    return slice.trim();
}
function nearestDuration(seconds, allowed) {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0)
        return allowed[0];
    const target = Math.round(seconds);
    let best = allowed[0];
    let distance = Infinity;
    for (const value of allowed) {
        const n = Number(value);
        const gap = Math.abs(n - target);
        if (gap < distance || (gap === distance && n > Number(best))) {
            distance = gap;
            best = value;
        }
    }
    return best;
}
function pixverseDuration(seconds, resolution, long = true) {
    const allowed = resolution === '1080p'
        ? (long ? exports.PIXVERSE_DURATION.filter((value) => value !== '10') : exports.PIXVERSE_DURATION.filter((value) => value === exports.PIXVERSE_DURATION[0]))
        : (long ? exports.PIXVERSE_DURATION : exports.PIXVERSE_DURATION.filter((value) => value !== '10'));
    const picked = nearestDuration(seconds, allowed);
    (0, payload_1.logPayloadClamp)('duration', seconds, picked, exports.PIXVERSE_V56_TEXT);
    return picked;
}
function snap(value, allowed, fallback) {
    if (value && allowed.includes(value))
        return value;
    return fallback;
}
function pixversePrompt(prompt, camera) {
    const line = (0, identity_1.cameraSentence)(camera)?.trim() ?? '';
    const scene = prompt.trim();
    const cameraLine = line && !scene.includes('Camera:') ? line : '';
    return capUtf8Bytes([scene, cameraLine].filter(Boolean).join(' '), exports.PIXVERSE_PROMPT_BYTES);
}
function buildPixversePayload(args) {
    const prompt = pixversePrompt(args.prompt, args.camera);
    if (prompt.length < 1)
        throw new payload_1.PayloadError('pixverse shot has no prompt');
    const long = args.kind.startsWith('v56') || args.kind.startsWith('v55');
    const resolution = snap(args.resolution, exports.PIXVERSE_RESOLUTION, '720p');
    const duration = pixverseDuration(args.durationSec, resolution, long);
    const modern = args.kind.startsWith('v56') || args.kind.startsWith('v55');
    const payload = { prompt, duration, resolution };
    if (modern) {
        payload.generate_audio_switch = false;
        payload.thinking_type = 'disabled';
    }
    const negative = args.negativePrompt?.trim()
        ? capUtf8Bytes(args.negativePrompt.trim(), exports.PIXVERSE_PROMPT_BYTES)
        : '';
    if (negative)
        payload.negative_prompt = negative;
    const seed = args.seed != null && Number.isFinite(args.seed) && args.seed >= 0 && args.seed <= 2147483647
        ? Math.round(args.seed)
        : undefined;
    if (seed != null)
        payload.seed = seed;
    const withAspect = args.kind === 'v56_text' || args.kind === 'v55_text' || args.kind === 'v45_text' || args.kind === 'v56_transition';
    if (withAspect)
        payload.aspect_ratio = snap(args.aspectRatio, exports.PIXVERSE_ASPECT, '16:9');
    if (args.kind === 'v56_image' || args.kind === 'v55_image' || args.kind === 'v4_image') {
        const imageUrl = args.imageUrl?.trim();
        if (!imageUrl)
            throw new payload_1.PayloadError('pixverse image-to-video requires image_url');
        payload.image_url = imageUrl;
        return payload;
    }
    if (args.kind === 'v56_transition') {
        const first = args.imageUrl?.trim();
        const end = args.endImageUrl?.trim();
        if (!first || !end)
            throw new payload_1.PayloadError('pixverse transition requires first_image_url and end_image_url');
        payload.first_image_url = first;
        payload.end_image_url = end;
    }
    return payload;
}
//# sourceMappingURL=pixverse.js.map
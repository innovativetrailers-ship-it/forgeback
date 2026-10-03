"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WAN_FIELDS = exports.WAN_REFERENCE_CAP = exports.WAN_NEGATIVE_MAX = exports.WAN_PROMPT_MAX = exports.WAN_ASPECT = exports.WAN_RESOLUTION = exports.WAN_REFERENCE_DURATION = exports.WAN_DURATION = exports.WAN_ENDPOINTS = exports.WAN_REFERENCE = exports.WAN_IMAGE = exports.WAN_TEXT = void 0;
exports.wanModeModel = wanModeModel;
exports.wanDurationConstraint = wanDurationConstraint;
exports.wanDuration = wanDuration;
exports.buildWanPayload = buildWanPayload;
const payload_1 = require("./payload");
const identity_1 = require("./identity");
/**
 * Wan 2.7 field map from OpenAPI on 2026-09-24.
 * fal-ai/wan/v2.7/text-to-video, image-to-video, and reference-to-video — 200.
 * Every guessed Wan 2.6 id (fal-ai/wan-2.6/... and fal-ai/wan/v2.6/...) — 404.
 * 2.7 is the pool model. 2.6 is not registered.
 * Duration is an integer enum (2-15, reference 2-10). Not num_frames. Not "5s".
 * Prompt text says max 5000 characters. The property has no maxLength.
 * Negative prompt text says max 500 characters.
 * Reference files are reference_image_urls and reference_video_urls. No # tags.
 * The schema declares no maxItems; the live control cap stays 4.
 * image-to-video has no aspect_ratio. end_image_url is the last frame on that same endpoint.
 * There is no generate_audio field. audio_url is an optional file. Text-to-video
 * says that omitting it lets the model write background music. There is no off switch.
 * enable_prompt_expansion defaults true and rewrites the prompt, so submit sends false
 * on text and image-to-video. Reference has no such field.
 * fal-ai/wan/v2.7/edit — 200, but it is an image edit (image_urls, num_images), not video.
 * It is not the video_edit mode. wan/v2.7/edit without the fal-ai prefix — 404.
 * Older i2v ids (2.5 preview, 2.2-5b, 2.2-a14b, wan-pro, wan-i2v) returned 200
 * and are not pool models.
 */
exports.WAN_TEXT = 'fal-ai/wan/v2.7/text-to-video';
exports.WAN_IMAGE = 'fal-ai/wan/v2.7/image-to-video';
exports.WAN_REFERENCE = 'fal-ai/wan/v2.7/reference-to-video';
exports.WAN_ENDPOINTS = {
    text: exports.WAN_TEXT,
    first_frame: exports.WAN_IMAGE,
    first_last: exports.WAN_IMAGE,
    reference: exports.WAN_REFERENCE,
};
exports.WAN_DURATION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
exports.WAN_REFERENCE_DURATION = [2, 3, 4, 5, 6, 7, 8, 9, 10];
exports.WAN_RESOLUTION = ['720p', '1080p'];
exports.WAN_ASPECT = ['16:9', '9:16', '1:1', '4:3', '3:4'];
exports.WAN_PROMPT_MAX = 5000;
exports.WAN_NEGATIVE_MAX = 500;
exports.WAN_REFERENCE_CAP = 4;
exports.WAN_FIELDS = {
    firstFrame: 'image_url',
    lastFrame: 'end_image_url',
    references: { mode: 'field', field: 'reference_image_urls', max: exports.WAN_REFERENCE_CAP },
    duration: { field: 'duration', kind: 'enum', values: [...exports.WAN_DURATION] },
    audio: { field: 'audio_url', kind: 'native_always' },
    resolution: { field: 'resolution', values: [...exports.WAN_RESOLUTION] },
    aspect: { field: 'aspect_ratio', values: [...exports.WAN_ASPECT] },
    negative: 'negative_prompt',
    seed: 'seed',
};
function wanModeModel() {
    return {
        id: 'wan-2.7',
        provider: 'fal',
        endpoints: exports.WAN_ENDPOINTS,
        fields: exports.WAN_FIELDS,
        limits: { maxPromptChars: exports.WAN_PROMPT_MAX },
        nativeAudio: false,
    };
}
function wanDurationConstraint(reference = false) {
    return { shape: 'set', values: reference ? exports.WAN_REFERENCE_DURATION : exports.WAN_DURATION, fallback: 5 };
}
function wanDuration(seconds, reference = false, onClamp = payload_1.logPayloadClamp) {
    return Number((0, payload_1.clampDuration)(seconds, wanDurationConstraint(reference), reference ? exports.WAN_REFERENCE : exports.WAN_TEXT, onClamp));
}
function snap(value, allowed, fallback) {
    if (value && allowed.includes(value))
        return value;
    return fallback;
}
function wanPrompt(prompt, camera) {
    const line = (0, identity_1.cameraSentence)(camera)?.trim() ?? '';
    return (0, identity_1.capPromptText)([prompt.trim(), line].filter(Boolean).join(' '), exports.WAN_PROMPT_MAX);
}
function buildWanPayload(args) {
    const prompt = wanPrompt(args.prompt, args.camera);
    if (prompt.length < 3)
        throw new payload_1.PayloadError('wan shot has no prompt');
    const resolution = snap(args.resolution, exports.WAN_RESOLUTION, '720p');
    const negative = args.negativePrompt?.trim()
        ? (0, identity_1.capPromptText)(args.negativePrompt.trim(), exports.WAN_NEGATIVE_MAX)
        : undefined;
    const seed = args.seed != null && Number.isFinite(args.seed) && args.seed >= 0 && args.seed <= 2147483647
        ? Math.round(args.seed)
        : undefined;
    if (args.mode === 'reference') {
        const imageUrls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, exports.WAN_REFERENCE_CAP);
        const videoUrls = (args.videoUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, exports.WAN_REFERENCE_CAP);
        if (!imageUrls.length && !videoUrls.length) {
            throw new payload_1.PayloadError('wan reference-to-video requires a reference image or video');
        }
        const payload = {
            prompt,
            duration: wanDuration(args.durationSec, true),
            resolution,
            aspect_ratio: snap(args.aspectRatio, exports.WAN_ASPECT, '16:9'),
        };
        if (imageUrls.length)
            payload.reference_image_urls = imageUrls;
        if (videoUrls.length)
            payload.reference_video_urls = videoUrls;
        if (negative)
            payload.negative_prompt = negative;
        if (seed != null)
            payload.seed = seed;
        return payload;
    }
    const duration = wanDuration(args.durationSec, false);
    if (args.mode === 'text') {
        const payload = {
            prompt,
            duration,
            resolution,
            aspect_ratio: snap(args.aspectRatio, exports.WAN_ASPECT, '16:9'),
            enable_prompt_expansion: false,
        };
        if (negative)
            payload.negative_prompt = negative;
        if (seed != null)
            payload.seed = seed;
        return payload;
    }
    const imageUrl = args.imageUrl?.trim();
    if (!imageUrl)
        throw new payload_1.PayloadError('wan image-to-video requires image_url');
    const payload = {
        prompt,
        image_url: imageUrl,
        duration,
        resolution,
        enable_prompt_expansion: false,
    };
    if (args.mode === 'first_last') {
        const endImageUrl = args.endImageUrl?.trim();
        if (!endImageUrl)
            throw new payload_1.PayloadError('wan first/last requires end_image_url');
        payload.end_image_url = endImageUrl;
    }
    if (negative)
        payload.negative_prompt = negative;
    if (seed != null)
        payload.seed = seed;
    return payload;
}
//# sourceMappingURL=wan.js.map
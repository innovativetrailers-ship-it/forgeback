"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROK_FIELDS = exports.GROK_REFERENCE_CAP = exports.GROK_PROMPT_MAX = exports.GROK_ASPECT = exports.GROK_REFERENCE_RESOLUTION = exports.GROK_TEXT_RESOLUTION = exports.GROK_ENDPOINTS = exports.GROK_BASE_REFERENCE = exports.GROK_BASE_IMAGE = exports.GROK_BASE_TEXT = exports.GROK_V15_REFERENCE = exports.GROK_V15_IMAGE = exports.GROK_V15_TEXT = void 0;
exports.grokModeModel = grokModeModel;
exports.grokDuration = grokDuration;
exports.buildGrokPayload = buildGrokPayload;
const payload_1 = require("./payload");
const identity_1 = require("./identity");
/**
 * Grok Imagine video field map from OpenAPI on 2026-09-25.
 * xai/grok-imagine-video/v1.5/text-to-video, image-to-video, and reference-to-video — 200.
 * The unversioned text, image, and reference endpoints also returned 200.
 * v1.5 is the registry target: text and image accept 1080p, and reference duration goes to 15.
 * fal-ai/grok-imagine-video/text-to-video — 404.
 * xai/grok-imagine-video with no mode, and xai/grok-imagine-video/edit, are image APIs. Not video.
 * Text is prompt only. Image requires image_url and has no aspect and no last frame.
 * Reference requires reference_image_urls, max 7. Tags are <IMAGE_0>, zero-indexed.
 * The unversioned reference schema uses @Image1 and caps duration at 10. That is not this id.
 * Duration is an integer 1-15. Prompt maxLength is 4096. No seed.
 * None of the video inputs have an audio field. Native audio stays on because it cannot be switched off.
 * The direct xAI client stays retired.
 */
exports.GROK_V15_TEXT = 'xai/grok-imagine-video/v1.5/text-to-video';
exports.GROK_V15_IMAGE = 'xai/grok-imagine-video/v1.5/image-to-video';
exports.GROK_V15_REFERENCE = 'xai/grok-imagine-video/v1.5/reference-to-video';
exports.GROK_BASE_TEXT = 'xai/grok-imagine-video/text-to-video';
exports.GROK_BASE_IMAGE = 'xai/grok-imagine-video/image-to-video';
exports.GROK_BASE_REFERENCE = 'xai/grok-imagine-video/reference-to-video';
exports.GROK_ENDPOINTS = {
    text: exports.GROK_V15_TEXT,
    first_frame: exports.GROK_V15_IMAGE,
    reference: exports.GROK_V15_REFERENCE,
};
exports.GROK_TEXT_RESOLUTION = ['480p', '720p', '1080p'];
exports.GROK_REFERENCE_RESOLUTION = ['480p', '720p'];
exports.GROK_ASPECT = ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'];
exports.GROK_PROMPT_MAX = 4096;
exports.GROK_REFERENCE_CAP = 7;
exports.GROK_FIELDS = {
    firstFrame: 'image_url',
    references: { mode: 'field', field: 'reference_image_urls', max: exports.GROK_REFERENCE_CAP },
    duration: { field: 'duration', kind: 'number', min: 1, max: 15 },
    audio: { field: '', kind: 'native_always' },
    resolution: { field: 'resolution', values: [...exports.GROK_TEXT_RESOLUTION] },
    aspect: { field: 'aspect_ratio', values: [...exports.GROK_ASPECT] },
};
function grokModeModel() {
    return {
        id: 'grok-imagine-video',
        provider: 'fal',
        endpoints: exports.GROK_ENDPOINTS,
        fields: exports.GROK_FIELDS,
        limits: { maxPromptChars: exports.GROK_PROMPT_MAX },
        nativeAudio: true,
    };
}
function grokDuration(seconds, reference = false) {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0)
        return reference ? 8 : 6;
    return Math.min(15, Math.max(1, Math.round(seconds)));
}
function snap(value, allowed, fallback) {
    if (value && allowed.includes(value))
        return value;
    return fallback;
}
function grokPrompt(prompt, camera, prefix) {
    const line = (0, identity_1.cameraSentence)(camera)?.trim() ?? '';
    const scene = prompt.trim();
    const cameraLine = line && !scene.includes('Camera:') ? line : '';
    const head = prefix && !scene.includes('<IMAGE_0>') ? prefix : '';
    return (0, identity_1.capPromptText)([head, scene, cameraLine].filter(Boolean).join(' '), exports.GROK_PROMPT_MAX);
}
function referencePrefix(labels) {
    return labels.map((label, index) => {
        const tag = `<IMAGE_${index}>`;
        return label.trim() ? `${tag} is ${label.trim()}` : tag;
    }).join('. ');
}
function buildGrokPayload(args) {
    if (args.mode === 'reference') {
        const urls = [];
        const labels = [];
        const named = args.names ?? [];
        const incoming = args.imageUrls ?? [];
        incoming.forEach((url, index) => {
            const clean = url.trim();
            if (!clean || urls.includes(clean) || urls.length >= exports.GROK_REFERENCE_CAP)
                return;
            urls.push(clean);
            labels.push(named[index]?.trim() ?? '');
        });
        if (!urls.length)
            throw new payload_1.PayloadError('grok reference-to-video requires reference_image_urls');
        const prompt = grokPrompt(args.prompt, args.camera, referencePrefix(labels));
        if (prompt.length < 1)
            throw new payload_1.PayloadError('grok reference-to-video requires a prompt');
        return {
            prompt,
            reference_image_urls: urls,
            duration: grokDuration(args.durationSec, true),
            resolution: snap(args.resolution === '1080p' ? '720p' : args.resolution, exports.GROK_REFERENCE_RESOLUTION, '480p'),
            aspect_ratio: snap(args.aspectRatio, exports.GROK_ASPECT, '16:9'),
        };
    }
    const prompt = grokPrompt(args.prompt, args.camera);
    if (prompt.length < 1)
        throw new payload_1.PayloadError('grok video requires a prompt');
    const duration = grokDuration(args.durationSec, false);
    const resolution = snap(args.resolution, exports.GROK_TEXT_RESOLUTION, '720p');
    if (args.mode === 'text') {
        return {
            prompt,
            duration,
            resolution,
            aspect_ratio: snap(args.aspectRatio, exports.GROK_ASPECT, '16:9'),
        };
    }
    const imageUrl = args.imageUrl?.trim();
    if (!imageUrl)
        throw new payload_1.PayloadError('grok image-to-video requires image_url');
    return { prompt, image_url: imageUrl, duration, resolution };
}
//# sourceMappingURL=grok.js.map
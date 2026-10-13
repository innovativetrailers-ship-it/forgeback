"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAPPYHORSE_FIELDS = exports.HAPPYHORSE_EDIT_CAP = exports.HAPPYHORSE_REFERENCE_CAP = exports.HAPPYHORSE_PROMPT_MAX = exports.HAPPYHORSE_ASPECT = exports.HAPPYHORSE_RESOLUTION = exports.HAPPYHORSE_DURATION = exports.HAPPYHORSE_ENDPOINTS = exports.HAPPYHORSE_11_REFERENCE = exports.HAPPYHORSE_11_IMAGE = exports.HAPPYHORSE_11_TEXT = exports.HAPPYHORSE_EDIT = exports.HAPPYHORSE_REFERENCE = exports.HAPPYHORSE_IMAGE = exports.HAPPYHORSE_TEXT = void 0;
exports.happyhorseModeModel = happyhorseModeModel;
exports.happyhorseDuration = happyhorseDuration;
exports.buildHappyHorsePayload = buildHappyHorsePayload;
const payload_1 = require("./payload");
const identity_1 = require("./identity");
/**
 * HappyHorse 1.0 field map from OpenAPI on 2026-09-25.
 * alibaba/happy-horse/text-to-video, image-to-video, reference-to-video, and video-edit — 200.
 * alibaba/happy-horse/v1.1/text-to-video, image-to-video, and reference-to-video — 200.
 * v1.1/video-edit — 404. v1.1 does not replace 1.0. It is not this registry id.
 * fal-ai/happy-horse/text-to-video — 200 and matches the unversioned text schema. The registry uses alibaba/.
 * Text has no image_url. Image requires image_url and has no aspect.
 * Reference files are image_urls, described as 1-9. The prompt names them character1, character2.
 * Video edit requires video_url and prompt. Reference images are reference_image_urls, up to 5, named @Image1.
 * Duration is an integer enum 3-15. There is no duration on video edit.
 * Prompt text says max 2500 characters. The property has no maxLength.
 * Text, image, and reference have no audio field. Video edit audio_setting is auto|origin.
 * Submit sends origin on an edit so the model does not regenerate the track.
 * enable_safety_checker stays omitted.
 * This id is not in the default council. It joins the routing pool only after one clean generation.
 */
exports.HAPPYHORSE_TEXT = 'alibaba/happy-horse/text-to-video';
exports.HAPPYHORSE_IMAGE = 'alibaba/happy-horse/image-to-video';
exports.HAPPYHORSE_REFERENCE = 'alibaba/happy-horse/reference-to-video';
exports.HAPPYHORSE_EDIT = 'alibaba/happy-horse/video-edit';
exports.HAPPYHORSE_11_TEXT = 'alibaba/happy-horse/v1.1/text-to-video';
exports.HAPPYHORSE_11_IMAGE = 'alibaba/happy-horse/v1.1/image-to-video';
exports.HAPPYHORSE_11_REFERENCE = 'alibaba/happy-horse/v1.1/reference-to-video';
exports.HAPPYHORSE_ENDPOINTS = {
    text: exports.HAPPYHORSE_TEXT,
    first_frame: exports.HAPPYHORSE_IMAGE,
    reference: exports.HAPPYHORSE_REFERENCE,
    video_edit: exports.HAPPYHORSE_EDIT,
};
exports.HAPPYHORSE_DURATION = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
exports.HAPPYHORSE_RESOLUTION = ['720p', '1080p'];
exports.HAPPYHORSE_ASPECT = ['16:9', '9:16', '1:1', '4:3', '3:4'];
exports.HAPPYHORSE_PROMPT_MAX = 2500;
exports.HAPPYHORSE_REFERENCE_CAP = 9;
exports.HAPPYHORSE_EDIT_CAP = 5;
exports.HAPPYHORSE_FIELDS = {
    firstFrame: 'image_url',
    references: { mode: 'field', field: 'image_urls', max: exports.HAPPYHORSE_REFERENCE_CAP },
    duration: { field: 'duration', kind: 'enum', values: [...exports.HAPPYHORSE_DURATION] },
    audio: { field: '', kind: 'native_always' },
    resolution: { field: 'resolution', values: [...exports.HAPPYHORSE_RESOLUTION] },
    aspect: { field: 'aspect_ratio', values: [...exports.HAPPYHORSE_ASPECT] },
    seed: 'seed',
};
function happyhorseModeModel() {
    return {
        id: 'happyhorse-1.0',
        provider: 'fal',
        endpoints: exports.HAPPYHORSE_ENDPOINTS,
        fields: exports.HAPPYHORSE_FIELDS,
        limits: { maxPromptChars: exports.HAPPYHORSE_PROMPT_MAX },
        nativeAudio: true,
    };
}
function happyhorseDuration(seconds) {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0)
        return 5;
    const target = Math.round(seconds);
    let best = exports.HAPPYHORSE_DURATION[0];
    let distance = Infinity;
    for (const value of exports.HAPPYHORSE_DURATION) {
        const gap = Math.abs(value - target);
        if (gap < distance || (gap === distance && value > best)) {
            distance = gap;
            best = value;
        }
    }
    return best;
}
function snap(value, allowed, fallback) {
    if (value && allowed.includes(value))
        return value;
    return fallback;
}
function happyhorsePrompt(prompt, camera, prefix) {
    const line = (0, identity_1.cameraSentence)(camera)?.trim() ?? '';
    const scene = prompt.trim();
    const cameraLine = line && !scene.includes('Camera:') ? line : '';
    const head = prefix && !(prefix.startsWith('@') ? scene.includes('@Image1') : scene.includes('character1'))
        ? prefix
        : '';
    return (0, identity_1.capPromptText)([head, scene, cameraLine].filter(Boolean).join(' '), exports.HAPPYHORSE_PROMPT_MAX);
}
function seedOf(seed) {
    if (seed == null || !Number.isFinite(seed) || seed < 0 || seed > 2147483647)
        return undefined;
    return Math.round(seed);
}
function buildHappyHorsePayload(args) {
    const resolution = snap(args.resolution, exports.HAPPYHORSE_RESOLUTION, '1080p');
    const seed = seedOf(args.seed);
    if (args.kind === 'video_edit') {
        const videoUrl = args.videoUrl?.trim();
        if (!videoUrl)
            throw new payload_1.PayloadError('happyhorse video-edit requires video_url');
        const urls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, exports.HAPPYHORSE_EDIT_CAP);
        const tags = urls.map((_, index) => `@Image${index + 1}`).join(' ');
        const prompt = happyhorsePrompt(args.prompt, args.camera, tags);
        if (prompt.length < 1)
            throw new payload_1.PayloadError('happyhorse video-edit requires a prompt');
        const payload = {
            prompt,
            video_url: videoUrl,
            resolution,
            audio_setting: 'origin',
        };
        if (urls.length)
            payload.reference_image_urls = urls;
        if (seed != null)
            payload.seed = seed;
        return payload;
    }
    if (args.kind === 'reference') {
        const urls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, exports.HAPPYHORSE_REFERENCE_CAP);
        if (!urls.length)
            throw new payload_1.PayloadError('happyhorse reference-to-video requires image_urls');
        const names = args.names ?? [];
        const tags = urls.map((_, index) => {
            const label = names[index]?.trim();
            return label ? `character${index + 1} is ${label}` : `character${index + 1}`;
        }).join('. ');
        const prompt = happyhorsePrompt(args.prompt, args.camera, tags);
        if (prompt.length < 1)
            throw new payload_1.PayloadError('happyhorse reference-to-video requires a prompt');
        const payload = {
            prompt,
            image_urls: urls,
            duration: happyhorseDuration(args.durationSec),
            resolution,
            aspect_ratio: snap(args.aspectRatio, exports.HAPPYHORSE_ASPECT, '16:9'),
        };
        if (seed != null)
            payload.seed = seed;
        return payload;
    }
    const prompt = happyhorsePrompt(args.prompt, args.camera);
    const duration = happyhorseDuration(args.durationSec);
    if (args.kind === 'text') {
        if (prompt.length < 1)
            throw new payload_1.PayloadError('happyhorse text-to-video requires a prompt');
        const payload = {
            prompt,
            duration,
            resolution,
            aspect_ratio: snap(args.aspectRatio, exports.HAPPYHORSE_ASPECT, '16:9'),
        };
        if (seed != null)
            payload.seed = seed;
        return payload;
    }
    const imageUrl = args.imageUrl?.trim();
    if (!imageUrl)
        throw new payload_1.PayloadError('happyhorse image-to-video requires image_url');
    const payload = { image_url: imageUrl, duration, resolution };
    if (prompt.length >= 1)
        payload.prompt = prompt;
    if (seed != null)
        payload.seed = seed;
    return payload;
}
//# sourceMappingURL=happyhorse.js.map
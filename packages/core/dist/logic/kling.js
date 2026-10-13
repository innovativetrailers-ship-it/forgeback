"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KLING_FIELDS = exports.KLING_REFERENCE_IMAGES = exports.KLING_PROMPT_MAX = exports.KLING_ASPECT = exports.KLING_V2_DURATION = exports.KLING_DURATION = exports.KLING_ENDPOINTS = exports.KLING_O3_EDIT = exports.KLING_V3_IMAGE = exports.KLING_V3_TEXT = void 0;
exports.klingModeModel = klingModeModel;
exports.klingDurationValues = klingDurationValues;
exports.klingDurationConstraint = klingDurationConstraint;
exports.klingDuration = klingDuration;
exports.klingElements = klingElements;
exports.klingElementTags = klingElementTags;
exports.withKlingElementTags = withKlingElementTags;
exports.buildKlingPayload = buildKlingPayload;
const payload_1 = require("./payload");
const identity_1 = require("./identity");
/**
 * Kling 3.0 field map from OpenAPI on 2026-09-24.
 * fal-ai/kling-video/v3/pro/text-to-video — 200.
 * fal-ai/kling-video/v3/pro/image-to-video — 200. Required start_image_url.
 *   end_image_url is optional. elements is a field on this input, not its own endpoint.
 * fal-ai/kling-video/v3/pro/elements — 404. Do not register that id.
 * fal-ai/kling-video/o3/standard/video-to-video/edit — 200. Required prompt + video_url.
 * Prompt maxLength is 2500. Duration enum is "3".."15" with no "auto".
 * No resolution field. No seed. aspect_ratio is on text-to-video only.
 * generate_audio exists and stays false on submit.
 * The schema tells the prompt to name elements as @Element1, @Element2.
 * v2.5-turbo and v2.1 ids were checked and are not pool models, so they are not registered.
 */
exports.KLING_V3_TEXT = 'fal-ai/kling-video/v3/pro/text-to-video';
exports.KLING_V3_IMAGE = 'fal-ai/kling-video/v3/pro/image-to-video';
exports.KLING_O3_EDIT = 'fal-ai/kling-video/o3/standard/video-to-video/edit';
exports.KLING_ENDPOINTS = {
    text: exports.KLING_V3_TEXT,
    first_frame: exports.KLING_V3_IMAGE,
    first_last: exports.KLING_V3_IMAGE,
    reference: exports.KLING_V3_IMAGE,
    video_edit: exports.KLING_O3_EDIT,
};
exports.KLING_DURATION = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
/** v2.x and v1. v3/o3 use KLING_DURATION. */
exports.KLING_V2_DURATION = ['5', '10'];
exports.KLING_ASPECT = ['16:9', '9:16', '1:1'];
exports.KLING_PROMPT_MAX = 2500;
exports.KLING_REFERENCE_IMAGES = 3;
exports.KLING_FIELDS = {
    firstFrame: 'start_image_url',
    lastFrame: 'end_image_url',
    references: { mode: 'field', field: 'elements', max: exports.KLING_REFERENCE_IMAGES },
    duration: {
        field: 'duration',
        kind: 'range',
        min: Number(exports.KLING_DURATION[0]),
        max: Number(exports.KLING_DURATION[exports.KLING_DURATION.length - 1]),
        values: [...exports.KLING_DURATION],
    },
    audio: { field: 'generate_audio', kind: 'bool' },
    aspect: { field: 'aspect_ratio', values: [...exports.KLING_ASPECT] },
    negative: 'negative_prompt',
};
function klingModeModel() {
    return {
        id: 'kling-3.0',
        provider: 'fal',
        endpoints: exports.KLING_ENDPOINTS,
        fields: exports.KLING_FIELDS,
        limits: { maxPromptChars: exports.KLING_PROMPT_MAX },
        nativeAudio: true,
    };
}
function klingDurationValues(endpoint) {
    if (endpoint && endpoint.includes('kling-video') && !endpoint.includes('/v3/') && !endpoint.includes('/o3/')) {
        return exports.KLING_V2_DURATION;
    }
    return exports.KLING_DURATION;
}
function klingDurationConstraint(endpoint) {
    const v2 = Boolean(endpoint && endpoint.includes('kling-video') && !endpoint.includes('/v3/') && !endpoint.includes('/o3/'));
    if (v2)
        return { shape: 'set', values: exports.KLING_V2_DURATION, fallback: 5 };
    return {
        shape: 'range',
        min: Number(exports.KLING_DURATION[0]),
        max: Number(exports.KLING_DURATION[exports.KLING_DURATION.length - 1]),
        wire: 'string',
        fallback: 5,
    };
}
function klingDuration(seconds, endpoint, onClamp = payload_1.logPayloadClamp) {
    return String((0, payload_1.clampDuration)(seconds, klingDurationConstraint(endpoint), endpoint ?? exports.KLING_V3_TEXT, onClamp));
}
function klingElements(sources) {
    const elements = [];
    for (const source of sources) {
        const videoUrl = source.videoUrl?.trim();
        if (videoUrl) {
            elements.push({ video_url: videoUrl });
            continue;
        }
        const frontal = source.frontal?.trim();
        if (!frontal)
            continue;
        const angles = (source.angles ?? [])
            .map((url) => url.trim())
            .filter((url) => url.length > 0 && url !== frontal)
            .slice(0, exports.KLING_REFERENCE_IMAGES);
        const element = { frontal_image_url: frontal };
        if (angles.length)
            element.reference_image_urls = angles;
        elements.push(element);
    }
    return elements;
}
function klingElementTags(count) {
    return Array.from({ length: count }, (_, index) => `@Element${index + 1}`);
}
function withKlingElementTags(prompt, count) {
    const tags = klingElementTags(count);
    const missing = tags.filter((tag) => !prompt.includes(tag));
    if (!missing.length)
        return prompt.trim();
    return `${prompt.trim()} ${missing.join(' ')}`.trim();
}
function capKlingPrompt(prompt, max = exports.KLING_PROMPT_MAX) {
    const tags = prompt.match(/(?: @Element\d+)+$/)?.[0] ?? '';
    if (!tags)
        return (0, identity_1.capPromptText)(prompt, max);
    if (prompt.length <= max)
        return prompt;
    const head = (0, identity_1.capPromptText)(prompt.slice(0, prompt.length - tags.length), max - tags.length);
    return `${head}${tags}`.trim();
}
function snapAspect(value) {
    if (value && exports.KLING_ASPECT.includes(value))
        return value;
    return '16:9';
}
function buildKlingPayload(args) {
    const camera = (0, identity_1.cameraSentence)(args.camera)?.trim() ?? '';
    const scene = [args.prompt.trim(), camera].filter(Boolean).join(' ');
    if (args.mode === 'video_edit') {
        const videoUrl = args.videoUrl?.trim();
        if (!videoUrl)
            throw new payload_1.PayloadError('kling video edit requires video_url');
        const prompt = capKlingPrompt(withKlingElementTags(scene, args.elements?.length ?? 0));
        if (prompt.length < 3)
            throw new payload_1.PayloadError('kling shot has no prompt');
        const payload = { prompt, video_url: videoUrl };
        if (args.elements?.length)
            payload.elements = args.elements;
        return payload;
    }
    const elements = args.mode === 'text' ? [] : (args.elements ?? []);
    if (args.mode === 'reference' && elements.length < 1) {
        throw new payload_1.PayloadError('kling elements require a frontal image on image-to-video');
    }
    const prompt = capKlingPrompt(withKlingElementTags(scene, elements.length));
    if (prompt.length < 3)
        throw new payload_1.PayloadError('kling shot has no prompt');
    const payload = {
        prompt,
        duration: klingDuration(args.durationSec),
        generate_audio: false,
    };
    if (args.mode === 'text')
        payload.aspect_ratio = snapAspect(args.aspectRatio);
    const negative = args.negativePrompt?.trim();
    if (negative)
        payload.negative_prompt = (0, identity_1.capPromptText)(negative, exports.KLING_PROMPT_MAX);
    if (args.mode === 'text')
        return payload;
    const imageUrl = args.imageUrl?.trim();
    if (!imageUrl)
        throw new payload_1.PayloadError('kling image-to-video requires start_image_url');
    payload.start_image_url = imageUrl;
    if (args.mode === 'first_last' || args.endImageUrl?.trim()) {
        const endImageUrl = args.endImageUrl?.trim();
        if (!endImageUrl)
            throw new payload_1.PayloadError('kling first/last requires end_image_url');
        payload.end_image_url = endImageUrl;
    }
    if (elements.length)
        payload.elements = elements;
    return payload;
}
//# sourceMappingURL=kling.js.map
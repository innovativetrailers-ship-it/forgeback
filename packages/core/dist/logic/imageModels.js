"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMAGE_MODELS = exports.NANO_BANANA_PROMPT_MAX = exports.IMAGE_REF_CAP = exports.FLUX_IMAGE_SIZE = exports.NANO_BANANA_2_RESOLUTION = exports.NANO_BANANA_2_ASPECT = exports.NANO_BANANA_ASPECT = exports.FLUX_GENERAL = exports.FLUX_SCHNELL = exports.FLUX_DEV = exports.NANO_BANANA_2_EDIT = exports.NANO_BANANA_2 = exports.NANO_BANANA_LITE = exports.NANO_BANANA = void 0;
exports.imageModelForUse = imageModelForUse;
exports.buildImagePayload = buildImagePayload;
const payload_1 = require("./payload");
/**
 * Image models from OpenAPI on 2026-09-25. These are not video models.
 * fal-ai/nano-banana — 200. google/nano-banana — 404.
 * fal-ai/nano-banana/lite — 404. fal-ai/nano-banana-lite — 200.
 * fal-ai/nano-banana-2 and fal-ai/nano-banana-2/edit — 200.
 * Edit image_urls has no maxItems. The live cap is 14.
 * fal-ai/flux/dev, fal-ai/flux/schnell, and fal-ai/flux-general — 200.
 * Flux general IP-Adapter requires image_encoder_path. Character refs use the edit endpoint.
 * Seedream 5.0 ids that were probed returned 404. fal-ai/gpt-image-2 returned 200 and is not this path.
 */
exports.NANO_BANANA = 'fal-ai/nano-banana';
exports.NANO_BANANA_LITE = 'fal-ai/nano-banana-lite';
exports.NANO_BANANA_2 = 'fal-ai/nano-banana-2';
exports.NANO_BANANA_2_EDIT = 'fal-ai/nano-banana-2/edit';
exports.FLUX_DEV = 'fal-ai/flux/dev';
exports.FLUX_SCHNELL = 'fal-ai/flux/schnell';
exports.FLUX_GENERAL = 'fal-ai/flux-general';
exports.NANO_BANANA_ASPECT = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'];
exports.NANO_BANANA_2_ASPECT = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'];
exports.NANO_BANANA_2_RESOLUTION = ['0.5K', '1K', '2K', '4K'];
exports.FLUX_IMAGE_SIZE = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
exports.IMAGE_REF_CAP = 14;
exports.NANO_BANANA_PROMPT_MAX = 50000;
exports.IMAGE_MODELS = {
    'nano-banana': { endpoint: exports.NANO_BANANA, maxRefs: 0, supportsLora: false },
    'nano-banana-lite': { endpoint: exports.NANO_BANANA_LITE, maxRefs: 0, supportsLora: false },
    'nano-banana-2': { endpoint: exports.NANO_BANANA_2, maxRefs: 0, supportsLora: false },
    'nano-banana-2-edit': { endpoint: exports.NANO_BANANA_2_EDIT, maxRefs: exports.IMAGE_REF_CAP, supportsLora: false },
    'flux-dev': { endpoint: exports.FLUX_DEV, maxRefs: 0, supportsLora: false },
    'flux-schnell': { endpoint: exports.FLUX_SCHNELL, maxRefs: 0, supportsLora: false },
    'flux-general': { endpoint: exports.FLUX_GENERAL, maxRefs: 1, supportsLora: true },
};
function imageModelForUse(use, hasRefs) {
    if (hasRefs)
        return 'nano-banana-2-edit';
    if (use === 'keyframe')
        return 'nano-banana';
    return 'nano-banana-2';
}
function snap(value, allowed, fallback) {
    if (value && allowed.includes(value))
        return value;
    return fallback;
}
function bananaResolution(value) {
    const raw = value?.trim().toLowerCase();
    if (raw === '0.5k')
        return '0.5K';
    if (raw === '2k' || raw === '1440p')
        return '2K';
    if (raw === '4k' || raw === '2160p')
        return '4K';
    return '1K';
}
function fluxImageSize(aspectRatio) {
    if (aspectRatio === '16:9')
        return 'landscape_16_9';
    if (aspectRatio === '9:16')
        return 'portrait_16_9';
    if (aspectRatio === '4:3')
        return 'landscape_4_3';
    if (aspectRatio === '3:4')
        return 'portrait_4_3';
    if (aspectRatio === '1:1')
        return 'square_hd';
    return 'landscape_4_3';
}
function imageCount(value) {
    if (value == null || !Number.isFinite(value))
        return 1;
    return Math.min(4, Math.max(1, Math.round(value)));
}
function seedOf(seed) {
    if (seed == null || !Number.isFinite(seed) || seed < 0 || seed > 2147483647)
        return undefined;
    return Math.round(seed);
}
function buildImagePayload(args) {
    const entry = exports.IMAGE_MODELS[args.model];
    const prompt = args.prompt.trim();
    const banana = args.model.startsWith('nano-banana');
    if (banana && prompt.length < 3)
        throw new payload_1.PayloadError('nano banana prompt is shorter than 3 characters');
    if (!banana && prompt.length < 1)
        throw new payload_1.PayloadError('flux image prompt is empty');
    const text = banana && prompt.length > exports.NANO_BANANA_PROMPT_MAX
        ? prompt.slice(0, exports.NANO_BANANA_PROMPT_MAX)
        : prompt;
    const seed = seedOf(args.seed);
    const urls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, entry.maxRefs);
    if (args.model === 'nano-banana' || args.model === 'nano-banana-lite') {
        const input = {
            prompt: text,
            num_images: imageCount(args.numImages),
            output_format: 'png',
            aspect_ratio: snap(args.aspectRatio, args.model === 'nano-banana' ? exports.NANO_BANANA_ASPECT : exports.NANO_BANANA_2_ASPECT, '16:9'),
        };
        if (seed != null)
            input.seed = seed;
        return { endpoint: entry.endpoint, input };
    }
    if (args.model === 'nano-banana-2' || args.model === 'nano-banana-2-edit') {
        const input = {
            prompt: text,
            num_images: imageCount(args.numImages),
            output_format: 'png',
            aspect_ratio: snap(args.aspectRatio, exports.NANO_BANANA_2_ASPECT, 'auto'),
            resolution: bananaResolution(args.resolution),
        };
        if (args.model === 'nano-banana-2-edit') {
            if (!urls.length)
                throw new payload_1.PayloadError('nano banana 2 edit requires image_urls');
            input.image_urls = urls;
        }
        if (seed != null)
            input.seed = seed;
        return { endpoint: entry.endpoint, input };
    }
    if (args.model === 'flux-general') {
        const input = {
            prompt: text,
            num_images: imageCount(args.numImages),
            output_format: 'png',
            image_size: fluxImageSize(args.aspectRatio),
        };
        if (urls[0])
            input.reference_image_url = urls[0];
        const loraPath = args.loraPath?.trim();
        if (loraPath)
            input.loras = [{ path: loraPath, scale: 1 }];
        if (seed != null)
            input.seed = seed;
        return { endpoint: entry.endpoint, input };
    }
    const input = {
        prompt: text,
        num_images: imageCount(args.numImages),
        output_format: 'png',
        image_size: fluxImageSize(args.aspectRatio),
    };
    if (seed != null)
        input.seed = seed;
    return { endpoint: entry.endpoint, input };
}
//# sourceMappingURL=imageModels.js.map
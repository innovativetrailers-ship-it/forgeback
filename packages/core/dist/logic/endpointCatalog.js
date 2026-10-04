"use strict";
/** Submitted FAL endpoint ids. Feature code looks up by key. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENDPOINT_CATALOG = void 0;
exports.falEndpoint = falEndpoint;
exports.buildWhisperSttInput = buildWhisperSttInput;
exports.buildQwenAnglesInput = buildQwenAnglesInput;
exports.buildFluxDevT2iInput = buildFluxDevT2iInput;
exports.ENDPOINT_CATALOG = {
    'animatediff-v2v': 'fal-ai/animatediff-v2v',
    'audio-enhancement': 'fal-ai/audio-enhancement',
    'audio-separator': 'fal-ai/audio-separator',
    'aura-sr': 'fal-ai/aura-sr',
    birefnet: 'fal-ai/birefnet',
    'birefnet-general': 'fal-ai/birefnet-general',
    'birefnet/v2/video': 'fal-ai/birefnet/v2/video',
    'bytedance/omnihuman/v1.5': 'fal-ai/bytedance/omnihuman/v1.5',
    catvton: 'fal-ai/catvton',
    'clarity-upscaler': 'fal-ai/clarity-upscaler',
    codeformer: 'fal-ai/codeformer',
    controlnet: 'fal-ai/controlnet',
    detr: 'fal-ai/detr',
    dwpose: 'fal-ai/dwpose',
    'dwpose/video': 'fal-ai/dwpose/video',
    esrgan: 'fal-ai/esrgan',
    'elevenlabs/audio-isolation': 'fal-ai/elevenlabs/audio-isolation',
    'elevenlabs/sound-effects': 'fal-ai/elevenlabs/sound-effects',
    'elevenlabs/speech-to-text': 'fal-ai/elevenlabs/speech-to-text',
    'face-swap-v2': 'fal-ai/face-swap-v2',
    ffmpeg: 'fal-ai/ffmpeg',
    'ffmpeg-api/extract-frame': 'fal-ai/ffmpeg-api/extract-frame',
    'film-video-frame-interpolation': 'fal-ai/film-video-frame-interpolation',
    'film/interpolation': 'fal-ai/film/interpolation',
    'flux-controlnet': 'fal-ai/flux-controlnet',
    'flux-general/image-to-image': 'fal-ai/flux-general/image-to-image',
    'flux-pro/v1/fill': 'fal-ai/flux-pro/v1/fill',
    'flux/dev': 'fal-ai/flux/dev',
    'flux/dev/image-to-image': 'fal-ai/flux/dev/image-to-image',
    'flux/schnell': 'fal-ai/flux/schnell',
    'gemini-25-flash-image': 'fal-ai/gemini-25-flash-image',
    'gemini-3-pro-image-preview': 'fal-ai/gemini-3-pro-image-preview',
    'hunyuan-video': 'fal-ai/hunyuan-video',
    'hunyuan-video/image-to-video': 'fal-ai/hunyuan-video/image-to-video',
    'hunyuan-video/v1.5/text-to-video': 'fal-ai/hunyuan-video/v1.5/text-to-video',
    'hunyuan-video/video-to-video': 'fal-ai/hunyuan-video/video-to-video',
    'iclight-v2': 'fal-ai/iclight-v2',
    'imageutils/depth': 'fal-ai/imageutils/depth',
    'imageutils/rembg': 'fal-ai/imageutils/rembg',
    'instant-character': 'fal-ai/instant-character',
    'ip-adapter-face-id': 'fal-ai/ip-adapter-face-id',
    'kling-video/o1/reference-to-video': 'fal-ai/kling-video/o1/reference-to-video',
    'kling-video/o3/4k/reference-to-video': 'fal-ai/kling-video/o3/4k/reference-to-video',
    'kling-video/o3/pro/image-to-video': 'fal-ai/kling-video/o3/pro/image-to-video',
    'kling-video/o3/pro/text-to-video': 'fal-ai/kling-video/o3/pro/text-to-video',
    'kling-video/v1.5/pro/image-to-video': 'fal-ai/kling-video/v1.5/pro/image-to-video',
    'kling-video/v1.6/pro/image-to-video': 'fal-ai/kling-video/v1.6/pro/image-to-video',
    'kling-video/v1.6/pro/motion-brush': 'fal-ai/kling-video/v1.6/pro/motion-brush',
    'kling-video/v1.6/standard/image-to-video': 'fal-ai/kling-video/v1.6/standard/image-to-video',
    'kling-video/v1.6/standard/elements': 'fal-ai/kling-video/v1.6/standard/elements',
    'kling-video/v1.6/standard/text-to-video': 'fal-ai/kling-video/v1.6/standard/text-to-video',
    'kling-video/v2.1/pro/image-to-video': 'fal-ai/kling-video/v2.1/pro/image-to-video',
    'kling-video/v3/pro/image-to-video': 'fal-ai/kling-video/v3/pro/image-to-video',
    'kling-video/v3/pro/text-to-video': 'fal-ai/kling-video/v3/pro/text-to-video',
    latentsync: 'fal-ai/latentsync',
    'live-portrait': 'fal-ai/live-portrait',
    'ltx-2.3/image-to-video': 'fal-ai/ltx-2.3/image-to-video',
    'ltx-2.3/text-to-video': 'fal-ai/ltx-2.3/text-to-video',
    'ltx-2.3/text-to-video/fast': 'fal-ai/ltx-2.3/text-to-video/fast',
    'luma-dream-machine/ray-2': 'fal-ai/luma-dream-machine/ray-2',
    'luma-dream-machine/ray-2-flash': 'fal-ai/luma-dream-machine/ray-2-flash',
    'luma-dream-machine/ray-2/image-to-video': 'fal-ai/luma-dream-machine/ray-2/image-to-video',
    'minimax/hailuo-2.3/pro/image-to-video': 'fal-ai/minimax/hailuo-2.3/pro/image-to-video',
    'minimax/hailuo-2.3/pro/text-to-video': 'fal-ai/minimax/hailuo-2.3/pro/text-to-video',
    'minimax/hailuo-2.3/standard/image-to-video': 'fal-ai/minimax/hailuo-2.3/standard/image-to-video',
    'minimax/hailuo-2.3/standard/text-to-video': 'fal-ai/minimax/hailuo-2.3/standard/text-to-video',
    'mochi-v1': 'fal-ai/mochi-v1',
    'normal-bae': 'fal-ai/normal-bae',
    'nsfw-detector': 'fal-ai/nsfw-detector',
    'object-tracking/video': 'fal-ai/object-tracking/video',
    'pika/v2.2/image-to-video': 'fal-ai/pika/v2.2/image-to-video',
    'pika/v2.2/text-to-video': 'fal-ai/pika/v2.2/text-to-video',
    'pixverse/v4.5/text-to-video': 'fal-ai/pixverse/v4.5/text-to-video',
    'pixverse/v4/image-to-video': 'fal-ai/pixverse/v4/image-to-video',
    'pixverse/v5.5/image-to-video': 'fal-ai/pixverse/v5.5/image-to-video',
    'pixverse/v5.5/text-to-video': 'fal-ai/pixverse/v5.5/text-to-video',
    'pixverse/v5.5/video-to-video': 'fal-ai/pixverse/v5.5/video-to-video',
    'real-esrgan': 'fal-ai/real-esrgan',
    'rembg-video': 'fal-ai/rembg-video',
    'rife-interpolation': 'fal-ai/rife-interpolation',
    sadtalker: 'fal-ai/sadtalker',
    'sam-3/3d-objects': 'fal-ai/sam-3/3d-objects',
    'seedance-v1-lite-i2v': 'fal-ai/seedance-v1-lite-i2v',
    'seedance-v1-pro-i2v': 'fal-ai/seedance-v1-pro-i2v',
    'stable-audio': 'fal-ai/stable-audio',
    'stable-video-diffusion': 'fal-ai/stable-video-diffusion',
    'sync-lipsync': 'fal-ai/sync-lipsync',
    'sync-lipsync/v1.9': 'fal-ai/sync-lipsync/v1.9',
    'sync-lipsync/v2/pro': 'fal-ai/sync-lipsync/v2/pro',
    'topaz/upscale/video': 'fal-ai/topaz/upscale/video',
    triposg: 'fal-ai/triposg',
    veo3: 'fal-ai/veo3',
    'veo3.1': 'fal-ai/veo3.1',
    'veo3.1/fast': 'fal-ai/veo3.1/fast',
    'veo3.1/image-to-video': 'fal-ai/veo3.1/image-to-video',
    'veo3/image-to-video': 'fal-ai/veo3/image-to-video',
    'video-inpaint': 'fal-ai/video-inpaint',
    'video-upscaler': 'fal-ai/video-upscaler',
    wan: 'fal-ai/wan',
    'void-video-inpainting': 'fal-ai/void-video-inpainting',
    'wan-vace-14b/inpainting': 'fal-ai/wan-vace-14b/inpainting',
    'wan/v2.2/a14b/video-to-video': 'fal-ai/wan/v2.2/a14b/video-to-video',
    'wan/v2.6/image-to-video': 'fal-ai/wan/v2.6/image-to-video',
    'wan/v2.6/text-to-video': 'fal-ai/wan/v2.6/text-to-video',
    'wan/v2.7/image-to-video': 'fal-ai/wan/v2.7/image-to-video',
    'wan/v2.7/reference-to-video': 'fal-ai/wan/v2.7/reference-to-video',
    'wan/v2.7/text-to-video': 'fal-ai/wan/v2.7/text-to-video',
    'kling-video/o1/image-to-video': 'fal-ai/kling-video/o1/image-to-video',
    'pika/v2/pikaswaps': 'fal-ai/pika/v2/pikaswaps',
    'qwen-image-edit-2511-multiple-angles': 'fal-ai/qwen-image-edit-2511-multiple-angles',
    whisper: 'fal-ai/whisper',
    'workflow-utilities/trim-video': 'fal-ai/workflow-utilities/trim-video',
};
function falEndpoint(key) {
    const id = exports.ENDPOINT_CATALOG[key];
    if (!id)
        throw new Error(`Unknown submitted endpoint: ${key}`);
    return id;
}
/** Whisper speech-to-text. Live OpenAPI 200: audio_url required, chunk_level word|segment|none. */
function buildWhisperSttInput(input) {
    const audioUrl = input.audioUrl.trim();
    if (!audioUrl)
        throw new Error('Whisper requires audio_url');
    const chunk = input.chunkLevel ?? 'word';
    return { audio_url: audioUrl, task: 'transcribe', chunk_level: chunk };
}
/** Qwen multi-angle edit. Live OpenAPI 200 on 2026-09-29. Required image_urls. horizontal_angle 0–360. */
function buildQwenAnglesInput(input) {
    const imageUrl = input.imageUrl.trim();
    if (!imageUrl)
        throw new Error('Angle generation requires an image');
    const horizontal = Math.min(360, Math.max(0, input.horizontalAngle));
    const prompt = input.prompt?.trim();
    return {
        endpoint: falEndpoint('qwen-image-edit-2511-multiple-angles'),
        input: {
            image_urls: [imageUrl],
            horizontal_angle: horizontal,
            ...(prompt ? { additional_prompt: prompt } : {}),
        },
    };
}
/** Flux dev text-to-image. Live OpenAPI 200, same id as the image-model registry. */
function buildFluxDevT2iInput(prompt) {
    const text = prompt.trim();
    if (text.length < 3)
        throw new Error('Image prompt is too short');
    return { endpoint: falEndpoint('flux/dev'), input: { prompt: text } };
}
//# sourceMappingURL=endpointCatalog.js.map
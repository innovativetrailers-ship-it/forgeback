"use strict";
/**
 * TR-01 trainer + LoRA-inference registry.
 * OpenAPI probed 2026-09-25. Every live id returned 200 on
 * GET https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>
 * plus llms.txt for cost and dataset shape. 404 ids are listed as UNVERIFIED
 * and must not be submitted. Does not add these models to the generation pool
 * (TR-06) and does not call trainers (TR-02).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPEN_TRAINER_BASES = exports.OPEN_WEIGHT_BASES = exports.UNVERIFIED_ENDPOINT_IDS = exports.VOICE_CLONE_ON_FAL = exports.ELEVENLABS_ON_FAL = exports.MOTION_TRANSFER_ENDPOINTS = exports.UTILITY_ENDPOINTS = exports.LORA_PRESET_ENDPOINTS = exports.LORA_INFERENCE_REGISTRY = exports.TRAINER_REGISTRY = exports.DATASET_MEDIA = exports.TRAINER_TRAINS = void 0;
exports.loraMechanism = loraMechanism;
exports.trainerDef = trainerDef;
exports.trainerByEndpoint = trainerByEndpoint;
exports.trainersFor = trainersFor;
exports.loraInferenceDef = loraInferenceDef;
exports.loraCapableBases = loraCapableBases;
exports.loraPassFor = loraPassFor;
exports.primaryCastTrainer = primaryCastTrainer;
exports.TRAINER_TRAINS = [
    'character',
    'style',
    'motion',
    'audio_style',
    'image_style',
];
exports.DATASET_MEDIA = ['image', 'video', 'audio'];
const LORAS_PATH = {
    field: 'loras',
    itemPath: 'path',
    itemScale: 'scale',
    required: true,
    triggerInPrompt: true,
};
const LORAS_OPTIONAL = { ...LORAS_PATH, required: false };
exports.TRAINER_REGISTRY = {
    'h3-t2v': {
        id: 'minimax/h3/t2v/trainer',
        trains: 'style',
        base: 'minimax-h3',
        dataset: {
            types: ['video'],
            minItems: 10,
            captions: true,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'minimax/h3/text-to-video/lora',
        crossMode: [
            'minimax/h3/text-to-video/lora',
            'minimax/h3/image-to-video/lora',
            'minimax/h3/reference-to-video/lora',
        ],
        costPerStep: 0.005,
    },
    'h3-ref2va': {
        id: 'minimax/h3/ref2va/trainer',
        trains: 'character',
        base: 'minimax-h3',
        dataset: {
            types: ['video', 'image'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'minimax/h3/reference-to-video/lora',
        crossMode: [
            'minimax/h3/text-to-video/lora',
            'minimax/h3/image-to-video/lora',
            'minimax/h3/reference-to-video/lora',
        ],
        costPerStep: 0.015,
        costNote: 'llms.txt 2026-09-25: 0.015 per step (catalog 0.005 was wrong)',
    },
    'h3-i2v': {
        id: 'minimax/h3/i2v/trainer',
        trains: 'character',
        base: 'minimax-h3',
        dataset: {
            types: ['video'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'minimax/h3/image-to-video/lora',
        crossMode: [
            'minimax/h3/text-to-video/lora',
            'minimax/h3/image-to-video/lora',
            'minimax/h3/reference-to-video/lora',
        ],
        costPerStep: 0.01,
    },
    'h3-flf2v': {
        id: 'minimax/h3/flf2v/trainer',
        trains: 'motion',
        base: 'minimax-h3',
        dataset: {
            types: ['video'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'minimax/h3/image-to-video/lora',
        crossMode: [
            'minimax/h3/text-to-video/lora',
            'minimax/h3/image-to-video/lora',
            'minimax/h3/reference-to-video/lora',
        ],
        costPerStep: 0.01,
    },
    'wan-22': {
        id: 'fal-ai/wan-22-trainer',
        trains: 'character',
        base: 'wan-2.2',
        dataset: {
            types: ['image', 'video'],
            minItems: 1,
            captions: false,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'fal-ai/wan/v2.2-a14b/text-to-video/lora',
        crossMode: [
            'fal-ai/wan/v2.2-a14b/text-to-video/lora',
            'fal-ai/wan/v2.2-a14b/image-to-video/lora',
        ],
        costPerStep: 0.005,
        costNote: 'Open-weight Wan 2.2 trainer. Live OpenAPI 200 on 2026-09-28.',
    },
    'wan-21-video': {
        id: 'fal-ai/wan-trainer',
        trains: 'style',
        base: 'wan-2.1',
        dataset: {
            types: ['image', 'video'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'fal-ai/wan-i2v-lora',
        costPerStep: 0.005,
    },
    'ltx-2-video': {
        id: 'fal-ai/ltx2-video-trainer',
        trains: 'style',
        base: 'ltx-2',
        dataset: {
            types: ['video', 'image'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'fal-ai/ltx-2-19b/text-to-video/lora',
        crossMode: [
            'fal-ai/ltx-2-19b/text-to-video/lora',
            'fal-ai/ltx-2-19b/image-to-video/lora',
            'fal-ai/ltx-2-19b/video-to-video/lora',
            'fal-ai/ltx-2-19b/audio-to-video/lora',
        ],
        costPerStep: 0.0048,
    },
    'ltx-23-video': {
        id: 'fal-ai/ltx23-video-trainer',
        trains: 'style',
        base: 'ltx-2.3',
        dataset: {
            types: ['video', 'image'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'training_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'fal-ai/ltx-2-19b/text-to-video/lora',
        crossMode: [
            'fal-ai/ltx-2-19b/text-to-video/lora',
            'fal-ai/ltx-2-19b/image-to-video/lora',
            'fal-ai/ltx-2-19b/video-to-video/lora',
        ],
        costPerStep: 0.0048,
    },
    'flux-portrait': {
        id: 'fal-ai/flux-lora-portrait-trainer',
        trains: 'character',
        base: 'flux',
        dataset: {
            types: ['image'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'images_data_url',
            triggerField: 'trigger_phrase',
        },
        loraInference: 'fal-ai/flux-lora',
        costPerStep: 0.0024,
        costNote: 'llms.txt wording is "$0.0024 cents per step"; min 1000 steps billed',
    },
    // Intentional trainer option: a fast Flux LoRA path, kept by decision (Neo, 2026-09-27).
    // This is a trainer def the one spine consumes, not a second submit path.
    // It reaches FAL only through startTraining (src/lib/training/start.ts:22 → submitToFal),
    // which is pause-gated at start.ts:32.
    'flux-fast': {
        id: 'fal-ai/flux-lora-fast-training',
        trains: 'image_style',
        base: 'flux',
        dataset: {
            types: ['image'],
            minItems: 10,
            captions: false,
            triggerPhrase: true,
            urlField: 'images_data_url',
            triggerField: 'trigger_word',
        },
        loraInference: 'fal-ai/flux-lora',
        costPerStep: 0.002,
        costNote: 'llms.txt: $2 per default training run, scales with steps. Catalog id flux-lora-fast-trainer 404d.',
    },
    'flux-2': {
        id: 'fal-ai/flux-2-trainer',
        trains: 'image_style',
        base: 'flux-2',
        dataset: {
            types: ['image'],
            minItems: 10,
            captions: false,
            triggerPhrase: false,
            urlField: 'image_data_url',
        },
        loraInference: 'fal-ai/flux-2/lora',
        costPerStep: 0.0064,
    },
    'flux-2-klein-9b': {
        id: 'fal-ai/flux-2-klein-9b-base-trainer',
        trains: 'image_style',
        base: 'flux-2-klein-9b',
        dataset: {
            types: ['image'],
            minItems: 10,
            captions: false,
            triggerPhrase: false,
            urlField: 'image_data_url',
        },
        loraInference: 'fal-ai/flux-2/klein/9b/base/lora',
        crossMode: [
            'fal-ai/flux-2/klein/9b/base/lora',
            'fal-ai/flux-2/klein/9b/base/edit/lora',
            'fal-ai/flux-2/klein/9b/edit/lora',
        ],
        costPerStep: 0.0043,
    },
    'z-image': {
        id: 'fal-ai/z-image-trainer',
        trains: 'image_style',
        base: 'z-image',
        dataset: {
            types: ['image'],
            minItems: 10,
            captions: false,
            triggerPhrase: false,
            urlField: 'image_data_url',
        },
        loraInference: 'fal-ai/z-image/turbo/lora',
        crossMode: ['fal-ai/z-image/turbo/lora', 'fal-ai/z-image/base/lora'],
        costPerStep: 0.00226,
    },
    'stable-audio-3': {
        id: 'fal-ai/stable-audio-3-trainer',
        trains: 'audio_style',
        base: 'stable-audio-3',
        dataset: {
            types: ['audio'],
            minItems: 4,
            captions: true,
            triggerPhrase: false,
            urlField: 'audio_data_url',
        },
        loraInference: 'fal-ai/stable-audio-3/medium/base/text-to-audio/lora',
        crossMode: [
            'fal-ai/stable-audio-3/medium/base/text-to-audio/lora',
            'fal-ai/stable-audio-3/medium/base/audio-to-audio/lora',
            'fal-ai/stable-audio-3/medium/base/audio-inpainting/lora',
        ],
        costPerStep: 0.003,
        costNote: 'llms.txt: $3.00 per 1000 steps',
    },
};
const AUDIO_LORA = { ...LORAS_OPTIONAL, itemTarget: 'target' };
exports.LORA_INFERENCE_REGISTRY = {
    'minimax/h3/text-to-video/lora': {
        id: 'minimax/h3/text-to-video/lora',
        base: 'minimax-h3',
        kind: 'text',
        lora: LORAS_PATH,
    },
    'minimax/h3/image-to-video/lora': {
        id: 'minimax/h3/image-to-video/lora',
        base: 'minimax-h3',
        kind: 'first_frame',
        lora: LORAS_PATH,
    },
    'minimax/h3/reference-to-video/lora': {
        id: 'minimax/h3/reference-to-video/lora',
        base: 'minimax-h3',
        kind: 'reference',
        lora: LORAS_PATH,
    },
    'fal-ai/wan-i2v-lora': {
        id: 'fal-ai/wan-i2v-lora',
        base: 'wan-2.1',
        kind: 'first_frame',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/wan-t2v-lora': {
        id: 'fal-ai/wan-t2v-lora',
        base: 'wan-2.1',
        kind: 'text',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/wan/v2.2-a14b/text-to-video/lora': {
        id: 'fal-ai/wan/v2.2-a14b/text-to-video/lora',
        base: 'wan-2.2',
        kind: 'text',
        lora: LORAS_PATH,
    },
    'fal-ai/wan/v2.2-a14b/image-to-video/lora': {
        id: 'fal-ai/wan/v2.2-a14b/image-to-video/lora',
        base: 'wan-2.2',
        kind: 'first_frame',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/text-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/text-to-video/lora',
        base: 'ltx-2',
        kind: 'text',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/image-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/image-to-video/lora',
        base: 'ltx-2',
        kind: 'first_frame',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/video-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/video-to-video/lora',
        base: 'ltx-2',
        kind: 'video_edit',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/audio-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/audio-to-video/lora',
        base: 'ltx-2',
        kind: 'audio',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/distilled/text-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/distilled/text-to-video/lora',
        base: 'ltx-2-distilled',
        kind: 'text',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/distilled/image-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/distilled/image-to-video/lora',
        base: 'ltx-2-distilled',
        kind: 'first_frame',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/distilled/audio-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/distilled/audio-to-video/lora',
        base: 'ltx-2-distilled',
        kind: 'audio',
        lora: LORAS_PATH,
    },
    'fal-ai/ltx-2-19b/distilled/video-to-video/lora': {
        id: 'fal-ai/ltx-2-19b/distilled/video-to-video/lora',
        base: 'ltx-2-distilled',
        kind: 'video_edit',
        lora: LORAS_PATH,
    },
    'fal-ai/flux-lora': {
        id: 'fal-ai/flux-lora',
        base: 'flux',
        kind: 'image',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/flux-kontext-lora': {
        id: 'fal-ai/flux-kontext-lora',
        base: 'flux-kontext',
        kind: 'image_edit',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/flux-2/lora': {
        id: 'fal-ai/flux-2/lora',
        base: 'flux-2',
        kind: 'image',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/flux-2/klein/9b/base/lora': {
        id: 'fal-ai/flux-2/klein/9b/base/lora',
        base: 'flux-2-klein-9b',
        kind: 'image',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/flux-2/klein/9b/base/edit/lora': {
        id: 'fal-ai/flux-2/klein/9b/base/edit/lora',
        base: 'flux-2-klein-9b',
        kind: 'image_edit',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/flux-2/klein/9b/edit/lora': {
        id: 'fal-ai/flux-2/klein/9b/edit/lora',
        base: 'flux-2-klein-9b',
        kind: 'image_edit',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/z-image/turbo/lora': {
        id: 'fal-ai/z-image/turbo/lora',
        base: 'z-image',
        kind: 'image',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/z-image/base/lora': {
        id: 'fal-ai/z-image/base/lora',
        base: 'z-image',
        kind: 'image',
        lora: LORAS_OPTIONAL,
    },
    'fal-ai/stable-audio-3/medium/base/text-to-audio/lora': {
        id: 'fal-ai/stable-audio-3/medium/base/text-to-audio/lora',
        base: 'stable-audio-3',
        kind: 'audio',
        lora: AUDIO_LORA,
    },
    'fal-ai/stable-audio-3/medium/base/audio-to-audio/lora': {
        id: 'fal-ai/stable-audio-3/medium/base/audio-to-audio/lora',
        base: 'stable-audio-3',
        kind: 'audio',
        lora: AUDIO_LORA,
    },
    'fal-ai/stable-audio-3/medium/base/audio-inpainting/lora': {
        id: 'fal-ai/stable-audio-3/medium/base/audio-inpainting/lora',
        base: 'stable-audio-3',
        kind: 'audio',
        lora: AUDIO_LORA,
    },
};
/** Baked style presets — lora_scale, not a user loras[] array. */
exports.LORA_PRESET_ENDPOINTS = {
    'fal-ai/flux-2-lora-gallery/sepia-vintage': { scaleField: 'lora_scale' },
};
exports.UTILITY_ENDPOINTS = {
    sam3ImageRle: 'fal-ai/sam-3/image-rle',
    sam3dObjects: 'fal-ai/sam-3/3d-objects',
    sam3dBody: 'fal-ai/sam-3/3d-body',
};
exports.MOTION_TRANSFER_ENDPOINTS = {
    wanAnimate2: 'fal-ai/wan-animate-2',
    wan22Animate: 'fal-ai/wan-22-animate',
};
var elevenlabs_1 = require("./elevenlabs");
Object.defineProperty(exports, "ELEVENLABS_ON_FAL", { enumerable: true, get: function () { return elevenlabs_1.ELEVENLABS_ENDPOINTS; } });
/** MiniMax clone stays a trainer. ElevenLabs clone is fal-ai/elevenlabs/clone-voice (MP-15). */
exports.VOICE_CLONE_ON_FAL = {
    elevenlabsCloneVoice: 'fal-ai/elevenlabs/clone-voice',
    minimaxVoiceClone: 'fal-ai/minimax/voice-clone',
};
exports.UNVERIFIED_ENDPOINT_IDS = [
    'fal-ai/flux-lora-fast-trainer',
    'fal-ai/flux-lora-inpaint',
    'fal-ai/flux/inpaint/lora',
    'fal-ai/flux-2/inpaint/lora',
    'fal-ai/flux-satellite',
    'fal-ai/flux-geo',
    'fal-ai/elevenlabs/voice-clone',
    'fal-ai/elevenlabs/voice-design',
    'fal-ai/wan/v2.2/image-to-video/lora',
    'fal-ai/ltx-2.3/trainer',
];
/** How a trained LoRA is run. Null when this trainer has no verified inference id. */
/** Pinned open-weight training bases. Not hosted council models. Live OpenAPI 200 on 2026-09-28. */
exports.OPEN_WEIGHT_BASES = {
    'wan-2.2': {
        class: 'open-weight-base',
        pinned: true,
        license: 'Apache-2.0',
        t2vA14b: 'fal-ai/wan/v2.2-a14b/text-to-video',
        ti2v5b: 'fal-ai/wan/v2.2-5b/text-to-video',
        trainer: 'fal-ai/wan-22-trainer',
        loraText: 'fal-ai/wan/v2.2-a14b/text-to-video/lora',
        loraImage: 'fal-ai/wan/v2.2-a14b/image-to-video/lora',
    },
};
exports.OPEN_TRAINER_BASES = new Set([
    'wan-2.2',
    'wan-2.1',
    'flux',
    'flux-2',
    'flux-2-klein-9b',
    'ltx-2',
    'ltx-2.3',
    'z-image',
    'stable-audio-3',
]);
function loraMechanism(trainer) {
    if (!trainer.loraInference)
        return null;
    const pass = exports.LORA_INFERENCE_REGISTRY[trainer.loraInference];
    if (!pass)
        return null;
    return {
        kind: 'dedicated_endpoint',
        endpoint: pass.id,
        loraField: pass.lora.field,
    };
}
function trainerDef(key) {
    return exports.TRAINER_REGISTRY[key];
}
function trainerByEndpoint(id) {
    return Object.values(exports.TRAINER_REGISTRY).find((row) => row.id === id);
}
function trainersFor(trains) {
    return Object.values(exports.TRAINER_REGISTRY).filter((row) => row.trains === trains);
}
function loraInferenceDef(endpoint) {
    return exports.LORA_INFERENCE_REGISTRY[endpoint];
}
/** Model bases that have a verified LoRA inference endpoint in this registry. */
function loraCapableBases() {
    return [...new Set(Object.values(exports.LORA_INFERENCE_REGISTRY).map((row) => row.base))];
}
function loraPassFor(endpoint) {
    return exports.LORA_INFERENCE_REGISTRY[endpoint]?.lora;
}
function primaryCastTrainer() {
    const row = exports.TRAINER_REGISTRY['wan-22'];
    if (!row)
        throw new Error('wan-22 trainer missing from registry');
    return row;
}
//# sourceMappingURL=trainerRegistry.js.map
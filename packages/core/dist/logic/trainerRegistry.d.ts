/**
 * TR-01 trainer + LoRA-inference registry.
 * OpenAPI probed 2026-09-25. Every live id returned 200 on
 * GET https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>
 * plus llms.txt for cost and dataset shape. 404 ids are listed as UNVERIFIED
 * and must not be submitted. Does not add these models to the generation pool
 * (TR-06) and does not call trainers (TR-02).
 */
export declare const TRAINER_TRAINS: readonly ["character", "style", "motion", "audio_style", "image_style"];
export type TrainerTrains = (typeof TRAINER_TRAINS)[number];
export declare const DATASET_MEDIA: readonly ["image", "video", "audio"];
export type DatasetMedia = (typeof DATASET_MEDIA)[number];
export interface TrainerDataset {
    types: DatasetMedia[];
    minItems: number;
    captions: boolean;
    triggerPhrase: boolean;
    urlField: 'training_data_url' | 'images_data_url' | 'image_data_url' | 'audio_data_url';
    triggerField?: 'trigger_phrase' | 'trigger_word';
}
export interface TrainerDef {
    id: string;
    trains: TrainerTrains;
    base: string;
    dataset: TrainerDataset;
    /**
     * Dedicated /lora inference id. Null means the LoRA cannot be run — do not register that trainer.
     * Every live id is a dedicated endpoint (kind dedicated_endpoint), not the bare base model.
     * The payload field is the matching LORA_INFERENCE_REGISTRY pass (loras[].path, or target for audio).
     */
    loraInference: string | null;
    crossMode?: string[];
    costPerStep: number;
    costNote?: string;
}
export interface LoraPass {
    field: 'loras';
    itemPath: 'path';
    itemScale: 'scale';
    required: boolean;
    triggerInPrompt: true;
    itemTarget?: 'target';
}
export interface LoraInferenceDef {
    id: string;
    base: string;
    kind: 'text' | 'first_frame' | 'reference' | 'video_edit' | 'image' | 'image_edit' | 'audio';
    lora: LoraPass;
}
export declare const TRAINER_REGISTRY: Record<string, TrainerDef>;
export declare const LORA_INFERENCE_REGISTRY: Record<string, LoraInferenceDef>;
/** Baked style presets — lora_scale, not a user loras[] array. */
export declare const LORA_PRESET_ENDPOINTS: {
    'fal-ai/flux-2-lora-gallery/sepia-vintage': {
        scaleField: "lora_scale";
    };
};
export declare const UTILITY_ENDPOINTS: {
    readonly sam3ImageRle: "fal-ai/sam-3/image-rle";
    readonly sam3dObjects: "fal-ai/sam-3/3d-objects";
    readonly sam3dBody: "fal-ai/sam-3/3d-body";
};
export declare const MOTION_TRANSFER_ENDPOINTS: {
    readonly wanAnimate2: "fal-ai/wan-animate-2";
    readonly wan22Animate: "fal-ai/wan-22-animate";
};
export { ELEVENLABS_ENDPOINTS as ELEVENLABS_ON_FAL } from './elevenlabs';
/** MiniMax clone stays a trainer. ElevenLabs clone is fal-ai/elevenlabs/clone-voice (MP-15). */
export declare const VOICE_CLONE_ON_FAL: {
    readonly elevenlabsCloneVoice: "fal-ai/elevenlabs/clone-voice";
    readonly minimaxVoiceClone: "fal-ai/minimax/voice-clone";
};
export declare const UNVERIFIED_ENDPOINT_IDS: readonly ["fal-ai/flux-lora-fast-trainer", "fal-ai/flux-lora-inpaint", "fal-ai/flux/inpaint/lora", "fal-ai/flux-2/inpaint/lora", "fal-ai/flux-satellite", "fal-ai/flux-geo", "fal-ai/elevenlabs/voice-clone", "fal-ai/elevenlabs/voice-design", "fal-ai/wan/v2.2/image-to-video/lora", "fal-ai/ltx-2.3/trainer"];
export interface LoraInferenceMechanism {
    kind: 'dedicated_endpoint';
    endpoint: string;
    loraField: 'loras';
}
/** How a trained LoRA is run. Null when this trainer has no verified inference id. */
/** Pinned open-weight training bases. Not hosted council models. Live OpenAPI 200 on 2026-09-28. */
export declare const OPEN_WEIGHT_BASES: {
    readonly 'wan-2.2': {
        readonly class: "open-weight-base";
        readonly pinned: true;
        readonly license: "Apache-2.0";
        readonly t2vA14b: "fal-ai/wan/v2.2-a14b/text-to-video";
        readonly ti2v5b: "fal-ai/wan/v2.2-5b/text-to-video";
        readonly trainer: "fal-ai/wan-22-trainer";
        readonly loraText: "fal-ai/wan/v2.2-a14b/text-to-video/lora";
        readonly loraImage: "fal-ai/wan/v2.2-a14b/image-to-video/lora";
    };
};
export declare const OPEN_TRAINER_BASES: Set<string>;
export declare function loraMechanism(trainer: TrainerDef): LoraInferenceMechanism | null;
export declare function trainerDef(key: string): TrainerDef | undefined;
export declare function trainerByEndpoint(id: string): TrainerDef | undefined;
export declare function trainersFor(trains: TrainerTrains): TrainerDef[];
export declare function loraInferenceDef(endpoint: string): LoraInferenceDef | undefined;
/** Model bases that have a verified LoRA inference endpoint in this registry. */
export declare function loraCapableBases(): string[];
export declare function loraPassFor(endpoint: string): LoraPass | undefined;
export declare function primaryCastTrainer(): TrainerDef;

import type { Mode, ModelDef } from '../types/provider';
import { type PurposeScore } from './learn';
import type { LearnedByPurpose } from './modelKnowledge';
export declare const TRAINED_ASSET_TYPES: readonly ["character", "style", "audio_style"];
export type TrainedAssetType = (typeof TRAINED_ASSET_TYPES)[number];
export declare const VOICE_SOURCES: readonly ["cloned", "designed"];
export type VoiceSource = (typeof VOICE_SOURCES)[number];
export interface TrainedAsset {
    id: string;
    userId: string;
    name: string;
    description?: string | null;
    type: TrainedAssetType;
    loraUrl: string;
    configUrl?: string | null;
    triggerPhrase?: string | null;
    trainerId: string;
    loraInference: string | null;
    subcategory: string;
    linkedCharacterId?: string | null;
    deletedAt?: string | null;
}
export interface VoiceAsset {
    id: string;
    userId: string;
    name: string;
    voiceId: string;
    source: VoiceSource;
    linkedCharacterId?: string | null;
}
export interface LoraAssetRef {
    loraUrl: string;
    triggerPhrase?: string | null;
    loraInference?: string | null;
    scale?: number;
}
export declare function isTrainedAssetType(value: string): value is TrainedAssetType;
export declare function isVoiceSource(value: string): value is VoiceSource;
export declare function assetTypeFromTrainer(trains: string): TrainedAssetType;
export declare function isLoraCapableEndpoint(endpoint: string): boolean;
export declare function loraCapableEndpoints(): string[];
export declare function isVideoLoraEndpoint(endpoint: string): boolean;
export declare function endpointAcceptsAsset(endpoint: string, asset: LoraAssetRef): boolean;
export declare class MissingLoraPathError extends Error {
    constructor(endpoint: string);
}
export declare function loraEndpointForMode(asset: LoraAssetRef, mode: Mode): string | null;
export declare function applyLoraPass(endpoint: string, payload: Record<string, unknown>, promptKey: string, assets: LoraAssetRef[], properties?: Iterable<string>): void;
/** Resolvable ModelDef for a verified /lora inference id. Not a council pool member. */
export declare function loraInferenceModelDef(id: string): ModelDef | undefined;
export declare function emptyLearnedCell(): PurposeScore;
export declare function shouldDelegateTrainedLora(input: {
    purpose: string;
    consistencyNeed?: number;
    hasLoraAsset: boolean;
    assetType?: TrainedAssetType | null;
    modelOverride?: string | null;
    learned?: Record<string, Partial<LearnedByPurpose>>;
    loraEndpoint: string | null;
}): boolean;
export declare const TRAINED_LORA_DELEGATION = "using trained LoRA for consistency";

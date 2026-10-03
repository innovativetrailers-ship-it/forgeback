import type { ModelConstraints } from '../types/provider';
import { type LoraAssetRef } from './trainedAsset';
export interface PayloadShot {
    prompt: string;
    duration: number;
    aspectRatio?: string;
    resolution?: string;
    anchorUrl?: string;
    imageUrl?: string;
    negativePrompt?: string;
    quality?: string;
    seed?: number;
    shotIndex?: number;
    characterLora?: LoraAssetRef;
    styleLora?: LoraAssetRef;
    audioLora?: LoraAssetRef;
}
export interface PayloadBuildOptions {
    onClamp?: (field: string, want: unknown, picked: unknown, endpoint: string) => void;
    /** Grok is the one audio-native model. FAL video stays silent. */
    nativeAudio?: boolean;
    onAudioDisabled?: (field: string, endpoint: string) => void;
    /** Family-map duration. When set, stored OpenAPI enums are not a second duration source. */
    durationConstraint?: DurationConstraint;
}
/** RANGE: every integer from min to max. SET: only the listed values. */
export type DurationConstraint = {
    shape: 'range';
    min: number;
    max: number;
    wire: 'string' | 'number';
    fallback: number;
} | {
    shape: 'set';
    values: readonly (string | number)[];
    fallback: number;
};
export declare function clampDuration(seconds: number | undefined, constraint: DurationConstraint, endpoint: string, onClamp?: PayloadBuildOptions['onClamp']): string | number;
/** Audio toggles seen on FAL video schemas. Off value is boolean false. */
export declare const AUDIO_TOGGLE_FIELDS: readonly ["generate_audio", "audio_enabled", "enable_audio", "generate_audio_switch", "with_audio"];
/**
 * Force every known audio toggle off.
 * Veo 3.1's published input field is generate_audio (default true). The local
 * constraint seed has no Veo OpenAPI document, so Veo always sets that field
 * even when the cached property list omitted it.
 */
export declare function silenceVideoAudio(endpoint: string, payload: Record<string, unknown>, properties?: Iterable<string>, nativeAudio?: boolean): string[];
/** Single duration-clamp log. Family snaps and buildPayload's onClamp both call this. */
export declare function logPayloadClamp(field: string, from: unknown, to: unknown, endpoint: string, shotId?: string | number | null): void;
export declare function snapEnum(field: string, want: unknown, allowed: (string | number)[], endpoint: string, onClamp?: PayloadBuildOptions['onClamp']): string | number;
export declare class PayloadError extends Error {
    constructor(message: string);
}
/**
 * Schema-driven payload. The host fetches and caches ModelConstraints, then
 * passes them in. This function does not fetch.
 */
export declare function buildPayload(endpoint: string, shot: PayloadShot, constraints: ModelConstraints, options?: PayloadBuildOptions): Record<string, unknown>;

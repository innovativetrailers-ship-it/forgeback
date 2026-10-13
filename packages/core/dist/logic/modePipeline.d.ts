import type { AnchorSource } from '../types/entities';
import type { FamilyFieldMap, Mode } from '../types/provider';
import { type PromptCamera } from './identity';
/**
 * Mode-pipeline model. The live registry ModelDef stays as it is.
 * A family prompt copies one entry into this shape. MP-01 wires none.
 */
export interface ModeModel {
    id: string;
    provider: 'fal';
    endpoints: Partial<Record<Mode, string>>;
    fields: FamilyFieldMap;
    limits: {
        maxPromptChars: number;
    };
    nativeAudio: boolean;
}
export interface ModeShot {
    prompt: string;
    durationSec?: number | null;
    anchorFrameUrl?: string | null;
    endFrameUrl?: string | null;
    /** Anchor-chain continuation. Also true when anchorSource is 'auto'. */
    continueExactFrame?: boolean;
    anchorSource?: AnchorSource;
    characterIds?: string[];
    locationId?: string | null;
    sourceVideoUrl?: string | null;
    audioWanted?: boolean;
    resolution?: string;
    aspectRatio?: string;
    camera?: PromptCamera | null;
    genrePresetId?: string | null;
    referenceUrls?: string[];
    characters?: {
        name?: string;
        referenceImageUrl?: string | null;
    }[];
    location?: {
        plateUrl?: string | null;
    } | null;
    playbookFragment?: string;
}
export interface OpenApiSchema {
    endpoint: string;
    required: string[];
    properties: string[];
    enums: Record<string, (string | number)[]>;
    videoField?: string;
}
export interface ResolvedMode {
    model: ModeModel;
    mode: Mode;
    endpoint: string;
}
export declare function shotMode(shot: ModeShot): Mode;
export declare function resolveEndpoint(model: ModeModel, shot: ModeShot, pool: ModeModel[]): ResolvedMode;
export declare function assertResolvedEndpoint(model: ModeModel, shot: ModeShot, pool: ModeModel[], endpoint: string): ResolvedMode;
export declare function getOpenApiSchema(endpoint: string, fetchImpl?: typeof fetch): Promise<OpenApiSchema>;
export declare function setDuration(payload: Record<string, unknown>, spec: FamilyFieldMap['duration'], durationSec: number): void;
export declare function setAudio(payload: Record<string, unknown>, audio: FamilyFieldMap['audio']): void;
export declare function setResAspect(payload: Record<string, unknown>, fields: FamilyFieldMap, shot: ModeShot): void;
export declare function applySchema(payload: Record<string, unknown>, schema: OpenApiSchema): void;
export declare function resolveShotRefs(shot: ModeShot): string[];
export declare function applyReferences(payload: Record<string, unknown>, model: ModeModel, shot: ModeShot): void;
/** Instant genre preset: prompt look + grade + grain + pacing. Empty when unset. */
export declare function styleFragment(shot: ModeShot, _model: ModeModel): string;
export declare function composePrompt(model: ModeModel, shot: ModeShot, mode: Mode): string;
export declare function buildModePayload(model: ModeModel, shot: ModeShot, pool: ModeModel[]): Promise<{
    endpoint: string;
    payload: Record<string, unknown>;
}>;

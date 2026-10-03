import { type TimelineClipContract } from './timelineContract';
export declare const ENTITY_KINDS: readonly ["character", "location", "asset"];
export type EntityKind = (typeof ENTITY_KINDS)[number];
export declare const RESOLUTION_STATES: readonly ["unresolved", "imported", "generated", "trained"];
export type ResolutionState = (typeof RESOLUTION_STATES)[number];
export type IngestRichness = 'plan' | 'screenplay' | 'idea';
export interface ShotEntityRef {
    entityId: string;
    variantId?: string;
}
export interface EntityVariation {
    variantId: string;
    label: string;
    generatedFrom: string;
    modifierPrompt: string;
    generatedImage?: string | null;
    resolutionState: ResolutionState;
    appearsInShots: string[];
}
export interface BreakdownShot {
    id: string;
    type?: string;
    angle?: string;
    movement?: string;
    duration: number;
    description: string;
    entityRefs: ShotEntityRef[];
    continuity?: 'continuous' | 'cut';
}
export interface BreakdownScene {
    id: string;
    location?: string;
    timeOfDay?: string;
    description?: string;
    shots: BreakdownShot[];
}
export interface BreakdownEntity {
    id: string;
    kind: EntityKind;
    name: string;
    descriptor: string;
    appearsInShots: string[];
    isPrimary?: boolean;
    variations?: EntityVariation[];
}
export interface ProductionBreakdown {
    scenes: BreakdownScene[];
    entities: BreakdownEntity[];
}
export interface TrainedLoRARef {
    weightsKey: string;
    baseModel: string;
    baseVersion: string;
    baseBackupKey: string;
}
export interface ResolvableEntity {
    id: string;
    name: string;
    descriptor: string;
    sourcePrompt?: string | null;
    sourceRefs?: string[];
    generatedImage?: string | null;
    trainedLoRA?: TrainedLoRARef | null;
    resolutionState?: ResolutionState | null;
    isPrimary?: boolean;
    variations?: EntityVariation[];
}
export type ResolutionLevel = 'trained' | 'reference' | 'prompt' | 'generate-fresh';
export interface EntityResolution {
    entityId: string;
    variantId?: string;
    level: ResolutionLevel;
    text: string;
    imageUrl?: string;
    lora?: TrainedLoRARef;
    resolutionState: ResolutionState;
    carrier: 'lora' | 'variation' | 'primary' | 'prompt';
}
export interface CompiledShot {
    id: string;
    sceneId: string;
    description: string;
    duration: number;
    continuity: 'continuous' | 'cut';
    entityIds: string[];
    mode: 'text' | 'reference';
    prompt: string;
    imageUrl?: string;
    useLora: boolean;
    useVideoRef: boolean;
    consistencyReason: string;
    modelId: string;
}
export interface CompiledFilm {
    shots: CompiledShot[];
    resolutions: EntityResolution[];
}
export declare function detectIngestRichness(text: string): IngestRichness;
/** Accepts a full plan, a shot array, or a partial object. Missing fields stay optional. */
export declare function normalizeBreakdown(input: unknown): ProductionBreakdown;
export declare function breakdownFromShotRows(rows: unknown[]): ProductionBreakdown;
/** A loose idea still yields one scene, one shot, and no required entities. */
export declare function breakdownFromIdea(text: string, duration?: number): ProductionBreakdown;
export declare function resolutionKey(entityId: string, variantId?: string): string;
export declare function resolveEntity(entity: ResolvableEntity, variantId?: string): EntityResolution;
/** One resolution per (entity, variant) for the whole film. */
export declare function resolveFilm(entities: ResolvableEntity[], shots?: BreakdownShot[]): Map<string, EntityResolution>;
export interface ReferenceDagNode {
    id: string;
    kind: 'primary' | 'variation';
    entityId: string;
    variantId?: string;
    dependsOn: string | null;
    prompt: string;
}
export declare function orderReferenceDag(nodes: ReferenceDagNode[]): ReferenceDagNode[];
export declare function referenceDagFor(entities: BreakdownEntity[]): ReferenceDagNode[];
export declare function referenceDagCredits(nodes: ReferenceDagNode[]): number;
export declare function familyConsistency(modelId: string): {
    lora: boolean;
    videoRef: boolean;
};
export declare function decideConsistency(input: {
    modelId: string;
    wantsLora: boolean;
    wantsVideoRef: boolean;
    continuous: boolean;
    entityCritical: boolean;
}): {
    useLora: boolean;
    useVideoRef: boolean;
    reason: string;
};
export declare function autoGenSelection(entities: BreakdownEntity[], explicitIds?: string[]): {
    selected: BreakdownEntity[];
    skipped: BreakdownEntity[];
};
export declare function compileProductionPlan(input: {
    breakdown: ProductionBreakdown;
    entities: ResolvableEntity[];
    modelId?: string;
}): CompiledFilm;
export declare function landCompiledShots<T extends TimelineClipContract>(input: {
    existing: T[];
    incoming: T[];
    suppressedIds?: readonly string[];
}): {
    clips: T[];
    added: number;
    updated: number;
};

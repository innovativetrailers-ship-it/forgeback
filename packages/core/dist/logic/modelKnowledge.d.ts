import type { Mode } from '../types/provider';
import { type ShotPurpose } from './premiseLock';
import { type OutcomeSource } from './learn';
import { type TasteProfile } from './ratings';
/**
 * Model-knowledge store. Retrieval is by shot need. A new model is an indexed
 * entry; queryModelRAG reads whatever is in the store.
 * Layer 1 is seeded from the family maps and the verified tool matrix.
 * Layer 2 is the live ModeModel endpoints (refreshed from OpenAPI when a host
 * calls refreshLiveCapability). Layer 3 starts empty until OR-04 writes scores.
 */
export type KnowledgeTier = 'draft' | 'standard' | 'premium';
export type QualityConstraint = 'draft' | 'standard' | 'blockbuster';
export interface ToolCapability {
    camera: boolean;
    reference: boolean;
    firstLast: boolean;
    nativeAudio: boolean;
    voice: boolean;
    videoReference: boolean;
}
export interface ModelKnowledgeDoc {
    strengths: string[];
    weaknesses: string[];
    bestFor: ShotPurpose[];
    tools: ToolCapability;
    cost: {
        perSecond: Record<string, number>;
        tier: KnowledgeTier;
    };
    ranks: {
        consistency: number;
        motion: number;
        camera: number;
        audio: number;
        quality: number;
    };
    maxDuration: number;
    nativeAudio: boolean;
    videoRefCapable: boolean;
}
export type LearnedByPurpose = Record<ShotPurpose, {
    worked: number;
    total: number;
    score: number;
}>;
export interface ModelKnowledgeEntry {
    id: string;
    strengths: string[];
    weaknesses: string[];
    bestFor: ShotPurpose[];
    tools: ToolCapability;
    cost: {
        perSecond: Record<string, number>;
        tier: KnowledgeTier;
    };
    ranks: {
        consistency: number;
        motion: number;
        camera: number;
        audio: number;
        quality: number;
    };
    maxDuration: number;
    nativeAudio: boolean;
    videoRefCapable: boolean;
    liveModes: Mode[];
    liveFields: Partial<Record<Mode, string[]>>;
    /** Set when a live OpenAPI fetch replaced the seed field list. Absent means cache miss. */
    liveFetchedAt?: string;
    liveLimits: {
        maxPromptChars: number;
    };
    learned: LearnedByPurpose;
    embedding: number[];
    /** Verified /lora inference ids. Empty on council models — LoRA ids are not auto-pooled. */
    loraCapable: boolean;
    loraEndpoints: string[];
}
export interface ModelNeed {
    purpose: ShotPurpose;
    needs: {
        mode: Mode;
        consistency?: number;
        camera?: number;
        audio?: boolean;
        continuity?: boolean;
    };
    constraint: {
        tier: QualityConstraint;
        budgetCents?: number;
    };
}
export interface ModelCandidate {
    model: string;
    mode: Mode;
    fitScore: number;
    reason: string;
    costEstimate: number;
}
export declare function listModelKnowledge(): ModelKnowledgeEntry[];
export declare function getModelKnowledge(id: string): ModelKnowledgeEntry | undefined;
/** Index or replace an entry. A new model becomes retrievable with no other code change. */
export declare function indexModelKnowledge(entry: ModelKnowledgeEntry): void;
export declare function recordLearnedOutcome(id: string, purpose: ShotPurpose, worked: boolean): ModelKnowledgeEntry | undefined;
export declare function applyLearnedSignal(id: string, purpose: ShotPurpose, signal: number, source?: OutcomeSource): ModelKnowledgeEntry | undefined;
export declare function loadLearnedLayer(overlay: Record<string, Partial<LearnedByPurpose>>): void;
export declare function refreshLiveCapability(id: string, fetchImpl?: typeof fetch): Promise<ModelKnowledgeEntry | undefined>;
export declare function queryModelRAG(need: ModelNeed, pool?: readonly string[], overlay?: Record<string, Partial<LearnedByPurpose>>, taste?: TasteProfile): ModelCandidate[];

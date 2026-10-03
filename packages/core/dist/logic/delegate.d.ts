import type { Mode } from '../types/provider';
import { type QualityConstraint, type LearnedByPurpose } from './modelKnowledge';
import { type ShotPurpose } from './premiseLock';
import type { TasteProfile } from './ratings';
import { type Playbook } from './playbook';
import { type LoraAssetRef } from './trainedAsset';
export type { QualityConstraint, ShotPurpose };
export interface DelegateShot {
    id?: string;
    visualPrompt?: string;
    prompt?: string;
    duration?: number;
    purpose?: string;
    contentType?: string;
    hasDialogue?: boolean;
    needsDialogue?: boolean;
    cameraPrecision?: boolean;
    cameraMove?: string;
    cameraNeed?: number;
    consistencyNeed?: number;
    characterIds?: string[];
    charactersPresent?: string[];
    locationId?: string | null;
    anchorFrameUrl?: string | null;
    storyboardUrl?: string | null;
    endFrameUrl?: string | null;
    continueExactFrame?: boolean;
    sourceVideoUrl?: string | null;
    chainFrom?: string | null;
    modelOverride?: string | null;
    characterLora?: LoraAssetRef | null;
    styleLora?: LoraAssetRef | null;
    suggestedModel?: string;
    budget?: number;
    moneyShot?: boolean;
    sceneNumber?: number;
    shotIndex?: number;
}
export interface DelegateProject {
    qualityTier: QualityConstraint;
    budgetCents?: number;
    taste?: TasteProfile;
    playbook?: Playbook | null;
}
export interface DelegateResult {
    model: string;
    mode: Mode;
    reason: string;
    costEstimate: number;
    purpose: ShotPurpose;
}
/** Indexed models the auto path may pick. HappyHorse stays out until one clean generation. */
export declare function autoDelegatePool(requested?: readonly string[]): string[];
export declare function bumpQualityTier(tier: QualityConstraint, moneyShot?: boolean): QualityConstraint;
export declare function assertDelegatedIntegrity(chosen: {
    model: string;
    mode: Mode;
}): void;
export declare function delegate(shot: DelegateShot, project: DelegateProject, pool?: readonly string[], learned?: Record<string, Partial<LearnedByPurpose>>): Promise<DelegateResult>;

import { type ShotPurpose } from './premiseLock';
import type { QualityConstraint } from './modelKnowledge';
import type { TasteProfile } from './ratings';
export declare const PLAYBOOK_CLASSIFY_SOURCE = "playbook.classify";
export type PlaybookGrade = 'warm' | 'cool' | 'neutral' | 'high-contrast' | 'bleach' | string;
export type PlaybookQualityTier = 'draft' | 'studio' | 'blockbuster';
export interface PlaybookStyle {
    aspectRatio?: string;
    grade?: PlaybookGrade;
    genrePreset?: string;
    grain?: string;
    lut?: string;
}
export interface PlaybookGeneration {
    defaultQualityTier?: PlaybookQualityTier;
    modelPreferences?: Partial<Record<ShotPurpose, string>>;
    maxShotDuration?: number;
    defaultDuration?: number;
}
export interface PlaybookLanguage {
    narrationLanguage?: string;
    voiceDefaults?: string;
}
export interface Playbook {
    id: string;
    userId: string;
    projectId?: string | null;
    name: string;
    style?: PlaybookStyle;
    generation?: PlaybookGeneration;
    language?: PlaybookLanguage;
    rules?: string[];
    classifiedRules?: ClassifiedRule[];
}
export type RuleKind = 'hard' | 'soft';
export type RuleAction = {
    type: 'max_duration';
    seconds: number;
} | {
    type: 'no_onscreen_text';
} | {
    type: 'no_dialogue_establishing';
} | {
    type: 'max_chain';
    shots: number;
} | {
    type: 'end_scene_wide';
} | {
    type: 'prompt_inject';
    fragment: string;
} | {
    type: 'rejected';
    reason: string;
};
export interface ClassifiedRule {
    text: string;
    kind: RuleKind;
    action: RuleAction;
}
export interface PlaybookSuggestion {
    text: string;
    reason: string;
    patch: Partial<Pick<Playbook, 'style' | 'generation' | 'language' | 'rules'>>;
}
export declare function isUnsafePlaybookRule(text: string): boolean;
export declare function stripUnsafeRules(rules: string[]): {
    kept: string[];
    rejected: string[];
};
export declare function parsePlaybook(raw: unknown): Playbook | null;
/** Project playbook overlays the user-global default. Explicit empty objects stay empty. */
export declare function mergePlaybooks(global: Playbook | null, project: Playbook | null): Playbook | null;
export declare function classifyRule(text: string): ClassifiedRule;
export declare function classifyRules(rules: string[]): ClassifiedRule[];
export declare function effectiveRules(playbook: Playbook | null | undefined): ClassifiedRule[];
export interface PlaybookShot {
    visualPrompt?: string;
    duration?: number;
    contentType?: string;
    hasDialogue?: boolean;
    hasAudio?: boolean;
    shotSize?: string;
    cameraMove?: string;
    lighting?: string;
    sceneNumber?: number;
    shotIndex?: number;
    continuityGroup?: number;
    genrePresetId?: string | null;
    aspectRatio?: string;
    playbookFragment?: string;
}
export declare function applyPlaybookToShots<T extends PlaybookShot>(shots: T[], playbook: Playbook | null | undefined): Array<T & PlaybookShot>;
export declare function playbookToQualityConstraint(tier?: PlaybookQualityTier | string): QualityConstraint | undefined;
/** Explicit run/shot value wins. Playbook fills when the explicit value is absent. */
export declare function resolveWithPlaybook<T>(explicit: T | null | undefined, playbookValue: T | null | undefined, system: T): T;
export declare function biasCandidates<T extends {
    model: string;
    fitScore: number;
}>(candidates: T[], purpose: ShotPurpose, playbook: Playbook | null | undefined, suggestedModel?: string | null): T[];
export declare function suggestPlaybookAdditions(taste: TasteProfile): PlaybookSuggestion[];
export declare function parseClassifiedRuleJson(raw: unknown, fallbackType: ShotPurpose | string): ClassifiedRule;

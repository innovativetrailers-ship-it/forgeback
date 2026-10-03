export interface PremiseElement {
    id: string;
    name: string;
    description: string;
}
/** Immutable who / what / where. Later stages may change how the film is told. */
export interface PremiseLock {
    characters: PremiseElement[];
    settings: PremiseElement[];
    story: string;
    genre: string;
    tone: string;
}
export declare const SHOT_PURPOSES: readonly ["hero", "fill", "camera", "consistency", "continuity", "dialogue", "motion", "draft", "stylized"];
export type ShotPurpose = (typeof SHOT_PURPOSES)[number];
export interface PremiseShot {
    visualPrompt?: string;
    premiseElementIds?: string[];
    purpose?: string;
    contentType?: string;
    shotIndex: number;
    sceneNumber?: number;
    startsAtHardCut?: boolean;
    charactersPresent?: string[];
    locationsPresent?: string[];
}
export declare function premiseElements(lock: PremiseLock): PremiseElement[];
export declare function formatPremise(lock: PremiseLock): string;
export declare function parsePremiseLock(raw: unknown): PremiseLock | null;
/** Structural fidelity. A shot with no premise element, or a prompt that never features that element, is drift. */
export declare function groundingCheck(shot: {
    visualPrompt?: string;
    premiseElementIds?: string[];
}, premise: PremiseLock): {
    grounded: boolean;
    reason?: string;
};
export declare function cutUngrounded<T extends {
    visualPrompt?: string;
    premiseElementIds?: string[];
}>(shots: T[], premise: PremiseLock): T[];
/** Treatment may change mood and camera. It may not drop a premise name the shot already used. */
export declare function enrichmentKeepsPremise(before: string, after: string, premise: PremiseLock): boolean;
export declare function purposeForContent(contentType: string, continues?: boolean): ShotPurpose;
export declare function deriveShotPurpose(shot: {
    purpose?: string;
    contentType?: string;
    chainFrom?: string | null;
    hasDialogue?: boolean;
    cameraPrecision?: boolean;
    cameraMove?: string;
    charactersPresent?: string[];
    sceneNumber?: number;
    prevSceneNumber?: number;
    prevCharacters?: string[];
}): ShotPurpose;
export declare function isShotPurpose(value: string): value is ShotPurpose;
export declare function applyShotSpec<T extends PremiseShot>(shots: T[], premise: PremiseLock): Array<T & {
    purpose: ShotPurpose;
    chainFrom: string | null;
    continuity: 'continuous' | 'cut';
    premiseElementIds: string[];
}>;

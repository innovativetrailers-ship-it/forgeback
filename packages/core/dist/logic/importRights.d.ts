import { type DatasetMedia, type TrainerDef } from './trainerRegistry';
export declare const IMPORT_DOMAINS: readonly ["movie", "tv", "anime", "documentary", "sport", "racing"];
export type ImportDomain = (typeof IMPORT_DOMAINS)[number];
export declare const COPYRIGHT_CONSENT_DOMAINS: readonly ImportDomain[];
/** User content is never used to train platform models. */
export declare const PLATFORM_TRAINS_ON_USER_CONTENT = false;
export interface ImportPrep {
    domain: ImportDomain;
    captionGuidance: string;
    trainerKey: string;
    trainer: TrainerDef;
    isolateSubject: boolean;
    requiresOwnedOrLicensed: boolean;
    requiresSubjectConsent: boolean;
    rightsNotice: string;
}
export declare function isImportDomain(value: string): value is ImportDomain;
export declare function importPrep(input: {
    domain: ImportDomain;
    kinds?: DatasetMedia[];
    tab?: string;
}): ImportPrep;
export declare function domainFromSubcategory(subcategory?: string): ImportDomain | null;
export declare class TrainingConsentError extends Error {
    constructor(message: string);
}
export declare function assertTrainingConsent(input: {
    tab?: string;
    subcategory?: string;
    importDomain?: string;
    ownedOrLicensed?: boolean;
    subjectConsent?: boolean;
    footageIncludesCopyrightedTitles?: boolean;
}): void;
export declare function cameraPatchFromPreset(defaults: {
    angle?: string;
    movement?: string;
    shotSize?: string;
    lens?: string;
    speed?: string;
}, current: {
    cameraAngle?: string | null;
    cameraMove?: string | null;
    shotSize?: string | null;
    lensFeel?: string | null;
    cameraSpeed?: string | null;
}): {
    cameraAngle?: string;
    cameraMove?: string;
    shotSize?: string;
    lensFeel?: string;
    cameraSpeed?: string;
};

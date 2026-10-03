import { type DatasetMedia, type TrainerDef } from './trainerRegistry';
export declare const STUDIO_TABS: readonly ["cast", "styles", "assets", "voices", "music"];
export type StudioTab = (typeof STUDIO_TABS)[number];
export interface StudioSubcategory {
    id: string;
    label: string;
}
export declare const STUDIO_SUBCATEGORIES: Record<StudioTab, StudioSubcategory[]>;
export declare function isStudioTab(value: string): value is StudioTab;
export declare function assetTypeForTab(tab: StudioTab): 'character' | 'style' | 'audio_style';
export declare function defaultSubcategory(tab: StudioTab): string;
/**
 * Orchestrator handoff: the sidebar collects tab + subcategory + media.
 * This picks the verified trainer. The UI does not choose a raw FAL id.
 */
export declare function recommendTrainer(input: {
    tab: StudioTab;
    subcategory?: string;
    kinds?: DatasetMedia[];
}): {
    trainerKey: string;
    trainer: TrainerDef;
};

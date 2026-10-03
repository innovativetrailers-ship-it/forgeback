import type { DatasetMedia, TrainerDef } from './trainerRegistry';
export interface TrainingMediaFile {
    name: string;
    kind: DatasetMedia;
    caption?: string;
}
export declare function trainingCostUsd(trainer: TrainerDef, steps: number): number;
export declare function trainerStepsField(trainer: TrainerDef): 'number_of_steps' | 'steps';
export declare function validateTrainingSet(trainer: TrainerDef, files: TrainingMediaFile[], triggerPhrase?: string): string[];
export declare function captionForFile(file: TrainingMediaFile, triggerPhrase?: string): string;
export declare function zipEntryName(file: TrainingMediaFile, index: number): {
    media: string;
    caption: string;
};
export declare function buildTrainerInput(trainer: TrainerDef, dataUrl: string, opts: {
    triggerPhrase?: string;
    steps: number;
}): Record<string, unknown>;
export declare function costsMatch(expected: number, confirmed: number, epsilon?: number): boolean;

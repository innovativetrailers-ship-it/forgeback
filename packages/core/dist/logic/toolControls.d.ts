import type { FamilyFieldMap, ModelControlSurface } from '../types/provider';
import { type ToolExposureRow } from './toolMatrix';
export type VoicePath = 'none' | 'audio_tag';
export interface ExposedControls {
    model: string;
    cameraPrompt: boolean;
    reference: boolean;
    referenceField?: string;
    firstFrame: boolean;
    firstFrameField?: string;
    lastFrame: boolean;
    lastFrameField?: string;
    seed: boolean;
    seedField?: string;
    negative: boolean;
    negativeField?: string;
    audioToggle: boolean;
    voice: VoicePath;
    nativeAudioLockedOn: boolean;
}
export declare function exposureRow(modelId: string): ToolExposureRow | undefined;
export declare function exposedControls(modelId: string, fields?: FamilyFieldMap, control?: ModelControlSurface): ExposedControls;

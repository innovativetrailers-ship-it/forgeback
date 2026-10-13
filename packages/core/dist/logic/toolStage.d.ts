import type { ModelControlSurface } from '../types/provider';
/** Panels the direction card may open. A panel is included only when the live control surface has that capability. */
export type ToolPanel = 'prompt' | 'camera_prompt' | 'camera_motion_brush' | 'camera_path' | 'camera_presets' | 'reference_images' | 'first_last_frame' | 'first_frame' | 'audio_native' | 'duration_resolution';
export declare const IDENTITY_REFERENCE_MODEL = "seedance-2.0";
export declare function toolPanelsFor(control: ModelControlSurface, silentOnly: boolean): ToolPanel[];
export interface ToolCharacterRef {
    id: string;
    name: string;
    referenceUrls: string[];
    voiceId?: string | null;
}
export declare function linkedVoices(characters: ToolCharacterRef[]): Array<{
    name: string;
    voiceId: string;
}>;
export interface ToolLocationRef {
    label: string;
    imageUrl: string;
}
export interface PanelPreloads {
    panels: ToolPanel[];
    referenceSlots: Array<{
        label: string;
        url: string;
    }>;
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    /** Character refs are attached, and this model cannot keep identity across a new scene. */
    identityNeedsTrueReference: boolean;
}
export declare function buildPanelPreloads(control: ModelControlSurface, silentOnly: boolean, input: {
    characters: ToolCharacterRef[];
    location?: ToolLocationRef | null;
    anchorFrameUrl?: string | null;
    endFrameUrl?: string | null;
    /** Schema-confirmed reference. When false, reference slots stay empty. */
    referenceCapable?: boolean;
}): PanelPreloads;

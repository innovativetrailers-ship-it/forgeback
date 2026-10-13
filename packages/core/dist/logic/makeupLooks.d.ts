export declare const LOOK_CATEGORIES: readonly ["age", "creature", "injury", "prosthetic", "beauty", "fx"];
export type LookCategory = (typeof LOOK_CATEGORIES)[number];
export declare const LOOK_CATEGORY_LABEL: Record<LookCategory, string>;
export type LookRegion = 'face' | 'skin' | 'eyes' | 'hair' | 'hands' | 'body';
export type LookContinuity = 'persistent' | 'progressive' | 'one-shot';
export type LookSafety = 'normal' | 'graphic' | 'real-person-restricted';
export type LookMethod = 'bake' | 'video' | 'procedural';
export type LookStatus = 'live' | 'needs-model';
export interface MakeupLook {
    id: string;
    category: LookCategory;
    name: string;
    intensity: number;
    regions: LookRegion[];
    colour: string;
    ageDelta: number;
    severity: number;
    coverage: number;
    prompt: string;
    negative: string;
    continuity: LookContinuity;
    safety: LookSafety;
    methods: {
        bake: LookStatus;
        video: LookStatus;
        procedural: LookStatus;
    };
}
export interface LookLayer {
    lookId: string;
    intensity: number;
    opacity: number;
    hidden?: boolean;
}
export declare const MAKEUP_LOOKS: MakeupLook[];
export declare function looksIn(category: LookCategory): MakeupLook[];
export declare function makeupLook(id: string): MakeupLook | undefined;
export declare function lookConflict(activeIds: string[], shotIds: string[]): string | null;

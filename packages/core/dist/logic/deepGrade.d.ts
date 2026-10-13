/** Additive colourist fields. The same fragment is the preview and the export. */
export interface RgbWheel {
    r: number;
    g: number;
    b: number;
}
export interface DeepGrade {
    offset?: RgbWheel;
    log?: {
        shadow: RgbWheel;
        mid: RgbWheel;
        high: RgbWheel;
    };
    hdr?: {
        shadow: RgbWheel;
        mid: RgbWheel;
        high: RgbWheel;
    };
    hueVsHue?: number;
    hueVsSat?: number;
    hueVsLum?: number;
    lumVsSat?: number;
    satVsSat?: number;
    nodes?: Array<{
        id: string;
        mode: 'serial' | 'parallel' | 'layer' | 'mixer';
    }>;
    colourSpace?: {
        input: 'rec709' | 'acescg' | 'rec2020';
        output: 'rec709' | 'pq' | 'hlg';
    };
    /** A grade script name. Forge does not execute it. */
    dctlName?: string;
}
/** Leading-comma FFmpeg fragment. A DCTL name never becomes code. */
export declare function deepGradeFragment(grade: DeepGrade | null | undefined): string;
/** CSS preview of the same numbers. Desktop-only fields that CSS cannot key stay in the fragment. */
export declare function deepGradeCss(grade: DeepGrade | null | undefined): string;
export declare function gradeHasDesktopDepth(grade: DeepGrade | null | undefined): boolean;

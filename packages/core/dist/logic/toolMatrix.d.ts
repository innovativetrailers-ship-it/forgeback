/**
 * Tool exposure for MP-12. A control may be shown only where status is 'schema'.
 * Seedance 2.0 and Kling 3.0 cells were read from the OpenAPI inputs for those families.
 * Every other family stays 'unverified' until its own prompt fetches the schema.
 * Native audio is on the Seedance schema and is not exposed: live submit forces
 * generate_audio false. No new control is mounted from this table.
 */
export type ToolCell = 'schema' | 'absent' | 'unverified';
export interface ToolExposureRow {
    model: string;
    wired: boolean;
    camera: ToolCell;
    reference: ToolCell;
    firstLast: ToolCell;
    nativeAudio: ToolCell;
    exposeNativeAudio: boolean;
    voice: ToolCell;
    seed: ToolCell;
    negative: ToolCell;
    /** Video file reference. Schema-confirmed for Wan 3.0, Seedance 2.0, and Gemini Omni. */
    videoReference?: ToolCell;
    note?: string;
}
export declare const TOOL_EXPOSURE: ToolExposureRow[];
